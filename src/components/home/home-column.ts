import './home-column.css';

import { el, iconEl } from '../../lib/dom';
import { peopleIcon } from '../../lib/icons';

export interface HomeColumnProps {
  /** Recebe a faixa de chamada — a mesma dos outros dois pontos de montagem. */
  callBarSlot: HTMLElement;
}

export interface HomeColumnParts {
  element: HTMLElement;
  callBarSlot: HTMLElement;
}

/**
 * Coluna 2 na tela inicial — o lugar da coluna de canais quando não há grupo
 * ativo.
 *
 * O espaço das conversas privadas fica RESERVADO e vazio: elas são a Entrega 2.
 * Deixar o lugar marcado é melhor do que uma coluna que muda de forma na
 * entrega seguinte — e melhor do que fingir que a seção não vai existir.
 */
export function renderHomeColumn(): HomeColumnParts {
  const callBarSlot = el('div', { class: 'home-column__callbar' });

  const amigos = el(
    'button',
    { class: 'home-column__item is-active', type: 'button', 'aria-current': 'true' },
    [iconEl(peopleIcon(18), 'icon home-column__icon'), el('span', {}, ['Amigos'])],
  );

  const element = el('nav', { class: 'home-column column-scroll', 'aria-label': 'Tela inicial' }, [
    el('div', { class: 'home-column__header' }, [
      el('h2', { class: 'home-column__title' }, ['Início']),
    ]),

    el('div', { class: 'home-column__nav' }, [amigos]),

    el('div', { class: 'home-column__section' }, [
      el('span', { class: 'home-column__section-label' }, ['Mensagens diretas']),
      el('p', { class: 'home-column__empty' }, [
        'Suas conversas privadas aparecem aqui.',
      ]),
    ]),

    callBarSlot,
  ]);

  return { element, callBarSlot };
}
