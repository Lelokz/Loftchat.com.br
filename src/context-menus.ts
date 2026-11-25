/**
 * O menu de contexto do app inteiro.
 *
 * Um único listener de `contextmenu` no documento, que descobre o alvo por
 * `closest('[data-context]')`. Ficar aqui, e não espalhado por componente,
 * garante duas coisas: um lugar só decide o que cada alvo oferece, e nenhum
 * clique com o botão direito escapa sem resposta.
 *
 * O MENU NUNCA ABRE VAZIO E NUNCA DEIXA DE ABRIR. Suprimir o menu do navegador
 * e não pôr nada no lugar faz o clique parecer quebrado — por isso existe o
 * menu mínimo lá embaixo, com "Copiar" (travado quando não há o que copiar) e
 * "Recarregar página".
 *
 * PENDÊNCIA REGISTRADA: substituir o menu nativo tira também o que ele oferecia
 * para LINK ("abrir em nova aba", "copiar endereço") e para IMAGEM ("copiar
 * imagem", "salvar imagem"). Hoje isso não quebra nada, porque mensagem só tem
 * texto e o corpo entra como nó de texto, sem link clicável. Mas o
 * `message-list.ts` já tem renderImage/renderFile/renderAudio esperando a etapa
 * de anexos — quem implementar link clicável ou anexo implementa o menu deles na
 * mesma etapa, senão o menu de contexto vira uma regressão em cima de um
 * recurso novo.
 */

import { openMenu } from './components/context-menu/context-menu';
import type { MenuExtras, MenuItem } from './components/context-menu/context-menu';
import { RAPIDAS_CELULAR, abrirSeletorDeReacao, dadosDaMensagem, instalarBarraDeReacoes, podeReagir, reagir } from './components/reacoes/reacoes';
import { addReactionIcon } from './lib/icons';
import { showToast } from './components/toast/toast';
import { canLeaveGroup, isOwner, meuTopo, OWNER_CANNOT_LEAVE, pode } from './lib/permissions';
import type { ContextoDePermissao } from './lib/permissions';
import { PERMS_DAS_CONFIGURACOES } from './lib/permissoes';
import type { Group } from './types/models';

/** As permissões do grupo aberto, para os menus (0.8.5). */
function ctxDoMenu(state: AppState, group: Group | null): ContextoDePermissao {
  return { group, members: state.members, cargos: state.cargos, channels: state.channels };
}
import { desfavoritar, ehFavorita, favoritar } from './lib/figurinhas';
import type { AppState } from './state/store';
import type { MemberId } from './types/models';

export interface ContextMenuActions {
  getState(): AppState;
  uid: MemberId;
  copyInviteLink(groupId: string): void;
  groupSettings(groupId: string): void;
  groupNickname(groupId: string): void;
  /** Etapa 5c: abre Configurações → Aparência apontando para o fundo deste canal. */
  channelBackground(channelId: string): void;
  /** 0.8.5: permissões do canal e modo lento. */
  channelPermissions(channelId: string): void;
  channelSlowMode(channelId: string): void;
  /** 0.8.5 moderação: apelido, castigo, banir, passar o grupo. */
  memberNickname(memberId: MemberId): void;
  memberTimeout(memberId: MemberId): void;
  memberEndTimeout(memberId: MemberId): void;
  memberBan(memberId: MemberId): void;
  transferOwnership(memberId: MemberId): void;
  leaveGroup(groupId: string): void;
  deleteGroup(groupId: string): void;
  deleteChannel(channelId: string): void;
  removeMember(memberId: MemberId): void;
  /**
   * Apaga uma mensagem — de grupo OU de PV. Quem implementa decide qual,
   * olhando se há um PV NA TELA (`pvAberto` no app.ts): as duas telas nunca
   * estão visíveis ao mesmo tempo, então isso basta para desambiguar.
   */
  deleteMessage(messageId: string, sala?: boolean): void;
  /**
   * Começa a responder: a faixa aparece acima do composer. Grupo ou PV, mesma regra acima.
   * `sala` (etapa 8b): a mensagem é do chat da sala de voz, no painel da direita.
   */
  replyToMessage(messageId: string, sala?: boolean): void;
  /** Entra em edição no próprio balão. Só o autor chega aqui. Grupo ou PV, mesma regra acima. */
  editMessage(messageId: string): void;
  /** 0.11.0: abre a janela de encaminhar esta mensagem (ausente = ainda não existe). */
  forwardMessage?(messageId: string, tipo: 'pv' | 'grupo', sala: boolean): void;
  /** Abre o PV com este amigo — item "Enviar mensagem" do menu de contexto dele. */
  openDm(friendUid: MemberId): void;
  /**
   * Fixa OU desafixa — quem implementa decide qual, olhando se a mensagem já
   * está em `state.pinnedMessages` (é por isso que o rótulo do item já
   * muda aqui, no menu, sem round-trip). Grupo ou PV, mesma mensagem, mesma
   * ação — a regra é que muda quem pode chegar a ela (dono vs. qualquer um
   * dos dois).
   */
  togglePinMessage(messageId: string, sala?: boolean): void;
  /**
   * Rola até a mensagem original de uma fixada e destaca — "Ir para a
   * mensagem" no menu da PRÓPRIA fixada (não da mensagem original). Grupo
   * ou PV, mesma ação — ver `pinnedItemItems`.
   */
  jumpToPinnedMessage(messageId: string): void;
  /**
   * Desafixa — recebe TODOS os ids do grupo daquele `messageId` de uma vez
   * (ver o agrupamento em `pinned-list.ts`), não só um.
   */
  unpinMessage(pinIds: string[]): void;
}

/** Copia com retorno na tela — sem isso a pessoa não sabe se funcionou. */
function copy(text: string, done: string): void {
  void navigator.clipboard
    .writeText(text)
    .then(() => showToast(done))
    .catch(() => showToast('Não consegui copiar. Use Ctrl+C.'));
}

/* -------------------------------------------------------------------------- */
/* Campo de texto                                                              */
/* -------------------------------------------------------------------------- */

type TextField = HTMLInputElement | HTMLTextAreaElement;

function isTextField(node: EventTarget | null): node is TextField {
  return (
    node instanceof HTMLTextAreaElement ||
    (node instanceof HTMLInputElement && node.type === 'text')
  );
}

function textFieldItems(field: TextField): MenuItem[] {
  const start = field.selectionStart ?? 0;
  const end = field.selectionEnd ?? 0;
  const selected = field.value.slice(start, end);
  const hasSelection = selected !== '';

  /*
   * `setRangeText` e não mexer no `.value` na mão: ele participa da pilha de
   * desfazer do navegador, então Ctrl+Z depois de recortar ou colar pelo menu
   * funciona igual ao do teclado. (`execCommand` faria o mesmo, mas está
   * depreciado.)
   */
  const replaceSelection = (text: string): void => {
    field.focus();
    field.setRangeText(text, start, end, 'end');
    field.dispatchEvent(new Event('input', { bubbles: true }));
  };

  return [
    {
      label: 'Recortar',
      disabled: !hasSelection,
      onSelect: () => {
        copy(selected, 'Recortado.');
        replaceSelection('');
      },
    },
    {
      label: 'Copiar',
      disabled: !hasSelection,
      onSelect: () => copy(selected, 'Copiado.'),
    },
    {
      label: 'Colar',
      onSelect: () => {
        void navigator.clipboard
          .readText()
          .then(replaceSelection)
          // O navegador pede permissão para LER a área de transferência, e a
          // recusa é o caminho mais provável de falhar deste menu inteiro.
          // Sem este aviso, "Colar" seria a única opção que não responde nada.
          .catch(() => showToast('Sem acesso à área de transferência. Use Ctrl+V.'));
      },
    },
    {
      label: 'Selecionar tudo',
      disabled: field.value === '',
      onSelect: () => {
        field.focus();
        field.select();
      },
    },
  ];
}

/* -------------------------------------------------------------------------- */
/* Alvos do app                                                                */
/* -------------------------------------------------------------------------- */

/** Mensagem com figurinha (0.5.0): favoritar ou tirar das favoritas. */
function itensDaFigurinha(target: HTMLElement): MenuItem[] {
  const img = target.querySelector<HTMLImageElement>('img.figurinha');
  if (img === null) return [];
  const url = img.getAttribute('src') ?? '';
  if (ehFavorita(url)) {
    return [{ label: 'Tirar das favoritas', onSelect: () => void desfavoritar(url) }];
  }
  return [
    {
      label: 'Favoritar figurinha',
      onSelect: () => {
        void favoritar({ url, largura: img.naturalWidth || 512, altura: img.naturalHeight || 512 }).then(() =>
          showToast('Figurinha nas favoritas.'),
        );
      },
    },
  ];
}

function messageItems(
  target: HTMLElement,
  actions: ContextMenuActions,
  state: AppState,
  sala = false,
): MenuItem[] {
  const messageId = target.dataset['messageId'] ?? '';
  const authorId = target.dataset['authorId'] ?? '';
  const text = target.querySelector('.message__text')?.textContent ?? '';

  const group = state.groups.find((g) => g.id === state.activeGroupId) ?? null;
  // 0.8.5: autor, dono, ou quem tem "Apagar mensagens dos outros" NESTE canal —
  // o mesmo que a regra do banco aceita. A tela espelha o banco.
  const ctx = ctxDoMenu(state, group);
  const canal = sala ? (state.voice?.channelId ?? '') : (state.activeChannelId ?? '');
  const canDelete = authorId === actions.uid || pode(ctx, actions.uid, 'apagar-dos-outros', canal);

  const items: MenuItem[] = [
    ...itensDaFigurinha(target),
    { label: 'Copiar texto', disabled: text === '', onSelect: () => copy(text, 'Copiado.') },
    { label: 'Responder', onSelect: () => actions.replyToMessage(messageId, sala) },
  ];

  /*
   * EDITAR é só do AUTOR — nem o dono do grupo entra aqui.
   *
   * Apagar ele pode (moderação, e a cascata de apagar o grupo); editar seria
   * falar pela boca de alguém. A regra do Firestore cobra o mesmo, com
   * `hasOnly(['body','editedAt'])` — a tela espelha o banco, não inventa.
   */
  // 0.10.0: visualização única não se edita (a legenda faz parte do que some).
  if (authorId === actions.uid && target.querySelector('.unica-balao') === null) {
    items.push({ label: 'Editar', onSelect: () => actions.editMessage(messageId) });
  }

  // Fixar: "Fixar mensagens"; desafixar: "Desafixar mensagens" (0.8.5).
  const pinned = (sala ? state.roomPinnedMessages : state.pinnedMessages).some((p) => p.messageId === messageId);
  if (pode(ctx, actions.uid, pinned ? 'desafixar' : 'fixar', canal)) {
    items.push({
      label: pinned ? 'Desafixar' : 'Fixar mensagem',
      onSelect: () => actions.togglePinMessage(messageId, sala),
    });
  }

  if (canDelete) {
    items.push({
      label: 'Apagar mensagem',
      danger: true,
      separatorBefore: true,
      onSelect: () => actions.deleteMessage(messageId, sala),
    });
  }

  return items;
}

/**
 * Menu da mensagem de PV — dispatch separado de `messageItems`, não um
 * `if` a mais dentro dela: PV não tem dono, então "apagar mensagem alheia"
 * simplesmente não existe aqui, e misturar as duas condições na mesma
 * função é o tipo de engano que faria um PV herdar moderação de grupo por
 * acidente (etapa 18).
 */
function dmMessageItems(
  target: HTMLElement,
  actions: ContextMenuActions,
  state: AppState,
): MenuItem[] {
  const messageId = target.dataset['messageId'] ?? '';
  const authorId = target.dataset['authorId'] ?? '';
  const text = target.querySelector('.message__text')?.textContent ?? '';
  const mine = authorId === actions.uid;

  // `pinnedDmMessages`, não `pinnedMessages`: são fatias SEPARADAS (ver
  // AppState) — a de grupo e a de PV podem estar carregadas ao mesmo tempo.
  const pinned = state.pinnedDmMessages.some((p) => p.messageId === messageId);
  const items: MenuItem[] = [
    ...itensDaFigurinha(target),
    { label: 'Copiar texto', disabled: text === '', onSelect: () => copy(text, 'Copiado.') },
    { label: 'Responder', onSelect: () => actions.replyToMessage(messageId) },
    // Fixar é dos DOIS participantes do PV, não só de quem escreveu — etapa 19.
    {
      label: pinned ? 'Desafixar' : 'Fixar mensagem',
      onSelect: () => actions.togglePinMessage(messageId),
    },
  ];

  // Só o autor — nem editar, nem apagar. Não existe dono de PV.
  if (mine) {
    // 0.10.0: visualização única não se edita.
    if (target.querySelector('.unica-balao') === null) items.push({ label: 'Editar', onSelect: () => actions.editMessage(messageId) });
    items.push({
      label: 'Apagar mensagem',
      danger: true,
      separatorBefore: true,
      onSelect: () => actions.deleteMessage(messageId),
    });
  }

  return items;
}

/** Menu do amigo, na aba Amigos — hoje só "Enviar mensagem" (etapa 18). */
function friendItems(target: HTMLElement, actions: ContextMenuActions): MenuItem[] {
  const friendUid = target.dataset['friendUid'] ?? '';
  if (friendUid === '') return [];
  return [{ label: 'Enviar mensagem', onSelect: () => actions.openDm(friendUid) }];
}

/**
 * Menu de UMA FIXADA na lista de fixadas — diferente do "Fixar/Desafixar"
 * que já existe no menu da mensagem ORIGINAL (`messageItems`/
 * `dmMessageItems`, acima): aquele só alcança mensagem carregada na tela;
 * este cobre também fixada "apagada"/"fora-da-janela", que é exatamente o
 * caso que o outro não cobre. `canUnpin` já vem decidido por quem montou a
 * lista (dono no grupo, qualquer um dos dois no PV) — ver pinned-list.ts.
 */
function pinnedItemItems(target: HTMLElement, actions: ContextMenuActions): MenuItem[] {
  const messageId = target.dataset['messageId'] ?? '';
  const reachable = target.dataset['reachable'];
  const canUnpin = target.dataset['canUnpin'] === 'true';
  const pinIds = (target.dataset['pinIds'] ?? '').split(',').filter((id) => id !== '');

  const items: MenuItem[] = [
    {
      label: 'Ir para a mensagem',
      disabled: reachable !== 'carregada',
      ...(reachable !== 'carregada'
        ? { reason: 'A mensagem original não está carregada aqui.' }
        : {}),
      onSelect: () => actions.jumpToPinnedMessage(messageId),
    },
  ];

  if (canUnpin) {
    items.push({
      label: 'Desafixar',
      danger: true,
      separatorBefore: true,
      onSelect: () => actions.unpinMessage(pinIds),
    });
  }

  return items;
}

function groupItems(
  target: HTMLElement,
  actions: ContextMenuActions,
  state: AppState,
): MenuItem[] {
  const groupId = target.dataset['groupId'] ?? '';
  const group = state.groups.find((g) => g.id === groupId) ?? null;
  if (group === null) return [];

  const owner = isOwner(group, actions.uid);
  const items: MenuItem[] = [];

  // 0.8.5: do grupo aberto o app sabe as permissões; dos outros, só o dono.
  const aberto = groupId === state.activeGroupId;
  const podeAqui = (p: string): boolean => (aberto ? pode(ctxDoMenu(state, group), actions.uid, p) : owner);
  if (PERMS_DAS_CONFIGURACOES.some(podeAqui)) {
    items.push({ label: 'Configurações do grupo', onSelect: () => actions.groupSettings(groupId) });
  }
  if (podeAqui('criar-convites')) {
    items.push({ label: 'Copiar código do grupo', onSelect: () => actions.copyInviteLink(groupId) });
  }

  items.push({ label: 'Apelido do grupo', onSelect: () => actions.groupNickname(groupId) });

  items.push({
    label: 'Sair do grupo',
    separatorBefore: true,
    disabled: !canLeaveGroup(group, actions.uid),
    ...(owner ? { reason: OWNER_CANNOT_LEAVE } : {}),
    onSelect: () => actions.leaveGroup(groupId),
  });

  if (owner) {
    items.push({
      label: 'Apagar grupo',
      danger: true,
      onSelect: () => actions.deleteGroup(groupId),
    });
  }

  return items;
}

function channelItems(
  target: HTMLElement,
  actions: ContextMenuActions,
  state: AppState,
): MenuItem[] {
  const channelId = target.dataset['channelId'] ?? '';
  const channel = state.channels.find((c) => c.id === channelId);
  if (channel === undefined) return [];

  const group = state.groups.find((g) => g.id === state.activeGroupId) ?? null;
  const owner = pode(ctxDoMenu(state, group), actions.uid, 'apagar-canais', channelId);

  const items: MenuItem[] = [
    { label: 'Copiar nome', onSelect: () => copy(channel.name, 'Nome copiado.') },
  ];
  // Fundo só na MINHA tela — qualquer membro pode, em canal de texto.
  if (channel.kind === 'text') {
    items.push({ label: 'Fundo deste canal', onSelect: () => actions.channelBackground(channelId) });
  }
  if (pode(ctxDoMenu(state, group), actions.uid, 'permissoes-canais', channelId)) {
    items.push({ label: 'Permissões do canal', onSelect: () => actions.channelPermissions(channelId) });
  }
  if (channel.kind === 'text' && pode(ctxDoMenu(state, group), actions.uid, 'editar-canais', channelId)) {
    items.push({ label: channel.lento ? `Modo lento (${channel.lento} s)…` : 'Modo lento…', onSelect: () => actions.channelSlowMode(channelId) });
  }

  if (owner) {
    // Um grupo sem canal de texto não tem onde conversar, e não há tela para
    // criar um de dentro dele. O item fica visível e travado com o motivo —
    // esconder aqui esconderia a explicação.
    const isLastText =
      channel.kind === 'text' && state.channels.filter((c) => c.kind === 'text').length === 1;

    items.push({
      label: 'Apagar canal',
      danger: true,
      separatorBefore: true,
      disabled: isLastText,
      ...(isLastText ? { reason: 'Este é o último canal de texto do grupo.' } : {}),
      onSelect: () => actions.deleteChannel(channelId),
    });
  }

  return items;
}

function memberItems(
  target: HTMLElement,
  actions: ContextMenuActions,
  state: AppState,
): MenuItem[] {
  const memberId = target.dataset['memberId'] ?? '';
  const member = state.members.find((m) => m.id === memberId);
  if (member === undefined) return [];

  const group = state.groups.find((g) => g.id === state.activeGroupId) ?? null;
  const ctx = ctxDoMenu(state, group);
  // 0.8.5: "Expulsar", e só quem está abaixo de mim (o dono nunca).
  const podeTirar =
    pode(ctx, actions.uid, 'expulsar') &&
    memberId !== group?.ownerId &&
    (isOwner(group, actions.uid) || (member.topo ?? 99999) > meuTopo(ctx, actions.uid));

  const items: MenuItem[] = [
    { label: 'Copiar nome', onSelect: () => copy(member.displayName, 'Nome copiado.') },
  ];

  // 0.8.5: apelido no servidor (o meu, ou o de alguém abaixo de mim).
  const abaixo = memberId !== group?.ownerId && (isOwner(group, actions.uid) || (member.topo ?? 99999) > meuTopo(ctx, actions.uid));
  if (memberId === actions.uid ? pode(ctx, actions.uid, 'apelido-proprio') : abaixo && pode(ctx, actions.uid, 'apelido-outros')) {
    items.push({ label: memberId === actions.uid ? 'Mudar meu apelido' : 'Mudar apelido', onSelect: () => actions.memberNickname(memberId) });
  }
  const emCastigo = member.castigoAte !== undefined && Date.parse(member.castigoAte) > Date.now();
  if (memberId !== actions.uid && abaixo && emCastigo && pode(ctx, actions.uid, 'tirar-castigo')) {
    items.push({ label: 'Tirar castigo', onSelect: () => actions.memberEndTimeout(memberId) });
  }
  if (memberId !== actions.uid && abaixo && !emCastigo && pode(ctx, actions.uid, 'castigo')) {
    items.push({ label: 'Castigo…', separatorBefore: true, onSelect: () => actions.memberTimeout(memberId) });
  }
  if (memberId !== actions.uid && abaixo && pode(ctx, actions.uid, 'banir')) {
    items.push({ label: 'Banir…', danger: true, onSelect: () => actions.memberBan(memberId) });
  }
  if (memberId !== actions.uid && isOwner(group, actions.uid)) {
    items.push({ label: `Passar o grupo para ${member.displayName}`, danger: true, separatorBefore: true, onSelect: () => actions.transferOwnership(memberId) });
  }

  // Nem em mim mesmo: "remover" a si próprio é sair do grupo, e isso tem o item
  // dele no menu do grupo, com o texto certo.
  if (podeTirar && memberId !== actions.uid) {
    items.push({
      label: 'Remover do grupo',
      danger: true,
      separatorBefore: true,
      onSelect: () => actions.removeMember(memberId),
    });
  }

  return items;
}

/** Menu mínimo — o que sobra em qualquer lugar da tela. */
function fallbackItems(): MenuItem[] {
  const selection = window.getSelection()?.toString() ?? '';
  return [
    {
      label: 'Copiar',
      disabled: selection === '',
      onSelect: () => copy(selection, 'Copiado.'),
    },
    { label: 'Recarregar página', onSelect: () => window.location.reload() },
  ];
}

/* -------------------------------------------------------------------------- */

/** Liga o menu de contexto. Devolve a função que o desliga. */
export function installContextMenus(actions: ContextMenuActions): () => void {
  function onContextMenu(event: MouseEvent): void {
    event.preventDefault();

    /*
     * Depois de um toque longo, alguns navegadores de celular ainda disparam um
     * `contextmenu` sintético. Sem esta guarda, o menu abriria duas vezes — a
     * segunda no lugar errado.
     */
    if (openedByTouch) {
      openedByTouch = false;
      return;
    }

    const anchor = { x: event.clientX, y: event.clientY };

    // Campo de texto ganha o menu de edição, venha de onde vier.
    if (isTextField(event.target)) {
      openMenu(anchor, textFieldItems(event.target));
      return;
    }

    const target = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-context]');
    // Alvo desconhecido cai no menu mínimo: melhor o genérico do que nada
    // acontecer depois de eu ter suprimido o menu do navegador.
    if (target === null || target === undefined) {
      openMenu(anchor, fallbackItems());
      return;
    }
    openForTarget(target, anchor);
  }

  /* ------------------------------------------------------------------------ */
  /* Toque longo — o botão direito do celular                                  */
  /* ------------------------------------------------------------------------ */

  const LONG_PRESS_MS = 500;
  /** Arrastar mais que isto é rolagem, não toque longo. */
  const MOVE_TOLERANCE_PX = 10;

  let pressTimer = 0;
  let pressAt: { x: number; y: number } | null = null;
  /** Abri por toque? Então suprimo o `contextmenu` sintético que vem depois. */
  let openedByTouch = false;

  const cancelPress = (): void => {
    window.clearTimeout(pressTimer);
    pressAt = null;
  };

  function onPointerDown(event: PointerEvent): void {
    if (event.pointerType !== 'touch') return;

    /*
     * NO CELULAR, TOQUE LONGO EM TEXTO É COMO SE SELECIONA.
     *
     * Dentro de campo de texto o comportamento nativo fica intocado — é o
     * composer, e roubá-lo tiraria recortar, colar e o cursor.
     */
    if (isTextField(event.target)) return;

    /*
     * E se JÁ existe seleção, a pessoa está ajustando as alças dela, não
     * pedindo menu.
     */
    if ((window.getSelection()?.toString() ?? '') !== '') return;

    const target = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-context]');
    if (target === null || target === undefined) return;

    pressAt = { x: event.clientX, y: event.clientY };
    pressTimer = window.setTimeout(() => {
      pressAt = null;
      openedByTouch = true;
      // Retorno tátil de que o menu abriu. O iOS não tem esta API.
      navigator.vibrate?.(15);
      openForTarget(target, { x: event.clientX, y: event.clientY }, true);
    }, LONG_PRESS_MS);
  }

  function onPointerMove(event: PointerEvent): void {
    if (pressAt === null) return;
    const moved =
      Math.abs(event.clientX - pressAt.x) > MOVE_TOLERANCE_PX ||
      Math.abs(event.clientY - pressAt.y) > MOVE_TOLERANCE_PX;
    // Sem isto, rolar a lista de mensagens abriria menu o tempo todo.
    if (moved) cancelPress();
  }

  // 0.11.0: a barrinha de reações do PC (passar o mouse na mensagem).
  const desligarBarra = instalarBarraDeReacoes({
    eu: () => actions.uid,
    responder: (li) => actions.replyToMessage(li.dataset['messageId'] ?? '', li.dataset['context'] === 'room-message'),
    encaminhar: (li) => {
      const d = dadosDaMensagem(li);
      actions.forwardMessage?.(d.id, d.tipo, li.dataset['context'] === 'room-message');
    },
    menu: (li, onde) => openForTarget(li, onde),
  });

  document.addEventListener('contextmenu', onContextMenu);
  document.addEventListener('pointerdown', onPointerDown);
  document.addEventListener('pointermove', onPointerMove);
  document.addEventListener('pointerup', cancelPress);
  document.addEventListener('pointercancel', cancelPress);
  document.addEventListener('scroll', cancelPress, true);

  return () => {
    document.removeEventListener('contextmenu', onContextMenu);
    document.removeEventListener('pointerdown', onPointerDown);
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', cancelPress);
    document.removeEventListener('pointercancel', cancelPress);
    document.removeEventListener('scroll', cancelPress, true);
    cancelPress();
    desligarBarra();
  };

  /** Monta e abre o menu do alvo — o mesmo caminho do botão direito. */
  function openForTarget(target: HTMLElement, anchor: { x: number; y: number }, porToque = false): void {
    const state = actions.getState();
    const kind = target.dataset['context'];
    let extras: MenuExtras = {};

    let items: MenuItem[] = [];
    switch (kind) {
      case 'message':
        items = messageItems(target, actions, state);
        break;
      case 'room-message':
        items = messageItems(target, actions, state, true);
        break;
      case 'dm-message':
        items = dmMessageItems(target, actions, state);
        break;
    }
    // 0.11.0: mensagem — a fileira de reações em cima; por toque, vira folha.
    if (kind === 'message' || kind === 'room-message' || kind === 'dm-message') {
      const d = dadosDaMensagem(target);
      if (actions.forwardMessage !== undefined && target.querySelector('.unica-balao') === null) {
        const encaminhar = actions.forwardMessage.bind(actions);
        const i = items.findIndex((x) => x.label === 'Responder');
        items.splice(i + 1, 0, { label: 'Encaminhar', onSelect: () => encaminhar(d.id, d.tipo, kind === 'room-message') });
      }
      extras = {
        folha: porToque,
        ...(podeReagir(d.tipo, d.canal)
          ? {
              emojis: {
                lista: RAPIDAS_CELULAR,
                minhas: d.minhas,
                iconeMais: addReactionIcon(20),
                aoEscolher: (e: string) => reagir(d.tipo, d.id, actions.uid, d.minhas, e),
                aoMais: (perto: DOMRect) => abrirSeletorDeReacao(perto, (e) => reagir(d.tipo, d.id, actions.uid, d.minhas, e)),
              },
            }
          : {}),
      };
    }
    switch (kind) {
      case 'message':
      case 'room-message':
      case 'dm-message':
        break;
      case 'friend':
        items = friendItems(target, actions);
        break;
      case 'pinned-item':
        items = pinnedItemItems(target, actions);
        break;
      case 'group':
        items = groupItems(target, actions, state);
        break;
      case 'channel':
        items = channelItems(target, actions, state);
        break;
      case 'member':
        items = memberItems(target, actions, state);
        break;
      default:
        items = [];
        break;
    }

    openMenu(anchor, items.length > 0 ? items : fallbackItems(), extras);
  }
}
