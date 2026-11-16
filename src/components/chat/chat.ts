import './chat.css';

import { el, iconEl } from '../../lib/dom';
import { menuIcon, panelRightIcon, peopleIcon, pinIcon, speakerIcon } from '../../lib/icons';
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
  /** Etapa 5d: no computador, mostra/esconde o painel da direita (guardado na conta). */
  onTogglePanel: () => void;
  /** Fixadas DESTE canal. O ícone existe sempre; o número só aparece quando há alguma. */
  pinnedCount: number;
  onOpenPins: () => void;
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
  /**
   * Atualiza só o TÍTULO (nome e emoji do canal, etapa 3b) — a casca do chat
   * não é remontada quando o canal é renomeado, para não apagar o que está
   * sendo digitado.
   */
  setTitle: (channel: Channel | null) => void;
  /** Topo do chat: o cartão de boas-vindas do grupo (etapa 3c), quando houver. */
  welcomeSlot: HTMLElement;
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
  /**
   * Atualiza só o número no ícone de fixadas, sem reconstruir o cabeçalho —
   * a casca nasce uma vez por canal, mas quantas fixadas existem muda ao
   * vivo, sem trocar de canal nenhuma.
   */
  setPinnedCount: (count: number) => void;
}

export function renderChat(props: ChatProps): ChatParts {
  const { channel, onSend } = props;
  const messagesSlot = el('div', { class: 'chat__messages-slot' });
  const callBarSlot = el('div', { class: 'chat__callbar-slot' });

  const pin = pinButton(props.pinnedCount, props.onOpenPins);
  const titulo = el('h1', { class: 'chat__title' });
  const setTitle = (canal: Channel | null): void => {
    titulo.textContent = canal === null ? 'Nenhum canal' : canal.emoji !== undefined ? `${canal.emoji} ${canal.name}` : canal.name;
    // A dica da caixa de mensagem acompanha o nome novo.
    const caixa = titulo.closest('.chat')?.querySelector<HTMLTextAreaElement>('.composer__input');
    if (caixa !== null && caixa !== undefined && canal !== null) {
      caixa.placeholder = `Mensagem para #${canal.name}`;
      caixa.setAttribute('aria-label', `Mensagem para ${canal.name}`);
    }
  };
  setTitle(channel);

  const header = el('header', { class: 'chat__header' }, [
    drawerButton('Abrir canais', menuIcon(18), props.onOpenChannels, 'left'),
    channel === null || channel.kind === 'text'
      ? el('span', { class: 'chat__hash', 'aria-hidden': 'true' }, ['#'])
      : iconEl(speakerIcon(16), 'icon chat__hash'),
    titulo,
    pin.element,
    panelToggleButton(props.onTogglePanel),
    drawerButton('Abrir membros', peopleIcon(18), props.onOpenMembers, 'right'),
  ]);

  const replySlot = el('div', { class: 'chat__reply-slot' });
  const welcomeSlot = el('div', { class: 'chat__welcome-slot' });

  // Sem canal de texto não há o que compor nem o que listar.
  if (channel === null) {
    return {
      element: el('main', { class: 'chat' }, [header, welcomeSlot, renderNoChannel()]),
      messagesSlot,
      callBarSlot,
      replySlot,
      setPinnedCount: pin.setCount,
    setTitle,
    welcomeSlot,
    };
  }

  return {
    element: el('main', { class: 'chat' }, [
      header,
      welcomeSlot,
      messagesSlot,
      callBarSlot,
      replySlot,
      renderComposer({ channelName: channel.name, onSend }),
    ]),
    messagesSlot,
    callBarSlot,
    replySlot,
    setPinnedCount: pin.setCount,
    setTitle,
    welcomeSlot,
  };
}

/** Ícone de pin no cabeçalho — abre o painel flutuante (etapa 19). O número só aparece quando há fixadas. */
function pinButton(
  initialCount: number,
  onClick: () => void,
): { element: HTMLElement; setCount: (count: number) => void } {
  const countEl = el('span', { class: 'chat__pin-count' }, [String(initialCount)]);
  countEl.hidden = initialCount === 0;

  const button = el(
    'button',
    { class: 'icon-button chat__pin-button', type: 'button', title: 'Mensagens fixadas' },
    [iconEl(pinIcon(16)), countEl, el('span', { class: 'sr-only' }, ['Mensagens fixadas'])],
  );
  button.addEventListener('click', onClick);

  return {
    element: button,
    setCount: (count: number) => {
      countEl.hidden = count === 0;
      countEl.textContent = String(count);
    },
  };
}

/**
 * MOSTRAR/ESCONDER O PAINEL DA DIREITA (etapa 5d) — só no computador (no
 * celular o painel é gaveta e quem abre é o botão de pessoas). Apertado =
 * painel à mostra; quem mantém o `aria-pressed` em dia é o app.
 */
export function panelToggleButton(onClick: () => void): HTMLElement {
  const visivel = document.documentElement.dataset['painel'] !== 'escondido';
  const button = el(
    'button',
    {
      class: 'icon-button chat__panel-button',
      type: 'button',
      title: 'Mostrar ou esconder o painel da direita',
      'aria-label': 'Painel da direita',
      'aria-pressed': String(visivel),
    },
    [iconEl(panelRightIcon(18))],
  );
  button.addEventListener('click', onClick);
  return button;
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
