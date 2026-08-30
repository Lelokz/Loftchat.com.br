import './splash.css';

import { el, iconEl } from '../../lib/dom';
import { logoIcon } from '../../lib/icons';

/**
 * Tela mostrada enquanto o Firebase ainda não disse quem é o usuário.
 *
 * Existe para não piscar a tela de login na cara de quem já está autenticado:
 * `onAuthStateChanged` leva um instante para responder no carregamento.
 */
export function renderSplash(): HTMLElement {
  return el('div', { class: 'splash' }, [
    el('div', { class: 'splash__mark' }, [iconEl(logoIcon(24))]),
    el('p', { class: 'splash__text' }, ['Carregando…']),
  ]);
}
