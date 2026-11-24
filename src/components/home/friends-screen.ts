import './friends-screen.css';

import { avatarEl, el, iconEl } from '../../lib/dom';
import { menuIcon } from '../../lib/icons';
import { trocarConteudoComTransicao } from '../../lib/transition';
import type { Friendship, MemberId, UserProfile } from '../../types/models';
import { textoDoErro } from '../../lib/firestore-errors';

export type FriendsTab = 'amigos' | 'pendentes' | 'adicionar' | 'bloqueados';

export interface FriendsScreenProps {
  me: MemberId;
  tab: FriendsTab;
  onTab: (tab: FriendsTab) => void;

  /** Vínculos onde eu apareço, já vindos do Firestore. */
  friendships: Friendship[];
  /** Perfis públicos das pessoas envolvidas, pelo uid. */
  profiles: Map<MemberId, UserProfile>;
  blockedUids: MemberId[];

  /** Rejeita com a mensagem a mostrar. Devolve o que aconteceu. */
  onAdd: (username: string) => Promise<'sent' | 'accepted'>;
  onAccept: (id: string) => void;
  /** Recusar ou cancelar um pedido (sem perguntar: dá para pedir de novo). */
  onRemove: (id: string) => void;
  /** Desfazer amizade: pergunta antes (ver app.ts). */
  onUnfriend: (friendshipId: string, uid: MemberId) => void;
  onBlock: (uid: MemberId) => void;
  onUnblock: (uid: MemberId) => void;
  /** Abre o PV — clicar na linha (só na aba Amigos) ou "Enviar mensagem" no menu de contexto. */
  onOpenDm: (uid: MemberId) => void;

  /** Gaveta do mobile, como nas outras colunas do meio. */
  onOpenChannels: () => void;
}

const TAB_LABEL: Record<FriendsTab, string> = {
  amigos: 'Amigos',
  pendentes: 'Pendentes',
  adicionar: 'Adicionar',
  bloqueados: 'Bloqueados',
};

/** O outro lado do vínculo — o que não sou eu. */
function otherOf(friendship: Friendship, me: MemberId): MemberId {
  return friendship.members.find((uid) => uid !== me) ?? '';
}

/**
 * `onOpenDm` só vem preenchido na aba Amigos (ver `corpo`) — é o que faz a
 * linha ficar clicável e ganhar `data-context="friend"` (o menu de contexto,
 * "Enviar mensagem"). Pendente e bloqueado continuam inertes: não faz
 * sentido abrir PV com quem ainda não é seu amigo, ou com quem você bloqueou.
 */
function personRow(
  profile: UserProfile | undefined,
  uid: MemberId,
  actions: HTMLElement[],
  onOpenDm?: (uid: MemberId) => void,
): HTMLElement {
  const nome = profile?.displayName ?? 'Usuário';
  const arroba = profile?.username;
  const clickable = onOpenDm !== undefined;

  const row = el(
    'li',
    {
      class: `friends__row${clickable ? ' friends__row--clickable' : ''}`,
      ...(clickable ? { 'data-context': 'friend', 'data-friend-uid': uid } : {}),
    },
    [
      avatarEl(profile?.initials ?? '?', 'sm', '', profile?.photo, uid),
      el('div', { class: 'friends__identity' }, [
        el('span', { class: 'friends__name' }, [nome]),
        // Sem `@` a pessoa é inencontrável — e mostrar o uid cru não ajudaria
        // ninguém, então some.
        arroba === undefined || arroba === ''
          ? false
          : el('span', { class: 'friends__handle' }, [`@${arroba}`]),
      ]),
      el('div', { class: 'friends__actions' }, actions),
      // Gancho para o teste encontrar a linha, mesmo fora da aba Amigos.
      el('span', { class: 'sr-only', 'data-friend-uid': uid }, []),
    ],
  );

  if (onOpenDm !== undefined) row.addEventListener('click', () => onOpenDm(uid));
  return row;
}

/**
 * `stopPropagation`: sem isto, clicar "Bloquear" numa linha clicável TAMBÉM
 * abriria o PV. Exportada: o cartão de perfil do PV (etapa 19) reaproveita
 * o MESMO botão — "os mesmos da tela de amigos", não uma cópia.
 */
export function action(label: string, onClick: () => void, danger = false): HTMLElement {
  const button = el(
    'button',
    { class: `friends__action${danger ? ' friends__action--danger' : ''}`, type: 'button' },
    [label],
  );
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    onClick();
  });
  return button;
}

function emptyNote(text: string): HTMLElement {
  return el('p', { class: 'friends__empty' }, [text]);
}

export interface FriendsScreenParts {
  element: HTMLElement;
  /**
   * Redesenha com dados novos. NUNCA reconstrói o corpo enquanto a aba
   * continua sendo "adicionar" — ver o comentário dentro da função.
   */
  update(props: FriendsScreenProps): void;
}

function tabsRow(props: FriendsScreenProps, recebidosCount: number): HTMLElement[] {
  return (Object.keys(TAB_LABEL) as FriendsTab[]).map((tab) => {
    const ativo = tab === props.tab;
    const rotulo =
      tab === 'pendentes' && recebidosCount > 0
        ? `${TAB_LABEL[tab]} (${recebidosCount})`
        : TAB_LABEL[tab];

    const button = el(
      'button',
      {
        class: `friends__tab${ativo ? ' is-active' : ''}`,
        type: 'button',
        role: 'tab',
        'aria-selected': ativo ? 'true' : 'false',
        'data-tab': tab,
      },
      [rotulo],
    );
    button.addEventListener('click', () => props.onTab(tab));
    return button;
  });
}

/**
 * Coluna 3 na tela inicial: amigos, pedidos, bloqueados e adicionar.
 *
 * A casca (cabeçalho, abas, corpo) é montada UMA VEZ, com um slot que o
 * `update()` troca por fora — mesmo motivo do `renderChat`: reconstruir tudo
 * a cada mudança de dado apagaria o que a pessoa está fazendo dentro do
 * corpo. Aqui isso quer dizer o formulário de adicionar: mandar um pedido
 * dispara o MEU PRÓPRIO listener de amizades quase na hora (eu apareço em
 * `members`), e sem esta guarda o formulário — com a resposta ainda a
 * caminho — era substituído por um em branco antes de "Pedido enviado."
 * chegar a aparecer. Ninguém via a confirmação.
 */
export function renderFriendsScreen(props: FriendsScreenProps): FriendsScreenParts {
  const abas = el('div', { class: 'friends__tabs', role: 'tablist' });
  const corpoEl = el('div', { class: 'friends__body column-scroll' });

  const gaveta = el('button', {
    class: 'icon-button chat__mobile-button chat__mobile-button--left',
    type: 'button',
    title: 'Abrir menu',
    'aria-label': 'Abrir menu',
  });
  gaveta.append(iconEl(menuIcon(20), 'icon'));
  gaveta.addEventListener('click', props.onOpenChannels);

  const element = el('main', { class: 'friends' }, [
    el('header', { class: 'friends__header' }, [
      gaveta,
      el('h2', { class: 'friends__title' }, ['Amigos']),
    ]),
    abas,
    corpoEl,
  ]);

  /** Aba cujo conteúdo está de fato no DOM agora — não necessariamente `props.tab`. */
  let abaMontada: FriendsTab | null = null;

  function paint(p: FriendsScreenProps): void {
    const recebidos = p.friendships.filter((f) => f.status === 'pending' && f.to === p.me);
    abas.replaceChildren(...tabsRow(p, recebidos.length));

    // Continua na aba "adicionar" e já era ela que estava montada: o dado
    // mudou, mas o formulário fica. É esta linha que resolve o bug.
    if (p.tab === 'adicionar' && abaMontada === 'adicionar') return;

    const aceitos = p.friendships.filter((f) => f.status === 'accepted');
    const enviados = p.friendships.filter((f) => f.status === 'pending' && f.from === p.me);
    const novoCorpo = corpo(p, { aceitos, recebidos, enviados });
    // Trocou de ABA (não só chegou dado novo na mesma aba): transição 1.
    if (abaMontada !== null && abaMontada !== p.tab) {
      trocarConteudoComTransicao(corpoEl, () => corpoEl.replaceChildren(novoCorpo));
    } else {
      corpoEl.replaceChildren(novoCorpo);
    }
    abaMontada = p.tab;
  }

  paint(props);

  return { element, update: paint };
}

function corpo(
  props: FriendsScreenProps,
  listas: { aceitos: Friendship[]; recebidos: Friendship[]; enviados: Friendship[] },
): HTMLElement {
  const { me, profiles } = props;

  if (props.tab === 'adicionar') return addForm(props);

  if (props.tab === 'bloqueados') {
    if (props.blockedUids.length === 0) {
      return emptyNote('Você não bloqueou ninguém.');
    }
    return el(
      'ul',
      { class: 'friends__list' },
      props.blockedUids.map((uid) =>
        personRow(profiles.get(uid), uid, [
          action('Desbloquear', () => props.onUnblock(uid)),
        ]),
      ),
    );
  }

  if (props.tab === 'pendentes') {
    if (listas.recebidos.length === 0 && listas.enviados.length === 0) {
      return emptyNote('Nenhum pedido por aqui.');
    }
    return el('div', { class: 'friends__groups' }, [
      // Recebidos e enviados SEPARADOS: as ações são diferentes, e misturá-los
      // faria alguém recusar achando que estava cancelando.
      listas.recebidos.length > 0 &&
        el('section', { class: 'friends__group' }, [
          el('h3', { class: 'friends__group-title' }, ['Recebidos']),
          el(
            'ul',
            { class: 'friends__list' },
            listas.recebidos.map((f) => {
              const outro = otherOf(f, me);
              return personRow(profiles.get(outro), outro, [
                action('Aceitar', () => props.onAccept(f.id)),
                action('Recusar', () => props.onRemove(f.id), true),
              ]);
            }),
          ),
        ]),
      listas.enviados.length > 0 &&
        el('section', { class: 'friends__group' }, [
          el('h3', { class: 'friends__group-title' }, ['Enviados']),
          el(
            'ul',
            { class: 'friends__list' },
            listas.enviados.map((f) => {
              const outro = otherOf(f, me);
              return personRow(profiles.get(outro), outro, [
                action('Cancelar', () => props.onRemove(f.id), true),
              ]);
            }),
          ),
        ]),
    ]);
  }

  if (listas.aceitos.length === 0) {
    return emptyNote('Você ainda não tem amigos aqui. Use a aba Adicionar.');
  }

  return el(
    'ul',
    { class: 'friends__list' },
    listas.aceitos.map((f) => {
      const outro = otherOf(f, me);
      return personRow(
        profiles.get(outro),
        outro,
        [
          action('Desfazer amizade', () => props.onUnfriend(f.id, outro), true),
          action('Bloquear', () => props.onBlock(outro), true),
        ],
        props.onOpenDm,
      );
    }),
  );
}

/** A aba Adicionar: busca por `@` EXATA. */
function addForm(props: FriendsScreenProps): HTMLElement {
  const campo = el('input', {
    class: 'friends__input',
    type: 'text',
    id: 'add-friend',
    autocomplete: 'off',
    spellcheck: 'false',
    placeholder: 'nome de usuário',
    'aria-label': 'Nome de usuário',
  }) as HTMLInputElement;

  const aviso = el('p', { class: 'friends__note', role: 'status' }, ['']);
  const enviar = el('button', { class: 'friends__submit', type: 'submit' }, ['Enviar pedido']);

  const form = el('form', { class: 'friends__add' }, [
    el('label', { class: 'friends__label', for: 'add-friend' }, [
      'Adicionar por nome de usuário',
    ]),
    el('div', { class: 'friends__row-input' }, [
      el('span', { class: 'friends__at' }, ['@']),
      campo,
    ]),
    el('p', { class: 'friends__hint' }, [
      'A busca é pelo nome exato. E-mail nunca é usado para encontrar alguém.',
    ]),
    aviso,
    enviar,
  ]) as HTMLFormElement;

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const nome = campo.value.trim().toLowerCase();
    if (nome === '') return;

    enviar.setAttribute('disabled', 'true');
    aviso.classList.remove('friends__note--error');
    aviso.textContent = 'Enviando…';

    void props
      .onAdd(nome)
      .then((resultado) => {
        // "Pedido enviado" e "vocês agora são amigos" não são a mesma notícia:
        // o segundo acontece quando a pessoa já tinha te mandado um pedido.
        aviso.textContent =
          resultado === 'accepted'
            ? 'Vocês agora são amigos.'
            : 'Pedido enviado.';
        campo.value = '';
      })
      .catch((error: unknown) => {
        aviso.classList.add('friends__note--error');
        aviso.textContent =
          textoDoErro(error, 'Não foi possível enviar o pedido.');
      })
      .finally(() => {
        enviar.removeAttribute('disabled');
      });
  });

  return form;
}
