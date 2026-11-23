/**
 * EMOJIS (0.5.0): a lista completa, por categoria, com nomes e palavras de
 * busca em português (emojibase-data, licença MIT). Carrega só quando o
 * painel abre pela primeira vez.
 */

export interface Emoji {
  /** O emoji (já no tom de pele escolhido, quando ele tem tons). */
  e: string;
  nome: string;
  /** Nome e palavras de busca, sem acento e em minúsculas. */
  busca: string;
  /** Os 5 tons de pele, quando existem (clara → escura). */
  tons?: string[];
}

export interface Categoria {
  id: string;
  nome: string;
  /** O emoji que representa a categoria na coluna do lado. */
  icone: string;
  emojis: Emoji[];
}

/** Os grupos da emojibase (o 2, "componentes", fica de fora: são pedaços, não emojis). */
const GRUPOS: { grupo: number; id: string; nome: string; icone: string }[] = [
  { grupo: 0, id: 'rostos', nome: 'Rostos e emoções', icone: '😀' },
  { grupo: 1, id: 'pessoas', nome: 'Pessoas e corpo', icone: '👋' },
  { grupo: 3, id: 'animais', nome: 'Animais e natureza', icone: '🐶' },
  { grupo: 4, id: 'comida', nome: 'Comida e bebida', icone: '🍔' },
  { grupo: 6, id: 'atividades', nome: 'Atividades', icone: '⚽' },
  { grupo: 5, id: 'viagens', nome: 'Viagens e lugares', icone: '✈️' },
  { grupo: 7, id: 'objetos', nome: 'Objetos', icone: '💡' },
  { grupo: 8, id: 'simbolos', nome: 'Símbolos', icone: '❤️' },
  { grupo: 9, id: 'bandeiras', nome: 'Bandeiras', icone: '🏳️' },
];

export function semAcento(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

interface Bruto {
  group?: number;
  order?: number;
  label: string;
  tags?: string[];
  unicode: string;
  skins?: { unicode: string }[];
}

let carregando: Promise<Categoria[]> | null = null;

export function carregarEmojis(): Promise<Categoria[]> {
  carregando ??= import('emojibase-data/pt/compact.json').then((modulo) => {
    const lista = (modulo.default as unknown as Bruto[]).filter((x) => x.group !== undefined && x.group !== 2);
    lista.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    return GRUPOS.map(({ grupo, id, nome, icone }) => ({
      id,
      nome,
      icone,
      emojis: lista
        .filter((x) => x.group === grupo)
        .map((x) => ({
          e: x.unicode,
          nome: x.label,
          busca: semAcento([x.label, ...(x.tags ?? [])].join(' ')),
          ...(x.skins !== undefined && x.skins.length === 5 ? { tons: x.skins.map((s) => s.unicode) } : {}),
        })),
    }));
  });
  return carregando;
}

/* ------------------------------ guardados no aparelho ------------------------------ */

const CHAVE_RECENTES = 'loft:emojis-recentes';
const CHAVE_TOM = 'loft:emoji-tom';
const MAX_RECENTES = 24;

function ler(chave: string): string | null {
  try {
    return localStorage.getItem(chave);
  } catch {
    return null;
  }
}

function gravar(chave: string, valor: string): void {
  try {
    localStorage.setItem(chave, valor);
  } catch {
    // Sem armazenamento: segue sem lembrar.
  }
}

export function emojisRecentes(): string[] {
  try {
    const lista = JSON.parse(ler(CHAVE_RECENTES) ?? '[]') as unknown;
    return Array.isArray(lista) ? lista.filter((x): x is string => typeof x === 'string').slice(0, MAX_RECENTES) : [];
  } catch {
    return [];
  }
}

export function usouEmoji(emoji: string): void {
  const lista = [emoji, ...emojisRecentes().filter((x) => x !== emoji)].slice(0, MAX_RECENTES);
  gravar(CHAVE_RECENTES, JSON.stringify(lista));
}

/** 0 = amarelo (padrão), 1 a 5 = da pele mais clara à mais escura. */
export function tomDePele(): number {
  const n = Number(ler(CHAVE_TOM) ?? '0');
  return Number.isInteger(n) && n >= 0 && n <= 5 ? n : 0;
}

export function mudarTomDePele(tom: number): void {
  gravar(CHAVE_TOM, String(tom));
}

/** O emoji no tom escolhido (os sem tons ficam como são). */
export function noTom(emoji: Emoji, tom: number): string {
  return tom === 0 || emoji.tons === undefined ? emoji.e : (emoji.tons[tom - 1] ?? emoji.e);
}

export const AMOSTRAS_DE_TOM = ['👍', '👍🏻', '👍🏼', '👍🏽', '👍🏾', '👍🏿'];
