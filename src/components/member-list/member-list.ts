import './member-list.css';

import { avatarEl, el } from '../../lib/dom';
import { renderLoading } from '../empty-state/empty-state';
import { statusLine } from '../person-card/person-card';
import type { Member, MemberId } from '../../types/models';

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
 * Coluna 4 — membros do grupo ativo.
 *
 * NÃO separa mais por presença nem mostra a bolinha verde (ajuste pós-
 * etapa-19): presença de verdade não existe (precisa de heartbeat ou
 * onDisconnect, cancelado etapas atrás), e com `member.status` sempre
 * `'online'` a seção "offline" nunca aparecia de verdade — a divisão e o
 * rótulo eram peso morto, e pior: "online" para todo mundo é informação
 * ERRADA, não só incompleta. Volta a diferenciar quando presença de
 * verdade for implementada — `Member.status`/`PresenceStatus` continuam
 * existindo em `types/models.ts` para esse dia, só a exibição mudou.
 */
export function renderMemberList({
  members,
  membersLoaded,
  ownerId,
}: MemberListProps): HTMLElement {
  const body = memberListContent({ members, membersLoaded, ownerId });

  return el('aside', { class: 'members', 'aria-label': 'Membros' }, [
    el('div', { class: 'members__body column-scroll scroll-area' }, body),
  ]);
}

/** Só o conteúdo da lista — o painel com abas do grupo (group-panel) usa isto. */
export function memberListContent({
  members,
  membersLoaded,
  ownerId,
}: MemberListProps): Array<HTMLElement | false> {
  return !membersLoaded ? [renderLoading()] : [section(members, ownerId)];
}

function section(people: Member[], ownerId: MemberId | null): HTMLElement | false {
  if (people.length === 0) return false;

  return el('section', { class: 'members__section' }, [
    el('h2', { class: 'section-title' }, [`membros — ${people.length}`]),
    el(
      'ul',
      {},
      people.map((member) =>
        el(
          'li',
          {
            class: 'member',
            'data-context': 'member',
            'data-member-id': member.id,
            // Clique abre o cartão da pessoa (etapa 2c, ver app.ts).
            'data-profile-uid': member.id,
            tabindex: 0,
          },
          [
            avatarEl(member.initials, 'sm', '', member.photo, member.id),
            el('span', { class: 'member__text' }, [
              el('span', { class: 'member__name', title: member.displayName }, [member.displayName]),
              // O status da pessoa (etapa 2d), se ela pôs um e ainda vale.
              statusLine(member.customStatus, 'member__status') ?? false,
            ]),
            member.id === ownerId && el('span', { class: 'member__role' }, ['dono']),
          ],
        ),
      ),
    ),
  ]);
}
