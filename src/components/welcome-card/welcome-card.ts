import './welcome-card.css';

import { el } from '../../lib/dom';
import type { Group } from '../../types/models';
import { grupoAvatar } from '../group-bar/group-bar';

export interface WelcomeCardOptions {
  group: Pick<Group, 'name' | 'initials' | 'photo' | 'accentId'>;
  text: string;
  /** "Entendi". Ausente na prévia das Configurações (lá o botão não faz nada). */
  onDismiss?: () => void;
}

/**
 * CARTÃO DE BOAS-VINDAS (proposta A, etapa 3c): no topo do chat de quem
 * acabou de entrar, até tocar em "Entendi". Não é pop-up — fica no lugar,
 * não cobre nada e não rouba o foco.
 */
export function renderWelcomeCard(options: WelcomeCardOptions): HTMLElement {
  const { group, text, onDismiss } = options;
  const entendi = el('button', { class: 'welcome-card__ok', type: 'button' }, ['Entendi']);
  if (onDismiss === undefined) entendi.disabled = true;
  else entendi.addEventListener('click', onDismiss);

  return el('section', { class: 'welcome-card', 'aria-label': `Boas-vindas a ${group.name}` }, [
    grupoAvatar({ id: '', ownerId: '', createdAt: '', ...group }, 'xl', 'welcome-card__avatar'),
    el('div', { class: 'welcome-card__body' }, [
      el('h2', { class: 'welcome-card__title' }, [`Boas-vindas a ${group.name}!`]),
      el('p', { class: 'welcome-card__text' }, [text.trim()]),
      entendi,
    ]),
  ]);
}
