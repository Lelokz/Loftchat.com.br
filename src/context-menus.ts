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
import type { MenuItem } from './components/context-menu/context-menu';
import { showToast } from './components/toast/toast';
import { canLeaveGroup, isOwner, OWNER_CANNOT_LEAVE } from './lib/permissions';
import type { AppState } from './state/store';
import type { MemberId } from './types/models';

export interface ContextMenuActions {
  getState(): AppState;
  uid: MemberId;
  copyInviteLink(groupId: string): void;
  renameGroup(groupId: string): void;
  leaveGroup(groupId: string): void;
  deleteGroup(groupId: string): void;
  deleteChannel(channelId: string): void;
  removeMember(memberId: MemberId): void;
  /**
   * Apaga uma mensagem — de grupo OU de PV. Quem implementa decide qual,
   * olhando se há um PV aberto (`state.activeDmUid`): as duas telas nunca
   * estão visíveis ao mesmo tempo, então isso basta para desambiguar.
   */
  deleteMessage(messageId: string): void;
  /** Começa a responder: a faixa aparece acima do composer. Grupo ou PV, mesma regra acima. */
  replyToMessage(messageId: string): void;
  /** Entra em edição no próprio balão. Só o autor chega aqui. Grupo ou PV, mesma regra acima. */
  editMessage(messageId: string): void;
  openVoiceDiagnostics(): void;
  /** Abre o PV com este amigo — item "Enviar mensagem" do menu de contexto dele. */
  openDm(friendUid: MemberId): void;
  /**
   * Fixa OU desafixa — quem implementa decide qual, olhando se a mensagem já
   * está em `state.pinnedMessages` (é por isso que o rótulo do item já
   * muda aqui, no menu, sem round-trip). Grupo ou PV, mesma mensagem, mesma
   * ação — a regra é que muda quem pode chegar a ela (dono vs. qualquer um
   * dos dois).
   */
  togglePinMessage(messageId: string): void;
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

function messageItems(
  target: HTMLElement,
  actions: ContextMenuActions,
  state: AppState,
): MenuItem[] {
  const messageId = target.dataset['messageId'] ?? '';
  const authorId = target.dataset['authorId'] ?? '';
  const text = target.querySelector('.message__text')?.textContent ?? '';

  const group = state.groups.find((g) => g.id === state.activeGroupId) ?? null;
  // Autor OU dono do grupo — a mesma dupla que a regra do Firestore aceita.
  // A tela não inventa permissão: ela espelha a do banco.
  const canDelete = authorId === actions.uid || isOwner(group, actions.uid);

  const items: MenuItem[] = [
    { label: 'Copiar texto', disabled: text === '', onSelect: () => copy(text, 'Copiado.') },
    { label: 'Responder', onSelect: () => actions.replyToMessage(messageId) },
  ];

  /*
   * EDITAR é só do AUTOR — nem o dono do grupo entra aqui.
   *
   * Apagar ele pode (moderação, e a cascata de apagar o grupo); editar seria
   * falar pela boca de alguém. A regra do Firestore cobra o mesmo, com
   * `hasOnly(['body','editedAt'])` — a tela espelha o banco, não inventa.
   */
  if (authorId === actions.uid) {
    items.push({ label: 'Editar', onSelect: () => actions.editMessage(messageId) });
  }

  // Fixar é só do DONO do grupo — conteúdo que todo mundo vê, e qualquer
  // membro poder fixar viraria bagunça (etapa 19). Mesma restrição da regra.
  if (isOwner(group, actions.uid)) {
    const pinned = state.pinnedMessages.some((p) => p.messageId === messageId);
    items.push({
      label: pinned ? 'Desafixar' : 'Fixar mensagem',
      onSelect: () => actions.togglePinMessage(messageId),
    });
  }

  if (canDelete) {
    items.push({
      label: 'Apagar mensagem',
      danger: true,
      separatorBefore: true,
      onSelect: () => actions.deleteMessage(messageId),
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
    items.push({ label: 'Editar', onSelect: () => actions.editMessage(messageId) });
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

  if (owner) {
    items.push(
      { label: 'Copiar link de convite', onSelect: () => actions.copyInviteLink(groupId) },
      { label: 'Renomear grupo', onSelect: () => actions.renameGroup(groupId) },
    );
  }

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
  const owner = isOwner(group, actions.uid);

  const items: MenuItem[] = [
    { label: 'Copiar nome', onSelect: () => copy(channel.name, 'Nome copiado.') },
  ];

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
  const owner = isOwner(group, actions.uid);

  const items: MenuItem[] = [
    { label: 'Copiar nome', onSelect: () => copy(member.displayName, 'Nome copiado.') },
  ];

  // Nem em mim mesmo: "remover" a si próprio é sair do grupo, e isso tem o item
  // dele no menu do grupo, com o texto certo.
  if (owner && memberId !== actions.uid) {
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
      openForTarget(target, { x: event.clientX, y: event.clientY });
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
  };

  /** Monta e abre o menu do alvo — o mesmo caminho do botão direito. */
  function openForTarget(target: HTMLElement, anchor: { x: number; y: number }): void {
    const state = actions.getState();
    const kind = target.dataset['context'];

    let items: MenuItem[];
    switch (kind) {
      case 'message':
        items = messageItems(target, actions, state);
        break;
      case 'dm-message':
        items = dmMessageItems(target, actions, state);
        break;
      case 'friend':
        items = friendItems(target, actions);
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
      case 'room':
        items = [{ label: 'Diagnóstico da conexão', onSelect: actions.openVoiceDiagnostics }];
        break;
      default:
        items = [];
        break;
    }

    openMenu(anchor, items.length > 0 ? items : fallbackItems());
  }
}
