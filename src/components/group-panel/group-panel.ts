import './group-panel.css';

import { avatarEl, el, iconEl } from '../../lib/dom';
import { micIcon, speakerIcon } from '../../lib/icons';
import type { ChannelId, MemberId } from '../../types/models';
import { memberListContent } from '../member-list/member-list';
import type { MemberListProps } from '../member-list/member-list';
import { renderPinnedList } from '../pinned/pinned-list';
import type { PinnedListProps } from '../pinned/pinned-list';

export type AbaDoPainel = 'agora' | 'membros' | 'midia' | 'fixadas';

export interface PessoaNaSala {
  uid: MemberId;
  displayName: string;
  initials: string;
  photo?: string | undefined;
  muted: boolean;
  transmitindo: boolean;
}

export interface SalaAgora {
  id: ChannelId;
  nome: string;
  pessoas: PessoaNaSala[];
  /** Eu estou conectado nesta sala? */
  estouAqui: boolean;
}

export interface GroupPanelProps {
  aba: AbaDoPainel;
  /** Etapa 5d: as abas que a PESSOA quer ver (pelo menos uma), na ordem de sempre. */
  abas: AbaDoPainel[];
  onAba: (aba: AbaDoPainel) => void;
  /** Só as salas de voz com alguém dentro. */
  salas: SalaAgora[];
  onEntrar: (channelId: ChannelId) => void;
  membros: MemberListProps;
  fixadas: PinnedListProps;
  /** 0.8.0: a aba Mídia (galeria do grupo) — monta só quando é a aba aberta. */
  midia?: () => HTMLElement;
  /** Cartão do grupo (etapa 3a), no topo da aba Agora. */
  cartao?: HTMLElement;
}

const NOMES: Record<AbaDoPainel, string> = { agora: 'Agora', membros: 'Membros', midia: 'Mídia', fixadas: 'Fixadas' };

/**
 * Painel da direita do grupo (proposta A): abas Agora, Membros e Fixadas.
 *
 * Continua sendo a `.members` de sempre — a mesma coluna 4, a mesma gaveta da
 * direita no celular —, só que com abas por cima.
 */
export function renderGroupPanel(props: GroupPanelProps): HTMLElement {
  const aoVivo = props.salas.some((sala) => sala.pessoas.some((p) => p.transmitindo));

  const abas = el(
    'div',
    { class: 'group-panel__tabs', role: 'tablist', 'aria-label': 'Painel do grupo' },
    (Object.keys(NOMES) as AbaDoPainel[]).filter((aba) => props.abas.includes(aba)).map((aba) => {
      const botao = el(
        'button',
        {
          class: `group-panel__tab${aba === props.aba ? ' is-active' : ''}`,
          type: 'button',
          role: 'tab',
          'aria-selected': aba === props.aba ? 'true' : 'false',
        },
        [NOMES[aba], aba === 'agora' && aoVivo && el('span', { class: 'group-panel__live-dot' })],
      );
      botao.addEventListener('click', () => props.onAba(aba));
      return botao;
    }),
  );

  const conteudo =
    props.aba === 'membros'
      ? memberListContent(props.membros)
      : props.aba === 'fixadas'
        ? [renderPinnedList(props.fixadas)]
        : props.aba === 'midia'
          ? props.midia === undefined ? [] : [props.midia()]
        : [...(props.cartao === undefined ? [] : [props.cartao]), ...agora(props.salas, props.onEntrar)];

  return el('aside', { class: 'members group-panel', 'aria-label': NOMES[props.aba] }, [
    abas,
    el('div', { class: 'members__body column-scroll scroll-area', role: 'tabpanel' }, conteudo),
  ]);
}

function agora(salas: SalaAgora[], onEntrar: (channelId: ChannelId) => void): HTMLElement[] {
  if (salas.length === 0) {
    return [
      el('p', { class: 'group-panel__empty' }, [
        'Ninguém em chamada agora. Entre numa sala de voz e a turma aparece aqui.',
      ]),
    ];
  }
  return salas.map((sala) => {
    const quemTransmite = sala.pessoas.find((p) => p.transmitindo);
    const entrar = el('button', { class: 'group-panel__join', type: 'button' }, [
      quemTransmite !== undefined ? 'Assistir' : 'Entrar na sala',
    ]);
    entrar.addEventListener('click', () => onEntrar(sala.id));

    return el('section', { class: `group-panel__room${quemTransmite ? ' is-live' : ''}` }, [
      el('header', { class: 'group-panel__room-head' }, [
        iconEl(speakerIcon(15)),
        el('span', { class: 'group-panel__room-name' }, [sala.nome]),
        quemTransmite !== undefined && el('span', { class: 'group-panel__live' }, ['AO VIVO']),
      ]),
      quemTransmite !== undefined &&
        el('p', { class: 'group-panel__sharing' }, [`${quemTransmite.displayName} está transmitindo`]),
      el(
        'ul',
        { class: 'group-panel__people' },
        sala.pessoas.map((p) =>
          el('li', { class: 'group-panel__person', 'data-profile-uid': p.uid, tabindex: 0 }, [
            avatarEl(p.initials, 'sm', '', p.photo, p.uid),
            el('span', { class: 'group-panel__person-name' }, [p.displayName]),
            p.muted && el('span', { class: 'group-panel__muted', title: 'Microfone desligado' }, [iconEl(micIcon(13))]),
          ]),
        ),
      ),
      !sala.estouAqui && entrar,
    ]);
  });
}
