import './session-footer.css';

import { avatarEl, el, iconEl } from '../../lib/dom';
import { gearIcon, logoutIcon } from '../../lib/icons';
import type { Member } from '../../types/models';

/**
 * Rodapé fixo com a IDENTIDADE DA SESSÃO — meu avatar, meu nome, e as ações
 * que não dependem de grupo nenhum. Por isso é compartilhado: `channel-
 * list.ts` (visão de grupo) e `home-column.ts` (tela inicial, e o PV — a
 * coluna 2 não muda ao abrir uma conversa) montam o mesmo rodapé, no mesmo
 * lugar (último filho da coluna). Antes disto ele vivia só dentro de
 * `channel-list.ts`, e sumia fora do grupo — sem jeito de sair da conta ou
 * abrir configurações sem voltar para um grupo primeiro.
 *
 * O botão de engrenagem AINDA NÃO FAZ NADA — sem `onClick`, tal como já era
 * dentro de `channel-list.ts`. Isto não é regressão desta extração: vira a
 * tela de configurações só na Entrega 3.
 */
export function renderSessionFooter(member: Member, onSignOut: () => void): HTMLElement {
  const signOutButton = el('button', {
    class: 'icon-button session-footer__signout',
    type: 'button',
    title: 'Sair da conta',
  });
  signOutButton.append(iconEl(logoutIcon(17)), el('span', { class: 'sr-only' }, ['Sair da conta']));
  signOutButton.addEventListener('click', onSignOut);

  return el('footer', { class: 'session-footer' }, [
    avatarEl(member.initials, 'sm'),
    el('span', { class: 'session-footer__name', title: member.displayName }, [
      member.displayName,
    ]),
    el('button', { class: 'icon-button', type: 'button', title: 'Configurações' }, [
      iconEl(gearIcon(17)),
      el('span', { class: 'sr-only' }, ['Configurações']),
    ]),
    signOutButton,
  ]);
}
