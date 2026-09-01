import './modal.css';

import { el } from '../../lib/dom';

/**
 * Casca de modal sobre o <dialog> nativo — sem biblioteca.
 *
 * O <dialog> traz de graça: foco preso dentro, Esc fecha, e a camada superior
 * do navegador (nada de z-index brigando com o resto do app).
 *
 * A casca já implementa o contrato de escrita: botão desabilitado durante a
 * requisição, linha de erro VISÍVEL na tela em caso de falha, e botão reabilitado
 * para tentar de novo sem precisar fechar e reabrir.
 */

export interface ModalController {
  close(): void;
  setError(message: string): void;
  setBusy(busy: boolean): void;
  /**
   * Trava ou libera o botão de confirmar independentemente do "ocupado".
   *
   * Existe para a confirmação por digitação: enquanto o texto não bate, o botão
   * fica travado. O `setBusy(false)` RESPEITA esta trava — senão uma tentativa
   * que falhou devolveria o botão clicável com o campo ainda errado.
   */
  setConfirmEnabled(enabled: boolean): void;
}

export interface ModalOptions {
  title: string;
  description?: string;
  /** Conteúdo do corpo — os campos, montados por quem chama. */
  body: HTMLElement;
  confirmLabel: string;
  busyLabel?: string;
  cancelLabel?: string;
  /** Ausente = o botão só fecha (modal informativo, como o do convite). */
  onConfirm?: (controller: ModalController) => Promise<void>;
  /** Elemento que recebe o foco ao abrir. */
  initialFocus?: HTMLElement;
  /** Ação destrutiva: o botão de confirmar fica vermelho. */
  danger?: boolean;
  /** Abre com o confirmar travado (ver setConfirmEnabled). */
  confirmDisabled?: boolean;
}

export function openModal(options: ModalOptions): ModalController {
  const {
    title,
    description,
    body,
    confirmLabel,
    busyLabel,
    cancelLabel = 'Cancelar',
    onConfirm,
    initialFocus,
    danger = false,
    confirmDisabled = false,
  } = options;

  let busy = false;
  let confirmEnabled = !confirmDisabled;

  const errorBox = el('p', { class: 'modal__error', role: 'alert' });
  errorBox.hidden = true;

  const confirmButton = el(
    'button',
    { class: `modal__confirm${danger ? ' modal__confirm--danger' : ''}`, type: 'submit' },
    [confirmLabel],
  );
  confirmButton.disabled = confirmDisabled;
  const cancelButton = el('button', { class: 'modal__cancel', type: 'button' }, [cancelLabel]);

  const dialog = el('dialog', { class: 'modal' });

  const controller: ModalController = {
    close(): void {
      dialog.close();
    },
    setError(message: string): void {
      errorBox.textContent = message;
      errorBox.hidden = message === '';
    },
    setBusy(value: boolean): void {
      busy = value;
      // Ao liberar, respeita a trava de confirmação — não é porque parou de
      // escrever que o campo de confirmação passou a estar certo.
      confirmButton.disabled = value || !confirmEnabled;
      cancelButton.disabled = value;
      confirmButton.textContent = value ? (busyLabel ?? confirmLabel) : confirmLabel;
      for (const field of body.querySelectorAll('input, select, textarea')) {
        (field as HTMLInputElement).disabled = value;
      }
    },
    setConfirmEnabled(enabled: boolean): void {
      confirmEnabled = enabled;
      if (!busy) confirmButton.disabled = !enabled;
    },
  };

  cancelButton.addEventListener('click', () => {
    if (!busy) dialog.close();
  });

  // <form> de verdade: Enter em qualquer campo confirma.
  const form = el('form', { class: 'modal__form', novalidate: true }, [
    el('header', { class: 'modal__header' }, [
      el('h2', { class: 'modal__title' }, [title]),
      description !== undefined && el('p', { class: 'modal__description' }, [description]),
    ]),
    body,
    errorBox,
    el('footer', { class: 'modal__footer' }, [cancelButton, confirmButton]),
  ]);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (busy) return;
    if (onConfirm === undefined) {
      dialog.close();
      return;
    }
    controller.setError('');
    controller.setBusy(true);
    void onConfirm(controller).finally(() => {
      // Se a ação fechou o modal, mexer nos botões depois não custa nada; se
      // falhou, isto é o que devolve o botão para o estado clicável.
      if (dialog.open) controller.setBusy(false);
    });
  });

  // Esc dispara `cancel` antes de fechar — bloqueia enquanto está escrevendo.
  dialog.addEventListener('cancel', (event) => {
    if (busy) event.preventDefault();
  });

  /*
   * Clique FORA fecha, como Esc — o <dialog> nativo não faz isto sozinho.
   * `event.target === dialog` é o clique no ::backdrop: um clique dentro do
   * `form` (que ocupa toda a área de conteúdo) nunca tem o próprio <dialog>
   * como alvo.
   */
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog && !busy) dialog.close();
  });

  dialog.addEventListener('close', () => dialog.remove());

  dialog.append(form);
  document.body.append(dialog);
  dialog.showModal();

  if (initialFocus !== undefined) initialFocus.focus();

  return controller;
}

/** Campo de texto rotulado, no mesmo formato dos campos da tela de login. */
export function modalField(
  id: string,
  label: string,
  attrs: Record<string, string> = {},
): { field: HTMLElement; input: HTMLInputElement } {
  const input = el('input', { class: 'modal__input', id, type: 'text', ...attrs });
  const field = el('div', { class: 'modal__field' }, [
    el('label', { class: 'modal__label', for: id }, [label]),
    input,
  ]);
  return { field, input };
}
