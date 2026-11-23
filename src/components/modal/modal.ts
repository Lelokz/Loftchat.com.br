import './modal.css';

import { el } from '../../lib/dom';
import { prepararSaidaDeModal } from '../../lib/transition';

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
  /** Modal largo, para grade de miniaturas (seletor de tela). */
  wide?: boolean;
  /** Chamado uma vez quando o modal fecha, por qualquer caminho. */
  onClose?: () => void;
}

let modalCount = 0;

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
    wide = false,
    onClose,
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

  // O título dá nome ao diálogo (leitor de tela e testes: getByRole('dialog', { name })).
  const titleId = `modal-titulo-${++modalCount}`;
  const dialog = el('dialog', {
    class: wide ? 'modal modal--wide' : 'modal',
    'aria-labelledby': titleId,
  });

  /*
   * Saída esmaecendo (transição 1, etapa 20): o fantasma é fotografado ANTES
   * de fechar, por isso todo fechamento daqui passa por `fechar` — e o Escape,
   * que fecha sozinho, fotografa no `cancel` (abaixo).
   */
  let mostrarSaida: (() => void) | null = null;
  const fechar = (): void => {
    mostrarSaida = prepararSaidaDeModal(dialog);
    dialog.close();
  };

  const controller: ModalController = {
    close(): void {
      fechar();
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
    if (!busy) fechar();
  });

  // <form> de verdade: Enter em qualquer campo confirma.
  const form = el('form', { class: 'modal__form', novalidate: true }, [
    el('header', { class: 'modal__header' }, [
      el('h2', { class: 'modal__title', id: titleId }, [title]),
      description !== undefined && el('p', { class: 'modal__description' }, [description]),
    ]),
    body,
    errorBox,
    // Janela só informativa (sem onConfirm): um botão só, nunca "Fechar" duas vezes.
    el('footer', { class: 'modal__footer' }, onConfirm === undefined ? [confirmButton] : [cancelButton, confirmButton]),
  ]);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (busy) return;
    if (onConfirm === undefined) {
      fechar();
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
    else mostrarSaida = prepararSaidaDeModal(dialog);
  });

  /*
   * Clique FORA fecha, como Esc — o <dialog> nativo não faz isto sozinho.
   * `event.target === dialog` é o clique no ::backdrop: um clique dentro do
   * `form` (que ocupa toda a área de conteúdo) nunca tem o próprio <dialog>
   * como alvo.
   */
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog && !busy) fechar();
  });

  dialog.addEventListener('close', () => {
    dialog.remove();
    mostrarSaida?.();
    mostrarSaida = null;
    onClose?.();
  });

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
