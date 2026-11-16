import { doc, getDoc, setDoc } from 'firebase/firestore';

import { db } from './firebase';

/**
 * BOAS-VINDAS DO GRUPO (proposta A, etapa 3c).
 *
 * O dono escreve o texto (`groups/{id}.welcome`); quem entra vê um cartão
 * no topo do chat até tocar em "Entendi". O "já vi" mora na parte PRIVADA
 * da conta (`userPrivate/{uid}.welcomeSeen.{groupId}`): vale no PC e no
 * celular, e ninguém mais sabe o que eu li.
 */

export const MAX_WELCOME = 500;

export function welcomeProblem(texto: string): string | null {
  return texto.trim().length > MAX_WELCOME ? `As boas-vindas vão até ${MAX_WELCOME} caracteres.` : null;
}

/** Os grupos cujas boas-vindas eu já dispensei. */
export async function loadWelcomeSeen(uid: string): Promise<Set<string>> {
  const snap = await getDoc(doc(db, 'userPrivate', uid));
  const vistos = snap.exists() ? snap.get('welcomeSeen') : undefined;
  if (typeof vistos !== 'object' || vistos === null) return new Set();
  return new Set(Object.entries(vistos as Record<string, unknown>).filter(([, v]) => v === true).map(([k]) => k));
}

export async function markWelcomeSeen(uid: string, groupId: string): Promise<void> {
  await setDoc(doc(db, 'userPrivate', uid), { welcomeSeen: { [groupId]: true } }, { merge: true });
}
