import './channel-list.css';

import { avatarEl, corDoCargo, el, iconEl, iconeDoCargo } from '../../lib/dom';
import { bellOffIcon, chevronDownIcon, micIcon, speakerIcon } from '../../lib/icons';
import { renderCallBar } from '../call-bar/call-bar';
import type { CallBarProps } from '../call-bar/call-bar';
import { renderLoading } from '../empty-state/empty-state';
import { bolinha } from '../bolinha/bolinha';
import { channelSections } from '../../lib/channel-layout';
import type { Channel, ChannelId, Group, Insignia } from '../../types/models';

export interface ChannelListProps {
  /** Grupo ativo; `null` enquanto nenhum está selecionado. */
  group: Group | null;
  /** Canais do grupo ativo, já ordenados pela camada de dados. */
  channels: Channel[];
  channelsLoaded: boolean;
  /** Canal de TEXTO que estou lendo. */
  activeChannelId: ChannelId | null;
  /** Canal de VOZ em que estou conectado. Seleção independente da de texto. */
  activeVoiceChannelId: ChannelId | null;
  onSelectChannel: (channelId: ChannelId) => void;
  /** Conecta na voz e abre a sala; no canal já conectado, só volta para a sala. */
  onEnterVoice: (channelId: ChannelId) => void;
  /** Quantas pessoas o grupo tem — embaixo do nome, no cabeçalho. */
  memberCount?: number;
  /** Recebe o próprio botão, para o menu se ancorar nele. */
  onOpenGroupMenu: (anchor: HTMLElement) => void;
  /** Faixa de chamada em andamento; ausente quando a sala está na tela. */
  callBar?: CallBarProps;
  /** Quem está em cada canal de voz, por id de canal. */
  voiceRosters: Map<ChannelId, VoicePresenceView[]>;
  /** Não lidas (0.4.5) de cada canal de texto. */
  naoLidas?: (channelId: ChannelId) => number;
  /** 0.11.0: o canal está silenciado (apagado, sino riscado, bolinha cinza). */
  silenciado?: (channelId: ChannelId) => boolean;
}

/** Uma pessoa na lista indentada sob um canal de voz. */
export interface VoicePresenceView {
  uid: string;
  displayName: string;
  initials: string;
  photo?: string | undefined;
  muted: boolean;
  /** Está transmitindo a tela agora. */
  sharingScreen: boolean;
  /** 0.8.5: cor e ícone do cargo. */
  insignia?: Insignia | undefined;
}

/**
 * Um item de canal.
 *
 * Texto e voz usam estados visuais DIFERENTES de propósito: `is-active` é o
 * canal que estou lendo, `is-connected` é o canal de voz em que estou. Os dois
 * podem estar acesos ao mesmo tempo, porque são seleções independentes.
 */
function channelButton(
  channel: Channel,
  state: 'idle' | 'active' | 'connected',
  onSelect: (id: ChannelId) => void,
  roster?: VoicePresenceView[],
  naoLidas = 0,
  silenciado = false,
): HTMLElement {
  const isVoice = channel.kind === 'voice';
  const stateClass = `${state === 'active' ? ' is-active' : state === 'connected' ? ' is-connected' : ''}${naoLidas > 0 && !silenciado ? ' tem-nao-lidas' : ''}${silenciado ? ' is-silenciado' : ''}`;

  const button = el(
    'button',
    {
      class: `channel${stateClass}`,
      type: 'button',
      'aria-current': state === 'active' ? 'true' : undefined,
      'aria-pressed': isVoice ? String(state === 'connected') : undefined,
      title: isVoice
        ? state === 'connected'
          ? `Voltar para ${channel.name}`
          : `Entrar em ${channel.name}`
        : undefined,
      // Ganchos do menu de contexto — o alvo é o botão, o id vem junto.
      'data-context': 'channel',
      'data-channel-id': channel.id,
    },
    [
      isVoice
        ? iconEl(speakerIcon(15), 'icon channel__icon')
        : el('span', { class: 'channel__hash', 'aria-hidden': 'true' }, ['#']),
      channel.emoji !== undefined && el('span', { class: 'channel__emoji', 'aria-hidden': 'true' }, [channel.emoji]),
      el('span', { class: 'channel__name' }, [channel.name]),
      roster?.some((person) => person.sharingScreen) === true &&
        el('span', { class: 'channel__on-air' }, ['AO VIVO']),
      state === 'connected' && el('span', { class: 'channel__live' }, ['conectado']),
      silenciado && el('span', { class: 'silenciado-sino', title: 'Silenciado' }, [iconEl(bellOffIcon(15))]),
      bolinha(naoLidas, 'fim', silenciado),
    ],
  );
  button.addEventListener('click', () => onSelect(channel.id));
  return el('li', {}, [button, roster !== undefined && roster.length > 0 && voiceRoster(roster)]);
}

/**
 * Lista indentada de quem está no canal de voz.
 *
 * Voltou na etapa 6, agora com gente de verdade — na etapa 3 ela saiu
 * justamente por não ter dado real para mostrar. Só aparece quando há alguém:
 * um rótulo vazio sob cada canal seria ruído.
 */
function voiceRoster(people: VoicePresenceView[]): HTMLElement {
  return el(
    'ul',
    { class: 'channel__roster' },
    people.map((person) =>
      el('li', { class: 'channel__peer', title: person.displayName, 'data-profile-uid': person.uid }, [
        avatarEl(person.initials, 'xs', '', person.photo, person.uid),
        corDoCargo(el('span', { class: 'channel__peer-name' }, [person.displayName]), person),
        iconeDoCargo(person),
        person.muted &&
          el('span', { class: 'channel__peer-muted', title: 'Microfone desligado' }, [
            iconEl(micIcon(11)),
          ]),
      ]),
    ),
  );
}

/** Coluna 2 — canais de texto e de voz do grupo ativo. */
export function renderChannelList(props: ChannelListProps): HTMLElement {
  const {
    group,
    channels,
    channelsLoaded,
    activeChannelId,
    activeVoiceChannelId,
    onSelectChannel,
    onEnterVoice,
    onOpenGroupMenu,
  } = props;

  const menuButton = el(
    'button',
    {
      class: 'icon-button channels__group-menu',
      type: 'button',
      title: 'Opções do grupo',
      'aria-haspopup': 'menu',
      'aria-expanded': 'false',
    },
    [iconEl(chevronDownIcon(16)), el('span', { class: 'sr-only' }, ['Opções do grupo'])],
  );
  menuButton.addEventListener('click', () => onOpenGroupMenu(menuButton));
  menuButton.disabled = group === null;

  // Blocos (etapa 3b): sem categoria em cima ("texto"/"voz", como sempre);
  // depois cada categoria do grupo, com texto primeiro e voz depois.
  const lista = (canais: Channel[]): HTMLElement =>
    el(
      'ul',
      {},
      canais.map((channel) =>
        channel.kind === 'voice'
          ? // Canal de voz NÃO troca o canal de texto: ele conecta e abre a sala.
            channelButton(
              channel,
              channel.id === activeVoiceChannelId ? 'connected' : 'idle',
              onEnterVoice,
              props.voiceRosters.get(channel.id) ?? [],
            )
          : channelButton(
              channel,
              channel.id === activeChannelId ? 'active' : 'idle',
              onSelectChannel,
              undefined,
              props.naoLidas?.(channel.id) ?? 0,
              props.silenciado?.(channel.id) ?? false,
            ),
      ),
    );

  const sections: (HTMLElement | false)[] = channelSections(channels, group?.categories ?? []).flatMap((bloco) => {
    if (bloco.category === null) {
      return [
        bloco.text.length > 0 &&
          el('section', { class: 'channels__section' }, [el('h2', { class: 'section-title' }, ['texto']), lista(bloco.text)]),
        bloco.voice.length > 0 &&
          el('section', { class: 'channels__section' }, [el('h2', { class: 'section-title' }, ['voz']), lista(bloco.voice)]),
      ];
    }
    // Categoria vazia não aparece na coluna (só nas Configurações do grupo).
    if (bloco.text.length + bloco.voice.length === 0) return [];
    return [
      el('section', { class: 'channels__section channels__section--category', 'data-category-id': bloco.category.id }, [
        el('h2', { class: 'section-title' }, [bloco.category.name]),
        lista([...bloco.text, ...bloco.voice]),
      ]),
    ];
  });

  // Enquanto os canais não chegam, mostra "carregando" em vez de piscar vazio.
  const body =
    !channelsLoaded && group !== null
      ? [renderLoading()]
      : channels.length === 0 && group !== null
        ? [el('p', { class: 'channels__empty' }, ['Nenhum canal ainda.'])]
        : sections;

  return el('aside', { class: 'channels', 'aria-label': 'Canais' }, [
    el('header', { class: 'channels__header' }, [
      el('div', { class: 'channels__title' }, [
        el('span', { class: 'channels__group-name', title: group?.name ?? '' }, [
          group?.name ?? 'Loftchat',
        ]),
        props.memberCount !== undefined &&
          el('span', { class: 'channels__meta' }, [
            props.memberCount === 1 ? '1 membro' : `${props.memberCount} membros`,
          ]),
      ]),
      menuButton,
    ]),

    el('div', { class: 'channels__body column-scroll scroll-area' }, body),

    // O meu cartão e a faixa da chamada: no pé da coluna (app.ts, peDaColuna).
    props.callBar !== undefined && renderCallBar(props.callBar, 'desktop'),
  ]);
}
