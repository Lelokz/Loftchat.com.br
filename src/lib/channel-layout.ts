import type { Channel } from '../types/models';

/**
 * CATEGORIAS E ORDEM DOS CANAIS (proposta A, etapa 3b).
 *
 * As categorias moram no próprio grupo (`groups/{id}.categories`, uma lista
 * na ordem em que aparecem); cada canal aponta para a sua com `categoryId`.
 * Canal sem categoria — ou apontando para uma que não existe mais — fica no
 * bloco de cima, "texto"/"voz", como sempre foi.
 *
 * Dentro de cada bloco: texto primeiro, voz depois, cada um pela `position`.
 */

export interface ChannelCategory {
  id: string;
  name: string;
}

export const MAX_CATEGORIES = 20;
export const MAX_CATEGORY_NAME = 30;
export const MAX_CHANNEL_NAME = 60;

/** Emojis para canais — a mesma ideia do status: poucos e úteis. */
export const CHANNEL_EMOJIS = [
  '💬', '📢', '📌', '🎮', '🎧', '🎵', '🎬', '📷',
  '🎨', '📚', '💻', '🤖', '😂', '🔥', '⭐', '❤️',
  '🍕', '⚽', '🏆', '🛠️', '📅', '🔇', '🌙', '👋',
] as const;

/** Lê as categorias do documento do grupo — o estranho é descartado. */
export function parseCategories(raw: unknown): ChannelCategory[] {
  if (!Array.isArray(raw)) return [];
  const vistos = new Set<string>();
  const lista: ChannelCategory[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const id = (item as Record<string, unknown>)['id'];
    const name = (item as Record<string, unknown>)['name'];
    if (typeof id !== 'string' || id === '' || id.length > 40 || vistos.has(id)) continue;
    if (typeof name !== 'string') continue;
    vistos.add(id);
    lista.push({ id, name: name.slice(0, MAX_CATEGORY_NAME) });
    if (lista.length === MAX_CATEGORIES) break;
  }
  return lista;
}

export interface ChannelSection {
  /** null = o bloco de cima, sem categoria. */
  category: ChannelCategory | null;
  text: Channel[];
  voice: Channel[];
}

function porPosicao(a: Channel, b: Channel): number {
  return a.position - b.position || a.name.localeCompare(b.name, 'pt-BR');
}

/** Os blocos na ordem da tela: sem categoria primeiro, depois as categorias. */
export function channelSections(channels: Channel[], categories: ChannelCategory[]): ChannelSection[] {
  const existe = new Set(categories.map((c) => c.id));
  const blocos: ChannelSection[] = [null, ...categories].map((category) => ({ category, text: [], voice: [] }));
  for (const channel of channels) {
    const indice =
      channel.categoryId !== undefined && existe.has(channel.categoryId)
        ? categories.findIndex((c) => c.id === channel.categoryId) + 1
        : 0;
    const bloco = blocos[indice]!;
    (channel.kind === 'voice' ? bloco.voice : bloco.text).push(channel);
  }
  for (const bloco of blocos) {
    bloco.text.sort(porPosicao);
    bloco.voice.sort(porPosicao);
  }
  return blocos;
}

/** O primeiro canal de texto NA ORDEM DA TELA — é onde o grupo abre. */
export function firstTextChannel(channels: Channel[], categories: ChannelCategory[]): Channel | undefined {
  for (const bloco of channelSections(channels, categories)) {
    if (bloco.text.length > 0) return bloco.text[0];
  }
  return undefined;
}

/** Um id curto e aleatório para categoria nova. */
export function newCategoryId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
