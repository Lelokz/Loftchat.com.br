import { collection, deleteDoc, doc, getDocs, onSnapshot, setDoc } from 'firebase/firestore';

import { db } from './firebase';
import { safeImage } from './images';

/**
 * FUNDO DO CHAT (proposta A, etapa 5c) — uma imagem atrás das mensagens, só
 * na MINHA tela.
 *
 * Um documento por fundo em `userPrivate/{uid}/fundos/{chave}`: `geral` vale
 * para todos os chats; o id de um canal vale só nele (e ganha do geral). Um
 * documento por fundo, e não tudo no `userPrivate`, porque a imagem é grande
 * (até ~290 KB) e o `userPrivate` é escutado o tempo todo.
 *
 * A imagem é recortada pelo ajustador em 16:9 (1600×900) e na tela cobre a
 * coluna do chat (`cover`). O VÉU (escurecer) é a cor do fundo do chat do
 * tema por cima, de 0 a 90% — o texto continua legível em qualquer imagem.
 */

export const CHAVE_GERAL = 'geral';
export const DIM_PADRAO = 60;
export const DIM_MAX = 90;
export const MAX_LABEL = 80;

export interface ChatBackground {
  image: string;
  /** Quanto escurecer, em %, de 0 a 90 (de 5 em 5). */
  dim: number;
  /** Como o canal aparece na lista das Configurações (ex.: "#geral · Turma"). */
  label: string;
}

function parseFundo(raw: Record<string, unknown> | undefined): ChatBackground | null {
  if (raw === undefined) return null;
  const image = safeImage(raw['image'], 'chat');
  if (image === undefined) return null;
  const dim = typeof raw['dim'] === 'number' ? Math.min(DIM_MAX, Math.max(0, Math.round(raw['dim']))) : DIM_PADRAO;
  const label = typeof raw['label'] === 'string' ? raw['label'].slice(0, MAX_LABEL) : '';
  return { image, dim, label };
}

const fundos = (uid: string) => collection(db, 'userPrivate', uid, 'fundos');

/** Escuta um fundo (geral ou de um canal). `null` = não tem. */
export function watchChatBackground(uid: string, chave: string, onFundo: (f: ChatBackground | null) => void): () => void {
  return onSnapshot(
    doc(fundos(uid), chave),
    (snap) => onFundo(parseFundo(snap.exists() ? snap.data() : undefined)),
    () => onFundo(null),
  );
}

/** Todos os meus fundos (para a lista das Configurações). */
export async function loadChatBackgrounds(uid: string): Promise<Map<string, ChatBackground>> {
  const snap = await getDocs(fundos(uid));
  const mapa = new Map<string, ChatBackground>();
  for (const d of snap.docs) {
    const f = parseFundo(d.data());
    if (f !== null) mapa.set(d.id, f);
  }
  return mapa;
}

export async function saveChatBackground(uid: string, chave: string, fundo: ChatBackground | null): Promise<void> {
  if (fundo === null) {
    await deleteDoc(doc(fundos(uid), chave));
    return;
  }
  await setDoc(doc(fundos(uid), chave), { image: fundo.image, dim: fundo.dim, label: fundo.label.slice(0, MAX_LABEL) });
}

export function sameBackground(a: ChatBackground | null | undefined, b: ChatBackground | null | undefined): boolean {
  if (a == null || b == null) return a == null && b == null;
  return a.image === b.image && a.dim === b.dim;
}

/**
 * Pinta um fundo num elemento (o `<html>` para o chat de verdade, ou a caixa
 * de prévia das Configurações): variáveis que o CSS da `.chat` usa.
 */
export function paintChatBackground(alvo: HTMLElement, fundo: ChatBackground | null): void {
  if (fundo === null) {
    delete alvo.dataset['fundoChat'];
    alvo.style.removeProperty('--chat-fundo');
    alvo.style.removeProperty('--chat-veu');
    return;
  }
  alvo.dataset['fundoChat'] = '';
  alvo.style.setProperty('--chat-fundo', `url("${fundo.image}")`);
  alvo.style.setProperty('--chat-veu', `${fundo.dim}%`);
}
