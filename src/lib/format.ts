/** Formatação de texto para exibição. Nada aqui toca no DOM. */

/**
 * Iniciais para avatar: primeira letra das duas primeiras palavras,
 * ou as duas primeiras letras quando o nome tem uma palavra só.
 */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return (words[0]!.charAt(0) + words[1]!.charAt(0)).toUpperCase();
}

/** Horário curto, ex.: "14:32". */
export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * A chave do DIA no fuso de quem está olhando.
 *
 * Local, e não UTC, de propósito: duas pessoas em fusos diferentes podem ver o
 * separador de data em posições diferentes na mesma conversa, e está certo —
 * "ontem" é ontem de quem lê.
 *
 * Data impossível de interpretar devolve a sentinela `'?'`. Como duas inválidas
 * seguidas dão a MESMA chave, elas não geram separador nenhum em vez de gerarem
 * um "Invalid Date" na tela.
 */
export function localDayKey(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "?";
  return keyOfDate(date);
}

function keyOfDate(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

const DAY_MONTH = new Intl.DateTimeFormat("pt-BR", {
  day: "numeric",
  month: "long",
});
const DAY_MONTH_YEAR = new Intl.DateTimeFormat("pt-BR", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

/**
 * O rótulo do separador: "Hoje", "Ontem", "19 de agosto", "19 de agosto de 2025".
 *
 * `now` é parâmetro para "hoje" e "ontem" serem testáveis sem depender do
 * relógio da máquina — mesmo padrão de `isLive` em lib/voice-presence.ts.
 *
 * A comparação é por CHAVE DE DIA, não por diferença de milissegundos: subtrair
 * 24h erra no horário de verão e na virada do mês.
 */
export function formatDayLabel(iso: string, now: number = Date.now()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Data desconhecida";

  const today = new Date(now);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  const key = keyOfDate(date);
  if (key === keyOfDate(today)) return "Hoje";
  if (key === keyOfDate(yesterday)) return "Ontem";

  // Dentro do ano corrente o ano é ruído; fora dele, é a informação principal.
  const sameYear = date.getFullYear() === today.getFullYear();
  return sameYear ? DAY_MONTH.format(date) : DAY_MONTH_YEAR.format(date);
}

/** Tamanho de arquivo legível, ex.: "1,4 MB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const decimals = value >= 10 ? 0 : 1;
  return `${value.toFixed(decimals).replace(".", ",")} ${units[unit]}`;
}

/** Duração de áudio, ex.: "1:07". */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** Primeiro nome, para caber nos espaços apertados (bloco de participante). */
export function firstName(displayName: string): string {
  return displayName.trim().split(/\s+/)[0] ?? displayName;
}
