/**
 * Em que modo a interface está: desktop ou mobile.
 *
 * O NÚMERO DO BREAKPOINT NÃO ESTÁ AQUI, e isso é a decisão central desta
 * etapa. Ele existe em UM lugar só — a media query em `styles/layout.css` —, e o
 * CSS publica o resultado numa variável:
 *
 *     :root                      { --layout: desktop; }
 *     @media (max-width: 720px)  { :root { --layout: mobile; } }
 *
 * O JS só lê. Repetir `720` aqui criaria duas verdades que desincronizam no dia
 * em que alguém mudar uma delas — e o sintoma seria layout de mobile com
 * comportamento de desktop, ou o contrário.
 *
 * O layout em si é feito PELA media query, não por este módulo: o DOM é o mesmo
 * nos dois modos. É por isso que atravessar o breakpoint no meio de uma chamada
 * de voz não derruba nada — não há componente para desmontar, só CSS mudando de
 * ideia sobre onde as coisas ficam.
 */

export type LayoutMode = 'desktop' | 'mobile';

export function currentLayout(): LayoutMode {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue('--layout')
    .trim();
  return value === 'mobile' ? 'mobile' : 'desktop';
}

export const isMobileLayout = (): boolean => currentLayout() === 'mobile';

/**
 * Avisa quando o modo MUDA — nunca a cada pixel redimensionado.
 *
 * Devolve a função que desliga.
 */
export function onLayoutChange(listener: (mode: LayoutMode) => void): () => void {
  let last = currentLayout();

  const check = (): void => {
    const now = currentLayout();
    if (now === last) return;
    last = now;
    listener(now);
  };

  const observer = new ResizeObserver(check);
  observer.observe(document.documentElement);
  return () => observer.disconnect();
}

/* -------------------------------------------------------------------------- */
/* Altura real da janela, com o teclado aberto                                 */
/* -------------------------------------------------------------------------- */

/**
 * Publica `--app-height` com a altura VISÍVEL da janela.
 *
 * `100dvh` não é confiável quando o teclado do celular abre: em boa parte dos
 * navegadores ele continua contando a área que o teclado cobriu, e a barra de
 * composição some atrás dele. A `visualViewport` sabe a altura de verdade.
 *
 * Só a media query mobile usa esta variável — o desktop segue em `100dvh`,
 * intocado.
 */
export function trackViewportHeight(onResize?: () => void): () => void {
  const viewport = window.visualViewport;
  if (viewport === null || viewport === undefined) return () => {};

  const apply = (): void => {
    document.documentElement.style.setProperty('--app-height', `${viewport.height}px`);
    onResize?.();
  };

  apply();
  viewport.addEventListener('resize', apply);
  viewport.addEventListener('scroll', apply);
  return () => {
    viewport.removeEventListener('resize', apply);
    viewport.removeEventListener('scroll', apply);
    document.documentElement.style.removeProperty('--app-height');
  };
}
