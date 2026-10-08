/**
 * Utilitários do laboratório. Nada aqui é importado pelo app.
 */

/** Curva de saída usada em quase tudo: começa rápido e assenta devagar. */
export const SAIDA = 'cubic-bezier(0.2, 0.8, 0.2, 1)';

const consultaReduzido = window.matchMedia('(prefers-reduced-motion: reduce)');

/**
 * Movimento reduzido: o do sistema OU o interruptor do topo da página (para
 * testar sem mexer na configuração do sistema).
 */
export function movimentoReduzido(): boolean {
  return consultaReduzido.matches || document.body.classList.contains('lab-reduzido');
}

/**
 * `element.animate` com duração zero quando o movimento está reduzido — a
 * animação vira troca instantânea. O CSS cuida das `transition` do mesmo jeito
 * (ver o fim de lab.css).
 */
export function animar(
  alvo: Element,
  quadros: Keyframe[],
  ms: number,
  opcoes: { easing?: string; fill?: FillMode } = {},
): Animation {
  return alvo.animate(quadros, {
    duration: movimentoReduzido() ? 0 : ms,
    easing: opcoes.easing ?? SAIDA,
    fill: opcoes.fill ?? 'none',
  });
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  classe?: string,
  texto?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (classe !== undefined) node.className = classe;
  if (texto !== undefined) node.textContent = texto;
  return node;
}

/** A casinha do app (mesmo desenho do logo), na cor do texto ao redor. */
export function casa(tamanho: number): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${tamanho}" height="${tamanho}" ` +
    `fill="currentColor" aria-hidden="true">` +
    `<path d="M4 10 12 4l8 6v9a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1v-9Z"/></svg>`
  );
}

export function seta(tamanho: number): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${tamanho}" height="${tamanho}" ` +
    `fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">` +
    `<path d="M12 19V5M5.5 11.5 12 5l6.5 6.5"/></svg>`
  );
}

export function altoFalante(tamanho: number): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${tamanho}" height="${tamanho}" ` +
    `fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">` +
    `<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/></svg>`
  );
}

/**
 * A casinha detalhada da seção 7: chaminé, telhado, janela e porta são peças
 * separadas, para poderem acender, abrir e tremer.
 */
export function casaDetalhada(tamanho: number): string {
  return (
    `<svg class="cd" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="${tamanho}" height="${tamanho}" aria-hidden="true">` +
    `<rect x="31" y="9" width="5" height="10" rx="1" fill="#8B4A2B"/>` +
    `<rect x="9" y="21" width="30" height="21" rx="2" fill="#F4E3C8"/>` +
    `<path d="M5 23 24 8l19 15Z" fill="#C8553D" stroke="#C8553D" stroke-width="2" stroke-linejoin="round"/>` +
    `<rect class="cd-janela" x="13" y="26" width="9" height="8" rx="1.5" fill="#5B4636"/>` +
    `<path d="M17.5 26v8M13 30h9" stroke="#F4E3C8" stroke-width="1"/>` +
    `<rect x="26" y="28" width="9" height="14" rx="1" fill="#FFC35C"/>` +
    `<g class="cd-porta"><rect x="26" y="28" width="9" height="14" rx="1" fill="#8B4A2B"/>` +
    `<circle cx="33" cy="35.5" r="0.9" fill="#F4E3C8"/></g>` +
    `</svg>`
  );
}

/** Uma seção numerada da página. */
export function secao(numero: string, titulo: string, explicacao: string): { secao: HTMLElement; corpo: HTMLElement } {
  const s = el('section', 'lab-secao');
  const cabeca = el('header', 'lab-secao-topo');
  cabeca.append(el('span', 'lab-secao-num', numero), el('h2', undefined, titulo));
  const corpo = el('div', 'lab-grade');
  s.append(cabeca, el('p', 'lab-secao-texto', explicacao), corpo);
  return { secao: s, corpo };
}

/** Um cartão com etiqueta ("Botão 3") para responder por letra/número. */
export function cartao(etiqueta: string, titulo: string, descricao?: string): { cartao: HTMLElement; corpo: HTMLElement } {
  const c = el('article', 'lab-cartao');
  const topo = el('div', 'lab-cartao-topo');
  topo.append(el('span', 'lab-etiqueta', etiqueta), el('h3', undefined, titulo));
  c.append(topo);
  if (descricao !== undefined) c.append(el('p', 'lab-cartao-texto', descricao));
  const corpo = el('div', 'lab-cartao-corpo');
  c.append(corpo);
  return { cartao: c, corpo };
}
