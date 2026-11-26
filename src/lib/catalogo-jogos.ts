import { CARTEIRO } from './avisos';
import { capaValida } from './jogos-perfil';

/**
 * CATÁLOGO DE JOGOS (0.12.0): a busca passa pelo carteiro, que pergunta à IGDB
 * (o catálogo da Twitch, com jogos de todas as lojas) e, sem a chave dela, à
 * busca da loja da Steam. Ver carteiro/src/jogos.ts.
 */

export interface JogoDoCatalogo {
  /** "igdb:123" ou "steam:456". */
  id: string;
  nome: string;
  capa?: string;
  ano?: number;
  /** Onde dá para jogar: "Steam, GOG, Xbox"… */
  lojas?: string;
}

const guardadas = new Map<string, JogoDoCatalogo[]>();

function lerLista(raw: unknown): JogoDoCatalogo[] {
  if (!Array.isArray(raw)) return [];
  const saida: JogoDoCatalogo[] = [];
  for (const j of raw) {
    if (typeof j !== 'object' || j === null) continue;
    const r = j as Record<string, unknown>;
    if (typeof r['id'] !== 'string' || !/^(igdb|steam):\d{1,12}$/.test(r['id'])) continue;
    if (typeof r['nome'] !== 'string' || r['nome'].trim() === '') continue;
    saida.push({
      id: r['id'],
      nome: r['nome'].slice(0, 80),
      ...(capaValida(r['capa']) ? { capa: r['capa'] } : {}),
      ...(typeof r['ano'] === 'number' ? { ano: r['ano'] } : {}),
      ...(typeof r['lojas'] === 'string' && r['lojas'] !== '' ? { lojas: r['lojas'].slice(0, 80) } : {}),
    });
  }
  return saida.slice(0, 8);
}

/** Procura jogos pelo nome (até 8). Sem internet ou erro: lista vazia. */
export async function buscarJogos(texto: string): Promise<JogoDoCatalogo[]> {
  const q = texto.trim().slice(0, 60);
  if (q.length < 2) return [];
  const chave = q.toLowerCase();
  const antes = guardadas.get(chave);
  if (antes !== undefined) return antes;
  try {
    const r = await fetch(`${CARTEIRO}/jogos/busca?q=${encodeURIComponent(q)}`);
    if (!r.ok) return [];
    const lista = lerLista(((await r.json()) as { jogos?: unknown }).jogos);
    if (guardadas.size > 200) guardadas.clear();
    guardadas.set(chave, lista);
    return lista;
  } catch {
    return [];
  }
}

/** A capa de um jogo pelo nome exato (para o "Jogando…" de fora da Steam). */
export async function capaPeloNome(nome: string): Promise<string | undefined> {
  const lista = await buscarJogos(nome);
  const normal = (t: string): string => t.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const alvo = normal(nome);
  // Só o mesmo jogo (ou o nome que começa igual): capa errada é pior que nenhuma.
  return (lista.find((j) => normal(j.nome) === alvo) ?? lista.find((j) => normal(j.nome).startsWith(alvo)))?.capa;
}
