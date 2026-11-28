import './session-footer.css';

import { avatarEl, corDoCargo, el, iconEl } from '../../lib/dom';
import { gearIcon } from '../../lib/icons';
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
 * A engrenagem abre Configurações em tela inteira (proposta A, etapa 2).
 */
export function renderSessionFooter(member: Member, onOpenSettings: () => void): HTMLElement {
  /*
   * 0.14.0: o botão de SAIR DA CONTA saiu daqui (ficava do lado da
   * engrenagem e era fácil apertar sem querer). Sair agora é só em
   * Configurações → Sair da conta, com confirmação.
   */

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
      corDoCargo(el('span', { class: 'session-footer__name' }, [member.displayName]), member),
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

  const settingsButton = el('button', { class: 'icon-button', type: 'button', title: 'Configurações' }, [
    iconEl(gearIcon(17)),
    el('span', { class: 'sr-only' }, ['Configurações']),
  ]);
  settingsButton.addEventListener('click', onOpenSettings);

  /*
   * A MINHA FOTO abre o meu cartão (0.12.0): no celular era o único jeito de
   * chegar no próprio perfil — antes a foto nem aparecia lá. O clique cai no
   * ouvinte de `data-profile-uid` do app, como qualquer foto.
   */
  const meuPerfil = el(
    'button',
    { class: 'session-footer__eu', type: 'button', title: 'Meu perfil', 'aria-label': 'Meu perfil', 'data-profile-uid': member.id },
    [avatarEl(member.initials, 'sm', '', member.photo, member.id)],
  );

  return el('footer', { class: 'session-footer' }, [
    meuPerfil,
    identidade,
    settingsButton,
  ]);
}
