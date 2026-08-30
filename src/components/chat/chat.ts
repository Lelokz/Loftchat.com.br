import './chat.css';

import { el, iconEl } from '../../lib/dom';
import { menuIcon, peopleIcon, speakerIcon } from '../../lib/icons';
import { renderNoChannel } from '../empty-state/empty-state';
import { renderComposer } from './composer/composer';
import type { Channel } from '../../types/models';

export interface ChatProps {
  /** Canal de TEXTO ativo; `null` quando o grupo não tem canais. */
  channel: Channel | null;
  onSend: (body: string) => Promise<void>;
  /** Gavetas do mobile. Os botões existem sempre; o CSS os esconde no desktop. */
  onOpenChannels: () => void;
  onOpenMembers: () => void;
}

/**
 * Coluna 3 — a área central quando estou lendo um canal de texto.
 *
 * A casca é montada UMA VEZ por canal, com um slot que o `app.ts` troca por
 * fora: o da lista de mensagens. Isso existe porque reconstruir a coluna inteira
 * a cada snapshot apagaria o texto que a pessoa está digitando no composer toda
 * vez que chegasse mensagem.
 *
 * O slot do painel de chamada SAIU. A chamada deixou de ser uma faixa em cima do
 * chat e virou uma sala que ocupa esta coluna inteira — quem alterna entre as
 * duas é o `centerView` do store, não um slot aqui dentro.
 */
export interface ChatParts {
  element: HTMLElement;
  /** Recebe a lista, o estado vazio, o carregando ou o erro de leitura. */
  messagesSlot: HTMLElement;
  /**
   * Recebe a faixa de chamada NO MOBILE, logo acima do composer.
   *
   * No desktop ela mora no rodapé da coluna de canais — que no mobile vira
   * gaveta, e a faixa ficaria invisível justamente durante uma chamada.
   */
  callBarSlot: HTMLElement;
  /**
   * Recebe a faixa de "respondendo a…", logo acima do composer.
   *
   * Slot, e não conteúdo montado aqui, pelo mesmo motivo do slot de mensagens:
   * a casca do chat é montada UMA VEZ por canal, e reconstruí-la para mostrar a
   * citação apagaria o que a pessoa já tivesse digitado.
   */
  replySlot: HTMLElement;
}

export function renderChat(props: ChatProps): ChatParts {
  const { channel, onSend } = props;
  const messagesSlot = el('div', { class: 'chat__messages-slot' });
  const callBarSlot = el('div', { class: 'chat__callbar-slot' });

  const header = el('header', { class: 'chat__header' }, [
    drawerButton('Abrir canais', menuIcon(18), props.onOpenChannels, 'left'),
    channel === null || channel.kind === 'text'
      ? el('span', { class: 'chat__hash', 'aria-hidden': 'true' }, ['#'])
      : iconEl(speakerIcon(16), 'icon chat__hash'),
    el('h1', { class: 'chat__title' }, [channel?.name ?? 'Nenhum canal']),
    drawerButton('Abrir membros', peopleIcon(18), props.onOpenMembers, 'right'),
  ]);

  const replySlot = el('div', { class: 'chat__reply-slot' });

  // Sem canal de texto não há o que compor nem o que listar.
  if (channel === null) {
    return {
      element: el('main', { class: 'chat' }, [header, renderNoChannel()]),
      messagesSlot,
      callBarSlot,
      replySlot,
    };
  }

  return {
    element: el('main', { class: 'chat' }, [
      header,
      messagesSlot,
      callBarSlot,
      replySlot,
      renderComposer({ channelName: channel.name, onSend }),
    ]),
    messagesSlot,
    callBarSlot,
    replySlot,
  };
}

/**
 * Botão de gaveta. Existe SEMPRE no DOM e some por CSS acima de 720px.
 *
 * Um caminho de código só: renderizar coisas diferentes por modo duplicaria o
 * render e poria o desktop em risco, que é justamente o que não pode acontecer.
 */
function drawerButton(
  label: string,
  icon: string,
  onClick: () => void,
  side: 'left' | 'right',
): HTMLElement {
  const button = el(
    'button',
    {
      class: `icon-button chat__mobile-button chat__mobile-button--${side}`,
      type: 'button',
      title: label,
    },
    [iconEl(icon), el('span', { class: 'sr-only' }, [label])],
  );
  button.addEventListener('click', onClick);
  return button;
}
