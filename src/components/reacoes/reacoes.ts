import './reacoes.css';

import { el, iconEl } from '../../lib/dom';
import { alternarReacao, MAX_REACOES_POR_PESSOA } from '../../lib/firestore';
import { usouEmoji } from '../../lib/emojis';
import { addReactionIcon, encaminharIcon, moreIcon, replyIcon } from '../../lib/icons';
import { showToast } from '../toast/toast';
import { montarEmojis } from '../painel-midia/painel-midia';
import type { Member, MemberId, MessageBase } from '../../types/models';

/**
 * REAÇÕES (0.11.0, maquete aprovada).
 *
 * - Embaixo do balão: uma pílula por emoji ("👍 3"); a minha fica roxa e
 *   clicar põe/tira. Passar o mouse diz quem reagiu.
 * - PC: passar o mouse na mensagem mostra a barrinha (👍 ❤️ 😂 🔥, todos
 *   os emojis, Responder, Encaminhar, ⋯).
 * - Celular: o toque longo abre o menu com a fileira de emojis em cima
 *   (context-menus.ts).
 *
 * Os dados vêm na própria mensagem (`reacoes`: uid → emojis); a regra do
 * banco deixa cada um mexer só na sua.
 */

export const RAPIDAS = ['👍', '❤️', '😂', '🔥'];
export const RAPIDAS_CELULAR = ['👍', '❤️', '😂', '😮', '😢', '🔥'];

export interface CtxReacoes {
  eu: MemberId;
  tipo: 'pv' | 'grupo';
  pessoas: Map<MemberId, Member>;
}

/** O cargo deixa reagir neste canal? (o app liga; no PV, sempre.) */
let podeReagirNoCanal: (canal: string) => boolean = () => true;
export function definirPermissaoDeReagir(f: (canal: string) => boolean): void {
  podeReagirNoCanal = f;
}
export function podeReagir(tipo: 'pv' | 'grupo', canal: string | undefined): boolean {
  return tipo === 'pv' || canal === undefined || podeReagirNoCanal(canal);
}

/** Põe/tira a minha reação, com os avisos de limite e de erro. */
export function reagir(tipo: 'pv' | 'grupo', mensagem: string, eu: string, minhas: string[], emoji: string): void {
  const tirar = minhas.includes(emoji);
  if (!tirar && minhas.length >= MAX_REACOES_POR_PESSOA) {
    showToast(`Dá para pôr até ${MAX_REACOES_POR_PESSOA} reações numa mensagem.`);
    return;
  }
  if (!tirar) usouEmoji(emoji);
  void alternarReacao(tipo, mensagem, eu, emoji, !tirar).catch(() => showToast('Não deu para reagir. Tente de novo.'));
}

/** As reações da mensagem agrupadas por emoji, na ordem em que apareceram. */
function agrupar(m: MessageBase): { emoji: string; quem: string[] }[] {
  const grupos = new Map<string, string[]>();
  for (const [uid, emojis] of Object.entries(m.reacoes ?? {})) {
    for (const e of emojis) grupos.set(e, [...(grupos.get(e) ?? []), uid]);
  }
  return [...grupos.entries()].map(([emoji, quem]) => ({ emoji, quem }));
}

function nomes(quem: string[], ctx: CtxReacoes): string {
  const outros = quem.filter((u) => u !== ctx.eu).map((u) => ctx.pessoas.get(u)?.displayName ?? 'Alguém');
  const lista = quem.includes(ctx.eu) ? [...outros, 'você'] : outros;
  if (lista.length <= 1) return lista.join('');
  if (lista.length <= 4) return `${lista.slice(0, -1).join(', ')} e ${lista[lista.length - 1]}`;
  return `${lista.slice(0, 3).join(', ')} e mais ${lista.length - 3}`;
}

/** As pílulas embaixo do balão (ou nada, sem reações). */
export function renderReacoes(m: MessageBase, ctx: CtxReacoes): HTMLElement | false {
  const grupos = agrupar(m);
  if (grupos.length === 0) return false;
  const canal = (m as { channelId?: string }).channelId;
  const pode = podeReagir(ctx.tipo, canal);
  const minhas = m.reacoes?.[ctx.eu] ?? [];
  const pilulas = grupos.map(({ emoji, quem }) => {
    const minha = quem.includes(ctx.eu);
    const quemReagiu = `${nomes(quem, ctx)} ${quem.length === 1 && !minha ? 'reagiu' : 'reagiram'} com ${emoji}`;
    const b = el(
      'button',
      {
        class: `reacao${minha ? ' is-minha' : ''}`,
        type: 'button',
        'aria-pressed': String(minha),
        'aria-label': `${quemReagiu}${pode ? minha ? '. Toque para tirar a sua.' : '. Toque para reagir também.' : ''}`,
        'data-dica': quemReagiu,
      },
      [el('span', { class: 'reacao__emoji emoji' }, [emoji]), el('span', { class: 'reacao__n' }, [String(quem.length)])],
    );
    if (pode) b.addEventListener('click', () => reagir(ctx.tipo, m.id, ctx.eu, minhas, emoji));
    else b.disabled = true;
    return b;
  });
  const mais = pode
    ? (() => {
        const b = el('button', { class: 'reacao reacao--mais', type: 'button', title: 'Reagir', 'aria-label': 'Reagir com outro emoji' }, [
          iconEl(addReactionIcon(16)),
        ]);
        b.addEventListener('click', () => abrirSeletorDeReacao(b.getBoundingClientRect(), (e) => reagir(ctx.tipo, m.id, ctx.eu, minhas, e)));
        return b;
      })()
    : false;
  return el('div', { class: 'reacoes' }, [...pilulas, mais]);
}

/* --- o seletor com todos os emojis ------------------------------------------------ */

let seletorAberto: (() => void) | null = null;

export function abrirSeletorDeReacao(perto: DOMRect, aoEscolher: (emoji: string) => void): void {
  seletorAberto?.();
  const caixa = el('div', { class: 'painel reacoes__seletor', role: 'dialog', 'aria-label': 'Escolher reação' }, [
    montarEmojis((e) => {
      fechar();
      aoEscolher(e);
    }),
  ]);
  document.body.append(caixa);
  // Cabe na tela: em cima de onde clicou, senão embaixo; nunca para fora.
  const larg = caixa.offsetWidth;
  const alt = caixa.offsetHeight;
  const x = Math.max(8, Math.min(innerWidth - larg - 8, perto.right - larg));
  const y = perto.top - alt - 8 >= 8 ? perto.top - alt - 8 : Math.min(innerHeight - alt - 8, perto.bottom + 8);
  caixa.style.left = `${x}px`;
  caixa.style.top = `${y}px`;
  caixa.querySelector<HTMLInputElement>('input')?.focus();

  const fora = (e: Event): void => {
    if (!caixa.contains(e.target as Node)) fechar();
  };
  const esc = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') fechar();
  };
  function fechar(): void {
    caixa.remove();
    document.removeEventListener('mousedown', fora, true);
    document.removeEventListener('touchstart', fora, true);
    document.removeEventListener('keydown', esc, true);
    if (seletorAberto === fechar) seletorAberto = null;
  }
  setTimeout(() => {
    document.addEventListener('mousedown', fora, true);
    document.addEventListener('touchstart', fora, true);
    document.addEventListener('keydown', esc, true);
  });
  seletorAberto = fechar;
}

/* --- a barrinha do PC (passar o mouse na mensagem) -------------------------------- */

export interface AcoesDaBarra {
  eu: () => string;
  responder: (li: HTMLElement) => void;
  encaminhar: (li: HTMLElement) => void;
  /** Abre o menu da mensagem (o "⋯"). */
  menu: (li: HTMLElement, onde: { x: number; y: number }) => void;
}

/** Os dados que a lista deixa em cada mensagem para a barrinha. */
export function dadosDaMensagem(li: HTMLElement): { id: string; tipo: 'pv' | 'grupo'; canal: string | undefined; minhas: string[] } {
  let minhas: string[] = [];
  try {
    minhas = JSON.parse(li.dataset['minhas'] ?? '[]') as string[];
  } catch {
    // vazio
  }
  return {
    id: li.dataset['messageId'] ?? '',
    tipo: li.dataset['context'] === 'dm-message' ? 'pv' : 'grupo',
    canal: li.dataset['canal'],
    minhas,
  };
}

/** Liga a barrinha (só com mouse). Devolve como desligar. */
export function instalarBarraDeReacoes(acoes: AcoesDaBarra): () => void {
  const mouse = matchMedia('(hover: hover) and (pointer: fine)');
  let alvo: HTMLElement | null = null;
  const botao = (conteudo: Node, rotulo: string, f: () => void): HTMLElement => {
    const b = el('button', { type: 'button', title: rotulo, 'aria-label': rotulo }, [conteudo]);
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      if (alvo !== null) f();
    });
    return b;
  };
  const rapidas = RAPIDAS.map((emoji) =>
    botao(el('span', { class: 'emoji' }, [emoji]), `Reagir com ${emoji}`, () => {
      const d = dadosDaMensagem(alvo!);
      reagir(d.tipo, d.id, acoes.eu(), d.minhas, emoji);
    }),
  );
  const todos = botao(iconEl(addReactionIcon(19)), 'Reagir com outro emoji', () => {
    const d = dadosDaMensagem(alvo!);
    abrirSeletorDeReacao(todos.getBoundingClientRect(), (e) => reagir(d.tipo, d.id, acoes.eu(), d.minhas, e));
  });
  const separador = el('i', { 'aria-hidden': 'true' });
  const barra = el('div', { class: 'barra-da-mensagem', role: 'toolbar', 'aria-label': 'Ações da mensagem' }, [
    ...rapidas,
    todos,
    separador,
    botao(iconEl(replyIcon(18)), 'Responder', () => acoes.responder(alvo!)),
    botao(iconEl(encaminharIcon(18)), 'Encaminhar', () => acoes.encaminhar(alvo!)),
    botao(iconEl(moreIcon(18)), 'Mais', () => {
      const r = barra.getBoundingClientRect();
      acoes.menu(alvo!, { x: r.right - 20, y: r.bottom + 4 });
    }),
  ]);
  barra.hidden = true;
  document.body.append(barra);

  const posicionar = (): void => {
    if (alvo === null || !alvo.isConnected) {
      esconder();
      return;
    }
    const bolha = alvo.querySelector<HTMLElement>('.message__bubble') ?? alvo;
    const r = bolha.getBoundingClientRect();
    const mine = alvo.classList.contains('message--mine');
    barra.hidden = false;
    const larg = barra.offsetWidth;
    // Balão curto: a barrinha não pode tampar o nome de quem mandou (clicar abre o perfil).
    const nome = alvo.querySelector<HTMLElement>('.message__author')?.getBoundingClientRect();
    const x = mine ? r.left - larg + 40 : Math.max(r.right - 40, nome === undefined ? 0 : nome.right + 8);
    barra.style.left = `${Math.max(8, Math.min(innerWidth - larg - 8, x))}px`;
    barra.style.top = `${Math.max(8, r.top - barra.offsetHeight + 8)}px`;
  };
  function esconder(): void {
    alvo?.classList.remove('is-com-barra');
    alvo = null;
    barra.hidden = true;
  }
  const sobre = (e: MouseEvent): void => {
    if (!mouse.matches) return;
    if (barra.contains(e.target as Node)) return;
    const li = (e.target as HTMLElement | null)?.closest<HTMLElement>('.message[data-message-id]');
    if (li === null || li === undefined || li.querySelector('.message__editor') !== null) {
      if (li === null) esconder();
      return;
    }
    if (li === alvo) return;
    alvo?.classList.remove('is-com-barra');
    alvo = li;
    li.classList.add('is-com-barra');
    // Sem "Reagir" no cargo: a barrinha fica só com Responder/Encaminhar/⋯.
    const d = dadosDaMensagem(li);
    const pode = podeReagir(d.tipo, d.canal);
    for (const b of [...rapidas, todos, separador]) b.hidden = !pode;
    posicionar();
  };
  const sair = (e: MouseEvent): void => {
    const para = e.relatedTarget as Node | null;
    if (para !== null && (barra.contains(para) || alvo?.contains(para))) return;
    if (para === null || !(para instanceof Element) || para.closest('.message[data-message-id]') === null) esconder();
  };
  document.addEventListener('mouseover', sobre);
  document.addEventListener('mouseout', sair);
  document.addEventListener('scroll', esconder, true);
  return () => {
    document.removeEventListener('mouseover', sobre);
    document.removeEventListener('mouseout', sair);
    document.removeEventListener('scroll', esconder, true);
    barra.remove();
  };
}
