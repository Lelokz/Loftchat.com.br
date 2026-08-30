/**
 * Os modais concretos do app.
 *
 * Todos seguem o mesmo contrato de escrita, herdado da casca em `modal.ts`:
 * botão desabilitado durante a requisição, erro VISÍVEL na tela (nunca só no
 * console) e botão reabilitado para tentar de novo.
 *
 * Toda ação destrutiva passa por `openConfirmDialog` — um componente só, para
 * que apagar um canal e apagar um grupo não confirmem de jeitos diferentes.
 */

import { el } from '../../lib/dom';
import { firestoreErrorMessage } from '../../lib/firestore-errors';
import type { DeleteProgress, DeleteStep } from '../../lib/firestore';
import type { ChannelKind } from '../../types/models';
import { modalField, openModal } from './modal';
import type { ModalController } from './modal';

/** Erro na tela + registro no console como complemento, nunca como único sinal. */
function surface(controller: ModalController, error: unknown, action: string): void {
  console.error(action, error);
  controller.setError(firestoreErrorMessage(error, action));
}

/* -------------------------------------------------------------------------- */

export function openCreateGroupDialog(onCreate: (name: string) => Promise<void>): void {
  const { field, input } = modalField('group-name', 'Nome do grupo', {
    placeholder: 'Ex.: Amigos da Casa',
    maxlength: '60',
  });

  openModal({
    title: 'Criar grupo',
    description: 'Ele já nasce com os canais #anúncios, #geral e a Sala Principal.',
    body: field,
    confirmLabel: 'Criar grupo',
    busyLabel: 'Criando…',
    initialFocus: input,
    async onConfirm(controller) {
      const name = input.value.trim();
      if (name === '') {
        controller.setError('Dê um nome ao grupo.');
        return;
      }
      try {
        await onCreate(name);
        controller.close();
      } catch (error) {
        surface(controller, error, 'Não foi possível criar o grupo.');
      }
    },
  });
}

/* -------------------------------------------------------------------------- */

export function openCreateChannelDialog(
  onCreate: (name: string, kind: ChannelKind) => Promise<void>,
): void {
  const { field, input } = modalField('channel-name', 'Nome do canal', {
    placeholder: 'Ex.: assuntos-gerais',
    maxlength: '60',
  });

  const textRadio = el('input', { type: 'radio', name: 'channel-kind', value: 'text' });
  textRadio.checked = true;
  const voiceRadio = el('input', { type: 'radio', name: 'channel-kind', value: 'voice' });

  const choices = el('div', { class: 'modal__field' }, [
    el('span', { class: 'modal__label' }, ['Tipo']),
    el('div', { class: 'modal__choices' }, [
      el('label', { class: 'modal__choice' }, [textRadio, 'Texto']),
      el('label', { class: 'modal__choice' }, [voiceRadio, 'Voz']),
    ]),
  ]);

  openModal({
    title: 'Criar canal',
    body: el('div', { class: 'modal__field' }, [field, choices]),
    confirmLabel: 'Criar canal',
    busyLabel: 'Criando…',
    initialFocus: input,
    async onConfirm(controller) {
      const name = input.value.trim();
      if (name === '') {
        controller.setError('Dê um nome ao canal.');
        return;
      }
      const kind: ChannelKind = voiceRadio.checked ? 'voice' : 'text';
      try {
        await onCreate(name, kind);
        controller.close();
      } catch (error) {
        surface(controller, error, 'Não foi possível criar o canal.');
      }
    },
  });
}

/* -------------------------------------------------------------------------- */

export function openRenameGroupDialog(
  currentName: string,
  onRename: (name: string) => Promise<void>,
): void {
  const { field, input } = modalField('group-rename', 'Novo nome', { maxlength: '60' });
  input.value = currentName;

  openModal({
    title: 'Renomear grupo',
    body: field,
    confirmLabel: 'Salvar',
    busyLabel: 'Salvando…',
    initialFocus: input,
    async onConfirm(controller) {
      const name = input.value.trim();
      if (name === '') {
        controller.setError('O nome não pode ficar vazio.');
        return;
      }
      try {
        await onRename(name);
        controller.close();
      } catch (error) {
        surface(controller, error, 'Não foi possível renomear o grupo.');
      }
    },
  });
}

/* -------------------------------------------------------------------------- */

/**
 * Convite: gera o código assim que abre e mostra o link pronto.
 * Se a gravação falhar, a mensagem aparece e sobra um botão de tentar de novo.
 */
export function openInviteDialog(onGenerate: () => Promise<string>): void {
  const status = el('p', { class: 'modal__note' }, ['Gerando o link…']);
  const body = el('div', { class: 'modal__field' }, [status]);

  const controller = openModal({
    title: 'Convidar pessoas',
    description: 'Quem abrir este link entra no grupo depois de fazer login.',
    body,
    confirmLabel: 'Fechar',
    cancelLabel: 'Fechar',
  });

  const showLink = (url: string): void => {
    const linkInput = el('input', { class: 'modal__link', type: 'text', readonly: true });
    linkInput.value = url;

    const copyButton = el('button', { class: 'modal__copy', type: 'button' }, ['Copiar']);
    const note = el('p', { class: 'modal__note' }, ['O link não expira nesta etapa.']);

    copyButton.addEventListener('click', () => {
      void navigator.clipboard
        .writeText(url)
        .then(() => {
          copyButton.textContent = 'Copiado';
          note.textContent = 'Link copiado para a área de transferência.';
        })
        .catch(() => {
          // Clipboard bloqueado: seleciona para a pessoa copiar à mão.
          linkInput.select();
          note.textContent = 'Não consegui copiar sozinho — o link já está selecionado.';
        });
    });

    body.replaceChildren(el('div', { class: 'modal__link-row' }, [linkInput, copyButton]), note);
  };

  const showRetry = (error: unknown): void => {
    console.error('Não foi possível gerar o convite.', error);
    controller.setError(firestoreErrorMessage(error, 'Não foi possível gerar o convite.'));

    const retry = el('button', { class: 'modal__copy', type: 'button' }, ['Tentar de novo']);
    retry.addEventListener('click', () => {
      controller.setError('');
      body.replaceChildren(el('p', { class: 'modal__note' }, ['Gerando o link…']));
      void generate();
    });
    body.replaceChildren(retry);
  };

  async function generate(): Promise<void> {
    try {
      showLink(await onGenerate());
    } catch (error) {
      showRetry(error);
    }
  }

  void generate();
}

/* -------------------------------------------------------------------------- */
/* Confirmação — UM componente para toda ação destrutiva                       */
/* -------------------------------------------------------------------------- */

export interface ConfirmOptions {
  title: string;
  description: string;
  confirmLabel: string;
  busyLabel?: string;
  /**
   * Confirmação forte: só libera o botão quando a pessoa digitar exatamente
   * este texto. Para quando "tem certeza?" não é barreira suficiente.
   */
  requireTypedText?: string;
  /** Mensagem de erro se a ação falhar. */
  failureMessage: string;
  /** Conteúdo extra no corpo — a linha de progresso, por exemplo. */
  extra?: HTMLElement;
  onConfirm: (controller: ModalController) => Promise<void>;
}

export function openConfirmDialog(options: ConfirmOptions): ModalController {
  const { requireTypedText } = options;
  let typedField: { field: HTMLElement; input: HTMLInputElement } | null = null;

  if (requireTypedText !== undefined) {
    typedField = modalField('confirm-typed', `Digite ${requireTypedText} para confirmar`, {
      autocomplete: 'off',
      // Sem preenchimento automático nem correção: a barreira só funciona se a
      // pessoa realmente digitar.
      autocapitalize: 'off',
      spellcheck: 'false',
    });
  }

  const body = el('div', { class: 'modal__field' }, [
    typedField?.field ?? false,
    options.extra ?? false,
  ]);

  const controller = openModal({
    title: options.title,
    description: options.description,
    body,
    confirmLabel: options.confirmLabel,
    ...(options.busyLabel === undefined ? {} : { busyLabel: options.busyLabel }),
    danger: true,
    confirmDisabled: requireTypedText !== undefined,
    ...(typedField === null ? {} : { initialFocus: typedField.input }),
    async onConfirm(ctrl) {
      try {
        await options.onConfirm(ctrl);
      } catch (error) {
        surface(ctrl, error, options.failureMessage);
      }
    },
  });

  if (typedField !== null && requireTypedText !== undefined) {
    typedField.input.addEventListener('input', () => {
      controller.setConfirmEnabled(typedField.input.value.trim() === requireTypedText);
    });
  }

  return controller;
}

/* -------------------------------------------------------------------------- */

/** O que cada etapa da cascata mostra na tela. */
const DELETE_LABELS: Record<DeleteStep, string> = {
  messages: 'Apagando as mensagens',
  channels: 'Apagando os canais',
  invites: 'Apagando os convites',
  members: 'Removendo os membros',
  group: 'Apagando o grupo',
};

/**
 * Apagar grupo: confirmação forte por digitação, e progresso enquanto apaga.
 *
 * O progresso não é enfeite — a cascata pode levar bastante tempo num grupo com
 * muitas mensagens, e sem ele a tela ficaria parada em "Apagando…" de um jeito
 * indistinguível de travamento.
 */
export function openDeleteGroupDialog(
  groupName: string,
  onDelete: (onProgress: (progress: DeleteProgress) => void) => Promise<void>,
): void {
  const progress = el('p', { class: 'modal__progress' });
  progress.hidden = true;

  openConfirmDialog({
    title: 'Apagar grupo',
    description:
      `Isto apaga ${groupName} para todo mundo: mensagens, canais, convites e membros. ` +
      'Não dá para desfazer.',
    confirmLabel: 'Apagar grupo',
    busyLabel: 'Apagando…',
    requireTypedText: groupName,
    failureMessage: 'Não foi possível apagar o grupo.',
    extra: progress,
    async onConfirm(ctrl) {
      progress.hidden = false;
      await onDelete(({ step, removed }) => {
        progress.textContent =
          removed === 0 ? `${DELETE_LABELS[step]}…` : `${DELETE_LABELS[step]}… ${removed} itens`;
      });
      ctrl.close();
    },
  });
}

/* -------------------------------------------------------------------------- */

/** Sair do grupo. Confirmação simples — dá para entrar de novo com um convite. */
export function openLeaveGroupDialog(groupName: string, onLeave: () => Promise<void>): void {
  openConfirmDialog({
    title: 'Sair do grupo',
    description:
      `Você deixa de ver as conversas de ${groupName}. ` +
      'Suas mensagens continuam lá, e você só volta com um convite novo.',
    confirmLabel: 'Sair do grupo',
    busyLabel: 'Saindo…',
    failureMessage: 'Não foi possível sair do grupo.',
    async onConfirm(ctrl) {
      await onLeave();
      ctrl.close();
    },
  });
}
