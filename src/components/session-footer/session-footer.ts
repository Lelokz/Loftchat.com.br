import './session-footer.css';

import { avatarEl, el, iconEl } from '../../lib/dom';
import { gearIcon, logoutIcon } from '../../lib/icons';
import type { Member } from '../../types/models';
import { showToast } from '../toast/toast';

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

  /*
   * O MEU CARTÃO: nome de exibição grande, `@` pequeno embaixo. O `@` é o que
   * os amigos usam para me adicionar — por isso fica sempre à vista, e um
   * clique copia. Antes ele não aparecia em lugar nenhum depois do cadastro.
   */
  const handle = member.username === undefined ? null : `@${member.username}`;
  const identidade = el(
    handle === null ? 'span' : 'button',
    {
      class: 'session-footer__identity',
      ...(handle === null ? {} : { type: 'button', title: `Copiar ${handle}` }),
    },
    [
      el('span', { class: 'session-footer__name' }, [member.displayName]),
      handle !== null && el('span', { class: 'session-footer__handle' }, [handle]),
    ],
  );
  if (handle !== null) {
    identidade.addEventListener('click', () => {
      void navigator.clipboard.writeText(handle).then(
        () => showToast(`${handle} copiado. Mande para quem vai te adicionar.`),
        () => showToast(`Seu nome de usuário é ${handle}.`),
      );
    });
  }

  return el('footer', { class: 'session-footer' }, [
    avatarEl(member.initials, 'sm'),
    identidade,
    el('button', { class: 'icon-button', type: 'button', title: 'Configurações' }, [
      iconEl(gearIcon(17)),
      el('span', { class: 'sr-only' }, ['Configurações']),
    ]),
    signOutButton,
  ]);
}
