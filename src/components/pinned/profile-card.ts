import './profile-card.css';

import { action } from '../home/friends-screen';
import { el } from '../../lib/dom';
import { renderPersonCard } from '../person-card/person-card';
import type { MemberId, UserProfile } from '../../types/models';

export interface ProfileCardProps {
  friendUid: MemberId;
  /** Perfil PÚBLICO da pessoa — não o meu. É dele que a cor e a fonte vêm. */
  profile: UserProfile | undefined;
  /** Id do vínculo de amizade, para "Desfazer amizade" — ausente some o botão (defensivo: o PV só abre com amigo). */
  friendshipId: string | null;
  blocked: boolean;
  onBlock: (uid: MemberId) => void;
  onUnblock: (uid: MemberId) => void;
  onRemove: (friendshipId: string) => void;
}

/**
 * Terço de cima do painel do PV: o cartão de perfil da OUTRA pessoa — a
 * mesma peça da prévia de Configurações (person-card.ts), com a cor e a
 * fonte que ELA escolheu, mais os botões de bloquear e desfazer amizade.
 */
export function renderProfileCard(props: ProfileCardProps): HTMLElement {
  const { profile, friendUid, friendshipId, blocked, onBlock, onUnblock, onRemove } = props;

  const actions = el('div', { class: 'profile-card__actions' }, [
    action(
      blocked ? 'Desbloquear' : 'Bloquear',
      () => (blocked ? onUnblock(friendUid) : onBlock(friendUid)),
      true,
    ),
    friendshipId !== null &&
      action('Desfazer amizade', () => onRemove(friendshipId), true),
  ]);

  const card = renderPersonCard(
    {
      displayName: profile?.displayName ?? 'Usuário',
      initials: profile?.initials ?? '?',
      username: profile?.username,
      bio: profile?.bio,
      accentId: profile?.accentId,
      brilho: profile?.brilho,
      fontId: profile?.fontId,
      photo: profile?.photo,
      banner: profile?.banner,
      cardBg: profile?.cardBg,
      customStatus: profile?.customStatus,
      links: profile?.links,
    },
    [actions],
  );
  card.classList.add('profile-card');
  return card;
}
