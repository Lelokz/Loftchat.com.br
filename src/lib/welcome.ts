import { doc, setDoc } from 'firebase/firestore';

import { db } from './firebase';

/**
 * BOAS-VINDAS DO GRUPO (proposta A, etapa 3c).
 *
 * O dono escreve o texto (`groups/{id}.welcome`); quem entra vê um cartão
 * no topo do chat até tocar em "Entendi". O "já vi" mora na parte PRIVADA
 * da conta (`userPrivate/{uid}.welcomeSeen.{groupId}`): vale no PC e no
 * celular, e ninguém mais sabe o que eu li. A leitura é ao vivo, em
 * lib/private-prefs.ts.
 */

export const MAX_WELCOME = 500;

export function welcomeProblem(texto: string): string | null {
  return texto.trim().length > MAX_WELCOME ? `As boas-vindas vão até ${MAX_WELCOME} caracteres.` : null;
}

export async function markWelcomeSeen(uid: string, groupId: string): Promise<void> {
  await setDoc(doc(db, 'userPrivate', uid), { welcomeSeen: { [groupId]: true } }, { merge: true });
}
