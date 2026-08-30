import './composer.css';

import { el, iconEl } from '../../../lib/dom';
import { firestoreErrorMessage } from '../../../lib/firestore-errors';
import { clipIcon, micIcon, sendIcon } from '../../../lib/icons';

export interface ComposerProps {
  /** Nome do canal, só para o placeholder. */
  channelName: string;
  /** Grava a mensagem. Rejeita em caso de falha, e a rejeição vira erro na tela. */
  onSend: (body: string) => Promise<void>;
}

/** Teto de crescimento do campo antes de virar rolagem interna. */
const MAX_HEIGHT_PX = 140;

/**
 * Barra de composição.
 *
 * É um <textarea>, não um <input>: Shift+Enter não existe em campo de uma linha.
 * Enter envia, Shift+Enter quebra linha.
 */
export function renderComposer({ channelName, onSend }: ComposerProps): HTMLElement {
  const input = el('textarea', {
    class: 'composer__input',
    rows: '1',
    placeholder: `Mensagem para #${channelName}`,
    'aria-label': `Mensagem para ${channelName}`,
  });

  const sendButton = el('button', { class: 'composer__send', type: 'button', title: 'Enviar' }, [
    iconEl(sendIcon(18)),
    el('span', { class: 'sr-only' }, ['Enviar']),
  ]);

  const errorBox = el('p', { class: 'composer__error', role: 'alert' });
  errorBox.hidden = true;

  function autoGrow(): void {
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, MAX_HEIGHT_PX)}px`;
  }

  function setError(message: string): void {
    errorBox.textContent = message;
    errorBox.hidden = message === '';
  }

  /**
   * Envia. Vários envios podem estar em voo ao mesmo tempo, DE PROPÓSITO.
   *
   * Havia aqui uma trava `busy` que ignorava o Enter enquanto a escrita anterior
   * não voltasse. Numa conexão lenta isso descartava mensagens em silêncio: o
   * texto ficava no campo e era sobrescrito pela mensagem seguinte, sem erro
   * nenhum. Mensagens são independentes — não há motivo para serializá-las.
   *
   * A proteção contra enviar o MESMO texto duas vezes não depende de trava: a
   * limpeza otimista abaixo é síncrona, então um segundo Enter já encontra o
   * campo vazio e desiste.
   */
  async function submit(): Promise<void> {
    const body = input.value.trim();
    // Campo vazio ou só espaços não envia — e não é erro, é ausência de ação.
    if (body === '') return;

    setError('');

    // Limpa otimista: a lista já mostra a mensagem por compensação de latência.
    input.value = '';
    autoGrow();

    try {
      await onSend(body);
    } catch (error) {
      console.error('Não foi possível enviar a mensagem.', error);
      setError(firestoreErrorMessage(error, 'Não foi possível enviar.'));

      // Devolve o texto para a pessoa não perder o que escreveu — mas só se ela
      // ainda não começou outra mensagem, senão eu apagaria o que ela digitou
      // enquanto esperava. Nesse caso resta o erro na tela.
      if (input.value === '') {
        input.value = body;
        autoGrow();
        input.focus();
      }
    }
  }

  input.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || event.shiftKey) return;
    // IME em composição: Enter confirma o candidato, não envia.
    if (event.isComposing) return;
    event.preventDefault();
    void submit();
  });

  input.addEventListener('input', () => {
    autoGrow();
    if (!errorBox.hidden) setError('');
  });

  sendButton.addEventListener('click', () => void submit());

  return el('div', { class: 'composer' }, [
    errorBox,
    el('div', { class: 'composer__row' }, [
      el(
        'button',
        {
          class: 'icon-button composer__action',
          type: 'button',
          title: 'Anexar arquivo ou imagem (ainda não implementado)',
        },
        [iconEl(clipIcon(19)), el('span', { class: 'sr-only' }, ['Anexar arquivo ou imagem'])],
      ),

      input,

      el(
        'button',
        {
          class: 'icon-button composer__action',
          type: 'button',
          title: 'Gravar áudio (ainda não implementado)',
        },
        [iconEl(micIcon(19)), el('span', { class: 'sr-only' }, ['Gravar áudio'])],
      ),

      sendButton,
    ]),
  ]);
}
