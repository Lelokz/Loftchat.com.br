import type { ScreenAudioExtra } from './voice-engine';
import type { EscolhasDaJanela, InfoDaJanela } from './janela';

/**
 * O Loft rodando dentro da JANELA de computador (desktop/, Electron).
 *
 * A janela abre este mesmo site e põe `window.loftDesktop` na página (ver
 * desktop/preload.cjs). No navegador ela não existe, e tudo segue como antes.
 */

export interface FonteDeTela {
  id: string;
  nome: string;
  tipo: 'tela' | 'janela';
  /** Imagem PNG em data URL; null quando o sistema não deu miniatura. */
  miniatura: string | null;
  /** Ícone do programa (só janelas), em data URL. */
  icone: string | null;
}

export interface LoftDesktop {
  fontesDeTela(): Promise<FonteDeTela[]>;
  /** Avisa a janela qual fonte o próximo getDisplayMedia deve entregar. */
  escolherFonte(id: string): Promise<void>;
  /** Linux: liga o microfone virtual com o som do PC, menos o do Loft. */
  ligarAudioDoPc(): Promise<boolean>;
  /** Começa a passar som pelo microfone virtual (ele nasce mudo). */
  soltarAudioDoPc(): Promise<void>;
  desligarAudioDoPc(): Promise<void>;
  /** Etapa 9d: a versão do programa (ex.: "0.1.0"). */
  versao?(): Promise<string>;
  /** Etapa 9d: a versão nova já baixada, ou null. */
  atualizacaoPronta?(): Promise<string | null>;
  aoAtualizacaoPronta?(ouvinte: (versao: string) => void): void;
  /** Fecha e reabre na versão nova. */
  atualizarAgora?(): Promise<void>;
  /** Achou uma versão nova; ela começa a baixar sozinha. */
  aoAtualizacaoDisponivel?(ouvinte: (versao: string) => void): void;
  /** Quanto da versão nova já baixou (0–100). */
  aoProgressoDaAtualizacao?(ouvinte: (pct: number) => void): void;
  /** Procura agora: a versão nova achada, ou null se esta é a última. */
  procurarAtualizacao?(): Promise<string | null>;
  /** Etapa 9b: um link `loftchat://convite/…` chegou com o programa aberto. */
  aoAbrirConvite?(ouvinte: (codigo: string) => void): void;
  /** 0.4.0: mostra a notificação do sistema de uma mensagem nova. */
  avisar?(aviso: { titulo: string; corpo: string; rota: string; foto: string }): Promise<void>;
  /** 0.7.0: janela e bandeja (ver src/lib/janela.ts e desktop/main.mjs). */
  janelaEscolhas?(): Promise<InfoDaJanela>;
  janelaEscolher?(chave: string, valor: string): Promise<EscolhasDaJanela | null>;
  janelaReiniciar?(): Promise<void>;
  janelaAcao?(acao: 'min' | 'max' | 'fechar'): void;
  aoEstadoDaJanela?(ouvinte: (estado: { maximizada: boolean }) => void): void;
  bandejaPonto?(tem: boolean): void;
  janelaPuxar?(borda: string, x: number, y: number): void;
  janelaPuxando?(x: number, y: number): void;
  janelaSoltar?(): void;
  /** A pessoa clicou numa notificação: a rota da conversa. Devolve como parar de ouvir. */
  aoAbrirAviso?(ouvinte: (rota: string) => void): () => void;
  /** 0.10.0: a janela some de print e gravação (Windows e Mac; o Linux não tem como). */
  protegerTela?(ligar: boolean): void;
}

/** O nome que o venmic dá ao microfone virtual (desktop/main.mjs). */
const MICROFONE_VIRTUAL = 'vencord-screen-share';

export function loftDesktop(): LoftDesktop | null {
  return (window as unknown as { loftDesktop?: LoftDesktop }).loftDesktop ?? null;
}

/**
 * O som do PC para ir junto da tela (Linux). `null` = sem som, e a tela segue
 * sem ele.
 */
export async function capturarAudioDoPc(desktop: LoftDesktop): Promise<ScreenAudioExtra | null> {
  if (!(await desktop.ligarAudioDoPc())) return null;
  try {
    const dispositivo = await esperarMicrofoneVirtual();
    if (dispositivo === null) throw new Error('microfone virtual não apareceu');

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: { exact: dispositivo.deviceId },
        // É música e jogo, não voz: nada de tratar como microfone.
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 2,
        sampleRate: 48000,
      },
    });
    const track = stream.getAudioTracks()[0];
    if (track === undefined) throw new Error('microfone virtual sem faixa');

    await desktop.soltarAudioDoPc();
    return {
      track,
      stop: () => {
        track.stop();
        void desktop.desligarAudioDoPc();
      },
    };
  } catch (erro) {
    console.error('Sem o som do PC na transmissão.', erro);
    await desktop.desligarAudioDoPc();
    return null;
  }
}

/** O PipeWire leva um instante para mostrar o microfone recém-criado. */
async function esperarMicrofoneVirtual(): Promise<MediaDeviceInfo | null> {
  for (let tentativa = 0; tentativa < 20; tentativa += 1) {
    const dispositivos = await navigator.mediaDevices.enumerateDevices();
    const achado = dispositivos.find(
      (d) => d.kind === 'audioinput' && d.label === MICROFONE_VIRTUAL,
    );
    if (achado !== undefined) return achado;
    await new Promise((pronto) => window.setTimeout(pronto, 100));
  }
  return null;
}
