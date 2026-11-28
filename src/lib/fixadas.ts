import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import type { Unsubscribe } from 'firebase/firestore';

import { db } from './firebase';

/**
 * 0.14.0 FIXAR CONVERSAS do privado (o Léo prometeu ao Arthur): as fixadas
 * ficam no topo da lista, na ordem em que foram fixadas, com o alfinete.
 *
 * Mora em `userPrivate/{uid}` → `conversasFixadas` (uids dos amigos). Na
 * conta: vale no PC e no celular. Até 5, como um limite que não vira bagunça.
 */
export const MAX_FIXADAS = 5;

let lista: string[] = [];
let eu = '';
const ouvintes = new Set<() => void>();

export function ouvirFixadas(f: () => void): () => void {
  ouvintes.add(f);
  return () => ouvintes.delete(f);
}

export function ligarFixadas(uid: string): Unsubscribe {
  eu = uid;
  return onSnapshot(
    doc(db, 'userPrivate', uid),
    (snap) => {
      const v: unknown = snap.get('conversasFixadas');
      const nova = Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, MAX_FIXADAS) : [];
      if (nova.join() === lista.join()) return;
      lista = nova;
      for (const f of ouvintes) f();
    },
    () => undefined,
  );
}

export function fixadas(): readonly string[] {
  return lista;
}

export function estaFixada(uid: string): boolean {
  return lista.includes(uid);
}

/** Fixa ou desafixa. Devolve false se já tem o máximo. */
export async function fixar(uid: string, ligar: boolean): Promise<boolean> {
  if (eu === '') return false;
  if (ligar && !lista.includes(uid) && lista.length >= MAX_FIXADAS) return false;
  const nova = ligar ? [...lista.filter((x) => x !== uid), uid] : lista.filter((x) => x !== uid);
  lista = nova;
  for (const f of ouvintes) f();
  await setDoc(doc(db, 'userPrivate', eu), { conversasFixadas: nova }, { merge: true });
  return true;
}

/** As conversas com as fixadas no topo (na ordem de fixar); as outras como vieram. */
export function comFixadasNoTopo<T>(itens: T[], uidDe: (t: T) => string): T[] {
  if (lista.length === 0) return itens;
  const presas = lista.map((uid) => itens.find((t) => uidDe(t) === uid)).filter((t): t is T => t !== undefined);
  return [...presas, ...itens.filter((t) => !lista.includes(uidDe(t)))];
}
