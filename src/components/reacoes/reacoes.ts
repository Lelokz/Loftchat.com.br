import './reacoes.css';

import { el, iconEl } from '../../lib/dom';
import { alternarReacao, MAX_REACOES_POR_PESSOA } from '../../lib/firestore';
import { usouEmoji } from '../../lib/emojis';
import { addReactionIcon } from '../../lib/icons';
import { showToast } from '../toast/toast';
import { montarEmojis } from '../painel-midia/painel-midia';
import type { Member, MemberId, MessageBase } from '../../types/models';

/**
 * REAÇÕES (0.11.0, maquete aprovada).
 *
 * - Embaixo do balão: uma pílula por emoji ("👍 3"); a minha fica roxa e
 *   clicar põe/tira. Passar o mouse diz quem reagiu.
 * - Botão direito (PC) ou toque longo (celular): o menu com a fileira de
 *   emojis em cima (context-menus.ts). Passar o mouse NÃO mostra nada (o Léo
 *   pediu em 25/11: reação só pelo botão direito).
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

/* --- dados da mensagem (menu de contexto) ---------------------------------------- */

/** Os dados que a lista deixa em cada mensagem para o menu (emojis e encaminhar). */
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
