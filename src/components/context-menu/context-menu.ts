import './context-menu.css';

import { el, iconEl } from '../../lib/dom';

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
  /** 0.10.0: item "rico" — ícone (SVG de icons.ts) e uma linha explicando. */
  icon?: string;
  hint?: string;
  /** 0.11.0: abre um submenu ao lado (no celular, vira a folha com estes itens). */
  submenu?: MenuItem[];
  /** Título da folha do submenu no celular ("Silenciar #anúncios"). */
  submenuTitulo?: string;
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

/** 0.11.0: extras do menu da mensagem — a fileira de reações e a folha do celular. */
export interface MenuExtras {
  emojis?: { lista: string[]; minhas: string[]; aoEscolher: (emoji: string) => void; aoMais: (perto: DOMRect) => void; iconeMais: string };
  /** Aberto por toque longo: vira uma folha embaixo da tela. */
  folha?: boolean;
  /** Aberto por toque (submenu vira folha). */
  toque?: boolean;
  /** Título pequeno em cima (a folha do submenu: "Silenciar #anúncios"). */
  titulo?: string;
}

export function openMenu(anchor: MenuAnchor, items: MenuItem[], extras: MenuExtras = {}): void {
  closeMenu();
  if (items.length === 0) return;

  // Devolver o foco para onde ele estava é o que impede o menu de "engolir" a
  // navegação por teclado — sem isso o foco volta para o <body>.
  const previousFocus = document.activeElement as HTMLElement | null;

  const buttons: HTMLButtonElement[] = [];
  const nodes: HTMLElement[] = [];
  // 0.11.0: o submenu aberto agora (ao lado do item).
  let filho: HTMLElement | null = null;
  const fecharFilho = (): void => {
    filho?.remove();
    filho = null;
  };
  if (extras.titulo !== undefined) nodes.push(el('div', { class: 'context-menu__titulo' }, [extras.titulo]));

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
      item.icon === undefined && item.hint === undefined
        ? [item.label]
        : [
            item.icon === undefined ? null : el('span', { class: 'context-menu__icone', 'aria-hidden': 'true' }, [iconEl(item.icon)]),
            el('span', { class: 'context-menu__textos' }, [
              el('b', {}, [item.label]),
              item.hint === undefined ? null : el('small', {}, [item.hint]),
            ]),
          ],
    );
    if (item.icon !== undefined || item.hint !== undefined) button.classList.add('context-menu__item--rico');

    if (item.submenu !== undefined && item.disabled !== true) {
      const sub = item.submenu;
      button.classList.add('context-menu__item--sub');
      button.setAttribute('aria-haspopup', 'menu');
      button.append(el('span', { class: 'context-menu__seta', 'aria-hidden': 'true' }, ['›']));
      const abrirFilho = (): void => {
        if (extras.toque === true || extras.folha === true) {
          // No celular: troca pela folha do submenu.
          close();
          openMenu(anchor, sub, { folha: true, titulo: item.submenuTitulo ?? item.label });
          return;
        }
        if (filho !== null && filho.dataset['de'] === item.label) return;
        fecharFilho();
        const r = button.getBoundingClientRect();
        filho = el(
          'div',
          { class: 'context-menu context-menu--filho', role: 'menu', 'data-de': item.label },
          sub.map((x) => {
            const b = el('button', { class: 'context-menu__item', type: 'button', role: 'menuitem' }, [x.label]);
            b.addEventListener('click', () => {
              close();
              x.onSelect();
            });
            return b;
          }),
        );
        filho.style.visibility = 'hidden';
        document.body.append(filho);
        const larg = filho.offsetWidth;
        const alt = filho.offsetHeight;
        const x = r.right + 4 + larg <= innerWidth - MARGIN ? r.right + 4 : Math.max(MARGIN, r.left - larg - 4);
        const y = Math.max(MARGIN, Math.min(innerHeight - alt - MARGIN, r.top - 5));
        filho.style.left = `${x}px`;
        filho.style.top = `${y}px`;
        filho.style.visibility = '';
      };
      button.addEventListener('click', abrirFilho);
      button.addEventListener('mouseenter', () => {
        // Menu aberto por toque só troca pela folha com toque (num notebook com
        // tela de toque, passar o mouse não pode fechar o menu sozinho).
        if (extras.toque !== true && extras.folha !== true && matchMedia('(hover: hover)').matches) abrirFilho();
      });
      buttons.push(button);
      nodes.push(button);
      continue;
    }
    // Passar por outro item fecha o submenu aberto.
    button.addEventListener('mouseenter', fecharFilho);

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

  // 0.11.0: a fileira de reações, em cima de tudo.
  if (extras.emojis !== undefined) {
    const r = extras.emojis;
    const fileira = el(
      'div',
      { class: 'context-menu__emojis', role: 'group', 'aria-label': 'Reagir' },
      [
        ...r.lista.map((emoji) => {
          const b = el('button', { type: 'button', class: r.minhas.includes(emoji) ? 'is-minha' : '', 'aria-label': `Reagir com ${emoji}` }, [
            el('span', { class: 'emoji' }, [emoji]),
          ]);
          b.addEventListener('click', () => {
            close();
            r.aoEscolher(emoji);
          });
          return b;
        }),
        (() => {
          const b = el('button', { type: 'button', 'aria-label': 'Reagir com outro emoji' }, [iconEl(r.iconeMais)]);
          b.addEventListener('click', () => {
            const onde = b.getBoundingClientRect();
            close();
            r.aoMais(onde);
          });
          return b;
        })(),
      ],
    );
    nodes.unshift(fileira);
  }

  const rico = items.some((i) => i.icon !== undefined || i.hint !== undefined);
  const menu = el(
    'div',
    { class: `context-menu${rico ? ' context-menu--rico' : ''}${extras.folha === true ? ' context-menu--folha' : ''}`, role: 'menu', tabindex: '-1' },
    nodes,
  );

  function close(): void {
    fecharFilho();
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
    if (!menu.contains(event.target as Node) && filho?.contains(event.target as Node) !== true) close();
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

  /*
   * 0.11.0: a FOLHA abre debaixo do dedo que ainda está segurando. Soltar o
   * dedo podia "tocar" no emoji que apareceu ali (reagia sem querer). Até o
   * dedo sair da tela (e um instante depois), toque na folha não vale.
   */
  if (extras.folha === true) {
    let pronta = false;
    const engolir = (e: Event): void => {
      if (pronta) return;
      e.preventDefault();
      e.stopPropagation();
    };
    for (const tipo of ['click', 'pointerup', 'mouseup', 'touchend'] as const) menu.addEventListener(tipo, engolir, true);
    const soltou = (): void => {
      document.removeEventListener('pointerup', soltou, true);
      document.removeEventListener('touchend', soltou, true);
      window.setTimeout(() => (pronta = true), 250);
    };
    document.addEventListener('pointerup', soltou, true);
    document.addEventListener('touchend', soltou, true);
    // Se o dedo já tinha saído antes da folha abrir, ela libera sozinha.
    window.setTimeout(() => (pronta = true), 900);
  }

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
