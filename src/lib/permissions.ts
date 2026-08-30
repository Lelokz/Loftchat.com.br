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

import type { Group, MemberId } from '../types/models';

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
