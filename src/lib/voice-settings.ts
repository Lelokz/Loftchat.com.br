/**
 * VOZ E ÁUDIO (proposta A, etapa 8c): qual microfone, qual saída de som e os
 * três filtros do navegador (ruído, eco e volume automático do microfone).
 *
 * Fica NESTE APARELHO (localStorage), não na conta: o microfone do PC não
 * existe no celular, e os ids dos aparelhos mudam de um navegador para outro.
 * Sem o que ler (aba anônima, armazenamento bloqueado), vale o padrão — o
 * mesmo de antes desta etapa.
 *
 * Quem usa: a seção das Configurações (escreve) e o motor de voz (lê ao
 * entrar na sala e acompanha as mudanças com a chamada aberta).
 */

export interface VoiceSettings {
  /** `''` = o padrão do sistema. */
  micId: string;
  /** `''` = o padrão do sistema. */
  speakerId: string;
  noiseSuppression: boolean;
  echoCancellation: boolean;
  autoGainControl: boolean;
}

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  micId: '',
  speakerId: '',
  noiseSuppression: true,
  echoCancellation: true,
  autoGainControl: true,
};

const CHAVE = 'loft.voz';
const MAX_ID = 300;

function texto(v: unknown): string {
  return typeof v === 'string' && v.length <= MAX_ID ? v : '';
}

export function loadVoiceSettings(): VoiceSettings {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(CHAVE) ?? 'null');
    if (typeof raw !== 'object' || raw === null) return { ...DEFAULT_VOICE_SETTINGS };
    const r = raw as Record<string, unknown>;
    return {
      micId: texto(r['micId']),
      speakerId: texto(r['speakerId']),
      noiseSuppression: r['noiseSuppression'] !== false,
      echoCancellation: r['echoCancellation'] !== false,
      autoGainControl: r['autoGainControl'] !== false,
    };
  } catch {
    return { ...DEFAULT_VOICE_SETTINGS };
  }
}

const ouvintes = new Set<(v: VoiceSettings) => void>();

/** Guarda e avisa quem está ouvindo (o motor, com a chamada aberta). */
export function saveVoiceSettings(v: VoiceSettings): void {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(v));
  } catch {
    // Sem armazenamento: vale só até fechar a página, e tudo bem.
  }
  for (const ouvinte of ouvintes) ouvinte({ ...v });
}

export function onVoiceSettings(ouvinte: (v: VoiceSettings) => void): () => void {
  ouvintes.add(ouvinte);
  return () => ouvintes.delete(ouvinte);
}

/**
 * O pedido de microfone. `ideal`, não `exact`: se o aparelho escolhido sumiu
 * (fone desplugado), o navegador cai no padrão em vez de recusar a sala.
 */
export function micConstraints(v: VoiceSettings): MediaTrackConstraints {
  return {
    ...(v.micId === '' ? {} : { deviceId: { ideal: v.micId } }),
    noiseSuppression: v.noiseSuppression,
    echoCancellation: v.echoCancellation,
    autoGainControl: v.autoGainControl,
  };
}

/** Dá para escolher a saída de som? (Firefox antigo e Safari não deixam.) */
export function outputChoiceSupported(): boolean {
  return typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;
}

/** Os mesmos filtros e o mesmo microfone? Trocar só a saída não pede o microfone de novo. */
export function sameMic(a: VoiceSettings, b: VoiceSettings): boolean {
  return (
    a.micId === b.micId &&
    a.noiseSuppression === b.noiseSuppression &&
    a.echoCancellation === b.echoCancellation &&
    a.autoGainControl === b.autoGainControl
  );
}
