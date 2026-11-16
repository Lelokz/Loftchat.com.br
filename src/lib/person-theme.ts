/**
 * O jeito de UMA PESSOA no cartão dela, lido do perfil PÚBLICO — não do meu.
 *
 * Proposta A, etapa 2: a pessoa escolhe a COR DO CARTÃO e a FONTE DO NOME
 * em Configurações → Perfil. Quem vê o cartão vê a escolha DELA.
 *
 * LISTAS FECHADAS, não texto livre — nem para cor, nem para fonte. Um
 * `accentId`/`fontId` desconhecido (versão mais nova do app, ou documento
 * malformado) cai no padrão em vez de virar CSS arbitrário na tela de outra
 * pessoa. A regra do banco (firestore.rules) cobra as MESMAS listas.
 */

export const CARD_COLOR_IDS = ['roxo', 'rosa', 'verde', 'azul', 'laranja', 'claro'] as const;
export type CardColorId = (typeof CARD_COLOR_IDS)[number];

export const NAME_FONT_IDS = ['nunito', 'classica', 'pixelada', 'forte'] as const;
export type NameFontId = (typeof NAME_FONT_IDS)[number];

interface CardColor {
  label: string;
  /** A cor em si: bolinha da escolha e começo da faixa do cartão. */
  base: string;
  /** Fim da faixa (degradê). */
  fim: string;
}

export const CARD_COLORS: Record<CardColorId, CardColor> = {
  roxo: { label: 'Roxo', base: '#7b3fe4', fim: '#3a1f7a' },
  rosa: { label: 'Rosa', base: '#c2467e', fim: '#5a1f4a' },
  verde: { label: 'Verde', base: '#2f8f7a', fim: '#173f52' },
  azul: { label: 'Azul', base: '#3d6fd1', fim: '#1d2f6e' },
  laranja: { label: 'Laranja', base: '#b9772e', fim: '#5a2f2a' },
  claro: { label: 'Claro', base: '#e0e0e0', fim: '#6f6a85' },
};

interface NameFont {
  label: string;
  family: string;
  weight: number;
  /** "FORTE" é a Nunito no peso máximo, em maiúsculas. */
  upper: boolean;
}

export const NAME_FONTS: Record<NameFontId, NameFont> = {
  nunito: { label: 'Nunito', family: 'var(--font-sans)', weight: 700, upper: false },
  classica: { label: 'Clássica', family: "'Lora', Georgia, serif", weight: 600, upper: false },
  pixelada: { label: 'Pixelada', family: "'Silkscreen', monospace", weight: 400, upper: false },
  forte: { label: 'Forte', family: 'var(--font-sans)', weight: 900, upper: true },
};

export function cardColorId(value: unknown): CardColorId {
  return CARD_COLOR_IDS.includes(value as CardColorId) ? (value as CardColorId) : 'roxo';
}

export function nameFontId(value: unknown): NameFontId {
  return NAME_FONT_IDS.includes(value as NameFontId) ? (value as NameFontId) : 'nunito';
}

/**
 * Aplica a cor do cartão e a fonte do nome num cartão já montado.
 *
 * As variáveis entram no elemento RAIZ do cartão: CSS custom properties só
 * cascateiam para dentro, então nada vaza para o resto da tela.
 */
export function applyPersonLook(
  card: HTMLElement,
  nameEl: HTMLElement | null,
  profile: { accentId?: string | undefined; fontId?: string | undefined } | undefined,
): void {
  const cor = CARD_COLORS[cardColorId(profile?.accentId)];
  card.style.setProperty('--card-cor', cor.base);
  card.style.setProperty('--card-cor-fim', cor.fim);
  if (nameEl !== null) applyNameFont(nameEl, profile?.fontId);
}

export function applyNameFont(nameEl: HTMLElement, fontId: unknown): void {
  const fonte = NAME_FONTS[nameFontId(fontId)];
  nameEl.style.fontFamily = fonte.family;
  nameEl.style.fontWeight = String(fonte.weight);
  nameEl.style.textTransform = fonte.upper ? 'uppercase' : '';
}

/* -------------------------------------------------------------------------- */
/* Cor do nome nas mensagens (etapa 2d)                                         */
/* -------------------------------------------------------------------------- */

/**
 * A cor do NOME de quem escreve, nas mensagens dos outros. "padrao" = a cor
 * de sempre. Os tons moram em tokens.css (`--nome-*`), todos com contraste
 * medido sobre o balão — por isso é lista fechada, como a cor do cartão.
 */
export const NAME_COLOR_IDS = ['padrao', 'roxo', 'rosa', 'vermelho', 'laranja', 'amarelo', 'verde', 'azul'] as const;
export type NameColorId = (typeof NAME_COLOR_IDS)[number];

export const NAME_COLOR_LABELS: Record<NameColorId, string> = {
  padrao: 'Padrão',
  roxo: 'Roxo',
  rosa: 'Rosa',
  vermelho: 'Vermelho',
  laranja: 'Laranja',
  amarelo: 'Amarelo',
  verde: 'Verde',
  azul: 'Azul',
};

export function nameColorId(value: unknown): NameColorId {
  return NAME_COLOR_IDS.includes(value as NameColorId) ? (value as NameColorId) : 'padrao';
}
