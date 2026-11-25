import './dm-chat.css';

import { avatarEl, el, iconEl } from '../../lib/dom';
import { cameraIcon, menuIcon, peopleIcon, phoneIcon } from '../../lib/icons';
import { panelToggleButton } from './chat';

/** Quem é o outro lado do PV — o cabeçalho não sabe de `UserProfile`, só disto. */
export interface DmFriendView {
  uid: string;
  displayName: string;
  initials: string;
  photo?: string | undefined;
  nameColor?: string | undefined;
  /** Sem a arroba. Ausente = a pessoa ainda não escolheu `@` (cadastro antigo). */
  username?: string;
}

export interface DmChatProps {
  friend: DmFriendView;
  /** Gaveta do mobile (a coluna 2 vira a lista de amigos/conversas). */
  onOpenChannels: () => void;
  /**
   * Gaveta do mobile para o painel da direita (etapa 19: perfil + fixadas).
   * No desktop ele já é sempre visível na coluna 4 — mesma ideia do
   * `onOpenMembers` de `chat.ts`, com o painel diferente do lado de lá.
   */
  onOpenPanel: () => void;
  /** Etapa 5d: no computador, mostra/esconde o painel da direita. */
  onTogglePanel: () => void;
  /** 0.9.5: ligar (de voz ou com câmera). Ausente = sem botões (bloqueado). */
  onLigar?: (comCamera: boolean) => void;
}

/**
 * Coluna 3 — a área central quando um PV está aberto.
 *
 * Casca IRMÃ de `chat.ts`, não uma condição a mais dentro dela: PV não tem
 * `Channel` (nem `kind`, nem `groupId`), e fingir um só para reaproveitar o
 * cabeçalho de lá seria criar a mesma entidade que a modelagem (etapa 18)
 * decidiu não ter. O que É reaproveitado, sem mudar uma linha, é a lista de
 * mensagens e o composer — ver `message-list.ts`/`composer.ts`.
 *
 * Mesmo padrão de montagem de `chat.ts`: a casca nasce uma vez por PESSOA, e
 * só os slots trocam por fora — texto no composer não pode sumir a cada
 * mensagem que chega.
 */
export interface DmChatParts {
  element: HTMLElement;
  messagesSlot: HTMLElement;
  /**
   * Recebe a faixa de chamada de GRUPO em andamento, só no mobile — mesma
   * regra de `chat.ts`: no desktop ela já mora na coluna 2 (home-column),
   * que aqui continua sendo a lista de amigos/conversas por trás do PV.
   */
  callBarSlot: HTMLElement;
  replySlot: HTMLElement;
  /**
   * Recebe o composer normal, OU o aviso de bloqueio — é o `app.ts` quem
   * decide qual, olhando `state.blockedUids`. Fica em slot, e não fixo na
   * casca, porque bloquear/desbloquear pode acontecer com o PV já aberto, e
   * reconstruir a casca inteira apagaria o texto que a pessoa estava
   * digitando.
   */
  composerSlot: HTMLElement;
}

export function renderDmChat(props: DmChatProps): DmChatParts {
  const { friend } = props;
  const messagesSlot = el('div', { class: 'chat__messages-slot' });
  const callBarSlot = el('div', { class: 'chat__callbar-slot' });
  const replySlot = el('div', { class: 'chat__reply-slot' });
  const composerSlot = el('div', { class: 'dm-chat__composer-slot' });

  const backButton = el(
    'button',
    {
      class: 'icon-button chat__mobile-button chat__mobile-button--left',
      type: 'button',
      title: 'Voltar',
    },
    [iconEl(menuIcon(18)), el('span', { class: 'sr-only' }, ['Voltar'])],
  );
  backButton.addEventListener('click', props.onOpenChannels);

  const panelButton = el(
    'button',
    {
      class: 'icon-button chat__mobile-button chat__mobile-button--right',
      type: 'button',
      title: 'Abrir perfil',
    },
    [iconEl(peopleIcon(18)), el('span', { class: 'sr-only' }, ['Abrir perfil'])],
  );
  panelButton.addEventListener('click', props.onOpenPanel);

  const header = el('header', { class: 'chat__header' }, [
    backButton,
    avatarEl(friend.initials, 'sm', 'dm-chat__avatar', friend.photo, friend.uid),
    el('div', { class: 'dm-chat__identity' }, [
      el('h1', { class: 'chat__title dm-chat__name' }, [friend.displayName]),
      friend.username === undefined || friend.username === ''
        ? false
        : el('span', { class: 'dm-chat__handle' }, [`@${friend.username}`]),
    ]),
    ...botoesDeLigar(props),
    panelToggleButton(props.onTogglePanel),
    panelButton,
  ]);

  return {
    element: el('main', { class: 'chat' }, [header, messagesSlot, callBarSlot, replySlot, composerSlot]),
    messagesSlot,
    callBarSlot,
    replySlot,
    composerSlot,
  };
}

/**
 * O aviso que substitui o composer quando EU bloqueei a pessoa.
 *
 * Só este lado sabe — a regra (`blocks.read: resource.data.uid == uid()`)
 * nem deixa a outra pessoa descobrir que foi bloqueada por aqui. Do lado
 * dela, mandar mensagem simplesmente falha com o erro neutro de sempre (ver
 * `sendDmMessage`) — nenhum aviso especial, de propósito (item 5 da etapa 18).
 */
export function renderDmBlockedNotice(friendName: string): HTMLElement {
  return el('p', { class: 'dm-chat__blocked', role: 'status' }, [
    `Você bloqueou ${friendName}. Desbloqueie na aba Bloqueados para voltar a conversar.`,
  ]);
}

/** 0.9.5: "Ligar" e "Ligar com câmera" no topo do PV. */
function botoesDeLigar(props: DmChatProps): HTMLElement[] {
  const ligar = props.onLigar;
  if (ligar === undefined) return [];
  const botao = (comCamera: boolean): HTMLElement => {
    const rotulo = comCamera ? 'Ligar com câmera' : 'Ligar';
    const b = el('button', { class: 'icon-button dm-chat__ligar', type: 'button', title: rotulo }, [
      iconEl(comCamera ? cameraIcon(19) : phoneIcon(19)),
      el('span', { class: 'sr-only' }, [rotulo]),
    ]);
    b.addEventListener('click', () => ligar(comCamera));
    return b;
  };
  return [botao(false), botao(true)];
}
