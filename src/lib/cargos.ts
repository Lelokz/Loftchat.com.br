import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import type { Unsubscribe } from 'firebase/firestore';

import { db } from './firebase';
import { PERMISSOES_DO_TODOS, permissoesValidas } from './permissoes';
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

/** Sem @todos ainda (grupo de antes dos cargos): cria ele e o Administrador. */
export async function garantirBasicos(groupId: string, cargos: Cargo[]): Promise<void> {
  if (cargos.some((c) => c.todos === true)) return;
  const agora = new Date().toISOString();
  const lote = writeBatch(db);
  lote.set(doc(db, 'cargos', idDoTodos(groupId)), {
    groupId,
    nome: '@todos',
    cor: null,
    posicao: 9999,
    separado: false,
    mencionavel: false,
    permissoes: PERMISSOES_DO_TODOS,
    todos: true,
    criadoEm: agora,
  });
  if (!cargos.some((c) => c.permissoes.includes('administrador'))) {
    lote.set(doc(collection(db, 'cargos')), {
      groupId,
      nome: 'Administrador',
      cor: { a: '#b23a48' },
      icone: '⚡',
      posicao: 0,
      separado: true,
      mencionavel: false,
      permissoes: ['administrador'],
      criadoEm: agora,
    });
  }
  await lote.commit();
}

export type CamposDoCargo = Pick<Cargo, 'nome' | 'cor' | 'icone' | 'imagem' | 'separado' | 'mencionavel' | 'permissoes'>;

function camposParaGravar(c: CamposDoCargo): Record<string, unknown> {
  return {
    nome: c.nome.trim().slice(0, MAX_NOME_DO_CARGO),
    cor: c.cor === null ? null : c.cor.b === undefined ? { a: c.cor.a } : { a: c.cor.a, b: c.cor.b },
    icone: c.icone ?? '',
    imagem: c.imagem ?? '',
    separado: c.separado,
    mencionavel: c.mencionavel,
    permissoes: permissoesValidas(c.permissoes),
  };
}

/** Cargo novo, logo abaixo do último (antes do @todos). Devolve o id. */
export async function criarCargo(groupId: string, cargos: Cargo[]): Promise<string> {
  const ref = doc(collection(db, 'cargos'));
  const ultimo = cargos.filter((c) => c.todos !== true).reduce((m, c) => Math.max(m, c.posicao), -1);
  await setDoc(ref, {
    groupId,
    ...camposParaGravar({ nome: 'cargo novo', cor: null, separado: false, mencionavel: false, permissoes: [] }),
    posicao: ultimo + 1,
    criadoEm: new Date().toISOString(),
  });
  return ref.id;
}

export async function salvarCargo(id: string, campos: CamposDoCargo, todos: boolean): Promise<void> {
  const gravar = camposParaGravar(campos);
  // O @todos não tem nome, cor, ícone nem bloco: só permissões.
  await updateDoc(doc(db, 'cargos', id), todos ? { permissoes: gravar['permissoes'] } : gravar);
}

/** Nova ordem (do mais alto para o mais baixo), numa gravação só. */
export async function reordenarCargos(ids: string[]): Promise<void> {
  const lote = writeBatch(db);
  ids.forEach((id, i) => lote.update(doc(db, 'cargos', id), { posicao: i }));
  await lote.commit();
}

/** Apaga o cargo e tira ele de quem tinha. */
export async function apagarCargo(groupId: string, id: string, membros: Member[]): Promise<void> {
  const lote = writeBatch(db);
  for (const m of membros) {
    if (m.cargos?.includes(id)) lote.update(doc(db, 'memberships', `${groupId}_${m.id}`), { cargos: arrayRemove(id) });
  }
  lote.delete(doc(db, 'cargos', id));
  await lote.commit();
}

export async function darCargo(groupId: string, memberId: string, cargoId: string, dar: boolean): Promise<void> {
  await updateDoc(doc(db, 'memberships', `${groupId}_${memberId}`), { cargos: dar ? arrayUnion(cargoId) : arrayRemove(cargoId) });
}

export async function apagarCargoSemMembros(id: string): Promise<void> {
  await deleteDoc(doc(db, 'cargos', id));
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
