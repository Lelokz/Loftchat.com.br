/**
 * INSÍGNIAS DO SERVIDOR (0.12.5) — o que o app e o carteiro sabem igual
 * (como lib/permissoes.ts): os jeitos de ganhar, o que vale e a conta.
 *
 *   insigniasDoGrupo/{id}          a insígnia (membros leem; só o carteiro grava)
 *   insigniasDoGrupoInterno/{id}   a frase secreta (ninguém lê)
 *   insigniasDoMembro/{grupo}_{uid} o que a pessoa tem e os contadores DAQUELE grupo
 *
 * Os contadores (`n`): msg, c_<canal>, fotos/videos/audios/figurinhas,
 * reacoes, seguidos, vozMin, j_<jogo>, f_<insígnia>.
 */

import type { Raridade } from './insignias';

export type TipoDeGatilho =
  | 'mao'
  | 'mensagens'
  | 'midia'
  | 'reacoes'
  | 'seguidos'
  | 'frase'
  | 'voz'
  | 'jogo'
  | 'membro'
  | 'convites'
  | 'cargo'
  | 'primeiros';

export type MidiaDoGatilho = 'fotos' | 'videos' | 'audios' | 'figurinhas';

export interface Gatilho {
  tipo: TipoDeGatilho;
  /** A meta (mensagens, horas, dias, pessoas…). */
  alvo: number;
  canal?: string;
  midia?: MidiaDoGatilho;
  cargo?: string;
  jogo?: string;
}

export interface InsigniaDoGrupo {
  id: string;
  groupId: string;
  nome: string;
  desc: string;
  /** Um dos ICONES_DO_SERVIDOR (components/insignias/desenhos.ts). */
  icone: string;
  raridade: Raridade;
  gatilho: Gatilho;
  secreta: boolean;
  /** Só os primeiros X ganham (0 = sem limite). */
  limite: number;
  /** Vale até (AAAA-MM-DD; '' = sempre). */
  ate: string;
  /** Quantas pessoas têm. */
  quantos: number;
  criadaEm: string;
}

export const RARIDADES_DO_SERVIDOR: Raridade[] = ['comum', 'incomum', 'rara', 'epica', 'lendaria'];
export const LIMITE_POR_GRUPO = 50;

/** A lista do "Como ganhar" (a maquete aprovada), na ordem e nos grupos dela. */
export const GATILHOS: Array<{ grupo: string; tipo: TipoDeGatilho; nome: string; desc: string; icone: string; meta?: string }> = [
  { grupo: 'Na mão', tipo: 'mao', nome: 'Dada à mão', desc: 'quem tem a permissão dá', icone: 'presente' },
  { grupo: 'Conversa', tipo: 'mensagens', nome: 'Mandar mensagens', desc: 'X mensagens, num canal ou em todos', icone: 'balao', meta: 'mensagens' },
  { grupo: 'Conversa', tipo: 'midia', nome: 'Mandar fotos, vídeos, áudios ou figurinhas', desc: 'X de um tipo', icone: 'camera', meta: '' },
  { grupo: 'Conversa', tipo: 'reacoes', nome: 'Receber reações', desc: 'X reações nas mensagens', icone: 'coracao', meta: 'reações' },
  { grupo: 'Conversa', tipo: 'seguidos', nome: 'Dias seguidos conversando', desc: 'X dias sem falhar', icone: 'fogo', meta: 'dias seguidos' },
  { grupo: 'Conversa', tipo: 'frase', nome: 'Frase secreta', desc: 'mandar uma mensagem com a frase', icone: 'chave' },
  { grupo: 'Voz e jogo', tipo: 'voz', nome: 'Horas em sala de voz', desc: 'X horas nas salas do grupo', icone: 'fone', meta: 'horas' },
  { grupo: 'Voz e jogo', tipo: 'jogo', nome: 'Jogar junto', desc: 'X horas de um jogo com alguém do grupo', icone: 'controle', meta: 'horas' },
  { grupo: 'Grupo', tipo: 'membro', nome: 'Tempo de membro', desc: 'X dias no grupo', icone: 'bolo', meta: 'dias' },
  { grupo: 'Grupo', tipo: 'convites', nome: 'Convidar pessoas', desc: 'X pessoas que entraram pelo convite', icone: 'presente', meta: 'pessoas' },
  { grupo: 'Grupo', tipo: 'cargo', nome: 'Ter um cargo', desc: 'perde se perder o cargo', icone: 'escudo' },
  { grupo: 'Grupo', tipo: 'primeiros', nome: 'Primeiros membros', desc: 'um dos X primeiros', icone: 'coroa', meta: 'primeiros' },
];

export const NOMES_DAS_MIDIAS: Record<MidiaDoGatilho, string> = { fotos: 'fotos', videos: 'vídeos', audios: 'áudios', figurinhas: 'figurinhas' };

/** Tem meta numérica? */
export function temAlvo(tipo: TipoDeGatilho): boolean {
  return tipo !== 'mao' && tipo !== 'frase' && tipo !== 'cargo';
}

/** O jogo vira chave de contador ("Minecraft" → j_minecraft…). */
export function chaveDoJogo(nome: string): string {
  let h = 5381;
  for (const c of nome.trim().toLowerCase()) h = ((h * 33) ^ c.codePointAt(0)!) >>> 0;
  return `j_${h.toString(36)}`;
}

/** Texto curto do "como ganha" ("500 mensagens em #geral"). */
export function textoDoGatilho(g: Gatilho, nomes: { canal?: (id: string) => string | undefined; cargo?: (id: string) => string | undefined } = {}): string {
  const f = (x: number): string => x.toLocaleString('pt-BR');
  switch (g.tipo) {
    case 'mao':
      return 'Dada à mão';
    case 'mensagens': {
      const canal = g.canal === undefined ? undefined : nomes.canal?.(g.canal);
      return `${f(g.alvo)} mensagens${canal === undefined ? '' : ` em #${canal}`}`;
    }
    case 'midia':
      return `${f(g.alvo)} ${NOMES_DAS_MIDIAS[g.midia ?? 'fotos']}`;
    case 'reacoes':
      return `${f(g.alvo)} reações recebidas`;
    case 'seguidos':
      return `${f(g.alvo)} dias seguidos conversando`;
    case 'frase':
      return 'Frase secreta';
    case 'voz':
      return `${f(g.alvo)} h em sala de voz`;
    case 'jogo':
      return `${f(g.alvo)} h jogando ${g.jogo ?? 'um jogo'} juntos`;
    case 'membro':
      return `Membro há ${f(g.alvo)} dias`;
    case 'convites':
      return `Convidou ${f(g.alvo)} pessoas`;
    case 'cargo':
      return `Ter o cargo ${g.cargo === undefined ? '' : (nomes.cargo?.(g.cargo) ?? '')}`.trim();
    case 'primeiros':
      return `Um dos ${f(g.alvo)} primeiros membros`;
  }
}

/** O que mais conta para a pessoa além dos contadores. */
export interface Extras {
  /** Quando entrou no grupo (ISO). */
  entrou?: string;
  cargos?: string[];
  convidados?: number;
  /** A posição dela entre os membros, por quem entrou primeiro (1 = o primeiro). */
  posicao?: number;
}

/** Quanto falta: atual/alvo (null = não tem contagem para mostrar). */
export function progressoDoGatilho(ins: Pick<InsigniaDoGrupo, 'id' | 'gatilho'>, n: Record<string, number>, x: Extras, agora = Date.now()): { atual: number; alvo: number } | null {
  const g = ins.gatilho;
  switch (g.tipo) {
    case 'mensagens':
      return { atual: n[g.canal === undefined ? 'msg' : `c_${g.canal}`] ?? 0, alvo: g.alvo };
    case 'midia':
      return { atual: n[g.midia ?? 'fotos'] ?? 0, alvo: g.alvo };
    case 'reacoes':
      return { atual: n['reacoes'] ?? 0, alvo: g.alvo };
    case 'seguidos':
      return { atual: n['seguidos'] ?? 0, alvo: g.alvo };
    case 'voz':
      return { atual: Math.floor((n['vozMin'] ?? 0) / 60), alvo: g.alvo };
    case 'jogo':
      return { atual: Math.floor((n[chaveDoJogo(g.jogo ?? '')] ?? 0) / 60), alvo: g.alvo };
    case 'membro': {
      const desde = Date.parse(x.entrou ?? '');
      return { atual: Number.isNaN(desde) ? 0 : Math.floor((agora - desde) / 86_400_000), alvo: g.alvo };
    }
    case 'convites':
      return { atual: x.convidados ?? 0, alvo: g.alvo };
    default:
      return null;
  }
}

/** Já cumpriu o "como ganhar"? (A dada à mão nunca sai sozinha.) */
export function cumpriu(ins: Pick<InsigniaDoGrupo, 'id' | 'gatilho'>, n: Record<string, number>, x: Extras, agora = Date.now()): boolean {
  const g = ins.gatilho;
  if (g.tipo === 'mao') return false;
  if (g.tipo === 'frase') return (n[`f_${ins.id}`] ?? 0) >= 1;
  if (g.tipo === 'cargo') return g.cargo !== undefined && (x.cargos ?? []).includes(g.cargo);
  if (g.tipo === 'primeiros') return x.posicao !== undefined && x.posicao <= g.alvo;
  const p = progressoDoGatilho(ins, n, x, agora);
  return p !== null && p.atual >= p.alvo;
}

/** Ainda dá para ganhar (limite de pessoas e data). */
export function aindaVale(ins: Pick<InsigniaDoGrupo, 'limite' | 'ate' | 'quantos'>, hoje: string): boolean {
  if (ins.limite > 0 && ins.quantos >= ins.limite) return false;
  if (ins.ate !== '' && hoje > ins.ate) return false;
  return true;
}

/** Lê uma insígnia do banco (o que não serve vira null). */
export function lerInsigniaDoGrupo(id: string, d: Record<string, unknown> | undefined): InsigniaDoGrupo | null {
  if (d === undefined) return null;
  const g = (d['gatilho'] ?? {}) as Record<string, unknown>;
  const tipo = g['tipo'];
  if (!GATILHOS.some((x) => x.tipo === tipo)) return null;
  const raridade = d['raridade'] as Raridade;
  if (!RARIDADES_DO_SERVIDOR.includes(raridade)) return null;
  const midia = g['midia'];
  return {
    id,
    groupId: String(d['groupId'] ?? ''),
    nome: String(d['nome'] ?? '').slice(0, 24) || 'Insígnia',
    desc: String(d['desc'] ?? '').slice(0, 80),
    icone: String(d['icone'] ?? 'estrela'),
    raridade,
    gatilho: {
      tipo: tipo as TipoDeGatilho,
      alvo: typeof g['alvo'] === 'number' && g['alvo'] > 0 ? Math.floor(g['alvo']) : 1,
      ...(typeof g['canal'] === 'string' && g['canal'] !== '' ? { canal: g['canal'] } : {}),
      ...(midia === 'fotos' || midia === 'videos' || midia === 'audios' || midia === 'figurinhas' ? { midia } : {}),
      ...(typeof g['cargo'] === 'string' && g['cargo'] !== '' ? { cargo: g['cargo'] } : {}),
      ...(typeof g['jogo'] === 'string' && g['jogo'] !== '' ? { jogo: g['jogo'].slice(0, 60) } : {}),
    },
    secreta: d['secreta'] === true,
    limite: typeof d['limite'] === 'number' && d['limite'] > 0 ? Math.floor(d['limite']) : 0,
    ate: typeof d['ate'] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d['ate']) ? d['ate'] : '',
    quantos: typeof d['quantos'] === 'number' && d['quantos'] > 0 ? Math.floor(d['quantos']) : 0,
    criadaEm: String(d['criadaEm'] ?? ''),
  };
}

/** A frase secreta comparada sem acento, sem maiúscula e sem espaço sobrando. */
export function normalizarFrase(t: string): string {
  return t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}
