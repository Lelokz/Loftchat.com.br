import './home-column.css';

import { avatarEl, el, iconEl } from '../../lib/dom';
import { peopleIcon } from '../../lib/icons';
import type { DmThread, MemberId, UserProfile } from '../../types/models';
import { bolinha } from '../bolinha/bolinha';

export interface HomeColumnProps {
  dmThreads: DmThread[];
  dmThreadsLoaded: boolean;
  /** Uid do PV aberto agora, ou `null` — decide o item ativo da lista. */
  activeDmUid: MemberId | null;
  /** Perfis públicos, pelo uid — de onde vêm avatar e nome de cada conversa. */
  profiles: Map<MemberId, UserProfile>;
  me: MemberId;
  onSelectDm: (uid: MemberId) => void;
  /** Não lidas (0.4.5) de cada PV. */
  naoLidas?: (uid: MemberId) => number;
  /** Clicar em "Amigos" fecha o PV aberto, se houver. */
  onOpenFriends: () => void;
}

export interface HomeColumnParts {
  element: HTMLElement;
  callBarSlot: HTMLElement;
}

/** O outro lado da conversa — nunca eu, numa lista de exatamente 2 uids. */
function otherOf(thread: DmThread, me: MemberId): MemberId {
  return thread.members.find((uid) => uid !== me) ?? thread.members[0] ?? '';
}

/**
 * Coluna 2 na tela inicial — o lugar da coluna de canais quando não há grupo
 * ativo.
 *
 * A seção de conversas privadas (reservada desde a Entrega 1) ganha conteúdo
 * na etapa 18: uma linha por `DmThread`, mais recente primeiro (a ordem já
 * vem pronta de `subscribeDmThreads` — esta função não reordena nada), com
 * avatar, nome e o trecho da última mensagem — os três lidos do PRÓPRIO
 * `DmThread`, nunca de `dmMessages` (ver o comentário em `subscribeDmThreads`
 * sobre por que a lista custa uma leitura por conversa, não uma por mensagem).
 */
export function renderHomeColumn(props: HomeColumnProps): HomeColumnParts {
  const callBarSlot = el('div', { class: 'home-column__callbar' });

  const amigos = el(
    'button',
    {
      class: `home-column__item${props.activeDmUid === null ? ' is-active' : ''}`,
      type: 'button',
      'aria-current': props.activeDmUid === null ? 'true' : undefined,
    },
    [iconEl(peopleIcon(18), 'icon home-column__icon'), el('span', {}, ['Amigos'])],
  );
  amigos.addEventListener('click', props.onOpenFriends);

  const dmSection = buildDmSection(props);

  /*
   * Cabeçalho e rodapé FICAM — só o meio rola. Mesma casca de channel-
   * list.ts (`.channels__body`): sem isto, o rodapé (etapa 19 — antes ele
   * simplesmente não existia aqui) ficaria dentro da área que rola junto
   * com a lista de conversas, em vez de fixo como no grupo.
   */
  const element = el('nav', { class: 'home-column', 'aria-label': 'Privado' }, [
    el('div', { class: 'home-column__header' }, [
      el('h2', { class: 'home-column__title' }, ['Privado']),
    ]),

    el('div', { class: 'home-column__body column-scroll scroll-area' }, [
      el('div', { class: 'home-column__nav' }, [amigos]),
      dmSection,
    ]),

    callBarSlot,
  ]);

  return { element, callBarSlot };
}

function buildDmSection(props: HomeColumnProps): HTMLElement {
  const label = el('span', { class: 'home-column__section-label' }, ['Mensagens diretas']);

  // Ainda carregando: nem a lista, nem "vazio" — os dois piscariam errado.
  if (!props.dmThreadsLoaded) {
    return el('div', { class: 'home-column__section' }, [label]);
  }

  if (props.dmThreads.length === 0) {
    return el('div', { class: 'home-column__section' }, [
      label,
      el('p', { class: 'home-column__empty' }, ['Suas conversas privadas aparecem aqui.']),
    ]);
  }

  const rows = props.dmThreads.map((thread) => {
    const friendUid = otherOf(thread, props.me);
    const profile = props.profiles.get(friendUid);
    const isActive = friendUid === props.activeDmUid;
    const naoLidas = props.naoLidas?.(friendUid) ?? 0;

    const button = el(
      'button',
      {
        class: `home-column__dm${isActive ? ' is-active' : ''}${naoLidas > 0 ? ' tem-nao-lidas' : ''}`,
        type: 'button',
        'aria-current': isActive ? 'true' : undefined,
      },
      [
        avatarEl(profile?.initials ?? '?', 'sm', '', profile?.photo),
        el('span', { class: 'home-column__dm-text' }, [
          el('span', { class: 'home-column__dm-name' }, [profile?.displayName ?? 'Usuário']),
          el('span', { class: 'home-column__dm-preview' }, [
            thread.lastMessage.body === '' ? '—' : thread.lastMessage.body,
          ]),
        ]),
        bolinha(naoLidas, 'fim'),
      ],
    );
    button.addEventListener('click', () => props.onSelectDm(friendUid));
    return el('li', {}, [button]);
  });

  return el('div', { class: 'home-column__section' }, [
    label,
    el('ul', { class: 'home-column__dm-list' }, rows),
  ]);
}
