import { deleteField, doc, getDoc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore';

import { db } from './firebase';
import { initials } from './format';
import { safeImage } from './images';
import type { CardColorId } from './person-theme';
import { MAX_GROUP_DESCRIPTION, MAX_GROUP_NAME } from '../types/models';

/**
 * O "PERFIL" DO GRUPO (proposta A, etapa 3a) — o que o dono muda em
 * Configurações do grupo.
 *
 * Foto 256×256 dentro de `groups/{id}` (aparece na aba do grupo, então vem
 * junto com o grupo que já é lido); banner em `groupArt/{id}`, lido só para
 * mostrar o cartão do grupo — mesmo raciocínio do perfil (lib/profile.ts).
 */
export interface GroupEdit {
  name: string;
  description: string;
  accentId: CardColorId;
  /** Data URL já recortada; '' = sem imagem. */
  photo: string;
  banner: string;
}

export async function loadGroupBanner(groupId: string): Promise<string | undefined> {
  const snap = await getDoc(doc(db, 'groupArt', groupId));
  return snap.exists() ? safeImage(snap.get('banner'), 'banner') : undefined;
}

/** Escuta o banner do grupo; devolve a função que para de escutar. */
export function watchGroupBanner(groupId: string, onBanner: (banner: string | undefined) => void): () => void {
  return onSnapshot(
    doc(db, 'groupArt', groupId),
    (snap) => onBanner(snap.exists() ? safeImage(snap.get('banner'), 'banner') : undefined),
    // Saí do grupo ou ele foi apagado: sem banner, sem barulho.
    () => onBanner(undefined),
  );
}

/** O problema do nome do grupo, ou null. O nome é OBRIGATÓRIO. */
export function groupNameProblem(nome: string): string | null {
  const limpo = nome.trim();
  if (limpo === '') return 'O grupo precisa de um nome.';
  if (limpo.length > MAX_GROUP_NAME) return `O nome do grupo vai até ${MAX_GROUP_NAME} letras.`;
  return null;
}

export function groupDescriptionProblem(texto: string): string | null {
  return texto.trim().length > MAX_GROUP_DESCRIPTION
    ? `A descrição vai até ${MAX_GROUP_DESCRIPTION} caracteres.`
    : null;
}

export async function saveGroupProfile(groupId: string, edit: GroupEdit, bannerChanged: boolean): Promise<void> {
  const name = edit.name.trim();
  const problema = groupNameProblem(name) ?? groupDescriptionProblem(edit.description);
  if (problema !== null) throw new Error(problema);
  const description = edit.description.trim();

  await updateDoc(doc(db, 'groups', groupId), {
    name,
    initials: initials(name),
    description: description === '' ? deleteField() : description,
    accentId: edit.accentId,
    photo: edit.photo === '' ? deleteField() : edit.photo,
  });
  if (bannerChanged) {
    await setDoc(doc(db, 'groupArt', groupId), { banner: edit.banner === '' ? deleteField() : edit.banner }, { merge: true });
  }
}
