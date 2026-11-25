import './composer.css';

import { el, iconEl } from '../../../lib/dom';
import { textoDoErro } from '../../../lib/firestore-errors';
import { attachIcon, micIcon, sendIcon, stickerIcon, trashIcon } from '../../../lib/icons';
import { enviosDe, ouvirEnvios } from '../../../lib/envios';
import { comecarGravacao, MAX_VOZ_MS, relogio } from '../../../lib/gravador';
import type { Gravacao, Gravador } from '../../../lib/gravador';
import type { Figurinha } from '../../../lib/figurinhas';
import { montarAbaFigurinhas } from '../../figurinhas/aba';
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
  /** 0.5.0: mandar a figurinha escolhida no painel. */
  aoFigurinha?: (figurinha: Figurinha) => void;
  /**
   * 0.5.5: mensagem de voz. Com isto, o Enviar vira MICROFONE quando o campo
   * está vazio: toca para gravar, 🗑 joga fora, ➤ manda.
   */
  aoVoz?: (gravacao: Gravacao) => void;
  /** 0.8.5: os comandos que a pessoa pode usar aqui (digitar "/" abre a lista). */
  comandos?: () => { nome: string; desc: string; args: string }[];
  /** 0.8.5: as pessoas do grupo (o "@" dentro de um comando sugere). */
  pessoas?: () => string[];
}

/**
 * 0.8.5 CARGOS: o que a pessoa pode mandar nesta conversa. `motivo` = não
 * pode escrever (sem permissão, ou de castigo) — o campo trava com o motivo.
 */
export interface LimitesDoComposer {
  motivo: string | null;
  fotos: boolean;
  gifs: boolean;
  videos: boolean;
  audio: boolean;
  figurinhas: boolean;
}

const limitadores = new WeakMap<HTMLElement, (l: LimitesDoComposer) => void>();

/** Aplica os limites numa caixa de mensagem já na tela. */
export function limitarComposer(composer: HTMLElement | null | undefined, l: LimitesDoComposer): void {
  if (composer === null || composer === undefined) return;
  limitadores.get(composer)?.(l);
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
  aoFigurinha,
  aoVoz,
  comandos,
  pessoas,
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
    modoDoBotao();
  }

  /* --- mensagem de voz (0.5.5) ---------------------------------------------- */

  let gravando: { gravador: Gravador | null; parar: () => void } | null = null;
  let modoMic: boolean | null = null;

  /* 0.8.5: limites do cargo (ver limitarComposer). */
  let limites: LimitesDoComposer = { motivo: null, fotos: true, gifs: true, videos: true, audio: true, figurinhas: true };
  const dicaNormal = input.placeholder;

  /** Campo vazio → microfone; com texto → Enviar. */
  function modoDoBotao(): void {
    if (aoVoz === undefined || gravando !== null) return;
    const mic = input.value.trim() === '' && limites.audio;
    if (mic === modoMic) return;
    modoMic = mic;
    const nome = mic ? 'Gravar mensagem de voz' : 'Enviar';
    sendButton.title = nome;
    sendButton.classList.toggle('composer__send--mic', mic);
    sendButton.replaceChildren(iconEl(mic ? micIcon(20) : sendIcon(18)), el('span', { class: 'sr-only' }, [nome]));
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
      // 0.8.5: comando com erro (sem permissão, faltou a pessoa…) mostra o motivo.
      setError(textoDoErro(error, 'Não foi possível enviar.'));

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

  /* --- 0.8.5: a lista do "/" (e do "@" dentro do comando) ------------------- */
  const menuCmd = el('div', { class: 'cmd-menu', role: 'listbox', 'aria-label': 'Comandos', hidden: true });
  let opcoesCmd: { rotulo: HTMLElement[]; aplicar: () => void }[] = [];
  let selCmd = 0;
  /** O texto de quando a pessoa fechou a lista com Esc (não reabre até mudar). */
  let fechadoEm: string | null = null;
  function desenharMenuCmd(): void {
    if (comandos === undefined) return;
    const v = input.value;
    if (fechadoEm !== null && fechadoEm === v) {
      menuCmd.hidden = true;
      opcoesCmd = [];
      return;
    }
    fechadoEm = null;
    opcoesCmd = [];
    let dica: HTMLElement | null = null;
    const soNome = /^\/([a-z0-9-]*)$/i.exec(v);
    const comArgs = /^\/([a-z0-9-]+)\s([\s\S]*)$/i.exec(v);
    if (soNome !== null) {
      const q = soNome[1]!.toLowerCase();
      for (const c of comandos().filter((x) => x.nome.startsWith(q) && !(x.args === '' && x.nome === q)).slice(0, 12)) {
        opcoesCmd.push({
          rotulo: [el('b', {}, [`/${c.nome}`]), c.args !== '' ? el('span', { class: 'cmd-menu__args' }, [c.args]) : null, el('small', {}, [c.desc])].filter((x): x is HTMLElement => x !== null),
          aplicar: () => {
            input.value = `/${c.nome}${c.args === '' ? '' : ' '}`;
            autoGrow();
            desenharMenuCmd();
            input.focus();
          },
        });
      }
    } else if (comArgs !== null) {
      const c = comandos().find((x) => x.nome === comArgs[1]!.toLowerCase());
      if (c !== undefined) {
        dica = el('div', { class: 'cmd-menu__dica' }, [el('b', {}, [`/${c.nome}`]), ' ', c.args, ' — ', c.desc]);
        // "@" no fim: sugere as pessoas.
        const arroba = /@([^@]*)$/.exec(comArgs[2]!);
        if (arroba !== null && pessoas !== undefined && !/\s{2}/.test(arroba[1]!)) {
          const q = arroba[1]!.toLowerCase();
          for (const nome of pessoas().filter((n) => n.toLowerCase().startsWith(q)).slice(0, 8)) {
            opcoesCmd.push({
              rotulo: [el('b', {}, [`@${nome}`])],
              aplicar: () => {
                input.value = `${v.slice(0, v.length - arroba[0].length)}@${nome} `;
                autoGrow();
                desenharMenuCmd();
                input.focus();
              },
            });
          }
        }
      }
    }
    selCmd = Math.min(selCmd, Math.max(0, opcoesCmd.length - 1));
    menuCmd.hidden = opcoesCmd.length === 0 && dica === null;
    menuCmd.replaceChildren(
      ...(dica === null ? [] : [dica]),
      ...opcoesCmd.map((o, i) => {
        const b = el('button', { class: `cmd-menu__op${i === selCmd ? ' is-on' : ''}`, type: 'button', role: 'option', 'aria-selected': String(i === selCmd) }, o.rotulo);
        b.addEventListener('mousedown', (e) => e.preventDefault());
        b.addEventListener('click', () => o.aplicar());
        return b;
      }),
    );
  }
  input.addEventListener(
    'keydown',
    (event) => {
      // A lista na tela pode estar velha (ou escondida por engano): confere antes.
      if (['Enter', 'Tab', 'ArrowDown', 'ArrowUp'].includes(event.key)) desenharMenuCmd();
      if (menuCmd.hidden) return;
      if (event.key === 'Escape') {
        fechadoEm = input.value;
        menuCmd.hidden = true;
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      if (opcoesCmd.length === 0) return;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        selCmd = (selCmd + (event.key === 'ArrowDown' ? 1 : -1) + opcoesCmd.length) % opcoesCmd.length;
        desenharMenuCmd();
        event.preventDefault();
        event.stopImmediatePropagation();
      } else if ((event.key === 'Enter' && !event.shiftKey) || event.key === 'Tab') {
        opcoesCmd[selCmd]?.aplicar();
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    { capture: true },
  );
  input.addEventListener('input', () => {
    selCmd = 0;
    desenharMenuCmd();
  });
  input.addEventListener('blur', () =>
    setTimeout(() => {
      if (document.activeElement !== input) menuCmd.hidden = true;
    }, 150),
  );
  input.addEventListener('focus', () => desenharMenuCmd());

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

  sendButton.addEventListener('click', () => {
    if (gravando !== null) {
      void terminarGravacao(true);
      return;
    }
    if (aoVoz !== undefined && input.value.trim() === '' && limites.audio) {
      void comecarAGravar();
      return;
    }
    void submit();
  });

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

  let fecharPainel = (): void => undefined;
  const painel =
    opcoesDoPainel === undefined
      ? null
      : renderPainel({
          ...opcoesDoPainel,
          aoEmoji: porEmoji,
          ...(aoFigurinha === undefined
            ? {}
            : {
                montarFigurinhas: (onde: HTMLElement) =>
                  montarAbaFigurinhas(onde, (f) => {
                    if (!limites.figurinhas) {
                      setError('Você não pode mandar figurinhas aqui.');
                      fecharPainel();
                      return;
                    }
                    aoFigurinha(f);
                    fecharPainel();
                  }),
              }),
        });
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
    const todos = [...(lista ?? [])].filter((f) => f.type.startsWith('image/') || f.type.startsWith('video/'));
    // 0.8.5: só o que o cargo deixa (foto, GIF, vídeo).
    const pode = (f: File): boolean =>
      f.type === 'image/gif' ? limites.gifs : f.type.startsWith('video/') ? limites.videos : limites.fotos;
    const arquivos = limites.motivo === null ? todos.filter(pode) : [];
    if (arquivos.length < todos.length) setError('Você não pode mandar esse tipo de arquivo aqui.');
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
          envio.previa === ''
            ? el('span', { class: 'composer__envio-previa' }, [envio.nome === 'Mensagem de voz' ? iconEl(micIcon(22)) : false])
            : el('img', { class: 'composer__envio-previa', src: envio.previa, alt: '' }),
          el('span', { class: 'composer__envio-texto' }, [
            `Enviando… ${Math.round(envio.progresso * 100)}%`,
            el('i', { class: 'composer__envio-barra' }, [el('b', { style: `width:${Math.round(envio.progresso * 100)}%` })]),
          ]),
        ]),
      ),
    );
  }

  const linha = el('div', { class: 'composer__row' }, [botaoAnexo ?? false, input, botaoPainel ?? false, sendButton]);
  const pecasDaLinha = [...linha.children];

  async function comecarAGravar(): Promise<void> {
    if (aoVoz === undefined || gravando !== null) return;
    setError('');
    element.dispatchEvent(new Event('loft:fechar-painel'));
    const lixo = el('button', { class: 'composer__tool composer__lixo', type: 'button', title: 'Jogar fora' }, [
      iconEl(trashIcon(20)),
      el('span', { class: 'sr-only' }, ['Jogar fora']),
    ]);
    const tempo = el('span', { class: 'gravando-voz__tempo', role: 'timer' }, ['0:00']);
    const ondas = el('span', { class: 'gravando-voz__ondas', 'aria-hidden': 'true' });
    const dica = el('span', { class: 'gravando-voz__dica' }, ['Esc joga fora · Enter manda']);
    const barra = el('div', { class: 'gravando-voz', role: 'status', 'aria-label': 'Gravando mensagem de voz' }, [
      el('span', { class: 'gravando-voz__ponto' }),
      tempo,
      ondas,
      dica,
    ]);
    const niveis: number[] = [];
    const teclas = (evento: KeyboardEvent): void => {
      if (evento.key === 'Escape') {
        evento.preventDefault();
        evento.stopPropagation();
        void terminarGravacao(false);
      } else if (evento.key === 'Enter') {
        evento.preventDefault();
        evento.stopPropagation();
        void terminarGravacao(true);
      }
    };
    gravando = {
      gravador: null,
      parar: () => {
        document.removeEventListener('keydown', teclas, true);
        linha.replaceChildren(...pecasDaLinha);
        linha.classList.remove('is-gravando');
        modoMic = null;
        gravando = null;
        modoDoBotao();
      },
    };
    const atual = gravando;
    sendButton.title = 'Mandar mensagem de voz';
    sendButton.classList.remove('composer__send--mic');
    sendButton.replaceChildren(iconEl(sendIcon(18)), el('span', { class: 'sr-only' }, ['Mandar mensagem de voz']));
    linha.classList.add('is-gravando');
    linha.replaceChildren(lixo, barra, sendButton);
    lixo.addEventListener('click', () => void terminarGravacao(false));
    document.addEventListener('keydown', teclas, true);
    sendButton.focus();
    try {
      atual.gravador = await comecarGravacao(
        (nivel) => {
          // Saiu da conversa no meio: joga fora.
          if (!element.isConnected) {
            void terminarGravacao(false);
            return;
          }
          niveis.push(nivel);
          if (niveis.length > 60) niveis.shift();
          ondas.replaceChildren(...niveis.map((n) => el('i', { style: `height:${Math.max(3, Math.round(n * 22))}px` })));
          tempo.textContent = relogio(atual.gravador?.tempoMs() ?? 0);
        },
        () => {
          tempo.textContent = relogio(MAX_VOZ_MS);
          barra.classList.add('is-limite');
          dica.textContent = 'Chegou em 5 minutos';
        },
      );
      if (gravando !== atual) atual.gravador.cancelar();
    } catch (erro) {
      if (gravando === atual) atual.parar();
      setError(erro instanceof Error ? erro.message : 'Não deu para gravar.');
    }
  }

  async function terminarGravacao(mandar: boolean): Promise<void> {
    const atual = gravando;
    if (atual === null) return;
    atual.parar();
    if (atual.gravador === null) return;
    if (!mandar) {
      atual.gravador.cancelar();
      return;
    }
    const gravacao = await atual.gravador.parar();
    if (gravacao.duracaoMs < 700 || gravacao.blob.size === 0) {
      setError('Áudio curto demais. Toque no microfone, fale e depois toque em mandar.');
      return;
    }
    aoVoz?.(gravacao);
  }

  const element = el('div', { class: 'composer' }, [
    menuCmd,
    errorBox,
    fila,
    linha,
    escolher,
    painel?.element ?? false,
  ]);

  limitadores.set(element, (l) => {
    const igual = JSON.stringify(l) === JSON.stringify(limites);
    limites = l;
    if (igual) return;
    const travado = l.motivo !== null;
    input.disabled = travado;
    input.placeholder = travado ? l.motivo! : dicaNormal;
    sendButton.disabled = travado;
    element.classList.toggle('composer--travado', travado);
    if (botaoAnexo !== null) botaoAnexo.hidden = travado || !(l.fotos || l.gifs || l.videos);
    if (botaoPainel !== null) botaoPainel.hidden = travado;
    modoMic = null;
    if (aoVoz !== undefined && gravando === null && !l.audio && input.value.trim() === '') {
      // Sem áudio: o botão volta a ser "Enviar".
      sendButton.title = 'Enviar';
      sendButton.classList.remove('composer__send--mic');
      sendButton.replaceChildren(iconEl(sendIcon(18)), el('span', { class: 'sr-only' }, ['Enviar']));
      modoMic = false;
    }
    modoDoBotao();
  });

  modoDoBotao();
  if (aoArquivos !== undefined || aoVoz !== undefined) {
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
      painel.element.dispatchEvent(new Event('fechou'));
      botaoPainel.classList.remove('is-active');
      botaoPainel.setAttribute('aria-expanded', 'false');
      document.removeEventListener('pointerdown', foraDoPainel, true);
      document.removeEventListener('keydown', escDoPainel, true);
    };
    function foraDoPainel(evento: Event): void {
      const alvo = evento.target as Node;
      // Clique numa janela aberta pelo painel (criar figurinha): o painel fica.
      if (alvo instanceof Element && alvo.closest('dialog') !== null) return;
      if (!painel!.element.contains(alvo) && !botaoPainel!.contains(alvo)) fechar();
    }
    function escDoPainel(evento: KeyboardEvent): void {
      if (evento.key !== 'Escape') return;
      // Esc com a janela de criar figurinha aberta fecha só ela.
      if (document.querySelector('dialog[open]') !== null) return;
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
    // Mandou a mensagem (ou uma figurinha): o painel fecha.
    sendButton.addEventListener('click', fechar);
    fecharPainel = fechar;
    element.addEventListener('loft:fechar-painel', fechar);
  }

  return element;
}
