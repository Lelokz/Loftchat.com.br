import './profile-card.css';

import { action } from '../home/friends-screen';
import { avatarEl, el } from '../../lib/dom';
import { personTheme } from '../../lib/person-theme';
import type { MemberId, UserProfile } from '../../types/models';

export interface ProfileCardProps {
  friendUid: MemberId;
  /** Perfil PÚBLICO da pessoa — não o meu. É dele que o tema/cor/fonte vêm (Entrega 3). */
  profile: UserProfile | undefined;
  /** Id do vínculo de amizade, para "Desfazer amizade" — ausente some o botão (defensivo: o PV só abre com amigo). */
  friendshipId: string | null;
  blocked: boolean;
  onBlock: (uid: MemberId) => void;
  onUnblock: (uid: MemberId) => void;
  onRemove: (friendshipId: string) => void;
}

/**
 * Terço de cima do painel do PV: o cartão de perfil da OUTRA pessoa.
 *
 * O CARTÃO USA O TEMA DELA, NÃO O MEU — ela escolheu, eu estou vendo o
 * perfil dela. `personTheme` devolve as variáveis CSS já resolvidas (com o
 * padrão seguro quando ela não escolheu nada); aqui elas são aplicadas como
 * `style` no elemento RAIZ do cartão, que é o único lugar onde entram: CSS
 * custom properties cascateiam só para dentro da própria subárvore, então
 * nada disto vaza para o resto da tela — sem precisar de nenhuma técnica de
 * contenção além dessa.
 */
export function renderProfileCard(props: ProfileCardProps): HTMLElement {
  const { profile, friendUid, friendshipId, blocked, onBlock, onUnblock, onRemove } = props;
  const nome = profile?.displayName ?? 'Usuário';
  const arroba = profile?.username;
  const bio = profile?.bio;

  const theme = personTheme(profile);

  const actions = el('div', { class: 'profile-card__actions' }, [
    action(
      blocked ? 'Desbloquear' : 'Bloquear',
      () => (blocked ? onUnblock(friendUid) : onBlock(friendUid)),
      true,
    ),
    friendshipId !== null &&
      action('Desfazer amizade', () => onRemove(friendshipId), true),
  ]);

  const card = el('div', { class: 'profile-card' }, [
    avatarEl(profile?.initials ?? '?', 'xl'),
    el('div', { class: 'profile-card__identity' }, [
      el('span', { class: 'profile-card__name' }, [nome]),
      arroba === undefined || arroba === ''
        ? false
        : el('span', { class: 'profile-card__handle' }, [`@${arroba}`]),
    ]),
    el('p', { class: 'profile-card__bio' }, [
      bio === undefined || bio === '' ? 'Sem descrição.' : bio,
    ]),
    actions,
  ]);

  for (const [name, value] of Object.entries(theme.cssVars)) card.style.setProperty(name, value);
  if (theme.fontFamily !== undefined) card.style.fontFamily = theme.fontFamily;

  return card;
}
