/**
 * JOGOS DO PERFIL (0.12.0), no jeito do Discord: um jogo favorito com uma
 * frase, até 5 "jogando ultimamente" (com etiquetas) e até 20 "quero jogar".
 *
 * Mora em `users/{uid}.jogos` (pequeno, aparece no cartão). A regra do banco
 * (firestore.rules → jogosOk) cobra os MESMOS tetos.
 */

export const MAX_NOME_JOGO = 80;
export const MAX_NOTA = 100;
export const MAX_ULTIMAMENTE = 5;
export const MAX_QUERO = 20;
export const MAX_ETIQUETAS = 2;
export const ETIQUETAS = ['Casual', 'Competitivo', 'Com amigos', 'Zerando', '100%'] as const;

export interface JogoDoPerfil {
  nome: string;
  /** Capa da Steam ou da IGDB. */
  capa?: string;
  /** De onde veio no catálogo ("igdb:123", "steam:456"); ausente = digitado à mão. */
  id?: string;
  /** Só em "jogando ultimamente". */
  etiquetas?: string[];
  /** A loja (do catálogo): "Steam", "Epic"… */
  loja?: string;
}

export interface FavoritoDoPerfil extends JogoDoPerfil {
  nota: string;
}

export interface JogosDoPerfil {
  favorito?: FavoritoDoPerfil;
  ultimamente: JogoDoPerfil[];
  quero: JogoDoPerfil[];
}

const CAPA_RE =
  /^https:\/\/(cdn\.cloudflare\.steamstatic\.com\/steam\/apps\/\d+\/[a-z0-9_]+\.jpg|images\.igdb\.com\/igdb\/image\/upload\/t_[a-z0-9_]+\/[a-z0-9]+\.(jpg|png))$/;

export function capaValida(capa: unknown): capa is string {
  return typeof capa === 'string' && capa.length <= 200 && CAPA_RE.test(capa);
}

function lerJogo(raw: unknown, comEtiquetas: boolean): JogoDoPerfil | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const nome = typeof r['nome'] === 'string' ? r['nome'].trim().slice(0, MAX_NOME_JOGO) : '';
  if (nome === '') return null;
  const jogo: JogoDoPerfil = { nome };
  if (capaValida(r['capa'])) jogo.capa = r['capa'];
  if (typeof r['id'] === 'string' && /^(igdb|steam):\d{1,12}$/.test(r['id'])) jogo.id = r['id'];
  if (typeof r['loja'] === 'string' && r['loja'] !== '') jogo.loja = r['loja'].slice(0, 24);
  if (comEtiquetas && Array.isArray(r['etiquetas'])) {
    const etq = r['etiquetas'].filter((t): t is string => (ETIQUETAS as readonly string[]).includes(t as string));
    if (etq.length > 0) jogo.etiquetas = etq.slice(0, MAX_ETIQUETAS);
  }
  return jogo;
}

/** Lê `users/{uid}.jogos` — qualquer coisa estranha some. */
export function parseJogos(raw: unknown): JogosDoPerfil | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const r = raw as Record<string, unknown>;
  const fav = lerJogo(r['favorito'], false);
  const favRaw = (r['favorito'] ?? {}) as Record<string, unknown>;
  const jogos: JogosDoPerfil = {
    ultimamente: (Array.isArray(r['ultimamente']) ? r['ultimamente'] : [])
      .map((j) => lerJogo(j, true))
      .filter((j): j is JogoDoPerfil => j !== null)
      .slice(0, MAX_ULTIMAMENTE),
    quero: (Array.isArray(r['quero']) ? r['quero'] : [])
      .map((j) => lerJogo(j, false))
      .filter((j): j is JogoDoPerfil => j !== null)
      .slice(0, MAX_QUERO),
  };
  if (fav !== null) jogos.favorito = { ...fav, nota: typeof favRaw['nota'] === 'string' ? favRaw['nota'].slice(0, MAX_NOTA) : '' };
  if (jogos.favorito === undefined && jogos.ultimamente.length === 0 && jogos.quero.length === 0) return undefined;
  return jogos;
}

/** O que vai para o banco (sem campos vazios). */
export function paraGravar(jogos: JogosDoPerfil): Record<string, unknown> {
  const limpo = (j: JogoDoPerfil, etiquetas: boolean): Record<string, unknown> => ({
    nome: j.nome.trim().slice(0, MAX_NOME_JOGO),
    ...(j.capa === undefined ? {} : { capa: j.capa }),
    ...(j.id === undefined ? {} : { id: j.id }),
    ...(j.loja === undefined ? {} : { loja: j.loja.slice(0, 24) }),
    ...(etiquetas && (j.etiquetas?.length ?? 0) > 0 ? { etiquetas: j.etiquetas!.slice(0, MAX_ETIQUETAS) } : {}),
  });
  return {
    ...(jogos.favorito === undefined ? {} : { favorito: { ...limpo(jogos.favorito, false), nota: jogos.favorito.nota.trim().slice(0, MAX_NOTA) } }),
    ultimamente: jogos.ultimamente.slice(0, MAX_ULTIMAMENTE).map((j) => limpo(j, true)),
    quero: jogos.quero.slice(0, MAX_QUERO).map((j) => limpo(j, false)),
  };
}
