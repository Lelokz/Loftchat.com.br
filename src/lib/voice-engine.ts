/**
 * Motor de voz: microfone, conexões P2P e o áudio que toca.
 *
 * TRÊS DECISÕES QUE VALEM O ARQUIVO INTEIRO:
 *
 * 1. OS <audio> FICAM EM document.body, FORA DA ÁRVORE DE COMPONENTES.
 *    O `app.ts` reconstrói a sala inteira a cada mudança de estado; um <audio>
 *    dentro dela seria destruído e recriado, cortando o som a cada pessoa que
 *    entra ou sai. Reprodução de áudio não é assunto de view.
 *
 * 2. AS CONEXÕES SÃO RECONCILIADAS A PARTIR DO ROSTER, não disparadas por
 *    evento. `syncPeers` compara quem está na sala com quem já tem conexão e
 *    resolve a diferença. Entrar no meio de uma chamada, sair, e o fantasma
 *    expirando pelos 45s são todos o MESMO caminho — um caminho só, exercitado
 *    o tempo todo, em vez de um caso raro que só quebra em produção.
 *
 * 3. FALAR NÃO PASSA PELO ESTADO. O analisador roda a cada quadro; se isso
 *    virasse `patch()`, a sala re-renderizaria dezenas de vezes por segundo. O
 *    motor emite só a TRANSIÇÃO (começou/parou), e quem ouve mexe na classe do
 *    bloco direto.
 */

import {
  appendCandidate,
  clearMySignals,
  clearPairSignals,
  iAmOfferer,
  subscribeIncomingSignals,
  writeDescription,
} from './voice-signaling';
import type { SignalDoc } from './voice-signaling';
import { isPermissionDenied } from './firestore-errors';
import { ICE_SERVERS, iceErrorMeaning } from './ice-servers';
import { loadVoiceSettings, micConstraints, onVoiceSettings, outputChoiceSupported, sameMic } from './voice-settings';

/**
 * Teto de banda de vídeo para par que fechou por RELAY.
 *
 * Vale no lugar da fatia do orçamento, e é muito menor de propósito: o tráfego
 * atravessa um servidor gratuito e compartilhado de terceiro, e empurrar
 * 1080p60 por ele congestiona. O primeiro sintoma de congestionamento não é o
 * vídeo travando — é A VOZ engasgando, porque os dois disputam o mesmo cano.
 *
 * Com `degradationPreference: 'maintain-framerate'`, apertar o bitrate derruba a
 * RESOLUÇÃO e mantém o movimento suave. Para jogo é a troca certa.
 */
export const RELAY_MAX_BITRATE = 1_500_000; // bits/s por par em relay

/**
 * Qualidade pedida ao capturar a tela.
 *
 * Tudo em `ideal` de propósito: é PEDIDO, não exigência. Máquina que não dá
 * conta de 1080p60 entrega o que der, em vez de o `getDisplayMedia` falhar e a
 * pessoa ficar sem transmitir nenhuma. Alvo alto porque o uso real é jogo.
 */
export const SCREEN_QUALITY: MediaTrackConstraints = {
  width: { ideal: 1920 },
  height: { ideal: 1080 },
  frameRate: { ideal: 60 },
};

/**
 * Orçamento TOTAL de upload de vídeo, dividido entre os pares.
 *
 * Numa malha, transmitir para 3 pessoas é enviar TRÊS CÓPIAS do vídeo. Um teto
 * por conexão faz o upload crescer junto com a sala; um orçamento total dividido
 * mantém o pico no mesmo lugar com 1 ou com 3 pares — sozinho com um amigo você
 * fica com tudo, e a sala cheia aperta a imagem em vez de entupir o cano.
 *
 * E o primeiro sintoma de upload entupido NÃO é o vídeo travando: é A VOZ
 * ficando ruim, porque áudio e vídeo disputam o mesmo cano. Parece bug de áudio
 * e não é — foi por isso que este teto existe desde a etapa 7.
 *
 * Ajuste este número depois de olhar "vídeo saindo, somando todos os pares" no
 * painel durante um jogo de verdade.
 */
export const SCREEN_UPLOAD_BUDGET = 8_000_000; // bits/s somando todos os pares

/*
 * CÂMERA (0.9.5). Um quarto canal em cada conexão, reservado desde o começo
 * como o da tela — ligar e desligar é `replaceTrack`, sem renegociar.
 *
 * Qualidade: 720p30 PEDIDO (`ideal`, a câmera entrega o que tiver). O que
 * sai para cada par se ajusta sozinho pelo tamanho da sala: um orçamento
 * total dividido (mesma lógica da tela, ver acima) com teto por par, e a
 * resolução encolhe quando a sala enche. Relay aperta mais.
 */
export const CAMERA_QUALITY: MediaTrackConstraints = {
  width: { ideal: 1280 },
  height: { ideal: 720 },
  frameRate: { ideal: 30, max: 30 },
};
export const CAMERA_UPLOAD_BUDGET = 3_000_000; // bits/s somando todos os pares
export const CAMERA_MAX_PER_PEER = 1_200_000;
export const CAMERA_RELAY_BITRATE = 500_000;
/** Câmeras ligadas ao mesmo tempo numa sala (malha: cada uma vai para cada pessoa). */
export const MAX_CAMERAS = 8;

/** Bits/s e redução de resolução da câmera para um par, pelo tamanho da sala. */
export function qualidadeDaCamera(pares: number, viaRelay: boolean): { bitrate: number; reduzir: number } {
  const n = Math.max(1, pares);
  const bitrate = viaRelay ? CAMERA_RELAY_BITRATE : Math.min(CAMERA_MAX_PER_PEER, Math.floor(CAMERA_UPLOAD_BUDGET / n));
  // 720p com até 2 pessoas, 480p até 4, 360p acima disso.
  const reduzir = viaRelay || n >= 5 ? 2 : n >= 3 ? 1.5 : 1;
  return { bitrate, reduzir };
}

/* -------------------------------------------------------------------------- */
/* Detecção de fala                                                            */
/* -------------------------------------------------------------------------- */

/** Acima disto começa a falar; abaixo do outro, para. A folga evita piscar. */
const SPEAK_ON = 0.045;
const SPEAK_OFF = 0.03;
/** Silêncio precisa durar isto para apagar o anel — senão pausas viram piscada. */
const SILENCE_HOLD_MS = 400;

interface Watcher {
  analyser: AnalyserNode;
  // `Float32Array<ArrayBuffer>` e não o genérico: getFloatTimeDomainData recusa
  // um array que possa estar sobre SharedArrayBuffer.
  buffer: Float32Array<ArrayBuffer>;
  speaking: boolean;
  quietSince: number;
}

/* -------------------------------------------------------------------------- */

export interface PeerDiagnostic {
  uid: string;
  connectionState: RTCPeerConnectionState;
  iceConnectionState: RTCIceConnectionState;
  /** host, srflx ou relay — o tipo do candidato que venceu. */
  candidateType: string | null;
  failed: boolean;
  /** Vídeo chegando desta pessoa. */
  inboundVideo: VideoStats | null;
  /** Vídeo saindo para esta pessoa. */
  outboundVideo: VideoStats | null;
  /**
   * A direção do transceiver de vídeo — a PEDIDA e a EFETIVA.
   *
   * `current` é `null` até a primeira negociação fechar. Se ela ficar em
   * `recvonly` ou `inactive` com `desired` em `sendrecv`, a tela não sai por
   * este par por mais que `replaceTrack` diga que deu certo — e é exatamente
   * esse par de valores que esta etapa foi medir.
   */
  videoDirection: {
    desired: RTCRtpTransceiverDirection;
    current: RTCRtpTransceiverDirection | null;
  };
  /** Descrições jogadas fora: `stale` é defeito, `glare` é o desenho. */
  ignored: { stale: number; glare: number };
  /** Este par está passando por TURN? É o que consome o plano gratuito. */
  viaRelay: boolean;
  /** Bytes relayados neste par — aproximado, ver `accumulateRelayBytes`. */
  relayBytes: number;
  /** Teto de banda de vídeo valendo agora, em bits/s. */
  bitrateCap: number;
  /** Erros de ICE já traduzidos — vazio quando não houve nenhum. */
  iceErrors: string[];
  /**
   * O mapa dos transceivers desta conexão: índice, tipo, `mid`, direção pedida,
   * direção efetiva e se há faixa.
   *
   * Linha densa e sem tradução, de propósito. Foi ela — e só ela — que mostrou
   * o defeito da etapa 9: quem respondia tinha SEIS transceivers, três soltos
   * (`mid=-`, um deles com o microfone dentro) e três implícitos `recvonly`.
   * Nenhum outro número do painel contava isso. É a primeira linha a olhar
   * quando a negociação voltar a dar problema.
   */
  transceiverMap: string;
}

export interface VoiceEngineCallbacks {
  /** Só a transição, nunca por quadro. */
  onSpeaking: (uid: string, speaking: boolean) => void;
  /** Alguma conexão mudou de estado — inclusive para `failed`. */
  onPeersChanged: () => void;
  /** O navegador recusou tocar o áudio sozinho. */
  onAudioBlocked: () => void;
  /** A transmissão parou pelo botão NATIVO do navegador. */
  onScreenShareEnded: () => void;
  /** 0.9.5: a câmera parou sozinha (desconectada, outro programa pegou). */
  onCameraEnded?: () => void;
}

/** Uma faixa de áudio que vai junto da tela, e como desligar a origem dela. */
export interface ScreenAudioExtra {
  track: MediaStreamTrack;
  stop(): void;
}

/**
 * Outra origem para a tela, no lugar do getDisplayMedia: o app Android
 * captura a tela do celular pelo próprio Android (ver lib/android-tela.ts).
 * `parar` é chamado quando a transmissão para, por qualquer caminho.
 */
export interface FonteDeTela {
  stream: MediaStream;
  surface: string;
  label: string;
  parar(): void;
}

export interface ScreenCapture {
  /** 'monitor', 'window' ou 'browser'. */
  surface: string;
  label: string;
  stream: MediaStream;
  hasAudio: boolean;
}

/** Vídeo que está entrando ou saindo, do getStats(). */
export interface VideoStats {
  width: number;
  height: number;
  fps: number;
  kbps: number;
  framesDropped: number;
  /** Só de quem envia: 'cpu' ou 'bandwidth'. É o que responde "por que travou". */
  limitation: string | null;
}

export interface VoiceEngine {
  /** Reconcilia as conexões com quem está na sala. */
  syncPeers(uids: string[]): void;
  setMuted(muted: boolean): void;
  /** Tenta tocar de novo, depois de um gesto da pessoa. */
  retryAudio(): Promise<void>;
  diagnostics(): Promise<PeerDiagnostic[]>;
  /** Uids cuja conexão terminou em `failed`. */
  failedPeers(): string[];
  /** Entrei sem microfone: ouço, mas não falo. */
  micDenied(): boolean;

  /**
   * Começa a transmitir. `null` = a pessoa fechou o seletor.
   *
   * `audioExtra` entra quando a captura veio SEM som (janela do Loft no Linux:
   * o som do PC chega por um microfone virtual). O motor desliga ele junto com
   * a transmissão.
   */
  startScreenShare(
    audioExtra?: () => Promise<ScreenAudioExtra | null>,
    fonte?: () => Promise<FonteDeTela | null>,
  ): Promise<ScreenCapture | null>;
  stopScreenShare(): Promise<void>;
  isSharing(): boolean;
  localScreen(): MediaStream | null;
  /** Uids de quem está mandando vídeo para mim agora. */
  peersWithVideo(): string[];
  /** O <video> daquela pessoa. Vive fora da árvore de componentes. */
  videoElementOf(uid: string): HTMLVideoElement | null;

  /**
   * Liga (ou troca) a câmera. `deviceId` = qual câmera ('' = a padrão);
   * `frente` vale no celular (true = a da frente). Erro sobe: quem chama diz
   * o motivo (permissão negada, câmera ocupada…).
   */
  startCamera(deviceId?: string, frente?: boolean): Promise<MediaStream>;
  stopCamera(): Promise<void>;
  /** Pausa sem desligar (app do celular foi para trás): para de mandar quadros. */
  setCameraPaused(paused: boolean): Promise<void>;
  localCamera(): MediaStream | null;
  /** O <video> da câmera daquela pessoa. Vive fora da árvore de componentes. */
  cameraElementOf(uid: string): HTMLVideoElement | null;

  destroy(): Promise<void>;
}

interface Peer {
  pc: RTCPeerConnection;
  audio: HTMLAudioElement;
  video: HTMLVideoElement;
  /** Microfone e som da tela juntos: os dois têm que tocar. */
  remoteAudio: MediaStream;
  remoteVideo: MediaStream;
  hasVideo: boolean;
  /**
   * Os dois canais reservados para a tela — `null` até existirem.
   *
   * Em quem OFERTA nascem junto com a conexão. Em quem RESPONDE só existem
   * depois de `adoptTransceivers`, porque quem responde não cria linha `m=`
   * nenhuma: ele adota as que vieram na oferta. Ver `createPeer`.
   */
  screenAudioSender: RTCRtpSender | null;
  screenVideoSender: RTCRtpSender | null;
  /**
   * O transceiver de vídeo inteiro, não só o sender.
   *
   * É dele que sai a `currentDirection` — a direção EFETIVA, a que foi de fato
   * negociada. A `direction` é só o que eu pedi, e as duas divergirem em
   * silêncio foi exatamente o defeito da etapa 9.
   */
  screenVideoTransceiver: RTCRtpTransceiver | null;
  /**
   * O canal da CÂMERA (0.9.5): a quarta linha. `null` até existir — e fica
   * `null` para sempre com quem ainda está numa versão sem câmera (a oferta
   * dela só tem três linhas).
   */
  camSender: RTCRtpSender | null;
  camTransceiver: RTCRtpTransceiver | null;
  /** A câmera que chega desta pessoa, num <video> próprio (fora da árvore). */
  camVideo: HTMLVideoElement;
  remoteCam: MediaStream;
  /**
   * O par vencedor é relay? Decide o teto de banda deste par.
   *
   * Só se sabe DEPOIS de a conexão fechar — o tipo de candidato não existe
   * antes disso. Por isso o teto é reavaliado quando o par chega a `connected`.
   */
  viaRelay: boolean;
  /**
   * Bytes que passaram por RELAY neste par, aproximado.
   *
   * Vem do par vencedor do `getStats`, acumulado só enquanto ele é relay. É
   * medição com margem, não estimativa: não conta o overhead do ICE e pode
   * subcontar se o par trocar no meio. O painel diz "aproximado" por isso.
   */
  relayBytes: number;
  /** Última leitura de bytes do par vencedor, para acumular por diferença. */
  lastPairBytes: number;
  /**
   * Erros de ICE deste par, já traduzidos.
   *
   * Sem isto, TURN quebrado e rede ruim terminam os dois em "não conectou" —
   * indistinguíveis. É o que separa "está quebrado do nosso lado" de "a rede
   * dessa pessoa não deixa".
   */
  iceErrors: string[];
  /** Candidatos que chegaram antes da descrição remota. */
  pending: RTCIceCandidateInit[];
  /** Candidatos meus gerados antes de o documento existir. */
  outbox: RTCIceCandidateInit[];
  descriptionWritten: boolean;
  remoteSet: boolean;
  /** Última descrição remota aplicada, para não reaplicar a mesma. */
  appliedNegotiation: number;
  /**
   * O SDP da última descrição remota aplicada.
   *
   * Serve para separar duas coisas que a trava do `negotiationId` trata igual:
   * a REENTREGA do mesmo documento — que o listener faz a cada candidato novo,
   * e é normal — e uma descrição DIFERENTE sendo rejeitada, que é defeito. Sem
   * essa distinção o contador de descartes subiria sozinho e não valeria nada.
   */
  appliedSdp: string;
  /**
   * Descrições que foram jogadas fora, por motivo.
   *
   * `stale`: a trava do contador rejeitou uma descrição diferente da última
   * aplicada. Isto NÃO deveria acontecer nunca — é o defeito que esta etapa
   * está medindo.
   *
   * `glare`: o impolite ignorou uma oferta que colidiu com a dele. Isto é o
   * desenho funcionando, e aparece separado justamente para não ser confundido
   * com o de cima.
   */
  ignored: { stale: number; glare: number };
  /** Tenho uma oferta minha em voo? Metade da detecção de colisão. */
  makingOffer: boolean;
  /**
   * A renegociação automática já pode disparar?
   *
   * `addTransceiver` marca "negotiation needed" na hora, nos DOIS lados. Sem
   * esta trava, o lado que só deveria responder também ofertava, e as duas
   * ofertas cruzadas embaralhavam as linhas `m=` — o sintoma foi o vídeo nunca
   * chegar, porque o `ontrack` de vídeo não disparava do outro lado.
   *
   * Só arma depois do aperto de mão inicial, que é o caminho já provado na
   * etapa 6.
   */
  negotiationArmed: boolean;
  /**
   * Houve necessidade de renegociar ANTES de estar armado?
   *
   * Serve para NÃO ofertar durante o aperto de mão. Ao armar, é descartado — a
   * descrição recém-enviada já capturou as faixas locais, e reenviar mandaria
   * uma segunda oferta em cima da primeira ainda em voo. Ver `arm`.
   */
  negotiationPending: boolean;
  negotiationId: number;
  applied: Set<string>;
  watcher: Watcher | null;
  /** Amostra anterior, para calcular bitrate por diferença. */
  lastVideoBytes: number;
  lastVideoAt: number;
  /**
   * Fila de sinais deste par.
   *
   * O listener dispara VÁRIAS vezes pelo mesmo documento — uma na descrição e
   * uma a cada candidato acrescentado. Sem serializar, duas entregas passariam
   * juntas pela guarda de "já apliquei a descrição remota", porque a guarda só
   * fecha depois do await, e a segunda chamaria setRemoteDescription num
   * RTCPeerConnection já estável. Era exatamente o erro que aparecia no console.
   */
  queue: Promise<void>;
}

export interface VoiceEngineOptions {
  channelId: string;
  groupId: string;
  myUid: string;
  callbacks: VoiceEngineCallbacks;
  onError: (error: unknown) => void;
}

export async function startVoiceEngine(options: VoiceEngineOptions): Promise<VoiceEngine> {
  const { channelId, groupId, myUid, callbacks, onError } = options;

  /*
   * A limpeza da sinalização velha NÃO acontece aqui — ela roda no store, ANTES
   * de a presença ser anunciada. Ver o comentário em `enterVoice`: limpar depois
   * de existir para os outros apaga ofertas recém-chegadas.
   */

  let localStream: MediaStream | null = null;
  /** A captura de tela em andamento, ou null. Fonte da verdade do "estou transmitindo". */
  let screenStream: MediaStream | null = null;
  let stopScreenAudioExtra: (() => void) | null = null;
  /** A origem da tela quando não é o getDisplayMedia (app Android). */
  let pararFonte: (() => void) | null = null;
  /** A câmera ligada, ou null. Fonte da verdade do "minha câmera está ligada". */
  let cameraStream: MediaStream | null = null;
  let cameraPausada = false;
  /** O último pedido de câmera, para pedir de novo ao voltar de uma pausa. */
  let pedidoDaCamera: MediaTrackConstraints = { ...CAMERA_QUALITY };
  let denied = false;
  // Etapa 8c: o microfone, a saída e os filtros escolhidos em Voz e áudio.
  let ajustes = loadVoiceSettings();
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: micConstraints(ajustes) });
  } catch (error) {
    // Sem microfone a sala NÃO fica ambígua: entro em modo só-recepção, ouço
    // todo mundo, e a tela diz isso com todas as letras.
    console.error('Sem acesso ao microfone.', error);
    denied = true;
  }

  // Um contêiner escondido no body: os elementos precisam sobreviver a qualquer
  // re-render da sala. Ver a decisão 1 no topo.
  const audioHost = document.createElement('div');
  audioHost.id = 'voice-audio';
  audioHost.hidden = true;
  document.body.append(audioHost);

  /*
   * Os <video> também moram fora da árvore de componentes, pelo mesmo motivo dos
   * <audio>: a sala é reconstruída a cada mudança de estado, e um <video> criado
   * dentro dela reiniciaria a imagem toda vez que alguém entrasse, saísse ou
   * apertasse mudo. O `app.ts` MOVE estes elementos para o palco.
   *
   * Este contêiner NÃO é `hidden`: um elemento escondido pode ter a decodificação
   * suspensa pelo navegador. Ele fica fora de vista por posicionamento.
   */
  const videoHost = document.createElement('div');
  videoHost.id = 'voice-video';
  videoHost.className = 'voice-video-host';
  document.body.append(videoHost);

  const audioContext = new AudioContext();
  const peers = new Map<string, Peer>();
  const failed = new Set<string>();
  let muted = false;
  let blockedReported = false;
  let destroyed = false;

  /* --- detecção de fala ---------------------------------------------------- */

  const watchers = new Map<string, Watcher>();

  function watch(uid: string, stream: MediaStream): Watcher {
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    const watcher: Watcher = {
      analyser,
      buffer: new Float32Array(new ArrayBuffer(analyser.fftSize * 4)),
      speaking: false,
      quietSince: 0,
    };
    watchers.set(uid, watcher);
    return watcher;
  }

  function tick(): void {
    if (destroyed) return;
    const now = performance.now();

    for (const [uid, watcher] of watchers) {
      watcher.analyser.getFloatTimeDomainData(watcher.buffer);
      let sum = 0;
      for (const sample of watcher.buffer) sum += sample * sample;
      const level = Math.sqrt(sum / watcher.buffer.length);

      if (!watcher.speaking && level > SPEAK_ON) {
        watcher.speaking = true;
        callbacks.onSpeaking(uid, true);
      } else if (watcher.speaking) {
        if (level > SPEAK_OFF) watcher.quietSince = 0;
        else {
          if (watcher.quietSince === 0) watcher.quietSince = now;
          else if (now - watcher.quietSince > SILENCE_HOLD_MS) {
            watcher.speaking = false;
            watcher.quietSince = 0;
            callbacks.onSpeaking(uid, false);
          }
        }
      }
    }

    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  if (localStream !== null) watch(myUid, localStream);

  /* --- Voz e áudio (etapa 8c), com a chamada aberta ------------------------ */

  /** Toca na saída escolhida (`''` = a padrão do sistema). */
  function aplicarSaida(audio: HTMLAudioElement): void {
    if (!outputChoiceSupported()) return;
    const el = audio as HTMLAudioElement & { setSinkId: (id: string) => Promise<void> };
    void el.setSinkId(ajustes.speakerId).catch((error: unknown) => {
      // Saída que sumiu (fone desplugado): segue na que estava.
      console.warn('[voz] não deu para trocar a saída de som.', error);
    });
  }

  /**
   * Troca o microfone SEM sair da sala: pede a faixa nova, põe no lugar da
   * velha em cada conexão (`replaceTrack` não renegocia) e só então para a
   * velha. O mudo continua valendo. Entrei sem microfone? Aí só na próxima
   * entrada — ligar um microfone que não existia exige renegociar a sala.
   */
  async function trocarMicrofone(): Promise<void> {
    if (localStream === null) return;
    const velha = localStream.getAudioTracks()[0] ?? null;
    let novo: MediaStream;
    try {
      novo = await navigator.mediaDevices.getUserMedia({ audio: micConstraints(ajustes) });
    } catch (error) {
      console.error('[voz] não deu para trocar o microfone.', error);
      return;
    }
    if (destroyed) {
      novo.getTracks().forEach((t) => t.stop());
      return;
    }
    const nova = novo.getAudioTracks()[0];
    if (nova === undefined) return;
    nova.enabled = !muted;
    for (const peer of peers.values()) {
      for (const sender of peer.pc.getSenders()) {
        if (sender.track !== null && sender.track === velha) await sender.replaceTrack(nova).catch(onError);
      }
    }
    velha?.stop();
    localStream = novo;
    watch(myUid, novo);
  }

  const pararAjustes = onVoiceSettings((v) => {
    const antes = ajustes;
    ajustes = v;
    if (antes.speakerId !== v.speakerId) for (const peer of peers.values()) aplicarSaida(peer.audio);
    if (!sameMic(antes, v)) void trocarMicrofone();
  });

  /* --- conexões ------------------------------------------------------------ */

  function createPeer(peerUid: string): Peer {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    /*
     * SÓ QUEM OFERTA CRIA AS LINHAS `m=`. Quem responde ADOTA as que chegarem.
     *
     * A etapa 7 pré-criava os três transceivers nos DOIS lados, apostando que o
     * `setRemoteDescription` de quem responde casaria os dele com as linhas da
     * oferta. Medido na etapa 9, o Chrome NÃO casa: ele ignora os pré-criados e
     * cria implícitos `recvonly` no lugar. O mapa medido de quem responde era
     *
     *     0:audio/mid=-/sendrecv   <- pré-criado COM O MICROFONE, solto
     *     1:audio/mid=-/sendrecv   <- solto
     *     2:video/mid=-/sendrecv   <- solto
     *     3:audio/mid=0/recvonly   <- implícito, este sim na sessão
     *     4:audio/mid=1/recvonly
     *     5:video/mid=2/recvonly
     *
     * Ou seja: quem responde não mandava NADA — nem tela, nem voz —, e o outro
     * lado ficava `sendonly`. Os transceivers soltos ainda pediam renegociação
     * que nunca saía. Não criar nada e adotar o que veio é o que o navegador de
     * fato faz; o resto era teoria.
     *
     * O microfone entra como `sendrecv` quando existe e `recvonly` quando foi
     * recusado — sem microfone eu ainda quero OUVIR.
     */
    const micTrack = localStream?.getAudioTracks()[0] ?? null;
    let screenAudioSender: RTCRtpSender | null = null;
    let screenVideoSender: RTCRtpSender | null = null;
    let screenVideoTransceiver: RTCRtpTransceiver | null = null;
    let camTransceiver: RTCRtpTransceiver | null = null;

    if (iAmOfferer(myUid, peerUid)) {
      pc.addTransceiver(micTrack ?? 'audio', {
        direction: micTrack === null ? 'recvonly' : 'sendrecv',
      });
      const screenAudio = pc.addTransceiver('audio', { direction: 'sendrecv' });
      const screenVideo = pc.addTransceiver('video', { direction: 'sendrecv' });
      screenAudioSender = screenAudio.sender;
      screenVideoSender = screenVideo.sender;
      screenVideoTransceiver = screenVideo;
      // 0.9.5: a câmera é a QUARTA linha, sempre depois das três de antes —
      // assim quem ainda está numa versão velha adota as três dele e ignora
      // esta (vira `recvonly` lá, e a câmera só não chega naquela pessoa).
      camTransceiver = pc.addTransceiver('video', { direction: 'sendrecv' });
    }

    const audio = document.createElement('audio');
    audio.autoplay = true;
    audio.dataset['uid'] = peerUid;
    audioHost.append(audio);
    aplicarSaida(audio);

    const video = document.createElement('video');
    video.autoplay = true;
    video.playsInline = true;
    // O vídeo remoto é MUDO: o som dele chega pelas faixas de áudio, no
    // <audio>. Sem isto o som da tela tocaria duas vezes.
    video.muted = true;
    video.dataset['uid'] = peerUid;
    videoHost.append(video);

    const camVideo = document.createElement('video');
    camVideo.autoplay = true;
    camVideo.playsInline = true;
    camVideo.muted = true;
    camVideo.dataset['uid'] = peerUid;
    camVideo.dataset['camera'] = '';
    videoHost.append(camVideo);

    const peer: Peer = {
      pc,
      audio,
      video,
      remoteAudio: new MediaStream(),
      remoteVideo: new MediaStream(),
      hasVideo: false,
      screenAudioSender,
      screenVideoSender,
      screenVideoTransceiver,
      camSender: camTransceiver?.sender ?? null,
      camTransceiver,
      camVideo,
      remoteCam: new MediaStream(),
      viaRelay: false,
      relayBytes: 0,
      lastPairBytes: 0,
      iceErrors: [],
      pending: [],
      outbox: [],
      descriptionWritten: false,
      remoteSet: false,
      appliedNegotiation: -1,
      appliedSdp: '',
      ignored: { stale: 0, glare: 0 },
      makingOffer: false,
      negotiationArmed: false,
      negotiationPending: false,
      negotiationId: 0,
      applied: new Set(),
      watcher: null,
      queue: Promise.resolve(),
      lastVideoBytes: 0,
      lastVideoAt: 0,
    };

    /*
     * Uma faixa por vez, e cada uma vai para o seu lugar.
     *
     * Áudio (microfone E som da tela) se acumula num MediaStream só, ligado ao
     * <audio>: os dois precisam tocar juntos. Vídeo vai para o <video>.
     */
    pc.ontrack = (event) => {
      const track = event.track;

      if (track.kind === 'video' && ehCamera(pc, event.transceiver)) {
        // A câmera: mesma ideia da tela logo abaixo (a faixa fica para sempre;
        // quem diz se a câmera está ligada é o roster, campo `camera`).
        peer.remoteCam.addTrack(track);
        peer.camVideo.srcObject = peer.remoteCam;
        void peer.camVideo.play().catch(() => {});
        callbacks.onPeersChanged();
        return;
      }

      if (track.kind === 'video') {
        /*
         * A faixa FICA no stream para sempre, e isso é de propósito.
         *
         * Com transceiver fixo, o `ontrack` dispara já na primeira negociação —
         * com uma faixa ainda sem mídia — e a mesma faixa passa a receber
         * quadros quando a outra ponta faz replaceTrack. Ela nunca é trocada.
         *
         * Havia aqui um ouvinte de `ended` que a removia do stream, e o efeito
         * era o pior possível: o elemento ficava com um MediaStream de ZERO
         * faixas e nunca mostrava nada. Quem decide se há transmissão é o
         * ROSTER (`sharingScreen`), não a faixa — mesma fonte de verdade de
         * todo o resto.
         */
        peer.remoteVideo.addTrack(track);
        peer.video.srcObject = peer.remoteVideo;
        peer.hasVideo = true;
        void peer.video.play().catch(() => {});
        callbacks.onPeersChanged();
        return;
      }

      peer.remoteAudio.addTrack(track);
      // Reatribuir é o que faz o elemento notar a faixa nova quando o som da
      // tela chega depois do microfone.
      peer.audio.srcObject = peer.remoteAudio;
      void peer.audio.play().catch((error: unknown) => {
        /*
         * Só `NotAllowedError` é autoplay bloqueado. Reatribuir `srcObject`
         * (logo acima, quando chega o som da tela) interrompe o `play()`
         * anterior com `AbortError` — e o elemento segue tocando com o novo
         * (`autoplay`). Tratar isso como bloqueio mostrava o aviso "o
         * navegador bloqueou o áudio" sem bloqueio nenhum (15/11/2026).
         */
        if ((error as { name?: string }).name !== 'NotAllowedError') return;
        // Autoplay bloqueado: a sala oferece um botão para ativar.
        if (!blockedReported) {
          blockedReported = true;
          callbacks.onAudioBlocked();
        }
      });
      if (peer.watcher === null) peer.watcher = watch(peerUid, peer.remoteAudio);
    };

    pc.onicecandidate = (event) => {
      if (event.candidate === null) return;
      const candidate = event.candidate.toJSON();
      // Candidato gerado antes de o documento existir espera na fila; escrever
      // com arrayUnion num documento inexistente falha.
      if (!peer.descriptionWritten) {
        peer.outbox.push(candidate);
        return;
      }
      void appendCandidate(channelId, myUid, peerUid, candidate).catch(onError);
    };

    /*
     * TURN QUEBRADO NÃO É CHAMADA QUEBRADA — por isso isto NÃO vira erro na tela.
     *
     * Um servidor ICE inalcançável só deixa de ACRESCENTAR candidatos: os `host`
     * e `srflx` continuam sendo coletados e publicados, e a conexão fecha pelo
     * primeiro par que funcionar. Quem não precisava de relay não percebe nada.
     *
     * Mas o motivo fica guardado, porque é ele que separa "a rede dessa pessoa
     * não deixa" de "a nossa credencial expirou" quando a conexão de fato falha.
     */
    pc.onicecandidateerror = (event) => {
      const error = event as RTCPeerConnectionIceErrorEvent;
      const meaning = iceErrorMeaning(error.errorCode);
      if (!peer.iceErrors.includes(meaning)) {
        peer.iceErrors.push(meaning);
        console.warn(`[voz] ICE com ${peerUid}: ${meaning} (${error.url})`);
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') failed.add(peerUid);
      else if (pc.connectionState === 'connected') {
        failed.delete(peerUid);
        // O tipo de candidato só existe depois de fechar: é AQUI que dá para
        // saber se este par caiu em relay e apertar o teto de banda dele.
        void refreshRelayState(peerUid, peer);
      }
      callbacks.onPeersChanged();
    };

    /*
     * REDE DE PROTEÇÃO — com os transceivers fixos isto quase nunca dispara.
     *
     * Se disparar, vale o padrão "perfect negotiation": o impolite (uid menor,
     * o mesmo que já oferta primeiro) ignora oferta que colide com a dele; o
     * polite aceita e deixa o navegador desfazer a própria. Sem uma regra
     * determinística, os dois ofertariam ao mesmo tempo e a conexão morreria.
     */
    pc.onnegotiationneeded = () => {
      // Marca SEMPRE e deixa `maybeNegotiate` decidir se dá para ofertar agora.
      // Guardar em vez de perder é o que cobre o aperto de mão inicial.
      peer.negotiationPending = true;
      maybeNegotiate(peerUid, peer);
    };

    /*
     * A linha ficou livre: se sobrou renegociação pendente, é aqui que ela sai.
     *
     * Sem isto, uma faixa ligada durante o aperto de mão ficaria pendente para
     * sempre — ninguém mais chamaria `maybeNegotiate`.
     */
    pc.onsignalingstatechange = () => {
      if (pc.signalingState === 'stable') maybeNegotiate(peerUid, peer);
    };

    peers.set(peerUid, peer);

    /*
     * SEMEIA A CONEXÃO COM AS FAIXAS QUE EU TENHO AGORA — aqui, e não em quem
     * chama.
     *
     * Um par pode nascer por dois caminhos: pelo roster, ou porque a oferta do
     * outro chegou primeiro. Quando a oferta chegava antes, o `syncPeers` pulava
     * o par já existente e a tela nunca era ligada naquela conexão — o vídeo não
     * saía, de forma intermitente. Pondo aqui, os dois caminhos ficam cobertos.
     *
     * Vai pela fila do par para ficar ORDENADO antes da oferta.
     */
    if (screenStream !== null) {
      peer.queue = peer.queue.then(() => attachScreen(peerUid, peer)).catch(onError);
    }
    if (cameraStream !== null) {
      peer.queue = peer.queue.then(() => attachCamera(peer)).catch(onError);
    }

    return peer;
  }

  /**
   * Quem RESPONDE adota os transceivers que a oferta trouxe.
   *
   * Roda entre o `setRemoteDescription` da oferta e o `setLocalDescription` da
   * resposta — é a única janela em que dá para mudar a direção e ainda sair na
   * resposta. Sem isto, a resposta vai `recvonly` nas três linhas e este lado
   * não manda nem microfone nem tela, para sempre.
   *
   * A ordem das linhas é a que quem oferta criou: microfone, áudio da tela,
   * vídeo da tela. Ela é do outro lado, não deste, então é o que a oferta diz —
   * por isso a seleção é por posição entre os ASSOCIADOS (`mid !== null`), e
   * não pelos objetos locais.
   */
  function adoptTransceivers(peer: Peer): void {
    const associated = peer.pc.getTransceivers().filter((t) => t.mid !== null);
    const audio = associated.filter((t) => t.receiver.track.kind === 'audio');
    const video = associated.filter((t) => t.receiver.track.kind === 'video');

    const micTrack = localStream?.getAudioTracks()[0] ?? null;
    const mic = audio[0];
    if (mic !== undefined) {
      mic.direction = micTrack === null ? 'recvonly' : 'sendrecv';
      // A faixa do microfone estava num transceiver solto; aqui ela entra no
      // que de fato faz parte da sessão.
      if (micTrack !== null && mic.sender.track === null) {
        void mic.sender.replaceTrack(micTrack).catch(onError);
      }
    }

    const screenAudio = audio[1];
    if (screenAudio !== undefined) {
      screenAudio.direction = 'sendrecv';
      peer.screenAudioSender = screenAudio.sender;
    }

    const screenVideo = video[0];
    if (screenVideo !== undefined) {
      screenVideo.direction = 'sendrecv';
      peer.screenVideoSender = screenVideo.sender;
      peer.screenVideoTransceiver = screenVideo;
    }

    // 0.9.5: a quarta linha é a câmera (não vem de quem está em versão velha).
    const cam = video[1];
    if (cam !== undefined) {
      cam.direction = 'sendrecv';
      peer.camSender = cam.sender;
      peer.camTransceiver = cam;
    }
  }

  async function flushOutbox(peer: Peer, peerUid: string): Promise<void> {
    peer.descriptionWritten = true;
    const queued = peer.outbox.splice(0);
    for (const candidate of queued) {
      await appendCandidate(channelId, myUid, peerUid, candidate).catch(onError);
    }
  }

  /** Cria e publica uma oferta para este par. */
  async function sendOffer(peerUid: string, peer: Peer): Promise<void> {
    if (destroyed) return;
    peer.makingOffer = true;
    try {
      await peer.pc.setLocalDescription();
      peer.negotiationId += 1;
      await writeDescription(
        channelId,
        groupId,
        myUid,
        peerUid,
        'offer',
        peer.pc.localDescription?.sdp ?? '',
        peer.negotiationId,
      );
      await flushOutbox(peer, peerUid);
    } finally {
      peer.makingOffer = false;
    }
  }

  async function offerTo(peerUid: string, peer: Peer): Promise<void> {
    try {
      await sendOffer(peerUid, peer);
    } finally {
      arm(peer, peerUid);
    }
  }

  /**
   * Oferta se houver o que oferecer E a linha estiver livre.
   *
   * Este é o único ponto que decide renegociar, e as duas condições vieram cada
   * uma de um defeito real e OPOSTO:
   *
   * - reenviar sem olhar o estado mandava uma segunda oferta em cima de uma
   *   ainda em voo — colisão, e o vídeo nunca chegava;
   * - descartar o pendente perdia a renegociação quando a faixa era ligada
   *   entre o `setLocalDescription` e o fim do aperto de mão — e o vídeo
   *   também nunca chegava, só que pelo motivo contrário.
   *
   * Não estando livre, o pendente FICA: `onsignalingstatechange` chama de novo
   * assim que estabilizar. Nada se perde e nada colide.
   */
  function maybeNegotiate(peerUid: string, peer: Peer): void {
    if (!peer.negotiationArmed || !peer.negotiationPending) return;
    if (peer.makingOffer || peer.pc.signalingState !== 'stable') return;
    peer.negotiationPending = false;
    peer.queue = peer.queue.then(() => sendOffer(peerUid, peer)).catch(onError);
  }

  /**
   * Libera a renegociação automática, depois do aperto de mão inicial.
   *
   * O pendente acumulado até aqui é DESCARTADO, e vale a pena dizer por quê:
   * durante o aperto de mão a única coisa que dispara `negotiationneeded` é o
   * meu próprio `addTransceiver` da construção — `replaceTrack` não dispara.
   * Esse pendente é espúrio, e honrá-lo mandava uma oferta logo depois de
   * responder, contra um par que ainda estava assentando a primeira.
   *
   * O que vier DEPOIS de armar passa por `maybeNegotiate` e não se perde.
   */
  function arm(peer: Peer, _peerUid: string): void {
    peer.negotiationArmed = true;
    peer.negotiationPending = false;
  }

  async function drainPending(peer: Peer): Promise<void> {
    const queued = peer.pending.splice(0);
    for (const candidate of queued) {
      await peer.pc.addIceCandidate(candidate).catch(onError);
    }
  }

  /**
   * Enfileira o sinal no par certo.
   *
   * A serialização é o que garante que duas entregas do MESMO documento não
   * tentem aplicar a descrição remota ao mesmo tempo.
   */
  function handleSignal(signal: SignalDoc): void {
    if (destroyed || signal.from === '') return;

    // A oferta pode chegar antes de o roster me contar da pessoa. A conexão é
    // criada pelo roster, mas se chegar na frente, crio aqui.
    const peer = peers.get(signal.from) ?? createPeer(signal.from);
    peer.queue = peer.queue
      .then(() => applySignal(peer, signal))
      .catch((error: unknown) => onError(error));
  }

  async function applySignal(peer: Peer, signal: SignalDoc): Promise<void> {
    if (destroyed) return;

    /*
     * Só aplica DESCRIÇÃO NOVA. O listener reentrega o mesmo documento a cada
     * candidato acrescentado; sem o negotiationId, uma reentrega seria
     * indistinguível de uma renegociação e cairíamos em
     * setRemoteDescription num estado errado.
     */
    const isNewDescription = signal.sdp !== '' && signal.negotiationId > peer.appliedNegotiation;

    /*
     * DESCRIÇÃO DIFERENTE REJEITADA PELA TRAVA — conta e avisa.
     *
     * A reentrega do mesmo documento é esperada e não conta. O que conta é uma
     * descrição com sdp DIFERENTE do último aplicado sendo barrada pelo id:
     * isso quer dizer que uma negociação de verdade foi jogada fora, e o
     * silêncio nisso foi o que fez esta etapa existir.
     */
    if (signal.sdp !== '' && !isNewDescription && signal.sdp !== peer.appliedSdp) {
      peer.ignored.stale += 1;
      console.warn(
        `[voz] descrição descartada de ${signal.from}: ${signal.kind} id=${signal.negotiationId}, ` +
          `já aplicado id=${peer.appliedNegotiation}. Total descartado: ${peer.ignored.stale}.`,
      );
      callbacks.onPeersChanged();
    }

    if (isNewDescription) {
      // PERFECT NEGOTIATION. `polite` é quem tem o uid MAIOR — o mesmo critério
      // que decide quem oferta primeiro, só que do outro lado.
      const polite = !iAmOfferer(myUid, signal.from);
      const collision =
        signal.kind === 'offer' &&
        (peer.makingOffer || peer.pc.signalingState !== 'stable');

      if (collision && !polite) {
        // Impolite ignora e mantém a própria oferta. Se os dois cedessem —
        // ou nenhum — a conexão travaria.
        peer.appliedNegotiation = signal.negotiationId;
        peer.ignored.glare += 1;
        callbacks.onPeersChanged();
      } else {
        // O polite em colisão aceita: o navegador desfaz a oferta local sozinho
        // ao receber uma remota (rollback implícito).
        await peer.pc.setRemoteDescription({ type: signal.kind, sdp: signal.sdp });
        peer.appliedNegotiation = signal.negotiationId;
        peer.appliedSdp = signal.sdp;
        peer.remoteSet = true;
        await drainPending(peer);

        if (signal.kind === 'offer') {
          // ANTES de montar a resposta: é a única janela em que a direção
          // adotada ainda sai no SDP.
          adoptTransceivers(peer);
          if (screenStream !== null) await attachScreen(signal.from, peer);
          if (cameraStream !== null) await attachCamera(peer);

          await peer.pc.setLocalDescription();
          /*
           * A resposta leva o MEU contador, não o eco do id da oferta.
           *
           * Ecoar parecia inofensivo e criava uma colisão de espaços de
           * numeração: o documento `B_A` tem um escritor só (B), mas passava a
           * carregar ora o contador de A (nas respostas) ora o de B (nas
           * ofertas). O `appliedNegotiation` de A avançava com as respostas até
           * empatar com o contador de B, e a partir dali TODA renegociação
           * iniciada por B era descartada em silêncio pela trava do `>`.
           *
           * Com o contador local, cada documento tem uma sequência monotônica
           * de um dono só. Ver a tabela em PROGRESSO.md, etapa 9.
           */
          peer.negotiationId += 1;
          await writeDescription(
            channelId,
            groupId,
            myUid,
            signal.from,
            'answer',
            peer.pc.localDescription?.sdp ?? '',
            peer.negotiationId,
          );
          await flushOutbox(peer, signal.from);
          arm(peer, signal.from);
        }
      }
    }

    for (const raw of signal.candidates) {
      if (peer.applied.has(raw)) continue;
      peer.applied.add(raw);
      const candidate = JSON.parse(raw) as RTCIceCandidateInit;
      // Candidato antes da descrição remota é erro — vai para a fila.
      if (!peer.remoteSet) peer.pending.push(candidate);
      else await peer.pc.addIceCandidate(candidate).catch(onError);
    }
  }

  const stopSignals = subscribeIncomingSignals(
    channelId,
    groupId,
    myUid,
    handleSignal,
    (error) => {
      // Perder acesso ao grupo com a chamada aberta não é falha: é a chamada
      // acabando — fui removido, ou o grupo foi apagado. O store já trata isso
      // pelos outros listeners; aqui só não vale encher o console.
      if (isPermissionDenied(error)) return;
      onError(new Error('assinatura "sinalização" falhou', { cause: error }));
    },
  );

  function dropPeer(peerUid: string): void {
    const peer = peers.get(peerUid);
    if (peer === undefined) return;
    peer.pc.close();
    peer.audio.srcObject = null;
    peer.audio.remove();
    // O VÍDEO SAI JUNTO. Sem isto, quem fechou o navegador à força deixaria o
    // último quadro congelado no palco depois de já ter sumido do roster.
    peer.video.srcObject = null;
    peer.video.remove();
    peer.camVideo.srcObject = null;
    peer.camVideo.remove();
    peers.delete(peerUid);
    watchers.delete(peerUid);
    failed.delete(peerUid);
    // Limpa a sinalização daquele par — inclusive a que a outra ponta deixou.
    // É isto que resolve quem fechou o navegador à força, sem depender dela.
    void clearPairSignals(channelId, myUid, peerUid).catch(onError);
  }

  /**
   * Descobre se este par fechou por relay, e ajusta o teto de banda dele.
   *
   * Roda ao conectar e a cada leitura do diagnóstico. É barato e é o único
   * caminho: o tipo de candidato não existe antes de a conexão fechar, e um par
   * pode MIGRAR para relay no meio da chamada se o caminho direto cair.
   */
  async function refreshRelayState(peerUid: string, peer: Peer): Promise<void> {
    const stats = await peer.pc.getStats().catch(() => null);
    if (stats === null) return;

    const wasRelay = peer.viaRelay;
    peer.viaRelay = winningCandidateType(stats) === 'relay';
    accumulateRelayBytes(peer, stats);

    // Só reescreve os parâmetros quando o teto muda de valor — `setParameters`
    // é caro e disputa o mesmo sender que o anexo da tela.
    if (peer.viaRelay !== wasRelay && screenStream !== null) {
      peer.queue = peer.queue.then(() => applyVideoParameters(peer)).catch(onError);
    }
    if (peer.viaRelay !== wasRelay && cameraStream !== null) {
      peer.queue = peer.queue.then(() => applyCameraParameters(peer)).catch(onError);
    }
    void peerUid;
  }

  /**
   * Acumula, por diferença, o que passou pelo par vencedor enquanto ele é relay.
   *
   * Por DIFERENÇA porque `bytesSent`/`bytesReceived` do par são acumulados desde
   * que o par existe: somar o total a cada leitura contaria a mesma coisa
   * repetidas vezes.
   */
  function accumulateRelayBytes(peer: Peer, stats: RTCStatsReport): void {
    let total = 0;
    stats.forEach((report) => {
      if (report.type === 'candidate-pair' && report['state'] === 'succeeded') {
        total =
          ((report['bytesSent'] as number | undefined) ?? 0) +
          ((report['bytesReceived'] as number | undefined) ?? 0);
      }
    });

    const delta = total - peer.lastPairBytes;
    // Negativo = o par trocou e o contador reiniciou. Descarta o trecho em vez
    // de subtrair, senão o acumulado andaria para trás.
    if (peer.viaRelay && delta > 0) peer.relayBytes += delta;
    peer.lastPairBytes = total;
  }

  /**
   * Para de transmitir. É o ÚNICO lugar que para — os três caminhos (botão do
   * app, botão nativo do navegador, sair do canal) desembocam aqui.
   */
  async function stopSharing(): Promise<void> {
    const stream = screenStream;
    if (stream === null) return;
    screenStream = null;
    stopScreenAudioExtra?.();
    stopScreenAudioExtra = null;
    pararFonte?.();
    pararFonte = null;

    for (const peer of peers.values()) {
      // Pode não ter canal ainda: quem responde só adota na primeira oferta.
      await peer.screenVideoSender?.replaceTrack(null).catch(onError);
      await peer.screenAudioSender?.replaceTrack(null).catch(onError);
    }
    stream.getTracks().forEach((track) => track.stop());
  }

  /** Liga as faixas da tela numa conexão — nova ou já existente. */
  async function attachScreen(_peerUid: string, peer: Peer): Promise<void> {
    if (screenStream === null) return;
    /*
     * Sem canal ainda não é erro: quem RESPONDE só ganha os senders ao adotar os
     * transceivers da primeira oferta. `adoptTransceivers` chama isto logo em
     * seguida, então nada se perde por sair aqui.
     */
    if (peer.screenVideoSender === null || peer.screenAudioSender === null) return;

    const video = screenStream.getVideoTracks()[0] ?? null;
    const audio = screenStream.getAudioTracks()[0] ?? null;

    // `replaceTrack` num transceiver que JÁ EXISTE não mexe no SDP: é isto que
    // faz começar a transmitir sem renegociar e sem tocar no áudio da chamada.
    await peer.screenVideoSender.replaceTrack(video);
    await peer.screenAudioSender.replaceTrack(audio);

    if (video !== null) await applyVideoParameters(peer);
  }

  /**
   * O teto deste par: a fatia do orçamento, ou o teto de relay se ele for relay.
   *
   * O de relay NÃO entra na divisão do orçamento — é um limite absoluto e
   * menor, porque o gargalo ali não é o meu upload, é o servidor de terceiro no
   * meio do caminho.
   */
  function bitrateFor(peer: Peer): number {
    if (peer.viaRelay) return RELAY_MAX_BITRATE;
    return Math.floor(SCREEN_UPLOAD_BUDGET / Math.max(1, peers.size));
  }

  /**
   * Teto de banda e política de degradação do vídeo que sai.
   *
   * `maintain-framerate` porque o uso é JOGO: com a banda apertando, é melhor
   * perder nitidez do que ver aos solavancos. Ele vence o padrão que o
   * `contentHint = 'detail'` induz (`maintain-resolution`) — os dois convivem, e
   * o explícito manda. `detail` continua valendo para o codificador não borrar
   * texto pequeno quando a cena está parada.
   */
  async function applyVideoParameters(peer: Peer): Promise<void> {
    const sender = peer.screenVideoSender;
    if (sender === null) return;

    const params = sender.getParameters();
    // `encodings` pode vir vazio antes da primeira negociação terminar.
    if (params.encodings.length === 0) params.encodings = [{}];
    params.encodings[0]!.maxBitrate = bitrateFor(peer);
    params.degradationPreference = 'maintain-framerate';
    await sender.setParameters(params).catch(onError);
  }

  /**
   * Redivide o orçamento quando a sala muda de tamanho.
   *
   * Sem isto, entrar a terceira pessoa no meio de uma transmissão triplicaria o
   * upload em vez de repartir o mesmo — e o sintoma seria a voz de todo mundo
   * piorando de uma vez, sem nada na tela explicando.
   */
  /* --- câmera (0.9.5) ------------------------------------------------------ */

  /**
   * A câmera acabou sem a pessoa desligar (desplugou, outro programa pegou).
   * Pausada não conta: no celular o Android corta com o app atrás, e quem
   * cuida disso é a volta da pausa.
   */
  function vigiarFim(faixa: MediaStreamTrack): void {
    faixa.addEventListener('ended', () => {
      if (destroyed || cameraPausada || cameraStream?.getVideoTracks()[0] !== faixa) return;
      callbacks.onCameraEnded?.();
    });
  }

  /** Liga a câmera (ou nada, se pausada/desligada) no canal dela desta conexão. */
  async function attachCamera(peer: Peer): Promise<void> {
    // Sem canal: quem responde ainda não adotou, ou a outra pessoa está numa
    // versão sem câmera. Nos dois casos não é erro.
    if (peer.camSender === null) return;
    const faixa = cameraPausada ? null : (cameraStream?.getVideoTracks()[0] ?? null);
    await peer.camSender.replaceTrack(faixa);
    if (faixa !== null) await applyCameraParameters(peer);
  }

  async function applyCameraParameters(peer: Peer): Promise<void> {
    const sender = peer.camSender;
    if (sender === null || sender.track === null) return;
    const { bitrate, reduzir } = qualidadeDaCamera(peers.size, peer.viaRelay);
    const params = sender.getParameters();
    if (params.encodings.length === 0) params.encodings = [{}];
    params.encodings[0]!.maxBitrate = bitrate;
    params.encodings[0]!.scaleResolutionDownBy = reduzir;
    params.encodings[0]!.maxFramerate = 30;
    // Rosto: equilibrado (nem trava a imagem, nem borra tudo).
    params.degradationPreference = 'balanced';
    await sender.setParameters(params).catch(onError);
  }

  function rebalanceBitrate(): void {
    if (cameraStream !== null) {
      for (const peer of peers.values()) {
        peer.queue = peer.queue.then(() => applyCameraParameters(peer)).catch(onError);
      }
    }
    if (screenStream === null) return;
    /*
     * PELA FILA DO PAR, e não solto.
     *
     * `setParameters` exige o objeto do `getParameters` mais recente DAQUELE
     * sender. Duas chamadas soltas se cruzando — o rebalanceamento e o anexo da
     * tela — faziam a segunda invalidar o objeto da primeira, e o navegador
     * recusava com "getParameters() has never been called on this sender". A
     * fila que já ordena a negociação ordena isto também.
     */
    for (const peer of peers.values()) {
      peer.queue = peer.queue.then(() => applyVideoParameters(peer)).catch(onError);
    }
  }

  return {
    syncPeers(uids) {
      if (destroyed) return;
      const others = new Set(uids.filter((uid) => uid !== myUid));

      for (const peerUid of peers.keys()) {
        if (!others.has(peerUid)) dropPeer(peerUid);
      }

      for (const peerUid of others) {
        if (peers.has(peerUid)) continue;
        const peer = createPeer(peerUid);

        /*
         * Só o de uid menor oferta. O outro cria a conexão e espera — assim ela
         * já está de pé quando a oferta chegar.
         *
         * Pela FILA do par: a semeadura da tela feita em createPeer já está
         * enfileirada na frente, então a oferta sai com o vídeo dentro. Quem
         * entra no meio de uma transmissão não tem caminho especial nenhum.
         */
        if (iAmOfferer(myUid, peerUid)) {
          peer.queue = peer.queue.then(() => offerTo(peerUid, peer)).catch(onError);
        }
      }

      // A sala mudou de tamanho: o orçamento de upload se redivide.
      rebalanceBitrate();
      callbacks.onPeersChanged();
    },

    /**
     * Começa a transmitir. Precisa vir de um clique — getDisplayMedia exige gesto.
     *
     * Devolve o que foi capturado, ou null quando a pessoa fechou o seletor.
     */
    async startScreenShare(audioExtra, fonte) {
      if (screenStream !== null) return null;

      let stream: MediaStream;
      let surface: string | null = null;
      if (fonte !== undefined) {
        const origem = await fonte();
        if (origem === null) return null;
        stream = origem.stream;
        surface = origem.surface;
        pararFonte = origem.parar;
      } else {
        try {
          stream = await navigator.mediaDevices.getDisplayMedia({
            video: SCREEN_QUALITY,
            // Pede o som do sistema junto, para o áudio do jogo ir com a imagem
            // — SEM o som desta página (a voz da turma), senão cada um se
            // ouviria de volta (`restrictOwnAudio`, Chrome 140+, Windows e Mac).
            audio: { restrictOwnAudio: true } as MediaTrackConstraints,
          });
        } catch (error) {
          // Fechar o seletor é desistência, não falha: nada de erro na tela.
          const name = (error as Error).name;
          if (name === 'NotAllowedError' || name === 'AbortError') return null;
          throw error;
        }
      }

      screenStream = stream;
      const video = stream.getVideoTracks()[0];
      if (video === undefined) {
        stream.getTracks().forEach((track) => track.stop());
        screenStream = null;
        pararFonte?.();
        pararFonte = null;
        return null;
      }

      if (audioExtra !== undefined && stream.getAudioTracks().length === 0) {
        const extra = await audioExtra().catch(() => null);
        if (extra !== null) {
          stream.addTrack(extra.track);
          stopScreenAudioExtra = extra.stop;
        }
      }

      // Diz ao codificador que isto é TELA, não rosto: texto pequeno para de
      // virar borrão quando a banda aperta.
      video.contentHint = 'detail';

      /*
       * O caminho de parar que se esquece: o botão NATIVO do navegador.
       * Sem escutar 'ended', o app continuaria achando que transmite, e o meu
       * `sharingScreen` mentiria para todo mundo no canal.
       */
      video.addEventListener('ended', () => {
        void stopSharing().then(() => callbacks.onScreenShareEnded());
      });

      // Também pela fila: anexar e rebalancear mexem no mesmo sender.
      for (const [peerUid, peer] of peers) {
        peer.queue = peer.queue.then(() => attachScreen(peerUid, peer)).catch(onError);
      }

      const settings = video.getSettings() as MediaTrackSettings & { displaySurface?: string };
      return {
        surface: surface ?? settings.displaySurface ?? 'desconhecido',
        label: video.label,
        stream,
        hasAudio: stream.getAudioTracks().length > 0,
      };
    },

    stopScreenShare: stopSharing,

    isSharing: () => screenStream !== null,
    localScreen: () => screenStream,
    /** Uids de quem está mandando vídeo para mim agora. */
    peersWithVideo: () =>
      [...peers.entries()].filter(([, peer]) => peer.hasVideo).map(([uid]) => uid),
    videoElementOf: (uid) => peers.get(uid)?.video ?? null,

    async startCamera(deviceId = '', frente) {
      const video: MediaTrackConstraints = { ...CAMERA_QUALITY };
      if (deviceId !== '') video.deviceId = { exact: deviceId };
      else if (frente !== undefined) video.facingMode = frente ? 'user' : 'environment';
      // Trocar de câmera com ela ligada: a velha para DEPOIS de a nova estar
      // nas conexões (ninguém vê um buraco preto no meio).
      const novo = await navigator.mediaDevices.getUserMedia({ video });
      if (destroyed) {
        novo.getTracks().forEach((t) => t.stop());
        throw new Error('A chamada acabou.');
      }
      const faixa = novo.getVideoTracks()[0];
      if (faixa === undefined) {
        novo.getTracks().forEach((t) => t.stop());
        throw new Error('A câmera não mandou imagem.');
      }
      // Diz ao codificador que é ROSTO em movimento, não tela com texto.
      faixa.contentHint = 'motion';
      pedidoDaCamera = video;
      vigiarFim(faixa);
      const velho = cameraStream;
      cameraStream = novo;
      for (const peer of peers.values()) {
        peer.queue = peer.queue.then(() => attachCamera(peer)).catch(onError);
      }
      await Promise.all([...peers.values()].map((p) => p.queue));
      velho?.getTracks().forEach((t) => t.stop());
      return novo;
    },

    async stopCamera() {
      const velho = cameraStream;
      if (velho === null) return;
      cameraStream = null;
      cameraPausada = false;
      for (const peer of peers.values()) {
        peer.queue = peer.queue.then(() => attachCamera(peer)).catch(onError);
      }
      await Promise.all([...peers.values()].map((p) => p.queue));
      velho.getTracks().forEach((t) => t.stop());
    },

    async setCameraPaused(paused) {
      if (cameraPausada === paused) return;
      // Voltando: o Android pode ter encerrado a câmera com o app atrás —
      // aí pede de novo, do mesmo jeito.
      const atual = cameraStream?.getVideoTracks()[0];
      if (!paused && cameraStream !== null && (atual === undefined || atual.readyState === 'ended')) {
        try {
          const novo = await navigator.mediaDevices.getUserMedia({ video: pedidoDaCamera });
          const faixa = novo.getVideoTracks()[0];
          if (faixa !== undefined) {
            faixa.contentHint = 'motion';
            vigiarFim(faixa);
          }
          cameraStream.getTracks().forEach((t) => t.stop());
          cameraStream = novo;
        } catch (error) {
          console.error('[voz] a câmera não voltou depois da pausa.', error);
        }
      }
      cameraPausada = paused;
      for (const peer of peers.values()) {
        peer.queue = peer.queue.then(() => attachCamera(peer)).catch(onError);
      }
      await Promise.all([...peers.values()].map((p) => p.queue));
    },

    localCamera: () => cameraStream,
    cameraElementOf: (uid) => peers.get(uid)?.camVideo ?? null,

    setMuted(value) {
      muted = value;
      // Desligar a FAIXA, não parar o stream: parar exigiria pedir o microfone
      // de novo para voltar a falar.
      if (localStream !== null) {
        for (const track of localStream.getAudioTracks()) track.enabled = !value;
      }
      // Mudo em silêncio: sem isto o anel ficaria aceso no último nível lido.
      if (value) {
        const watcher = watchers.get(myUid);
        if (watcher?.speaking === true) {
          watcher.speaking = false;
          callbacks.onSpeaking(myUid, false);
        }
      }
    },

    async retryAudio() {
      await audioContext.resume().catch(() => {});
      for (const peer of peers.values()) await peer.audio.play().catch(() => {});
      blockedReported = false;
    },

    async diagnostics() {
      const out: PeerDiagnostic[] = [];
      for (const [uid, peer] of peers) {
        const stats = await peer.pc.getStats().catch(() => null);
        // Reavalia aqui também: um par pode MIGRAR para relay no meio da
        // chamada se o caminho direto cair, e o painel tem que acompanhar.
        if (stats !== null) {
          peer.viaRelay = winningCandidateType(stats) === 'relay';
          accumulateRelayBytes(peer, stats);
        }
        out.push({
          uid,
          connectionState: peer.pc.connectionState,
          iceConnectionState: peer.pc.iceConnectionState,
          candidateType: stats === null ? null : winningCandidateType(stats),
          failed: failed.has(uid),
          inboundVideo: stats === null ? null : videoStats(stats, 'inbound-rtp', peer, false),
          outboundVideo: stats === null ? null : videoStats(stats, 'outbound-rtp', peer, true),
          videoDirection: {
            desired: peer.screenVideoTransceiver?.direction ?? 'sendrecv',
            current: peer.screenVideoTransceiver?.currentDirection ?? null,
          },
          // O mapa completo: quais a negociação associou e quais ficaram
          // soltos. Ver o comentário em `PeerDiagnostic`.
          transceiverMap: peer.pc
            .getTransceivers()
            .map(
              (t, i) =>
                `${i}:${t.receiver.track.kind}/mid=${t.mid ?? '-'}/${t.direction}` +
                `>${t.currentDirection ?? '-'}/track=${t.sender.track === null ? 'não' : 'sim'}`,
            )
            .join(' | '),
          ignored: { ...peer.ignored },
          viaRelay: peer.viaRelay,
          relayBytes: peer.relayBytes,
          bitrateCap: bitrateFor(peer),
          iceErrors: [...peer.iceErrors],
        });
      }
      return out;
    },

    failedPeers: () => [...failed],
    micDenied: () => denied,

    async destroy() {
      destroyed = true;
      pararAjustes();
      stopSignals();
      // A tela para JUNTO com a chamada: é o terceiro caminho de parar.
      screenStream?.getTracks().forEach((track) => track.stop());
      screenStream = null;
      pararFonte?.();
      pararFonte = null;
      // A câmera também desliga com a chamada (a luzinha dela apaga).
      cameraStream?.getTracks().forEach((track) => track.stop());
      cameraStream = null;
      for (const peerUid of [...peers.keys()]) dropPeer(peerUid);
      watchers.clear();
      localStream?.getTracks().forEach((track) => track.stop());
      audioHost.remove();
      videoHost.remove();
      await audioContext.close().catch(() => {});
      await clearMySignals(channelId, groupId, myUid).catch(() => {});
      void muted;
    },
  };
}

/**
 * Estatística de vídeo de uma direção.
 *
 * O bitrate SÓ pode ser calculado por diferença entre duas leituras — o
 * getStats() dá bytes acumulados, não taxa. Por isso a amostra anterior fica
 * guardada no par. A primeira leitura sai com 0 kbps, e isso é honesto.
 */
function videoStats(
  stats: RTCStatsReport,
  type: 'inbound-rtp' | 'outbound-rtp',
  peer: Peer,
  outbound: boolean,
): VideoStats | null {
  let found: Record<string, unknown> | null = null;
  stats.forEach((report) => {
    const record = report as Record<string, unknown>;
    if (record['type'] === type && record['kind'] === 'video') found = record;
  });
  if (found === null) return null;
  const report: Record<string, unknown> = found;

  const bytes = Number(report[outbound ? 'bytesSent' : 'bytesReceived'] ?? 0);
  const at = Number(report['timestamp'] ?? 0);

  let kbps = 0;
  if (outbound && peer.lastVideoAt > 0 && at > peer.lastVideoAt) {
    kbps = Math.round(((bytes - peer.lastVideoBytes) * 8) / (at - peer.lastVideoAt));
  }
  if (outbound) {
    peer.lastVideoBytes = bytes;
    peer.lastVideoAt = at;
  }

  return {
    width: Number(report['frameWidth'] ?? 0),
    height: Number(report['frameHeight'] ?? 0),
    fps: Math.round(Number(report['framesPerSecond'] ?? 0)),
    kbps,
    framesDropped: Number(report['framesDropped'] ?? 0),
    // `qualityLimitationReason` existe só de quem ENVIA, e é o campo que
    // responde "está travando por rede ou por CPU?".
    limitation: outbound ? ((report['qualityLimitationReason'] as string) ?? null) : null,
  };
}

/**
 * Este transceiver é o da CÂMERA? É a SEGUNDA linha de vídeo da sessão (a
 * primeira é a tela) — a ordem é a de quem oferta, igual nos dois lados.
 */
function ehCamera(pc: RTCPeerConnection, transceiver: RTCRtpTransceiver): boolean {
  const videos = pc.getTransceivers().filter((t) => t.mid !== null && t.receiver.track.kind === 'video');
  return videos.indexOf(transceiver) === 1;
}

/**
 * Que tipo de candidato venceu: host, srflx ou relay.
 *
 * Desde a etapa 11 `relay` PODE aparecer — e quando aparece, custa plano. Ver
 * `host` ou `srflx` aqui explica por que uma conexão fechou sem custo nenhum.
 */
function winningCandidateType(stats: RTCStatsReport): string | null {
  let pairId: string | null = null;
  stats.forEach((report) => {
    if (report.type === 'candidate-pair' && report['state'] === 'succeeded') {
      pairId = report['localCandidateId'] as string;
    }
  });
  if (pairId === null) return null;

  let type: string | null = null;
  stats.forEach((report) => {
    if (report.id === pairId) type = (report['candidateType'] as string | undefined) ?? null;
  });
  return type;
}
