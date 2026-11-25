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
import { firestoreErrorMessage, textoDoErro } from '../../lib/firestore-errors';
import type { DeleteProgress, DeleteStep } from '../../lib/firestore';
import type { ChannelKind } from '../../types/models';
import { modalField, openModal } from './modal';
import type { ModalController } from './modal';

/** Erro na tela + registro no console como complemento, nunca como único sinal. */
function surface(controller: ModalController, error: unknown, action: string): void {
  console.error(action, error);
  // 0.8.5: o carteiro devolve o motivo em português (ex.: "Essa pessoa está no seu nível ou acima.").
  controller.setError(textoDoErro(error, action));
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

/**
 * CONVIDAR PESSOAS (16/11/2026): o CÓDIGO DO GRUPO em destaque — 6 letras e
 * números, fixo, que o dono passa adiante; a pessoa digita em "+" → "Entrar
 * num grupo". O link vai junto, menor. "Trocar código" apaga o atual (para de
 * valer na hora) e sorteia outro — para quando o código vazou.
 */
export interface InviteDialogProps {
  /** O código atual do grupo (cria um se o grupo ainda não tem). */
  codigo: () => Promise<string>;
  /** Apaga o atual e devolve um novo. */
  trocar: () => Promise<string>;
  /** O link de convite deste código. */
  link: (codigo: string) => string;
}

export function openInviteDialog(props: InviteDialogProps): void {
  const body = el('div', { class: 'modal__field' }, [el('p', { class: 'modal__note' }, ['Buscando o código…'])]);

  const controller = openModal({
    title: 'Convidar pessoas',
    description: 'Passe o código do grupo: a pessoa toca no + ao lado dos grupos, em "Entrar num grupo", e digita.',
    body,
    confirmLabel: 'Fechar',
  });

  const copiar = (texto: string, botao: HTMLElement, nota: HTMLElement, feito: string): void => {
    void navigator.clipboard
      .writeText(texto)
      .then(() => {
        botao.textContent = 'Copiado';
        nota.textContent = feito;
      })
      .catch(() => {
        nota.textContent = 'Não deu para copiar sozinho — copie à mão.';
      });
  };

  const mostrar = (codigo: string): void => {
    const nota = el('p', { class: 'modal__note' }, ['Só você, o dono, vê este código.']);
    const copiarCodigo = el('button', { class: 'modal__copy', type: 'button' }, ['Copiar código']);
    copiarCodigo.addEventListener('click', () => copiar(codigo, copiarCodigo, nota, 'Código copiado.'));

    const url = props.link(codigo);
    const linkInput = el('input', { class: 'modal__link', type: 'text', readonly: true, 'aria-label': 'Link de convite' });
    linkInput.value = url;
    const copiarLink = el('button', { class: 'modal__copy modal__copy--leve', type: 'button' }, ['Copiar link']);
    copiarLink.addEventListener('click', () => copiar(url, copiarLink, nota, 'Link copiado.'));

    const trocar = el('button', { class: 'modal__trocar', type: 'button' }, ['Trocar código']);
    trocar.addEventListener('click', () => {
      // Confirma no próprio lugar (sem outra janela): o antigo para de valer.
      if (trocar.dataset['confirmar'] !== '1') {
        trocar.dataset['confirmar'] = '1';
        trocar.textContent = 'Trocar mesmo? O código atual para de valer';
        return;
      }
      trocar.textContent = 'Trocando…';
      trocar.setAttribute('disabled', '');
      void props.trocar().then(mostrar, (erro: unknown) => {
        controller.setError(firestoreErrorMessage(erro, 'Não foi possível trocar o código.'));
        mostrar(codigo);
      });
    });

    body.replaceChildren(
      el('div', { class: 'modal__codigo-linha' }, [
        el('code', { class: 'modal__codigo', 'aria-label': 'Código do grupo' }, [codigo]),
        copiarCodigo,
      ]),
      el('p', { class: 'modal__note' }, ['Ou mande o link:']),
      el('div', { class: 'modal__link-row' }, [linkInput, copiarLink]),
      nota,
      trocar,
    );
  };

  const tentar = (): void => {
    void props.codigo().then(mostrar, (erro: unknown) => {
      console.error('Não foi possível buscar o código do grupo.', erro);
      controller.setError(firestoreErrorMessage(erro, 'Não foi possível buscar o código do grupo.'));
      const denovo = el('button', { class: 'modal__copy', type: 'button' }, ['Tentar de novo']);
      denovo.addEventListener('click', () => {
        controller.setError('');
        body.replaceChildren(el('p', { class: 'modal__note' }, ['Buscando o código…']));
        tentar();
      });
      body.replaceChildren(denovo);
    });
  };
  tentar();
}

/**
 * ENTRAR NUM GRUPO (16/11/2026): o campo do código (ou do link), pelo "+" ao
 * lado dos grupos. `entrar` devolve a mensagem de erro, ou null quando aceitou
 * (aí a tela do convite assume: mostra o grupo e o botão de entrar).
 */
export function openJoinGroupDialog(entrar: (texto: string) => string | null): void {
  const { field, input } = modalField('join-group-code', 'Código do grupo', {
    placeholder: 'Ex.: K7M2QX',
    maxlength: '120',
    autocomplete: 'off',
    autocapitalize: 'characters',
    spellcheck: 'false',
  });
  input.classList.add('modal__input--codigo');

  openModal({
    title: 'Entrar num grupo',
    description: 'Digite o código que o dono do grupo te passou (ou cole o link do convite).',
    body: field,
    confirmLabel: 'Continuar',
    initialFocus: input,
    async onConfirm(controller) {
      const erro = entrar(input.value);
      if (erro !== null) {
        controller.setError(erro);
        return;
      }
      controller.close();
    },
  });
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
  voice: 'Limpando a sala de voz',
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
