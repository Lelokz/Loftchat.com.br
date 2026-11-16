/**
 * STATUS E LINKS DO PERFIL (proposta A, etapa 2d).
 *
 * Os dois moram em `users/{uid}` (são pequenos e aparecem na lista de
 * membros e no cartão). A regra do banco (firestore.rules) cobra os MESMOS
 * tetos — aqui é a primeira tranca, lá a de verdade.
 */

export const MAX_STATUS_TEXT = 60;
export const MAX_LINKS = 3;
export const MAX_LINK = 200;

/* -------------------------------------------------------------------------- */
/* Status                                                                      */
/* -------------------------------------------------------------------------- */

export interface CustomStatus {
  /** Um emoji da lista do seletor ('' = sem emoji). */
  emoji: string;
  text: string;
  /** Quando some, em milissegundos desde 1970; 0 = não some sozinho. */
  until: number;
}

/** Os emojis do seletor — poucos e úteis, sem biblioteca de fora. */
export const STATUS_EMOJIS = [
  '😀', '😎', '😴', '🤒', '🥳', '😤', '🤔', '😭',
  '🎮', '🎧', '📚', '💻', '🍕', '☕', '🏃', '🚗',
  '🎬', '📺', '🎵', '✏️', '🛠️', '🏫', '🌙', '🔥',
  '❤️', '⭐', '🔇', '⏳', '🏖️', '🐱', '⚽', '👀',
] as const;

/** Por quanto tempo o status fica. */
export const STATUS_DURATIONS = [
  { id: 'nunca', label: 'Não limpar' },
  { id: '30m', label: '30 minutos' },
  { id: '1h', label: '1 hora' },
  { id: '4h', label: '4 horas' },
  { id: 'hoje', label: 'Hoje' },
  { id: '7d', label: '7 dias' },
] as const;
export type StatusDurationId = (typeof STATUS_DURATIONS)[number]['id'];

/** O "até quando", a partir de agora. 'hoje' = meia-noite de hoje. */
export function statusUntil(duracao: StatusDurationId, agora: Date = new Date()): number {
  const ms = agora.getTime();
  switch (duracao) {
    case 'nunca':
      return 0;
    case '30m':
      return ms + 30 * 60_000;
    case '1h':
      return ms + 60 * 60_000;
    case '4h':
      return ms + 4 * 60 * 60_000;
    case 'hoje': {
      const fim = new Date(agora);
      fim.setHours(24, 0, 0, 0);
      return fim.getTime();
    }
    case '7d':
      return ms + 7 * 24 * 60 * 60_000;
  }
}

/** Lê o status de um documento — qualquer coisa estranha vira "sem status". */
export function parseStatus(raw: unknown): CustomStatus | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const r = raw as Record<string, unknown>;
  const emoji = typeof r['emoji'] === 'string' ? r['emoji'].slice(0, 16) : '';
  const text = typeof r['text'] === 'string' ? r['text'].slice(0, MAX_STATUS_TEXT) : '';
  const until = typeof r['until'] === 'number' && Number.isFinite(r['until']) ? r['until'] : 0;
  if (emoji === '' && text.trim() === '') return undefined;
  return { emoji, text, until };
}

/** O status que vale AGORA (o vencido some, mesmo que ainda esteja no banco). */
export function activeStatus(status: CustomStatus | undefined, agora = Date.now()): CustomStatus | undefined {
  if (status === undefined) return undefined;
  if (status.until !== 0 && status.until <= agora) return undefined;
  return status;
}

/** "até 14:30", "até amanhã", "até sex." — para o aviso nas Configurações. */
export function untilLabel(until: number, agora: Date = new Date()): string {
  if (until === 0) return 'sem prazo';
  const fim = new Date(until);
  const hora = fim.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const dias = Math.round(
    (new Date(fim).setHours(0, 0, 0, 0) - new Date(agora).setHours(0, 0, 0, 0)) / (24 * 60 * 60_000),
  );
  if (dias <= 0) return fim.getHours() === 0 && fim.getMinutes() === 0 ? 'até o fim do dia' : `até ${hora}`;
  if (dias === 1) return fim.getHours() === 0 && fim.getMinutes() === 0 ? 'até o fim do dia' : `até amanhã, ${hora}`;
  return `até ${fim.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`;
}

/* -------------------------------------------------------------------------- */
/* Links                                                                       */
/* -------------------------------------------------------------------------- */

const LINK_RE = /^https:\/\/[^\s<>"'`]+$/;

/**
 * Deixa o link no formato que vai para o banco: sem espaços em volta e com
 * `https://` na frente se a pessoa escreveu só "youtube.com/@fulano".
 * `http://` vira `https://` — link sem cadeado não entra.
 */
export function normalizeLink(texto: string): string {
  const limpo = texto.trim();
  if (limpo === '') return '';
  if (/^https:\/\//i.test(limpo)) return `https://${limpo.slice(8)}`;
  if (/^http:\/\//i.test(limpo)) return `https://${limpo.slice(7)}`;
  return `https://${limpo}`;
}

/** O problema do link (já normalizado), ou null se está bom. */
export function linkProblem(link: string): string | null {
  if (link === '') return null;
  if (link.length > MAX_LINK) return `O link vai até ${MAX_LINK} caracteres.`;
  if (!LINK_RE.test(link)) return 'Esse link não parece um endereço de site.';
  try {
    const url = new URL(link);
    if (!url.hostname.includes('.')) return 'Esse link não parece um endereço de site.';
  } catch {
    return 'Esse link não parece um endereço de site.';
  }
  return null;
}

/** Os links de um documento — só os que passariam na regra. */
export function parseLinks(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((l): l is string => typeof l === 'string' && l !== '' && linkProblem(l) === null)
    .slice(0, MAX_LINKS);
}

/** "youtube.com/@fulano" — o link sem o https:// e sem barra no fim. */
export function linkLabel(link: string): string {
  try {
    const url = new URL(link);
    const host = url.hostname.replace(/^www\./, '');
    const resto = `${url.pathname}${url.search}`.replace(/\/$/, '');
    const texto = `${host}${resto}`;
    return texto.length > 40 ? `${texto.slice(0, 39)}…` : texto;
  } catch {
    return link;
  }
}
