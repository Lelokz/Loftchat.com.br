import './galeria.css';

import { avatarEl, el, iconEl } from '../../lib/dom';
import { formatDuration } from '../../lib/format';
import { closeIcon, expandIcon } from '../../lib/icons';
import { marcarSumida, ouvirGaleria, porPeriodo, sumiu } from '../../lib/galeria';
import type { EstadoDaGaleria } from '../../lib/galeria';
import type { Channel, Member, Message } from '../../types/models';
import { abrirVisualizador } from '../visualizador/visualizador';

/**
 * GALERIA DO GRUPO (0.8.0). A galeria é do GRUPO, não de um canal: mora numa
 * aba do painel da direita (Mídia), com as mais novas em miniatura, e o
 * "Ver tudo" abre a galeria grande — janela no meio no PC, tela cheia no
 * celular.
 */

export interface GaleriaProps {
  groupId: string;
  nomeDoGrupo: string;
  membros: Member[];
  /** 0.8.5: só os canais que a pessoa vê (a galeria busca canal por canal). */
  canais: Channel[];
}

type Filtro = 'tudo' | 'image' | 'video' | 'gif';
const FILTROS: [Filtro, string][] = [
  ['tudo', 'Tudo'],
  ['image', 'Fotos'],
  ['video', 'Vídeos'],
  ['gif', 'GIFs'],
];

/** Quantas miniaturas a aba mostra antes do "Ver tudo". */
const NO_PAINEL = 12;

/** O filtro da aba fica lembrado entre um desenho e outro do painel. */
let filtroDoPainel: Filtro = 'tudo';

const PLAY = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" focusable="false"><path d="M8 5.5v13l11-6.5z"/></svg>';

function filtrar(itens: Message[], filtro: Filtro, canal = ''): Message[] {
  return itens.filter((m) => !sumiu(m.id) && (filtro === 'tudo' || m.kind === filtro) && (canal === '' || m.channelId === canal));
}

function contar(n: number): string {
  return n === 1 ? '1 arquivo' : `${n} arquivos`;
}

/** Uma miniatura: foto/GIF/capa do vídeo, com selo de vídeo ou GIF e (na grande) quem mandou. */
function miniatura(m: Message, props: GaleriaProps, grande: boolean): HTMLElement {
  const anexo = m.attachment!;
  const autor = props.membros.find((p) => p.id === m.authorId);
  const nome = autor?.displayName ?? 'Alguém';
  const tipo = m.kind === 'video' ? 'Vídeo' : m.kind === 'gif' ? 'GIF' : 'Foto';
  const botao = el('button', {
    class: `galeria__item${grande ? ' galeria__item--grande' : ''}`,
    type: 'button',
    title: `${tipo} de ${nome}`,
    'aria-label': `${tipo} de ${nome}`,
    'data-kind': m.kind,
  });
  const sumir = (): void => {
    marcarSumida(m.id);
    botao.remove();
  };
  const capa = m.kind === 'video' ? anexo.capaUrl : anexo.url;
  if (capa !== undefined && capa !== '') {
    const img = el('img', { class: 'galeria__img', src: capa, alt: '', loading: 'lazy', draggable: 'false' });
    img.addEventListener('error', sumir);
    botao.append(img);
  } else {
    // Vídeo sem capa: o próprio vídeo mostra o primeiro quadro.
    const video = el('video', { class: 'galeria__img', src: anexo.url, preload: 'metadata', muted: '', playsinline: '' });
    video.addEventListener('error', sumir);
    botao.append(video);
  }
  if (m.kind === 'video') {
    botao.append(iconEl(PLAY, 'galeria__play'));
    if (anexo.durationMs !== undefined) botao.append(el('span', { class: 'galeria__selo' }, [formatDuration(anexo.durationMs)]));
  }
  if (m.kind === 'gif') botao.append(el('span', { class: 'galeria__selo' }, ['GIF']));
  if (grande) {
    botao.append(
      el('span', { class: 'galeria__quem' }, [avatarEl(autor?.initials ?? '?', 'xs', '', autor?.photo, m.authorId), nome]),
    );
  }
  botao.addEventListener('click', () => abrirVisualizador(anexo.url, `${tipo} de ${nome}`, m.kind === 'video'));
  return botao;
}

function grades(itens: Message[], props: GaleriaProps, grande: boolean): HTMLElement[] {
  return porPeriodo(itens, !grande).flatMap((bloco) => [
    el('h3', { class: 'galeria__periodo' }, [bloco.titulo]),
    el(
      'div',
      { class: `galeria__grade${grande ? ' galeria__grade--grande' : ''}` },
      bloco.itens.map((m) => miniatura(m, props, grande)),
    ),
  ]);
}

function vazio(estado: EstadoDaGaleria, filtrado: boolean): HTMLElement {
  const texto = !estado.carregada
    ? 'Carregando…'
    : estado.erro
      ? 'Não deu para carregar a galeria agora.'
      : filtrado
        ? 'Nada desse tipo nos últimos 60 dias.'
        : 'Nenhuma foto, GIF ou vídeo nos últimos 60 dias. O que a turma mandar aparece aqui.';
  return el('p', { class: 'galeria__vazio' }, [texto]);
}

function botoesDeFiltro(classe: string, atual: Filtro, aoEscolher: (f: Filtro) => void): HTMLElement {
  return el(
    'div',
    { class: classe, role: 'group', 'aria-label': 'Filtrar' },
    FILTROS.map(([id, nome]) => {
      const b = el('button', { type: 'button', class: id === atual ? 'is-on' : '', 'aria-pressed': String(id === atual) }, [nome]);
      b.addEventListener('click', () => aoEscolher(id));
      return b;
    }),
  );
}

/* --- a aba Mídia do painel --------------------------------------------------- */

/** Conteúdo da aba Mídia. Ouve a galeria enquanto estiver na tela. */
export function abaMidia(props: GaleriaProps): HTMLElement {
  const raiz = el('div', { class: 'galeria-aba' });
  let ultimo: EstadoDaGaleria | null = null;
  let entrou = false;

  const desenhar = (estado: EstadoDaGaleria): void => {
    const itens = filtrar(estado.itens, filtroDoPainel);
    const todos = filtrar(estado.itens, 'tudo');
    const verTudo = el('button', { class: 'galeria-aba__tudo', type: 'button' }, [
      iconEl(expandIcon(15)),
      `Ver tudo (${todos.length})`,
    ]);
    verTudo.addEventListener('click', () => abrirGaleria(props));
    raiz.replaceChildren(
      botoesDeFiltro('galeria-aba__filtros', filtroDoPainel, (f) => {
        filtroDoPainel = f;
        if (ultimo !== null) desenhar(ultimo);
      }),
      ...(itens.length === 0 ? [vazio(estado, todos.length > 0)] : grades(itens.slice(0, NO_PAINEL), props, false)),
      ...(todos.length > 0 ? [verTudo] : []),
    );
  };

  const soltar = ouvirGaleria(props.groupId, props.canais.map((c) => c.id), (estado) => {
    // O painel é remontado toda hora: o desenho velho que saiu da tela solta a escuta.
    if (raiz.isConnected) entrou = true;
    else if (entrou) {
      soltar();
      return;
    }
    ultimo = estado;
    desenhar(estado);
  });
  // Nunca chegou a entrar na tela (trocado antes): solta também.
  setTimeout(() => {
    if (!raiz.isConnected && !entrou) soltar();
    else entrou = true;
  }, 1000);
  return raiz;
}

/* --- a galeria grande ("Ver tudo") ------------------------------------------- */

export function abrirGaleria(props: GaleriaProps): void {
  let filtro: Filtro = 'tudo';
  let canal = '';
  let ultimo: EstadoDaGaleria | null = null;

  const fechar = el('button', { class: 'galeria__fechar icon-button', type: 'button', title: 'Fechar (Esc)' }, [
    iconEl(closeIcon(18)),
    el('span', { class: 'sr-only' }, ['Fechar galeria']),
  ]);
  const resumo = el('p', { class: 'galeria__resumo' });
  const filtros = el('div', { class: 'galeria__filtros-caixa' });
  const escolhaDeCanal = el('select', { class: 'galeria__canal', 'aria-label': 'Canal' }) as HTMLSelectElement;
  const corpo = el('div', { class: 'galeria__corpo' });
  const janela = el('dialog', { class: 'galeria', 'aria-label': 'Galeria' }, [
    el('div', { class: 'galeria__caixa' }, [
      fechar,
      el('div', { class: 'galeria__rolagem scroll-area' }, [
        el('header', { class: 'galeria__topo' }, [
          el('div', { class: 'galeria__titulo' }, [el('h2', {}, ['Galeria']), resumo]),
          filtros,
          escolhaDeCanal,
        ]),
        corpo,
      ]),
    ]),
  ]) as HTMLDialogElement;

  const desenhar = (estado: EstadoDaGaleria): void => {
    const todos = filtrar(estado.itens, 'tudo');
    resumo.replaceChildren('Tudo que a turma mandou em ', el('b', {}, [props.nomeDoGrupo]), ` · ${contar(todos.length)}`);
    filtros.replaceChildren(
      botoesDeFiltro('galeria__filtros', filtro, (f) => {
        filtro = f;
        desenhar(estado);
      }),
    );
    // Só os canais que têm alguma coisa na galeria.
    const comMidia = props.canais.filter((c) => todos.some((m) => m.channelId === c.id));
    escolhaDeCanal.replaceChildren(
      el('option', { value: '' }, ['Todos os canais']),
      ...comMidia.map((c) => el('option', { value: c.id }, [c.kind === 'text' ? `#${c.name}` : c.name])),
    );
    if (!comMidia.some((c) => c.id === canal)) canal = '';
    escolhaDeCanal.value = canal;
    const itens = filtrar(estado.itens, filtro, canal);
    corpo.replaceChildren(...(itens.length === 0 ? [vazio(estado, todos.length > 0)] : grades(itens, props, true)));
  };

  escolhaDeCanal.addEventListener('change', () => {
    canal = escolhaDeCanal.value;
    if (ultimo !== null) desenhar(ultimo);
  });

  const soltar = ouvirGaleria(props.groupId, props.canais.map((c) => c.id), (estado) => {
    ultimo = estado;
    desenhar(estado);
  });
  janela.addEventListener('close', () => {
    soltar();
    janela.remove();
  });
  // Clicar no fundo escuro (fora da caixa) fecha.
  janela.addEventListener('click', (e) => {
    if (e.target === janela) janela.close();
  });
  fechar.addEventListener('click', () => janela.close());
  document.body.append(janela);
  janela.showModal();
}
