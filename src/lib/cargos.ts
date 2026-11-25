import { collection, doc, getDoc, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import type { Unsubscribe } from 'firebase/firestore';

import { auth, db } from './firebase';
import { CARTEIRO } from './avisos';
import { permissoesValidas } from './permissoes';
import type { Cargo, CorDoCargo, Insignia, Member } from '../types/models';

/**
 * CARGOS (0.8.5, etapa 1): ler, criar, editar, ordenar, apagar e dar às
 * pessoas. Quem pode mexer, por enquanto, é o dono (regras do banco); a
 * etapa 2 passa a valer pela permissão "Gerenciar cargos".
 */

const HEX = /^#[0-9a-f]{6}$/i;
export const MAX_NOME_DO_CARGO = 40;

/** O Dono não é um cargo do banco: é sempre o primeiro, fixo. */
export const COR_DO_DONO: CorDoCargo = { a: '#f2b26b' };
export const ICONE_DO_DONO = '👑';

export function idDoTodos(groupId: string): string {
  return `${groupId}_todos`;
}

function lerCor(v: unknown): CorDoCargo | null {
  if (typeof v !== 'object' || v === null) return null;
  const r = v as Record<string, unknown>;
  if (typeof r['a'] !== 'string' || !HEX.test(r['a'])) return null;
  return typeof r['b'] === 'string' && HEX.test(r['b']) ? { a: r['a'], b: r['b'] } : { a: r['a'] };
}

function paraCargo(id: string, d: Record<string, unknown>): Cargo {
  const icone = typeof d['icone'] === 'string' && d['icone'] !== '' ? d['icone'].slice(0, 16) : undefined;
  const imagem = typeof d['imagem'] === 'string' && d['imagem'].startsWith('data:image/') ? d['imagem'] : undefined;
  return {
    id,
    groupId: typeof d['groupId'] === 'string' ? d['groupId'] : '',
    nome: typeof d['nome'] === 'string' && d['nome'].trim() !== '' ? d['nome'] : 'cargo',
    cor: lerCor(d['cor']),
    ...(icone === undefined ? {} : { icone }),
    ...(imagem === undefined ? {} : { imagem }),
    posicao: typeof d['posicao'] === 'number' ? d['posicao'] : 999,
    separado: d['separado'] === true,
    mencionavel: d['mencionavel'] === true,
    permissoes: permissoesValidas(d['permissoes']),
    ...(d['todos'] === true ? { todos: true } : {}),
    criadoEm: typeof d['criadoEm'] === 'string' ? d['criadoEm'] : '',
  };
}

/** Os cargos de um grupo (o @todos junto), do mais alto para o mais baixo. */
export function ouvirCargos(groupId: string, aoMudar: (cargos: Cargo[]) => void, aoErrar: (e: unknown) => void): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'cargos'), where('groupId', '==', groupId)),
    (snap) => aoMudar(ordenar(snap.docs.map((d) => paraCargo(d.id, d.data())))),
    aoErrar,
  );
}

export function ordenar(cargos: Cargo[]): Cargo[] {
  return [...cargos].sort((a, b) => Number(a.todos === true) - Number(b.todos === true) || a.posicao - b.posicao || a.criadoEm.localeCompare(b.criadoEm));
}

/**
 * Toda mudança em cargos passa pelo CARTEIRO (carteiro/src/cargos.ts), que
 * confere a permissão e a hierarquia, grava e recalcula o que cada um pode.
 * O erro vem com o motivo em português.
 */
export async function pedirAoCarteiro(groupId: string, acao: string, extra: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const usuario = auth.currentUser;
  if (usuario === null) throw new Error('Entre de novo para continuar.');
  const token = await usuario.getIdToken();
  let r: Response;
  try {
    r = await fetch(`${CARTEIRO}/cargos`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ grupo: groupId, acao, ...extra }),
    });
  } catch {
    throw new Error('Sem conexão com o servidor. Tente de novo.');
  }
  const corpo = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok) throw new Error(typeof corpo['erro'] === 'string' ? corpo['erro'] : 'Não deu certo. Tente de novo.');
  return corpo;
}

/** Grupo de antes dos cargos: o carteiro cria o @todos e o Administrador e calcula tudo. */
export async function garantirBasicos(groupId: string, _cargos: Cargo[]): Promise<void> {
  await pedirAoCarteiro(groupId, 'recalcular');
}

export type CamposDoCargo = Pick<Cargo, 'nome' | 'cor' | 'icone' | 'imagem' | 'separado' | 'mencionavel' | 'permissoes'>;

/** Cargo novo, embaixo do último. Devolve o id. */
export async function criarCargo(groupId: string): Promise<string> {
  const r = await pedirAoCarteiro(groupId, 'criar');
  return String(r['id'] ?? '');
}

export async function salvarCargo(groupId: string, id: string, campos: CamposDoCargo): Promise<void> {
  await pedirAoCarteiro(groupId, 'salvar', {
    cargo: id,
    campos: {
      nome: campos.nome.trim().slice(0, MAX_NOME_DO_CARGO),
      cor: campos.cor,
      icone: campos.icone ?? '',
      imagem: campos.imagem ?? '',
      separado: campos.separado,
      mencionavel: campos.mencionavel,
      permissoes: permissoesValidas(campos.permissoes),
    },
  });
}

/** Nova ordem (do mais alto para o mais baixo). */
export async function reordenarCargos(groupId: string, ids: string[]): Promise<void> {
  await pedirAoCarteiro(groupId, 'ordenar', { ids });
}

/** Apaga o cargo (e tira de quem tinha). */
export async function apagarCargo(groupId: string, id: string): Promise<void> {
  await pedirAoCarteiro(groupId, 'apagar', { cargo: id });
}

export async function darCargo(groupId: string, memberId: string, cargoId: string, dar: boolean): Promise<void> {
  await pedirAoCarteiro(groupId, 'dar', { membro: memberId, cargo: cargoId, dar });
}

/** Tira alguém do grupo (permissão "Expulsar" + hierarquia). */
export async function expulsar(groupId: string, memberId: string, motivo = ''): Promise<void> {
  await pedirAoCarteiro(groupId, 'expulsar', { membro: memberId, motivo });
}

/* --- o que aparece junto do nome --------------------------------------------- */

/**
 * Cor = do cargo mais alto que TEM cor; ícone = do mais alto que tem ícone;
 * bloco = o cargo "separado" mais alto (como no Discord). O dono ganha a
 * coroa e o bloco "Dono" por cima de tudo.
 */
export function insigniaDe(m: Member, cargos: Cargo[], ownerId: string | null): Insignia {
  const meus = cargos.filter((c) => c.todos !== true && m.cargos?.includes(c.id));
  const dono = m.id === ownerId;
  const comCor = meus.find((c) => c.cor !== null);
  const comIcone = meus.find((c) => c.icone !== undefined || c.imagem !== undefined);
  const separado = meus.find((c) => c.separado);
  const insignia: Insignia = {
    // O laranja do Dono é só o padrão: se a pessoa escolheu a cor do próprio
    // nome (Perfil), ela vale — só a cor de um CARGO passa por cima.
    cor: comCor?.cor ?? (dono && (m.nameColor === undefined || m.nameColor === '' || m.nameColor === 'padrao') ? COR_DO_DONO : null),
    bloco: dono ? 'Dono' : (separado?.nome ?? null),
    blocoPosicao: dono ? -1 : (separado?.posicao ?? 99999),
    cargos: meus,
    dono,
  };
  if (dono) insignia.icone = ICONE_DO_DONO;
  else if (comIcone?.imagem !== undefined) insignia.imagem = comIcone.imagem;
  else if (comIcone?.icone !== undefined) insignia.icone = comIcone.icone;
  return insignia;
}

/** Os membros com a insígnia calculada (o store chama a cada mudança). */
export function comInsignias(membros: Member[], cargos: Cargo[], ownerId: string | null): Member[] {
  return membros.map((m) => ({ ...m, insignia: insigniaDe(m, cargos, ownerId) }));
}

/** Texto CSS da cor (sólida ou degradê). */
export function corCss(cor: CorDoCargo): string {
  return cor.b === undefined ? cor.a : `linear-gradient(90deg, ${cor.a}, ${cor.b})`;
}

/** Quem criou o convite (para "entrou pelo convite de X"). */
export async function quemConvidou(codigo: string): Promise<string | null> {
  try {
    const snap = await getDoc(doc(db, 'invites', codigo));
    const criador: unknown = snap.exists() ? snap.get('createdBy') : null;
    return typeof criador === 'string' ? criador : null;
  } catch {
    return null;
  }
}

/**
 * Pede ao carteiro para recalcular as permissões do grupo, sem esperar e sem
 * reclamar se falhar (ex.: entrei no grupo, criei canal, mudei canal de
 * categoria). Enquanto não recalcula, canal com regra própria fica fechado.
 */
export function recalcularDepois(groupId: string): void {
  void pedirAoCarteiro(groupId, 'recalcular').catch(() => undefined);
}

/* --- moderação (etapa 4), tudo pelo carteiro --------------------------------- */

export async function porDeCastigo(groupId: string, memberId: string, segundos: number, motivo: string): Promise<void> {
  await pedirAoCarteiro(groupId, 'castigo', { membro: memberId, segundos, motivo });
}

export async function tirarCastigo(groupId: string, memberId: string): Promise<void> {
  await pedirAoCarteiro(groupId, 'tirar-castigo', { membro: memberId });
}

export async function banir(groupId: string, memberId: string, motivo: string): Promise<void> {
  await pedirAoCarteiro(groupId, 'banir', { membro: memberId, motivo });
}

export async function desbanir(groupId: string, uid: string): Promise<void> {
  await pedirAoCarteiro(groupId, 'desbanir', { membro: uid });
}

export async function mudarApelido(groupId: string, memberId: string, apelido: string): Promise<void> {
  await pedirAoCarteiro(groupId, 'apelido', { membro: memberId, apelido });
}

export async function passarDono(groupId: string, memberId: string): Promise<void> {
  await pedirAoCarteiro(groupId, 'dono', { membro: memberId });
}

/* --- registro e banidos (leitura) -------------------------------------------- */

export interface LinhaDoRegistro {
  id: string;
  quem: string;
  quemNome: string;
  acao: string;
  alvo: string;
  alvoNome: string;
  detalhe: string;
  em: string;
}

export interface Banido {
  uid: string;
  nome: string;
  motivo: string;
  por: string;
  em: string;
}

const texto = (v: unknown): string => (typeof v === 'string' ? v : '');

export function ouvirRegistro(groupId: string, aoMudar: (l: LinhaDoRegistro[]) => void, aoErrar: (e: unknown) => void): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'registro'), where('groupId', '==', groupId), orderBy('em', 'desc'), limit(200)),
    (snap) =>
      aoMudar(
        snap.docs.map((d) => ({
          id: d.id,
          quem: texto(d.get('quem')),
          quemNome: texto(d.get('quemNome')),
          acao: texto(d.get('acao')),
          alvo: texto(d.get('alvo')),
          alvoNome: texto(d.get('alvoNome')),
          detalhe: texto(d.get('detalhe')),
          em: texto(d.get('em')),
        })),
      ),
    aoErrar,
  );
}

export function ouvirBanidos(groupId: string, aoMudar: (l: Banido[]) => void, aoErrar: (e: unknown) => void): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'banidos'), where('groupId', '==', groupId)),
    (snap) =>
      aoMudar(
        snap.docs
          .map((d) => ({ uid: texto(d.get('uid')), nome: texto(d.get('nome')) || 'Alguém', motivo: texto(d.get('motivo')), por: texto(d.get('por')), em: texto(d.get('em')) }))
          .sort((a, b) => b.em.localeCompare(a.em)),
      ),
    aoErrar,
  );
}

/* --- comandos personalizados (etapa 6) --------------------------------------- */

export interface ComandoDoGrupo {
  id: string;
  nome: string;
  descricao: string;
  resposta: string;
  /** Quem pode usar: ids de cargos (vazio = todo mundo). */
  cargos: string[];
  criadoPor: string;
}

export function ouvirComandos(groupId: string, aoMudar: (l: ComandoDoGrupo[]) => void, aoErrar: (e: unknown) => void): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'comandos'), where('groupId', '==', groupId)),
    (snap) =>
      aoMudar(
        snap.docs
          .map((d) => ({
            id: d.id,
            nome: texto(d.get('nome')),
            descricao: texto(d.get('descricao')),
            resposta: texto(d.get('resposta')),
            cargos: Array.isArray(d.get('cargos')) ? (d.get('cargos') as unknown[]).filter((x): x is string => typeof x === 'string') : [],
            criadoPor: texto(d.get('criadoPor')),
          }))
          .filter((c) => /^[a-z0-9-]{1,32}$/.test(c.nome))
          .sort((a, b) => a.nome.localeCompare(b.nome)),
      ),
    aoErrar,
  );
}

export async function salvarComando(groupId: string, id: string | null, campos: Omit<ComandoDoGrupo, 'id' | 'criadoPor'>): Promise<string> {
  const r = await pedirAoCarteiro(groupId, 'comando-salvar', { ...(id === null ? {} : { comando: id }), campos });
  return String(r['id'] ?? '');
}

export async function apagarComando(groupId: string, id: string): Promise<void> {
  await pedirAoCarteiro(groupId, 'comando-apagar', { comando: id });
}

export async function limparMensagens(groupId: string, canal: string, quantidade: number): Promise<number> {
  const r = await pedirAoCarteiro(groupId, 'limpar', { canal, quantidade });
  return Number(r['apagadas'] ?? 0);
}
