import './member-list.css';

import { avatarEl, el } from '../../lib/dom';
import { renderLoading } from '../empty-state/empty-state';
import type { Member, MemberId, PresenceStatus } from '../../types/models';

export interface MemberListProps {
  /** Membros do grupo ativo, já resolvidos a partir de memberships + users. */
  members: Member[];
  membersLoaded: boolean;
  /**
   * Dono do grupo ativo, para o rótulo.
   *
   * Torna o modelo de permissão VISÍVEL. Sem isto, quem não consegue criar um
   * canal não tem como descobrir que o motivo é não ser dono.
   */
  ownerId: MemberId | null;
}

/**
 * Coluna 4 — membros do grupo ativo, separados por presença.
 *
 * Nesta etapa todo mundo chega com `status: 'online'`: presença de verdade
 * precisa de heartbeat ou onDisconnect, e é outra etapa. A seção "offline"
 * existe no código e simplesmente não aparece enquanto ninguém estiver offline.
 */
export function renderMemberList({
  members,
  membersLoaded,
  ownerId,
}: MemberListProps): HTMLElement {
  const body = !membersLoaded
    ? [renderLoading()]
    : [
        section('online', members.filter((member) => member.status === 'online'), ownerId),
        section('offline', members.filter((member) => member.status === 'offline'), ownerId),
      ];

  return el('aside', { class: 'members', 'aria-label': 'Membros' }, [
    el('div', { class: 'members__body column-scroll scroll-area' }, body),
  ]);
}

function section(
  status: PresenceStatus,
  people: Member[],
  ownerId: MemberId | null,
): HTMLElement | false {
  if (people.length === 0) return false;

  return el('section', { class: 'members__section' }, [
    el('h2', { class: 'section-title' }, [`${status} — ${people.length}`]),
    el(
      'ul',
      {},
      people.map((member) =>
        el(
          'li',
          {
            class: `member member--${member.status}`,
            'data-context': 'member',
            'data-member-id': member.id,
          },
          [
            el('span', { class: 'member__avatar' }, [
              avatarEl(member.initials, 'sm'),
              el('span', { class: 'member__dot', 'aria-hidden': 'true' }),
            ]),
            el('span', { class: 'member__name', title: member.displayName }, [
              member.displayName,
            ]),
            member.id === ownerId && el('span', { class: 'member__role' }, ['dono']),
          ],
        ),
      ),
    ),
  ]);
}
