import './group-bar.css';

import { avatarEl, el, iconEl } from '../../lib/dom';
import { chatsIcon, logoIcon, plusIcon } from '../../lib/icons';
import { CARD_COLORS, cardColorId } from '../../lib/person-theme';
import { barItems, tabLabel } from '../../lib/private-prefs';
import type { GroupFolder, TabMode } from '../../lib/private-prefs';
import { enableDragSort } from '../../lib/drag-sort';
import type { Group, GroupId, Member } from '../../types/models';
import { renderSessionFooter } from '../session-footer/session-footer';

export interface GroupBarProps {
  /** Grupos em que sou membro, vindos do Firestore. */
  groups: Group[];
  /** Como EU chamo cada grupo (etapa 3d): apelido, ou '' para só o ícone. */
  groupLabels: Map<GroupId, string>;
  /** Etapa 4a: todas com nome, só ícones, ou só a aberta com nome. */
  tabMode: TabMode;
  /**
   * Etapa 4a: soltou uma aba arrastada (só mouse) — os itens na ordem nova
   * (id de grupo, ou `pasta:<id>` para uma pasta inteira).
   */
  onReorder: (ids: string[]) => void;
  /** Etapa 4b: pastas, quais estão abertas, abrir/fechar, e arrastar dentro de uma. */
  folders: GroupFolder[];
  openFolders: Set<string>;
  onToggleFolder: (folderId: string) => void;
  onReorderInFolder: (ids: GroupId[]) => void;
  activeGroupId: GroupId | null;
  /** A aba Privado está ativa? Nenhum grupo fica marcado quando ela está. */
  homeActive: boolean;
  /** Eu — o cartão no canto da barra (nome e @). */
  me: Member;
  onSelectGroup: (groupId: GroupId) => void;
  onOpenHome: () => void;
  /** O "+": abre o menu Criar grupo / Entrar num grupo (16/11/2026). */
  onCreateGroup: (anchor: HTMLElement) => void;
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
    [el('span', { class: 'group-bar__tab-icon' }, [iconEl(chatsIcon(15))]), el('span', {}, ['Privado'])],
  );
  privado.addEventListener('click', onOpenHome);

  function abaDoGrupo(group: Group): HTMLElement {
    // Com a aba Privado ativa, nenhum grupo aparece marcado.
    const isActive = !homeActive && group.id === activeGroupId;
    // Apelido pessoal ou "sem nome" (etapa 3d). O nome de verdade continua
    // no title e no nome acessível — o leitor de tela nunca fica sem nome.
    const apelido = tabLabel(group.name, props.groupLabels.get(group.id));
    // O jeito das abas (etapa 4a): "icones" esconde todos os nomes; "aberto"
    // mostra só o do grupo aberto. "Sem nome" (3d) vale em qualquer jeito.
    const rotulo =
      props.tabMode === 'icones' || (props.tabMode === 'aberto' && !isActive) ? null : apelido;
    const button = el(
      'button',
      {
        class: `group-bar__tab group-bar__button${isActive ? ' is-active' : ''}${rotulo === null ? ' group-bar__tab--icone' : ''}`,
        type: 'button',
        title: apelido === group.name || apelido === null ? group.name : `${group.name} (seu apelido: ${apelido})`,
        'aria-label': apelido === null || apelido === group.name ? group.name : `${apelido} — ${group.name}`,
        'aria-current': isActive ? 'true' : undefined,
        'data-context': 'group',
        'data-group-id': group.id,
      },
      [grupoAvatar(group), rotulo !== null && el('span', { class: 'group-bar__name' }, [rotulo])],
    );
    button.addEventListener('click', () => onSelectGroup(group.id));
    return el('li', { 'data-sort-id': group.id }, [button]);
  }

  /**
   * PASTA (etapa 4b): uma aba com as miniaturas dos grupos dela. Clicar abre
   * e fecha; aberta, os grupos aparecem ao lado, dentro de uma moldura na
   * cor da pasta. Fechada com o grupo aberto lá dentro, a pasta fica acesa.
   */
  function abaDaPasta(pasta: GroupFolder, membros: Group[]): HTMLElement {
    const aberta = props.openFolders.has(pasta.id);
    const temAtivo = !homeActive && membros.some((g) => g.id === activeGroupId);
    const comNome = props.tabMode === 'nomes' || (props.tabMode === 'aberto' && temAtivo);
    const cor = CARD_COLORS[cardColorId(pasta.color)];
    const miniaturas = el(
      'span',
      { class: 'group-bar__folder-icon', 'aria-hidden': 'true' },
      membros.slice(0, 4).map((g) => grupoAvatar(g, 'sm', 'group-bar__folder-mini')),
    );
    // O tom CLARO da cor da pasta, para as miniaturas escuras/claras se destacarem.
    miniaturas.style.setProperty('--pasta-cor', cor.base);
    const botao = el(
      'button',
      {
        class: `group-bar__tab group-bar__folder${temAtivo && !aberta ? ' is-active' : ''}${comNome ? '' : ' group-bar__tab--icone'}`,
        type: 'button',
        title: `Pasta ${pasta.name}: ${membros.map((g) => g.name).join(', ')}`,
        'aria-label': `Pasta ${pasta.name}`,
        'aria-expanded': String(aberta),
        'data-folder-id': pasta.id,
      },
      [miniaturas, comNome && el('span', { class: 'group-bar__name' }, [pasta.name])],
    );
    botao.addEventListener('click', () => props.onToggleFolder(pasta.id));
    const filhos: HTMLElement[] = [botao];
    if (aberta) {
      const dentro = el('ul', { class: 'group-bar__folder-groups', 'aria-label': `Grupos da pasta ${pasta.name}` }, membros.map(abaDoGrupo));
      // Dentro da pasta aberta também dá para arrastar (muda a ordem lá dentro).
      enableDragSort({
        container: dentro,
        itemSelector: 'li[data-sort-id]',
        axis: 'x',
        threshold: 8,
        mouseOnly: true,
        onDrop: props.onReorderInFolder,
      });
      filhos.push(dentro);
    }
    const li = el('li', { class: `group-bar__folder-item${aberta ? ' is-open' : ''}`, 'data-sort-id': `pasta:${pasta.id}` }, filhos);
    li.style.setProperty('--pasta-cor', cor.base);
    return li;
  }

  const tabs = barItems(groups, props.folders).map((item) =>
    item.kind === 'group' ? abaDoGrupo(item.group) : abaDaPasta(item.folder, item.groups),
  );

  const addButton = el(
    'button',
    { class: 'group-bar__add', type: 'button', title: 'Criar ou entrar num grupo' },
    [iconEl(plusIcon(18)), el('span', { class: 'sr-only' }, ['Criar ou entrar num grupo'])],
  );
  addButton.addEventListener('click', () => onCreateGroup(addButton));

  const lista = el('ul', { class: `group-bar__tabs group-bar__tabs--${props.tabMode}` }, [
    el('li', {}, [privado]),
    ...tabs,
    el('li', {}, [addButton]),
  ]);
  // Arrastar as abas para mudar a ordem (etapa 4a). Só mouse e só depois de
  // andar 8px: um clique continua sendo clique, e no celular a faixa rola com
  // o dedo (lá a ordem muda em Configurações → Grupos).
  enableDragSort({
    container: lista,
    itemSelector: 'li[data-sort-id]',
    axis: 'x',
    threshold: 8,
    mouseOnly: true,
    onDrop: props.onReorder,
  });

  return el('nav', { class: 'group-bar', 'aria-label': 'Grupos' }, [
    brand,
    lista,
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
