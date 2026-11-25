import './voice-room.css';
import '../camera/camera.css';

import { corDoCargo, el, iconEl, iconeDoCargo } from '../../lib/dom';
import { panelToggleButton } from '../chat/chat';
import {
  cameraIcon,
  cameraOffIcon,
  eyeOffIcon,
  flipCameraIcon,
  gearIcon,
  hangupIcon,
  menuIcon,
  expandIcon,
  micIcon,
  monitorIcon,
  peopleIcon,
  screenShareIcon,
  shrinkIcon,
  speakerIcon,
} from '../../lib/icons';
import type { Member } from '../../types/models';

/**
 * Sala de voz — ocupa a coluna do meio inteira.
 *
 * Substituiu o antigo `call-panel`, que era uma faixa de 210px EM CIMA do chat.
 * A diferença não é de tamanho: aquilo era um chat com um enfeite no topo, isto
 * é um lugar onde você está. Por isso o chat sai da tela enquanto ela está
 * aberta, e a faixa no rodapé da coluna de canais passa a ser o vínculo entre os
 * dois.
 *
 * Os participantes são REAIS: vêm da coleção voiceParticipants, filtrados por
 * heartbeat. Os companheiros fictícios saíram junto com o data/mock.ts.
 */

export interface VoiceParticipantView {
  member: Member;
  muted: boolean;
  /** Eu — ganha o rótulo "você" e segue o estado de mudo do store. */
  isSelf: boolean;
  /** A conexão direta com esta pessoa não fechou. */
  failed: boolean;
  /** 0.9.5: a câmera dela — desligada, ligada ou pausada (app do celular atrás). */
  camera: 'off' | 'on' | 'pausada';
}

/** 0.9.5: a MINHA câmera e o que dá para fazer com ela. */
export interface CameraView {
  ligada: boolean;
  /** Motivo de não poder ligar (sem permissão do cargo, sala cheia de câmeras…), ou null. */
  travada: string | null;
  /** Mostra o botão de virar (celular). */
  podeVirar: boolean;
  /** Meu vídeo espelhado para mim. */
  espelhar: boolean;
  /** Uid da câmera em foco (grande no palco), ou null. */
  foco: string | null;
  /** Esconder da grade quem está sem câmera. */
  esconderSemCamera: boolean;
}

export interface ScreenShareView {
  /** Nome de quem transmite, ou null quando ninguém transmite. */
  sharerName: string | null;
  /** Sou eu quem transmite. */
  isMine: boolean;
  /** "Tela inteira", "Janela — Chrome"… para eu conferir o que compartilhei. */
  label: string | null;
  /** Pedi o som do sistema e o navegador não deu. */
  audioMissing: boolean;
  maximized: boolean;
  /** Este navegador não sabe compartilhar tela (celular). */
  supported: boolean;
  /** O motivo, quando não sabe (o app Android diz que ainda vem). */
  unsupportedReason?: string;
  /** O aviso de "foi sem som", quando o do PC não serve (app Android). */
  audioMissingText?: string;
  /** O motor de voz já subiu? Antes disso o botão não teria o que fazer. */
  ready: boolean;
}

export interface VoiceRoomParts {
  element: HTMLElement;
  /**
   * Onde o `<video>` do motor é ENCAIXADO.
   *
   * O elemento não é criado aqui: ele vive fora da árvore de componentes, porque
   * a sala é reconstruída a cada mudança de estado e a imagem reiniciaria toda
   * vez que alguém entrasse ou apertasse mudo.
   */
  stageSlot: HTMLElement | null;
  /** Onde entra a miniatura da MINHA transmissão, para eu conferir. */
  previewSlot: HTMLElement | null;
  /**
   * 0.9.5: onde ENCAIXAR o <video> da câmera de cada pessoa (uid → lugar).
   * Mesmo motivo do `stageSlot`: o elemento é do motor e não pode ser recriado.
   */
  camSlots: Map<string, HTMLElement>;
}

/** Etapa 8a: com transmissão, palco grande + fila de pessoas, ou tudo em grade. */
export type RoomLayout = 'palco' | 'grade';

export interface VoiceRoomProps {
  channelName: string;
  /** Quando EU entrei nesta sala (ms) — o relógio do cabeçalho conta daqui. */
  joinedAt: number;
  layout: RoomLayout;
  onToggleLayout: () => void;
  /** Etapa 8b: no computador, mostra/esconde o painel da direita (onde mora o chat da sala). */
  onTogglePanel: () => void;
  /** Etapa 8c: a engrenagem abre Configurações → Voz e áudio. */
  onOpenVoiceSettings: () => void;
  /**
   * Toque num botão TRAVADO: mostra o motivo num aviso. No celular não existe
   * "passar o mouse" para ler a dica — sem isto o botão parecia não fazer nada.
   */
  onAviso: (texto: string) => void;
  participants: VoiceParticipantView[];
  muted: boolean;
  /** Entrei sem microfone: ouço, mas não falo. */
  micDenied: boolean;
  /** O navegador não deixou tocar sozinho. */
  audioBlocked: boolean;
  /** O motor não subiu: a sala está na tela e muda. */
  engineError: string | null;
  screen: ScreenShareView;
  onToggleMute: () => void;
  onRetryAudio: () => void;
  /** Gavetas do mobile — a sala precisa delas tanto quanto o chat. */
  onOpenChannels: () => void;
  onOpenMembers: () => void;
  onToggleScreenShare: () => void;
  onToggleMaximize: () => void;
  onLeave: () => void;
  /** 0.9.5 */
  camera: CameraView;
  onToggleCamera: () => void;
  onVirarCamera: () => void;
  onFoco: (uid: string | null) => void;
  onToggleEsconderSemCamera: () => void;
}

export function renderVoiceRoom(props: VoiceRoomProps): VoiceRoomParts {
  const { channelName, participants, screen } = props;

  /*
   * Os botões de gaveta existem aqui também.
   *
   * Sem eles, no celular, entrar na sala de voz trancaria a pessoa: a sala ocupa
   * a tela inteira e canais e membros ficariam inalcançáveis. Somem por CSS
   * acima de 720px, como os do chat.
   */
  const transmitindo = screen.sharerName !== null;
  const camSlots = new Map<string, HTMLElement>();
  // 0.9.5: uma câmera em FOCO vai para o palco (clicar num bloco com câmera).
  const focado =
    props.camera.foco === null
      ? undefined
      : participants.find((p) => p.member.id === props.camera.foco && p.camera !== 'off');
  const emGrade = focado === undefined && (!transmitindo || props.layout === 'grade');

  // Palco ↔ grade: só faz sentido com alguém transmitindo (e sem câmera em foco).
  const trocarJeito =
    transmitindo &&
    focado === undefined &&
    (() => {
      const rotulo = emGrade ? 'Ver a tela em destaque' : 'Ver todos em grade';
      const b = el('button', { class: 'icon-button room__layout-button', type: 'button', title: rotulo }, [
        el('span', { class: 'room__layout-icon', 'aria-hidden': 'true' }, [emGrade ? '▣' : '▦']),
        el('span', { class: 'sr-only' }, [rotulo]),
      ]);
      b.addEventListener('click', props.onToggleLayout);
      return b;
    })();

  const header = el('header', { class: 'room__header' }, [
    drawerButton('Abrir canais', menuIcon(18), props.onOpenChannels, 'left'),
    iconEl(speakerIcon(16), 'icon room__header-icon'),
    // Título e "3 pessoas · 12:04" juntos: no celular viram duas linhas, sem
    // quebrar palavra por palavra.
    el('div', { class: 'room__heading' }, [
      el('h1', { class: 'room__title' }, [channelName]),
      el('span', { class: 'room__meta' }, [
        el('span', { class: 'room__count' }, [
          participants.length === 1 ? 'só você' : `${participants.length} pessoas`,
        ]),
        relogio(props.joinedAt),
      ]),
    ]),
    el('span', { class: 'room__header-spacer' }),
    botaoEsconder(props),
    trocarJeito,
    (() => {
      const b = el('button', { class: 'icon-button room__settings-button', type: 'button', title: 'Voz e áudio' }, [
        iconEl(gearIcon(18)),
        el('span', { class: 'sr-only' }, ['Voz e áudio']),
      ]);
      b.addEventListener('click', props.onOpenVoiceSettings);
      return b;
    })(),
    panelToggleButton(props.onTogglePanel),
    drawerButton('Abrir membros', peopleIcon(18), props.onOpenMembers, 'right'),
  ]);

  /* --- palco ---------------------------------------------------------------- */

  let stageSlot: HTMLElement | null = null;
  let previewSlot: HTMLElement | null = null;
  let stageInner: HTMLElement | null = null;

  if (screen.sharerName !== null && !screen.isMine) {
    // Alguém transmitindo: o vídeo ocupa o palco.
    stageSlot = el('div', { class: 'room__video-slot' });
    stageInner = el('div', { class: 'room__screen room__screen--live' }, [
      stageSlot,
      // Como no desenho da sala (a-sala): quem transmite e o AO VIVO em cima.
      el('div', { class: 'room__live' }, [
        el('p', { class: 'room__screen-caption' }, [`${screen.sharerName} está transmitindo`]),
        el('span', { class: 'room__live-badge' }, ['AO VIVO']),
      ]),
      maximizeButton(props),
    ]);
  } else if (screen.isMine) {
    /*
     * EU transmitindo: o palco NÃO repete a minha própria tela em tamanho
     * grande. Isso criaria o efeito de túnel (a tela dentro da tela) e gastaria
     * CPU à toa. A miniatura no canto é o que importa — ela é a chance de eu
     * perceber que compartilhei a janela errada, que é o pior erro possível.
     */
    previewSlot = el('div', { class: 'room__preview-slot' });
    const stop = el('button', { class: 'room__preview-stop', type: 'button' }, ['Parar']);
    stop.addEventListener('click', props.onToggleScreenShare);

    stageInner = el('div', { class: 'room__screen room__screen--mine' }, [
      el('div', { class: 'room__live' }, [el('span', { class: 'room__live-badge' }, ['AO VIVO'])]),
      el('div', { class: 'room__screen-empty' }, [
        iconEl(monitorIcon(30), 'icon room__screen-icon'),
        el('p', { class: 'room__screen-text' }, ['Você está transmitindo a sua tela']),
      ]),
      el('div', { class: 'room__preview' }, [
        previewSlot,
        el('p', { class: 'room__preview-label' }, [screen.label ?? 'Compartilhando']),
        stop,
      ]),
    ]);
  }
  // Sem transmissão NÃO há palco: nada de caixa vazia "a tela aparece aqui" —
  // as pessoas ocupam a sala (etapa 8a).

  const visiveis = participants.filter(
    (p) => p !== focado && (!props.camera.esconderSemCamera || p.camera !== 'off'),
  );
  const pessoas = visiveis.map((participant) =>
      comCamera(
      props,
      camSlots,
      participant,
      el(
        'li',
        {
          class: `room__person${participant.isSelf ? ' is-self' : ''}${participant.failed ? ' is-failed' : ''}${
            participant.camera !== 'off' ? ' tem-camera' : ''
          }`,
          // O uid no bloco é o que deixa o anel de "falando" ser aceso sem
          // re-renderizar a sala — quem detecta fala mexe na classe direto.
          'data-uid': participant.member.id,
        },
        [
          el('span', { class: 'room__person-avatar', 'aria-hidden': 'true' }, [
            participant.member.photo === undefined
              ? participant.member.initials
              : el('img', { class: 'avatar__img', src: participant.member.photo, alt: '', draggable: 'false' }),
          ]),
          el('span', { class: 'room__person-nome' }, [
            corDoCargo(
              el('span', { class: 'room__person-name', title: participant.member.displayName }, [
                participant.isSelf ? `${participant.member.displayName} (você)` : participant.member.displayName,
              ]),
              participant.member,
            ),
            iconeDoCargo(participant.member),
          ]),
          participant.failed &&
            el('span', { class: 'room__person-failed' }, ['sem conexão']),
          participant.muted &&
            el('span', { class: 'room__person-muted', title: 'Microfone desligado' }, [
              iconEl(micIcon(12)),
            ]),
        ],
      ),
      ),
  );

  /*
   * O MIOLO da sala (etapa 8a):
   *  - sem transmissão: as pessoas em grade, grandes;
   *  - com transmissão, "palco": a tela grande e a fila de pessoas embaixo;
   *  - com transmissão, "grade": a tela vira um bloco da grade, do lado das pessoas.
   */
  const miolo: HTMLElement[] = [];
  if (focado !== undefined) {
    // Câmera em foco no palco; a tela (se houver) vira um bloco da fila.
    const fila = stageInner === null ? pessoas : [el('li', { class: 'room__tile-tela' }, [stageInner]), ...pessoas];
    miolo.push(
      el('div', { class: 'room__stage' }, [palcoDaCamera(props, camSlots, focado)]),
      el('ul', { class: 'room__people room__people--fila', 'aria-label': 'Participantes' }, fila),
    );
  } else if (stageInner !== null && !emGrade) {
    miolo.push(
      el('div', { class: 'room__stage' }, [stageInner]),
      el('ul', { class: 'room__people room__people--fila', 'aria-label': 'Participantes' }, pessoas),
    );
  } else {
    const blocos = stageInner === null ? pessoas : [el('li', { class: 'room__tile-tela' }, [stageInner]), ...pessoas];
    miolo.push(
      el(
        'ul',
        {
          class: `room__people room__people--grade room__people--n${Math.min(blocos.length, 9)}`,
          'aria-label': 'Participantes',
        },
        blocos,
      ),
    );
  }

  /*
   * Avisos que NÃO podem ficar em silêncio.
   *
   * Cada um destes é um estado em que a sala parece funcionar e não funciona:
   * microfone recusado (ninguém te ouve), autoplay bloqueado (você não ouve
   * ninguém) e conexão que não fechou (você não ouve alguém específico).
   */
  const notices: (HTMLElement | false)[] = [];

  if (props.engineError !== null) {
    notices.push(el('p', { class: 'room__notice', role: 'alert' }, [props.engineError]));
  }

  if (props.micDenied) {
    notices.push(
      el('p', { class: 'room__notice', role: 'alert' }, [
        'Sem acesso ao microfone: você ouve, mas ninguém te ouve. ' +
          'Libere o microfone nas permissões do navegador e entre na sala de novo.',
      ]),
    );
  }

  if (props.audioBlocked) {
    const activate = el('button', { class: 'room__notice-action', type: 'button' }, [
      'Ativar áudio',
    ]);
    activate.addEventListener('click', props.onRetryAudio);
    notices.push(
      el('p', { class: 'room__notice', role: 'alert' }, [
        'O navegador bloqueou o áudio automático. ',
        activate,
      ]),
    );
  }

  if (screen.isMine && screen.audioMissing) {
    notices.push(
      el('p', { class: 'room__notice', role: 'alert' }, [
        screen.audioMissingText ??
          'Este navegador não mandou o som do sistema junto — vai só a imagem. ' +
            'O som do jogo não está sendo transmitido.',
      ]),
    );
  }

  /*
   * A conexão falhou DEPOIS de o TURN existir — o que muda a explicação.
   *
   * Até a etapa 10 esta frase dizia "sem servidor TURN, algumas redes bloqueiam
   * esse caminho". Com TURN no ar isso virou mentira, e mentira que aponta para
   * o lado errado: a pessoa iria procurar o problema na configuração quando o
   * relay já foi tentado e também não passou.
   *
   * E ela não pode sugerir que o outro lado não entrou: quem aparece nesta
   * lista ESTÁ na sala — o que não fechou foi a conexão com ele.
   */
  const failedNames = participants.filter((p) => p.failed).map((p) => p.member.displayName);
  if (failedNames.length > 0) {
    notices.push(
      el('p', { class: 'room__notice', role: 'alert' }, [
        `${failedNames.join(', ')} está na sala, mas a conexão não fechou: ` +
          'a internet de um dos lados está bloqueando a chamada. ' +
          'Tente sair e entrar de novo, ou trocar de rede (Wi-Fi ↔ dados).',
      ]),
    );
  }

  /*
   * Câmera e compartilhar tela ficam VISÍVEIS e TRAVADOS.
   *
   * Com o microfone funcionando de verdade ao lado, um botão de câmera que
   * aparenta ligar e não liga passa a ser mentira — e não haveria como
   * distinguir "não implementado" de "quebrado". Travado com o motivo no title,
   * a ausência fica explícita.
   */
  const microfone = controlButton(
    micIcon(19),
    props.muted ? 'Ativar microfone' : 'Desativar microfone',
    props.muted,
    props.onToggleMute,
  );
  // Microfone aberto = botão roxo cheio (desenho a-sala); mudo = apagado.
  if (!props.muted) microfone.classList.add('room__btn--on');

  const controls = el('div', { class: 'room__controls' }, [
    microfone,
    ...botoesDaCamera(props),
    screenButton(props),
    controlButton(hangupIcon(19), 'Sair da chamada', false, props.onLeave, true),
  ]);

  const element = el(
    'section',
    {
      class: `room${screen.maximized ? ' is-maximized' : ''}${
        screen.sharerName !== null && !screen.isMine ? ' has-video' : ''
      }${emGrade ? ' room--grade' : ' room--palco'}`,
      'aria-label': `Sala de voz ${channelName}`,
      // Alvo do menu de contexto (hoje cai no menu mínimo: Copiar/Recarregar).
      'data-context': 'room',
    },
    [header, ...notices, ...miolo, controls],
  );

  return { element, stageSlot, previewSlot, camSlots };
}

/* --- câmera (0.9.5) ---------------------------------------------------------- */

/** Põe o lugar do vídeo no bloco de quem está com a câmera ligada, e o clique do foco. */
function comCamera(
  props: VoiceRoomProps,
  camSlots: Map<string, HTMLElement>,
  participant: VoiceParticipantView,
  bloco: HTMLElement,
): HTMLElement {
  if (participant.camera === 'off') return bloco;
  const uid = participant.member.id;
  const slot = el('span', {
    class: `room__cam-slot${participant.isSelf && props.camera.espelhar ? ' is-espelhada' : ''}`,
    'aria-hidden': 'true',
  });
  camSlots.set(uid, slot);
  bloco.prepend(slot);
  if (participant.camera === 'pausada') bloco.append(avisoPausada());
  bloco.title = 'Clique para ver grande · duplo clique: tela cheia';
  bloco.addEventListener('click', () => props.onFoco(uid));
  bloco.addEventListener('dblclick', () => telaCheia(bloco));
  return bloco;
}

function avisoPausada(): HTMLElement {
  return el('div', { class: 'room__cam-pausada' }, [iconEl(cameraOffIcon(22)), el('span', {}, ['Câmera pausada'])]);
}

/** O palco com uma câmera grande. Clicar volta para a grade. */
function palcoDaCamera(
  props: VoiceRoomProps,
  camSlots: Map<string, HTMLElement>,
  p: VoiceParticipantView,
): HTMLElement {
  const slot = el('span', { class: `room__cam-slot${p.isSelf && props.camera.espelhar ? ' is-espelhada' : ''}`, 'aria-hidden': 'true' });
  camSlots.set(p.member.id, slot);
  const cheia = el('button', { class: 'room__maximize', type: 'button', title: 'Tela cheia' }, [
    iconEl(expandIcon(16)),
    el('span', { class: 'sr-only' }, ['Tela cheia']),
  ]);
  const palco = el(
    'div',
    { class: 'room__foco', title: 'Clique para voltar para todos', 'data-uid': p.member.id },
    [
      slot,
      el('span', { class: 'room__foco-nome' }, [p.isSelf ? `${p.member.displayName} (você)` : p.member.displayName]),
      p.camera === 'pausada' && avisoPausada(),
      cheia,
    ],
  );
  cheia.addEventListener('click', (e) => {
    e.stopPropagation();
    telaCheia(palco);
  });
  palco.addEventListener('click', () => props.onFoco(null));
  palco.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    telaCheia(palco);
  });
  return palco;
}

function telaCheia(alvo: HTMLElement): void {
  if (document.fullscreenElement !== null) void document.exitFullscreen().catch(() => {});
  else void alvo.requestFullscreen?.().catch(() => {});
}

/** "Esconder quem está sem câmera": só aparece com câmera E alguém sem. */
function botaoEsconder(props: VoiceRoomProps): HTMLElement | null {
  const com = props.participants.filter((p) => p.camera !== 'off').length;
  if (com === 0 || (com === props.participants.length && !props.camera.esconderSemCamera)) return null;
  const rotulo = 'Esconder quem está sem câmera';
  const b = el(
    'button',
    { class: 'room__esconder', type: 'button', title: rotulo, 'aria-pressed': String(props.camera.esconderSemCamera) },
    [iconEl(eyeOffIcon(16)), el('span', { class: 'room__esconder-texto' }, [rotulo])],
  );
  b.addEventListener('click', props.onToggleEsconderSemCamera);
  return b;
}

/** Ligar/desligar a câmera e (no celular, ligada) virar. */
function botoesDaCamera(props: VoiceRoomProps): HTMLElement[] {
  const { camera } = props;
  if (camera.travada !== null && !camera.ligada) {
    return [controlButton(cameraOffIcon(19), camera.travada, true, null, false, props.onAviso)];
  }
  const botao = controlButton(
    camera.ligada ? cameraIcon(19) : cameraOffIcon(19),
    camera.ligada ? 'Desligar câmera' : 'Ligar câmera',
    !camera.ligada,
    props.onToggleCamera,
  );
  if (camera.ligada) botao.classList.add('room__btn--on');
  if (!camera.ligada || !camera.podeVirar) return [botao];
  return [botao, controlButton(flipCameraIcon(19), 'Virar a câmera', false, props.onVirarCamera)];
}

/*
 * RELÓGIO DA CHAMADA: "· 12:04" desde que eu entrei. A sala é redesenhada a
 * cada mudança de estado, então o tempo não pode morar nela: um intervalo só,
 * para todas, atualiza qualquer relógio que estiver na tela.
 */
let relogioLigado = false;

function tempo(desde: number): string {
  const s = Math.max(0, Math.floor((Date.now() - desde) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const seg = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${seg}` : `${m}:${seg}`;
}

function relogio(desde: number): HTMLElement {
  const span = el('span', { class: 'room__clock', 'data-desde': String(desde), title: 'Tempo na chamada' }, [`· ${tempo(desde)}`]);
  if (!relogioLigado) {
    relogioLigado = true;
    window.setInterval(() => {
      for (const r of document.querySelectorAll<HTMLElement>('.room__clock[data-desde]')) {
        r.textContent = `· ${tempo(Number(r.dataset['desde']))}`;
      }
    }, 1000);
  }
  return span;
}

/**
 * Botão de compartilhar tela.
 *
 * Três estados, e cada um diz o motivo: transmitindo (clicar para), livre, ou
 * travado — porque outra pessoa já transmite, ou porque este navegador não sabe
 * (celular não tem getDisplayMedia).
 */
function screenButton(props: VoiceRoomProps): HTMLElement {
  const { screen } = props;

  if (!screen.supported) {
    return controlButton(
      screenShareIcon(19),
      screen.unsupportedReason ?? 'Compartilhar tela só funciona no computador',
      true,
      null,
      false,
      props.onAviso,
    );
  }

  // A sala aparece antes de o motor terminar de subir. Um botão clicável que
  // não faz nada nesse intervalo é pior do que um botão travado que diz por quê.
  if (!screen.ready) {
    return controlButton(screenShareIcon(19), 'Conectando à sala…', true, null, false, props.onAviso);
  }

  const takenByOther = screen.sharerName !== null && !screen.isMine;
  if (takenByOther) {
    return controlButton(
      screenShareIcon(19),
      `${screen.sharerName} já está transmitindo`,
      true,
      null,
      false,
      props.onAviso,
    );
  }

  return controlButton(
    screenShareIcon(19),
    screen.isMine ? 'Parar de transmitir' : 'Compartilhar tela',
    !screen.isMine,
    props.onToggleScreenShare,
  );
}

function maximizeButton(props: VoiceRoomProps): HTMLElement {
  const label = props.screen.maximized ? 'Sair da tela cheia' : 'Ver em tela cheia';
  const button = el(
    'button',
    { class: 'room__maximize', type: 'button', title: label },
    [iconEl(props.screen.maximized ? shrinkIcon(16) : expandIcon(16)), el('span', { class: 'sr-only' }, [label])],
  );
  button.addEventListener('click', props.onToggleMaximize);
  return button;
}

/** `onClick` nulo = o botão existe mas ainda não faz nada, e diz isso. */
function controlButton(
  icon: string,
  label: string,
  isOff: boolean,
  onClick: (() => void) | null,
  danger = false,
  aviso?: (texto: string) => void,
): HTMLElement {
  const classes = ['room__btn', isOff ? 'is-off' : '', danger ? 'room__btn--danger' : '']
    .filter((part) => part !== '')
    .join(' ');

  const button = el('button', { class: classes, type: 'button', title: label }, [
    iconEl(icon),
    el('span', { class: 'sr-only' }, [label]),
  ]);

  if (onClick !== null) button.addEventListener('click', onClick);
  else if (aviso === undefined) button.disabled = true;
  else {
    // TRAVADO, mas tocável: diz o motivo (o celular não mostra a dica do mouse).
    button.setAttribute('aria-disabled', 'true');
    button.addEventListener('click', () => aviso(label));
  }
  return button;
}

/** Botão de gaveta. Some por CSS no desktop — ver a media query em layout.css. */
function drawerButton(
  label: string,
  icon: string,
  onClick: () => void,
  side: 'left' | 'right',
): HTMLElement {
  const button = el(
    'button',
    {
      class: `icon-button chat__mobile-button chat__mobile-button--${side}`,
      type: 'button',
      title: label,
    },
    [iconEl(icon), el('span', { class: 'sr-only' }, [label])],
  );
  button.addEventListener('click', onClick);
  return button;
}
