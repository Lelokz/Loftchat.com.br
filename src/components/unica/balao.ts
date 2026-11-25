import './unica.css';

import { el, iconEl } from '../../lib/dom';
import { unicaIcon } from '../../lib/icons';
import { ouvirUnicas, PRAZO_DA_UNICA_MS, quemAbriu, vezesQueAbri } from '../../lib/unicas';
import type { Member, MemberId, MessageBase } from '../../types/models';
import { abrirTelaUnica } from './ver';

/**
 * O BALÃO DA VISUALIZAÇÃO ÚNICA (0.10.0, maquete aprovada). Nada da foto
 * aparece: só o símbolo "1", "Foto"/"Vídeo" e o estado.
 *
 * Quem recebeu: "toque para ver (3 vezes)" → "Aberta" (acabaram as vezes).
 * Quem mandou:  PV "ainda não abriu" / "Lucas abriu"; grupo "vista por Ana e Gabriel".
 *
 * O balão se atualiza sozinho quando a contagem muda (lib/unicas.ts), sem
 * redesenhar a conversa.
 */
export interface BalaoUnicaCtx {
  eu: MemberId;
  tipo: 'pv' | 'grupo';
  pessoas: Map<MemberId, Member>;
}

const dados = new WeakMap<HTMLElement, { m: MessageBase; ctx: BalaoUnicaCtx }>();

function nomeDe(pessoas: Map<MemberId, Member>, uid: string): string {
  return pessoas.get(uid)?.displayName ?? 'Alguém';
}

function juntar(nomes: string[]): string {
  if (nomes.length <= 2) return nomes.join(' e ');
  return `${nomes.slice(0, 2).join(', ')} e mais ${nomes.length - 2}`;
}

function preencher(balao: HTMLElement): void {
  const d = dados.get(balao);
  if (d === undefined) return;
  const { m, ctx } = d;
  const vezes = m.unica?.vezes ?? 1;
  const tipoNome = m.kind === 'video' ? 'Vídeo' : 'Foto';
  const expirou = Date.now() - Date.parse(m.sentAt) > PRAZO_DA_UNICA_MS;
  let titulo = tipoNome;
  let sub: string;
  let gasta = false;
  let abre = false;

  if (m.authorId === ctx.eu) {
    const quem = [...quemAbriu(m.id).keys()].filter((u) => u !== ctx.eu);
    if (ctx.tipo === 'pv') sub = quem.length > 0 ? `${nomeDe(ctx.pessoas, quem[0]!)} abriu` : 'ainda não abriu';
    else sub = quem.length > 0 ? `vista por ${juntar(quem.map((u) => nomeDe(ctx.pessoas, u)))}` : 'ninguém abriu ainda';
    sub = `Visualização única · ${sub}`;
    if (expirou) {
      gasta = true;
      sub = `${tipoNome} de visualização única · expirou`;
      titulo = 'Expirou';
    }
  } else {
    const sobram = vezes - vezesQueAbri(m.id);
    if (expirou && sobram > 0) {
      gasta = true;
      titulo = 'Expirou';
      sub = `${tipoNome} de visualização única`;
    } else if (sobram <= 0) {
      gasta = true;
      titulo = 'Aberta';
      sub = `${tipoNome} de visualização única`;
    } else {
      abre = true;
      sub = `Visualização única · toque para ver (${sobram} ${sobram === 1 ? 'vez' : 'vezes'})`;
    }
  }

  balao.classList.toggle('is-gasta', gasta);
  balao.classList.toggle('is-abre', abre);
  if (abre) {
    balao.setAttribute('role', 'button');
    balao.setAttribute('tabindex', '0');
  } else {
    balao.removeAttribute('role');
    balao.removeAttribute('tabindex');
  }
  balao.querySelector('.unica-balao__titulo')!.textContent = titulo;
  balao.querySelector('.unica-balao__sub')!.textContent = sub;
}

ouvirUnicas(() => {
  for (const b of document.querySelectorAll<HTMLElement>('.unica-balao')) preencher(b);
});

export function renderBalaoUnica(m: MessageBase, ctx: BalaoUnicaCtx): HTMLElement {
  const balao = el('div', { class: 'unica-balao', 'data-unica': m.id }, [
    el('span', { class: 'unica-balao__icone', 'aria-hidden': 'true' }, [iconEl(unicaIcon(22))]),
    el('span', { class: 'unica-balao__textos' }, [el('b', { class: 'unica-balao__titulo' }), el('small', { class: 'unica-balao__sub' })]),
  ]);
  dados.set(balao, { m, ctx });
  preencher(balao);
  const abrir = (): void => {
    if (!balao.classList.contains('is-abre')) return;
    const autor = ctx.pessoas.get(m.authorId);
    abrirTelaUnica({
      tipo: ctx.tipo,
      id: m.id,
      video: m.kind === 'video',
      legenda: m.body,
      autor: { uid: m.authorId, nome: autor?.displayName ?? 'Alguém', initials: autor?.initials ?? '?', photo: autor?.photo },
      sentAt: m.sentAt,
    });
  };
  balao.addEventListener('click', abrir);
  balao.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      abrir();
    }
  });
  return balao;
}
