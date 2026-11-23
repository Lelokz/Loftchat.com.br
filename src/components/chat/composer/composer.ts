import './composer.css';

import { el, iconEl } from '../../../lib/dom';
import { firestoreErrorMessage } from '../../../lib/firestore-errors';
import { attachIcon, sendIcon, stickerIcon } from '../../../lib/icons';
import { enviosDe, ouvirEnvios } from '../../../lib/envios';
import { renderPainel } from '../../painel-midia/painel-midia';
import type { PainelProps } from '../../painel-midia/painel-midia';

export interface ComposerProps {
  /** Nome do canal (ou da pessoa, no PV), só para o placeholder. */
  channelName: string;
  /**
   * O placeholder leva "#" antes do nome — faz sentido para canal, não para
   * PV. Ausente = `true` (canal, sem mudança para quem já chama isto hoje).
   */
  hashPrefix?: boolean;
  /** Dica própria (o chat da sala, etapa 8b, numa coluna estreita). Ausente = "Mensagem para …". */
  placeholder?: string;
  /** Grava a mensagem. Rejeita em caso de falha, e a rejeição vira erro na tela. */
  onSend: (body: string) => Promise<void>;
  /** 0.5.0: o painel Emojis | Figurinhas (sem isto, o botão do adesivo não aparece). */
  painel?: Omit<PainelProps, 'aoEmoji'>;
  /**
   * 0.5.0: mandar imagem, GIF e vídeo (o +, colar e arrastar). Recebe os
   * arquivos e o texto do campo, que vira a legenda. `destino` separa a fila
   * de envio de cada conversa.
   */
  aoArquivos?: (arquivos: File[], legenda: string) => void;
  destino?: string;
}

/** Teto de crescimento do campo antes de virar rolagem interna. */
const MAX_HEIGHT_PX = 140;

/**
 * Barra de composição.
 *
 * É um <textarea>, não um <input>: Shift+Enter não existe em campo de uma linha.
 * Enter envia, Shift+Enter quebra linha.
 */
export function renderComposer({
  channelName,
  hashPrefix = true,
  placeholder,
  onSend,
  painel: opcoesDoPainel,
  aoArquivos,
  destino = '',
}: ComposerProps): HTMLElement {
  const input = el('textarea', {
    class: 'composer__input',
    rows: '1',
    placeholder: placeholder ?? `Mensagem para ${hashPrefix ? '#' : ''}${channelName}`,
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

  /* --- painel Emojis | Figurinhas (0.5.0) ---------------------------------- */

  /** Põe o emoji onde está o cursor. No celular não abre o teclado (ele cobriria o painel). */
  function porEmoji(emoji: string): void {
    const inicio = input.selectionStart ?? input.value.length;
    const fim = input.selectionEnd ?? inicio;
    input.value = input.value.slice(0, inicio) + emoji + input.value.slice(fim);
    const depois = inicio + emoji.length;
    input.setSelectionRange(depois, depois);
    autoGrow();
    if (!window.matchMedia('(pointer: coarse)').matches) input.focus();
  }

  const painel = opcoesDoPainel === undefined ? null : renderPainel({ ...opcoesDoPainel, aoEmoji: porEmoji });
  const botaoPainel =
    painel === null
      ? null
      : el('button', { class: 'composer__tool', type: 'button', title: 'Emojis e figurinhas', 'aria-expanded': 'false' }, [
          iconEl(stickerIcon(20)),
          el('span', { class: 'sr-only' }, ['Emojis e figurinhas']),
        ]);

  /* --- arquivos (0.5.0) ----------------------------------------------------- */

  const escolher = el('input', { type: 'file', accept: 'image/*,video/*', multiple: '', hidden: '' });
  const botaoAnexo =
    aoArquivos === undefined
      ? null
      : el('button', { class: 'composer__tool', type: 'button', title: 'Mandar imagem, GIF ou vídeo' }, [
          iconEl(attachIcon(20)),
          el('span', { class: 'sr-only' }, ['Mandar imagem, GIF ou vídeo']),
        ]);
  const fila = el('div', { class: 'composer__envios', 'aria-live': 'polite' });

  function mandarArquivos(lista: FileList | File[] | null): void {
    const arquivos = [...(lista ?? [])].filter((f) => f.type.startsWith('image/') || f.type.startsWith('video/'));
    if (arquivos.length === 0 || aoArquivos === undefined) return;
    const legenda = input.value.trim();
    input.value = '';
    autoGrow();
    aoArquivos(arquivos, legenda);
  }

  if (botaoAnexo !== null) {
    botaoAnexo.addEventListener('click', () => escolher.click());
    escolher.addEventListener('change', () => {
      mandarArquivos(escolher.files);
      escolher.value = '';
    });
    // Colar imagem (Ctrl+V) no campo.
    input.addEventListener('paste', (evento) => {
      const arquivos = [...(evento.clipboardData?.files ?? [])];
      if (arquivos.length === 0) return;
      evento.preventDefault();
      mandarArquivos(arquivos);
    });
  }

  function desenharFila(): void {
    fila.replaceChildren(
      ...enviosDe(destino).map((envio) =>
        el('div', { class: 'composer__envio' }, [
          envio.previa === '' ? el('span', { class: 'composer__envio-previa' }) : el('img', { class: 'composer__envio-previa', src: envio.previa, alt: '' }),
          el('span', { class: 'composer__envio-texto' }, [
            `Enviando… ${Math.round(envio.progresso * 100)}%`,
            el('i', { class: 'composer__envio-barra' }, [el('b', { style: `width:${Math.round(envio.progresso * 100)}%` })]),
          ]),
        ]),
      ),
    );
  }

  const element = el('div', { class: 'composer' }, [
    errorBox,
    fila,
    el('div', { class: 'composer__row' }, [botaoAnexo ?? false, input, botaoPainel ?? false, sendButton]),
    escolher,
    painel?.element ?? false,
  ]);

  if (aoArquivos !== undefined) {
    desenharFila();
    const parar = ouvirEnvios(() => {
      if (!element.isConnected) {
        parar();
        return;
      }
      desenharFila();
    });
    // Arrastar arquivo para cima da conversa (PC).
    requestAnimationFrame(() => {
      const area = element.closest<HTMLElement>('.chat, .dm-chat, .room-panel__chat') ?? element;
      area.addEventListener('dragover', (evento) => {
        if (evento.dataTransfer?.types.includes('Files') !== true) return;
        evento.preventDefault();
        area.classList.add('recebendo-arquivo');
      });
      area.addEventListener('dragleave', (evento) => {
        if (evento.target === area) area.classList.remove('recebendo-arquivo');
      });
      area.addEventListener('drop', (evento) => {
        area.classList.remove('recebendo-arquivo');
        if (evento.dataTransfer?.files.length === 0) return;
        evento.preventDefault();
        mandarArquivos(evento.dataTransfer?.files ?? null);
      });
    });
  }

  if (painel !== null && botaoPainel !== null) {
    const fechar = (): void => {
      painel.fechar();
      botaoPainel.classList.remove('is-active');
      botaoPainel.setAttribute('aria-expanded', 'false');
      document.removeEventListener('pointerdown', foraDoPainel, true);
      document.removeEventListener('keydown', escDoPainel, true);
    };
    function foraDoPainel(evento: Event): void {
      const alvo = evento.target as Node;
      if (!painel!.element.contains(alvo) && !botaoPainel!.contains(alvo)) fechar();
    }
    function escDoPainel(evento: KeyboardEvent): void {
      if (evento.key !== 'Escape') return;
      evento.stopPropagation();
      fechar();
    }
    botaoPainel.addEventListener('click', () => {
      if (painel.aberto()) {
        fechar();
        return;
      }
      painel.abrir();
      botaoPainel.classList.add('is-active');
      botaoPainel.setAttribute('aria-expanded', 'true');
      document.addEventListener('pointerdown', foraDoPainel, true);
      document.addEventListener('keydown', escDoPainel, true);
    });
    // Mandou a mensagem: o painel fecha.
    sendButton.addEventListener('click', fechar);
    element.addEventListener('loft:fechar-painel', fechar);
  }

  return element;
}
