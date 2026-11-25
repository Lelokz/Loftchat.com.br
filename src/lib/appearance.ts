/**
 * APARÊNCIA PESSOAL (proposta A, etapa 5) — como o Loft fica NA MINHA TELA.
 *
 * Mora em `userPrivate/{uid}.appearance` (só eu leio), escutada ao vivo: mudar
 * no PC muda no celular. Uma cópia fica no aparelho (localStorage) só para o
 * app já abrir no tema certo, sem piscar o roxo padrão antes do login.
 *
 * Tudo aqui é LISTA FECHADA, menos a cor de destaque livre — e essa só entra
 * como `#rrggbb`, nunca como texto qualquer dentro do CSS.
 *
 * Os temas em si (as cores) estão em tokens.css, em `:root[data-tema=...]`.
 * Este arquivo só escolhe qual vale e calcula as variantes da cor livre.
 */

export const THEME_IDS = ['noite', 'breu', 'oceano', 'floresta', 'claro'] as const;
export type ThemeId = (typeof THEME_IDS)[number];

export const THEME_LABELS: Record<ThemeId, string> = {
  noite: 'Noite (padrão)',
  breu: 'Breu',
  oceano: 'Oceano',
  floresta: 'Floresta',
  claro: 'Claro',
};

/**
 * O fundo do chat de cada tema — o mesmo de tokens.css. Só serve para medir
 * o contraste do texto em destaque quando a cor é livre.
 */
const CHAT_DE: Record<ThemeId, string> = {
  noite: '#140f26',
  breu: '#07060b',
  oceano: '#0b1825',
  floresta: '#0c1a15',
  claro: '#faf9fd',
};

/** Cores de destaque prontas (além de "a do tema" e da livre). */
export const ACCENT_PRESETS: { label: string; hex: string }[] = [
  { label: 'Roxo', hex: '#7b3fe4' },
  { label: 'Azul', hex: '#2f6fd8' },
  { label: 'Verde', hex: '#1a8562' },
  { label: 'Rosa', hex: '#c2346f' },
  { label: 'Laranja', hex: '#b85c12' },
  { label: 'Vermelho', hex: '#c4323d' },
];

export const APP_FONT_IDS = ['nunito', 'leitura', 'sistema', 'classica'] as const;
export type AppFontId = (typeof APP_FONT_IDS)[number];

export const APP_FONTS: Record<AppFontId, { label: string; family: string }> = {
  nunito: { label: 'Nunito (padrão)', family: 'var(--font-nunito)' },
  leitura: {
    label: 'Leitura fácil',
    family: "'Atkinson Hyperlegible Next', system-ui, -apple-system, 'Segoe UI', Roboto, Arial, 'Noto Color Emoji', sans-serif",
  },
  sistema: { label: 'Do sistema', family: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Color Emoji', sans-serif" },
  classica: { label: 'Clássica', family: "'Lora', Georgia, 'Noto Color Emoji', serif" },
};

/** Tamanho do texto das mensagens, em px. */
export const TEXT_SIZES = [12, 13, 14, 15, 16, 18, 20] as const;
export const DEFAULT_TEXT_SIZE = 14;

export const MESSAGE_STYLES = ['baloes', 'lista'] as const;
export type MessageStyle = (typeof MESSAGE_STYLES)[number];
export const MY_SIDES = ['direita', 'esquerda'] as const;
export type MySide = (typeof MY_SIDES)[number];
export const DENSITIES = ['confortavel', 'compacto'] as const;
export type Density = (typeof DENSITIES)[number];

/** As abas do painel da direita do grupo (o mesmo `AbaDoPainel` do group-panel). */
export const PANEL_TABS = ['agora', 'membros', 'midia', 'fixadas'] as const;
export type PanelTab = (typeof PANEL_TABS)[number];

export interface Appearance {
  theme: ThemeId;
  /** '' = a cor do tema; senão `#rrggbb`. */
  accent: string;
  font: AppFontId;
  textSize: number;
  /** Etapa 5b: balões ou lista; o lado das MINHAS (só nos balões); o ar entre elas. */
  messageStyle: MessageStyle;
  mySide: MySide;
  density: Density;
  /** Etapa 5d: painel da direita escondido no computador; quais abas; qual abre primeiro. */
  panelHidden: boolean;
  panelTabs: PanelTab[];
  panelFirst: PanelTab;
  /** Etapa 8b: o chat da sala de voz no painel da direita (ligado = aparece e carrega). */
  roomChat: boolean;
}

export const DEFAULT_APPEARANCE: Appearance = {
  theme: 'noite',
  accent: '',
  font: 'nunito',
  textSize: DEFAULT_TEXT_SIZE,
  messageStyle: 'baloes',
  mySide: 'direita',
  density: 'confortavel',
  panelHidden: false,
  panelTabs: [...PANEL_TABS],
  panelFirst: 'membros',
  roomChat: true,
};

const HEX_RE = /^#[0-9a-f]{6}$/;

/** Lê o que veio do banco (ou do aparelho) com cuidado: o que não presta vira o padrão. */
export function parseAppearance(raw: unknown): Appearance {
  if (typeof raw !== 'object' || raw === null) return { ...DEFAULT_APPEARANCE };
  const r = raw as Record<string, unknown>;
  const accent = typeof r['accent'] === 'string' ? r['accent'].toLowerCase() : '';
  const size = r['textSize'];
  return {
    theme: THEME_IDS.includes(r['theme'] as ThemeId) ? (r['theme'] as ThemeId) : 'noite',
    accent: HEX_RE.test(accent) ? accent : '',
    font: APP_FONT_IDS.includes(r['font'] as AppFontId) ? (r['font'] as AppFontId) : 'nunito',
    textSize: TEXT_SIZES.includes(size as (typeof TEXT_SIZES)[number]) ? (size as number) : DEFAULT_TEXT_SIZE,
    messageStyle: MESSAGE_STYLES.includes(r['messageStyle'] as MessageStyle) ? (r['messageStyle'] as MessageStyle) : 'baloes',
    mySide: MY_SIDES.includes(r['mySide'] as MySide) ? (r['mySide'] as MySide) : 'direita',
    density: DENSITIES.includes(r['density'] as Density) ? (r['density'] as Density) : 'confortavel',
    ...painel(r),
    roomChat: r['roomChat'] !== false,
  };
}

/** As abas na ordem de sempre, sem repetir; nenhuma válida = todas. A primeira tem de estar entre elas. */
function painel(r: Record<string, unknown>): Pick<Appearance, 'panelHidden' | 'panelTabs' | 'panelFirst'> {
  const lidas = Array.isArray(r['panelTabs']) ? [...(r['panelTabs'] as unknown[])] : null;
  // 0.8.0: a aba Mídia nasceu depois. Quem salvou as abas antes dela (sem a
  // marca `panelTabsV`) ganha a aba ligada; depois disso vale o que escolheu.
  if (lidas !== null && r['panelTabsV'] !== 2 && !lidas.includes('midia')) lidas.push('midia');
  const panelTabs = lidas === null ? [...PANEL_TABS] : PANEL_TABS.filter((t) => lidas.includes(t));
  const abas = panelTabs.length === 0 ? [...PANEL_TABS] : panelTabs;
  const primeira = r['panelFirst'] as PanelTab;
  return {
    panelHidden: r['panelHidden'] === true,
    panelTabs: abas,
    panelFirst: abas.includes(primeira) ? primeira : abas.includes('membros') ? 'membros' : abas[0]!,
  };
}

export function sameAppearance(a: Appearance, b: Appearance): boolean {
  return (
    a.theme === b.theme &&
    a.accent === b.accent &&
    a.font === b.font &&
    a.textSize === b.textSize &&
    a.messageStyle === b.messageStyle &&
    a.mySide === b.mySide &&
    a.density === b.density &&
    a.panelHidden === b.panelHidden &&
    a.panelTabs.join() === b.panelTabs.join() &&
    a.panelFirst === b.panelFirst &&
    a.roomChat === b.roomChat
  );
}

/* --- contas de cor ------------------------------------------------------- */

type Rgb = [number, number, number];

function rgb(hex: string): Rgb {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function hex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`;
}

function mix(a: string, b: string, quantoDeB: number): string {
  const [ar, ag, ab] = rgb(a);
  const [br, bg, bb] = rgb(b);
  return hex([ar + (br - ar) * quantoDeB, ag + (bg - ag) * quantoDeB, ab + (bb - ab) * quantoDeB]);
}

function luminance(cor: string): number {
  const canal = (v: number): number => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = rgb(cor);
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}

/** Contraste WCAG entre duas cores (1 a 21). */
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
}

const BRANCO = '#ffffff';
const ESCURO = '#120d1f';

/**
 * As variantes de uma cor de destaque LIVRE, todas com contraste garantido:
 *  - texto/ícone por cima (`on`): branco ou quase-preto, o que ler melhor;
 *  - fundo do botão (`accent`): a cor, escurecida/clareada só se nem branco
 *    nem preto chegarem a 4.5:1 sobre ela;
 *  - hover: um passo na direção que AUMENTA o contraste com o `on`;
 *  - texto em destaque (`text`): a cor puxada para o claro (tema escuro) ou
 *    para o escuro (tema claro) até ler bem sobre o fundo do chat (≥ 4.5:1).
 */
export function accentVariants(cor: string, theme: ThemeId): { accent: string; hover: string; on: string; text: string } {
  let accent = cor;
  let on = contrast(BRANCO, accent) >= contrast(ESCURO, accent) ? BRANCO : ESCURO;
  for (let i = 0; i < 20 && contrast(on, accent) < 4.5; i++) {
    accent = mix(accent, on === BRANCO ? ESCURO : BRANCO, 0.08);
  }
  on = contrast(BRANCO, accent) >= contrast(ESCURO, accent) ? BRANCO : ESCURO;
  const hover = mix(accent, on === BRANCO ? ESCURO : BRANCO, 0.14);
  const fundo = CHAT_DE[theme];
  const alvo = theme === 'claro' ? ESCURO : BRANCO;
  let text = accent;
  for (let i = 0; i < 20 && contrast(text, fundo) < 4.5; i++) text = mix(text, alvo, 0.1);
  return { accent, hover, on, text };
}

/* --- aplicar na tela ----------------------------------------------------- */

const CHAVE_LOCAL = 'loft.aparencia';

/** Põe a aparência na página inteira (o `<html>`). */
export function applyAppearance(a: Appearance): void {
  const raiz = document.documentElement;
  if (a.theme === 'noite') delete raiz.dataset['tema'];
  else raiz.dataset['tema'] = a.theme;

  const props = ['--accent', '--accent-hover', '--accent-on', '--accent-text', '--accent-soft', '--accent-gradient'];
  if (a.accent === '') {
    for (const p of props) raiz.style.removeProperty(p);
  } else {
    const v = accentVariants(a.accent, a.theme);
    raiz.style.setProperty('--accent', v.accent);
    raiz.style.setProperty('--accent-hover', v.hover);
    raiz.style.setProperty('--accent-on', v.on);
    raiz.style.setProperty('--accent-text', v.text);
    // O "selecionado": a cor misturada no fundo da coluna do PRÓPRIO tema.
    raiz.style.setProperty('--accent-soft', `color-mix(in srgb, ${v.accent} 24%, var(--surface-side))`);
    raiz.style.setProperty('--accent-gradient', `linear-gradient(180deg, ${mix(v.accent, BRANCO, 0.18)}, ${v.accent})`);
  }

  if (a.font === 'nunito') raiz.style.removeProperty('--font-sans');
  else raiz.style.setProperty('--font-sans', APP_FONTS[a.font].family);

  if (a.textSize === DEFAULT_TEXT_SIZE) raiz.style.removeProperty('--font-size-msg');
  else raiz.style.setProperty('--font-size-msg', `${a.textSize}px`);

  // Jeito das mensagens (message-list.css): sem atributo = o de sempre.
  const marcar = (nome: string, valor: string, padrao: string): void => {
    if (valor === padrao) delete raiz.dataset[nome];
    else raiz.dataset[nome] = valor;
  };
  marcar('mensagens', a.messageStyle, 'baloes');
  // O lado só vale nos balões (na lista, todas ficam à esquerda de qualquer jeito).
  marcar('meuLado', a.messageStyle === 'lista' ? 'direita' : a.mySide, 'direita');
  marcar('densidade', a.density, 'confortavel');
  marcar('painel', a.panelHidden ? 'escondido' : 'visivel', 'visivel');
}

/** O que vai para o banco e para o aparelho: a aparência + a marca de que as abas já conhecem a Mídia. */
export function paraGuardar(a: Appearance): Appearance & { panelTabsV: number } {
  return { ...a, panelTabsV: 2 };
}

/** Guarda no aparelho para o próximo carregamento já abrir certo. */
export function rememberAppearance(a: Appearance): void {
  try {
    if (sameAppearance(a, DEFAULT_APPEARANCE)) localStorage.removeItem(CHAVE_LOCAL);
    else localStorage.setItem(CHAVE_LOCAL, JSON.stringify(paraGuardar(a)));
  } catch {
    /* sem armazenamento (aba anônima): só não lembra */
  }
}

/** A que ficou guardada no aparelho (ou o padrão). */
export function rememberedAppearance(): Appearance {
  try {
    const texto = localStorage.getItem(CHAVE_LOCAL);
    return texto === null ? { ...DEFAULT_APPEARANCE } : parseAppearance(JSON.parse(texto));
  } catch {
    return { ...DEFAULT_APPEARANCE };
  }
}

/* --- a da conta × a da prévia --------------------------------------------- */

/*
 * Nas Configurações a pessoa vê a mudança NA HORA, no app inteiro, antes de
 * salvar (prévia). Se a da conta chegar do banco no meio (salvou no celular),
 * ela fica guardada e a prévia continua na tela até ser salva ou desfeita.
 */
let daConta: Appearance = rememberedAppearance();
let previa: Appearance | null = null;

/** Chegou a aparência da conta (banco, ao vivo): guarda no aparelho e aplica. */
export function setAccountAppearance(a: Appearance): void {
  daConta = a;
  rememberAppearance(a);
  applyAppearance(previa ?? a);
}

/** Liga (com a aparência em teste) ou desliga (null) a prévia. */
export function previewAppearance(a: Appearance | null): void {
  previa = a;
  applyAppearance(a ?? daConta);
}

export function accountAppearance(): Appearance {
  return { ...daConta };
}
