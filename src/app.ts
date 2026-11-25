import { el, iconEl } from './lib/dom';
import { menuIcon } from './lib/icons';
import { renderChannelList } from './components/channel-list/channel-list';
import type { VoicePresenceView } from './components/channel-list/channel-list';
import { renderCallBar } from './components/call-bar/call-bar';
import { renderSessionFooter } from './components/session-footer/session-footer';
import { avisarBandeja, botoesDaJanela, duploCliqueNaBarra, quandoAJanelaLigar } from './lib/janela';
import type { CallBarProps } from './components/call-bar/call-bar';
import { renderChat } from './components/chat/chat';
import type { ChatParts } from './components/chat/chat';
import { renderDmBlockedNotice, renderDmChat } from './components/chat/dm-chat';
import type { DmChatParts, DmFriendView } from './components/chat/dm-chat';
import { renderDmSidePanel } from './components/chat/dm-side-panel';
import { renderComposer } from './components/chat/composer/composer';
import { citationState, renderMessageList } from './components/chat/message-list/message-list';
import { renderReplyBar } from './components/chat/reply-bar/reply-bar';
import { openPinnedMessagesPanel } from './components/pinned/pinned-list';
import type { PinnedPanel } from './components/pinned/pinned-list';
import {
  renderLoading,
  renderMessagesError,
  renderNoGroups,
  renderNoMessages,
} from './components/empty-state/empty-state';
import { renderGroupBar } from './components/group-bar/group-bar';
import { openSettings } from './components/settings/settings';
import type { Secao as SettingsSection } from './components/settings/settings';
import { openGroupSettings } from './components/group-settings/group-settings';
import { renderGroupCard } from './components/group-settings/group-card';
import { watchGroupBanner } from './lib/group-profile';
import { markWelcomeSeen } from './lib/welcome';
import { saveAppearance, saveTabPrefs, sortGroups, watchPrivatePrefs } from './lib/private-prefs';
import { accountAppearance, setAccountAppearance } from './lib/appearance';
import { CHAVE_GERAL, paintChatBackground, watchChatBackground } from './lib/chat-background';
import type { ChatBackground } from './lib/chat-background';
import type { GroupFolder, TabMode } from './lib/private-prefs';
import { renderWelcomeCard } from './components/welcome-card/welcome-card';
import { closePersonPopover, openPersonPopover } from './components/person-card/person-popover';
import type { Vinculo } from './components/person-card/person-popover';
import { renderHomeColumn } from './components/home/home-column';
import { renderFriendsScreen } from './components/home/friends-screen';
import type { FriendsScreenParts, FriendsScreenProps, FriendsTab } from './components/home/friends-screen';
import {
  acceptFriendRequest,
  blockUser,
  pairId,
  removeFriendship,
  sendFriendRequest,
  publicProfile,
  uidOfUsername,
  unblockUser,
} from './lib/friends';
import { renderGroupPanel } from './components/group-panel/group-panel';
import { renderRoomPanel } from './components/room-panel/room-panel';
import { acompanharChamadaNoAndroid, emAppAndroid, telaCheiaNoAndroid } from './lib/android';
import type { AbaDaSala, RoomPanelParts } from './components/room-panel/room-panel';
import { memberListContent } from './components/member-list/member-list';
import { renderPinnedList } from './components/pinned/pinned-list';
import type { AbaDoPainel, SalaAgora } from './components/group-panel/group-panel';
import { abaMidia } from './components/galeria/galeria';
import { chipsDeCargos } from './components/cargos/chips';
import { darCargo, quemConvidou } from './lib/cargos';
import { closeGroupMenu, openGroupMenu } from './components/group-menu/group-menu';
import type { GroupMenuItem } from './components/group-menu/group-menu';
import {
  openConfirmDialog,
  openCreateChannelDialog,
  openCreateGroupDialog,
  openDeleteGroupDialog,
  openInviteDialog,
  openJoinGroupDialog,
  openLeaveGroupDialog,
} from './components/modal/dialogs';
import { openVoiceDiagnostics } from './components/voice-diagnostics/voice-diagnostics';
import { renderVoiceRoom } from './components/voice-room/voice-room';
import type { RoomLayout, VoiceParticipantView } from './components/voice-room/voice-room';
import { hideToast, showToast } from './components/toast/toast';
import {
  createChannel,
  createGroup,
  groupInviteCode,
  newGroupInviteCode,
  deleteChannel,
  deleteDmMessage,
  deleteGroupCascade,
  deleteMessage,
  leaveGroup,
  pinChannelMessage,
  pinDmMessage,
  removeMember,
  loadChannels,
  buildReplyTo,
  editDmMessage,
  editMessage,
  sendDmMessage,
  sendMessage,
  unpinMessages,
} from './lib/firestore';
import { initials } from './lib/format';
import { canLeaveGroup, isOwner, OWNER_CANNOT_LEAVE } from './lib/permissions';
import { isWellFormedInviteCode } from './lib/invite-code';
import { extractInviteCode, invitePath, inviteUrl, navigate } from './lib/router';
import { isMobileLayout, onLayoutChange, trackViewportHeight } from './lib/layout';
import { installContextMenus } from './context-menus';
import { createStore, screenShareSupported } from './state/store';
import { capturarAudioDoPc, loftDesktop } from './lib/desktop';
import { openScreenPicker } from './components/screen-picker/screen-picker';
import type { AppState, Store } from './state/store';
import { MAX_PINNED_MESSAGES } from './types/models';
import { animarChegada, trocarComTransicao } from './lib/transition';
import type { PinnedMessage, ReplyTo } from './types/models';
import type { User } from 'firebase/auth';
import type { Member, MemberId, VoiceParticipant } from './types/models';
import { textoDoErro } from './lib/firestore-errors';
import { ligarAvisos } from './lib/avisos';
import { criarNaoLidas } from './lib/nao-lidas';
import { mandarArquivos, mandarVoz } from './lib/envios';
import type { Gravacao } from './lib/gravador';
import { ligarFigurinhas, usouFigurinha } from './lib/figurinhas';
import type { Figurinha } from './lib/figurinhas';
import type { Midia } from './lib/firestore';

export interface AppHandle {
  element: HTMLElement;
  /** Seleciona um grupo de fora — usado ao voltar de um convite aceito. */
  focusGroup(groupId: string): void;
  destroy(): void;
}

/** A ~80px do fim ainda conta como "estou no fim". */
const STICK_TO_BOTTOM_PX = 80;

/** Quanto tempo a mensagem apontada por uma citação fica destacada. */
const HIGHLIGHT_MS = 1600;

/** Identidade da sessão para o rodapé da coluna de canais. */
/**
 * O PV que está NA TELA agora — ou null. `activeDmUid` sozinho não basta: ele
 * continua guardado quando a pessoa vai para um grupo (para o PV voltar igual),
 * e aí mensagem, áudio, foto e figurinha iam para o PV em vez do grupo.
 */
function pvAberto(state: AppState): MemberId | null {
  return state.view === 'home' ? state.activeDmUid : null;
}

function sessionMember(user: User, username: string): Member {
  const displayName = user.displayName ?? user.email ?? 'Sem nome';
  return {
    id: user.uid,
    displayName,
    initials: initials(displayName),
    status: 'online',
    ...(username === '' ? {} : { username }),
  };
}

export function mountApp(
  user: User,
  username: string,
  onFatalError: (error: unknown) => void,
  onSignOut: () => void,
): AppHandle {
  const me = sessionMember(user, username);
  const store: Store = createStore(user, onFatalError);

  // A minha foto (etapa 2b) mora no perfil público: busca uma vez e redesenha
  // o meu cartão quando chegar.
  void publicProfile(user.uid)
    .then((perfil) => {
      if (perfil?.photo === undefined || !root.isConnected) return;
      me.photo = perfil.photo;
      previous = null;
      render(store.getState());
    })
    .catch(() => undefined);

  const root = document.createElement('div');
  root.className = 'app';

  let groupBarEl: HTMLElement | null = null;
  let channelListEl: HTMLElement | null = null;
  let memberListEl: HTMLElement | null = null;

  /**
   * Coluna do meio: ou a casca do chat, ou a sala de voz.
   *
   * `centerEl` é o que está lá agora; `centerMode` diz qual dos dois é. A casca
   * do chat é montada uma vez POR CANAL e só o slot de mensagens troca por
   * dentro — é isso que impede o texto do composer de sumir a cada mensagem que
   * chega.
   */
  let centerEl: HTMLElement | null = null;
  let centerMode: 'chat' | 'voice' | 'friends' | 'no-groups' | 'dm' | null = null;
  let chat: ChatParts | null = null;
  let chatChannelId: string | null = null;
  let friends: FriendsScreenParts | null = null;
  /** Casca do PV — mesma ideia de `chat`/`chatChannelId`, uma por PESSOA. */
  let dmChat: DmChatParts | null = null;
  let dmChatFriendUid: string | null = null;
  /** O painel flutuante de fixadas do grupo, enquanto aberto — `null` quando fechado. */
  let pinsPanel: PinnedPanel | null = null;
  /** Aba do painel da direita do grupo (Agora, Membros, Fixadas). */
  let abaDoPainel: AbaDoPainel = accountAppearance().panelFirst;
  /* Etapa 5d: as abas que eu quero no painel, e a que abre primeiro. */
  let abasDoPainel: AbaDoPainel[] = accountAppearance().panelTabs;
  let primeiraAba: AbaDoPainel = abaDoPainel;

  let previous: AppState | null = null;

  /**
   * Quem está falando agora.
   *
   * Fora do estado de propósito: o motor emite dezenas de vezes por segundo e
   * isso re-renderizaria a sala inteira. O conjunto vive aqui só para ser
   * reaplicado quando a sala é reconstruída por outro motivo.
   */
  const speaking = new Set<string>();

  /* ------------------------------------------------------------------------ */
  /* Gavetas do mobile                                                         */
  /*                                                                           */
  /* O LAYOUT é feito pela media query; isto aqui é só o estado de aberta ou    */
  /* fechada, mais a integração com o botão de voltar do Android.              */
  /* ------------------------------------------------------------------------ */

  let drawer: 'left' | 'right' | null = null;
  /** Empilhei uma entrada de histórico para esta gaveta? */
  let drawerInHistory = false;

  function setDrawer(next: 'left' | 'right' | null): void {
    if (drawer === next) return;
    drawer = next;
    root.classList.toggle('drawer-left', next === 'left');
    root.classList.toggle('drawer-right', next === 'right');

    if (next !== null && !drawerInHistory) {
      /*
       * ESTADO NOMEADO, não um pushState anônimo.
       *
       * O roteador escuta popstate. Sem o nome, ele não teria como distinguir
       * "fechei a gaveta" de "naveguei", e a rota seria reinterpretada. O
       * roteador também ignora popstate na mesma rota — as duas defesas juntas.
       */
      history.pushState({ loftDrawer: true }, '', location.href);
      drawerInHistory = true;
      return;
    }

    // Fechou por toque fora ou por botão: desfaz a entrada que eu empilhei.
    if (next === null && drawerInHistory && !closingFromPopstate) {
      drawerInHistory = false;
      history.back();
    }
  }

  /** Fechar veio do próprio popstate? Aí não dá para chamar history.back(). */
  let closingFromPopstate = false;

  const onPopState = (): void => {
    if (drawer === null) return;
    closingFromPopstate = true;
    drawerInHistory = false;
    setDrawer(null);
    closingFromPopstate = false;
  };
  window.addEventListener('popstate', onPopState);

  /** Toque fora da gaveta fecha. */
  const onPointerDownOutside = (event: PointerEvent): void => {
    if (drawer === null) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest('.channels, .home-column, .group-bar, .members') !== null && target !== null) return;
    setDrawer(null);
  };
  document.addEventListener('pointerdown', onPointerDownOutside);

  /*
   * Atravessar o breakpoint com gaveta aberta deixaria uma coluna fixa por cima
   * do desktop, e uma entrada de histórico órfã comendo um toque no voltar.
   *
   * A CHAMADA DE VOZ não precisa de nada aqui: o DOM é o mesmo nos dois modos,
   * nada desmonta, e as conexões seguem de pé. É a razão de o corte ser por
   * media query.
   */
  const stopLayoutWatch = onLayoutChange(() => {
    setDrawer(null);
    /*
     * Redesenha para a faixa de chamada trocar de lugar (rodapé da coluna no
     * desktop, acima do composer no mobile).
     *
     * Isto reconstrói DOM, e só DOM: o store, o motor de voz e os elementos de
     * áudio e vídeo são donos deles mesmos e vivem fora da árvore. Uma chamada
     * atravessa o breakpoint sem sentir.
     */
    previous = null;
    render(store.getState());
  });
  const stopViewportWatch = trackViewportHeight(() => {
    // Teclado abrindo encurta a janela: a lista tem que continuar no fim.
    const list = centerEl?.querySelector<HTMLElement>('.messages');
    if (list !== null && list !== undefined) list.scrollTop = list.scrollHeight;
  });

  /* --- ações ------------------------------------------------------------- */

  const activeGroup = (state: AppState) =>
    state.groups.find((candidate) => candidate.id === state.activeGroupId);

  /**
   * As ações de grupo recebem um id.
   *
   * O menu de contexto pode ser aberto na bolinha de um grupo que NÃO é o ativo
   * — renomear ali tem que renomear aquele, não o que está na tela.
   */
  const groupById = (groupId: string) =>
    store.getState().groups.find((candidate) => candidate.id === groupId);

  const handleCreateGroup = (): void => {
    openCreateGroupDialog(async (name) => {
      const created = await createGroup(user.uid, name);
      // Criar pelo "+" da barra de cima estando no Privado tem que ABRIR o
      // grupo novo — antes ele era criado e a tela continuava no Privado.
      store.setView('group');
      store.focusGroup(created.groupId, created.generalChannelId);
      // O código do grupo já nasce com ele (16/11/2026). Falhou? A janela
      // "Convidar pessoas" cria na hora.
      void groupInviteCode(created.groupId, name.trim(), user.uid).catch(() => {});
    });
  };

  /** O "+" ao lado dos grupos: criar um ou entrar num com o código. */
  const handleAddGroup = (anchor: HTMLElement): void => {
    openGroupMenu(anchor, [
      { label: 'Criar grupo', onSelect: handleCreateGroup },
      { label: 'Entrar num grupo', onSelect: () => openJoinGroupDialog(handleJoinByCode) },
    ]);
  };

  const handleCreateChannel = (): void => {
    const state = store.getState();
    const groupId = state.activeGroupId;
    if (groupId === null) return;
    openCreateChannelDialog(async (name, kind) => {
      await createChannel(groupId, name, kind, state.channels);
    });
  };

  const handleInvite = (): void => {
    const group = activeGroup(store.getState());
    if (group === undefined) return;
    // O nome vai junto: as regras só deixam MEMBROS lerem o doc do grupo, e quem
    // abre o convite ainda não é membro.
    openInviteDialog({
      codigo: () => groupInviteCode(group.id, group.name, user.uid),
      trocar: () => newGroupInviteCode(group.id, group.name, user.uid),
      link: inviteUrl,
    });
  };

  /** Copia o código do grupo (o mesmo de "Convidar pessoas"). */
  const handleCopyInvite = (groupId: string): void => {
    const group = groupById(groupId);
    if (group === undefined) return;
    void groupInviteCode(group.id, group.name, user.uid)
      .then((code) => navigator.clipboard.writeText(code))
      .then(() => showToast('Código do grupo copiado.'))
      .catch((error: unknown) => {
        console.error('Não foi possível copiar o convite.', error);
        showToast('Não foi possível gerar o convite.');
      });
  };

  /**
   * Banner do grupo ABERTO (etapa 3a), escutado ao vivo em `groupArt/` —
   * uma escuta só, trocada quando o grupo muda. Ao vivo porque o dono pode
   * trocar o banner com todo mundo dentro (e leitura única ficava velha).
   */
  let bannerAtual: { groupId: string; banner: string | undefined; parar: () => void } | null = null;

  function bannerDoGrupo(groupId: string): string | undefined {
    if (bannerAtual?.groupId === groupId) return bannerAtual.banner;
    bannerAtual?.parar();
    const escuta: { groupId: string; banner: string | undefined; parar: () => void } = {
      groupId,
      banner: undefined,
      parar: () => undefined,
    };
    bannerAtual = escuta;
    escuta.parar = watchGroupBanner(groupId, (banner) => {
      if (bannerAtual !== escuta || escuta.banner === banner) return;
      escuta.banner = banner;
      if (store.getState().activeGroupId === groupId && memberListEl !== null) {
        memberListEl = swap(memberListEl, buildMemberList(store.getState()));
      }
    });
    return undefined;
  }

  const handleGroupSettings = (groupId?: string): void => {
    const state = store.getState();
    const group = groupId === undefined ? activeGroup(state) : groupById(groupId);
    if (group === undefined || !isOwner(group, user.uid)) return;
    const aberto = group.id === state.activeGroupId;
    void (aberto ? Promise.resolve(state.channels) : loadChannels(group.id)).then(
      (channels) =>
        openGroupSettings({
          group,
          // De outro grupo o app não tem a lista de membros: a prévia mostra só o resto.
          memberCount: aberto ? state.members.length : 0,
          channels,
        }),
      () => showToast('Não deu para abrir as configurações do grupo agora.'),
    );
  };

  const handleLeaveGroup = (groupId?: string): void => {
    const group = groupId === undefined ? activeGroup(store.getState()) : groupById(groupId);
    if (group === undefined) return;
    openLeaveGroupDialog(group.name, async () => {
      await leaveGroup(group.id, user.uid);
    });
  };

  const handleDeleteGroup = (groupId?: string): void => {
    const group = groupId === undefined ? activeGroup(store.getState()) : groupById(groupId);
    if (group === undefined) return;
    openDeleteGroupDialog(group.name, async (onProgress) => {
      await deleteGroupCascade(group.id, user.uid, onProgress);
    });
  };

  /*
   * Desfazer amizade e bloquear PERGUNTAM antes (revisão 23/11/2026): no
   * celular um toque fora do lugar desfazia a amizade na hora, sem volta.
   */
  const nomeDoAmigo = (uid: MemberId): string =>
    store.getState().friendProfiles.get(uid)?.displayName ?? 'essa pessoa';

  const handleRemoveFriend = (friendshipId: string, uid: MemberId): void => {
    openConfirmDialog({
      title: 'Desfazer amizade',
      description: `Você e ${nomeDoAmigo(uid)} deixam de ser amigos. Dá para mandar outro pedido depois.`,
      confirmLabel: 'Desfazer amizade',
      busyLabel: 'Desfazendo…',
      failureMessage: 'Não foi possível desfazer a amizade.',
      async onConfirm(controller) {
        await removeFriendship(friendshipId);
        controller.close();
      },
    });
  };

  const handleBlock = (uid: MemberId): void => {
    openConfirmDialog({
      title: 'Bloquear',
      description:
        `${nomeDoAmigo(uid)} deixa de ser seu amigo e não consegue mais te mandar pedido nem falar com você no privado. ` +
        'Dá para desbloquear depois.',
      confirmLabel: 'Bloquear',
      busyLabel: 'Bloqueando…',
      failureMessage: 'Não foi possível bloquear.',
      async onConfirm(controller) {
        await blockUser(user.uid, uid);
        controller.close();
      },
    });
  };

  const handleDeleteChannel = (channelId: string): void => {
    const state = store.getState();
    const channel = state.channels.find((c) => c.id === channelId);
    if (channel === undefined || state.activeGroupId === null) return;
    const groupId = state.activeGroupId;

    openConfirmDialog({
      title: 'Apagar canal',
      description: `As mensagens de ${channel.name} vão junto, para todo mundo. Não dá para desfazer.`,
      confirmLabel: 'Apagar canal',
      busyLabel: 'Apagando…',
      failureMessage: 'Não foi possível apagar o canal.',
      async onConfirm(controller) {
        await deleteChannel(groupId, channelId);
        controller.close();
      },
    });
  };

  const handleRemoveMember = (memberId: MemberId): void => {
    const state = store.getState();
    const member = state.members.find((m) => m.id === memberId);
    if (member === undefined || state.activeGroupId === null) return;
    const groupId = state.activeGroupId;

    openConfirmDialog({
      title: 'Remover do grupo',
      description:
        `${member.displayName} perde o acesso às conversas deste grupo. ` +
        'As mensagens que já escreveu continuam lá.',
      confirmLabel: 'Remover',
      busyLabel: 'Removendo…',
      failureMessage: 'Não foi possível remover a pessoa.',
      async onConfirm(controller) {
        await removeMember(groupId, memberId);
        controller.close();
      },
    });
  };

  /**
   * Apaga mensagem de grupo OU de PV — a distinção é `pvAberto` (PV na tela), o
   * mesmo critério usado no resto do app (as duas telas nunca convivem).
   */
  const handleDeleteMessage = (messageId: string, sala = false): void => {
    const emDm = !sala && pvAberto(store.getState()) !== null;
    openConfirmDialog({
      title: 'Apagar mensagem',
      description: emDm
        ? 'Ela some para os dois lados da conversa. Não dá para desfazer.'
        : sala
          ? 'Ela some para todo mundo da sala. Não dá para desfazer.'
          : 'Ela some para todo mundo do canal. Não dá para desfazer.',
      confirmLabel: 'Apagar',
      busyLabel: 'Apagando…',
      failureMessage: 'Não foi possível apagar a mensagem.',
      async onConfirm(controller) {
        await (emDm ? deleteDmMessage(messageId) : deleteMessage(messageId));
        controller.close();
      },
    });
  };

  /**
   * Fixa OU desafixa — grupo ou PV, `pvAberto` decide, mesmo
   * critério do resto do app. Desafixar remove TODOS os ids daquele
   * `messageId` de uma vez (a corrida rara do PV — os dois participantes
   * fixando a mesma mensagem ao mesmo tempo — pode deixar mais de um
   * documento; ver `pinned-list.ts`).
   */
  const handleTogglePinMessage = (messageId: string, sala = false): void => {
    const state = store.getState();
    const scopePins = sala
      ? state.roomPinnedMessages
      : pvAberto(state) !== null
        ? state.pinnedDmMessages
        : state.pinnedMessages;
    const existingIds = scopePins.filter((p) => p.messageId === messageId).map((p) => p.id);

    if (existingIds.length > 0) {
      void unpinMessages(existingIds).catch((error: unknown) => {
        console.error('Falha ao desafixar a mensagem.', error);
        showToast('Não foi possível desafixar.');
      });
      return;
    }

    if (scopePins.length >= MAX_PINNED_MESSAGES) {
      showToast(`Teto de ${MAX_PINNED_MESSAGES} fixadas. Desafixe algo antes de fixar outra.`);
      return;
    }

    // Chat da sala (etapa 8b): mesma coleção, com o id do canal de voz.
    if (sala) {
      const alvo = state.roomMessages.find((m) => m.id === messageId);
      if (alvo === undefined) return;
      const autor = state.members.find((m) => m.id === alvo.authorId);
      void pinChannelMessage(alvo.groupId, alvo.channelId, alvo, autor?.displayName ?? 'Usuário', user.uid).catch(
        (error: unknown) => {
          console.error('Falha ao fixar a mensagem.', error);
          showToast('Não foi possível fixar.');
        },
      );
      return;
    }

    const friendUid = pvAberto(state);
    if (friendUid !== null) {
      const alvo = state.dmMessages.find((m) => m.id === messageId);
      if (alvo === undefined) return;
      const nome =
        alvo.authorId === user.uid ? me.displayName : friendDisplayName(state, alvo.authorId);
      void pinDmMessage(pairId(user.uid, friendUid), alvo, nome, user.uid).catch(
        (error: unknown) => {
          console.error('Falha ao fixar a mensagem.', error);
          showToast('Não foi possível fixar.');
        },
      );
      return;
    }

    if (state.activeGroupId === null || state.activeChannelId === null) return;
    const alvo = state.messages.find((m) => m.id === messageId);
    if (alvo === undefined) return;
    const autor = state.members.find((m) => m.id === alvo.authorId);
    void pinChannelMessage(
      state.activeGroupId,
      state.activeChannelId,
      alvo,
      autor?.displayName ?? 'Usuário',
      user.uid,
    ).catch((error: unknown) => {
      console.error('Falha ao fixar a mensagem.', error);
      showToast('Não foi possível fixar.');
    });
  };

  /**
   * Monta o menu do grupo pelo papel.
   *
   * O que eu não posso fazer SOME — não fica cinza. A única exceção é o dono e o
   * "Sair do grupo": esconder ali esconderia a explicação de por que não dá.
   */
  const handleOpenGroupMenu = (anchor: HTMLElement): void => {
    const state = store.getState();
    const group = activeGroup(state) ?? null;
    if (group === null) return;

    const owner = isOwner(group, user.uid);
    const items: GroupMenuItem[] = [];

    if (owner) {
      items.push(
        { label: 'Configurações do grupo', onSelect: () => handleGroupSettings() },
        { label: 'Criar canal', onSelect: handleCreateChannel },
        { label: 'Convidar pessoas', onSelect: handleInvite },
      );
    }

    // Etapa 3d: qualquer membro (dono também) dá apelido ou tira o nome da aba.
    items.push({ label: 'Apelido do grupo', onSelect: () => handleOpenSettings('grupos') });

    items.push({
      label: 'Sair do grupo',
      onSelect: handleLeaveGroup,
      separatorBefore: true,
      disabled: !canLeaveGroup(group, user.uid),
      ...(owner ? { reason: OWNER_CANNOT_LEAVE } : {}),
    });

    if (owner) {
      items.push({ label: 'Apagar grupo', onSelect: handleDeleteGroup, danger: true });
    }

    openGroupMenu(anchor, items);
  };

  /**
   * Entrar em grupo colando o link ou o código.
   *
   * Só o FORMATO é conferido aqui — nada de ida ao servidor. Passando, navega
   * para a tela de convite que já existe desde a etapa 3, que é quem sabe buscar
   * o convite, dizer de qual grupo é e tratar código que não corresponde a nada.
   *
   * Devolve a mensagem de erro para o campo, ou null quando aceitou.
   */
  const handleJoinByCode = (raw: string): string | null => {
    if (raw.trim() === '') return 'Cole o link ou o código do convite.';

    const code = extractInviteCode(raw);
    if (!isWellFormedInviteCode(code)) {
      return 'Isso não parece um convite do Loftchat. Confira o link ou o código.';
    }

    navigate(invitePath(code));
    return null;
  };

  /**
   * Entrar num canal de voz pode ser RECUSADO — sala cheia, ou outra aba minha
   * já conectada. O store devolve o motivo e a recusa aparece na tela; entrar
   * num canal e não acontecer nada seria o pior desfecho possível.
   */
  const handleEnterVoice = (channelId: string): void => {
    void store.enterVoice(channelId).then((refusal) => {
      if (refusal !== null) showToast(refusal);
    });
  };

  /**
   * Começa a responder a uma mensagem: a faixa aparece acima do composer.
   * Grupo ou PV — `pvAberto` decide onde procurar a mensagem e o
   * nome do autor, as duas telas nunca convivem.
   */
  const handleReplyToMessage = (messageId: string, sala = false): void => {
    const state = store.getState();

    if (sala) {
      const alvo = state.roomMessages.find((m) => m.id === messageId);
      if (alvo === undefined) return;
      const autor = state.members.find((m) => m.id === alvo.authorId);
      replyingToSala = buildReplyTo(alvo, autor?.displayName ?? 'Usuário');
      renderReplySala();
      painelDaSala?.element.querySelector<HTMLTextAreaElement>('.composer__input')?.focus();
      return;
    }

    if (pvAberto(state) !== null) {
      const alvo = state.dmMessages.find((m) => m.id === messageId);
      if (alvo === undefined) return;
      const nome =
        alvo.authorId === user.uid
          ? me.displayName
          : (state.friendProfiles.get(alvo.authorId)?.displayName ?? 'Usuário');
      replyingTo = buildReplyTo(alvo, nome);
      renderReplySlot();
      return;
    }

    const alvo = state.messages.find((m) => m.id === messageId);
    if (alvo === undefined) return;
    const autor = state.members.find((m) => m.id === alvo.authorId);
    replyingTo = buildReplyTo(alvo, autor?.displayName ?? 'Usuário');
    renderReplySlot();
  };

  /** Entra em edição no próprio balão. Só o autor chega aqui — ver o menu. */
  const handleEditMessage = (messageId: string): void => {
    editingId = messageId;
    render(store.getState());
  };

  /**
   * Manda pedido pela `@` EXATA.
   *
   * Busca parcial varreria a coleção de usuários inteira a cada tecla — caro e,
   * pior, transformaria o Loft num diretório de quem tem conta aqui.
   */
  /*
   * A interpretação do erro mora em `sendFriendRequest` (src/lib/friends.ts),
   * não aqui: só ela sabe qual chamada falhou (ler o par existente ou criar o
   * pedido), e é essa distinção que separa "defeito nosso" de "bloqueio de
   * verdade".
   */
  const handleAddFriend = async (username: string): Promise<'sent' | 'accepted'> => {
    const alvo = await uidOfUsername(username);
    if (alvo === null) throw new Error('Não encontramos ninguém com esse nome.');
    if (alvo === user.uid) throw new Error('Você não pode adicionar a si mesmo.');
    return await sendFriendRequest(user.uid, alvo);
  };

  const handleSend = async (body: string): Promise<void> => {
    const state = store.getState();

    /*
     * A citação é LIMPA ANTES do await, não depois.
     *
     * Depois, uma segunda mensagem digitada enquanto a primeira ainda estava
     * gravando sairia citando a mesma coisa sem que a faixa estivesse mais na
     * tela. Mesmo raciocínio da limpeza otimista do composer na etapa 4.
     */
    const citando = replyingTo ?? undefined;
    const clearReply = (): void => {
      if (replyingTo === null) return;
      replyingTo = null;
      renderReplySlot();
    };

    const friendUid = pvAberto(state);
    if (friendUid !== null) {
      clearReply();
      await sendDmMessage(user.uid, friendUid, body, citando);
      return;
    }

    if (state.activeGroupId === null || state.activeChannelId === null) return;
    const groupId = state.activeGroupId;
    const channelId = state.activeChannelId;
    clearReply();
    await sendMessage(groupId, channelId, user.uid, body, citando);
  };

  /*
   * IMAGEM, GIF E VÍDEO (0.5.0): mandados pelo +, colando ou arrastando. Cada
   * arquivo vira uma mensagem; a legenda vai com o primeiro.
   */
  const avisarErroDoArquivo = (texto: string): void => showToast(texto);
  const handleArquivos = (arquivos: File[], legenda: string): void => {
    const state = store.getState();
    const amigo = pvAberto(state);
    if (amigo !== null) {
      void mandarArquivos(`pv:${amigo}`, arquivos, legenda, (midia, texto) => sendDmMessage(user.uid, amigo, texto, undefined, midia), avisarErroDoArquivo);
      return;
    }
    if (state.activeGroupId === null || state.activeChannelId === null) return;
    const grupo = state.activeGroupId;
    const canal = state.activeChannelId;
    void mandarArquivos(`canal:${canal}`, arquivos, legenda, (midia, texto) => sendMessage(grupo, canal, user.uid, texto, undefined, midia), avisarErroDoArquivo);
  };
  const handleArquivosSala = (arquivos: File[], legenda: string): void => {
    const state = store.getState();
    const grupo = state.voice?.groupId ?? null;
    const canal = state.roomChatChannelId;
    if (grupo === null || canal === null) return;
    void mandarArquivos(`canal:${canal}`, arquivos, legenda, (midia, texto) => sendMessage(grupo, canal, user.uid, texto, undefined, midia), avisarErroDoArquivo);
  };

  /* MENSAGEM DE VOZ (0.5.5): sobe o áudio e grava a mensagem (grupo, PV ou sala). */
  const handleVoz = (gravacao: Gravacao): void => {
    const state = store.getState();
    const amigo = pvAberto(state);
    if (amigo !== null) {
      void mandarVoz(`pv:${amigo}`, gravacao, (midia) => sendDmMessage(user.uid, amigo, '', undefined, midia), avisarErroDoArquivo);
      return;
    }
    if (state.activeGroupId === null || state.activeChannelId === null) return;
    const grupo = state.activeGroupId;
    const canal = state.activeChannelId;
    void mandarVoz(`canal:${canal}`, gravacao, (midia) => sendMessage(grupo, canal, user.uid, '', undefined, midia), avisarErroDoArquivo);
  };
  const handleVozSala = (gravacao: Gravacao): void => {
    const state = store.getState();
    const grupo = state.voice?.groupId ?? null;
    const canal = state.roomChatChannelId;
    if (grupo === null || canal === null) return;
    void mandarVoz(`canal:${canal}`, gravacao, (midia) => sendMessage(grupo, canal, user.uid, '', undefined, midia), avisarErroDoArquivo);
  };

  /* FIGURINHA (0.5.0): vai como mensagem pequena, sem balão, e entra nas recentes. */
  const figurinhaComoMidia = (f: Figurinha): Midia => ({
    kind: 'sticker',
    attachment: { url: f.url, fileName: 'figurinha', mimeType: 'image/webp', sizeBytes: 0, largura: f.largura, altura: f.altura },
  });
  const handleFigurinha = (f: Figurinha): void => {
    void usouFigurinha(f).catch(() => undefined);
    const state = store.getState();
    const amigo = pvAberto(state);
    const enviar =
      amigo !== null
        ? sendDmMessage(user.uid, amigo, '', undefined, figurinhaComoMidia(f))
        : state.activeGroupId !== null && state.activeChannelId !== null
          ? sendMessage(state.activeGroupId, state.activeChannelId, user.uid, '', undefined, figurinhaComoMidia(f))
          : Promise.resolve();
    void enviar.catch(() => showToast('Não deu para mandar a figurinha.'));
  };
  const handleFigurinhaSala = (f: Figurinha): void => {
    const state = store.getState();
    const grupo = state.voice?.groupId ?? null;
    const canal = state.roomChatChannelId;
    if (grupo === null || canal === null) return;
    void usouFigurinha(f).catch(() => undefined);
    void sendMessage(grupo, canal, user.uid, '', undefined, figurinhaComoMidia(f)).catch(() => showToast('Não deu para mandar a figurinha.'));
  };

  /** Envia no chat da sala (etapa 8b): o canal de voz em que estou, no grupo da chamada. */
  const handleSendSala = async (body: string): Promise<void> => {
    const state = store.getState();
    const groupId = state.voice?.groupId ?? null;
    const channelId = state.roomChatChannelId;
    if (groupId === null || channelId === null) return;
    const citando = replyingToSala ?? undefined;
    if (replyingToSala !== null) {
      replyingToSala = null;
      renderReplySala();
    }
    await sendMessage(groupId, channelId, user.uid, body, citando);
  };

  /** A faixa de "respondendo a…" do chat da sala. */
  function renderReplySala(): void {
    const slot = painelDaSala?.replySlot;
    if (slot === undefined) return;
    if (replyingToSala === null) {
      slot.replaceChildren();
      return;
    }
    slot.replaceChildren(
      renderReplyBar({
        replyTo: replyingToSala,
        onCancel: () => {
          replyingToSala = null;
          renderReplySala();
        },
      }),
    );
  }

  /** Põe (ou tira) a faixa de resposta acima do composer — do chat ou do PV, o que estiver na tela. */
  function renderReplySlot(): void {
    const slot = pvAberto(store.getState()) !== null ? dmChat?.replySlot : chat?.replySlot;
    if (slot === undefined || slot === null) return;
    if (replyingTo === null) {
      slot.replaceChildren();
      return;
    }
    slot.replaceChildren(
      renderReplyBar({
        replyTo: replyingTo,
        onCancel: () => {
          replyingTo = null;
          renderReplySlot();
        },
      }),
    );
  }

  /** Configurações em tela inteira. Salvar o perfil atualiza o meu cartão na hora. */
  function handleOpenSettings(section?: SettingsSection, fundoCanal?: { id: string; label: string }): void {
    setDrawer(null);
    const state = store.getState();
    openSettings({
      ...(fundoCanal === undefined ? {} : { fundoCanal }),
      user,
      onSignOut,
      groups: sortGroups(state.groups, ordemDosGrupos),
      groupLabels: rotulosDosGrupos,
      tabMode: jeitoDasAbas,
      folders: pastas,
      ...(section === undefined ? {} : { section }),
      onSaved: (perfil) => {
        me.displayName = perfil.displayName;
        me.initials = perfil.initials;
        if (perfil.username === undefined) delete me.username;
        else me.username = perfil.username;
        if (perfil.photo === undefined) delete me.photo;
        else me.photo = perfil.photo;
        previous = null;
        render(store.getState());
      },
    });
  }

  /* --- render das colunas ------------------------------------------------ */

  function buildGroupBar(state: AppState): HTMLElement {
    const barra = renderGroupBarComJanela(state);
    duploCliqueNaBarra(barra);
    return barra;
  }

  function renderGroupBarComJanela(state: AppState): HTMLElement {
    return renderGroupBar({
      groups: sortGroups(state.groups, ordemDosGrupos),
      groupLabels: rotulosDosGrupos,
      tabMode: jeitoDasAbas,
      onReorder: reordenarGrupos,
      folders: pastas,
      openFolders: pastasAbertas,
      onToggleFolder: alternarPasta,
      onReorderInFolder: reordenarNaPasta,
      activeGroupId: state.activeGroupId,
      naoLidas,
      homeActive: state.view === 'home',
      onOpenHome: () => {
        setDrawer(null);
        store.setView('home');
      },
      onSelectGroup: (groupId) => {
        setDrawer(null);
        // Clicar num grupo SAI da tela inicial — e isso é só troca de visão:
        // nada é desmontado, então uma chamada de voz em curso continua.
        store.setView('group');
        store.focusGroup(groupId);
      },
      onCreateGroup: handleAddGroup,
      me,
      onSignOut,
      onOpenSettings: () => handleOpenSettings(),
      cartao: isMobileLayout(),
      botoesDaJanela: botoesDaJanela(),
    });
  }

  /**
   * O PÉ DA COLUNA DA ESQUERDA, no PC (24/11/2026, como no Discord): a faixa
   * da chamada (se houver) e, embaixo dela, o meu cartão — nome, @,
   * Configurações e sair. No celular o cartão continua na barra de cima.
   */
  function peDaColuna(faixa: HTMLElement | null): HTMLElement {
    return el('div', { class: 'coluna-pe' }, [faixa, renderSessionFooter(me, onSignOut, () => handleOpenSettings())]);
  }

  /**
   * Nome do canal da chamada.
   *
   * Ao vivo quando o grupo da chamada é o que está aberto — assim renomear
   * aparece na hora. Fora dele, vale a cópia congelada: os canais daquele grupo
   * nem estão carregados.
   */
  function voiceChannelName(state: AppState): string {
    const voice = state.voice;
    if (voice === null) return '';
    if (voice.groupId !== state.activeGroupId) return voice.channelName;
    return state.channels.find((c) => c.id === voice.channelId)?.name ?? voice.channelName;
  }

  /**
   * A sala está mesmo na tela?
   *
   * `centerView` sozinho NÃO BASTA: ele guarda a intenção de voltar para a
   * sala ao reabrir o grupo (é o que faz `.callbar__back` funcionar depois de
   * trocar de grupo, e clicar de novo no grupo da chamada cair direto nela) —
   * de propósito sobrevive à tela inicial, então continua 'voice' por lá. Mas
   * a tela inicial NUNCA mostra a sala, não importa o que `centerView` diga
   * (ver o retorno antecipado de `state.view === 'home'` em `render()`). Por
   * isso esta função pareia os dois: é o único lugar que decide "a sala está
   * na tela", e `buildCallBar` e `showRoom` (dentro de `render()`) usam os
   * dois o mesmo resultado — divergir aqui é o defeito que fez a faixa sumir
   * na tela inicial sem a chamada ter caído.
   */
  function isViewingRoom(state: AppState): boolean {
    const voice = state.voice;
    return (
      voice !== null &&
      state.view !== 'home' &&
      state.centerView === 'voice' &&
      voice.groupId === state.activeGroupId
    );
  }

  /** A faixa só existe quando estou conectado E não estou olhando a sala. */
  function buildCallBar(state: AppState): CallBarProps | undefined {
    const voice = state.voice;
    if (voice === null) return undefined;
    if (isViewingRoom(state)) return undefined;

    const otherGroup =
      voice.groupId === state.activeGroupId
        ? null
        : (state.groups.find((g) => g.id === voice.groupId)?.name ?? 'outro grupo');

    return {
      channelName: voiceChannelName(state),
      otherGroupName: otherGroup,
      muted: state.voiceMuted,
      onOpenRoom: () => store.openVoiceRoom(),
      onToggleMute: () => store.toggleMute(),
      onDisconnect: () => store.disconnectVoice(),
      onToggleScreen: () => handleToggleScreenShare(),
      sharingScreen: state.screenSharing,
    };
  }

  /** Coluna 2 na tela inicial. A faixa de chamada continua aqui. */
  function buildHomeColumn(state: AppState): HTMLElement {
    const parts = renderHomeColumn({
      naoLidas: (uid) => naoLidas.pv(uid),
      dmThreads: state.dmThreads,
      dmThreadsLoaded: state.dmThreadsLoaded,
      activeDmUid: state.activeDmUid,
      profiles: state.friendProfiles,
      me: user.uid,
      onSelectDm: (uid) => {
        setDrawer(null);
        store.openDm(uid);
      },
      onOpenFriends: () => {
        setDrawer(null);
        store.closeDm();
      },
    });
    const bar = buildCallBar(state);
    /*
     * ESTE mount não tem par: ao contrário do chat (rodapé da coluna no
     * desktop, acima do composer no mobile — dois elementos, um por CSS), a
     * tela inicial só tem um lugar para a faixa. Por isso a variante segue o
     * layout ATUAL em vez de vir fixa em 'mobile' — fixa, `.callbar--mobile`
     * ficava escondida fora da media query de mobile (ver call-bar.css) e a
     * faixa desaparecia também no desktop, não só quando a visão era home.
     */
    if (bar !== undefined) {
      parts.callBarSlot.replaceChildren(renderCallBar(bar, isMobileLayout() ? 'mobile' : 'desktop'));
    }
    if (!isMobileLayout()) parts.element.append(peDaColuna(parts.callBarSlot));
    return parts.element;
  }

  /** Coluna do meio quando não há grupo nenhum: criar ou entrar por convite. */
  function buildNoGroupsCenter(): HTMLElement {
    const menu = el(
      'button',
      {
        class: 'icon-button chat__mobile-button chat__mobile-button--left',
        type: 'button',
        title: 'Abrir menu',
        'aria-label': 'Abrir menu',
      },
      [iconEl(menuIcon(20), 'icon')],
    );
    menu.addEventListener('click', () => setDrawer('left'));
    return el('main', { class: 'chat' }, [
      el('header', { class: 'chat__header chat__header--mobile-only' }, [menu]),
      renderNoGroups({ onCreateGroup: handleCreateGroup, onJoinByCode: handleJoinByCode }),
    ]);
  }

  function friendsScreenProps(state: AppState): FriendsScreenProps {
    return {
      me: user.uid,
      tab: friendsTab,
      onTab: (tab) => {
        friendsTab = tab;
        render(store.getState());
      },
      friendships: state.friendships,
      profiles: state.friendProfiles,
      blockedUids: state.blockedUids,
      onAdd: handleAddFriend,
      onAccept: (id) => {
        void acceptFriendRequest(id).catch(() => showToast('Não foi possível aceitar.'));
      },
      onRemove: (id) => {
        void removeFriendship(id).catch(() => showToast('Não foi possível concluir.'));
      },
      onUnfriend: handleRemoveFriend,
      onBlock: handleBlock,
      onUnblock: (uid) => {
        void unblockUser(user.uid, uid).catch(() => showToast('Não foi possível desbloquear.'));
      },
      onOpenChannels: () => setDrawer('left'),
      onOpenDm: (uid) => store.openDm(uid),
    };
  }

  function buildChannelList(state: AppState): HTMLElement {
    const callBar = buildCallBar(state);
    const coluna = renderChannelList({
      naoLidas: (id) => naoLidas.canal(id),
      group: activeGroup(state) ?? null,
      channels: state.channels,
      channelsLoaded: state.channelsLoaded,
      activeChannelId: state.activeChannelId,
      activeVoiceChannelId:
        state.voice !== null && state.voice.groupId === state.activeGroupId
          ? state.voice.channelId
          : null,
      // Escolher fecha a gaveta: no celular ela cobre a tela, e deixá-la aberta
      // depois de escolher um canal esconderia justamente o que você foi ver.
      onSelectChannel: (channelId) => {
        setDrawer(null);
        store.setActiveChannel(channelId);
      },
      onEnterVoice: (channelId) => {
        setDrawer(null);
        handleEnterVoice(channelId);
      },
      onOpenGroupMenu: handleOpenGroupMenu,
      ...(state.membersLoaded ? { memberCount: state.members.length } : {}),
      voiceRosters: voiceRosters(state),
      // No mobile a faixa vai para cima do composer, e SÓ para lá: dois
      // `.callbar` no DOM ao mesmo tempo mudariam o documento do desktop, que
      // precisa continuar idêntico.
      // No PC a faixa vai para o pé da coluna, junto do meu cartão.
    });
    if (!isMobileLayout()) {
      coluna.append(peDaColuna(callBar === undefined ? null : renderCallBar(callBar, 'desktop')));
    }
    return coluna;
  }

  /**
   * Quem é cada participante de voz.
   *
   * O roster traz uid; o nome vem da lista de membros do grupo, que já está
   * carregada. Sem perfil correspondente, cai num rótulo neutro em vez de sumir
   * da sala — alguém sem `users` ainda está ocupando um dos quatro lugares.
   */
  function presenceView(state: AppState, participant: VoiceParticipant): VoicePresenceView {
    const member = state.members.find((m) => m.id === participant.uid);
    const displayName = member?.displayName ?? 'Usuário';
    return {
      uid: participant.uid,
      displayName,
      initials: member?.initials ?? initials(displayName),
      photo: member?.photo,
      muted: participant.muted,
      sharingScreen: participant.sharingScreen,
      insignia: member?.insignia,
    };
  }

  /** Quem está em cada canal de voz do grupo ativo. */
  function voiceRosters(state: AppState): Map<string, VoicePresenceView[]> {
    const byChannel = new Map<string, VoicePresenceView[]>();
    for (const participant of state.voiceParticipants) {
      const list = byChannel.get(participant.channelId) ?? [];
      list.push(presenceView(state, participant));
      byChannel.set(participant.channelId, list);
    }
    return byChannel;
  }

  /*
   * Etapa 8a: palco ou grade (escolha desta sessão) e a hora em que entrei na
   * sala (o relógio do cabeçalho). Trocar de sala zera o relógio.
   */
  let jeitoDaSala: RoomLayout = 'palco';
  let entradaNaSala: { canal: string; em: number } | null = null;

  function alternarJeitoDaSala(): void {
    jeitoDaSala = jeitoDaSala === 'palco' ? 'grade' : 'palco';
    const room = buildVoiceRoom(store.getState());
    if (room !== null && centerMode === 'voice' && centerEl !== null) {
      centerEl.replaceWith(room);
      centerEl = room;
    }
  }

  /** A sala, com quem está mesmo nela. */
  function buildVoiceRoom(state: AppState): HTMLElement | null {
    const voice = state.voice;
    if (voice === null || voice.groupId !== state.activeGroupId) return null;
    if (entradaNaSala?.canal !== voice.channelId) entradaNaSala = { canal: voice.channelId, em: Date.now() };

    const here = state.voiceParticipants.filter((p) => p.channelId === voice.channelId);

    const participants: VoiceParticipantView[] = here.map((participant) => {
      const view = presenceView(state, participant);
      const isSelf = participant.uid === user.uid;
      return {
        member: {
          id: view.uid,
          displayName: view.displayName,
          initials: view.initials,
          status: 'online',
          ...(view.photo === undefined ? {} : { photo: view.photo }),
          ...(view.insignia === undefined ? {} : { insignia: view.insignia }),
        },
        // O meu bloco segue o estado local do botão, não o documento: o botão
        // tem que responder na hora, sem esperar o round-trip da escrita.
        muted: isSelf ? state.voiceMuted : participant.muted,
        isSelf,
        failed: state.voiceFailedPeers.includes(participant.uid),
      };
    });

    /*
     * Quem transmite vem do roster VIVO — é o que faz a transmissão de um
     * fantasma sumir do palco sozinha.
     *
     * A MINHA transmissão é a exceção: vale o estado local, não o documento.
     * Esperar o round-trip do Firestore deixaria o meu próprio botão parecendo
     * travado por um instante depois de eu clicar.
     */
    const otherSharer = here.find((p) => p.sharingScreen && p.uid !== user.uid);
    const sharerIsMe = state.screenSharing;

    const parts = renderVoiceRoom({
      channelName: voiceChannelName(state),
      joinedAt: entradaNaSala.em,
      layout: jeitoDaSala,
      onToggleLayout: alternarJeitoDaSala,
      onTogglePanel: alternarPainel,
      onOpenVoiceSettings: () => handleOpenSettings('voz'),
      onAviso: (texto) => showToast(texto),
      participants,
      muted: state.voiceMuted,
      micDenied: state.voiceMicDenied,
      audioBlocked: state.voiceAudioBlocked,
      engineError: state.voiceEngineError,
      screen: {
        // Vem do roster VIVO: quem fecha o navegador some daqui em até 45s e o
        // palco volta ao placeholder sozinho, sem transmissão fantasma.
        sharerName: sharerIsMe
          ? me.displayName
          : otherSharer === undefined
            ? null
            : presenceView(state, otherSharer).displayName,
        isMine: sharerIsMe,
        label: state.screenLabel,
        audioMissing: state.screenAudioMissing,
        maximized: state.screenMaximized,
        supported: screenShareSupported(),
        ...(emAppAndroid()
          ? {
              unsupportedReason:
                'Este celular não deixa transmitir a tela: atualize o "Android System WebView" na Play Store.',
              audioMissingText: 'Vai só a imagem: este celular não deixou mandar o som (precisa do Android 10 ou mais novo).',
            }
          : {}),
        ready: state.voiceReady,
      },
      onToggleMute: () => store.toggleMute(),
      onRetryAudio: () => store.retryVoiceAudio(),
      onOpenChannels: () => setDrawer('left'),
      onOpenMembers: () => setDrawer('right'),
      onToggleScreenShare: handleToggleScreenShare,
      onToggleMaximize: () => setMaximized(!state.screenMaximized),
      onLeave: () => store.disconnectVoice(),
    });

    /*
     * ENCAIXA os elementos de vídeo, que são do motor e vivem fora da árvore de
     * componentes. Mover preserva a reprodução; recriar reiniciaria a imagem a
     * cada mudança de estado da sala.
     */
    if (parts.stageSlot !== null) {
      const video = store.screenVideoElement();
      if (video !== null) {
        parts.stageSlot.append(video);
        // Mover um elemento no DOM pode pausá-lo em alguns navegadores.
        void video.play().catch(() => {});
      }
    }
    if (parts.previewSlot !== null) {
      const stream = store.localScreenStream();
      if (stream !== null) parts.previewSlot.append(localPreview(stream));
    }

    // A sala foi reconstruída: reaplica quem está falando. O anel vive numa
    // classe posta de fora, e uma reconstrução o apagaria.
    for (const uid of speaking) {
      parts.element
        .querySelector(`.room__person[data-uid="${uid}"]`)
        ?.classList.add('is-speaking');
    }
    return parts.element;
  }

  /**
   * O `<video>` da minha própria transmissão.
   *
   * MUDO obrigatoriamente: sem isso eu ouviria de volta o som da minha própria
   * tela, com atraso. `playsinline` para o iOS não abrir em tela cheia sozinho.
   */
  let previewEl: HTMLVideoElement | null = null;
  function localPreview(stream: MediaStream): HTMLVideoElement {
    if (previewEl === null) {
      previewEl = document.createElement('video');
      previewEl.autoplay = true;
      previewEl.muted = true;
      previewEl.playsInline = true;
    }
    if (previewEl.srcObject !== stream) previewEl.srcObject = stream;
    return previewEl;
  }

  /*
   * CHAT DA SALA (etapa 8b). Com a sala na tela e o chat da sala ligado, a
   * coluna 4 vira o painel da sala: Chat da sala, Membros e Fixadas (as duas
   * últimas seguem as abas escolhidas em Aparência). A casca é montada uma vez
   * por sala — trocar de aba e chegar mensagem não apagam o que se digita.
   */
  let chatDaSalaLigado = accountAppearance().roomChat;
  let painelDaSala: RoomPanelParts | null = null;
  let painelDaSalaChave = '';
  /** A casca acabou de nascer: a lista entra rolada para o fim. */
  let painelDaSalaNovo = false;
  let abaDaSala: AbaDaSala = 'chat';
  let replyingToSala: ReplyTo | null = null;
  let renderedRoomEditingId: string | null = null;

  function painelDaSalaNaTela(state: AppState): boolean {
    return chatDaSalaLigado && isViewingRoom(state);
  }

  function montarPainelDaSala(state: AppState): HTMLElement {
    const canal = state.voice?.channelId ?? '';
    const abas: AbaDaSala[] = [
      'chat',
      ...abasDoPainel.filter((a): a is 'membros' | 'fixadas' => a === 'membros' || a === 'fixadas'),
    ];
    if (!abas.includes(abaDaSala)) abaDaSala = 'chat';
    const chave = `${canal}|${abas.join()}`;
    if (painelDaSala === null || chave !== painelDaSalaChave) {
      // Outra sala: começa no chat e sem resposta pendente.
      if (!painelDaSalaChave.startsWith(`${canal}|`)) {
        abaDaSala = 'chat';
        replyingToSala = null;
      }
      painelDaSalaChave = chave;
      painelDaSala = renderRoomPanel({
        canal: voiceChannelName(state),
        abas,
        aba: abaDaSala,
        onAba: (aba) => {
          abaDaSala = aba;
          painelDaSala?.setAba(aba);
          if (painelDaSala !== null) preencherOutraAbaDaSala(store.getState(), painelDaSala);
        },
        onSend: handleSendSala,
        aoArquivos: handleArquivosSala,
        aoFigurinha: handleFigurinhaSala,
        aoVoz: handleVozSala,
        ...(state.roomChatChannelId === null ? {} : { destino: `canal:${state.roomChatChannelId}` }),
      });
      painelDaSalaNovo = true;
      renderReplySala();
    }
    preencherOutraAbaDaSala(state, painelDaSala);
    return painelDaSala.element;
  }

  /** O conteúdo de Membros ou Fixadas (o chat tem a casca dele). */
  function preencherOutraAbaDaSala(state: AppState, painel: RoomPanelParts): void {
    if (abaDaSala === 'chat') {
      painel.outroSlot.replaceChildren();
      return;
    }
    const group = activeGroup(state) ?? null;
    if (abaDaSala === 'membros') {
      painel.outroSlot.replaceChildren(
        ...memberListContent({ members: state.members, membersLoaded: state.membersLoaded, ownerId: group?.ownerId ?? null }).filter(
          (n): n is HTMLElement => n !== false,
        ),
      );
      return;
    }
    painel.outroSlot.replaceChildren(
      renderPinnedList({
        pins: state.roomPinnedMessages,
        pinnedLoaded: state.roomPinnedMessagesLoaded,
        reachabilityOf: (pin) => pinReachabilityIn(pin, state.roomMessages, state.roomMessagesAtStart),
        canUnpin: group !== null && isOwner(group, user.uid),
        onJumpTo: handleJumpToPin,
      }),
    );
  }

  /** As mensagens do chat da sala: erro > carregando > vazio > lista. */
  function buildRoomMessages(state: AppState): HTMLElement {
    if (state.roomMessagesError !== null) return renderMessagesError(state.roomMessagesError);
    if (!state.roomMessagesLoaded) return renderLoading('Carregando mensagens…');
    if (state.roomMessages.length === 0) return renderNoMessages('Escreva aqui o que não dá para falar: links, nomes, combinados.');

    const authors = new Map<MemberId, Member>(state.members.map((member) => [member.id, member]));
    const nome = voiceChannelName(state);
    return renderMessageList({
      messages: state.roomMessages,
      authors,
      currentMemberId: user.uid,
      loadingOlder: state.roomMessagesLoadingOlder,
      atStart: state.roomMessagesAtStart,
      atPageCap: state.roomMessagesAtPageCap,
      channelName: nome,
      startLabel: `Começo do chat de ${nome}`,
      dataContext: 'room-message',
      onReachTop: () => store.loadOlderRoomMessages(),
      onJumpTo: jumpToMessage,
      editingId,
      onEdit: (messageId, body) => {
        editingId = null;
        void editMessage(messageId, body).catch((error: unknown) => {
          console.error('Falha ao editar a mensagem.', error);
          showToast('Não foi possível salvar a edição.');
        });
        render(store.getState());
      },
      onCancelEdit: () => {
        editingId = null;
        render(store.getState());
      },
    });
  }

  /** Liga/desliga o chat da sala (preferência da conta, aqui ou em outro aparelho). */
  function acompanharChatDaSala(ligado: boolean): void {
    if (ligado === chatDaSalaLigado) return;
    chatDaSalaLigado = ligado;
    const state = store.getState();
    if (isViewingRoom(state) && memberListEl !== null) memberListEl = swap(memberListEl, buildMemberList(state));
    sincronizarChatDaSala(state);
    render(store.getState());
  }

  /**
   * O chat da sala só CARREGA enquanto estou conectado e com ele ligado. Fora
   * do render (que é ouvinte do store): ligar a assinatura muda o store.
   */
  function sincronizarChatDaSala(state: AppState): void {
    const quero = chatDaSalaLigado && state.voice !== null ? state.voice.channelId : null;
    if (quero === state.roomChatChannelId) return;
    queueMicrotask(() => {
      const agora = store.getState();
      store.watchRoomChat(chatDaSalaLigado && agora.voice !== null ? agora.voice.channelId : null);
    });
  }

  /** Coluna 4 do grupo: o painel com abas Agora, Membros e Fixadas (proposta A). */
  function buildMemberList(state: AppState): HTMLElement {
    if (painelDaSalaNaTela(state)) return montarPainelDaSala(state);
    // Saiu da sala (ou desligou o chat): a próxima entrada monta uma casca nova.
    painelDaSala = null;
    painelDaSalaChave = '';
    replyingToSala = null;
    const group = activeGroup(state) ?? null;
    return renderGroupPanel({
      aba: abaDoPainel,
      abas: abasDoPainel,
      onAba: (aba) => {
        abaDoPainel = aba;
        memberListEl = swap(memberListEl, buildMemberList(store.getState()));
      },
      salas: salasAgora(state),
      onEntrar: (channelId) => {
        setDrawer(null);
        handleEnterVoice(channelId);
      },
      membros: {
        members: state.members,
        membersLoaded: state.membersLoaded,
        ownerId: group?.ownerId ?? null,
      },
      fixadas: buildGroupPins(state, group !== null && isOwner(group, user.uid)),
      // O cartão do grupo no topo da aba Agora (etapa 3a).
      ...(group === null
        ? {}
        : {
            // A galeria do grupo (0.8.0).
            midia: () =>
              abaMidia({ groupId: group.id, nomeDoGrupo: group.name, membros: state.members, canais: state.channels }),
            cartao: renderGroupCard({
              name: group.name,
              description: group.description,
              accentId: group.accentId,
              photo: group.photo,
              banner: bannerDoGrupo(group.id),
              memberCount: state.members.length,
            }),
          }),
    });
  }

  /** As salas de voz do grupo com alguém dentro — a aba Agora. */
  function salasAgora(state: AppState): SalaAgora[] {
    const salas: SalaAgora[] = [];
    for (const channel of state.channels) {
      if (channel.kind !== 'voice') continue;
      const aqui = state.voiceParticipants.filter((p) => p.channelId === channel.id);
      if (aqui.length === 0) continue;
      salas.push({
        id: channel.id,
        nome: channel.name,
        pessoas: aqui.map((p) => ({ ...presenceView(state, p), transmitindo: p.sharingScreen })),
        estouAqui: state.voice?.channelId === channel.id,
      });
    }
    return salas;
  }

  /**
   * Coluna 4 na aba Amigos sem PV aberto — espaço RESERVADO de propósito
   * (ajuste pós-etapa-19), para uma feature futura. Mesma `.members` das
   * outras duas variantes (largura, superfície, borda esquerda), sem
   * cabeçalho e sem texto de estado vazio — é isso que o pedido pede:
   * "só o espaço", nada para confundir com bug ou com "carregando".
   */
  function buildReservedAside(): HTMLElement {
    return el('aside', { class: 'members', 'aria-hidden': 'true' }, []);
  }

  /** Conteúdo do slot de mensagens: erro > carregando > vazio > lista. */
  function buildMessages(state: AppState): HTMLElement {
    // Erro primeiro: "índice construindo" e "sem permissão" não podem virar
    // uma lista vazia, que seria indistinguível de canal realmente sem mensagem.
    if (state.messagesError !== null) return renderMessagesError(state.messagesError);
    if (!state.messagesLoaded) return renderLoading('Carregando mensagens…');
    if (state.messages.length === 0) return renderNoMessages();

    const authors = new Map<MemberId, Member>(state.members.map((member) => [member.id, member]));
    return renderMessageList({
      messages: state.messages,
      authors,
      currentMemberId: user.uid,
      loadingOlder: state.messagesLoadingOlder,
      atStart: state.messagesAtStart,
      atPageCap: state.messagesAtPageCap,
      channelName: activeChannelName(state),
      onReachTop: () => store.loadOlderMessages(),
      onJumpTo: jumpToMessage,
      editingId,
      onEdit: (messageId, body) => {
        editingId = null;
        void editMessage(messageId, body).catch((error: unknown) => {
          console.error('Falha ao editar a mensagem.', error);
          showToast('Não foi possível salvar a edição.');
        });
        render(store.getState());
      },
      onCancelEdit: () => {
        editingId = null;
        render(store.getState());
      },
    });
  }

  /** Nome de exibição do amigo, pelo perfil já carregado para a tela de amigos. */
  function friendDisplayName(state: AppState, uid: MemberId): string {
    return state.friendProfiles.get(uid)?.displayName ?? 'Usuário';
  }

  /** O cabeçalho do PV — o que `dm-chat.ts` conhece, sem saber de `UserProfile`. */
  function friendView(state: AppState, uid: MemberId): DmFriendView {
    const profile = state.friendProfiles.get(uid);
    return {
      uid,
      displayName: profile?.displayName ?? 'Usuário',
      initials: profile?.initials ?? '?',
      photo: profile?.photo,
      nameColor: profile?.nameColor,
      ...(profile?.username === undefined ? {} : { username: profile.username }),
    };
  }

  /**
   * Conteúdo do slot de mensagens do PV — mesmo formato de `buildMessages`,
   * a fatia de estado é que muda (`dmMessages*` em vez de `messages*`).
   */
  function buildDmMessages(state: AppState): HTMLElement {
    const friendUid = state.activeDmUid;
    if (friendUid === null) return renderNoMessages();

    if (state.dmMessagesError !== null) return renderMessagesError(state.dmMessagesError);
    if (!state.dmMessagesLoaded) return renderLoading('Carregando mensagens…');
    if (state.dmMessages.length === 0) return renderNoMessages();

    const friend = friendView(state, friendUid);
    const authors = new Map<MemberId, Member>([
      [user.uid, me],
      [
        friendUid,
        {
          id: friendUid,
          displayName: friend.displayName,
          initials: friend.initials,
          status: 'online',
          ...(friend.photo === undefined ? {} : { photo: friend.photo }),
          ...(friend.nameColor === undefined ? {} : { nameColor: friend.nameColor }),
        },
      ],
    ]);

    return renderMessageList({
      messages: state.dmMessages,
      authors,
      currentMemberId: user.uid,
      loadingOlder: state.dmMessagesLoadingOlder,
      atStart: state.dmMessagesAtStart,
      atPageCap: state.dmMessagesAtPageCap,
      // Sem uso real: `startLabel` abaixo sempre vence quando atStart é true.
      channelName: friendDisplayName(state, friendUid),
      startLabel: `Início da conversa com ${friendDisplayName(state, friendUid)}`,
      dataContext: 'dm-message',
      onReachTop: () => store.loadOlderDmMessages(),
      onJumpTo: jumpToMessage,
      editingId,
      onEdit: (messageId, body) => {
        editingId = null;
        void editDmMessage(messageId, body).catch((error: unknown) => {
          console.error('Falha ao editar a mensagem.', error);
          showToast('Não foi possível salvar a edição.');
        });
        render(store.getState());
      },
      onCancelEdit: () => {
        editingId = null;
        render(store.getState());
      },
    });
  }

  /** Id do vínculo de amizade aceito com esta pessoa, para "Desfazer amizade" no cartão — `null` se por algum motivo não existir mais. */
  function friendshipIdWith(state: AppState, uid: MemberId): string | null {
    return (
      state.friendships.find((f) => f.status === 'accepted' && f.members.includes(uid))?.id ??
      null
    );
  }

  /** Como saber se a mensagem original de uma fixada ainda está alcançável — mesma `citationState` da citação (etapa 17). */
  function pinReachabilityIn(
    pin: PinnedMessage,
    messages: AppState['messages'] | AppState['dmMessages'],
    atStart: boolean,
  ): 'carregada' | 'apagada' | 'fora-da-janela' {
    return citationState(pin, messages, atStart);
  }

  /**
   * Salta até a mensagem original de uma fixada — usado pelo clique direto
   * no item (grupo e PV) E pelo "Ir para a mensagem" do menu de contexto
   * (`pinnedItemItems`, context-menus.ts). No grupo, fecha o painel
   * flutuante primeiro se estiver aberto; no PV não há painel para fechar.
   */
  function handleJumpToPin(messageId: string): void {
    // Fixada do chat da sala: volta para a aba do chat e rola até ela.
    if (painelDaSala !== null && memberListEl === painelDaSala.element && abaDaSala === 'fixadas') {
      abaDaSala = 'chat';
      painelDaSala.setAba('chat');
      preencherOutraAbaDaSala(store.getState(), painelDaSala);
      jumpToMessage(messageId);
      return;
    }
    if (pvAberto(store.getState()) === null) pinsPanel?.close();
    jumpToMessage(messageId);
  }

  /** Coluna 4 no PV — perfil da pessoa (terço de cima) + fixadas da conversa (dois terços de baixo). */
  function buildDmSidePanel(state: AppState, friendUid: MemberId): HTMLElement {
    return renderDmSidePanel({
      profileCard: {
        friendUid,
        profile: state.friendProfiles.get(friendUid),
        friendshipId: friendshipIdWith(state, friendUid),
        blocked: state.blockedUids.includes(friendUid),
        onBlock: handleBlock,
        onUnblock: (uid) => {
          void unblockUser(user.uid, uid).catch(() => showToast('Não foi possível desbloquear.'));
        },
        onRemove: (friendshipId) => handleRemoveFriend(friendshipId, friendUid),
      },
      pinnedList: {
        pins: state.pinnedDmMessages,
        pinnedLoaded: state.pinnedDmMessagesLoaded,
        reachabilityOf: (pin) => pinReachabilityIn(pin, state.dmMessages, state.dmMessagesAtStart),
        onJumpTo: handleJumpToPin,
      },
    });
  }

  /** Chamado tanto pelo painel do PV quanto pelo painel flutuante do grupo. */
  function handleUnpin(pinIds: string[]): void {
    void unpinMessages(pinIds).catch((error: unknown) => {
      console.error('Falha ao desafixar a mensagem.', error);
      showToast('Não foi possível desafixar.');
    });
  }

  /** Conteúdo do painel flutuante de fixadas do grupo — reconstruído a cada atualização enquanto está aberto. */
  function buildGroupPins(state: AppState, canUnpin: boolean) {
    return {
      pins: state.pinnedMessages,
      pinnedLoaded: state.pinnedMessagesLoaded,
      reachabilityOf: (pin: PinnedMessage) =>
        pinReachabilityIn(pin, state.messages, state.messagesAtStart),
      canUnpin,
      onJumpTo: handleJumpToPin,
    };
  }

  const handleOpenPins = (): void => {
    const state = store.getState();
    const group = activeGroup(state) ?? null;
    if (group === null) return;
    pinsPanel = openPinnedMessagesPanel(buildGroupPins(state, isOwner(group, user.uid)));
  };

  /**
   * Troca o conteúdo da coluna 3.
   *
   * Na primeira montagem ela precisa entrar ANTES da lista de membros: a ordem
   * das colunas no grid vem da ordem no DOM, e appendar aqui jogaria o chat para
   * depois dos membros.
   */
  function swapCenter(current: HTMLElement | null, next: HTMLElement): HTMLElement {
    if (current === null) root.insertBefore(next, memberListEl);
    // Toda troca da coluna 3 é troca de visão: transição 1 (etapa 20).
    else trocarComTransicao(current, next, () => current.replaceWith(next));
    return next;
  }

  /**
   * `transicao`: só quando a troca é de VISÃO (casinha ↔ grupo, outro grupo,
   * outro PV). As colunas 2 e 4 também são trocadas a cada dado novo — uma
   * mensagem de PV, alguém entrando no grupo —, e isso não pode piscar.
   */
  function swap(current: HTMLElement | null, next: HTMLElement, transicao = false): HTMLElement {
    // A mesma casca (o painel da sala): tirar e pôr de volta perderia o foco e a rolagem.
    if (current === next) return next;
    if (current === null) {
      root.append(next);
      return next;
    }
    if (transicao) trocarComTransicao(current, next, () => current.replaceWith(next));
    else current.replaceWith(next);
    return next;
  }

  /**
   * Troca a lista preservando a leitura.
   *
   * Se eu estava no fim, acompanha a mensagem nova. Se eu estava lendo mais
   * acima, mantém a posição exata — não me arranca de onde eu estava.
   */
  /**
   * Mensagem em edição, e mensagem sendo respondida.
   *
   * Estado de INTERAÇÃO, não de dados: não vem do Firestore, não sobrevive a
   * trocar de canal, e não tem por que passar pelo store — o mesmo critério que
   * mantém "quem está falando" fora do estado no motor de voz.
   */
  /** Aba da tela de amigos. Interação pura: não vai para o store. */
  let friendsTab: FriendsTab = 'amigos';
  /** A aba desenhada por último — a aba em si é local e o store não a vê. */
  let friendsTabRendered: FriendsTab | null = null;

  let editingId: string | null = null;
  let renderedEditingId: string | null = null;
  let replyingTo: ReplyTo | null = null;

  /** Nome do canal de TEXTO aberto agora — para o "Início de #geral". */
  function activeChannelName(state: AppState): string {
    return state.channels.find((c) => c.id === state.activeChannelId)?.name ?? 'canal';
  }

  /**
   * Troca a lista preservando a leitura.
   *
   * UMA REGRA SÓ, ancorada numa mensagem: mede quanto conteúdo entrou ACIMA de
   * uma mensagem que existe nas duas listas, e soma isso ao `scrollTop`.
   *
   * Isso cobre de uma vez três coisas que pareciam casos separados:
   *   - histórico entrando no topo (o motivo da etapa 13);
   *   - o próprio indicador "Carregando mensagens anteriores…" aparecendo, que
   *     empurra a lista 52px sem que nenhuma mensagem tenha entrado — foi ele
   *     que sobrou depois de eu consertar só o primeiro caso;
   *   - separador de data novo abrindo acima da leitura.
   *
   * E mensagem chegando EMBAIXO cai na mesma regra sozinha: o que está acima da
   * âncora não mudou, o delta dá zero, e a posição fica onde estava.
   */
  /*
   * `animarNovas` (chegada 1, etapa 20): só quem chama sabe se esta troca é
   * "chegou coisa ao vivo" — falso ao abrir canal/PV e enquanto a lista ainda
   * carrega. O histórico ("carregar anteriores", rolar ao topo) não precisa
   * de flag: ele entra ACIMA das mensagens que já estavam, e só anima o que
   * entra DEPOIS da última delas.
   */
  function swapMessages(slot: HTMLElement, next: HTMLElement, forceBottom: boolean, animarNovas = false): void {
    const old = slot.querySelector<HTMLElement>('.messages');
    const idsAntes = new Set(
      Array.from(old?.querySelectorAll<HTMLElement>('.message[data-message-id]') ?? [], (m) => m.dataset['messageId']),
    );
    const wasAtBottom =
      old === null ||
      old.scrollHeight - old.scrollTop - old.clientHeight <= STICK_TO_BOTTOM_PX;
    const previousScrollTop = old?.scrollTop ?? 0;

    /*
     * A PRIMEIRA mensagem da lista antiga.
     *
     * Ela é a fronteira com o que vai entrar, e é de propósito: fixar a
     * fronteira fixa tudo o que vem depois dela, que é o texto que a pessoa
     * está lendo. Medi a alternativa — ancorar na última — e é pior: o erro
     * subiu de 5px para 16px, porque aí a fronteira flutua livre.
     *
     * RESÍDUO CONHECIDO, de uns 5px: a própria âncora muda de forma quando
     * mensagens do MESMO autor entram logo acima — ela deixa de abrir bloco,
     * perde a linha do nome e troca a margem (`--space-3` vira 2px). Isso é
     * mudança de layout NA âncora, não acima dela, e nenhuma compensação de
     * rolagem pode desfazer: a mensagem realmente tem outro tamanho agora.
     * Cinco pixels são imperceptíveis; os 457 originais é que inutilizavam.
     */
    const anchor = old?.querySelector<HTMLElement>('.message[data-message-id]') ?? null;
    const anchorId = anchor?.dataset['messageId'] ?? null;
    const anchorTopBefore = anchor?.offsetTop ?? 0;

    slot.replaceChildren(next);

    const list = slot.querySelector<HTMLElement>('.messages');
    if (list === null) return;

    if (animarNovas) {
      const agora = Array.from(list.querySelectorAll<HTMLElement>('.message[data-message-id]'));
      // Posição, na lista nova, da mais nova das que já estavam.
      let ultimaQueJaEstava = -1;
      agora.forEach((m, i) => {
        if (idsAntes.has(m.dataset['messageId'])) ultimaQueJaEstava = i;
      });
      for (const m of agora.slice(ultimaQueJaEstava + 1)) {
        if (!idsAntes.has(m.dataset['messageId'])) animarChegada(m);
      }
    }

    /*
     * Gruda no fim (message-list.css, `.messages--short`) só quando a
     * lista de VERDADE não rola — nunca durante "carregar anteriores"
     * (só existe com a lista já rolando). `slot.replaceChildren(next)` diz
     * que `list` é um nó NOVO sem essa classe ainda, então isto mede o
     * overflow bruto, sem o próprio ajuste interferindo na medida.
     */
    list.classList.toggle('messages--short', list.scrollHeight <= list.clientHeight);

    if (forceBottom || wasAtBottom) {
      list.scrollTop = list.scrollHeight;
      return;
    }

    /*
     * O ajuste roda no MESMO turno síncrono da troca do DOM, antes do paint —
     * dentro de um requestAnimationFrame o salto apareceria por um quadro.
     */
    const again =
      anchorId === null
        ? null
        : list.querySelector<HTMLElement>(`.message[data-message-id="${anchorId}"]`);

    list.scrollTop =
      again === null
        ? previousScrollTop
        : previousScrollTop + (again.offsetTop - anchorTopBefore);
  }

  /**
   * Rola até uma mensagem e a destaca por um instante.
   *
   * A classe é removida no fim da animação... que não existe: o projeto não tem
   * animação por regra de estilo. Um `setTimeout` faz o mesmo papel e é honesto
   * sobre o que está acontecendo.
   */
  function jumpToMessage(messageId: string): void {
    const alvo = root.querySelector<HTMLElement>(`[data-message-id="${messageId}"]`);
    if (alvo === null) return;
    alvo.scrollIntoView({ block: 'center' });
    alvo.classList.add('is-highlighted');
    window.setTimeout(() => alvo.classList.remove('is-highlighted'), HIGHLIGHT_MS);
  }

  /*
   * PREFERÊNCIAS PRIVADAS, ao vivo (lib/private-prefs.ts): as boas-vindas já
   * dispensadas (etapa 3c) e os apelidos dos grupos (etapa 3d). Até chegarem,
   * o cartão de boas-vindas não aparece (sem piscar).
   */
  let boasVistas: Set<string> | null = null;
  let boasChave = '';
  let rotulosDosGrupos = new Map<string, string>();
  let jeitoDasAbas: TabMode = 'nomes';
  let ordemDosGrupos: string[] = [];
  let pastas: GroupFolder[] = [];
  /** Pastas abertas: conforto DESTE aparelho (localStorage), não vai para a conta. */
  const CHAVE_PASTAS = 'loft.pastasAbertas';
  const pastasAbertas = new Set<string>(
    (() => {
      try {
        const salvo: unknown = JSON.parse(localStorage.getItem(CHAVE_PASTAS) ?? '[]');
        return Array.isArray(salvo) ? salvo.filter((x): x is string => typeof x === 'string') : [];
      } catch {
        return [];
      }
    })(),
  );
  const pararPrefs = watchPrivatePrefs(user.uid, (prefs) => {
    const barraMudou =
      JSON.stringify([...prefs.groupLabels]) !== JSON.stringify([...rotulosDosGrupos]) ||
      prefs.tabMode !== jeitoDasAbas ||
      prefs.groupOrder.join() !== ordemDosGrupos.join() ||
      JSON.stringify(prefs.groupFolders) !== JSON.stringify(pastas);
    boasVistas = prefs.welcomeSeen;
    rotulosDosGrupos = prefs.groupLabels;
    jeitoDasAbas = prefs.tabMode;
    ordemDosGrupos = prefs.groupOrder;
    pastas = prefs.groupFolders;
    setAccountAppearance(prefs.appearance);
    acompanharPainel(prefs.appearance.panelTabs, prefs.appearance.panelFirst);
    acompanharChatDaSala(prefs.appearance.roomChat);
    if (barraMudou && groupBarEl !== null) groupBarEl = swap(groupBarEl, buildGroupBar(store.getState()));
    render(store.getState());
  });

  /**
   * Soltou uma aba arrastada: a ordem nova vale na hora e vai para a conta.
   * Uma pasta arrastada (`pasta:<id>`) leva os grupos dela juntos, na ordem
   * em que já estavam.
   */
  function reordenarGrupos(itens: string[]): void {
    const atuais = sortGroups(store.getState().groups, ordemDosGrupos).map((g) => g.id);
    const ids = itens.flatMap((item) => {
      if (!item.startsWith('pasta:')) return [item];
      const membros = new Set(pastas.find((p) => `pasta:${p.id}` === item)?.groupIds ?? []);
      return atuais.filter((id) => membros.has(id));
    });
    salvarOrdem(ids);
  }

  /** Arrastou DENTRO de uma pasta aberta: os grupos dela trocam de lugar entre si. */
  function reordenarNaPasta(idsDaPasta: string[]): void {
    const atuais = sortGroups(store.getState().groups, ordemDosGrupos).map((g) => g.id);
    const membros = new Set(idsDaPasta);
    const fila = [...idsDaPasta];
    salvarOrdem(atuais.map((id) => (membros.has(id) ? fila.shift()! : id)));
  }

  function alternarPasta(id: string): void {
    if (pastasAbertas.has(id)) pastasAbertas.delete(id);
    else pastasAbertas.add(id);
    try {
      localStorage.setItem(CHAVE_PASTAS, JSON.stringify([...pastasAbertas]));
    } catch {
      // Sem armazenamento (aba anônima): a pasta abre e fecha só nesta visita.
    }
    if (groupBarEl !== null) groupBarEl = swap(groupBarEl, buildGroupBar(store.getState()));
  }

  function salvarOrdem(ids: string[]): void {
    ordemDosGrupos = ids;
    if (groupBarEl !== null) groupBarEl = swap(groupBarEl, buildGroupBar(store.getState()));
    void saveTabPrefs(user.uid, { groupOrder: ids }).catch(() =>
      showToast('Não deu para guardar a ordem das abas. Confira a internet.'),
    );
  }

  function atualizarBoasVindas(state: AppState, parts: ChatParts, recriado: boolean): void {
    const group = state.view === 'group' ? activeGroup(state) : undefined;
    const mostrar =
      group !== undefined &&
      group.welcome !== undefined &&
      boasVistas !== null &&
      !boasVistas.has(group.id) &&
      !isOwner(group, user.uid);
    const chave = mostrar ? `${group.id}|${group.welcome}|${group.name}|${group.photo ?? ''}` : '';
    if (!recriado && chave === boasChave) return;
    boasChave = chave;
    if (!mostrar) {
      parts.welcomeSlot.replaceChildren();
      return;
    }
    parts.welcomeSlot.replaceChildren(
      renderWelcomeCard({
        group,
        text: group.welcome!,
        onDismiss: () => {
          boasVistas?.add(group.id);
          boasChave = '';
          parts.welcomeSlot.replaceChildren();
          // O "já vi" vai para a conta; se a rede falhar, some só nesta sessão.
          void markWelcomeSeen(user.uid, group.id).catch(() => undefined);
          document.querySelector<HTMLTextAreaElement>('.composer__input')?.focus();
        },
      }),
    );
  }

  /*
   * FUNDO DO CHAT (etapa 5c): o geral é escutado sempre; o do canal aberto,
   * enquanto ele estiver aberto (no Privado vale só o geral). O do canal
   * ganha do geral.
   */
  let fundoGeral: ChatBackground | null = null;
  let fundoDoCanal: ChatBackground | null = null;
  let chaveDoFundo: string | null = null;
  let pararFundoDoCanal: (() => void) | null = null;
  const pintarFundo = (): void => paintChatBackground(document.documentElement, fundoDoCanal ?? fundoGeral);
  const pararFundoGeral = watchChatBackground(user.uid, CHAVE_GERAL, (f) => {
    fundoGeral = f;
    pintarFundo();
  });
  function acompanharFundo(state: AppState): void {
    const chave = state.view === 'home' ? null : state.activeChannelId;
    if (chave === chaveDoFundo) return;
    chaveDoFundo = chave;
    pararFundoDoCanal?.();
    pararFundoDoCanal = null;
    fundoDoCanal = null;
    pintarFundo();
    if (chave === null) return;
    pararFundoDoCanal = watchChatBackground(user.uid, chave, (f) => {
      if (chaveDoFundo !== chave) return;
      fundoDoCanal = f;
      pintarFundo();
    });
  }

  /** As abas do painel mudaram (aqui ou em outro aparelho): o painel do grupo acompanha. */
  function acompanharPainel(abas: AbaDoPainel[], primeira: AbaDoPainel): void {
    const antes = `${abasDoPainel.join()}|${abaDoPainel}`;
    abasDoPainel = abas;
    // Escolheu outra "abre primeiro": já abre nela.
    if (primeira !== primeiraAba) abaDoPainel = primeira;
    primeiraAba = primeira;
    if (!abas.includes(abaDoPainel)) abaDoPainel = primeira;
    const state = store.getState();
    if (`${abasDoPainel.join()}|${abaDoPainel}` !== antes && state.view === 'group' && activeGroup(state) !== undefined && memberListEl !== null) {
      memberListEl = swap(memberListEl, buildMemberList(state));
    }
    atualizarBotaoDoPainel();
  }

  function atualizarBotaoDoPainel(): void {
    const visivel = document.documentElement.dataset['painel'] !== 'escondido';
    for (const b of document.querySelectorAll('.chat__panel-button')) b.setAttribute('aria-pressed', String(visivel));
  }

  /** O botão do cabeçalho (computador): mostra/esconde o painel na hora e guarda na conta. */
  function alternarPainel(): void {
    const a = accountAppearance();
    a.panelHidden = !a.panelHidden;
    setAccountAppearance(a);
    atualizarBotaoDoPainel();
    saveAppearance(user.uid, a).catch(() => showToast('Não deu para guardar. Confira a internet.'));
  }

  function handleChannelBackground(channelId: string): void {
    const state = store.getState();
    const canal = state.channels.find((c) => c.id === channelId);
    const grupo = state.groups.find((g) => g.id === state.activeGroupId);
    if (canal === undefined) return;
    const label = `#${canal.name}${grupo === undefined ? '' : ` · ${grupo.name}`}`.slice(0, 80);
    handleOpenSettings('aparencia', { id: channelId, label });
  }

  function render(state: AppState): void {
    acompanharFundo(state);
    sincronizarChatDaSala(state);
    // Saiu da chamada: a próxima entrada começa o relógio do zero.
    if (state.voice === null) entradaNaSala = null;
    // Ainda carregando os grupos: não pinta nada; o splash de fora segue valendo.
    if (!state.groupsLoaded && groupBarEl === null) {
      previous = state;
      return;
    }

    const prev = groupBarEl === null ? null : previous;
    // Não lidas (0.4.5): mudou alguma bolinha desde o último desenho.
    const bolinhasMudaram = versaoDasBolinhas !== bolinhasDesenhadas;
    bolinhasDesenhadas = versaoDasBolinhas;

    const groupsChanged =
      prev === null ||
      bolinhasMudaram ||
      prev.groups !== state.groups ||
      prev.activeGroupId !== state.activeGroupId;

    // A voz mexe na coluna de canais porque a faixa de chamada mora nela.
    const voiceChanged =
      prev === null ||
      prev.voice !== state.voice ||
      prev.centerView !== state.centerView ||
      prev.voiceMuted !== state.voiceMuted ||
      prev.voiceParticipants !== state.voiceParticipants ||
      prev.screenSharing !== state.screenSharing ||
      prev.screenLabel !== state.screenLabel ||
      prev.screenAudioMissing !== state.screenAudioMissing ||
      prev.screenMaximized !== state.screenMaximized ||
      prev.voiceReady !== state.voiceReady ||
      prev.voiceVideoPeers !== state.voiceVideoPeers ||
      prev.voiceEngineError !== state.voiceEngineError ||
      // Os dois avisos da sala: sem eles aqui, o aviso só aparecia/sumia quando
      // OUTRA coisa mudava — "Ativar áudio" resolvia o som e o aviso ficava.
      prev.voiceAudioBlocked !== state.voiceAudioBlocked ||
      prev.voiceMicDenied !== state.voiceMicDenied;

    const viewChanged = prev === null || prev.view !== state.view;
    /* Troca de visão para a transição 1 (etapa 20): outra tela ou outro grupo. */
    const visaoMudou = viewChanged || prev.activeGroupId !== state.activeGroupId;

    const friendsChanged =
      prev === null ||
      prev.friendships !== state.friendships ||
      prev.blockedUids !== state.blockedUids ||
      prev.friendProfiles !== state.friendProfiles ||
      friendsTabRendered !== friendsTab;

    /*
     * Só importa NA TELA INICIAL — é lá que `buildHomeColumn` lê essas quatro
     * fatias (a lista de conversas privadas). Fora dela, `buildChannelList`
     * nem olha para nenhuma das quatro.
     */
    const homeColumnChanged =
      state.view === 'home' &&
      (prev === null ||
        prev.dmThreads !== state.dmThreads ||
        prev.dmThreadsLoaded !== state.dmThreadsLoaded ||
        prev.activeDmUid !== state.activeDmUid ||
        prev.friendProfiles !== state.friendProfiles);

    const channelsChanged =
      prev === null ||
      groupsChanged ||
      voiceChanged ||
      viewChanged ||
      homeColumnChanged ||
      prev.channels !== state.channels ||
      prev.channelsLoaded !== state.channelsLoaded ||
      prev.activeChannelId !== state.activeChannelId ||
      // O cabeçalho mostra quantos membros o grupo tem (proposta A).
      prev.members !== state.members ||
      prev.membersLoaded !== state.membersLoaded;

    const membersChanged =
      prev === null ||
      groupsChanged ||
      viewChanged ||
      prev.members !== state.members ||
      prev.membersLoaded !== state.membersLoaded ||
      // As abas Agora e Fixadas do painel (proposta A).
      prev.voiceParticipants !== state.voiceParticipants ||
      prev.channels !== state.channels ||
      prev.voice !== state.voice ||
      // Sala ↔ chat troca o painel da direita (etapa 8b), e as fixadas da sala.
      prev.centerView !== state.centerView ||
      prev.roomPinnedMessages !== state.roomPinnedMessages ||
      prev.roomPinnedMessagesLoaded !== state.roomPinnedMessagesLoaded ||
      (abaDaSala === 'fixadas' && prev.roomMessages !== state.roomMessages) ||
      prev.pinnedMessages !== state.pinnedMessages ||
      prev.pinnedMessagesLoaded !== state.pinnedMessagesLoaded ||
      (abaDoPainel === 'fixadas' &&
        (prev.messages !== state.messages || prev.messagesAtStart !== state.messagesAtStart));

    // `viewChanged` também importa aqui: trocar para a tela inicial (ou
    // voltar) não mexe em `groups`/`activeGroupId`, e sem este termo o rail
    // ficava com o DOM velho — o grupo anterior e a casinha "ativos" ao
    // mesmo tempo (achado usando o app, não lendo o código).
    if (groupsChanged || viewChanged) groupBarEl = swap(groupBarEl, buildGroupBar(state));
    if (channelsChanged) {
      channelListEl = swap(
        channelListEl,
        state.view === 'home' ? buildHomeColumn(state) : buildChannelList(state),
        visaoMudou,
      );
    }

    /*
     * Coluna 4 aparece sempre que há ALGUMA coisa para mostrar nela: a
     * tela inicial inteira (perfil+fixadas no PV, ou — ajuste pós-etapa-19
     * — o espaço reservado da aba Amigos sem PV nenhum aberto, ver
     * `buildReservedAside`) ou a visão de grupo com um grupo selecionado
     * (membros). Só fica oculta de verdade quando não há grupo NENHUM — aí
     * não existe nem lista de membros nem PV para preencher o espaço.
     *
     * `hidden` em vez de não montar: o `swapCenter` usa `memberListEl` como
     * ÂNCORA para inserir a coluna do meio antes dela. Sumindo com o nó, a
     * coluna do meio perderia a referência de posição e apareceria no lugar
     * errado ao voltar para um grupo.
     *
     * `no-member-column` no `.app` é o conserto da borda do cabeçalho (ver
     * layout.css): sem ela, a faixa reservada da coluna 4 fica sem nenhuma
     * linha por cima quando não há painel nenhum — na prática, só o caso
     * "sem grupo nenhum" ainda cai nisso.
     *
     * E fica ANTES dos retornos antecipados abaixo — depois deles esta linha
     * nunca rodaria justamente nos casos em que ela existe para tratar.
     */
    const showAside = state.view === 'home' || (state.view === 'group' && state.groups.length > 0);
    if (memberListEl !== null) memberListEl.hidden = !showAside;
    root.classList.toggle('no-member-column', !showAside);

    /* --- coluna do meio: o chat OU a sala de voz ------------------------- */

    /*
     * A condição é avaliada ANTES de montar, e montar só acontece quando a sala
     * vai mesmo entrar na tela.
     *
     * Montar tem EFEITO COLATERAL: `buildVoiceRoom` move o <video> do motor
     * para o palco. Construir uma sala que seria descartada arrancava o vídeo da
     * sala visível — quem entrava no meio de uma transmissão via a legenda
     * "fulano está transmitindo" sobre um palco vazio.
     */
    /*
     * NA TELA INICIAL a coluna do meio é a de amigos, e pronto.
     *
     * Sai antes de qualquer decisão sobre sala de voz ou chat — e sair aqui NÃO
     * derruba a chamada: o motor de voz vive no store e nos elementos fora da
     * árvore de componentes, não nesta coluna. É a mesma razão pela qual
     * atravessar os 720px na etapa 8 não derrubava nada.
     */
    if (state.view === 'home') {
      /*
       * PV ABERTO: a coluna 3 é o PV, não a tela de amigos — mesmo raciocínio
       * de "montar uma vez, trocar o slot" do chat de grupo, só que a casca
       * nasce por PESSOA (`dmChatFriendUid`) em vez de por canal.
       */
      if (state.activeDmUid !== null) {
        const friendUid = state.activeDmUid;
        const dmChanged = centerMode !== 'dm' || dmChat === null || dmChatFriendUid !== friendUid;

        let parts: DmChatParts;
        if (dmChanged) {
          parts = renderDmChat({
            friend: friendView(state, friendUid),
            onOpenChannels: () => setDrawer('left'),
            onOpenPanel: () => setDrawer('right'),
            onTogglePanel: alternarPainel,
          });
          centerEl = swapCenter(centerEl, parts.element);
          dmChat = parts;
          dmChatFriendUid = friendUid;
          centerMode = 'dm';
          chat = null;
          chatChannelId = null;
        } else {
          parts = dmChat!;
        }

        const editingChanged = renderedEditingId !== editingId;
        renderedEditingId = editingId;

        const dmMessagesChanged =
          dmChanged ||
          prev === null ||
          prev.dmMessages !== state.dmMessages ||
          prev.dmMessagesLoaded !== state.dmMessagesLoaded ||
          prev.dmMessagesLoadingOlder !== state.dmMessagesLoadingOlder ||
          prev.dmMessagesAtStart !== state.dmMessagesAtStart ||
          prev.dmMessagesError !== state.dmMessagesError ||
          prev.friendProfiles !== state.friendProfiles ||
          editingChanged;

        if (dmMessagesChanged) {
          swapMessages(
            parts.messagesSlot,
            buildDmMessages(state),
            dmChanged,
            !dmChanged && prev !== null && prev.dmMessagesLoaded && state.dmMessagesLoaded,
          );
        }

        /*
         * Composer OU aviso de bloqueio — troca sempre que `blockedUids` muda,
         * não só ao (re)montar a casca: bloquear/desbloquear pode acontecer
         * com o PV já aberto (item 5 da etapa 18).
         */
        if (dmChanged || prev === null || prev.blockedUids !== state.blockedUids) {
          const blocked = state.blockedUids.includes(friendUid);
          parts.composerSlot.replaceChildren(
            blocked
              ? renderDmBlockedNotice(friendDisplayName(state, friendUid))
              : renderComposer({
                  channelName: friendDisplayName(state, friendUid),
                  hashPrefix: false,
                  onSend: handleSend,
                  painel: {},
                  aoArquivos: handleArquivos,
                  aoFigurinha: handleFigurinha,
                  aoVoz: handleVoz,
                  destino: `pv:${friendUid}`,
                }),
          );
        }

        /*
         * A MESMA faixa de chamada de grupo, só no mobile — no desktop ela já
         * mora na coluna 2 (home-column), que continua por trás do PV. Ver o
         * comentário equivalente na visão de grupo, mais abaixo.
         */
        if (dmChanged || voiceChanged) {
          const callBar = isMobileLayout() ? buildCallBar(state) : undefined;
          parts.callBarSlot.replaceChildren(
            ...(callBar === undefined ? [] : [renderCallBar(callBar, 'mobile')]),
          );
        }

        /*
         * Coluna 4 no PV: perfil + fixadas — etapa 19. `memberListEl` é o
         * MESMO nó âncora que o grupo usa para os membros (`swap`, mesma
         * função); aqui ele recebe o painel do PV em vez do painel de
         * membros. Reconstrói sempre que algo que o cartão OU a lista de
         * fixadas mostram muda — inclusive `dmMessages`/`dmMessagesAtStart`,
         * porque é deles que vem "alcançável" de cada fixada.
         */
        const asideChanged =
          dmChanged ||
          prev === null ||
          prev.friendProfiles !== state.friendProfiles ||
          prev.friendships !== state.friendships ||
          prev.blockedUids !== state.blockedUids ||
          prev.pinnedDmMessages !== state.pinnedDmMessages ||
          prev.pinnedDmMessagesLoaded !== state.pinnedDmMessagesLoaded ||
          prev.dmMessages !== state.dmMessages ||
          prev.dmMessagesAtStart !== state.dmMessagesAtStart;
        if (asideChanged) {
          memberListEl = swap(memberListEl, buildDmSidePanel(state, friendUid), dmChanged);
        }

        previous = state;
        return;
      }

      if (centerMode !== 'friends' || viewChanged) {
        friends = renderFriendsScreen(friendsScreenProps(state));
        centerEl = swapCenter(centerEl, friends.element);
        friendsTabRendered = friendsTab;
        centerMode = 'friends';
        chat = null;
        chatChannelId = null;
        dmChat = null;
        dmChatFriendUid = null;
        // Espaço reservado da coluna 4 — estático, monta uma vez por
        // transição para cá (ver buildReservedAside).
        memberListEl = swap(memberListEl, buildReservedAside(), true);
      } else if (friendsChanged) {
        // A CASCA fica — só o `update()` decide o que repintar. É o que
        // impede um dado novo de arrancar o formulário de adicionar de
        // debaixo de um pedido que acabei de mandar (ver friends-screen.ts).
        friends?.update(friendsScreenProps(state));
        friendsTabRendered = friendsTab;
      }
      previous = state;
      return;
    }

    /*
     * SEM GRUPO NENHUM a coluna do meio é o convite para criar ou entrar num,
     * e pronto — mesma regra da tela inicial acima: sai antes de qualquer
     * decisão sobre sala de voz ou chat, e não derruba nada porque o motor de
     * voz não mora nesta coluna.
     *
     * `groupsLoaded` evita piscar este convite antes dos dados chegarem — a
     * mesma checagem que existia no retorno antecipado que este ramo
     * substituiu.
     */
    if (state.groupsLoaded && state.groups.length === 0) {
      if (centerMode !== 'no-groups') {
        centerEl = swapCenter(centerEl, buildNoGroupsCenter());
        centerMode = 'no-groups';
        chat = null;
        chatChannelId = null;
      }
      previous = state;
      return;
    }

    // Chegar até aqui já garante `state.view !== 'home'` (ver o retorno
    // antecipado acima) — `isViewingRoom` inclui a checagem mesmo assim, para
    // que esta condição e a de `buildCallBar` nunca voltem a divergir.
    const showRoom = isViewingRoom(state);

    if (showRoom) {
      // Na sala, a casca do chat é descartada. Não há texto de composer para
      // preservar aqui, então reconstruir a sala inteira é barato e honesto.
      if (centerMode !== 'voice' || voiceChanged || channelsChanged) {
        const room = buildVoiceRoom(state);
        if (room !== null) {
          centerEl = swapCenter(centerEl, room);
          centerMode = 'voice';
          chat = null;
          chatChannelId = null;
        }
      }
    } else {
      const channel = state.channels.find((c) => c.id === state.activeChannelId) ?? null;
      const channelChanged =
        centerMode !== 'chat' || chat === null || chatChannelId !== state.activeChannelId;

      // `parts` recebe a casca desta passada, seja a recém-montada ou a que já
      // estava — assim o TypeScript prova que ela não é nula daqui para baixo.
      let parts: ChatParts;
      if (channelChanged) {
        parts = renderChat({
          channel,
          onSend: handleSend,
          aoArquivos: handleArquivos,
          aoFigurinha: handleFigurinha,
          aoVoz: handleVoz,
          onOpenChannels: () => setDrawer('left'),
          onOpenMembers: () => setDrawer('right'),
          onTogglePanel: alternarPainel,
          pinnedCount: state.pinnedMessages.length,
          onOpenPins: handleOpenPins,
        });
        centerEl = swapCenter(centerEl, parts.element);
        chat = parts;
        chatChannelId = state.activeChannelId;
        centerMode = 'chat';
      } else {
        parts = chat!;
      }

      if (channelChanged || prev === null || prev.pinnedMessages !== state.pinnedMessages) {
        parts.setPinnedCount(state.pinnedMessages.length);
      }
      atualizarBoasVindas(state, parts, channelChanged);
      // Canal renomeado ou com emoji novo (etapa 3b): só o título muda.
      if (!channelChanged && prev !== null && prev.channels !== state.channels) parts.setTitle(channel);

      // A edição é estado LOCAL: o store não muda quando entro em edição, então
      // a comparação de `prev` não perceberia — e o balão não viraria campo.
      const editingChanged = renderedEditingId !== editingId;
      renderedEditingId = editingId;

      const messagesChanged =
        channelChanged ||
        prev === null ||
        prev.messages !== state.messages ||
        prev.messagesLoaded !== state.messagesLoaded ||
        prev.messagesLoadingOlder !== state.messagesLoadingOlder ||
        prev.messagesAtStart !== state.messagesAtStart ||
        prev.messagesError !== state.messagesError ||
        prev.members !== state.members ||
        editingChanged;

      if (messagesChanged) {
        swapMessages(
          parts.messagesSlot,
          buildMessages(state),
          channelChanged,
          !channelChanged && prev !== null && prev.messagesLoaded && state.messagesLoaded,
        );
      }

      /*
       * O painel flutuante de fixadas (etapa 19), SE estiver aberto —
       * `.isConnected` cai para false sozinho quando fecha (Escape, clique
       * fora ou o botão: os três chamam `dialog.close()`, que remove o nó do
       * DOM em `modal.ts`), sem precisar de um listener aqui para saber.
       */
      if (pinsPanel !== null) {
        if (pinsPanel.element.isConnected) {
          if (messagesChanged || prev === null || prev.pinnedMessages !== state.pinnedMessages || prev.pinnedMessagesLoaded !== state.pinnedMessagesLoaded) {
            const group = activeGroup(state) ?? null;
            if (group !== null) pinsPanel.update(buildGroupPins(state, isOwner(group, user.uid)));
          }
        } else {
          pinsPanel = null;
        }
      }

      /*
       * A MESMA faixa de chamada, montada acima do composer.
       *
       * No desktop ela vive no rodapé da coluna de canais; no mobile essa coluna
       * é gaveta e a faixa sumiria justamente durante uma chamada. O CSS mostra
       * exatamente uma das duas.
       */
      if (channelChanged || voiceChanged) {
        const callBar = isMobileLayout() ? buildCallBar(state) : undefined;
        parts.callBarSlot.replaceChildren(
          ...(callBar === undefined ? [] : [renderCallBar(callBar, 'mobile')]),
        );
      }
    }

    if (membersChanged) memberListEl = swap(memberListEl, buildMemberList(state), visaoMudou);

    /* --- chat da sala (etapa 8b), no painel da direita ------------------- */
    if (painelDaSala !== null && memberListEl === painelDaSala.element) {
      const novo = painelDaSalaNovo;
      painelDaSalaNovo = false;
      const editandoMudou = renderedRoomEditingId !== editingId;
      renderedRoomEditingId = editingId;
      if (
        novo ||
        editandoMudou ||
        prev === null ||
        prev.roomMessages !== state.roomMessages ||
        prev.roomMessagesLoaded !== state.roomMessagesLoaded ||
        prev.roomMessagesLoadingOlder !== state.roomMessagesLoadingOlder ||
        prev.roomMessagesAtStart !== state.roomMessagesAtStart ||
        prev.roomMessagesError !== state.roomMessagesError ||
        prev.members !== state.members
      ) {
        swapMessages(
          painelDaSala.messagesSlot,
          buildRoomMessages(state),
          novo,
          !novo && prev !== null && prev.roomMessagesLoaded && state.roomMessagesLoaded,
        );
      }
    }

    previous = state;
  }

  const handleToggleScreenShare = (): void => {
    // Na janela do Loft não existe seletor do navegador: entra o nosso.
    const desktop = loftDesktop();
    const janela =
      desktop === null
        ? undefined
        : {
            escolherFonte: () => openScreenPicker(desktop),
            audioDoPc: () => capturarAudioDoPc(desktop),
          };
    void store.toggleScreenShare(janela).then((refusal) => {
      if (refusal !== null) showToast(refusal);
    });
  };

  /* --- tela cheia ---------------------------------------------------------- */

  let idleTimer = 0;

  /** Mouse parado esconde os controles; mexer traz de volta. */
  const onPointerMove = (): void => {
    const room = centerEl?.querySelector('.room');
    room?.classList.remove('is-idle');
    window.clearTimeout(idleTimer);
    idleTimer = window.setTimeout(() => room?.classList.add('is-idle'), 2500);
  };

  function setMaximized(maximized: boolean): void {
    store.setScreenMaximized(maximized);

    if (maximized) {
      document.addEventListener('pointermove', onPointerMove);
      onPointerMove();
      // No app Android a tela cheia da página quebra (sumia tudo, botões
      // mortos): o Android esconde as barras e deita a tela.
      if (emAppAndroid()) {
        telaCheiaNoAndroid(true);
        return;
      }
      /*
       * Fullscreen no elemento RAIZ, que nunca é reconstruído. Pedir no vídeo
       * ou na sala cairia toda vez que alguém entrasse ou apertasse mudo — o
       * elemento sairia do documento e o navegador encerraria o fullscreen.
       * A sobreposição em CSS é que garante o efeito; isto é complemento.
       */
      /*
       * No celular, ver a tela de alguém em retrato é quase inútil. Depois do
       * fullscreen, tenta girar para paisagem — só funciona COM fullscreen, e o
       * iOS não tem a API. Degrada em silêncio para só o fullscreen.
       */
      void root
        .requestFullscreen?.()
        .then(() => {
          const orientation = screen.orientation as ScreenOrientation & {
            lock?: (o: string) => Promise<void>;
          };
          return orientation.lock?.('landscape');
        })
        .catch(() => {});
      return;
    }

    document.removeEventListener('pointermove', onPointerMove);
    window.clearTimeout(idleTimer);
    centerEl?.querySelector('.room')?.classList.remove('is-idle');
    if (emAppAndroid()) telaCheiaNoAndroid(false);
    const orientation = screen.orientation as ScreenOrientation & { unlock?: () => void };
    orientation.unlock?.();
    if (document.fullscreenElement !== null) void document.exitFullscreen().catch(() => {});
  }

  // Sair do fullscreen pelo Escape ou pelo navegador precisa desmaximizar junto,
  // senão a sobreposição continuaria cobrindo a tela.
  const onFullscreenChange = (): void => {
    if (document.fullscreenElement === null && store.getState().screenMaximized) {
      setMaximized(false);
    }
  };
  document.addEventListener('fullscreenchange', onFullscreenChange);

  /** Painel de diagnóstico: só pelo atalho escondido (Ctrl+Alt+V), para depurar. */
  const handleOpenDiagnostics = (): void => {
    const state = store.getState();
    if (state.voice === null) return;
    openVoiceDiagnostics(
      () => store.voiceDiagnostics(),
      (uid) => state.members.find((m) => m.id === uid)?.displayName ?? 'Usuário',
    );
  };

  const onShortcut = (event: KeyboardEvent): void => {
    // Ctrl+Alt+V: não colide com nada do navegador, ao contrário de Ctrl+Shift+D.
    if (event.ctrlKey && event.altKey && event.key.toLowerCase() === 'v') {
      event.preventDefault();
      handleOpenDiagnostics();
      return;
    }
    // Escape sai da tela cheia. Com fullscreen de verdade o navegador já trata,
    // mas a sobreposição em CSS precisa disto quando o fullscreen foi recusado.
    if (event.key === 'Escape' && store.getState().screenMaximized) {
      event.preventDefault();
      setMaximized(false);
    }
  };
  document.addEventListener('keydown', onShortcut);

  /*
   * O anel de "falando" é ligado DIRETO no bloco.
   *
   * Passar por estado significaria re-renderizar a coluna do meio a cada
   * transição de voz de cada pessoa. Aqui é uma classe num elemento.
   */
  const unsubscribeSpeaking = store.onSpeaking((uid, isSpeaking) => {
    if (isSpeaking) speaking.add(uid);
    else speaking.delete(uid);
    centerEl
      ?.querySelector(`.room__person[data-uid="${uid}"]`)
      ?.classList.toggle('is-speaking', isSpeaking);
  });

  const uninstallMenus = installContextMenus({
    getState: () => store.getState(),
    uid: user.uid,
    copyInviteLink: handleCopyInvite,
    groupSettings: handleGroupSettings,
    groupNickname: () => handleOpenSettings('grupos'),
    channelBackground: handleChannelBackground,
    leaveGroup: handleLeaveGroup,
    deleteGroup: handleDeleteGroup,
    deleteChannel: handleDeleteChannel,
    removeMember: handleRemoveMember,
    deleteMessage: handleDeleteMessage,
    replyToMessage: handleReplyToMessage,
    editMessage: handleEditMessage,
    openDm: (uid) => store.openDm(uid),
    togglePinMessage: handleTogglePinMessage,
    jumpToPinnedMessage: handleJumpToPin,
    unpinMessage: handleUnpin,
  });

  /* --- cartão da pessoa (etapa 2c) ---------------------------------------- */

  /**
   * Clique no nome ou na foto de alguém (qualquer elemento com
   * `data-profile-uid`) abre o cartão flutuante dela. Um ouvinte só, na raiz,
   * como os menus de contexto — os componentes só marcam o elemento.
   */
  function abrirCartao(anchor: HTMLElement): void {
    const uid = anchor.dataset['profileUid'] ?? '';
    if (uid === '') return;
    const state = store.getState();
    const conhecido =
      uid === user.uid
        ? me
        : (state.members.find((m) => m.id === uid) ??
          (() => {
            const perfil = state.friendProfiles.get(uid);
            return perfil === undefined
              ? undefined
              : { displayName: perfil.displayName, initials: perfil.initials, photo: perfil.photo };
          })());
    const amizade = state.friendships.find((f) => f.members.includes(uid) && f.members.includes(user.uid));
    const vinculo: Vinculo =
      uid === user.uid
        ? 'eu'
        : state.blockedUids.includes(uid)
          ? 'bloqueado'
          : amizade?.status === 'accepted'
            ? 'amigo'
            : amizade !== undefined
              ? 'pedido'
              : 'nada';

    openPersonPopover({
      uid,
      anchor,
      fallback: {
        displayName: conhecido?.displayName ?? 'Usuário',
        initials: conhecido?.initials ?? '?',
        photo: conhecido?.photo,
      },
      vinculo,
      onMessage: () => {
        setDrawer(null);
        store.setView('home');
        store.openDm(uid);
      },
      onAddFriend: async () => {
        try {
          const resultado = await sendFriendRequest(user.uid, uid);
          showToast(resultado === 'accepted' ? 'Agora vocês são amigos.' : 'Pedido de amizade enviado.');
        } catch (error) {
          showToast(textoDoErro(error, 'Não foi possível mandar o pedido.'));
          throw error;
        }
      },
      onEditProfile: () => handleOpenSettings(),
      ...(() => {
        const extra = perfilNoServidor(state, uid);
        return extra === null ? {} : { noServidor: extra };
      })(),
    });
  }

  /**
   * 0.8.5: no perfil de alguém DENTRO de um grupo — os cargos (o dono dá e
   * tira pelas etiquetas) e desde quando a pessoa está no grupo.
   */
  function perfilNoServidor(state: AppState, uid: string): HTMLElement | null {
    if (state.view !== 'group') return null;
    const group = activeGroup(state);
    const membro = state.members.find((m) => m.id === uid);
    if (group === undefined || membro === undefined) return null;
    const dono = isOwner(group, user.uid);
    const normais = state.cargos.filter((c) => c.todos !== true);
    const caixa = el('div', { class: 'perfil-servidor' });
    if (normais.length > 0 || dono) {
      caixa.append(
        el('span', { class: 'cg-rotulo' }, ['Cargos']),
        chipsDeCargos({
          membro,
          cargos: normais,
          podeEditar: dono,
          aoDar: (cargoId, dar) =>
            darCargo(group.id, uid, cargoId, dar).catch((e) => {
              showToast(textoDoErro(e, 'Não deu para mudar o cargo.'));
              throw e;
            }),
        }),
      );
    }
    const quando = membro.id === group.ownerId ? 'Criou o grupo' : membro.entrouEm;
    if (quando !== undefined) {
      const data = new Date(quando);
      const texto =
        membro.id === group.ownerId
          ? 'Dono do grupo'
          : Number.isNaN(data.getTime())
            ? ''
            : data.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' });
      const desde = el('span', { class: 'perfil-servidor__desde' }, [texto]);
      caixa.append(el('span', { class: 'cg-rotulo' }, ['Membro desde']), desde);
      // Quem convidou: o convite guarda quem criou.
      if (membro.convite !== undefined && membro.id !== group.ownerId) {
        void quemConvidou(membro.convite).then((criador) => {
          if (criador === null) return;
          const nome = state.members.find((m) => m.id === criador)?.displayName;
          if (nome !== undefined) desde.textContent = `${texto} · entrou pelo convite de ${nome}`;
        });
      }
    }
    return caixa.childElementCount === 0 ? null : caixa;
  }

  const onProfileClick = (event: MouseEvent): void => {
    const alvo = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-profile-uid]');
    if (alvo === null || alvo === undefined) return;
    abrirCartao(alvo);
  };
  const onProfileKey = (event: KeyboardEvent): void => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const alvo = event.target as HTMLElement;
    if (alvo.dataset['profileUid'] === undefined) return;
    event.preventDefault();
    abrirCartao(alvo);
  };
  root.addEventListener('click', onProfileClick);
  root.addEventListener('keydown', onProfileKey);

  // Android (etapa 10b): a notificação "Em chamada" enquanto há chamada aberta.
  const acompanharChamada = acompanharChamadaNoAndroid(
    () => {
      const state = store.getState();
      return state.voice === null ? null : voiceChannelName(state);
    },
    () => store.disconnectVoice(),
  );
  /*
   * NOTIFICAÇÕES (0.4.0): tocar numa notificação abre a conversa dela; e a
   * conversa que está aberta não gera aviso.
   */
  const abrirConversa = (rota: string): void => {
    const [tipo, a, b] = rota.split('/');
    setDrawer(null);
    if (tipo === 'pv' && a !== undefined && a !== '') {
      store.setView('home');
      store.openDm(a);
    } else if (tipo === 'grupo' && a !== undefined && b !== undefined && b !== '') {
      store.setView('group');
      store.focusGroup(a, b);
      if (store.getState().activeGroupId === a) store.setActiveChannel(b);
    }
  };
  const conversaAberta = (state: AppState): string => {
    if (state.view === 'home') return state.activeDmUid === null ? '' : `pv:${state.activeDmUid}`;
    if (state.centerView === 'chat') return state.activeChannelId === null ? '' : `canal:${state.activeChannelId}`;
    return state.roomChatChannelId === null ? '' : `canal:${state.roomChatChannelId}`;
  };
  const avisos = ligarAvisos(user.uid, abrirConversa);
  // A janela do PC sabe como nasceu: a barra de cima ganha os botões.
  void quandoAJanelaLigar().then((info) => {
    if (info !== null && root.isConnected) render(store.getState());
  });
  const pararFigurinhas = ligarFigurinhas(user.uid);

  /*
   * NÃO LIDAS (0.4.5): mudou uma contagem → redesenha (uma vez só, logo
   * depois) as abas e a coluna da esquerda.
   */
  let versaoDasBolinhas = 0;
  let bolinhasDesenhadas = 0;
  let desenhoMarcado = false;
  const naoLidas = criarNaoLidas(user.uid, () => {
    versaoDasBolinhas += 1;
    // Bolinha vermelha no ícone da bandeja (PC): tem alguma não lida?
    const st = store.getState();
    avisarBandeja(naoLidas.privado() > 0 || st.groups.some((g) => naoLidas.grupo(g.id) > 0));
    if (desenhoMarcado) return;
    desenhoMarcado = true;
    setTimeout(() => {
      desenhoMarcado = false;
      if (root.isConnected) render(store.getState());
    }, 0);
  });
  const sincronizarNaoLidas = (state: AppState): void =>
    naoLidas.sincronizar(
      state.groups.map((g) => g.id),
      state.dmThreads,
      conversaAberta(state),
    );

  const unsubscribe = store.subscribe((state) => {
    render(state);
    acompanharChamada.aoMudar();
    avisos.conversa(conversaAberta(state));
    sincronizarNaoLidas(state);
  });
  avisos.conversa(conversaAberta(store.getState()));
  sincronizarNaoLidas(store.getState());
  render(store.getState());

  return {
    element: root,
    focusGroup(groupId: string): void {
      store.focusGroup(groupId);
    },
    destroy(): void {
      closeGroupMenu();
      closePersonPopover();
      root.removeEventListener('click', onProfileClick);
      root.removeEventListener('keydown', onProfileKey);
      uninstallMenus();
      document.removeEventListener('keydown', onShortcut);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      window.removeEventListener('popstate', onPopState);
      document.removeEventListener('pointerdown', onPointerDownOutside);
      stopLayoutWatch();
      stopViewportWatch();
      document.removeEventListener('pointermove', onPointerMove);
      window.clearTimeout(idleTimer);
      unsubscribeSpeaking();
      hideToast();
      unsubscribe();
      bannerAtual?.parar();
      pararPrefs();
      pararFundoGeral();
      pararFundoDoCanal?.();
      paintChatBackground(document.documentElement, null);
      acompanharChamada.desligar();
      avisos.parar();
      naoLidas.parar();
      pararFigurinhas();
      store.dispose();
    },
  };
}
