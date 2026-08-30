/**
 * Helpers mínimos de criação de DOM.
 *
 * Não é um framework: cada componente é uma função que recebe dados e devolve
 * um HTMLElement pronto. Sem estado interno, sem ciclo de vida, sem re-render.
 */

export type Attrs = Record<string, string | number | boolean | undefined>;

export type Child = Node | string | null | undefined | false;

/**
 * Cria um elemento com atributos e filhos.
 *
 * Atributo `true` vira atributo booleano vazio; `false`/`undefined` é ignorado.
 * Filhos string viram nós de texto (nunca HTML) — é o que mantém o conteúdo do
 * mock a salvo de interpretação como marcação.
 */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  children: Child[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);

  for (const [name, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    node.setAttribute(name, value === true ? '' : String(value));
  }

  append(node, children);
  return node;
}

/** Anexa filhos, pulando os vazios — deixa `cond && elemento` funcionar inline. */
export function append(parent: Element, children: Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    parent.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
}

/**
 * Envolve um SVG inline num <span>.
 *
 * `innerHTML` aqui é seguro porque a única origem possível é `lib/icons.ts`,
 * que são constantes escritas à mão neste repositório.
 */
export function iconEl(svg: string, className = 'icon'): HTMLSpanElement {
  const span = el('span', { class: className, 'aria-hidden': 'true' });
  span.innerHTML = svg;
  return span;
}

/** Avatar circular de iniciais. `size` casa com as classes em tokens/layout. */
export function avatarEl(
  text: string,
  size: 'xs' | 'sm' | 'md' | 'lg' = 'sm',
  extraClass = '',
): HTMLSpanElement {
  return el(
    'span',
    { class: `avatar avatar--${size}${extraClass ? ` ${extraClass}` : ''}`, 'aria-hidden': 'true' },
    [text],
  );
}
