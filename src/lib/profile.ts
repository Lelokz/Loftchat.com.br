import { updateProfile } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';

import { db } from './firebase';
import { initials } from './format';
import type { CardColorId, NameFontId } from './person-theme';
import { MAX_BIO, MAX_DISPLAY_NAME } from '../types/models';

/** O que Configurações → Perfil grava de uma vez (o `@` tem caminho próprio). */
export interface ProfileEdit {
  displayName: string;
  bio: string;
  accentId: CardColorId;
  fontId: NameFontId;
}

/** O problema do nome de exibição, ou null se está bom. */
export function displayNameProblem(nome: string): string | null {
  const limpo = nome.trim();
  if (limpo === '') return 'O nome de exibição não pode ficar vazio.';
  if (limpo.length > MAX_DISPLAY_NAME) return `O nome de exibição vai até ${MAX_DISPLAY_NAME} letras.`;
  return null;
}

export function bioProblem(bio: string): string | null {
  return bio.length > MAX_BIO ? `A bio vai até ${MAX_BIO} caracteres.` : null;
}

/**
 * Grava o perfil público E o nome na conta do Firebase Auth.
 *
 * Os dois, porque o login regrava `users/{uid}.displayName` a partir da
 * conta: mudar só o documento faria o nome antigo voltar no próximo login.
 */
export async function saveProfile(user: User, edit: ProfileEdit): Promise<void> {
  const displayName = edit.displayName.trim();
  const problema = displayNameProblem(displayName) ?? bioProblem(edit.bio);
  if (problema !== null) throw new Error(problema);

  await updateDoc(doc(db, 'users', user.uid), {
    displayName,
    initials: initials(displayName),
    bio: edit.bio.trim(),
    accentId: edit.accentId,
    fontId: edit.fontId,
  });
  if (user.displayName !== displayName) await updateProfile(user, { displayName });
}
