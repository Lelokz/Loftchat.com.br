import './group-bar.css';

import { avatarEl, el, iconEl } from '../../lib/dom';
import { logoIcon, plusIcon } from '../../lib/icons';
import { CARD_COLORS, cardColorId } from '../../lib/person-theme';
import { tabLabel } from '../../lib/private-prefs';
import type { Group, GroupId, Member } from '../../types/models';
import { renderSessionFooter } from '../session-footer/session-footer';

export interface GroupBarProps {
  /** Grupos em que sou membro, vindos do Firestore. */
  groups: Group[];
  /** Como EU chamo cada grupo (etapa 3d): apelido, ou '' para só o ícone. */
  groupLabels: Map<GroupId, string>;
  activeGroupId: GroupId | null;
  /** A aba Privado está ativa? Nenhum grupo fica marcado quando ela está. */
  homeActive: boolean;
  /** Eu — o cartão no canto da barra (nome e @). */
  me: Member;
  onSelectGroup: (groupId: GroupId) => void;
  onOpenHome: () => void;
  onCreateGroup: () => void;
  onSignOut: () => void;
  onOpenSettings: () => void;
}

/**
 * BARRA DE CIMA (proposta A, 16/11/2026) — antes era a coluna vertical de
 * grupos à esquerda.
 *
 * Os grupos viram ABAS, com foto e nome; a aba "Privado" (antes a casinha) é
 * sempre a primeira. No canto direito fica o meu cartão, com nome e @ — o
 * mesmo `session-footer` que antes morava no pé das colunas.
 */
export function renderGroupBar(props: GroupBarProps): HTMLElement {
  const { groups, activeGroupId, homeActive, me, onSelectGroup, onOpenHome, onCreateGroup, onSignOut, onOpenSettings } =
    props;

  const brand = el('span', { class: 'group-bar__brand' }, [
    el('span', { class: 'group-bar__mark' }, [iconEl(logoIcon(17))]),
    el('span', { class: 'group-bar__word' }, ['Loft', el('b', {}, ['chat'])]),
  ]);

  const privado = el(
    'button',
    {
      class: `group-bar__tab group-bar__tab--home${homeActive ? ' is-active' : ''}`,
      type: 'button',
      title: 'Privado: amigos e conversas',
      'aria-current': homeActive ? 'true' : undefined,
    },
    [el('span', { class: 'group-bar__tab-icon' }, [iconEl(logoIcon(14))]), el('span', {}, ['Privado'])],
  );
  privado.addEventListener('click', onOpenHome);

  const tabs = groups.map((group) => {
    // Com a aba Privado ativa, nenhum grupo aparece marcado.
    const isActive = !homeActive && group.id === activeGroupId;
    // Apelido pessoal ou "sem nome" (etapa 3d). O nome de verdade continua
    // no title e no nome acessível — o leitor de tela nunca fica sem nome.
    const rotulo = tabLabel(group.name, props.groupLabels.get(group.id));
    const button = el(
      'button',
      {
        class: `group-bar__tab group-bar__button${isActive ? ' is-active' : ''}${rotulo === null ? ' group-bar__tab--icone' : ''}`,
        type: 'button',
        title: rotulo === group.name ? group.name : `${group.name}${rotulo === null ? '' : ` (seu apelido: ${rotulo})`}`,
        'aria-label': rotulo === null || rotulo === group.name ? group.name : `${rotulo} — ${group.name}`,
        'aria-current': isActive ? 'true' : undefined,
        'data-context': 'group',
        'data-group-id': group.id,
      },
      [grupoAvatar(group), rotulo !== null && el('span', { class: 'group-bar__name' }, [rotulo])],
    );
    button.addEventListener('click', () => onSelectGroup(group.id));
    return el('li', {}, [button]);
  });

  const addButton = el(
    'button',
    { class: 'group-bar__add', type: 'button', title: 'Criar grupo' },
    [iconEl(plusIcon(18)), el('span', { class: 'sr-only' }, ['Criar grupo'])],
  );
  addButton.addEventListener('click', onCreateGroup);

  return el('nav', { class: 'group-bar', 'aria-label': 'Grupos' }, [
    brand,
    el('ul', { class: 'group-bar__tabs' }, [
      el('li', {}, [privado]),
      ...tabs,
      el('li', {}, [addButton]),
    ]),
    renderSessionFooter(me, onSignOut, onOpenSettings),
  ]);
}

/**
 * A foto do grupo (etapa 3a) ou as iniciais sobre a COR do grupo — o tom
 * escuro da lista de cores do cartão, para as letras claras lerem bem.
 */
export function grupoAvatar(group: Group, size: 'sm' | 'xl' = 'sm', extra = 'group-bar__avatar'): HTMLElement {
  const avatar = avatarEl(group.initials, size, `${extra} avatar--quadrado`, group.photo);
  if (group.photo === undefined && group.accentId !== undefined) {
    avatar.style.backgroundColor = CARD_COLORS[cardColorId(group.accentId)].fim;
    avatar.style.color = 'var(--text-primary)';
  }
  return avatar;
}
