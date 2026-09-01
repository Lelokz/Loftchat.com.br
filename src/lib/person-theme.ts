/**
 * O tema de UMA PESSOA, lido do perfil PÚBLICO dela — não do meu.
 *
 * Entrega 3 (etapa 14, ainda não feita) vai GRAVAR `theme`/`accentId`/
 * `fontId` em `UserProfile`; esta função só LÊ, com um padrão seguro
 * quando ausentes. Isolada aqui de propósito — quando a Entrega 3 chegar,
 * ela só precisa aprender a escrever esses três campos; nada aqui muda.
 *
 * LISTAS FECHADAS, não texto livre — nem para cor, nem para fonte. Um
 * `accentId`/`fontId` desconhecido (schema mais novo que este código, ou
 * documento malformado) cai no padrão em vez de virar CSS arbitrário na
 * tela de outra pessoa. "Padrão" aqui é literal: NENHUM valor sobrescrito,
 * o cartão herda o tema de QUEM ESTÁ VENDO — não existe um terceiro tema
 * "sem preferência".
 */

export type AccentId = 'roxo' | 'azul' | 'verde' | 'laranja' | 'rosa';
export type FontId = 'padrao' | 'serifada' | 'monoespacada' | 'pixelada';

interface AccentTokens {
  '--accent': string;
  '--accent-hover': string;
  '--accent-on': string;
  '--accent-soft': string;
}

const ACCENTS: Record<AccentId, AccentTokens> = {
  roxo: { '--accent': '#5b5bd6', '--accent-hover': '#4b4bc6', '--accent-on': '#ffffff', '--accent-soft': '#e9e9fa' },
  azul: { '--accent': '#2f6fed', '--accent-hover': '#255bcc', '--accent-on': '#ffffff', '--accent-soft': '#e3ecfd' },
  verde: { '--accent': '#22946b', '--accent-hover': '#1c7a58', '--accent-on': '#ffffff', '--accent-soft': '#dcf3ea' },
  laranja: { '--accent': '#d9772f', '--accent-hover': '#c06526', '--accent-on': '#ffffff', '--accent-soft': '#fbe8d8' },
  rosa: { '--accent': '#d43f8d', '--accent-hover': '#b8347a', '--accent-on': '#ffffff', '--accent-soft': '#fbdcec' },
};

/**
 * `fontFamily` nunca é texto vindo do banco: é sempre um destes quatro
 * valores fixos. É isso que fecha o caminho de injeção — ninguém escolhe
 * fonte por texto livre, e "pixelada" cai numa pilha monoespaçada do
 * sistema até uma fonte de verdade ser embutida (nenhum @font-face novo
 * nesta etapa).
 */
const FONTS: Record<FontId, string> = {
  padrao: 'var(--font-sans)',
  serifada: 'Georgia, "Times New Roman", serif',
  monoespacada: '"SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace',
  pixelada: '"Courier New", Consolas, monospace',
};

/** Sobrescreve o degrau escuro dos tokens de superfície/texto/borda — ver styles/tokens.css. */
const DARK_SURFACE = {
  '--surface-side': '#17181d',
  '--surface-raised': '#24262c',
  '--surface-bubble': '#2f323a',
  '--surface-hover': '#2a2d34',
  '--border': '#292c33',
  '--border-strong': '#3b3f48',
  '--text-primary': '#e9eaee',
  '--text-secondary': '#a1a5ae',
  '--text-muted': '#71757e',
  '--danger': '#e06060',
} as const;

export interface PersonTheme {
  /** Só as chaves que a pessoa realmente escolheu — pronto para `element.style.setProperty(chave, valor)`. */
  cssVars: Record<string, string>;
  /** `undefined` = a pessoa não escolheu; o cartão herda `font-family` de quem está vendo. */
  fontFamily: string | undefined;
}

/**
 * Monta o tema de UMA pessoa a partir do perfil público dela.
 *
 * `profile` pode não ter NENHUM dos três campos — Entrega 3 não existe
 * ainda, e é o caminho de hoje para todo mundo. Nesse caso `cssVars` volta
 * vazio: o cartão não sobrescreve nada, e herda o tema de quem está
 * olhando (CSS custom properties cascateiam) — não um terceiro tema fixo.
 */
export function personTheme(
  profile: { theme?: string; accentId?: string; fontId?: string } | undefined,
): PersonTheme {
  const cssVars: Record<string, string> = {};

  if (profile?.theme === 'dark') Object.assign(cssVars, DARK_SURFACE);

  const accent = ACCENTS[profile?.accentId as AccentId];
  if (accent !== undefined) Object.assign(cssVars, accent);

  const fontFamily = FONTS[profile?.fontId as FontId];

  return { cssVars, fontFamily };
}
