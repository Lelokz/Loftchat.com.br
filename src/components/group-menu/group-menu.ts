/**
 * Menu do cabeçalho do grupo.
 *
 * Virou uma casca fina sobre o `context-menu`: é o mesmo menu, só ancorado num
 * botão em vez do cursor. Antes era um componente próprio, montado DENTRO do
 * cabeçalho da coluna de canais — e por isso sumia do documento toda vez que o
 * `app.ts` trocava a coluna, deixando os listeners globais apontando para um nó
 * órfão. Unificar consertou isso e deu de graça o "só um menu aberto por vez"
 * entre o cabeçalho e o botão direito.
 */

import { closeMenu, openMenu } from '../context-menu/context-menu';
import type { MenuItem } from '../context-menu/context-menu';

export type GroupMenuItem = MenuItem;

export function closeGroupMenu(): void {
  closeMenu();
}

export function openGroupMenu(anchor: HTMLElement, items: GroupMenuItem[]): void {
  const expand = (open: boolean): void =>
    anchor.setAttribute('aria-expanded', String(open));

  expand(true);
  openMenu({ rect: anchor.getBoundingClientRect() }, items);

  // O menu fecha por vários caminhos (Esc, clique fora, rolagem). Em vez de
  // espionar todos, devolve o aria-expanded quando o menu deixar o documento.
  const observer = new MutationObserver(() => {
    if (document.querySelector('.context-menu') === null) {
      expand(false);
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true });
}
