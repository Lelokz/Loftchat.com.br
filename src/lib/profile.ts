import { updateProfile } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { deleteField, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

import { db } from './firebase';
import { initials } from './format';
import { safeImage } from './images';
import type { CardColorId, NameFontId } from './person-theme';
import { MAX_BIO, MAX_DISPLAY_NAME } from '../types/models';

/** O que Configurações → Perfil grava de uma vez (o `@` tem caminho próprio). */
export interface ProfileEdit {
  displayName: string;
  bio: string;
  accentId: CardColorId;
  fontId: NameFontId;
  /** Imagens já recortadas (data URL); '' = sem imagem. */
  photo: string;
  banner: string;
  cardBg: string;
}

export interface ProfileArt {
  banner?: string;
  cardBg?: string;
}

/** Banner e fundo do cartão de alguém — documento à parte, lido só para mostrar o cartão. */
export async function loadProfileArt(uid: string): Promise<ProfileArt> {
  const snap = await getDoc(doc(db, 'profileArt', uid));
  if (!snap.exists()) return {};
  const banner = safeImage(snap.get('banner'), 'banner');
  const cardBg = safeImage(snap.get('cardBg'), 'fundo');
  return {
    ...(banner === undefined ? {} : { banner }),
    ...(cardBg === undefined ? {} : { cardBg }),
  };
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
export async function saveProfile(
  user: User,
  edit: ProfileEdit,
  artChanged: boolean,
): Promise<void> {
  const displayName = edit.displayName.trim();
  const problema = displayNameProblem(displayName) ?? bioProblem(edit.bio);
  if (problema !== null) throw new Error(problema);

  await updateDoc(doc(db, 'users', user.uid), {
    displayName,
    initials: initials(displayName),
    bio: edit.bio.trim(),
    accentId: edit.accentId,
    fontId: edit.fontId,
    photo: edit.photo === '' ? deleteField() : edit.photo,
  });
  if (artChanged) {
    await setDoc(
      doc(db, 'profileArt', user.uid),
      {
        banner: edit.banner === '' ? deleteField() : edit.banner,
        cardBg: edit.cardBg === '' ? deleteField() : edit.cardBg,
      },
      { merge: true },
    );
  }
  if (user.displayName !== displayName) await updateProfile(user, { displayName });
}
