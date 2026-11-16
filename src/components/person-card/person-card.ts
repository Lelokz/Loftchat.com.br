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
  /** Imagens já validadas (lib/images.ts) — ausentes = cor do cartão e iniciais. */
  photo?: string | undefined;
  banner?: string | undefined;
  cardBg?: string | undefined;
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

  const banner = el('div', { class: 'person-card__banner', 'aria-hidden': 'true' });
  if (data.banner) banner.style.backgroundImage = `url("${data.banner}")`;

  const card = el('div', { class: `person-card${data.cardBg ? ' person-card--fundo' : ''}` }, [
    banner,
    el('div', { class: 'person-card__body' }, [
      avatarEl(data.initials, 'xl', 'person-card__avatar', data.photo),
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
  // O fundo entra como variável: o CSS põe um véu escuro por cima, para o
  // texto continuar legível sobre qualquer imagem.
  if (data.cardBg) card.style.setProperty('--card-fundo', `url("${data.cardBg}")`);
  return card;
}
