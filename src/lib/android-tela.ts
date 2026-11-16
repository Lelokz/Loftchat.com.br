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
function esperarCanal(): { canal: Promise<MessagePort | null>; correrRelogio: () => void } {
  let relogio = 0;
  let terminar: (p: MessagePort | null) => void = () => {};
  const canal = new Promise<MessagePort | null>((resolver) => {
    const ouvinte = (e: MessageEvent): void => {
      if (e.data === 'loft-tela' && e.ports[0] !== undefined) terminar(e.ports[0]);
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
  const espera = esperarCanal();
  let ok = false;
  try {
    ({ ok } = await transmissao.iniciar());
  } catch (erro) {
    espera.correrRelogio();
    throw erro;
  }
  espera.correrRelogio();
  if (!ok) return null;
  const porta = await espera.canal;
  if (porta === null) {
    void transmissao.parar().catch(() => {});
    throw new Error('O Android não entregou as imagens da tela.');
  }

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
    stream: new MediaStream([faixa]),
    surface: 'celular',
    label: '',
    parar: () => {
      if (acabou) return;
      acabou = true;
      void ouvinte.remove();
      porta.close();
      fecharSaida();
      faixa.stop();
      void transmissao.parar().catch(() => {});
    },
  };
}
