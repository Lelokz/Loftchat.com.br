/**
 * Quem pode o quê.
 *
 * FONTE ÚNICA DA VERDADE: `Group.ownerId`. Não `Membership.role`.
 *
 * Os dois guardam o mesmo fato, e é justamente por isso que só um pode mandar.
 * As regras do Firestore decidem tudo por `isOwner()`, que lê `groups.ownerId`.
 * Se a interface decidisse por `role`, os dois poderiam divergir — e o sintoma
 * seria o pior que existe: um botão que aparece na tela e o banco recusa.
 *
 * `Membership.role` continua sendo gravada, porque a regra de CRIAÇÃO da
 * membership a examina ('owner' só com o grupo ainda inexistente, 'member' só
 * com convite válido). Ela só não é lida pela UI.
 *
 * Estas funções existem para que nenhum componente escreva
 * `group.ownerId === uid` na mão: quando a posse deixar de ser um campo só
 * (transferir posse, papel de admin), muda aqui e o resto acompanha.
 */

import { PERMISSOES_DO_TODOS, calcCanal, calcServidor, regrasQueValem } from './permissoes';
import type { Cargo, Channel, Group, Member, MemberId } from '../types/models';

/** Dono do grupo. Único papel com poder, nesta etapa. */
export function isOwner(group: Group | null, uid: MemberId): boolean {
  return group !== null && group.ownerId === uid;
}

/**
 * Pode sair do grupo?
 *
 * O dono NÃO pode: não existe transferência de posse nesta etapa, então um grupo
 * sem dono ficaria sem ninguém capaz de administrá-lo ou apagá-lo. A saída do
 * dono é apagar o grupo.
 *
 * Este é o único lugar onde a UI mostra algo desabilitado em vez de esconder —
 * esconder aqui esconderia justamente a explicação.
 */
export function canLeaveGroup(group: Group | null, uid: MemberId): boolean {
  return group !== null && !isOwner(group, uid);
}

/** Motivo de o dono não poder sair, para o `title` do item desabilitado. */
export const OWNER_CANNOT_LEAVE =
  'Você é o dono deste grupo. Para sair, apague o grupo.';

/* --- 0.8.5: CARGOS E PERMISSÕES ---------------------------------------------- */


/** O que o app precisa saber para responder "posso?" (vem do store). */
export interface ContextoDePermissao {
  group: Group | null;
  members: Member[];
  cargos: Cargo[];
  channels: Channel[];
}

/** O que alguém de castigo ainda pode: ver e ler. */
const NO_CASTIGO = new Set(['ver-canal', 'ver-sala', 'ler-antigas', 'ver-chat-sala', 'ver-galeria']);

/* "Ver o grupo como este cargo": o dono vê o app como quem só tem aquele cargo. */
let vendoComo: { groupId: string; cargoId: string } | null = null;
const ouvintesDoVerComo = new Set<() => void>();

export function verComo(groupId: string, cargoId: string | null): void {
  vendoComo = cargoId === null ? null : { groupId, cargoId };
  for (const o of ouvintesDoVerComo) o();
}

export function vendoComoAgora(groupId: string | null): string | null {
  return vendoComo !== null && vendoComo.groupId === groupId ? vendoComo.cargoId : null;
}

export function aoMudarVerComo(f: () => void): () => void {
  ouvintesDoVerComo.add(f);
  return () => ouvintesDoVerComo.delete(f);
}

function regrasDoCanal(ctx: ContextoDePermissao, canalId: string): ReturnType<typeof regrasQueValem> {
  const canal = ctx.channels.find((c) => c.id === canalId);
  if (canal === undefined) return {};
  return regrasQueValem(canal.permissoes ?? {}, canal.categoryId, ctx.group?.permsCategorias ?? {});
}

/**
 * As permissões que tenho (no servidor, ou num canal) — o MESMO caminho das
 * regras do banco: o que o carteiro calculou; sem cálculo, o @todos; canal
 * com regra própria ainda sem cálculo = nada.
 */
export function minhasPermissoes(ctx: ContextoDePermissao, uid: MemberId, canalId?: string): Set<string> {
  const g = ctx.group;
  if (g === null) return new Set();
  const comoCargo = vendoComoAgora(g.id);
  if (comoCargo !== null) {
    const cargos = ctx.cargos.map((c) => ({ id: c.id, posicao: c.posicao, permissoes: c.permissoes, todos: c.todos }));
    const meus = comoCargo === `${g.id}_todos` ? [] : [comoCargo];
    const s = calcServidor('ver-como', '', cargos, meus);
    const voz = ctx.channels.find((c) => c.id === canalId)?.kind === 'voice';
    return new Set(canalId === undefined ? s.perms : calcCanal('ver-como', s.perms, s.admin, meus, regrasDoCanal(ctx, canalId), voz));
  }
  const tudo = (): Set<string> => new Set(calcServidor(uid, uid, [], []).perms);
  if (g.ownerId === uid) return tudo();
  const eu = ctx.members.find((m) => m.id === uid);
  if (eu === undefined) return new Set();
  const todos = ctx.cargos.find((c) => c.todos === true);
  const servidor = eu.perms ?? todos?.permissoes ?? PERMISSOES_DO_TODOS;
  let lista: string[] = servidor;
  if (canalId !== undefined) {
    if (eu.canais?.[canalId] !== undefined) lista = eu.canais[canalId]!;
    else if (Object.keys(regrasDoCanal(ctx, canalId)).length > 0) lista = [];
  }
  if (lista.includes('administrador')) return tudo();
  const castigo = eu.castigoAte !== undefined && Date.parse(eu.castigoAte) > Date.now();
  return new Set(castigo ? lista.filter((p) => NO_CASTIGO.has(p)) : lista);
}

/** Posso fazer `perm` (no servidor, ou no canal dado)? */
export function pode(ctx: ContextoDePermissao, uid: MemberId, perm: string, canalId?: string): boolean {
  return minhasPermissoes(ctx, uid, canalId).has(perm);
}

/** Posso pelo menos uma destas? */
export function podeAlguma(ctx: ContextoDePermissao, uid: MemberId, perms: string[], canalId?: string): boolean {
  const minhas = minhasPermissoes(ctx, uid, canalId);
  return perms.some((p) => minhas.has(p));
}

/** Minha posição (topo menor = mais alto; dono = -1). */
export function meuTopo(ctx: ContextoDePermissao, uid: MemberId): number {
  if (ctx.group?.ownerId === uid && vendoComoAgora(ctx.group.id) === null) return -1;
  const eu = ctx.members.find((m) => m.id === uid);
  if (eu?.topo !== undefined) return eu.topo;
  const meus = ctx.cargos.filter((c) => c.todos !== true && eu?.cargos?.includes(c.id));
  return meus.reduce((m, c) => Math.min(m, c.posicao), 99999);
}

/** Em castigo até quando (ou null). */
export function meuCastigo(ctx: ContextoDePermissao, uid: MemberId): string | null {
  const eu = ctx.members.find((m) => m.id === uid);
  return eu?.castigoAte !== undefined && Date.parse(eu.castigoAte) > Date.now() ? eu.castigoAte : null;
}
