/**
 * REPORTAR BUG (0.13.0) — o que o app e o carteiro sabem igual: as
 * categorias, o limite por dia e como ler um reporte do banco.
 */

export const LIMITE_DE_REPORTES_POR_DIA = 5;
export const MAX_ANEXOS = 5;

/** A lista aprovada, na ordem dela. `icone` = nome em components/reportar-bug/icones. */
export const CATEGORIAS_DE_BUG = [
  { id: 'mensagens', nome: 'Mensagens e chat', icone: 'chat' },
  { id: 'chamada', nome: 'Chamada de voz e vídeo', icone: 'fone' },
  { id: 'tela', nome: 'Compartilhar tela', icone: 'tela' },
  { id: 'notificacoes', nome: 'Notificações', icone: 'sino' },
  { id: 'grupos', nome: 'Grupos, canais e cargos', icone: 'grupo' },
  { id: 'amigos', nome: 'Amigos e conversa privada', icone: 'pessoa' },
  { id: 'midia', nome: 'Fotos, vídeos, áudios e arquivos', icone: 'foto' },
  { id: 'perfil', nome: 'Perfil, jogos e insígnias', icone: 'estrela' },
  { id: 'visual', nome: 'Visual (tela torta, botão sumido, cor errada)', icone: 'olho' },
  { id: 'lentidao', nome: 'Lentidão ou travamento', icone: 'lento' },
  { id: 'conta', nome: 'Conta e login', icone: 'chave' },
  { id: 'atualizacao', nome: 'Atualização e instalação', icone: 'baixar' },
  { id: 'outro', nome: 'Outro', icone: 'mais' },
] as const;

export type CategoriaDeBug = (typeof CATEGORIAS_DE_BUG)[number]['id'];

export interface Anexo {
  chave: string;
  tipo: 'imagem' | 'video' | 'arquivo';
  nome: string;
}

export type EstadoDoReporte = 'enviado' | 'visto' | 'consertado';

export interface Reporte {
  id: string;
  uid: string;
  titulo: string;
  categoria: string;
  texto: string;
  audio: { chave: string; duracaoMs: number } | null;
  anexos: Anexo[];
  aparelho: { versao: string; tipo: string; sistema: string; tela: string; modelo?: string };
  estado: EstadoDoReporte;
  confirmado: boolean;
  versaoConserto: string;
  criadoEm: string;
  vistoEm: string;
  consertadoEm: string;
}

const s = (v: unknown): string => (typeof v === 'string' ? v : '');

/** Lê um reporte (o que não serve vira null). */
export function lerReporte(id: string, d: Record<string, unknown> | null | undefined): Reporte | null {
  if (d === null || d === undefined || typeof d['uid'] !== 'string') return null;
  const e = d['estado'];
  const a = d['audio'] as Record<string, unknown> | undefined;
  const ap = (d['aparelho'] ?? {}) as Record<string, unknown>;
  return {
    id,
    uid: d['uid'],
    titulo: s(d['titulo']),
    categoria: s(d['categoria']),
    texto: s(d['texto']),
    audio: a !== undefined && a !== null && typeof a['chave'] === 'string' ? { chave: a['chave'], duracaoMs: Number(a['duracaoMs']) || 0 } : null,
    anexos: (Array.isArray(d['anexos']) ? d['anexos'] : [])
      .map((x) => x as Record<string, unknown>)
      .filter((x) => typeof x?.['chave'] === 'string')
      .map((x) => ({ chave: x['chave'] as string, tipo: x['tipo'] === 'imagem' || x['tipo'] === 'video' ? x['tipo'] : 'arquivo', nome: s(x['nome']) })),
    aparelho: { versao: s(ap['versao']), tipo: s(ap['tipo']), sistema: s(ap['sistema']), tela: s(ap['tela']), ...(s(ap['modelo']) === '' ? {} : { modelo: s(ap['modelo']) }) },
    estado: e === 'visto' || e === 'consertado' ? e : 'enviado',
    confirmado: d['confirmado'] === true,
    versaoConserto: s(d['versaoConserto']),
    criadoEm: s(d['criadoEm']),
    vistoEm: s(d['vistoEm']),
    consertadoEm: s(d['consertadoEm']),
  };
}
