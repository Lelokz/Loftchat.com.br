/**
 * TRANSIÇÃO 1 do lab (etapa 20): a tela velha esmaece ENQUANTO a nova
 * aparece, no mesmo lugar, em 200 ms.
 *
 * O app troca de visão SUBSTITUINDO o nó (`replaceWith`/`replaceChildren`):
 * a coluna velha deixa de existir na hora, e isso não muda aqui — a troca de
 * DOM, os dados e os listeners seguem exatamente o caminho de sempre, sem
 * esperar nada. O que esta função acrescenta é um FANTASMA: uma cópia visual
 * da coluna velha, posta por cima no mesmo retângulo, que esmaece e some.
 *
 * Por que o fantasma mora num shadow root FECHADO: durante os 200 ms ele
 * teria um segundo exemplar de cada botão e texto da coluna velha. Fora do
 * shadow root, um teste que procura "o botão Enviar" acharia dois, e um leitor
 * de tela leria a tela velha junto com a nova. Dentro de um shadow root
 * fechado, nem o Playwright nem a árvore de acessibilidade enxergam a cópia,
 * e ela ainda é `inert` + `aria-hidden` por garantia. O CSS do app entra no
 * shadow root por `adoptedStyleSheets` — uma cópia das regras da página.
 *
 * Fora da transição, sempre troca instantânea:
 *  - com prefers-reduced-motion;
 *  - quando a coluna velha ou a nova é a sala de voz: vídeo de chamada e tela
 *    compartilhada não animam, e um <video> copiado nem teria o stream.
 */

/** Duração da transição 1 — exportada para quem precisa esperar o fim dela (modal.ts). */
export const TRANSICAO_MS = 200;
const CURVA = 'cubic-bezier(0.2, 0.8, 0.2, 1)';

export function movimentoReduzido(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/* As regras de CSS da página, prontas para um shadow root. */
let folha: CSSStyleSheet | null = null;
let folhaDeQuantas = -1;

function folhaDaPagina(): CSSStyleSheet {
  const fontes = Array.from(document.styleSheets);
  // Recria só quando entra folha nova (no dev, o Vite injeta uma por módulo).
  if (folha !== null && folhaDeQuantas === fontes.length) return folha;
  const texto = fontes
    .map((s) => {
      try {
        return Array.from(s.cssRules, (r) => r.cssText).join('\n');
      } catch {
        return ''; // folha de outra origem: não há nenhuma hoje, mas não quebra
      }
    })
    .join('\n');
  const nova = new CSSStyleSheet();
  nova.replaceSync(texto);
  folha = nova;
  folhaDeQuantas = fontes.length;
  return nova;
}

function envolveSala(no: Element): boolean {
  return no.matches('.room') || no.querySelector('.room, video') !== null;
}

/** Posições de rolagem da coluna velha, na ordem do documento. */
function lerRolagens(raiz: HTMLElement): Array<[number, number, number]> {
  const lidas: Array<[number, number, number]> = [];
  const todos = [raiz, ...Array.from(raiz.querySelectorAll<HTMLElement>('*'))];
  todos.forEach((no, i) => {
    if (no.scrollTop !== 0 || no.scrollLeft !== 0) lidas.push([i, no.scrollTop, no.scrollLeft]);
  });
  return lidas;
}

function aplicarRolagens(raiz: HTMLElement, rolagens: Array<[number, number, number]>): void {
  if (rolagens.length === 0) return;
  const todos = [raiz, ...Array.from(raiz.querySelectorAll<HTMLElement>('*'))];
  for (const [i, topo, esquerda] of rolagens) {
    const no = todos[i];
    if (no === undefined) continue;
    no.scrollTop = topo;
    no.scrollLeft = esquerda;
  }
}

/**
 * Fotografa `velho` (cópia + rolagens + retângulo) ANTES da troca e devolve a
 * função que, chamada DEPOIS da troca, põe o fantasma na tela e o esmaece.
 * `null` quando não há o que fotografar (nó fora da tela ou de tamanho zero).
 */
function fotografar(velho: HTMLElement): (() => void) | null {
  const ret = velho.getBoundingClientRect();
  if (ret.width === 0 || ret.height === 0) return null;
  const rolagens = lerRolagens(velho);
  const copia = velho.cloneNode(true) as HTMLElement;

  return () => {
    const fantasma = document.createElement('div');
    fantasma.className = 'view-ghost';
    fantasma.setAttribute('aria-hidden', 'true');
    fantasma.inert = true;
    fantasma.style.left = `${ret.left}px`;
    fantasma.style.top = `${ret.top}px`;
    fantasma.style.width = `${ret.width}px`;
    fantasma.style.height = `${ret.height}px`;

    const sombra = fantasma.attachShadow({ mode: 'closed' });
    sombra.adoptedStyleSheets = [folhaDaPagina()];
    copia.hidden = false;
    copia.style.width = `${ret.width}px`;
    copia.style.height = `${ret.height}px`;
    sombra.append(copia);
    document.body.append(fantasma);
    aplicarRolagens(copia, rolagens);

    const saida = fantasma.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: TRANSICAO_MS,
      easing: CURVA,
      fill: 'forwards',
    });
    const remover = (): void => fantasma.remove();
    saida.finished.then(remover, remover);
  };
}

function semTransicao(velho: HTMLElement, novo: HTMLElement): boolean {
  return !velho.isConnected || movimentoReduzido() || envolveSala(velho) || envolveSala(novo);
}

/**
 * Troca `velho` por `novo` (`trocar` faz a troca de DOM) com a transição
 * cruzada. A troca acontece SEMPRE, na hora, antes de qualquer animação.
 */
export function trocarComTransicao(velho: HTMLElement | null, novo: HTMLElement, trocar: () => void): void {
  if (velho === null || velho === novo || semTransicao(velho, novo)) {
    trocar();
    return;
  }
  const mostrarFantasma = fotografar(velho);
  trocar();
  if (mostrarFantasma === null) return;
  mostrarFantasma();
  novo.animate([{ opacity: 0 }, { opacity: 1 }], { duration: TRANSICAO_MS, easing: CURVA });
}

/**
 * Mesma transição quando a CAIXA fica e só o conteúdo dela muda (as abas da
 * tela inicial: `.friends__body` rola, e o conteúdo pode ser mais alto que a
 * área visível — o fantasma tem que ser a caixa, recortada como na tela).
 */
export function trocarConteudoComTransicao(caixa: HTMLElement, trocar: () => void): void {
  if (semTransicao(caixa, caixa)) {
    trocar();
    return;
  }
  const mostrarFantasma = fotografar(caixa);
  trocar();
  if (mostrarFantasma === null) return;
  mostrarFantasma();
  caixa.animate([{ opacity: 0 }, { opacity: 1 }], { duration: TRANSICAO_MS, easing: CURVA });
}

/**
 * A SAÍDA de um modal (transição 1). O <dialog> sai do DOM no instante em que
 * fecha — como sempre saiu: quem procura "o diálogo" logo depois de fechar um
 * e abrir outro (o painel de diagnóstico, os testes) acha um só. O que
 * esmaece é um fantasma dele, com o véu, fotografado ANTES de fechar (fechado,
 * ele já não tem tamanho na tela).
 *
 * Devolve a função que mostra o fantasma, para chamar depois de fechar; `null`
 * com movimento reduzido ou sem nada visível.
 */
export function prepararSaidaDeModal(dialog: HTMLDialogElement): (() => void) | null {
  if (movimentoReduzido() || !dialog.open) return null;
  const ret = dialog.getBoundingClientRect();
  if (ret.width === 0 || ret.height === 0) return null;
  const rolagens = lerRolagens(dialog);
  const copia = dialog.cloneNode(true) as HTMLElement;

  return () => {
    const fantasma = document.createElement('div');
    fantasma.className = 'view-ghost view-ghost--modal';
    fantasma.setAttribute('aria-hidden', 'true');
    fantasma.inert = true;
    fantasma.style.left = '0px';
    fantasma.style.top = '0px';
    fantasma.style.width = `${window.innerWidth}px`;
    fantasma.style.height = `${window.innerHeight}px`;

    const sombra = fantasma.attachShadow({ mode: 'closed' });
    sombra.adoptedStyleSheets = [folhaDaPagina()];
    const veu = document.createElement('div');
    veu.className = 'modal-ghost-veil';
    copia.setAttribute('open', '');
    copia.classList.add('modal-ghost');
    copia.style.left = `${ret.left}px`;
    copia.style.top = `${ret.top}px`;
    copia.style.width = `${ret.width}px`;
    copia.style.height = `${ret.height}px`;
    sombra.append(veu, copia);
    document.body.append(fantasma);
    aplicarRolagens(copia, rolagens);

    const saida = fantasma.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: TRANSICAO_MS,
      easing: CURVA,
      fill: 'forwards',
    });
    const remover = (): void => fantasma.remove();
    saida.finished.then(remover, remover);
  };
}
