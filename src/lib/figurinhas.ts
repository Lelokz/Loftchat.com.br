import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import type { Unsubscribe } from 'firebase/firestore';

import { db } from './firebase';
import { arquivoDoLoft } from './midia';

/**
 * FIGURINHAS (0.5.0) de cada pessoa, em `figurinhas/{uid}`: as RECENTES
 * (as 10 últimas mandadas) e as FAVORITAS (criar uma já favorita). O
 * arquivo mora no R2 e figurinha nunca expira.
 */

export interface Figurinha {
  url: string;
  largura: number;
  altura: number;
}

export const MAX_RECENTES = 10;
export const MAX_FAVORITAS = 300;

interface Estado {
  uid: string | null;
  favoritas: Figurinha[];
  recentes: Figurinha[];
}

const estado: Estado = { uid: null, favoritas: [], recentes: [] };
const ouvintes = new Set<() => void>();
let pararDeOuvir: Unsubscribe | null = null;

function limpa(lista: unknown): Figurinha[] {
  if (!Array.isArray(lista)) return [];
  return lista
    .filter((f): f is Figurinha => typeof f === 'object' && f !== null && arquivoDoLoft((f as Figurinha).url))
    .map((f) => ({ url: f.url, largura: Number(f.largura) || 512, altura: Number(f.altura) || 512 }));
}

function avisar(): void {
  for (const ouvir of ouvintes) ouvir();
}

/** Liga as figurinhas desta conta (o app chama ao entrar). */
export function ligarFigurinhas(uid: string): () => void {
  pararDeOuvir?.();
  estado.uid = uid;
  pararDeOuvir = onSnapshot(
    doc(db, 'figurinhas', uid),
    (instantaneo) => {
      const dados = instantaneo.data() ?? {};
      estado.favoritas = limpa(dados['favoritas']);
      estado.recentes = limpa(dados['recentes']);
      avisar();
    },
    () => undefined,
  );
  return () => {
    pararDeOuvir?.();
    pararDeOuvir = null;
    estado.uid = null;
    estado.favoritas = [];
    estado.recentes = [];
  };
}

export function favoritas(): Figurinha[] {
  return estado.favoritas;
}

export function recentes(): Figurinha[] {
  return estado.recentes;
}

export function ehFavorita(url: string): boolean {
  return estado.favoritas.some((f) => f.url === url);
}

export function ouvirFigurinhas(ouvir: () => void): () => void {
  ouvintes.add(ouvir);
  return () => ouvintes.delete(ouvir);
}

async function gravar(): Promise<void> {
  if (estado.uid === null) return;
  avisar();
  await setDoc(doc(db, 'figurinhas', estado.uid), { favoritas: estado.favoritas, recentes: estado.recentes });
}

/** Nova favorita vai para o começo (logo depois do "+ Criar figurinha"). */
export function favoritar(f: Figurinha): Promise<void> {
  estado.favoritas = [f, ...estado.favoritas.filter((x) => x.url !== f.url)].slice(0, MAX_FAVORITAS);
  return gravar();
}

export function desfavoritar(url: string): Promise<void> {
  estado.favoritas = estado.favoritas.filter((x) => x.url !== url);
  return gravar();
}

/** Mandou: vai para o topo das recentes (só as 10 últimas). */
export function usouFigurinha(f: Figurinha): Promise<void> {
  estado.recentes = [f, ...estado.recentes.filter((x) => x.url !== f.url)].slice(0, MAX_RECENTES);
  return gravar();
}
