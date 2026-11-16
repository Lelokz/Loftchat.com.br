/**
 * Estado da aplicação e as assinaturas do Firestore que o alimentam.
 *
 * O store é o único dono dos listeners: quem troca o grupo ativo não precisa
 * saber que existem inscrições para cancelar.
 */

import { firstTextChannel } from '../lib/channel-layout';
import type { ChannelCategory } from '../lib/channel-layout';
import type { User } from 'firebase/auth';
import type { Unsubscribe } from 'firebase/firestore';

import { isPermissionDenied, messagesErrorMessage } from '../lib/firestore-errors';
import { pairId, subscribeBlocks, subscribeFriendships, publicProfile } from '../lib/friends';
import { loadProfileArt } from '../lib/profile';
import {
  subscribeChannels,
  subscribeDmMessages,
  subscribeDmThreads,
  subscribeGroupMembers,
  subscribeMessages,
  subscribeMyGroups,
  subscribePinnedChannelMessages,
  subscribePinnedDmMessages,
  subscribeVoiceParticipants,
  MAX_MESSAGE_PAGES,
} from '../lib/firestore';
import {
  askOtherTabs,
  isLive,
  joinVoiceChannel,
  VOICE_ROOM_LIMIT,
} from '../lib/voice-presence';
import type { PresenceSession } from '../lib/voice-presence';
import { clearMySignals } from '../lib/voice-signaling';
import { startVoiceEngine } from '../lib/voice-engine';
import type { PeerDiagnostic, ScreenAudioExtra, VoiceEngine } from '../lib/voice-engine';
import type {
  Channel,
  DmMessage,
  DmThread,
  Friendship,
  Group,
  Member,
  MemberId,
  Message,
  PinnedMessage,
  UserProfile,
  VoiceParticipant,
} from '../types/models';

/**
 * A chamada de voz em andamento.
 *
 * Guarda o GRUPO junto porque a chamada sobrevive à troca de grupo: estando em
 * outro grupo, os canais daquele não estão carregados e nada mais saberia dizer
 * de onde é a chamada.
 *
 * `channelName` é uma cópia congelada no momento de conectar, pelo mesmo motivo.
 * Quando o grupo ativo É o da chamada, quem mostra usa o nome ao vivo da lista
 * de canais — assim renomear aparece na hora, e o congelado só vale quando não
 * há alternativa.
 */
export interface VoiceSession {
  groupId: string;
  channelId: string;
  channelName: string;
}

export interface AppState {
  user: User;

  /**
   * A casinha ou um grupo.
   *
   * É uma VISÃO, não uma rota: trocar entre elas troca o conteúdo das colunas e
   * nada mais. Em especial não desmonta o app nem chama `dispose()` — que é o
   * que derrubaria uma chamada de voz em andamento (a lição da etapa 8).
   */
  view: 'home' | 'group';

  /** Vínculos de amizade onde eu apareço: aceitos e pendentes, nos dois sentidos. */
  friendships: Friendship[];
  /** Uids que eu bloqueei. Só EU leio a minha lista. */
  blockedUids: MemberId[];
  /** Perfis públicos de quem aparece na tela de amigos, pelo uid. */
  friendProfiles: Map<MemberId, UserProfile>;

  /**
   * Minhas conversas privadas, mais recente primeiro — a coluna 2 lê daqui,
   * sem nunca tocar em `dmMessages` (ver `subscribeDmThreads`).
   */
  dmThreads: DmThread[];
  dmThreadsLoaded: boolean;
  /**
   * Uid do amigo cujo PV está aberto na coluna 3 — ou `null` (tela de
   * amigos). Fica DENTRO de `view === 'home'`: não é um terceiro valor de
   * `view`, é o que decide o que a home mostra na coluna 3.
   */
  activeDmUid: MemberId | null;

  /**
   * Histórico do PV aberto. Fatia PRÓPRIA, separada de `messages` — um
   * canal de grupo pode continuar carregado ao mesmo tempo (a chamada de
   * voz de grupo sobrevive à troca para o PV), e as duas não podem
   * colidir na mesma fatia.
   */
  dmMessages: DmMessage[];
  dmMessagesLoaded: boolean;
  /** Mesma ideia de `messagePages`, só que para o PV. */
  dmMessagePages: number;
  dmMessagesLoadingOlder: boolean;
  dmMessagesAtStart: boolean;
  dmMessagesAtPageCap: boolean;
  dmMessagesError: string | null;

  /**
   * Fixadas do PV aberto — etapa 19. Fatia PRÓPRIA, separada de
   * `pinnedMessages` (grupo), pelo MESMO motivo de `dmMessages` vs.
   * `messages`: as duas assinaturas podem estar vivas ao mesmo tempo
   * (`activeDmUid` sobrevive a uma troca de `view`, ver `openDm`/`closeDm`),
   * então uma fatia só não bastaria sem perder dado de um dos dois lados.
   */
  pinnedDmMessages: PinnedMessage[];
  pinnedDmMessagesLoaded: boolean;

  groups: Group[];
  groupsLoaded: boolean;
  activeGroupId: string | null;

  channels: Channel[];
  channelsLoaded: boolean;
  /** Canal de TEXTO que estou lendo. */
  activeChannelId: string | null;

  /** Chamada em andamento, ou null. Independente do canal de texto. */
  voice: VoiceSession | null;
  /**
   * Quem está nos canais de voz do grupo ativo — só os VIVOS.
   *
   * Fantasma (lastSeen além de 45s) já sai daqui filtrado, para nenhuma tela
   * precisar lembrar de filtrar. Ver lib/voice-presence.ts.
   */
  voiceParticipants: VoiceParticipant[];
  /**
   * O que a coluna do meio mostra.
   *
   * É isto que separa "estou conectado" de "estou olhando a sala". Com a sala
   * aberta, `activeChannelId` continua apontando para o canal de texto — e é
   * exatamente por isso que voltar para o chat não desconecta.
   */
  centerView: 'chat' | 'voice';
  /** Meu microfone está mudo? Estado local, espelhado no documento de presença. */
  voiceMuted: boolean;
  /** Entrei sem microfone: ouço, mas não falo. */
  voiceMicDenied: boolean;
  /** O navegador recusou tocar o áudio sozinho; a sala oferece um botão. */
  voiceAudioBlocked: boolean;
  /**
   * Uids com quem a conexão direta não fechou.
   *
   * Mesmo com TURN (etapa 11) isto acontece, e ficar em silêncio seria o pior
   * desfecho: você veria a pessoa na sala e não entenderia por que não ouve.
   */
  voiceFailedPeers: string[];
  /**
   * Uids de quem está mandando vídeo para mim.
   *
   * Existe para a sala re-renderizar quando a FAIXA chega. O roster diz quem
   * está transmitindo, mas a conexão de vídeo pode ficar pronta depois — e sem
   * um render nesse momento o elemento de vídeo nunca seria encaixado no palco.
   * Foi exatamente o que quebrou quem entrava no meio de uma transmissão.
   */
  voiceVideoPeers: string[];
  /** Estou transmitindo a tela? */
  screenSharing: boolean;
  /** O que estou compartilhando ("Tela inteira", "Janela"…), para eu conferir. */
  screenLabel: string | null;
  /** Pedi o som do sistema e o navegador não deu. */
  screenAudioMissing: boolean;
  /** A transmissão ocupa a tela toda. */
  screenMaximized: boolean;
  /**
   * O motor de voz terminou de subir?
   *
   * A sala aparece assim que o roster chega, mas o motor ainda está pedindo o
   * microfone e limpando a sinalização velha. Sem este campo, o botão de
   * compartilhar tela fica clicável nesse intervalo e NÃO FAZ NADA — o pior
   * desfecho possível, porque não há nem erro para explicar.
   */
  voiceReady: boolean;
  /**
   * O motor de voz não subiu.
   *
   * Sem isto a sala aparecia com gente na lista e nenhum áudio, sem nada
   * explicando — o pior tipo de meio-funcionando. Fica na tela até sair e
   * entrar de novo.
   */
  voiceEngineError: string | null;

  members: Member[];
  membersLoaded: boolean;

  messages: Message[];
  messagesLoaded: boolean;
  /**
   * Quantas páginas de 50 estão carregadas neste canal.
   *
   * Paginar é REABRIR o listener com um limite maior — uma fonte só, sem
   * mesclar e sem lacuna. Ver `MAX_MESSAGE_PAGES` em lib/firestore.ts para o
   * custo, que cresce ao quadrado.
   */
  messagePages: number;
  /** Uma página está em voo — trava o gatilho de rolagem e mostra o indicador. */
  messagesLoadingOlder: boolean;
  /** Chegamos ao começo do canal: não há mais o que buscar. */
  messagesAtStart: boolean;
  /** Bati no teto de páginas — é diferente de ter chegado ao começo. */
  messagesAtPageCap: boolean;
  /**
   * Falha ao LER as mensagens, já traduzida.
   *
   * Existe para "índice em construção" e "sem permissão" não virarem uma lista
   * vazia — que seria indistinguível de um canal realmente sem mensagens.
   */
  messagesError: string | null;

  /** Fixadas do canal ativo — etapa 19. Ver o comentário em `pinnedDmMessages`. */
  pinnedMessages: PinnedMessage[];
  pinnedMessagesLoaded: boolean;
}

export interface Store {
  getState(): AppState;
  subscribe(listener: (state: AppState) => void): () => void;
  /** Troca o grupo ativo. `channelId` força a seleção assim que os canais chegarem. */
  focusGroup(groupId: string, channelId?: string): void;
  setActiveChannel(channelId: string): void;
  /** Carrega a página anterior do histórico. Idempotente e com teto. */
  loadOlderMessages(): void;
  /**
   * Abre o PV com este amigo — não cria a conversa, só assina o histórico
   * (que pode estar vazio, se ninguém mandou a primeira mensagem ainda).
   */
  openDm(friendUid: MemberId): void;
  /** Volta para a tela de amigos, sem fechar a assinatura do PV — reabrir é instantâneo. */
  closeDm(): void;
  /** Carrega a página anterior do histórico do PV. Idempotente e com teto. */
  loadOlderDmMessages(): void;
  /** Troca entre a tela inicial e a visão de grupo. Nunca derruba a voz. */
  setView(view: 'home' | 'group'): void;
  /**
   * Clique num canal de voz: conecta e abre a sala. Se já for este canal, só
   * volta para a sala — desconectar é pelo botão vermelho ou pela faixa.
   *
   * Devolve o motivo da RECUSA (sala cheia, outra aba) ou null quando entrou.
   * Quem chama decide como mostrar; o store não conhece toast nem tela.
   */
  enterVoice(channelId: string): Promise<string | null>;
  disconnectVoice(): void;
  /** Volta para a sala da chamada, trocando de grupo se ela for de outro. */
  openVoiceRoom(): void;
  toggleMute(): void;
  /** Depois de um gesto da pessoa, tenta tocar o áudio de novo. */
  retryVoiceAudio(): void;
  /** Estado das conexões, para o painel de diagnóstico. */
  voiceDiagnostics(): Promise<PeerDiagnostic[]>;
  /**
   * Liga ou desliga a transmissão de tela.
   *
   * Devolve o motivo da recusa, ou null. Precisa vir de um clique:
   * `getDisplayMedia` exige gesto do usuário.
   *
   * `janela` só vem no app de computador: `escolherFonte` roda antes de
   * capturar (o seletor; `false` = desistiu) e `audioDoPc` traz o som do PC
   * quando a captura vem sem ele.
   */
  toggleScreenShare(janela?: {
    escolherFonte: () => Promise<boolean>;
    audioDoPc: () => Promise<ScreenAudioExtra | null>;
  }): Promise<string | null>;
  setScreenMaximized(maximized: boolean): void;
  /** O elemento de vídeo de quem está transmitindo — ou null. */
  screenVideoElement(): HTMLVideoElement | null;
  /** Meu próprio vídeo, para a miniatura de conferência. */
  localScreenStream(): MediaStream | null;
  /**
   * Quem começou ou parou de falar.
   *
   * Fica FORA do estado de propósito: o analisador roda a cada quadro e isso
   * re-renderizaria a sala dezenas de vezes por segundo. Quem ouve mexe na
   * classe do bloco direto.
   */
  onSpeaking(listener: (uid: string, speaking: boolean) => void): () => void;
  dispose(): void;
}

/**
 * O navegador sabe compartilhar tela?
 *
 * Navegador de CELULAR não tem `getDisplayMedia` — compartilhar tela é exclusivo
 * de desktop, e não adianta oferecer um botão que só pode falhar.
 */
export function screenShareSupported(): boolean {
  return typeof navigator.mediaDevices?.getDisplayMedia === 'function';
}

/** "Tela inteira", "Janela" ou "Aba" — o que confirma que compartilhei o certo. */
function describeSurface(surface: string, label: string): string {
  const kind =
    surface === 'monitor'
      ? 'Tela inteira'
      : surface === 'window'
        ? 'Janela'
        : surface === 'browser'
          ? 'Aba do navegador'
          : 'Compartilhando';
  // O label do navegador ajuda quando existe, mas é cru ("screen:0:0").
  return label === '' || label.startsWith('screen:') ? kind : `${kind} — ${label}`;
}

/**
 * Primeiro canal de texto NA ORDEM DA TELA (categorias da etapa 3b
 * incluídas); se não houver, o primeiro de qualquer tipo.
 */
function pickDefaultChannel(channels: Channel[], categories: ChannelCategory[] = []): string | null {
  const firstText = firstTextChannel(channels, categories);
  return (firstText ?? channels[0])?.id ?? null;
}

export function createStore(user: User, onListenerError: (error: unknown) => void): Store {
  let state: AppState = {
    user,
    groups: [],
    groupsLoaded: false,
    activeGroupId: null,
    channels: [],
    channelsLoaded: false,
    activeChannelId: null,
    voice: null,
    voiceParticipants: [],
    centerView: 'chat',
    voiceMuted: false,
    voiceMicDenied: false,
    voiceAudioBlocked: false,
    view: 'group',
    friendships: [],
    blockedUids: [],
    friendProfiles: new Map(),
    dmThreads: [],
    dmThreadsLoaded: false,
    activeDmUid: null,
    dmMessages: [],
    dmMessagesLoaded: false,
    dmMessagePages: 1,
    dmMessagesLoadingOlder: false,
    dmMessagesAtStart: false,
    dmMessagesAtPageCap: false,
    dmMessagesError: null,
    pinnedDmMessages: [],
    pinnedDmMessagesLoaded: false,
    voiceFailedPeers: [],
    voiceVideoPeers: [],
    screenSharing: false,
    screenLabel: null,
    screenAudioMissing: false,
    screenMaximized: false,
    voiceReady: false,
    voiceEngineError: null,
    members: [],
    membersLoaded: false,
    messages: [],
    messagesLoaded: false,
    messagePages: 1,
    messagesLoadingOlder: false,
    messagesAtStart: false,
    messagesAtPageCap: false,
    messagesError: null,
    pinnedMessages: [],
    pinnedMessagesLoaded: false,
  };

  const listeners = new Set<(state: AppState) => void>();
  const notify = (): void => {
    for (const listener of listeners) listener(state);
  };
  const patch = (next: Partial<AppState>): void => {
    state = { ...state, ...next };
    notify();
  };

  let stopChannels: Unsubscribe | null = null;
  let stopMembers: Unsubscribe | null = null;
  let stopMessages: Unsubscribe | null = null;
  let stopVoiceRoster: Unsubscribe | null = null;
  let stopDmMessages: Unsubscribe | null = null;
  let stopPinnedMessages: Unsubscribe | null = null;
  let stopPinnedDmMessages: Unsubscribe | null = null;

  /* ------------------------------------------------------------------------ */
  /* Presença de voz                                                          */
  /* ------------------------------------------------------------------------ */

  /** Minha sessão de presença, enquanto conectado. */
  let presence: PresenceSession | null = null;

  /** O motor de WebRTC, enquanto conectado. */
  let engine: VoiceEngine | null = null;

  const speakingListeners = new Set<(uid: string, speaking: boolean) => void>();

  /** Reconcilia as conexões com quem está na sala. Ver decisão 2 do motor. */
  function syncEngineWithRoster(): void {
    const voice = state.voice;
    if (engine === null || voice === null) return;
    engine.syncPeers(
      state.voiceParticipants
        .filter((p) => p.channelId === voice.channelId)
        .map((p) => p.uid),
    );
  }

  /** Desliga a chamada por inteiro: motor, presença e estado. */
  async function stopVoice(): Promise<void> {
    const dying = engine;
    engine = null;
    await dying?.destroy().catch((error: unknown) => {
      console.error('Falha ao encerrar a chamada.', error);
    });
    await presence?.leave();
    presence = null;
  }

  /**
   * O roster CRU, como veio do banco.
   *
   * O estado guarda só os vivos, mas o filtro depende do relógio — e o relógio
   * não dispara evento no Firestore. Por isso o cru fica aqui e é reavaliado
   * também por tempo, senão um fantasma ficaria na tela até alguém mexer em
   * outra coisa.
   */
  let rawVoice: VoiceParticipant[] = [];

  /**
   * O roster mudou de um jeito que a tela precisa notar?
   *
   * CADA CAMPO MOSTRADO PRECISA ESTAR AQUI. `sharingScreen` faltava, e o
   * sintoma foi cruel: começar a transmitir não aparecia para ninguém, porque
   * esta função dizia "nada mudou" e o estado nunca era atualizado. Ao
   * acrescentar campo ao participante, acrescente aqui também.
   */
  const sameRoster = (a: VoiceParticipant[], b: VoiceParticipant[]): boolean =>
    a.length === b.length &&
    a.every((p, i) => {
      const other = b[i];
      return (
        other !== undefined &&
        p.uid === other.uid &&
        p.channelId === other.channelId &&
        p.muted === other.muted &&
        p.sharingScreen === other.sharingScreen
      );
    });

  function refreshVoiceParticipants(): void {
    const live = rawVoice.filter((participant) => isLive(participant.lastSeen));
    if (sameRoster(live, state.voiceParticipants)) return;
    patch({ voiceParticipants: live });
    // O roster é a ÚNICA fonte de quem deve ter conexão — inclusive quando
    // alguém some por fantasma expirado, que aqui é só mais um uid a menos.
    syncEngineWithRoster();
    resolveSharingCollision();
  }

  /**
   * Dois transmitindo ao mesmo tempo: o de uid MAIOR para sozinho.
   *
   * A checagem antes de começar não fecha a corrida — regra não conta
   * documentos, e duas pessoas podem clicar no mesmo instante. Mas o roster
   * mostra as duas em seguida, e a mesma regra determinística que decide quem
   * oferta resolve isto sem ninguém precisar combinar nada.
   */
  function resolveSharingCollision(): void {
    if (!state.screenSharing || state.voice === null) return;
    const sharers = state.voiceParticipants.filter(
      (p) => p.channelId === state.voice?.channelId && p.sharingScreen,
    );
    if (sharers.length < 2) return;
    if (sharers.every((p) => p.uid >= user.uid)) return;

    void engine?.stopScreenShare();
    patch({ screenSharing: false, screenLabel: null, screenMaximized: false });
    void presence?.setSharingScreen(false).catch(() => {});
  }

  /* --- amizade e bloqueio ------------------------------------------------ */

  /**
   * Os perfis públicos de quem aparece na tela de amigos.
   *
   * Buscados sob demanda e GUARDADOS: cada um é um `getDoc`, e refazer a leitura
   * a cada snapshot de amizade transformaria a tela num moinho de leituras — o
   * mesmo cuidado que fez a etapa 13 pôr teto na paginação.
   */
  const profileCache = new Map<MemberId, UserProfile>();

  async function ensureProfiles(uids: MemberId[]): Promise<void> {
    const faltando = uids.filter((uid) => uid !== '' && !profileCache.has(uid));
    if (faltando.length === 0) return;

    await Promise.all(
      faltando.map(async (uid) => {
        // O banner e o fundo moram em `profileArt/` (etapa 2b): vêm juntos,
        // porque o cartão do PV é feito destes perfis.
        const [perfil, art] = await Promise.all([
          publicProfile(uid).catch(() => null),
          loadProfileArt(uid).catch(() => ({})),
        ]);
        if (perfil !== null) Object.assign(perfil, art);
        // Guarda até o "não achei", como um perfil mínimo: sem isso, um uid sem
        // documento seria buscado de novo a cada render.
        profileCache.set(
          uid,
          perfil ?? { uid, displayName: 'Usuário', initials: '?', createdAt: '' },
        );
      }),
    );
    patch({ friendProfiles: new Map(profileCache) });
  }

  const stopFriendships = subscribeFriendships(
    user.uid,
    (friendships) => {
      patch({ friendships });
      void ensureProfiles(friendships.flatMap((f) => f.members));
    },
    (error) => console.error('Falha ao ler as amizades.', error),
  );

  const stopBlocks = subscribeBlocks(
    user.uid,
    (blocks) => {
      const blockedUids = blocks.map((block) => block.blockedUid);
      patch({ blockedUids });
      void ensureProfiles(blockedUids);
    },
    (error) => console.error('Falha ao ler a lista de bloqueados.', error),
  );

  /*
   * A lista de conversas assina SEMPRE, não só quando o PV está aberto — a
   * coluna 2 (home-column) precisa dela mesmo com um grupo ativo, e o mesmo
   * `ensureProfiles` já usado por amizade/bloqueio cobre o perfil do outro
   * lado de cada conversa, sem leitura nova.
   */
  const stopDmThreads = subscribeDmThreads(
    user.uid,
    (dmThreads) => {
      patch({ dmThreads, dmThreadsLoaded: true });
      void ensureProfiles(dmThreads.flatMap((t) => t.members));
    },
    (error) => console.error('Falha ao ler as conversas privadas.', error),
  );

  // Reavaliação por tempo: é o que faz o fantasma sumir da tela sem depender de
  // nenhuma escrita no banco.
  const ghostSweep = window.setInterval(refreshVoiceParticipants, 5000);

  /** Canal a selecionar assim que a lista de canais do grupo novo chegar. */
  let pendingChannelId: string | null = null;

  /* ------------------------------------------------------------------------ */
  /* Perder acesso a um grupo não é falha — é informação                       */
  /*                                                                          */
  /* Quando o dono apaga um grupo, a membership dos outros some ANTES do doc   */
  /* do grupo (a cascata precisa dessa ordem). No instante seguinte, os        */
  /* listeners de canais, membros e mensagens de quem estava com o grupo       */
  /* aberto passam a receber permission-denied.                                */
  /*                                                                          */
  /* Tratar isso como erro encheria o console e piscaria "Você não tem acesso" */
  /* na tela de alguém que não fez nada de errado. O significado real é outro: */
  /* eu não estou mais neste grupo. Então o store sai dele e cai no próximo.   */
  /* ------------------------------------------------------------------------ */

  /**
   * Grupos cujo acesso caiu, para não voltar a selecioná-los.
   *
   * Sem isto haveria laço infinito quando só existe um grupo: sair dele deixaria
   * activeGroupId nulo, o listener de grupos escolheria o primeiro disponível —
   * o mesmo — e o erro voltaria. Some sozinho quando o grupo deixa a lista.
   */
  const lostAccess = new Set<string>();

  function handleGroupAccessLost(groupId: string): void {
    // A chamada cai junto, mesmo que eu esteja olhando outro grupo: sem o
    // grupo, aquela sala não existe mais para mim.
    if (state.voice?.groupId === groupId) {
      void stopVoice();
      patch({ voice: null, centerView: 'chat' });
    }
    if (state.activeGroupId !== groupId) return;
    lostAccess.add(groupId);
    const next = state.groups.find((g) => g.id !== groupId && !lostAccess.has(g.id));
    selectGroup(next?.id ?? null);
  }

  /**
   * Erro de listener preso a um grupo específico.
   *
   * O erro já chega rotulado da camada de dados (ver listenerError), com o
   * `code` preservado — que é o que esta decisão examina.
   */
  const groupListenerError =
    (groupId: string) =>
    (error: unknown): void => {
      if (isPermissionDenied(error)) {
        handleGroupAccessLost(groupId);
        return;
      }
      onListenerError(error);
    };

  /**
   * Assina as fixadas do canal ativo — etapa 19.
   *
   * Chamada de DENTRO de `watchMessages`, só quando `pages === 1` (troca de
   * canal de verdade, não "carregar anteriores"): fixadas não dependem de
   * paginação do histórico, então reabrir este listener a cada página
   * carregada seria uma assinatura descartada à toa, com um pisca de
   * "carregando" no meio do caminho.
   */
  function watchPinnedMessages(groupId: string | null, channelId: string | null): void {
    stopPinnedMessages?.();
    stopPinnedMessages = null;

    if (groupId === null || channelId === null) {
      patch({ pinnedMessages: [], pinnedMessagesLoaded: true });
      return;
    }

    patch({ pinnedMessagesLoaded: false });
    stopPinnedMessages = subscribePinnedChannelMessages(
      groupId,
      channelId,
      (pinnedMessages) => patch({ pinnedMessages, pinnedMessagesLoaded: true }),
      (error) => {
        console.error('Falha ao ler as fixadas do canal.', error);
        patch({ pinnedMessages: [], pinnedMessagesLoaded: true });
      },
    );
  }

  /**
   * Assina as mensagens do canal de texto ativo.
   *
   * Precisa do grupo além do canal: a consulta restringe os dois, senão as
   * regras recusam a leitura inteira. Ver subscribeMessages.
   */
  function watchMessages(channelId: string | null, pages = 1): void {
    stopMessages?.();
    stopMessages = null;

    const groupId = state.activeGroupId;
    if (channelId === null || groupId === null) {
      patch({ messages: [], messagesLoaded: true, messagesError: null });
      if (pages === 1) watchPinnedMessages(null, null);
      return;
    }

    /*
     * TROCAR DE CANAL ZERA A PAGINAÇÃO.
     *
     * Sem isto o canal novo abriria já com N páginas — leituras que ninguém
     * pediu, no canal errado, com o custo quadrático da tabela em
     * `MAX_MESSAGE_PAGES`.
     */
    if (pages === 1) {
      patch({
        messages: [],
        messagesLoaded: false,
        messagePages: 1,
        messagesAtStart: false,
        messagesAtPageCap: false,
        messagesError: null,
      });
      watchPinnedMessages(groupId, channelId);
    }

    stopMessages = subscribeMessages(
      groupId,
      channelId,
      pages,
      (messages, atStart) =>
        patch({
          messages,
          messagesLoaded: true,
          messagesLoadingOlder: false,
          messagesAtStart: atStart,
          messagesAtPageCap: pages >= MAX_MESSAGE_PAGES,
          messagesError: null,
        }),
      (error) => {
        // Perdi o acesso ao grupo inteiro: não é erro de leitura, é saída.
        if (isPermissionDenied(error)) {
          handleGroupAccessLost(groupId);
          return;
        }
        // O listener morre no primeiro erro; a tela precisa dizer o motivo.
        console.error('Falha ao ler as mensagens do canal.', error);
        patch({
          messages: [],
          messagesLoaded: true,
          messagesLoadingOlder: false,
          messagesError: messagesErrorMessage(error),
        });
      },
    );
  }

  /**
   * Carrega a página anterior do histórico.
   *
   * Reabre o listener com o limite maior. Sai cedo em três casos, e cada um é um
   * jeito diferente de "não há o que buscar": já tem uma em voo, já chegamos ao
   * começo do canal, ou batemos no teto de páginas.
   */
  function loadOlderMessages(): void {
    if (state.messagesLoadingOlder || state.messagesAtStart) return;
    if (state.messagePages >= MAX_MESSAGE_PAGES) return;
    if (state.activeChannelId === null) return;

    const pages = state.messagePages + 1;
    patch({ messagesLoadingOlder: true, messagePages: pages });
    watchMessages(state.activeChannelId, pages);
  }

  function selectChannel(channelId: string | null): void {
    if (channelId === state.activeChannelId) return;
    patch({ activeChannelId: channelId });
    watchMessages(channelId);
  }

  /* --- conversas privadas -------------------------------------------------- */

  /** Assina as fixadas do PV aberto. Mesma disciplina de `watchPinnedMessages`, ver lá. */
  function watchPinnedDmMessages(threadId: string | null): void {
    stopPinnedDmMessages?.();
    stopPinnedDmMessages = null;

    if (threadId === null) {
      patch({ pinnedDmMessages: [], pinnedDmMessagesLoaded: true });
      return;
    }

    patch({ pinnedDmMessagesLoaded: false });
    stopPinnedDmMessages = subscribePinnedDmMessages(
      threadId,
      (pinnedDmMessages) => patch({ pinnedDmMessages, pinnedDmMessagesLoaded: true }),
      (error) => {
        console.error('Falha ao ler as fixadas da conversa.', error);
        patch({ pinnedDmMessages: [], pinnedDmMessagesLoaded: true });
      },
    );
  }

  /**
   * Assina o histórico de UM PV. Fatia própria (`dmMessages*`), separada da
   * de grupo — ver o comentário em `AppState.dmMessages`.
   *
   * Sem `handleGroupAccessLost`-equivalente aqui de propósito: `dmMessages`
   * não tem cascata de grupo para perder acesso a. Se aparecer
   * permission-denied na LEITURA, é falha de verdade — a regra de `read` não
   * depende de bloqueio nenhum (a conversa antiga continua legível depois de
   * bloquear; só a ESCRITA é que a regra nega).
   */
  function watchDmMessages(threadId: string | null, pages = 1): void {
    stopDmMessages?.();
    stopDmMessages = null;

    if (threadId === null) {
      patch({ dmMessages: [], dmMessagesLoaded: true, dmMessagesError: null });
      if (pages === 1) watchPinnedDmMessages(null);
      return;
    }

    if (pages === 1) {
      patch({
        dmMessages: [],
        dmMessagesLoaded: false,
        dmMessagePages: 1,
        dmMessagesAtStart: false,
        dmMessagesAtPageCap: false,
        dmMessagesError: null,
      });
      watchPinnedDmMessages(threadId);
    }

    stopDmMessages = subscribeDmMessages(
      threadId,
      pages,
      (dmMessages, atStart) =>
        patch({
          dmMessages,
          dmMessagesLoaded: true,
          dmMessagesLoadingOlder: false,
          dmMessagesAtStart: atStart,
          dmMessagesAtPageCap: pages >= MAX_MESSAGE_PAGES,
          dmMessagesError: null,
        }),
      (error) => {
        console.error('Falha ao ler as mensagens do PV.', error);
        patch({
          dmMessages: [],
          dmMessagesLoaded: true,
          dmMessagesLoadingOlder: false,
          dmMessagesError: messagesErrorMessage(error),
        });
      },
    );
  }

  function selectGroup(groupId: string | null): void {
    if (groupId === state.activeGroupId) return;

    // 1. derruba os listeners do grupo anterior
    stopChannels?.();
    stopChannels = null;
    stopMembers?.();
    stopMembers = null;
    stopMessages?.();
    stopMessages = null;
    stopPinnedMessages?.();
    stopPinnedMessages = null;
    stopVoiceRoster?.();
    stopVoiceRoster = null;
    rawVoice = [];

    // 2. zera as fatias do grupo e volta os `loaded` para false — é isto que
    //    impede piscar "grupo vazio" durante a troca.
    //
    //    A VOZ NÃO CAI AQUI. A chamada é de um grupo, não do grupo que eu estou
    //    olhando: sair para dar uma espiada em outro grupo não derruba ninguém
    //    da chamada. A coluna do meio volta para o chat, e a faixa no rodapé é o
    //    caminho de volta para a sala.
    state = {
      ...state,
      activeGroupId: groupId,
      channels: [],
      channelsLoaded: false,
      activeChannelId: null,
      voiceParticipants: [],
      centerView: 'chat',
      members: [],
      membersLoaded: false,
      messages: [],
      messagesLoaded: false,
      messagesError: null,
      pinnedMessages: [],
      pinnedMessagesLoaded: false,
    };
    notify();

    if (groupId === null) return;

    // 3. abre os listeners do grupo novo
    stopChannels = subscribeChannels(
      groupId,
      (channels, loaded) => {
        let activeChannelId = state.activeChannelId;

        if (pendingChannelId !== null && channels.some((c) => c.id === pendingChannelId)) {
          activeChannelId = pendingChannelId;
          pendingChannelId = null;
        }

        // 4. se não há canal de texto ativo válido (troca de grupo, ou o canal
        //    foi apagado), escolhe de novo pela mesma regra
        const stillThere =
          activeChannelId !== null && channels.some((c) => c.id === activeChannelId);
        if (!stillThere) {
          const grupo = state.groups.find((g) => g.id === state.activeGroupId);
          activeChannelId = pickDefaultChannel(channels, grupo?.categories);
        }

        // O canal da chamada pode ter sido apagado — mas só dá para saber isso
        // do grupo dela. Se a chamada é de outro grupo, ela fica como está.
        let voice = state.voice;
        let centerView = state.centerView;
        if (
          voice !== null &&
          voice.groupId === groupId &&
          !channels.some((c) => c.id === voice?.channelId && c.kind === 'voice')
        ) {
          voice = null;
          centerView = 'chat';
        }

        const channelChanged = activeChannelId !== state.activeChannelId;
        patch({ channels, channelsLoaded: loaded, activeChannelId, voice, centerView });
        if (channelChanged) watchMessages(activeChannelId);
      },
      groupListenerError(groupId),
    );

    stopMembers = subscribeGroupMembers(
      groupId,
      (members, loaded) => patch({ members, membersLoaded: loaded }),
      groupListenerError(groupId),
    );

    // Uma assinatura para TODOS os canais de voz do grupo: a coluna mostra a
    // lista sob cada canal ao mesmo tempo, e a checagem de sala cheia precisa
    // do canal antes de eu entrar nele.
    stopVoiceRoster = subscribeVoiceParticipants(
      groupId,
      (participants) => {
        rawVoice = participants;
        refreshVoiceParticipants();
      },
      groupListenerError(groupId),
    );
  }

  const stopGroups = subscribeMyGroups(
    user.uid,
    (groups, loaded) => {
      patch({ groups, groupsLoaded: loaded });

      // Um grupo que saiu da lista já não precisa da marca de acesso perdido.
      for (const id of lostAccess) {
        if (!groups.some((g) => g.id === id)) lostAccess.delete(id);
      }

      /*
       * NÃO decida o grupo ativo com a lista incompleta.
       *
       * `loaded` é falso enquanto há membership esperando confirmação do
       * servidor. Um grupo recém-criado fica invisível nesse intervalo — e sem
       * esta linha o bloco abaixo concluiria "o grupo ativo sumiu" e jogaria a
       * pessoa de volta no grupo anterior. Criar o segundo grupo não levava
       * você para ele.
       */
      if (!loaded) return;

      // O grupo ativo sumiu (fui removido, ou ele foi apagado) — ou ainda não
      // há nenhum selecionado. Cai para o primeiro disponível, ou para nada.
      const available = groups.filter((g) => !lostAccess.has(g.id));
      const activeStillThere =
        state.activeGroupId !== null && available.some((g) => g.id === state.activeGroupId);
      if (!activeStillThere) selectGroup(available[0]?.id ?? null);
    },
    onListenerError,
  );

  return {
    getState: () => state,

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    focusGroup(groupId, channelId) {
      pendingChannelId = channelId ?? null;
      if (groupId === state.activeGroupId) {
        // Já estou nele: aplica o canal direto, se ele já existe na lista.
        if (channelId !== undefined && state.channels.some((c) => c.id === channelId)) {
          pendingChannelId = null;
          selectChannel(channelId);
        }
        return;
      }
      selectGroup(groupId);
    },

    /** Trocar o canal de texto devolve a coluna do meio ao chat, sem desconectar. */
    loadOlderMessages,

    openDm(friendUid) {
      if (friendUid === state.activeDmUid) return;
      patch({ activeDmUid: friendUid });
      watchDmMessages(pairId(user.uid, friendUid));
    },

    /*
     * NÃO desliga `stopDmMessages` — só troca de PV para OUTRO PV (ou para o
     * grupo) faz isso, em `openDm`/`dispose`. Voltar para a tela de amigos é
     * navegação, não saída: a mesma regra que já vale para grupo e canal.
     */
    closeDm() {
      patch({ activeDmUid: null });
    },

    loadOlderDmMessages() {
      if (state.dmMessagesLoadingOlder || state.dmMessagesAtStart) return;
      if (state.dmMessagePages >= MAX_MESSAGE_PAGES) return;
      if (state.activeDmUid === null) return;

      const pages = state.dmMessagePages + 1;
      patch({ dmMessagesLoadingOlder: true, dmMessagePages: pages });
      watchDmMessages(pairId(user.uid, state.activeDmUid), pages);
    },

    setView(view) {
      if (state.view === view) return;
      patch({ view });
    },

    setActiveChannel(channelId) {
      patch({ centerView: 'chat' });
      selectChannel(channelId);
    },

    /**
     * Clique num canal de voz.
     *
     * Não mexe no canal de texto: são duas seleções simultâneas. E clicar no
     * canal JÁ conectado não desconecta — só volta para a sala. Desconectar é um
     * ato explícito, pelo botão vermelho ou pela faixa; um clique a mais na
     * lista não pode derrubar uma conversa em andamento.
     */
    async enterVoice(channelId) {
      const groupId = state.activeGroupId;
      if (groupId === null) return null;

      // Já estou neste canal: só volta para a sala.
      if (state.voice?.channelId === channelId) {
        patch({ centerView: 'voice' });
        return null;
      }

      const channel = state.channels.find((c) => c.id === channelId);
      if (channel === undefined || channel.kind !== 'voice') return null;

      /*
       * Duas abas da mesma conta escreveriam no MESMO documento
       * ({channelId}_{uid}) e disputariam o heartbeat, deixando a sinalização
       * ambígua. Perguntar às outras abas acerta o caso que uma checagem por
       * documento erraria: recarregar a página deixa o documento fresco por até
       * 45s, e a aba nova acusaria "outra aba" sem haver outra aba.
       *
       * Limite honesto: enxerga só o mesmo navegador.
       */
      if (await askOtherTabs(channelId)) {
        return 'Você já está conectado neste canal em outra aba.';
      }

      const here = state.voiceParticipants.filter((p) => p.channelId === channelId);
      if (here.length >= VOICE_ROOM_LIMIT && !here.some((p) => p.uid === user.uid)) {
        return `Sala cheia — o limite é ${VOICE_ROOM_LIMIT} pessoas.`;
      }

      // Trocar de canal de voz é sair de um e entrar no outro.
      await stopVoice();

      /*
       * LIMPA A SINALIZAÇÃO VELHA ANTES DE ANUNCIAR PRESENÇA.
       *
       * A ordem aqui é o conserto de uma corrida real: quem já está na sala vê
       * o recém-chegado aparecer no roster e oferta NA HORA. Se a limpeza
       * rodasse depois, essa oferta cairia dentro da janela de exclusão — o
       * recém-chegado apagaria a oferta que acabou de receber e ficaria
       * esperando para sempre, sem áudio e sem vídeo.
       *
       * Fazendo antes, não há o que apagar por engano: eu ainda não existo para
       * ninguém. E o listener, ao subir, entrega os documentos que já estavam
       * lá — atraso não perde nada, só exclusão perde.
       */
      await clearMySignals(channelId, groupId, user.uid).catch((error: unknown) => {
        console.error('Falha ao limpar a sinalização anterior.', error);
      });

      try {
        presence = await joinVoiceChannel(user, groupId, channelId, {
          onDisplaced: () => {
            void stopVoice();
            patch({ voice: null, centerView: 'chat' });
          },
        });
      } catch (error) {
        console.error('Não foi possível entrar no canal de voz.', error);
        return 'Não foi possível entrar no canal de voz.';
      }

      patch({
        voice: { groupId, channelId, channelName: channel.name },
        centerView: 'voice',
        voiceMuted: false,
        voiceMicDenied: false,
        voiceAudioBlocked: false,
        voiceFailedPeers: [],
        voiceVideoPeers: [],
        voiceReady: false,
        voiceEngineError: null,
      });

      try {
        engine = await startVoiceEngine({
          channelId,
          groupId,
          myUid: user.uid,
          onError: onListenerError,
          callbacks: {
            onSpeaking: (uid, speaking) => {
              for (const listener of speakingListeners) listener(uid, speaking);
            },
            onPeersChanged: () => {
              const failedNow = engine?.failedPeers() ?? [];
              const videoNow = engine?.peersWithVideo() ?? [];
              // Só toca no estado quando MUDA: onconnectionstatechange dispara
              // várias vezes por conexão durante a negociação.
              const patchNext: Partial<AppState> = {};
              if (failedNow.join() !== state.voiceFailedPeers.join()) {
                patchNext.voiceFailedPeers = failedNow;
              }
              if (videoNow.join() !== state.voiceVideoPeers.join()) {
                patchNext.voiceVideoPeers = videoNow;
              }
              if (Object.keys(patchNext).length > 0) patch(patchNext);
            },
            onAudioBlocked: () => patch({ voiceAudioBlocked: true }),
            // O botão NATIVO do navegador parou a transmissão. Sem isto o app
            // continuaria dizendo que eu transmito, e o meu documento mentiria
            // para todo mundo no canal.
            onScreenShareEnded: () => {
              patch({ screenSharing: false, screenLabel: null, screenMaximized: false });
              void presence?.setSharingScreen(false);
            },
          },
        });
      } catch (error) {
        console.error('Não foi possível iniciar o áudio.', error);
        // Persistente na sala, não só um toast que some: a sala continua na
        // tela e precisa dizer por que está muda.
        patch({
          voiceEngineError:
            'Não foi possível iniciar o áudio desta sala. Saia e entre de novo.',
        });
        return 'Não foi possível iniciar o áudio da chamada.';
      }

      patch({ voiceReady: true, voiceMicDenied: engine.micDenied() });
      syncEngineWithRoster();
      return null;
    },

    disconnectVoice() {
      if (state.voice === null) return;
      void stopVoice();
      patch({
        voice: null,
        centerView: 'chat',
        voiceMicDenied: false,
        voiceAudioBlocked: false,
        voiceFailedPeers: [],
        // Sair do canal é o terceiro caminho de parar a transmissão.
        screenSharing: false,
        screenLabel: null,
        screenMaximized: false,
        voiceReady: false,
        voiceEngineError: null,
      });
    },

    /**
     * Volta para a sala. Estando em outro grupo, troca de grupo antes; estando
     * na tela inicial, sai dela — sem isto a faixa clicada de lá ficava presa
     * atrás da tela de amigos, com `centerView` já apontando para a sala que
     * ninguém via.
     */
    openVoiceRoom() {
      const voice = state.voice;
      if (voice === null) return;
      if (voice.groupId !== state.activeGroupId) selectGroup(voice.groupId);
      patch({ view: 'group', centerView: 'voice' });
    },

    toggleMute() {
      const muted = !state.voiceMuted;
      patch({ voiceMuted: muted });
      // Desliga a faixa de áudio DE VERDADE — o ícone sozinho não cala ninguém.
      engine?.setMuted(muted);
      // E publica: é assim que os outros veem.
      void presence?.setMuted(muted).catch((error: unknown) => {
        console.error('Não foi possível publicar o estado do microfone.', error);
      });
    },

    retryVoiceAudio() {
      void engine?.retryAudio().then(() => patch({ voiceAudioBlocked: false }));
    },

    async voiceDiagnostics() {
      return (await engine?.diagnostics()) ?? [];
    },

    async toggleScreenShare(janela) {
      if (engine === null) return null;

      if (engine.isSharing()) {
        await engine.stopScreenShare();
        patch({ screenSharing: false, screenLabel: null, screenMaximized: false });
        await presence?.setSharingScreen(false).catch(() => {});
        return null;
      }

      if (!screenShareSupported()) {
        return 'Este navegador não permite compartilhar tela. Use o Loftchat no computador.';
      }

      const other = state.voiceParticipants.find(
        (p) => p.channelId === state.voice?.channelId && p.sharingScreen && p.uid !== user.uid,
      );
      if (other !== undefined) {
        return 'Alguém já está transmitindo neste canal.';
      }

      if (janela !== undefined && !(await janela.escolherFonte())) return null;

      let capture;
      try {
        capture = await engine.startScreenShare(janela?.audioDoPc);
      } catch (error) {
        console.error('Não foi possível compartilhar a tela.', error);
        return 'Não foi possível compartilhar a tela.';
      }
      // Fechar o seletor é desistência, não falha: nada de erro na tela.
      if (capture === null) return null;

      patch({
        screenSharing: true,
        screenLabel: describeSurface(capture.surface, capture.label),
        screenAudioMissing: !capture.hasAudio,
      });
      await presence?.setSharingScreen(true).catch(() => {});
      return null;
    },

    setScreenMaximized(maximized) {
      patch({ screenMaximized: maximized });
    },

    /**
     * O vídeo de quem o ROSTER diz que está transmitindo.
     *
     * Perguntar ao motor "quem tem vídeo" parece mais direto e está ERRADO: com
     * transceiver fixo o `ontrack` de vídeo dispara já na primeira negociação,
     * com faixa ainda sem mídia, então todo par conectado responde que sim. Ver
     * o `ontrack` em lib/voice-engine.ts.
     *
     * A faixa pode chegar depois do documento; quem cobre esse intervalo é
     * `voiceVideoPeers`, que re-renderiza a sala quando ela chega.
     */
    screenVideoElement() {
      const sharer = state.voiceParticipants.find(
        (p) => p.channelId === state.voice?.channelId && p.sharingScreen && p.uid !== user.uid,
      );
      if (sharer === undefined || engine === null) return null;
      return engine.videoElementOf(sharer.uid);
    },

    localScreenStream: () => engine?.localScreen() ?? null,

    onSpeaking(listener) {
      speakingListeners.add(listener);
      return () => speakingListeners.delete(listener);
    },

    dispose() {
      stopFriendships();
      stopBlocks();
      stopDmThreads();
      stopDmMessages?.();
      stopPinnedDmMessages?.();
      stopGroups();
      stopChannels?.();
      stopMembers?.();
      stopMessages?.();
      stopPinnedMessages?.();
      stopVoiceRoster?.();
      window.clearInterval(ghostSweep);
      // Sair da conta com uma chamada aberta tem que tirar você da sala dos
      // outros — senão você vira fantasma até os 45s do heartbeat.
      void stopVoice();
      speakingListeners.clear();
      listeners.clear();
    },
  };
}
