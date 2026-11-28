import './reportar-bug.css';

import { el } from '../../lib/dom';
import { comecarGravacao, MicrofoneRecusado, relogio, resumirOndas } from '../../lib/gravador';
import type { Gravador } from '../../lib/gravador';
import { POR_ID } from '../../lib/insignias';
import { aparelhoAtual, enviarReporte, ouvirMeusReportes, podeTirarPrint, restamHoje, tirarPrint } from '../../lib/reportes';
import type { ArquivoDoReporte } from '../../lib/reportes';
import { CATEGORIAS_DE_BUG, LIMITE_DE_REPORTES_POR_DIA, MAX_ANEXOS } from '../../lib/reportes-comum';
import type { Reporte } from '../../lib/reportes-comum';
import { medalha, ouvirInsignias } from '../insignias/insignias-ui';

/**
 * CONFIGURAÇÕES → REPORTAR BUG (0.13.0), a maquete aprovada: "Novo reporte |
 * Meus reportes · N". Depois de mandar, pula para a lista. Sem aviso de
 * conserto: o estado (Enviado → Visto → Consertado na 0.X) fica só aqui.
 */

const MB = 1024 * 1024;
const MAX_ARQUIVO = 50 * MB;

const ICONES: Record<string, string> = {
  chat: '<path d="M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-7l-5 4v-4H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"/>',
  fone: '<path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="3" y="14" width="4" height="6" rx="1.5"/><rect x="17" y="14" width="4" height="6" rx="1.5"/>',
  tela: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  sino: '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  grupo: '<circle cx="9" cy="8" r="3"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><circle cx="17" cy="9" r="2.5"/><path d="M15.5 14.2A4.5 4.5 0 0 1 21 18.5"/>',
  pessoa: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/>',
  foto: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
  estrela: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
  olho: '<path d="M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7z"/><circle cx="12" cy="12" r="3"/>',
  lento: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9.5 2.5h5"/>',
  chave: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  baixar: '<path d="M12 4v11M7 10.5l5 5 5-5"/><path d="M4 19.5h16"/>',
  mais: '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 12h.01M12 12h.01M15.5 12h.01"/>',
  seta: '<path d="m6 9 6 6 6-6"/>',
  ok: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  play: '<path d="M8 5.5v13l10.5-6.5z" fill="currentColor" stroke="none"/>',
  pausa: '<path d="M8 5h3v14H8zM13 5h3v14h-3z" fill="currentColor" stroke="none"/>',
  parar: '<rect x="6.5" y="6.5" width="11" height="11" rx="2" fill="currentColor" stroke="none"/>',
  lixo: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13"/>',
  clipe: '<path d="m20 11.5-8 8a5 5 0 0 1-7-7l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7L9.7 17.2a1.7 1.7 0 0 1-2.4-2.4L15 7"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.5"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/>',
  enviar: '<path d="M4 12 20 4l-6 16-3-7z"/><path d="m11 13 9-9"/>',
  doc: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>',
};

function icone(nome: string, tamanho = 18): HTMLSpanElement {
  const s = el('span', { class: 'rbg-ic', 'aria-hidden': 'true' });
  s.innerHTML = `<svg width="${tamanho}" height="${tamanho}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${ICONES[nome] ?? ''}</svg>`;
  return s;
}

const categoriaDe = (id: string) => CATEGORIAS_DE_BUG.find((c) => c.id === id) ?? CATEGORIAS_DE_BUG.at(-1)!;
const ROMANOS = ['I', 'II', 'III'];
const METAS = [1, 5, 15];

function quando(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const hoje = new Date();
  const ontem = new Date(hoje.getTime() - 86_400_000);
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === hoje.toDateString()) return `hoje, ${hora}`;
  if (d.toDateString() === ontem.toDateString()) return `ontem, ${hora}`;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

export interface SecaoDeBug {
  elementos: HTMLElement[];
  parar(): void;
}

/** `dialogo` = as Configurações (somem durante o print). */
export function renderReportarBug(uid: string, dialogo: HTMLElement): SecaoDeBug {
  const paradas: Array<() => void> = [];
  let lista: Reporte[] = [];
  let aba: 'novo' | 'meus' = 'novo';
  let acabouDeMandar: string | null = null;

  /* --- topo: título e o Caçador de bugs -------------------------------- */
  const cacador = el('div', { class: 'rbg-cacador' });
  function desenharCacador(n: number): void {
    const nivel = METAS.filter((m) => n >= m).length;
    const ins = POR_ID.get(`bug${Math.max(1, nivel)}`);
    const ate = METAS[nivel] ?? METAS.at(-1)!;
    const frac = nivel >= METAS.length ? 1 : n / ate;
    const conta = n === 0 ? 'Nenhum bug confirmado ainda' : `${n} ${n === 1 ? 'bug confirmado' : 'bugs confirmados'}`;
    const falta = nivel >= METAS.length ? 'série completa' : `${nivel === 0 ? 'falta' : 'faltam'} ${ate - n} para o ${ROMANOS[nivel]}`;
    const barra = el('div', { class: 'rbg-cacador__barra' }, [el('i', { style: `width:${Math.round(frac * 100)}%` })]);
    cacador.replaceChildren(
      ins === undefined ? el('span') : medalha(ins, 46, nivel === 0 ? 'falta' : 'tem'),
      el('div', {}, [
        el('b', {}, [`Caçador de bugs ${ROMANOS[Math.max(0, nivel - 1)]}`]),
        el('small', {}, [`${conta} · ${falta}`]),
        barra,
      ]),
    );
  }
  desenharCacador(0);
  paradas.push(ouvirInsignias(uid, (d) => desenharCacador(d.n['bugs'] ?? 0)));

  const topo = el('div', { class: 'rbg-topo' }, [
    el('header', { class: 'settings__header' }, [
      el('h2', { class: 'settings__title' }, ['Reportar bug']),
      el('p', { class: 'settings__subtitle' }, ['Achou algo errado? Conta aqui com print ou áudio. Só o criador do Loftchat lê os reportes.']),
    ]),
    cacador,
  ]);

  /* --- abas ------------------------------------------------------------ */
  const abaNovo = el('button', { class: 'rbg-aba', type: 'button', role: 'tab', id: 'rbg-aba-novo' }, ['Novo reporte']);
  const contaMeus = el('span', { class: 'rbg-aba__n' }, ['0']);
  const abaMeus = el('button', { class: 'rbg-aba', type: 'button', role: 'tab', id: 'rbg-aba-meus' }, ['Meus reportes', contaMeus]);
  const abas = el('div', { class: 'rbg-abas', role: 'tablist', 'aria-label': 'Reportar bug' }, [abaNovo, abaMeus]);
  const painelNovo = el('div', { class: 'rbg-painel', role: 'tabpanel', 'aria-labelledby': 'rbg-aba-novo' });
  const painelMeus = el('div', { class: 'rbg-painel', role: 'tabpanel', 'aria-labelledby': 'rbg-aba-meus' });

  function mostrarAba(qual: 'novo' | 'meus'): void {
    aba = qual;
    abaNovo.setAttribute('aria-selected', String(qual === 'novo'));
    abaMeus.setAttribute('aria-selected', String(qual === 'meus'));
    painelNovo.hidden = qual !== 'novo';
    painelMeus.hidden = qual !== 'meus';
    if (qual === 'meus') desenharLista();
    else acabouDeMandar = null;
  }
  abaNovo.addEventListener('click', () => mostrarAba('novo'));
  abaMeus.addEventListener('click', () => mostrarAba('meus'));

  /* --- o formulário ------------------------------------------------------ */
  const titulo = el('input', { class: 'settings__input', id: 'rbg-titulo', type: 'text', maxlength: 80, autocomplete: 'off', placeholder: 'Uma frase curta do problema' });
  const contaTitulo = el('span', { class: 'settings__help settings__count' }, ['0/80']);
  titulo.addEventListener('input', () => {
    contaTitulo.textContent = `${titulo.value.length}/80`;
  });

  // Categoria: botão que abre a lista (no celular, a gaveta de baixo).
  let categoria = '';
  const botaoCategoria = el('button', { class: 'rbg-cat', type: 'button', id: 'rbg-categoria', 'aria-haspopup': 'listbox', 'aria-expanded': 'false' });
  function desenharBotaoCategoria(): void {
    const c = categoria === '' ? null : categoriaDe(categoria);
    botaoCategoria.replaceChildren(
      ...(c === null
        ? [el('span', { class: 'rbg-cat__vazio' }, ['Escolher a categoria'])]
        : [el('span', { class: 'rbg-cat__i' }, [icone(c.icone)]), el('span', {}, [c.nome])]),
      el('span', { class: 'rbg-cat__seta' }, [icone('seta')]),
    );
  }
  desenharBotaoCategoria();
  let listaAberta: { fechar: () => void } | null = null;
  function abrirCategorias(): void {
    if (listaAberta !== null) return listaAberta.fechar();
    const fundo = el('div', { class: 'rbg-fundo' });
    const opcoes = CATEGORIAS_DE_BUG.map((c) => {
      const o = el('button', { class: 'rbg-lista__o', type: 'button', role: 'option', 'aria-selected': String(c.id === categoria) }, [
        el('span', { class: 'rbg-lista__i' }, [icone(c.icone, 16)]),
        el('span', {}, [c.nome]),
      ]);
      o.addEventListener('click', () => {
        categoria = c.id;
        desenharBotaoCategoria();
        fechar();
        botaoCategoria.focus();
      });
      return o;
    });
    const caixa = el('div', { class: 'rbg-lista', role: 'listbox', 'aria-label': 'Categoria' }, [el('div', { class: 'rbg-lista__t' }, ['Categoria']), ...opcoes]);
    const r = botaoCategoria.getBoundingClientRect();
    caixa.style.left = `${r.left}px`;
    caixa.style.top = `${r.bottom + 6}px`;
    caixa.style.width = `${Math.min(r.width, 640)}px`;
    // Sem espaço embaixo: abre para cima.
    dialogo.append(fundo, caixa);
    const alt = caixa.getBoundingClientRect().height;
    if (r.bottom + 6 + alt > window.innerHeight - 8 && r.top - 6 - alt > 8) caixa.style.top = `${r.top - 6 - alt}px`;
    botaoCategoria.setAttribute('aria-expanded', 'true');
    (opcoes.find((o) => o.getAttribute('aria-selected') === 'true') ?? opcoes[0])?.focus();
    const tecla = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        fechar();
        botaoCategoria.focus();
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const i = opcoes.indexOf(document.activeElement as HTMLButtonElement);
        opcoes[(i + (e.key === 'ArrowDown' ? 1 : -1) + opcoes.length) % opcoes.length]?.focus();
      }
    };
    window.addEventListener('keydown', tecla, true);
    fundo.addEventListener('click', () => fechar());
    function fechar(): void {
      window.removeEventListener('keydown', tecla, true);
      fundo.remove();
      caixa.remove();
      botaoCategoria.setAttribute('aria-expanded', 'false');
      listaAberta = null;
    }
    listaAberta = { fechar };
  }
  botaoCategoria.addEventListener('click', abrirCategorias);
  paradas.push(() => listaAberta?.fechar());

  const texto = el('textarea', { class: 'settings__input settings__textarea rbg-ta', id: 'rbg-texto', maxlength: 2000, rows: 5 });

  /* --- áudio ------------------------------------------------------------- */
  const caixaAudio = el('div', { class: 'rbg-audio-caixa' });
  let gravacao: { blob: Blob; duracaoMs: number; ondas: number[]; url: string } | null = null;
  let gravador: Gravador | null = null;
  let tocador: HTMLAudioElement | null = null;
  let relogioDaGravacao: ReturnType<typeof setInterval> | null = null;

  function soltarAudio(): void {
    tocador?.pause();
    tocador = null;
    if (gravacao !== null) URL.revokeObjectURL(gravacao.url);
    gravacao = null;
  }
  function pararGravador(): void {
    if (relogioDaGravacao !== null) clearInterval(relogioDaGravacao);
    relogioDaGravacao = null;
    gravador?.cancelar();
    gravador = null;
  }
  paradas.push(() => {
    pararGravador();
    soltarAudio();
  });

  function desenharAudio(): void {
    if (gravador !== null) {
      const tempo = el('span', { class: 'rbg-audio__tm' }, ['0:00']);
      const ondas = el('span', { class: 'rbg-audio__onda rbg-audio__onda--viva' });
      const parar = el('button', { class: 'rbg-audio__p rbg-audio__p--parar', type: 'button', 'aria-label': 'Parar a gravação' }, [icone('parar', 14)]);
      const cancelar = el('button', { class: 'rbg-audio__b', type: 'button', 'aria-label': 'Cancelar a gravação' }, [icone('lixo')]);
      parar.addEventListener('click', () => void terminarGravacao());
      cancelar.addEventListener('click', () => {
        pararGravador();
        desenharAudio();
      });
      relogioDaGravacao = setInterval(() => {
        tempo.textContent = relogio(gravador?.tempoMs() ?? 0);
      }, 250);
      caixaAudio.replaceChildren(el('div', { class: 'rbg-audio rbg-audio--gravando' }, [parar, el('span', { class: 'rbg-audio__ponto' }), ondas, tempo, cancelar]));
      niveis = ondas;
      return;
    }
    if (gravacao === null) {
      const gravar = el('button', { class: 'rbg-gravar', type: 'button' }, [icone('mic'), 'Gravar áudio']);
      gravar.addEventListener('click', () => void comecar());
      caixaAudio.replaceChildren(gravar);
      return;
    }
    const g = gravacao;
    const play = el('button', { class: 'rbg-audio__p', type: 'button', 'aria-label': 'Ouvir o áudio' }, [icone('play', 16)]);
    const barras = g.ondas.map((h) => el('i', { style: `height:${Math.max(3, Math.round((h / 100) * 28))}px` }));
    const tempo = el('span', { class: 'rbg-audio__tm' }, [`0:00 / ${relogio(g.duracaoMs)}`]);
    const regravar = el('button', { class: 'rbg-audio__b', type: 'button', 'aria-label': 'Gravar de novo' }, [icone('mic')]);
    const apagar = el('button', { class: 'rbg-audio__b', type: 'button', 'aria-label': 'Apagar o áudio' }, [icone('lixo')]);
    const pintar = (s: number): void => {
      const frac = g.duracaoMs > 0 ? (s * 1000) / g.duracaoMs : 0;
      barras.forEach((b, i) => b.classList.toggle('rbg-tocado', i / barras.length < frac));
      tempo.textContent = `${relogio(s * 1000)} / ${relogio(g.duracaoMs)}`;
    };
    play.addEventListener('click', () => {
      if (tocador === null) {
        tocador = new Audio(g.url);
        tocador.addEventListener('timeupdate', () => pintar(tocador?.currentTime ?? 0));
        tocador.addEventListener('ended', () => {
          play.replaceChildren(icone('play', 16));
          play.setAttribute('aria-label', 'Ouvir o áudio');
          pintar(0);
        });
      }
      if (tocador.paused) {
        void tocador.play();
        play.replaceChildren(icone('pausa', 16));
        play.setAttribute('aria-label', 'Pausar o áudio');
      } else {
        tocador.pause();
        play.replaceChildren(icone('play', 16));
        play.setAttribute('aria-label', 'Ouvir o áudio');
      }
    });
    regravar.addEventListener('click', () => {
      soltarAudio();
      void comecar();
    });
    apagar.addEventListener('click', () => {
      soltarAudio();
      desenharAudio();
    });
    caixaAudio.replaceChildren(el('div', { class: 'rbg-audio' }, [play, el('span', { class: 'rbg-audio__onda' }, barras), tempo, regravar, apagar]));
  }

  let niveis: HTMLElement | null = null;
  async function comecar(): Promise<void> {
    mostrarErro(null);
    try {
      gravador = await comecarGravacao(
        (nivel) => {
          if (niveis === null) return;
          const b = el('i', { style: `height:${Math.max(3, Math.round(nivel * 28))}px` });
          niveis.append(b);
          while (niveis.childElementCount > 60) niveis.firstElementChild?.remove();
        },
        () => void terminarGravacao(),
      );
    } catch (e) {
      gravador = null;
      mostrarErro(e instanceof MicrofoneRecusado ? e.message : 'Não deu para gravar.');
    }
    desenharAudio();
  }
  async function terminarGravacao(): Promise<void> {
    const g = gravador;
    if (g === null) return;
    gravador = null;
    if (relogioDaGravacao !== null) clearInterval(relogioDaGravacao);
    relogioDaGravacao = null;
    niveis = null;
    const r = await g.parar();
    gravacao = { blob: r.blob, duracaoMs: r.duracaoMs, ondas: resumirOndas(r.ondas, 40), url: URL.createObjectURL(r.blob) };
    desenharAudio();
  }
  desenharAudio();

  /* --- anexos ------------------------------------------------------------ */
  const anexos: Array<ArquivoDoReporte & { url: string }> = [];
  const contaAnexos = el('span', { class: 'settings__help' }, [`0 de ${MAX_ANEXOS}`]);
  const grade = el('div', { class: 'rbg-anexos' });
  const escolher = el('input', { type: 'file', multiple: true, hidden: true, id: 'rbg-arquivos' });
  const adicionar = el('button', { class: 'rbg-add', type: 'button' }, [icone('clipe', 22), el('span', {}, ['Adicionar'])]);
  const print = el('button', { class: 'rbg-add rbg-add--print', type: 'button' }, [icone('camera', 22), el('span', {}, ['Tirar print agora'])]);
  adicionar.addEventListener('click', () => escolher.click());
  escolher.addEventListener('change', () => {
    for (const f of Array.from(escolher.files ?? [])) juntar(f, f.name);
    escolher.value = '';
  });
  print.addEventListener('click', async () => {
    try {
      const png = await tirarPrint(dialogo);
      juntar(png, `print-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png`);
    } catch (e) {
      mostrarErro(e instanceof Error ? e.message : 'Não deu para tirar o print.');
    }
  });

  function juntar(blob: Blob, nome: string): void {
    mostrarErro(null);
    if (anexos.length >= MAX_ANEXOS) return mostrarErro(`Dá para mandar até ${MAX_ANEXOS} arquivos.`);
    if (blob.size > MAX_ARQUIVO) return mostrarErro(`"${nome}" passa de 50 MB.`);
    const tipo = blob.type.startsWith('image/') ? 'imagem' : blob.type.startsWith('video/') ? 'video' : 'arquivo';
    anexos.push({ blob, nome: nome.slice(0, 120), tipo, url: URL.createObjectURL(blob) });
    desenharAnexos();
  }
  function desenharAnexos(): void {
    contaAnexos.textContent = `${anexos.length} de ${MAX_ANEXOS}`;
    const cartoes = anexos.map((a, i) => {
      const tirar = el('button', { class: 'rbg-anx__x', type: 'button', 'aria-label': `Tirar ${a.nome}` }, ['✕']);
      tirar.addEventListener('click', () => {
        URL.revokeObjectURL(a.url);
        anexos.splice(i, 1);
        desenharAnexos();
      });
      const miolo =
        a.tipo === 'imagem'
          ? el('img', { src: a.url, alt: a.nome })
          : a.tipo === 'video'
            ? el('video', { src: a.url, muted: true, preload: 'metadata' })
            : el('span', { class: 'rbg-anx__doc' }, [icone('doc', 26), el('small', {}, [a.nome])]);
      return el('div', { class: 'rbg-anx', title: a.nome }, [
        miolo,
        a.tipo === 'video' && el('span', { class: 'rbg-anx__play' }, [icone('play', 14)]),
        a.tipo !== 'arquivo' && el('span', { class: 'rbg-anx__tag' }, [a.tipo === 'imagem' ? 'imagem' : 'vídeo']),
        tirar,
      ]);
    });
    adicionar.hidden = anexos.length >= MAX_ANEXOS;
    print.hidden = anexos.length >= MAX_ANEXOS || !podeTirarPrint();
    grade.replaceChildren(...cartoes, adicionar, print, escolher);
  }
  desenharAnexos();
  paradas.push(() => anexos.forEach((a) => URL.revokeObjectURL(a.url)));

  /* --- vai junto, erro e enviar ----------------------------------------- */
  const ap = aparelhoAtual();
  const item = (rotulo: string, valor: string): HTMLElement => el('li', {}, [el('small', {}, [rotulo]), el('b', {}, [valor])]);
  const vaiJunto = el('div', { class: 'rbg-vai' }, [
    el('div', { class: 'rbg-vai__t' }, [icone('info', 16), 'Vai junto, para ajudar a achar o bug']),
    el('ul', {}, [
      item('Versão', ap.versao),
      item('Aparelho', ap.modelo ?? (ap.tipo === 'computador' ? 'Computador' : ap.tipo === 'celular' ? 'Celular' : 'Navegador')),
      item('Sistema', ap.sistema),
      item('Tela', ap.tela),
    ]),
  ]);

  const erro = el('p', { class: 'settings__error', role: 'alert' });
  erro.hidden = true;
  function mostrarErro(t: string | null): void {
    erro.hidden = t === null;
    erro.textContent = t ?? '';
  }

  const enviar = el('button', { class: 'rbg-enviar', type: 'button' }, [icone('enviar'), el('span', {}, ['Enviar reporte'])]);
  const restam = el('small', { class: 'rbg-fim__restam' });
  let enviando = false;
  function desenharRestam(): void {
    const n = restamHoje(lista);
    restam.textContent = n === 0 ? `Você já mandou ${LIMITE_DE_REPORTES_POR_DIA} hoje. Amanhã libera de novo.` : `Você ainda pode mandar ${n} hoje.`;
    enviar.disabled = enviando || n === 0;
  }

  enviar.addEventListener('click', async () => {
    if (enviando) return;
    if (gravador !== null) return mostrarErro('Pare a gravação do áudio antes de mandar.');
    if (titulo.value.trim().length < 3) {
      titulo.focus();
      return mostrarErro('Escreva um título.');
    }
    if (categoria === '') {
      botaoCategoria.focus();
      return mostrarErro('Escolha a categoria.');
    }
    if (texto.value.trim() === '' && gravacao === null) {
      texto.focus();
      return mostrarErro('Conte o que aconteceu (por escrito ou em áudio).');
    }
    mostrarErro(null);
    enviando = true;
    desenharRestam();
    const rotulo = enviar.querySelector('span:last-child')!;
    try {
      const { id } = await enviarReporte(
        {
          titulo: titulo.value.trim(),
          categoria,
          texto: texto.value.trim(),
          audio: gravacao === null ? null : { blob: gravacao.blob, duracaoMs: gravacao.duracaoMs },
          anexos: anexos.map(({ blob, nome, tipo }) => ({ blob, nome, tipo })),
        },
        (feitos, total) => {
          rotulo.textContent = total === 0 ? 'Enviando…' : `Enviando… (${feitos} de ${total})`;
        },
      );
      // Limpa e pula para a lista.
      titulo.value = '';
      contaTitulo.textContent = '0/80';
      texto.value = '';
      categoria = '';
      desenharBotaoCategoria();
      soltarAudio();
      desenharAudio();
      anexos.splice(0).forEach((a) => URL.revokeObjectURL(a.url));
      desenharAnexos();
      acabouDeMandar = id;
      mostrarAba('meus');
    } catch (e) {
      mostrarErro(e instanceof Error ? e.message : 'Não deu para mandar. Tente de novo.');
    } finally {
      enviando = false;
      rotulo.textContent = 'Enviar reporte';
      desenharRestam();
    }
  });

  const campo = (rotulo: HTMLElement | string, controle: HTMLElement, extra?: HTMLElement): HTMLElement =>
    el('div', { class: 'settings__field' }, [typeof rotulo === 'string' ? el('span', { class: 'settings__label' }, [rotulo]) : rotulo, controle, extra ?? null]);

  painelNovo.append(
    campo(el('div', { class: 'rbg-rot' }, [el('label', { class: 'settings__label', for: 'rbg-titulo' }, ['Título']), contaTitulo]), titulo),
    campo(el('span', { class: 'settings__label', id: 'rbg-cat-rot' }, ['Categoria']), botaoCategoria),
    campo(
      el('label', { class: 'settings__label', for: 'rbg-texto' }, ['O que aconteceu']),
      texto,
      el('span', { class: 'settings__help' }, ['O que você fez, o que esperava e o que aconteceu.']),
    ),
    campo(el('span', { class: 'settings__label' }, ['Áudio ', el('span', { class: 'rbg-opcional' }, ['· opcional'])]), caixaAudio),
    campo(el('div', { class: 'rbg-rot' }, [el('span', { class: 'settings__label' }, ['Prints, vídeos e arquivos']), contaAnexos]), grade),
    vaiJunto,
    erro,
    el('div', { class: 'rbg-fim' }, [enviar, restam]),
  );
  botaoCategoria.setAttribute('aria-labelledby', 'rbg-cat-rot rbg-categoria');

  /* --- meus reportes ------------------------------------------------------ */
  function passos(r: Reporte): HTMLElement {
    const n = r.estado === 'consertado' ? 3 : r.estado === 'visto' ? 2 : 1;
    const nomes: Array<[string, string]> = [['Enviado', ''], ['Visto', ''], ['Consertado', r.estado === 'consertado' && r.versaoConserto !== '' ? `na ${r.versaoConserto}` : '']];
    return el(
      'div',
      { class: 'rbg-passos', 'aria-label': `Estado: ${r.estado === 'consertado' ? 'consertado' : r.estado === 'visto' ? 'visto' : 'enviado'}` },
      nomes.map(([t, s], i) =>
        el('div', { class: `rbg-passo${i < n ? ' rbg-passo--feito' : ''}${n === 3 && i < n ? ' rbg-passo--verde' : ''}` }, [
          el('span', { class: 'rbg-passo__b' }, i < n ? [icone('ok', 13)] : []),
          t,
          s !== '' && el('small', {}, [s]),
        ]),
      ),
    );
  }
  function desenharLista(): void {
    if (aba !== 'meus') return;
    const cartoes = lista.map((r) => {
      const c = categoriaDe(r.categoria);
      const estado =
        r.estado === 'consertado'
          ? el('span', { class: 'rbg-est rbg-est--consertado' }, [r.versaoConserto === '' ? 'Consertado' : `Consertado na ${r.versaoConserto}`])
          : r.estado === 'visto'
            ? el('span', { class: 'rbg-est rbg-est--visto' }, ['Visto'])
            : el('span', { class: 'rbg-est rbg-est--enviado' }, ['Enviado']);
      const bug1 = POR_ID.get('bug1');
      return el('article', { class: `rbg-card${r.id === acabouDeMandar ? ' rbg-card--novo' : ''}`, 'data-reporte': r.id }, [
        el('div', { class: 'rbg-card__cab' }, [
          el('span', { class: 'rbg-card__i' }, [icone(c.icone)]),
          el('div', {}, [
            el('b', {}, [r.titulo]),
            el('small', {}, [
              el('span', {}, [c.nome]),
              el('span', {}, [quando(r.criadoEm)]),
              r.audio !== null && el('span', {}, [icone('mic', 13), 'áudio']),
              r.anexos.length > 0 && el('span', {}, [icone('clipe', 13), `${r.anexos.length} ${r.anexos.length === 1 ? 'anexo' : 'anexos'}`]),
            ]),
          ]),
          estado,
        ]),
        passos(r),
        r.confirmado && el('div', { class: 'rbg-ponto' }, [bug1 === undefined ? null : medalha(bug1, 24), 'Bug confirmado: contou para o Caçador de bugs']),
      ]);
    });
    painelMeus.replaceChildren(
      ...(acabouDeMandar !== null ? [el('div', { class: 'rbg-feito', role: 'status' }, [icone('ok'), 'Reporte enviado. Valeu por ajudar!'])] : []),
      ...(cartoes.length === 0 ? [el('p', { class: 'rbg-vazio' }, ['Você ainda não mandou nenhum reporte. Quando mandar, ele aparece aqui com o andamento.'])] : cartoes),
    );
  }

  paradas.push(
    ouvirMeusReportes(uid, (l) => {
      lista = l;
      contaMeus.textContent = String(l.length);
      contaMeus.hidden = l.length === 0;
      desenharRestam();
      desenharLista();
    }),
  );
  contaMeus.hidden = true;
  desenharRestam();
  mostrarAba('novo');

  return {
    elementos: [topo, abas, painelNovo, painelMeus],
    parar: () => paradas.forEach((p) => p()),
  };
}
