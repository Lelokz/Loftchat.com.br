import './group-bar.css';

import { avatarEl, el, iconEl } from '../../lib/dom';
import { logoIcon, plusIcon } from '../../lib/icons';
import type { Group, GroupId } from '../../types/models';

export interface GroupBarProps {
  /** Grupos em que sou membro, vindos do Firestore. */
  groups: Group[];
  activeGroupId: GroupId | null;
  /** A casinha está ativa? Nenhum grupo fica marcado quando ela está. */
  homeActive: boolean;
  onSelectGroup: (groupId: GroupId) => void;
  onOpenHome: () => void;
  onCreateGroup: () => void;
}

/** Coluna 1 — barra vertical de grupos, o trilho mais à esquerda. */
export function renderGroupBar(props: GroupBarProps): HTMLElement {
  const { groups, activeGroupId, homeActive, onSelectGroup, onOpenHome, onCreateGroup } = props;

  /*
   * A CASINHA — até a etapa 14 era só um logo decorativo.
   *
   * Virou botão e ganhou o mesmo indicador de ativo dos grupos, porque agora ela
   * é irmã deles: uma visão entre outras, não um enfeite no topo do trilho.
   */
  const logoButton = el(
    'button',
    {
      class: `group-bar__logo${homeActive ? ' is-active' : ''}`,
      type: 'button',
      title: 'Tela inicial',
      'aria-current': homeActive ? 'true' : undefined,
    },
    [iconEl(logoIcon(22)), el('span', { class: 'sr-only' }, ['Tela inicial'])],
  );
  logoButton.addEventListener('click', onOpenHome);

  const logo = el('li', { class: 'group-bar__item' }, [
    homeActive && el('span', { class: 'group-bar__indicator' }),
    logoButton,
  ]);

  const items = groups.map((group) => {
    // Com a casinha ativa, nenhum grupo aparece marcado.
    const isActive = !homeActive && group.id === activeGroupId;

    const button = el(
      'button',
      {
        class: `group-bar__button${isActive ? ' is-active' : ''}`,
        type: 'button',
        title: group.name,
        'aria-current': isActive ? 'true' : undefined,
        'data-context': 'group',
        'data-group-id': group.id,
      },
      [avatarEl(group.initials, 'lg', 'group-bar__avatar'), el('span', { class: 'sr-only' }, [group.name])],
    );
    button.addEventListener('click', () => onSelectGroup(group.id));

    return el('li', { class: 'group-bar__item' }, [
      // Indicador do grupo ativo: barrinha à esquerda do avatar.
      isActive && el('span', { class: 'group-bar__indicator' }),
      button,
    ]);
  });

  const addButton = el(
    'button',
    { class: 'group-bar__add', type: 'button', title: 'Criar grupo' },
    [iconEl(plusIcon(20)), el('span', { class: 'sr-only' }, ['Criar grupo'])],
  );
  addButton.addEventListener('click', onCreateGroup);

  return el('nav', { class: 'group-bar', 'aria-label': 'Grupos' }, [
    // Numa lista própria: `logo` é um <li>, e <li> solto fora de <ul> é HTML
    // inválido. Ele fica separado da lista de grupos porque não é um grupo.
    el('ul', { class: 'group-bar__list group-bar__list--top' }, [logo]),
    el('hr', { class: 'group-bar__divider' }),
    el('ul', { class: 'group-bar__list column-scroll scroll-area' }, [
      ...items,
      el('li', { class: 'group-bar__item' }, [addButton]),
    ]),
  ]);
}
