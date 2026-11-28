/**
 * CATÁLOGO DE JOGOS (0.12.0).
 *
 * GET /jogos/busca?q=hollow → { jogos: [{ id, nome, capa?, ano?, lojas? }] }
 *
 * Pergunta à IGDB (o catálogo da Twitch: jogos de todas as lojas, com capa).
 * A chave é um app da Twitch (segredos IGDB_ID e IGDB_SEGREDO). Sem a chave,
 * ou se a IGDB falhar, usa a busca da loja da Steam (sem chave nenhuma).
 * As respostas ficam guardadas por um dia no cache da Cloudflare.
 */

import { json } from './index';

export interface EnvJogos {
  IGDB_ID?: string;
  IGDB_SEGREDO?: string;
  EMULADOR?: string;
}

/** Só no teste local: um catálogo de mentira (nada sai para a internet). */
const DE_TESTE: Jogo[] = [
  { id: 'steam:105600', nome: 'Terraria', capa: 'https://cdn.cloudflare.steamstatic.com/steam/apps/105600/library_600x900.jpg', ano: 2011, lojas: 'Steam, GOG' },
  { id: 'steam:367520', nome: 'Hollow Knight', capa: 'https://cdn.cloudflare.steamstatic.com/steam/apps/367520/library_600x900.jpg', ano: 2017, lojas: 'Steam, GOG, Xbox' },
  { id: 'steam:1030300', nome: 'Hollow Knight: Silksong', capa: 'https://cdn.cloudflare.steamstatic.com/steam/apps/1030300/library_600x900.jpg', ano: 2025, lojas: 'Steam, GOG, Xbox' },
  { id: 'steam:1966720', nome: 'Lethal Company', capa: 'https://cdn.cloudflare.steamstatic.com/steam/apps/1966720/library_600x900.jpg', ano: 2023, lojas: 'Steam' },
  { id: 'igdb:121', nome: 'Minecraft', ano: 2011, lojas: 'PC' },
];

interface Jogo {
  id: string;
  nome: string;
  capa?: string;
  ano?: number;
  lojas?: string;
}

let tokenTwitch: { valor: string; ate: number } | null = null;

async function tokenDaTwitch(env: EnvJogos): Promise<string> {
  if (tokenTwitch !== null && tokenTwitch.ate > Date.now() + 60_000) return tokenTwitch.valor;
  const r = await fetch(
    `https://id.twitch.tv/oauth2/token?client_id=${encodeURIComponent(env.IGDB_ID!)}&client_secret=${encodeURIComponent(env.IGDB_SEGREDO!)}&grant_type=client_credentials`,
    { method: 'POST' },
  );
  if (!r.ok) throw new Error(`Twitch recusou a chave (${r.status})`);
  const t = (await r.json()) as { access_token: string; expires_in: number };
  tokenTwitch = { valor: t.access_token, ate: Date.now() + t.expires_in * 1000 };
  return tokenTwitch.valor;
}

/** Os nomes das lojas como a gente fala. */
const LOJAS: Array<[RegExp, string]> = [
  [/steam/i, 'Steam'],
  [/epic/i, 'Epic'],
  [/gog/i, 'GOG'],
  [/xbox|microsoft/i, 'Xbox'],
  [/playstation/i, 'PlayStation'],
  [/battle\.?net|blizzard/i, 'Battle.net'],
  [/ubisoft|uplay/i, 'Ubisoft'],
  [/origin|\bea\b/i, 'EA'],
  [/itch/i, 'itch.io'],
];

const PLATAFORMAS: Record<string, string> = { PC: 'PC', PS5: 'PlayStation', PS4: 'PlayStation', XONE: 'Xbox', 'Series X|S': 'Xbox', Switch: 'Switch', Android: 'Android', iOS: 'iPhone', Linux: 'PC', Mac: 'Mac' };

/** Tipos de jogo da IGDB que contam: principal, remake, remaster, expandido, port. */
const TIPOS_BONS = new Set([0, 8, 9, 10, 11]);

interface RespostaIgdb {
  id: number;
  name: string;
  cover?: { image_id?: string };
  first_release_date?: number;
  game_type?: number | { id?: number };
  platforms?: { abbreviation?: string }[];
  external_games?: { external_game_source?: { name?: string } }[];
  total_rating_count?: number;
  hypes?: number;
  alternative_names?: { name?: string }[];
}

const CAMPOS =
  'fields name,cover.image_id,first_release_date,game_type,platforms.abbreviation,external_games.external_game_source.name,total_rating_count,hypes,alternative_names.name;';
/** 0.14.0: sem edições (version_parent), sem pacotes/DLC e sem jogo adulto (tema 42). */
const FILTRO = 'version_parent = null & themes != (42)';

/** Letras e números, sem acento: "Grand Theft Auto V" → "grand theft auto v". */
export function normalizar(t: string): string {
  return t
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * 0.14.0: a NOTA de cada jogo para ordenar a busca. A busca de texto da IGDB
 * não olha a fama do jogo ("cyberpunk" trazia jogos pequenos e não o 2077;
 * "gta" sem o GTA V) — então junta: o quanto o jogo é conhecido (avaliações
 * e expectativa), o nome igual ao digitado, o nome começando com o digitado,
 * e o apelido (alternative_names: "GTA 5", "CP2077").
 */
export function notaDoJogo(g: Pick<RespostaIgdb, 'name' | 'total_rating_count' | 'hypes' | 'alternative_names'>, q: string): number {
  const busca = normalizar(q);
  const nome = normalizar(g.name);
  const apelidos = (g.alternative_names ?? []).map((a) => normalizar(a.name ?? '')).filter((a) => a !== '');
  const fama = (g.total_rating_count ?? 0) + (g.hypes ?? 0) / 2;
  let nota = Math.log10(1 + fama) * 12;
  if (nome === busca || apelidos.includes(busca)) nota += 30;
  else if (nome.startsWith(`${busca} `) || nome.startsWith(busca)) nota += 10;
  else if (apelidos.some((a) => a.startsWith(busca))) nota += 8;
  const palavras = busca.split(' ').filter((p) => p !== '');
  if (palavras.length > 0 && palavras.every((p) => nome.includes(p))) nota += 5;
  return nota;
}

async function perguntarIgdb(env: EnvJogos, token: string, corpo: string): Promise<RespostaIgdb[]> {
  const r = await fetch('https://api.igdb.com/v4/games', {
    method: 'POST',
    headers: { 'Client-ID': env.IGDB_ID!, authorization: `Bearer ${token}`, 'content-type': 'text/plain' },
    body: corpo,
  });
  if (!r.ok) throw new Error(`IGDB ${r.status}`);
  return (await r.json()) as RespostaIgdb[];
}

async function buscarNaIgdb(env: EnvJogos, q: string): Promise<Jogo[]> {
  const token = await tokenDaTwitch(env);
  const limpo = q.replace(/["\\*;]/g, ' ').trim();
  // Duas perguntas juntas: a busca de texto (bastante, para ordenar aqui) e os
  // FAMOSOS que têm o texto no nome ou no apelido, do mais avaliado para baixo.
  const [porTexto, famosos] = await Promise.all([
    perguntarIgdb(env, token, `search "${limpo}"; ${CAMPOS} where ${FILTRO}; limit 50;`),
    perguntarIgdb(
      env,
      token,
      `${CAMPOS} where (name ~ *"${limpo}"* | alternative_names.name ~ *"${limpo}"*) & ${FILTRO} & total_rating_count > 0; sort total_rating_count desc; limit 25;`,
    ).catch(() => [] as RespostaIgdb[]),
  ]);
  const vistos = new Set<number>();
  const todos: Array<{ g: RespostaIgdb; nota: number }> = [];
  for (const g of [...porTexto, ...famosos]) {
    if (vistos.has(g.id)) continue;
    vistos.add(g.id);
    const tipo = typeof g.game_type === 'number' ? g.game_type : g.game_type?.id;
    if (tipo !== undefined && !TIPOS_BONS.has(tipo)) continue;
    todos.push({ g, nota: notaDoJogo(g, q) });
  }
  todos.sort((a, b) => b.nota - a.nota);
  const saida: Jogo[] = [];
  for (const { g } of todos) {
    const lojas = new Set<string>();
    for (const e of g.external_games ?? []) {
      const nome = e.external_game_source?.name ?? '';
      const achada = LOJAS.find(([re]) => re.test(nome));
      if (achada !== undefined) lojas.add(achada[1]);
    }
    if (lojas.size === 0) for (const p of g.platforms ?? []) if (p.abbreviation && PLATAFORMAS[p.abbreviation]) lojas.add(PLATAFORMAS[p.abbreviation]!);
    const imagem = g.cover?.image_id;
    saida.push({
      id: `igdb:${g.id}`,
      nome: g.name.slice(0, 80),
      ...(imagem && /^[a-z0-9]+$/.test(imagem) ? { capa: `https://images.igdb.com/igdb/image/upload/t_cover_big/${imagem}.jpg` } : {}),
      ...(g.first_release_date ? { ano: new Date(g.first_release_date * 1000).getUTCFullYear() } : {}),
      ...(lojas.size > 0 ? { lojas: [...lojas].slice(0, 3).join(', ') } : {}),
    });
    if (saida.length >= 10) break;
  }
  return saida;
}

async function buscarNaSteam(q: string): Promise<Jogo[]> {
  const r = await fetch(`https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(q)}&l=portuguese&cc=BR`);
  if (!r.ok) throw new Error(`Steam ${r.status}`);
  const d = (await r.json()) as { items?: { id: number; name: string; type?: string }[] };
  return (d.items ?? [])
    .filter((i) => i.type === undefined || i.type === 'app')
    .slice(0, 8)
    .map((i) => ({
      id: `steam:${i.id}`,
      nome: i.name.slice(0, 80),
      capa: `https://cdn.cloudflare.steamstatic.com/steam/apps/${i.id}/library_600x900.jpg`,
      lojas: 'Steam',
    }));
}

export async function buscarJogos(req: Request, env: EnvJogos): Promise<Response> {
  const q = (new URL(req.url).searchParams.get('q') ?? '').trim().slice(0, 60);
  if (q.length < 2) return json({ jogos: [] });
  if (env.EMULADOR !== undefined) {
    return json({ jogos: DE_TESTE.filter((j) => j.nome.toLowerCase().includes(q.toLowerCase())), fonte: 'teste' });
  }

  const cache = (caches as unknown as { default: Cache }).default;
  const chave = new Request(`https://cache.loftchat/jogos2/${encodeURIComponent(q.toLowerCase())}`);
  const guardada = await cache.match(chave).catch(() => undefined);
  if (guardada !== undefined) return json(await guardada.json());

  let jogos: Jogo[] = [];
  let fonte = 'steam';
  if (env.IGDB_ID && env.IGDB_SEGREDO) {
    try {
      jogos = await buscarNaIgdb(env, q);
      fonte = 'igdb';
    } catch (e) {
      console.log(`IGDB falhou: ${String(e)}`);
    }
  }
  if (fonte === 'steam') {
    try {
      jogos = await buscarNaSteam(q);
    } catch (e) {
      console.log(`Steam falhou: ${String(e)}`);
      return json({ jogos: [] }, 502);
    }
  }
  const corpo = { jogos, fonte };
  await cache
    .put(chave, new Response(JSON.stringify(corpo), { headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=86400' } }))
    .catch(() => {});
  return json(corpo);
}

/** 0.12.0 insígnia "Dia um": a data de lançamento ('aaaa-mm-dd', hora de Brasília), '' se não se sabe. */
export async function lancamentoDoJogo(env: EnvJogos, nome: string): Promise<string> {
  if (env.EMULADOR !== undefined || !env.IGDB_ID || !env.IGDB_SEGREDO) return '';
  const token = await tokenDaTwitch(env);
  const r = await fetch('https://api.igdb.com/v4/games', {
    method: 'POST',
    headers: { 'Client-ID': env.IGDB_ID, authorization: `Bearer ${token}`, 'content-type': 'text/plain' },
    body: `search "${nome.replace(/["\\]/g, ' ')}"; fields name,first_release_date; limit 5;`,
  });
  if (!r.ok) return '';
  const lista = (await r.json()) as { name: string; first_release_date?: number }[];
  const normal = (t: string): string => t.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const achado = lista.find((g) => normal(g.name) === normal(nome));
  if (achado?.first_release_date === undefined) return '';
  return new Date(achado.first_release_date * 1000 - 3 * 3600_000).toISOString().slice(0, 10);
}
