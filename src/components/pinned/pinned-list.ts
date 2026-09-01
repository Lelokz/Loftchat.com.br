import './pinned-list.css';

import { el, iconEl } from '../../lib/dom';
import { clipIcon, fileIcon } from '../../lib/icons';
import { formatBytes, formatDayLabel } from '../../lib/format';
import { openModal } from '../modal/modal';
import type { MessageId, PinnedMessage } from '../../types/models';

export type PinReachability = 'carregada' | 'apagada' | 'fora-da-janela';

export interface PinnedListProps {
  /** Já ordenadas por `pinnedAt` decrescente — a lista não reordena sozinha. */
  pins: PinnedMessage[];
  pinnedLoaded: boolean;
  /**
   * Calculado por quem chama (`app.ts`, que tem `state.messages`/
   * `dmMessages`) com a mesma `citationState` que a citação já usa — ver o
   * comentário lá.
   */
  reachabilityOf: (pin: PinnedMessage) => PinReachability;
  /**
   * Dono no grupo, qualquer um dos dois no PV — é UM valor para a lista
   * inteira, não por item: a regra concede a mesma coisa para toda fixada
   * daquele escopo.
   */
  canUnpin: boolean;
  onJumpTo: (messageId: MessageId) => void;
  /** Recebe TODOS os ids do grupo (ver `groupByMessage` abaixo) — apaga todos de uma vez. */
  onUnpin: (pinIds: string[]) => void;
}

interface PinGroup {
  /** A fixada mais recente do grupo — é dela que vem nome/conteúdo/data exibidos. */
  primary: PinnedMessage;
  /** Todos os ids de fixada para este `messageId`. Normalmente um só. */
  ids: string[];
}

/**
 * Agrupa por `messageId`: os DOIS participantes do PV podem fixar a mesma
 * mensagem ao mesmo tempo (cada um com a lista local ainda dizendo "não
 * fixada") — sem transação, a tela mostra UMA fixada por mensagem e
 * desafixar remove todas de uma vez. `pins` já chega ordenada por
 * `pinnedAt` decrescente, então o primeiro encontro de cada `messageId` é
 * sempre o mais recente — é ele que vira `primary`.
 */
function groupByMessage(pins: PinnedMessage[]): PinGroup[] {
  const groups = new Map<string, PinGroup>();
  for (const pin of pins) {
    const existing = groups.get(pin.messageId);
    if (existing === undefined) groups.set(pin.messageId, { primary: pin, ids: [pin.id] });
    else existing.ids.push(pin.id);
  }
  return [...groups.values()];
}

export function renderPinnedList(props: PinnedListProps): HTMLElement {
  const { pins, pinnedLoaded, canUnpin, onJumpTo, onUnpin, reachabilityOf } = props;

  if (!pinnedLoaded) {
    return el('div', { class: 'pinned-list__empty' }, ['Carregando fixadas…']);
  }
  if (pins.length === 0) {
    return el('div', { class: 'pinned-list__empty' }, ['Nenhuma mensagem fixada ainda.']);
  }

  const groups = groupByMessage(pins);

  return el(
    'ul',
    { class: 'pinned-list column-scroll scroll-area' },
    groups.map((group) => item(group, reachabilityOf(group.primary), canUnpin, onJumpTo, onUnpin)),
  );
}

export interface PinnedPanel {
  /** Nó do corpo do modal — `.isConnected` diz se o painel ainda está aberto (fecha por Escape/clique fora/botão, sem avisar quem chamou). */
  element: HTMLElement;
  /** Repinta a lista com props novas — chamado a cada atualização em tempo real enquanto o painel está aberto. */
  update: (props: PinnedListProps) => void;
  close: () => void;
}

/**
 * Painel FLUTUANTE do grupo — o ícone de pin no cabeçalho abre isto.
 *
 * Reaproveita `modal.ts` (não `context-menu.ts`, que só sabe renderizar
 * `{label, onSelect}` — sem slot de conteúdo rico, encaixar aqui seria
 * reescrever a peça). Fecha por Escape, por clique fora (modal.ts, etapa
 * 19) e pelo botão — os três já vêm de graça do `<dialog>` nativo.
 */
export function openPinnedMessagesPanel(initial: PinnedListProps): PinnedPanel {
  const body = el('div', { class: 'pinned-panel-body' }, [renderPinnedList(initial)]);
  const controller = openModal({
    title: 'Mensagens fixadas',
    body,
    confirmLabel: 'Fechar',
    cancelLabel: 'Fechar',
  });
  return {
    element: body,
    update: (props) => body.replaceChildren(renderPinnedList(props)),
    close: () => controller.close(),
  };
}

function item(
  group: PinGroup,
  reachable: PinReachability,
  canUnpin: boolean,
  onJumpTo: (messageId: MessageId) => void,
  onUnpin: (pinIds: string[]) => void,
): HTMLElement {
  const pin = group.primary;

  const header = el('div', { class: 'pinned-item__header' }, [
    el('span', { class: 'pinned-item__author' }, [pin.authorName]),
    el('span', { class: 'pinned-item__date' }, [formatDayLabel(pin.sentAt)]),
  ]);

  const body = content(pin, reachable);

  const row = el('div', { class: 'pinned-item__row' }, [header, body]);

  if (reachable === 'carregada') {
    row.classList.add('pinned-item__row--clickable');
    row.addEventListener('click', () => onJumpTo(pin.messageId));
  }

  const unpinButton =
    canUnpin &&
    el('button', { class: 'pinned-item__unpin', type: 'button', title: 'Desafixar' }, ['Desafixar']);
  if (unpinButton !== false) {
    unpinButton.addEventListener('click', (event) => {
      event.stopPropagation();
      onUnpin(group.ids);
    });
  }

  return el('li', { class: 'pinned-item' }, [row, unpinButton]);
}

/** O conteúdo por `kind` — as seis categorias já renderizam, mesmo que só `'text'` seja alcançável hoje (sem anexo ainda). */
function content(pin: PinnedMessage, reachable: PinReachability): HTMLElement {
  if (reachable === 'apagada') {
    return el('p', { class: 'pinned-item__gone' }, ['mensagem apagada']);
  }

  const nota =
    reachable === 'fora-da-janela'
      ? el('p', { class: 'pinned-item__gone' }, ['antiga demais para abrir aqui'])
      : false;

  if (pin.kind === 'text' || pin.attachment === undefined) {
    return el('div', {}, [el('p', { class: 'pinned-item__text' }, [pin.excerpt]), nota]);
  }

  const attachment = pin.attachment;

  if (pin.kind === 'image' || pin.kind === 'video' || pin.kind === 'gif') {
    return el('div', {}, [
      el('figure', { class: 'pinned-item__thumb' }, [
        el('img', { src: attachment.url, alt: attachment.fileName, loading: 'lazy' }),
      ]),
      pin.excerpt !== '' && el('p', { class: 'pinned-item__text' }, [pin.excerpt]),
      nota,
    ]);
  }

  // 'file' e 'audio': mesmo cartão de arquivo, ícone diferente não muda o layout.
  return el('div', {}, [
    el('div', { class: 'pinned-item__file' }, [
      iconEl(fileIcon(18), 'icon'),
      el('span', { class: 'pinned-item__file-name', title: attachment.fileName }, [
        attachment.fileName,
      ]),
      el('span', { class: 'pinned-item__file-meta' }, [formatBytes(attachment.sizeBytes)]),
      iconEl(clipIcon(14), 'icon'),
    ]),
    nota,
  ]);
}
