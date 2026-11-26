import './insignias.css';

import { doc, onSnapshot, updateDoc } from 'firebase/firestore';

import { el, iconEl } from '../../lib/dom';
import { db } from '../../lib/firebase';
import { closeIcon } from '../../lib/icons';
import { CATEGORIAS, INSIGNIAS, POR_ID, RARIDADES, progresso } from '../../lib/insignias';
import type { Insignia } from '../../lib/insignias';
import { DESENHOS } from './desenhos';

/**
 * AS INSÍGNIAS NA TELA (0.12.0): a medalha (escudo na cor da raridade com o
 * desenho no meio), a fileira do cartão, a aba do perfil completo, a dica com
 * o progresso e o AVISO quando ganha uma nova.
 */

export interface DadosDeInsignias {
  /** id → quando ganhou (ISO). */
  tem: Map<string, string>;
  /** Os contadores (insignias/{uid}.n). */
  n: Record<string, number>;
  /** Até quando os avisos já foram mostrados (ISO). */
  avisadoAte: string;
}

export function lerDadosDeInsignias(raw: Record<string, unknown> | undefined): DadosDeInsignias {
  const tem = new Map<string, string>();
  const temRaw = raw?.['tem'];
  if (typeof temRaw === 'object' && temRaw !== null) {
    for (const [id, quando] of Object.entries(temRaw)) if (POR_ID.has(id) && typeof quando === 'string') tem.set(id, quando);
  }
  const n: Record<string, number> = {};
  const nRaw = raw?.['n'];
  if (typeof nRaw === 'object' && nRaw !== null) {
    for (const [k, v] of Object.entries(nRaw)) if (typeof v === 'number' && Number.isFinite(v)) n[k] = v;
  }
  return { tem, n, avisadoAte: typeof raw?.['avisadoAte'] === 'string' ? raw['avisadoAte'] : '' };
}

/** Acompanha as insígnias de alguém. Devolve como parar. */
export function ouvirInsignias(uid: string, aoMudar: (dados: DadosDeInsignias) => void): () => void {
  return onSnapshot(
    doc(db, 'insignias', uid),
    (snap) => aoMudar(lerDadosDeInsignias(snap.data())),
    () => aoMudar(lerDadosDeInsignias(undefined)),
  );
}

/* ------------------------------- a medalha ------------------------------- */

let seq = 0;
const PREFIXO = `ins${Math.random().toString(36).slice(2, 7)}`;
export type EstadoDaMedalha = 'tem' | 'falta' | 'secreta';

/** O escudo da insígnia (SVG). */
export function medalha(ins: Insignia, tamanho: number, estado: EstadoDaMedalha = 'tem'): HTMLElement {
  const r = RARIDADES[ins.raridade];
  const id = `${PREFIXO}${seq++}`;
  const apagada = estado !== 'tem';
  const escondida = estado === 'secreta';
  const glifo = escondida ? DESENHOS['segredo']! : (DESENHOS[ins.icone] ?? DESENHOS['segredo']!);
  const a = apagada ? '#3a3350' : r.a;
  const b = apagada ? '#221d33' : r.b;
  const borda = apagada ? '#4b4466' : r.borda;
  const cor = apagada ? '#8a83a3' : r.glifo;
  const brilho = !apagada && (ins.raridade === 'epica' || ins.raridade === 'lendaria');
  const nivel =
    ins.nivel !== undefined && !escondida
      ? `<g transform="translate(32 55)"><rect x="-9" y="-6" width="18" height="12" rx="6" fill="${apagada ? '#2a2440' : '#120d1f'}" stroke="${borda}" stroke-width="1.2"/><text x="0" y="3.4" text-anchor="middle" font-family="Nunito, sans-serif" font-weight="900" font-size="8.5" fill="${apagada ? '#8a83a3' : '#fff'}">${['I', 'II', 'III', 'IV', 'V'][ins.nivel - 1]}</text></g>`
      : '';
  const span = el('span', { class: `ins-med${brilho ? ` ins-med--${ins.raridade}` : ''}${apagada ? ' ins-med--apagada' : ''}`, 'aria-hidden': 'true' });
  span.style.width = `${tamanho}px`;
  span.style.height = `${tamanho}px`;
  span.innerHTML = `<svg viewBox="0 0 64 64" width="${tamanho}" height="${tamanho}">
    <defs>
      <linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>
      <linearGradient id="${id}l" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".45"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/></linearGradient>
    </defs>
    <path d="M32 3.5 55 12.5c1.3.5 2 1.6 2 3v15.2C57 45 46.3 55.3 33.2 60.2a3.4 3.4 0 0 1-2.4 0C17.7 55.3 7 45 7 30.7V15.5c0-1.4.7-2.5 2-3z" fill="url(#${id})" stroke="${borda}" stroke-width="2.2"/>
    <path d="M32 7.5 52 15.3v9.2C42 21 22 21 12 24.5v-9.2z" fill="url(#${id}l)"/>
    <g transform="translate(17 15.5) scale(1.25)" fill="none" stroke="${cor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${glifo}</g>
    ${nivel}
  </svg>`;
  return span;
}

/* ------------------------------ a dica ------------------------------------ */

let dicaAberta: HTMLElement | null = null;

function fecharDica(): void {
  dicaAberta?.remove();
  dicaAberta = null;
}

function textoDaDica(ins: Insignia, estado: EstadoDaMedalha, dados: DadosDeInsignias | null): Array<HTMLElement | false> {
  const r = RARIDADES[ins.raridade];
  if (estado === 'secreta') return [el('b', {}, ['Insígnia secreta']), el('span', {}, ['Descubra como ganhar.'])];
  const p = estado === 'falta' && dados !== null ? progresso(ins, dados.n, dados.tem.size) : null;
  const quando = dados?.tem.get(ins.id);
  return [
    el('b', {}, [ins.nome]),
    el('span', {}, [ins.desc]),
    el('span', { class: 'ins-dica__prog' }, [
      el('span', {}, [p !== null ? p.texto : quando !== undefined ? `Ganhou em ${new Date(quando).toLocaleDateString('pt-BR')}` : '']),
      el('span', { style: `color:${r.a}` }, [r.nome]),
    ]),
    p !== null && barra(p.atual / p.alvo, ins),
  ];
}

function barra(fracao: number, ins: Insignia): HTMLElement {
  const r = RARIDADES[ins.raridade];
  const i = el('i', { style: `width:${Math.round(Math.min(1, Math.max(0, fracao)) * 100)}%;background:linear-gradient(90deg,${r.a},${r.b})` });
  return el('span', { class: 'ins-barra' }, [i]);
}

/** Passar o mouse mostra a dica; tocar (celular) abre a folha embaixo. */
function comDica(alvo: HTMLElement, ins: Insignia, estado: EstadoDaMedalha, dados: () => DadosDeInsignias | null): HTMLElement {
  alvo.tabIndex = 0;
  alvo.setAttribute('role', 'button');
  alvo.setAttribute('aria-label', estado === 'secreta' ? 'Insígnia secreta' : `${ins.nome}: ${ins.desc}`);
  const abrir = (): void => {
    fecharDica();
    const dica = el('div', { class: 'ins-dica', role: 'tooltip' }, textoDaDica(ins, estado, dados()));
    // Dentro de um <dialog> aberto (Configurações), a dica tem de ir na mesma camada.
    (alvo.closest('dialog[open]') ?? document.body).append(dica);
    const r = alvo.getBoundingClientRect();
    const w = dica.offsetWidth;
    const left = Math.max(8, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - 8));
    let top = r.bottom + 8;
    if (top + dica.offsetHeight > window.innerHeight - 8) top = r.top - dica.offsetHeight - 8;
    dica.style.left = `${Math.round(left)}px`;
    dica.style.top = `${Math.round(top)}px`;
    dicaAberta = dica;
  };
  alvo.addEventListener('pointerenter', (e) => {
    if (e.pointerType === 'mouse') abrir();
  });
  alvo.addEventListener('pointerleave', fecharDica);
  alvo.addEventListener('focus', abrir);
  alvo.addEventListener('blur', fecharDica);
  alvo.addEventListener('click', (e) => {
    // Tela de toque ou layout de celular: a folha embaixo (no PC, a dica do mouse basta).
    if (matchMedia('(hover: hover)').matches && !matchMedia('(max-width: 720px)').matches) return;
    e.stopPropagation();
    fecharDica();
    abrirFolha(ins, estado, dados(), alvo.closest('dialog[open]') ?? document.body);
  });
  return alvo;
}

/** Celular: a folha embaixo com a medalha grande, o que fazer e o progresso. */
function abrirFolha(ins: Insignia, estado: EstadoDaMedalha, dados: DadosDeInsignias | null, onde: Element): void {
  const r = RARIDADES[ins.raridade];
  const p = estado === 'falta' && dados !== null ? progresso(ins, dados.n, dados.tem.size) : null;
  const veu = el('div', { class: 'ins-folha-veu' });
  const folha = el('div', { class: 'ins-folha', role: 'dialog', 'aria-label': estado === 'secreta' ? 'Insígnia secreta' : ins.nome }, [
    el('div', { class: 'ins-folha__puxa' }),
    medalha(ins, 92, estado),
    el('b', {}, [estado === 'secreta' ? 'Insígnia secreta' : ins.nome]),
    el('span', { class: 'ins-folha__rar', style: `color:${r.a}` }, [r.nome]),
    el('p', {}, [estado === 'secreta' ? 'Descubra como ganhar.' : ins.desc]),
    p !== null && el('div', { class: 'ins-folha__prog' }, [el('span', {}, [p.texto]), el('span', {}, [p.falta])]),
    p !== null && barra(p.atual / p.alvo, ins),
  ]);
  const fechar = (): void => {
    veu.remove();
    folha.remove();
  };
  veu.addEventListener('click', fechar);
  folha.addEventListener('click', fechar);
  onde.append(veu, folha);
}

/* ------------------------- a fileira do cartão ----------------------------- */

/** As até 5 escolhidas, debaixo do nome (cartão e perfil). */
export function filaDeInsignias(ids: string[] | undefined, tamanho = 22, dados: () => DadosDeInsignias | null = () => null): HTMLElement | false {
  const lista = (ids ?? []).map((id) => POR_ID.get(id)).filter((i): i is Insignia => i !== undefined).slice(0, 5);
  if (lista.length === 0) return false;
  return el(
    'div',
    { class: 'ins-fila', 'aria-label': 'Insígnias' },
    lista.map((ins) => comDica(el('span', { class: 'ins-fila__item' }, [medalha(ins, tamanho)]), ins, 'tem', dados)),
  );
}

/* --------------------------- a aba do perfil ------------------------------- */

/** "35 de 100", a barra, os filtros e a grade por categoria. */
export function abaInsignias(dados: DadosDeInsignias, celular: boolean): HTMLElement {
  let filtro: 'todas' | 'tem' | 'faltam' = 'todas';
  const grade = el('div', { class: 'ins-grade' });
  const total = INSIGNIAS.length;

  function desenhar(): void {
    const filhos: HTMLElement[] = [];
    for (const cat of CATEGORIAS) {
      const daqui = INSIGNIAS.filter((i) => i.categoria === cat).filter((i) =>
        filtro === 'todas' ? true : filtro === 'tem' ? dados.tem.has(i.id) : !dados.tem.has(i.id),
      );
      if (daqui.length === 0) continue;
      filhos.push(el('h5', { class: 'ins-grade__cat' }, [cat]));
      for (const ins of daqui) {
        const estado: EstadoDaMedalha = dados.tem.has(ins.id) ? 'tem' : ins.secreta === true ? 'secreta' : 'falta';
        filhos.push(comDica(el('span', { class: 'ins-grade__item', 'data-insignia': ins.id }, [medalha(ins, celular ? 48 : 50, estado)]), ins, estado, () => dados));
      }
    }
    if (filhos.length === 0) filhos.push(el('p', { class: 'ins-grade__vazio' }, [filtro === 'tem' ? 'Nenhuma ainda.' : 'Ganhou todas!']));
    grade.replaceChildren(...filhos);
  }

  const botoes = (['todas', 'tem', 'faltam'] as const).map((f) => {
    const b = el('button', { class: `ins-filtro${f === filtro ? ' is-on' : ''}`, type: 'button', 'aria-pressed': String(f === filtro) }, [
      { todas: 'Todas', tem: 'Tem', faltam: 'Faltam' }[f],
    ]);
    b.addEventListener('click', () => {
      filtro = f;
      for (const x of botoes) {
        const on = x === b;
        x.classList.toggle('is-on', on);
        x.setAttribute('aria-pressed', String(on));
      }
      desenhar();
    });
    return b;
  });
  desenhar();

  return el('div', { class: `ins-aba${celular ? ' ins-aba--celular' : ''}` }, [
    el('div', { class: 'ins-topo' }, [
      el('span', { class: 'ins-topo__conta' }, [String(dados.tem.size), el('small', {}, [`de ${total}`])]),
      el('span', { class: 'ins-barra ins-barra--topo' }, [el('i', { style: `width:${Math.round((dados.tem.size / total) * 100)}%` })]),
      el('span', { class: 'ins-filtros' }, botoes),
    ]),
    grade,
  ]);
}

/* ------------------------------- o aviso ----------------------------------- */

export type CantoDoAviso = 'inf-dir' | 'inf-esq' | 'sup-dir' | 'sup-esq';
const CHAVE_CANTO = 'loft:canto-insignia';

export function cantoDoAviso(): CantoDoAviso {
  try {
    const v = localStorage.getItem(CHAVE_CANTO);
    return v === 'inf-esq' || v === 'sup-dir' || v === 'sup-esq' ? v : 'inf-dir';
  } catch {
    return 'inf-dir';
  }
}

export function mudarCantoDoAviso(canto: CantoDoAviso): void {
  try {
    localStorage.setItem(CHAVE_CANTO, canto);
  } catch {
    // sem localStorage: vale até fechar
  }
}

let pilha: HTMLElement | null = null;

function pilhaDosAvisos(): HTMLElement {
  // Com as Configurações abertas (um <dialog>), o aviso vai na camada dela.
  const onde = document.querySelector('dialog[open]') ?? document.body;
  if (pilha === null || !pilha.isConnected) pilha = el('div', { class: 'ins-avisos', 'aria-live': 'polite' });
  if (pilha.parentElement !== onde) onde.append(pilha);
  pilha.dataset['canto'] = cantoDoAviso();
  return pilha;
}

/** O aviso temático de "insígnia nova", no canto escolhido (padrão: inferior direito). */
export function mostrarAvisoDeInsignia(ins: Insignia, opcoes: { mais?: number; onVer?: () => void } = {}): void {
  const r = RARIDADES[ins.raridade];
  const especial = ins.raridade === 'epica' || ins.raridade === 'lendaria';
  const confete =
    ins.raridade === 'lendaria'
      ? Array.from({ length: 18 }, (_, i) =>
          el('span', {
            class: 'ins-aviso__confete',
            style: `left:${(i % 2 ? 2 : 70) + ((i * 37) % 26)}%;top:${4 + ((i * 53) % 88)}%;background:${[r.a, '#fff', r.b, '#f472b6'][i % 4]};--giro:${(i * 47) % 180}deg;animation-delay:${(i % 6) * 60}ms`,
          }),
        )
      : [];
  const marca = el('span', { class: 'ins-aviso__marca', 'aria-hidden': 'true' });
  marca.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${DESENHOS[ins.icone] ?? ''}</svg>`;
  const fecharBtn = el('button', { class: 'ins-aviso__fechar', type: 'button', 'aria-label': 'Fechar' }, [iconEl(closeIcon(14))]);
  const ver = el('button', { class: 'ins-aviso__ver', type: 'button' }, ['Ver no perfil']);
  const aviso = el(
    'div',
    {
      class: `ins-aviso ins-aviso--${ins.raridade}`,
      role: 'status',
      style: `--c1:${r.a};--c2:${r.b};--borda:${r.a}99;--tc:${ins.raridade === 'lendaria' ? '#3a2300' : '#0b0814'}`,
    },
    [
      el('div', { class: 'ins-aviso__fundo' }),
      especial && el('div', { class: 'ins-aviso__raios' }),
      ...confete,
      marca,
      fecharBtn,
      el('div', { class: 'ins-aviso__corpo' }, [
        medalha(ins, 84),
        el('div', { class: 'ins-aviso__txt' }, [
          el('span', { class: 'ins-aviso__tag' }, [`Insígnia nova · ${r.nome}`]),
          el('b', {}, [ins.nome]),
          el('p', {}, [ins.desc]),
          (opcoes.mais ?? 0) > 0 && el('p', { class: 'ins-aviso__mais' }, [`e mais ${opcoes.mais} ${opcoes.mais === 1 ? 'insígnia' : 'insígnias'}`]),
          opcoes.onVer !== undefined && el('div', { class: 'ins-aviso__acoes' }, [ver]),
        ]),
      ]),
      el('div', { class: 'ins-aviso__barra' }),
    ],
  );
  let tempo: number | undefined;
  const fechar = (): void => {
    window.clearTimeout(tempo);
    aviso.classList.add('is-saindo');
    window.setTimeout(() => aviso.remove(), 260);
  };
  fecharBtn.addEventListener('click', fechar);
  ver.addEventListener('click', () => {
    fechar();
    opcoes.onVer?.();
  });
  // Some sozinho (a lendária fica mais); passar o mouse segura.
  const duracao = ins.raridade === 'lendaria' ? 12_000 : 8_000;
  aviso.style.setProperty('--duracao', `${duracao}ms`);
  const contar = (): void => {
    tempo = window.setTimeout(fechar, duracao);
  };
  aviso.addEventListener('pointerenter', () => {
    window.clearTimeout(tempo);
    aviso.classList.add('is-parado');
  });
  aviso.addEventListener('pointerleave', () => {
    aviso.classList.remove('is-parado');
    contar();
  });
  pilhaDosAvisos().prepend(aviso);
  contar();
}

/**
 * Liga os avisos das MINHAS insígnias: quando o carteiro grava uma nova (com
 * data depois de `avisadoAte`), mostra o aviso e marca como avisada — assim
 * aparece uma vez só, em um aparelho só.
 */
export function ligarAvisosDeInsignias(uid: string, onVer: () => void): () => void {
  let primeira = true;
  return ouvirInsignias(uid, (dados) => {
    const ate = dados.avisadoAte;
    const novas = [...dados.tem.entries()]
      .filter(([, quando]) => quando > ate)
      .map(([id]) => POR_ID.get(id))
      .filter((i): i is Insignia => i !== undefined);
    // Documento sem `avisadoAte` = primeira vez (as do histórico): marca sem avisar uma por uma.
    if (novas.length === 0) return;
    const ordem = ['lendaria', 'epica', 'rara', 'incomum', 'comum'];
    novas.sort((a, b) => ordem.indexOf(a.raridade) - ordem.indexOf(b.raridade));
    const mostrar = ate === '' && primeira ? novas.slice(0, 1) : novas.slice(0, 3);
    const resto = novas.length - mostrar.length;
    mostrar.reverse().forEach((ins, i) => mostrarAvisoDeInsignia(ins, { onVer, ...(i === mostrar.length - 1 && resto > 0 ? { mais: resto } : {}) }));
    primeira = false;
    const maisNova = [...dados.tem.values()].sort().at(-1) ?? new Date().toISOString();
    void updateDoc(doc(db, 'insignias', uid), { avisadoAte: maisNova }).catch(() => {});
  });
}
