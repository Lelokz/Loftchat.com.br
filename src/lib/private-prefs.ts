import { deleteField, doc, onSnapshot, setDoc } from 'firebase/firestore';

import { db } from './firebase';

/**
 * PREFERÊNCIAS PRIVADAS da conta (`userPrivate/{uid}`), escutadas AO VIVO:
 * mudar no PC aparece no celular sem recarregar. Só a própria pessoa lê e
 * escreve (firestore.rules).
 *
 *  - `welcomeSeen.{groupId}: true` — boas-vindas já dispensadas (etapa 3c);
 *  - `groupLabels.{groupId}` — como EU chamo o grupo na aba (etapa 3d):
 *    um apelido, ou '' para "sem nome" (só o ícone). Ausente = o nome do grupo.
 */

export const MAX_GROUP_LABEL = 32;

export interface PrivatePrefs {
  welcomeSeen: Set<string>;
  groupLabels: Map<string, string>;
}

export function watchPrivatePrefs(uid: string, onPrefs: (prefs: PrivatePrefs) => void): () => void {
  return onSnapshot(
    doc(db, 'userPrivate', uid),
    (snap) => {
      const vistos = snap.exists() ? snap.get('welcomeSeen') : undefined;
      const rotulos = snap.exists() ? snap.get('groupLabels') : undefined;
      const welcomeSeen = new Set<string>();
      const groupLabels = new Map<string, string>();
      if (typeof vistos === 'object' && vistos !== null) {
        for (const [id, v] of Object.entries(vistos as Record<string, unknown>)) if (v === true) welcomeSeen.add(id);
      }
      if (typeof rotulos === 'object' && rotulos !== null) {
        for (const [id, v] of Object.entries(rotulos as Record<string, unknown>)) {
          if (typeof v === 'string') groupLabels.set(id, v.slice(0, MAX_GROUP_LABEL));
        }
      }
      onPrefs({ welcomeSeen, groupLabels });
    },
    // Sem rede ou sem permissão: segue com tudo vazio (nada quebra).
    () => onPrefs({ welcomeSeen: new Set(), groupLabels: new Map() }),
  );
}

/**
 * Grava os rótulos que mudaram: texto = apelido, '' = sem nome, null = voltar
 * ao nome do grupo (apaga a chave).
 */
export async function saveGroupLabels(uid: string, mudancas: Map<string, string | null>): Promise<void> {
  if (mudancas.size === 0) return;
  const groupLabels: Record<string, unknown> = {};
  for (const [id, valor] of mudancas) groupLabels[id] = valor === null ? deleteField() : valor.trim().slice(0, MAX_GROUP_LABEL);
  await setDoc(doc(db, 'userPrivate', uid), { groupLabels }, { merge: true });
}

/** O nome que a aba mostra: apelido, o nome do grupo, ou null para só o ícone. */
export function tabLabel(groupName: string, label: string | undefined): string | null {
  if (label === undefined) return groupName;
  const limpo = label.trim();
  return limpo === '' ? null : limpo;
}
