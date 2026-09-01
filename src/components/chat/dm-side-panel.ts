import './dm-side-panel.css';

import { el } from '../../lib/dom';
import { renderProfileCard } from '../pinned/profile-card';
import type { ProfileCardProps } from '../pinned/profile-card';
import { renderPinnedList } from '../pinned/pinned-list';
import type { PinnedListProps } from '../pinned/pinned-list';

export interface DmSidePanelProps {
  profileCard: ProfileCardProps;
  /**
   * No PV os DOIS participantes podem fixar e desafixar — ao contrário do
   * grupo (só o dono), não há condição nenhuma para calcular aqui.
   */
  pinnedList: Omit<PinnedListProps, 'canUnpin'>;
}

/**
 * Coluna 4 no PV — terço de cima o cartão de perfil, dois terços de baixo a
 * lista de fixadas, sempre visível (sem clique, ao contrário do grupo).
 *
 * Reaproveita `.members` (mesma classe do painel de grupo): herda largura,
 * superfície e borda esquerda de member-list.css sem duplicar CSS de
 * coluna — só a divisão em duas linhas (`--dm`) é nova.
 */
export function renderDmSidePanel(props: DmSidePanelProps): HTMLElement {
  return el('aside', { class: 'members members--dm', 'aria-label': 'Perfil e fixadas' }, [
    el('div', { class: 'members__profile column-scroll scroll-area' }, [
      renderProfileCard(props.profileCard),
    ]),
    el('div', { class: 'members__pinned' }, [
      // A linha acima já separa do perfil; isto diz o que tem embaixo dela
      // — mesmo estilo de "Mensagens diretas" em home-column.ts, ajuste
      // pós-etapa-19 (o estado vazio já existia, só faltava o título).
      el('span', { class: 'members__pinned-label' }, ['Mensagens fixadas']),
      renderPinnedList({ ...props.pinnedList, canUnpin: true }),
    ]),
  ]);
}
