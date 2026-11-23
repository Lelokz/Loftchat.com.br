/**
 * MENSAGEM DE VOZ (0.5.5): grava o microfone em Opus (pequeno: ~100 KB por
 * minuto), mede o volume ao vivo para desenhar as ondas e guarda um resumo
 * delas (48 barrinhas) que vai junto com a mensagem — assim o balão desenha
 * as ondas sem baixar o áudio.
 */

export const MAX_VOZ_MS = 5 * 60_000;
export const BARRAS = 48;

export interface Gravacao {
  blob: Blob;
  formato: string;
  duracaoMs: number;
  /** 0 a 100, BARRAS valores. */
  ondas: number[];
}

/** O primeiro formato que este aparelho grava (Chromium: WebM; outros: Ogg/MP4). */
function formatoQueGrava(): string {
  const opcoes = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4', 'audio/webm'];
  return opcoes.find((f) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(f)) ?? '';
}

/** Encolhe a lista de picos para `n` barras (o maior de cada pedaço), em 0..100. */
export function resumirOndas(picos: number[], n = BARRAS): number[] {
  if (picos.length === 0) return Array.from({ length: n }, () => 0);
  const maior = Math.max(...picos, 0.0001);
  return Array.from({ length: n }, (_, i) => {
    const de = Math.floor((i * picos.length) / n);
    const ate = Math.max(de + 1, Math.floor(((i + 1) * picos.length) / n));
    const pedaco = picos.slice(de, ate);
    return Math.round((Math.max(...pedaco) / maior) * 100);
  });
}

export class MicrofoneRecusado extends Error {}

export interface Gravador {
  /** Tempo gravado até agora. */
  tempoMs(): number;
  /** Para e devolve o áudio. */
  parar(): Promise<Gravacao>;
  /** Para e joga fora. */
  cancelar(): void;
}

/**
 * Começa a gravar. `aoNivel` recebe o volume (0 a 1) umas 10 vezes por
 * segundo, para as ondas ao vivo; `aoLimite` é chamado ao bater 5 minutos
 * (a gravação para sozinha e espera mandar).
 */
export async function comecarGravacao(aoNivel: (nivel: number) => void, aoLimite: () => void): Promise<Gravador> {
  const formato = formatoQueGrava();
  if (formato === '' || navigator.mediaDevices?.getUserMedia === undefined) {
    throw new MicrofoneRecusado('Este aparelho não grava áudio.');
  }
  let fluxo: MediaStream;
  try {
    fluxo = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  } catch {
    throw new MicrofoneRecusado('Sem acesso ao microfone. Libere o microfone para o Loftchat.');
  }

  const gravador = new MediaRecorder(fluxo, { mimeType: formato, audioBitsPerSecond: 32_000 });
  const pedacos: Blob[] = [];
  gravador.addEventListener('dataavailable', (e) => {
    if (e.data.size > 0) pedacos.push(e.data);
  });

  const contexto = new AudioContext();
  const analisador = contexto.createAnalyser();
  analisador.fftSize = 1024;
  contexto.createMediaStreamSource(fluxo).connect(analisador);
  const amostra = new Float32Array(analisador.fftSize);
  const picos: number[] = [];

  const inicio = performance.now();
  let fim: number | null = null;
  let parado = false;
  const medir = setInterval(() => {
    analisador.getFloatTimeDomainData(amostra);
    let soma = 0;
    for (const v of amostra) soma += v * v;
    const nivel = Math.min(1, Math.sqrt(soma / amostra.length) * 4);
    picos.push(nivel);
    aoNivel(nivel);
    if (performance.now() - inicio >= MAX_VOZ_MS && fim === null) {
      pararDeGravar();
      aoLimite();
    }
  }, 100);

  const terminou = new Promise<void>((pronto) => gravador.addEventListener('stop', () => pronto(), { once: true }));

  function pararDeGravar(): void {
    if (fim !== null) return;
    fim = performance.now();
    clearInterval(medir);
    if (gravador.state !== 'inactive') gravador.stop();
    for (const faixa of fluxo.getTracks()) faixa.stop();
    void contexto.close().catch(() => undefined);
  }

  gravador.start(1000);

  return {
    tempoMs: () => Math.min(MAX_VOZ_MS, (fim ?? performance.now()) - inicio),
    async parar() {
      if (parado) throw new Error('já parou');
      parado = true;
      pararDeGravar();
      await terminou;
      return {
        blob: new Blob(pedacos, { type: formato.split(';')[0] }),
        formato: formato.split(';')[0]!,
        duracaoMs: Math.round(Math.min(MAX_VOZ_MS, fim! - inicio)),
        ondas: resumirOndas(picos),
      };
    },
    cancelar() {
      parado = true;
      pararDeGravar();
    },
  };
}

/** "0:07", "1:32". */
export function relogio(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
