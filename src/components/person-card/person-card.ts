import './person-card.css';

import { avatarEl, el } from '../../lib/dom';
import { applyPersonLook } from '../../lib/person-theme';

export interface PersonCardData {
  displayName: string;
  initials: string;
  username?: string | undefined;
  bio?: string | undefined;
  accentId?: string | undefined;
  fontId?: string | undefined;
}

/**
 * O CARTÃO DE UMA PESSOA (proposta A): faixa no alto na cor dela, avatar
 * por cima da faixa, nome grande na fonte dela, `@` embaixo e a bio.
 *
 * É a mesma peça na prévia de Configurações → Perfil e no PV — o que a
 * pessoa vê enquanto edita é exatamente o que os amigos veem.
 */
export function renderPersonCard(data: PersonCardData, extra: HTMLElement[] = []): HTMLElement {
  const nome = el('span', { class: 'person-card__name' }, [data.displayName]);
  const bio = data.bio?.trim() ?? '';

  const card = el('div', { class: 'person-card' }, [
    el('div', { class: 'person-card__banner', 'aria-hidden': 'true' }),
    el('div', { class: 'person-card__body' }, [
      avatarEl(data.initials, 'xl', 'person-card__avatar'),
      el('div', { class: 'person-card__identity' }, [
        nome,
        data.username !== undefined &&
          data.username !== '' &&
          el('span', { class: 'person-card__handle' }, [`@${data.username}`]),
      ]),
      bio !== '' && el('p', { class: 'person-card__bio' }, [bio]),
      ...extra,
    ]),
  ]);

  applyPersonLook(card, nome, data);
  return card;
}
