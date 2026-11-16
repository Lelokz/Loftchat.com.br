/**
 * ARRASTAR PARA ORDENAR uma lista (etapa 4a): as abas dos grupos na barra de
 * cima (eixo x) e a lista de grupos nas Configurações (eixo y).
 *
 * O próprio item anda pela lista enquanto arrasta; ao soltar, `onDrop`
 * recebe os ids na ordem nova. Os movimentos são ouvidos no DOCUMENTO (mover
 * o item no DOM solta a captura do ponteiro — lição da etapa 3b).
 *
 * `threshold`: só vira arrasto depois de andar N pixels — assim um clique
 * normal na aba continua sendo clique. Se arrastou, o clique que vem depois
 * do soltar é engolido.
 */
export interface DragSortOptions {
  container: HTMLElement;
  /** O que anda (ex.: 'li[data-sort-id]'). */
  itemSelector: string;
  /** Onde se segura. Ausente = o item inteiro. */
  handleSelector?: string;
  axis: 'x' | 'y';
  threshold?: number;
  /** Só mouse (a barra de cima no celular rola com o dedo; lá se ordena nas Configurações). */
  mouseOnly?: boolean;
  onDrop: (ids: string[]) => void;
}

export function enableDragSort(options: DragSortOptions): void {
  const { container, itemSelector, handleSelector, axis, onDrop } = options;
  const limiar = options.threshold ?? 0;

  container.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    if (options.mouseOnly === true && event.pointerType !== 'mouse') return;
    const alvo = event.target as Element;
    const pega = handleSelector === undefined ? alvo.closest(itemSelector) : alvo.closest(handleSelector);
    if (pega === null || !container.contains(pega)) return;
    const item = pega.closest<HTMLElement>(itemSelector);
    // Só os itens DESTA lista: com uma lista dentro da outra (pasta aberta na
    // barra), cada uma cuida dos seus — senão as duas arrastariam juntas.
    if (item === null || item.parentElement !== container) return;
    if (handleSelector !== undefined) event.preventDefault();

    const inicio = { x: event.clientX, y: event.clientY };
    let arrastando = false;
    const lista = container;

    const mover = (e: PointerEvent): void => {
      if (!arrastando) {
        const andou = axis === 'x' ? Math.abs(e.clientX - inicio.x) : Math.abs(e.clientY - inicio.y);
        if (andou < limiar) return;
        arrastando = true;
        item.classList.add('is-dragging');
        document.body.classList.add('is-drag-sorting');
      }
      const p = axis === 'x' ? e.clientX : e.clientY;
      const outros = [...lista.querySelectorAll<HTMLElement>(`:scope > ${itemSelector}`)].filter((o) => o !== item);
      const depois = outros.find((o) => {
        const r = o.getBoundingClientRect();
        return p < (axis === 'x' ? r.left + r.width / 2 : r.top + r.height / 2);
      });
      if (depois === undefined) {
        const ultimo = outros[outros.length - 1];
        if (ultimo !== undefined && ultimo.nextElementSibling !== item) ultimo.after(item);
      } else if (depois.previousElementSibling !== item) {
        lista.insertBefore(item, depois);
      }
    };
    const soltar = (): void => {
      document.removeEventListener('pointermove', mover);
      document.removeEventListener('pointerup', soltar);
      document.removeEventListener('pointercancel', soltar);
      if (!arrastando) return;
      item.classList.remove('is-dragging');
      document.body.classList.remove('is-drag-sorting');
      // O clique que o navegador dispara ao soltar NÃO é um clique na aba.
      const engolir = (c: Event): void => {
        c.stopPropagation();
        c.preventDefault();
      };
      container.addEventListener('click', engolir, { capture: true, once: true });
      window.setTimeout(() => container.removeEventListener('click', engolir, { capture: true }), 0);
      const ids = [...lista.querySelectorAll<HTMLElement>(`:scope > ${itemSelector}`)].map((o) => o.dataset['sortId'] ?? '');
      onDrop(ids.filter((id) => id !== ''));
    };
    document.addEventListener('pointermove', mover);
    document.addEventListener('pointerup', soltar);
    document.addEventListener('pointercancel', soltar);
  });
}
