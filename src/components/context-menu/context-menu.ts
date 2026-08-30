import './context-menu.css';

import { el } from '../../lib/dom';

/**
 * Menu de contexto — o primitivo único de menu do app.
 *
 * DUAS DECISÕES QUE VALEM O ARQUIVO INTEIRO:
 *
 * 1. É montado em `document.body`, nunca dentro do elemento que o abriu. O
 *    `app.ts` troca COLUNAS INTEIRAS com replaceWith a cada mudança de estado;
 *    um menu ancorado numa coluna some do documento no meio do uso, e os
 *    listeners globais ficam vivos apontando para um nó órfão. Era exatamente o
 *    defeito do antigo group-menu.
 *
 * 2. É singleton. Abrir um fecha o outro, sempre — inclusive entre o menu do
 *    cabeçalho e o do botão direito, que agora são o mesmo componente.
 */

export interface MenuItem {
  label: string;
  onSelect: () => void;
  /**
   * Visível mas travado, com o motivo no `title`.
   *
   * A regra geral do app é esconder o que a pessoa não pode fazer. A exceção é
   * quando esconder esconderia a EXPLICAÇÃO — o dono que não pode sair do
   * próprio grupo, o último canal de texto que não pode ser apagado.
   */
  disabled?: boolean;
  reason?: string;
  /** Destrutivo: vermelho, e por convenção sempre no fim. */
  danger?: boolean;
  separatorBefore?: boolean;
}

/** Onde ancorar: no cursor, ou colado a um elemento. */
export type MenuAnchor = { x: number; y: number } | { rect: DOMRect };

/** Distância mínima da borda da janela. */
const MARGIN = 8;

let closeCurrent: (() => void) | null = null;

export function closeMenu(): void {
  closeCurrent?.();
}

export function isMenuOpen(): boolean {
  return closeCurrent !== null;
}

export function openMenu(anchor: MenuAnchor, items: MenuItem[]): void {
  closeMenu();
  if (items.length === 0) return;

  // Devolver o foco para onde ele estava é o que impede o menu de "engolir" a
  // navegação por teclado — sem isso o foco volta para o <body>.
  const previousFocus = document.activeElement as HTMLElement | null;

  const buttons: HTMLButtonElement[] = [];
  const nodes: HTMLElement[] = [];

  for (const item of items) {
    if (item.separatorBefore === true && nodes.length > 0) {
      nodes.push(el('hr', { class: 'context-menu__separator' }));
    }

    const button = el(
      'button',
      {
        class: `context-menu__item${item.danger === true ? ' context-menu__item--danger' : ''}`,
        type: 'button',
        role: 'menuitem',
        title: item.reason,
      },
      [item.label],
    );

    if (item.disabled === true) {
      button.disabled = true;
      // Botão desabilitado não recebe foco, então o leitor de tela perderia o
      // motivo junto. O aria-disabled mantém o item anunciável.
      button.setAttribute('aria-disabled', 'true');
    } else {
      button.addEventListener('click', () => {
        close();
        item.onSelect();
      });
      buttons.push(button);
    }

    nodes.push(button);
  }

  const menu = el('div', { class: 'context-menu', role: 'menu', tabindex: '-1' }, nodes);

  function close(): void {
    menu.remove();
    document.removeEventListener('mousedown', onOutside, true);
    document.removeEventListener('keydown', onKey, true);
    // `true` na captura: rolagem em qualquer região (a lista de mensagens é a
    // única que rola) fecha o menu, senão ele fica flutuando longe do alvo.
    document.removeEventListener('scroll', close, true);
    window.removeEventListener('resize', close);
    window.removeEventListener('blur', close);
    if (closeCurrent === close) closeCurrent = null;
    previousFocus?.focus();
  }

  function onOutside(event: MouseEvent): void {
    if (!menu.contains(event.target as Node)) close();
  }

  function move(delta: number): void {
    if (buttons.length === 0) return;
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = (at + delta + buttons.length) % buttons.length;
    buttons[at === -1 && delta < 0 ? buttons.length - 1 : next]?.focus();
  }

  function onKey(event: KeyboardEvent): void {
    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        close();
        break;
      case 'ArrowDown':
        event.preventDefault();
        move(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        move(-1);
        break;
      case 'Home':
        event.preventDefault();
        buttons[0]?.focus();
        break;
      case 'End':
        event.preventDefault();
        buttons[buttons.length - 1]?.focus();
        break;
      default:
        break;
    }
  }

  // Precisa estar no documento para ter tamanho — só depois dá para corrigir a
  // posição. Fica invisível nesse meio tempo para não piscar no canto errado.
  menu.style.visibility = 'hidden';
  document.body.append(menu);
  position(menu, anchor);
  menu.style.visibility = '';

  document.addEventListener('mousedown', onOutside, true);
  document.addEventListener('keydown', onKey, true);
  document.addEventListener('scroll', close, true);
  window.addEventListener('resize', close);
  window.addEventListener('blur', close);
  closeCurrent = close;

  (buttons[0] ?? menu).focus();
}

/**
 * Encosta o menu no ponto pedido e puxa de volta para dentro da janela.
 *
 * Abrir perto da borda direita ou de baixo é o caso comum, não o excepcional: a
 * lista de membros e a barra de composição ficam justamente ali.
 */
function position(menu: HTMLElement, anchor: MenuAnchor): void {
  const size = menu.getBoundingClientRect();
  const maxX = window.innerWidth - size.width - MARGIN;
  const maxY = window.innerHeight - size.height - MARGIN;

  let x: number;
  let y: number;

  if ('rect' in anchor) {
    // Ancorado num botão: abre logo abaixo, alinhado pela esquerda dele.
    x = anchor.rect.left;
    y = anchor.rect.bottom + 4;
    // Não cabendo abaixo, abre para cima em vez de encavalar o botão.
    if (y > maxY) y = anchor.rect.top - size.height - 4;
  } else {
    x = anchor.x;
    y = anchor.y;
  }

  menu.style.left = `${Math.max(MARGIN, Math.min(x, maxX))}px`;
  menu.style.top = `${Math.max(MARGIN, Math.min(y, maxY))}px`;
}
