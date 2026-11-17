import { Capacitor, registerPlugin } from '@capacitor/core';

import type { FonteDeTela } from './voice-engine';

/**
 * TRANSMITIR A TELA DO CELULAR (etapa 10c, app Android).
 *
 * A página do app (WebView) não tem `getDisplayMedia`. Quem captura é o
 * próprio Android (`PluginDaTransmissao.java` + `ServicoDaTransmissao.java`,
 * com a autorização do sistema e a notificação "Transmitindo a tela"). As
 * imagens chegam aqui por um canal de mensagens da WebView, em JPEG, e viram
 * uma faixa de vídeo comum — o motor da chamada manda essa faixa para a sala
 * pelo mesmo caminho da tela do PC.
 *
 * A faixa sai de um `MediaStreamTrackGenerator` (escreve quadro a quadro, e
 * continua andando com o app atrás, mostrando outro app). Sem ele, de um
 * <canvas> com `captureStream`.
 *
 * Cada quadro é respondido com "ok": o Android só manda o próximo depois
 * disso, então nada se acumula se o celular estiver lento.
 */

interface Transmissao {
  disponivel(): Promise<{ disponivel: boolean }>;
  iniciar(): Promise<{ ok: boolean }>;
  parar(): Promise<void>;
  addListener(evento: 'parou', ouvinte: () => void): Promise<{ remove: () => Promise<void> }>;
}

const transmissao = registerPlugin<Transmissao>('Transmissao');

/** Gerador de faixa do Chrome (não está nos tipos do TypeScript). */
interface GeradorDeFaixa extends MediaStreamTrack {
  writable: WritableStream<VideoFrame>;
}
type ConstrutorDoGerador = new (opcoes: { kind: 'video' }) => GeradorDeFaixa;

let sabeTransmitir = false;

/** Pergunta uma vez, ao abrir o app: este Android sabe transmitir a tela? */
export function conferirTransmissaoDoAndroid(): void {
  if (!Capacitor.isNativePlatform()) return;
  void transmissao
    .disponivel()
    .then(({ disponivel }) => (sabeTransmitir = disponivel))
    .catch(() => (sabeTransmitir = false));
}

export function transmissaoDoAndroidDisponivel(): boolean {
  return sabeTransmitir;
}

/** Espera o canal das imagens, que o Android entrega logo depois da autorização. */
interface Canais {
  imagens: MessagePort;
  /** O som dos outros apps; não vem no Android 9 ou menos, ou sem permissão do microfone. */
  som: MessagePort | null;
}

function esperarCanal(): { canal: Promise<Canais | null>; correrRelogio: () => void } {
  let relogio = 0;
  let terminar: (p: Canais | null) => void = () => {};
  const canal = new Promise<Canais | null>((resolver) => {
    const ouvinte = (e: MessageEvent): void => {
      if (e.data === 'loft-tela' && e.ports[0] !== undefined) {
        terminar({ imagens: e.ports[0], som: e.ports[1] ?? null });
      }
    };
    terminar = (porta) => {
      window.removeEventListener('message', ouvinte);
      clearTimeout(relogio);
      resolver(porta);
    };
    window.addEventListener('message', ouvinte);
  });
  // A pessoa pode demorar no "Começar agora" do Android: o relógio só corre
  // depois da autorização (ver `capturarTelaDoAndroid`).
  return {
    canal,
    correrRelogio: () => {
      relogio = window.setTimeout(() => terminar(null), 10_000);
    },
  };
}

/**
 * Pede ao Android a tela do celular. Devolve a fonte para o motor da chamada,
 * ou null se a pessoa recusou na janela do Android (desistência, não erro).
 */
export async function capturarTelaDoAndroid(): Promise<FonteDeTela | null> {
  // Criado AGORA, ainda dentro do toque no botão: depois da janela do Android
  // o navegador poderia deixar o som pausado.
  const contextoDoSom = new AudioContext({ sampleRate: 48_000 });
  void contextoDoSom.resume().catch(() => {});
  const espera = esperarCanal();
  let ok = false;
  try {
    ({ ok } = await transmissao.iniciar());
  } catch (erro) {
    espera.correrRelogio();
    void contextoDoSom.close().catch(() => {});
    throw erro;
  }
  espera.correrRelogio();
  if (!ok) {
    void contextoDoSom.close().catch(() => {});
    return null;
  }
  const canais = await espera.canal;
  if (canais === null) {
    void transmissao.parar().catch(() => {});
    contextoDoSom.close().catch(() => {});
    throw new Error('O Android não entregou as imagens da tela.');
  }
  const porta = canais.imagens;
  const som = canais.som === null ? null : await ligarSom(contextoDoSom, canais.som);
  if (som === null) void contextoDoSom.close().catch(() => {});

  const Gerador = (window as unknown as { MediaStreamTrackGenerator?: ConstrutorDoGerador }).MediaStreamTrackGenerator;
  let faixa: MediaStreamTrack;
  let desenhar: (quadro: ImageBitmap) => Promise<void>;
  let fecharSaida: () => void;

  if (Gerador !== undefined && typeof VideoFrame === 'function') {
    const gerador = new Gerador({ kind: 'video' });
    const escritor = gerador.writable.getWriter();
    faixa = gerador;
    desenhar = async (quadro) => {
      const video = new VideoFrame(quadro, { timestamp: Math.round(performance.now() * 1000) });
      try {
        await escritor.write(video);
      } finally {
        video.close();
      }
    };
    fecharSaida = () => void escritor.close().catch(() => {});
  } else {
    const tela = document.createElement('canvas');
    const contexto = tela.getContext('2d')!;
    faixa = tela.captureStream().getVideoTracks()[0]!;
    desenhar = async (quadro) => {
      if (tela.width !== quadro.width || tela.height !== quadro.height) {
        tela.width = quadro.width;
        tela.height = quadro.height;
      }
      contexto.drawImage(quadro, 0, 0);
    };
    fecharSaida = () => {};
  }

  let acabou = false;
  porta.onmessage = (e: MessageEvent<ArrayBuffer | string>): void => {
    if (acabou) return;
    const dados = typeof e.data === 'string' ? Uint8Array.from(atob(e.data), (c) => c.charCodeAt(0)) : e.data;
    void createImageBitmap(new Blob([dados], { type: 'image/jpeg' }))
      .then(async (quadro) => {
        try {
          if (!acabou) await desenhar(quadro);
        } finally {
          quadro.close();
        }
      })
      .catch((erro: unknown) => console.warn('[tela do celular]', erro))
      .finally(() => {
        if (!acabou) porta.postMessage('ok');
      });
  };

  // Parou pelo Android (botão Parar da notificação, tela bloqueada, outro app
  // pediu a tela): avisa o motor como o "parar" do navegador do PC.
  const ouvinte = await transmissao.addListener('parou', () => {
    faixa.dispatchEvent(new Event('ended'));
  });

  return {
    stream: new MediaStream(som === null ? [faixa] : [faixa, som.faixa]),
    surface: 'celular',
    label: '',
    parar: () => {
      if (acabou) return;
      acabou = true;
      void ouvinte.remove();
      porta.close();
      fecharSaida();
      faixa.stop();
      som?.parar();
      void transmissao.parar().catch(() => {});
    },
  };
}

/*
 * O SOM: pedaços de 20 ms (PCM 16 bits, estéreo, 48 kHz) chegam pelo segundo
 * canal e tocam num AudioWorklet que vira uma faixa de áudio — nunca no
 * alto-falante, só para a sala. Fila curta: se acumular mais de 0,3 s
 * (celular engasgou), descarta o excesso para o som não ficar atrasado.
 */
const TOCADOR = `
class Tocador extends AudioWorkletProcessor {
  constructor() {
    super();
    this.tamanho = 48000;
    this.esq = new Float32Array(this.tamanho);
    this.dir = new Float32Array(this.tamanho);
    this.ler = 0;
    this.escrever = 0;
    this.port.onmessage = (e) => {
      const pcm = new Int16Array(e.data);
      for (let i = 0; i + 1 < pcm.length; i += 2) {
        this.esq[this.escrever] = pcm[i] / 32768;
        this.dir[this.escrever] = pcm[i + 1] / 32768;
        this.escrever = (this.escrever + 1) % this.tamanho;
      }
      const guardado = (this.escrever - this.ler + this.tamanho) % this.tamanho;
      if (guardado > 14400) this.ler = (this.escrever - 4800 + this.tamanho) % this.tamanho;
    };
  }
  process(_entradas, saidas) {
    const [e, d] = saidas[0];
    for (let i = 0; i < e.length; i++) {
      if (this.ler === this.escrever) { e[i] = 0; if (d) d[i] = 0; continue; }
      e[i] = this.esq[this.ler];
      if (d) d[i] = this.dir[this.ler];
      this.ler = (this.ler + 1) % this.tamanho;
    }
    return true;
  }
}
registerProcessor('loft-tocador', Tocador);
`;

async function ligarSom(
  contexto: AudioContext,
  porta: MessagePort,
): Promise<{ faixa: MediaStreamTrack; parar: () => void } | null> {
  try {
    const endereco = URL.createObjectURL(new Blob([TOCADOR], { type: 'text/javascript' }));
    await contexto.audioWorklet.addModule(endereco);
    URL.revokeObjectURL(endereco);
    const tocador = new AudioWorkletNode(contexto, 'loft-tocador', { numberOfOutputs: 1, outputChannelCount: [2] });
    const destino = contexto.createMediaStreamDestination();
    tocador.connect(destino);
    porta.onmessage = (e: MessageEvent<ArrayBuffer | string>): void => {
      const dados =
        typeof e.data === 'string' ? Uint8Array.from(atob(e.data), (c) => c.charCodeAt(0)).buffer : e.data;
      tocador.port.postMessage(dados, [dados]);
    };
    const faixa = destino.stream.getAudioTracks()[0];
    if (faixa === undefined) return null;
    return {
      faixa,
      parar: () => {
        porta.close();
        faixa.stop();
        tocador.disconnect();
        void contexto.close().catch(() => {});
      },
    };
  } catch (erro) {
    console.warn('[som do celular]', erro);
    porta.close();
    return null;
  }
}
