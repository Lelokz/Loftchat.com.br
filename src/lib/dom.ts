/**
 * Helpers mínimos de criação de DOM.
 *
 * Não é um framework: cada componente é uma função que recebe dados e devolve
 * um HTMLElement pronto. Sem estado interno, sem ciclo de vida, sem re-render.
 */

import type { Insignia } from '../types/models';

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
/**
 * CORES DAS PESSOAS (0.7.5, visual do site): sem foto, as iniciais ficam
 * sobre uma cor só daquela pessoa, sempre a mesma (sai do id da conta).
 * Tons fortes que leem bem com letra branca em qualquer tema.
 */
const CORES_DAS_PESSOAS = ['#7b3fe4', '#c2467e', '#2f8f7a', '#c2761f', '#3d6fd1', '#b23a48', '#1f8a9e', '#8a5cf0'];

export function corDaPessoa(semente: string): string {
  let h = 0;
  for (let i = 0; i < semente.length; i++) h = (h * 31 + semente.charCodeAt(i)) >>> 0;
  return CORES_DAS_PESSOAS[h % CORES_DAS_PESSOAS.length]!;
}

export function avatarEl(
  text: string,
  size: 'xs' | 'sm' | 'md' | 'lg' | 'xl' = 'sm',
  extraClass = '',
  photo?: string,
  /** O id da pessoa (ou do grupo): dá a cor das iniciais. */
  semente?: string,
): HTMLSpanElement {
  const comFoto = photo !== undefined && photo !== '';
  const avatar = el(
    'span',
    {
      class: `avatar avatar--${size}${comFoto ? ' avatar--foto' : ''}${extraClass ? ` ${extraClass}` : ''}`,
      'aria-hidden': 'true',
    },
    // A foto já chega validada (lib/images.ts, safeImage) — e vai num `src`,
    // nunca em HTML.
    [comFoto ? el('img', { class: 'avatar__img', src: photo, alt: '', draggable: 'false' }) : text],
  );
  if (!comFoto && semente !== undefined && semente !== '') {
    avatar.classList.add('avatar--cor');
    avatar.style.backgroundColor = corDaPessoa(semente);
  }
  return avatar;
}

/** Só a cor do cargo no nome (sem o ícone) — devolve o mesmo elemento. */
export function corDoCargo<T extends HTMLElement>(nome: T, pessoa: { insignia?: Insignia | undefined }): T {
  const i = pessoa.insignia;
  if (i === undefined || i.cor === null) return nome;
  nome.classList.add('nome-cargo');
  nome.style.setProperty('--cor-cargo', i.cor.a);
  if (i.cor.b !== undefined) {
    nome.classList.add('nome-cargo--degrade');
    nome.style.setProperty('--cor-cargo-b', i.cor.b);
  }
  return nome;
}

/** Só o ícone do cargo (ou null) — para pôr logo depois do nome. */
export function iconeDoCargo(pessoa: { insignia?: Insignia | undefined }): HTMLElement | null {
  const i = pessoa.insignia;
  if (i === undefined) return null;
  const titulo = i.dono && i.icone === '👑' ? 'Dono' : (i.cargos.find((c) => c.imagem !== undefined || c.icone !== undefined)?.nome ?? '');
  if (i.imagem !== undefined) return el('img', { class: 'icone-cargo icone-cargo--img', src: i.imagem, alt: '', title: titulo, draggable: 'false' });
  if (i.icone !== undefined) return el('span', { class: 'icone-cargo', 'aria-hidden': 'true', title: titulo }, [i.icone]);
  return null;
}
