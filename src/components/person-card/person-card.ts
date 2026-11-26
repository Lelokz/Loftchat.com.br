import type { Brilho } from '../../lib/brilho';
import './person-card.css';

import { avatarEl, el } from '../../lib/dom';
import { applyPersonLook } from '../../lib/person-theme';
import { activeStatus, linkLabel } from '../../lib/profile-extras';
import type { CustomStatus } from '../../lib/profile-extras';

export interface PersonCardData {
  displayName: string;
  initials: string;
  username?: string | undefined;
  /** Linha pequena embaixo do nome no lugar do `@` (o cartão do GRUPO usa: "3 membros"). */
  subtitle?: string | undefined;
  bio?: string | undefined;
  accentId?: string | undefined;
  fontId?: string | undefined;
  /** Imagens já validadas (lib/images.ts) — ausentes = cor do cartão e iniciais. */
  photo?: string | undefined;
  banner?: string | undefined;
  cardBg?: string | undefined;
  /** Etapa 2d. O status vencido não aparece. */
  customStatus?: CustomStatus | undefined;
  links?: string[] | undefined;
  /** 0.12.0: a fileira de insígnias, logo embaixo do nome. */
  insignias?: HTMLElement | false | undefined;
  /** 0.12.5: o nome que brilha (insígnia especial). */
  brilho?: Brilho | undefined;
}

/** "😴 dormindo" — a linha do status, ou null se não há (ou venceu). */
export function statusLine(status: CustomStatus | undefined, extraClass: string): HTMLElement | null {
  const vale = activeStatus(status);
  if (vale === undefined) return null;
  const texto = vale.text.trim();
  return el('span', { class: `person-status ${extraClass}`, title: texto }, [
    vale.emoji !== '' && el('span', { class: 'person-status__emoji', 'aria-hidden': texto === '' ? 'false' : 'true' }, [vale.emoji]),
    texto !== '' && el('span', { class: 'person-status__text' }, [texto]),
  ]);
}

/**
 * O CARTÃO DE UMA PESSOA (proposta A): faixa no alto na cor dela, avatar
 * por cima da faixa, nome grande na fonte dela, `@` embaixo e a bio.
 *
 * É a mesma peça na prévia de Configurações → Perfil e no PV — o que a
 * pessoa vê enquanto edita é exatamente o que os amigos veem.
 */
export function renderPersonCard(
  data: PersonCardData,
  extra: HTMLElement[] = [],
  avatarClass = 'person-card__avatar',
): HTMLElement {
  const nome = el('span', { class: `person-card__name${data.brilho === undefined ? '' : ` nome-brilho nome-brilho--${data.brilho}`}` }, [data.displayName]);
  const bio = data.bio?.trim() ?? '';

  const banner = el('div', { class: 'person-card__banner', 'aria-hidden': 'true' });
  if (data.banner) banner.style.backgroundImage = `url("${data.banner}")`;

  const card = el('div', { class: `person-card${data.cardBg ? ' person-card--fundo' : ''}` }, [
    banner,
    el('div', { class: 'person-card__body' }, [
      avatarEl(data.initials, 'xl', `${avatarClass}${data.brilho === 'roxo' ? ' avatar--criador' : ''}`, data.photo),
      el('div', { class: 'person-card__identity' }, [
        nome,
        data.username !== undefined &&
          data.username !== '' &&
          el('span', { class: 'person-card__handle' }, [`@${data.username}`]),
        data.subtitle !== undefined && el('span', { class: 'person-card__handle' }, [data.subtitle]),
      ]),
      data.insignias ?? false,
      statusLine(data.customStatus, 'person-card__status') ?? false,
      bio !== '' && el('p', { class: 'person-card__bio' }, [bio]),
      (data.links?.length ?? 0) > 0 &&
        el(
          'ul',
          { class: 'person-card__links', 'aria-label': 'Links' },
          (data.links ?? []).map((link) =>
            el('li', {}, [
              el('a', { class: 'person-card__link', href: link, target: '_blank', rel: 'noopener noreferrer nofollow' }, [
                linkLabel(link),
              ]),
            ]),
          ),
        ),
      ...extra,
    ]),
  ]);

  applyPersonLook(card, nome, data);
  // O fundo entra como variável: o CSS põe um véu escuro por cima, para o
  // texto continuar legível sobre qualquer imagem.
  if (data.cardBg) card.style.setProperty('--card-fundo', `url("${data.cardBg}")`);
  return card;
}
