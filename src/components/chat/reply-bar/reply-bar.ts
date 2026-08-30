import './reply-bar.css';

import { el, iconEl } from '../../../lib/dom';
import { closeIcon } from '../../../lib/icons';
import type { ReplyTo } from '../../../types/models';

export interface ReplyBarProps {
  replyTo: ReplyTo;
  onCancel: () => void;
}

/**
 * "Respondendo a fulano", acima do composer.
 *
 * Mostra a quem e o começo do quê ANTES de enviar. Sem ela, a única forma de
 * saber que a próxima mensagem sairia como resposta seria lembrar de ter
 * clicado no menu — e responder a mensagem errada é constrangedor de um jeito
 * que não dá para desfazer depois.
 */
export function renderReplyBar({ replyTo, onCancel }: ReplyBarProps): HTMLElement {
  const cancelar = el('button', {
    class: 'icon-button reply-bar__close',
    type: 'button',
    title: 'Cancelar resposta',
    'aria-label': 'Cancelar resposta',
  });
  cancelar.append(iconEl(closeIcon(16), 'icon'));
  cancelar.addEventListener('click', onCancel);

  return el('div', { class: 'reply-bar' }, [
    el('div', { class: 'reply-bar__body' }, [
      el('span', { class: 'reply-bar__label' }, [`Respondendo a ${replyTo.authorName}`]),
      el('span', { class: 'reply-bar__excerpt' }, [replyTo.excerpt]),
    ]),
    cancelar,
  ]);
}
