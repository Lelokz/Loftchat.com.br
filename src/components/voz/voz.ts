import './voz.css';

import { el, iconEl } from '../../lib/dom';
import { pauseIcon, playIcon } from '../../lib/icons';
import { BARRAS, relogio, resumirOndas } from '../../lib/gravador';

/** Barras no balão: as 48 guardadas viram 28 (no celular o CSS mostra metade). */
const NA_TELA = 28;
import type { Attachment } from '../../types/models';

/**
 * O BALÃO DA MENSAGEM DE VOZ (0.5.5): ▶/⏸, as ondas (clicar ou arrastar
 * pula), o tempo e, tocando, a velocidade 1x → 1,5x → 2x.
 *
 * UM tocador só para o app inteiro, fora da lista: a lista de mensagens é
 * refeita a cada mensagem que chega, e o áudio não pode parar por isso. Os
 * balões só se desenham a partir dele. Tocar outro áudio para o anterior.
 */

const VELOCIDADES = [1, 1.5, 2];

interface Balao {
  url: string;
  no: HTMLElement;
  atualizar: () => void;
}

const tocador = { audio: null as HTMLAudioElement | null, url: '', duracaoMs: 0, tocando: false, velocidade: 1 };
const baloes = new Set<Balao>();
let quadro = 0;

function atualizarTodos(): void {
  for (const b of baloes) {
    if (!b.no.isConnected) {
      // Saiu da tela (a lista foi refeita): o novo balão entra no lugar.
      if (b.no.dataset['montado'] === '1') baloes.delete(b);
      continue;
    }
    b.atualizar();
  }
}

function seguir(): void {
  cancelAnimationFrame(quadro);
  const passo = (): void => {
    atualizarTodos();
    if (tocador.tocando) quadro = requestAnimationFrame(passo);
  };
  quadro = requestAnimationFrame(passo);
}

/** Posição atual em ms (no áudio que está tocando). */
function posicaoMs(): number {
  return (tocador.audio?.currentTime ?? 0) * 1000;
}

function tocar(url: string, duracaoMs: number, aPartirDe?: number, aoErro?: () => void): void {
  if (tocador.url !== url || tocador.audio === null) {
    tocador.audio?.pause();
    const audio = new Audio(url);
    audio.preload = 'auto';
    audio.playbackRate = 1;
    tocador.audio = audio;
    tocador.url = url;
    tocador.duracaoMs = duracaoMs;
    tocador.velocidade = 1;
    audio.addEventListener('ended', () => {
      tocador.tocando = false;
      audio.currentTime = 0;
      atualizarTodos();
    });
    audio.addEventListener('pause', () => {
      tocador.tocando = false;
      atualizarTodos();
    });
    audio.addEventListener('play', () => {
      tocador.tocando = true;
      seguir();
    });
    audio.addEventListener('error', () => {
      if (tocador.audio !== audio) return;
      tocador.tocando = false;
      tocador.audio = null;
      tocador.url = '';
      aoErro?.();
      atualizarTodos();
    });
  }
  const audio = tocador.audio;
  if (aPartirDe !== undefined) pular(aPartirDe);
  void audio.play().catch(() => undefined);
}

function pular(ms: number): void {
  const audio = tocador.audio;
  if (audio === null) return;
  const alvo = Math.max(0, Math.min(tocador.duracaoMs, ms)) / 1000;
  // Antes dos dados chegarem, pular só funciona depois do 'loadedmetadata'.
  if (audio.readyState >= 1) audio.currentTime = alvo;
  else audio.addEventListener('loadedmetadata', () => (audio.currentTime = alvo), { once: true });
  atualizarTodos();
}

/** Ondas guardadas na mensagem; se não vierem (mensagem antiga), umas inventadas pelo endereço. */
function ondasDe(anexo: Attachment): number[] {
  if (Array.isArray(anexo.ondas) && anexo.ondas.length > 0) {
    const guardadas = anexo.ondas.slice(0, BARRAS).map((v) => Math.max(0, Math.min(100, Number(v) || 0)));
    return resumirOndas(guardadas, NA_TELA);
  }
  let semente = [...anexo.url].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  return Array.from({ length: NA_TELA }, () => {
    semente = (semente * 1103515245 + 12345) >>> 0;
    return 20 + (semente % 80);
  });
}

export function renderVoz(anexo: Attachment): HTMLElement {
  const duracaoMs = anexo.durationMs ?? 0;
  const ondas = ondasDe(anexo);
  const botao = el('button', { class: 'voz__play', type: 'button' });
  const barras = ondas.map((v) => el('i', { style: `height:${Math.max(15, v)}%` }));
  const trilha = el(
    'span',
    {
      class: 'voz__ondas',
      role: 'slider',
      tabindex: 0,
      'aria-label': 'Posição do áudio',
      'aria-valuemin': 0,
      'aria-valuemax': Math.round(duracaoMs / 1000),
    },
    barras,
  );
  const tempo = el('span', { class: 'voz__tempo' }, [relogio(duracaoMs)]);
  const velocidade = el('button', { class: 'voz__vel', type: 'button', title: 'Velocidade' }, ['1x']);
  const no = el('div', { class: 'voz' }, [botao, trilha, tempo, velocidade]);

  const expirou = (): void => {
    no.replaceWith(el('div', { class: 'midia-expirou' }, ['⏳ Esta mensagem de voz expirou (os arquivos ficam 60 dias).']));
  };

  let estadoDoBotao = '';
  const balao: Balao = {
    url: anexo.url,
    no,
    atualizar: () => {
      const meu = tocador.url === anexo.url && tocador.audio !== null;
      const tocando = meu && tocador.tocando;
      const pos = meu ? posicaoMs() : 0;
      const fracao = duracaoMs > 0 ? Math.min(1, pos / duracaoMs) : 0;
      const estado = tocando ? 'pausar' : 'tocar';
      if (estado !== estadoDoBotao) {
        estadoDoBotao = estado;
        const nome = tocando ? 'Pausar' : 'Tocar mensagem de voz';
        botao.setAttribute('aria-label', nome);
        botao.title = nome;
        botao.replaceChildren(iconEl(tocando ? pauseIcon(16) : playIcon(16)));
      }
      const ja = Math.round(fracao * barras.length);
      barras.forEach((b, i) => b.classList.toggle('ja', i < ja));
      // Parado no começo: a duração; tocando ou pausado no meio: "0:06 / 0:14".
      // (No celular o " / 0:14" some pelo CSS, para caber.)
      if (meu && pos > 0) tempo.replaceChildren(relogio(pos), el('span', { class: 'voz__total' }, [` / ${relogio(duracaoMs)}`]));
      else tempo.textContent = relogio(duracaoMs);
      trilha.setAttribute('aria-valuenow', String(Math.round(pos / 1000)));
      velocidade.hidden = !(meu && (tocando || pos > 0));
      velocidade.textContent = `${String(tocador.velocidade).replace('.', ',')}x`;
    },
  };
  baloes.add(balao);
  balao.atualizar();
  // Marca para a limpeza: só sai da lista depois de ter entrado na tela uma vez.
  requestAnimationFrame(() => (no.dataset['montado'] = '1'));

  botao.addEventListener('click', () => {
    if (tocador.url === anexo.url && tocador.tocando) {
      tocador.audio?.pause();
      return;
    }
    tocar(anexo.url, duracaoMs, undefined, expirou);
  });

  velocidade.addEventListener('click', () => {
    const i = VELOCIDADES.indexOf(tocador.velocidade);
    tocador.velocidade = VELOCIDADES[(i + 1) % VELOCIDADES.length]!;
    if (tocador.audio !== null) tocador.audio.playbackRate = tocador.velocidade;
    atualizarTodos();
  });

  // Clicar ou arrastar nas ondas pula para aquele ponto.
  const irPara = (x: number): void => {
    const r = trilha.getBoundingClientRect();
    const ms = Math.max(0, Math.min(1, (x - r.left) / r.width)) * duracaoMs;
    if (tocador.url === anexo.url && tocador.audio !== null) pular(ms);
    else tocar(anexo.url, duracaoMs, ms, expirou);
  };
  trilha.addEventListener('pointerdown', (e) => {
    trilha.setPointerCapture(e.pointerId);
    irPara(e.clientX);
  });
  trilha.addEventListener('pointermove', (e) => {
    if (trilha.hasPointerCapture(e.pointerId)) irPara(e.clientX);
  });
  trilha.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const passo = e.key === 'ArrowLeft' ? -5000 : 5000;
    if (tocador.url === anexo.url && tocador.audio !== null) pular(posicaoMs() + passo);
  });

  return no;
}
