/**
 * Identidade (`@`), amizade e bloqueio.
 *
 * TRÊS DECISÕES QUE VALEM O ARQUIVO INTEIRO:
 *
 * 1. AMIZADE É UM DOCUMENTO POR PAR, com id derivado dos dois uids ORDENADOS.
 *    Não são duas listas, uma em cada pessoa. Com duas listas, aceitar teria de
 *    escrever nos dois lugares e falhar no meio deixaria A amigo de B sem B ser
 *    amigo de A — estado impossível de consertar, e que aqui nem existe.
 *
 * 2. PEDIDOS CRUZADOS VIRAM AMIZADE DE GRAÇA. Como a chave é o par, o pedido de
 *    B para A cai no MESMO documento do pedido de A para B. `sendFriendRequest`
 *    encontra o pendente endereçado a si e aceita, em vez de criar. Não é um
 *    caso especial no código: é consequência do formato da chave.
 *
 * 3. O `@` É ÚNICO PORQUE O ID DO DOCUMENTO É O NOME. O Firestore não tem
 *    restrição de unicidade; quem recusa o segundo a chegar é o servidor, no
 *    `create` de um documento que já existe — nunca uma checagem do cliente,
 *    que sempre chega tarde numa corrida.
 */

import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import type { Unsubscribe } from 'firebase/firestore';

import { db } from './firebase';
import { safeImage } from './images';
import { parseJogos } from './jogos-perfil';
import { contarConquista } from './conquistas';
import { parseLinks, parseStatus } from './profile-extras';
import { MAX_USERNAME_CHANGES } from '../types/models';
import type { Block, Friendship, MemberId, UserProfile } from '../types/models';

/* -------------------------------------------------------------------------- */
/* Nome de usuário                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Minúsculas, números, ponto e underline; 3 a 20.
 *
 * Sem maiúsculas de propósito: com elas, `Lelokz` e `lelokz` seriam nomes
 * diferentes no banco e a mesma coisa para quem lê — e a confusão vira golpe.
 */
const USERNAME_RE = /^[a-z0-9._]{3,20}$/;

/** Devolve o motivo da recusa, ou null quando o nome serve. */
export function usernameProblem(name: string): string | null {
  if (name.length < 3) return 'O nome precisa ter pelo menos 3 caracteres.';
  if (name.length > 20) return 'O nome pode ter no máximo 20 caracteres.';
  if (!USERNAME_RE.test(name)) {
    return 'Use apenas letras minúsculas, números, ponto e underline.';
  }
  return null;
}

/** O dono de um `@`, ou null. É assim que a busca acha alguém. */
export async function uidOfUsername(name: string): Promise<MemberId | null> {
  const snapshot = await getDoc(doc(db, 'usernames', name));
  if (!snapshot.exists()) return null;
  const uid = snapshot.data()['uid'];
  return typeof uid === 'string' ? uid : null;
}

/** O `@` ainda não é de ninguém? (Leitura liberada até sem login: cadastro.) */
export async function usernameFree(name: string): Promise<boolean> {
  return (await uidOfUsername(name)) === null;
}

export class UsernameTakenError extends Error {
  constructor() {
    super('Esse nome já está em uso.');
    this.name = 'UsernameTakenError';
  }
}

/**
 * O servidor recusou a escrita — e NÃO porque o nome estava tomado.
 *
 * Existe separado de `UsernameTakenError` por uma razão medida: enquanto todo
 * `permission-denied` virava "nome já está em uso", uma recusa por REGRA ficava
 * indistinguível de uma colisão. Foi assim que o `@` passou semanas sem nunca
 * ser reservado — o token em cache ainda dizia `email_verified: false`, a regra
 * negava, e a tela culpava um nome que ninguém tinha tomado.
 *
 * Duas causas diferentes pedem duas mensagens diferentes: uma manda escolher
 * outro nome, a outra manda recarregar a página.
 */
export class UsernameRefusedError extends Error {
  constructor() {
    super(
      'O servidor recusou a reserva desse nome. Se você acabou de confirmar o ' +
        'e-mail, recarregue a página e tente de novo.',
    );
    this.name = 'UsernameRefusedError';
  }
}

/**
 * Reserva o `@` e aponta o perfil para ele, numa operação só.
 *
 * A batch é o que garante que os dois andem juntos: ou o nome fica reservado E
 * o perfil aponta para ele, ou nada acontece. Meio caminho aqui seria um nome
 * reservado que ninguém usa, ou um perfil apontando para reserva inexistente.
 *
 * Trocar de nome libera o antigo na MESMA batch — três operações, um resultado.
 */
export async function claimUsername(
  uid: MemberId,
  name: string,
  previous: string | null,
  changesSoFar: number,
): Promise<void> {
  const problem = usernameProblem(name);
  if (problem !== null) throw new Error(problem);
  if (previous !== null && changesSoFar >= MAX_USERNAME_CHANGES) {
    throw new Error(
      `Você já trocou de nome ${MAX_USERNAME_CHANGES} vezes. Esse é o limite.`,
    );
  }

  /*
   * A checagem abaixo é CONVENIÊNCIA, não garantia.
   *
   * Entre ler e escrever cabe outra pessoa. Quem realmente impede o nome
   * duplicado é o `create` da batch, recusado pelo servidor se o documento já
   * existir — e é por isso que o erro daquela falha também vira
   * `UsernameTakenError` abaixo. Esta leitura só existe para o caso comum dar
   * uma mensagem boa sem gastar uma escrita.
   */
  const dono = await uidOfUsername(name);
  if (dono !== null && dono !== uid) throw new UsernameTakenError();

  const batch = writeBatch(db);
  if (previous !== null && previous !== name) {
    batch.delete(doc(db, 'usernames', previous));
  }
  batch.set(doc(db, 'usernames', name), { uid, createdAt: serverTimestamp() });
  batch.update(doc(db, 'users', uid), {
    username: name,
    usernameChanges: changesSoFar + 1,
    pendingUsername: deleteField(),
  });

  try {
    await batch.commit();
  } catch (error) {
    if ((error as { code?: string }).code !== 'permission-denied') throw error;

    /*
     * `permission-denied` TEM DUAS CAUSAS, e elas não se parecem.
     *
     * Uma é a colisão: pelo SDK, escrever sobre um `usernames/` que já existe
     * cai na regra de `update` (`if false`) e volta como permissão negada — não
     * como "já existe". Essa é acionável: escolha outro nome.
     *
     * A outra é a regra recusando a escrita por outro motivo — `verified()`
     * falso, o `update` em `users/`, o `delete` do nome anterior. Aí o nome
     * está LIVRE e mandar a pessoa escolher outro é mentira; foi essa mentira
     * que escondeu o defeito do token durante toda a etapa 14.
     *
     * A leitura abaixo separa as duas: `usernames/` é legível por qualquer
     * pessoa autenticada (ver firestore.rules), então dá para perguntar ao
     * banco de quem é o nome, de verdade.
     */
    const dono = await uidOfUsername(name).catch(() => null);
    if (dono !== null && dono !== uid) throw new UsernameTakenError();

    throw new UsernameRefusedError();
  }
}

/* -------------------------------------------------------------------------- */
/* Amizade                                                                     */
/* -------------------------------------------------------------------------- */

/** O id do par, sempre o mesmo venha de que lado vier. */
export function pairId(a: MemberId, b: MemberId): string {
  return a < b ? `${a}_${b}` : `${b}_${a}`;
}

function toFriendship(id: string, data: Record<string, unknown>): Friendship {
  const members = Array.isArray(data['members']) ? (data['members'] as MemberId[]) : [];
  return {
    id,
    members,
    from: typeof data['from'] === 'string' ? data['from'] : '',
    to: typeof data['to'] === 'string' ? data['to'] : '',
    status: data['status'] === 'accepted' ? 'accepted' : 'pending',
    createdAt: typeof data['createdAt'] === 'string' ? data['createdAt'] : '',
  };
}

/**
 * Tudo o que me liga a alguém: amizades e pedidos, nos dois sentidos.
 *
 * Uma consulta só, sem `orderBy` — a ordenação é no cliente, e assim nenhum
 * índice composto novo é preciso (`array-contains` sozinho usa o automático).
 */
export function subscribeFriendships(
  uid: MemberId,
  onChange: (list: Friendship[]) => void,
  onError: (error: unknown) => void,
): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'friendships'), where('members', 'array-contains', uid)),
    (snapshot) => {
      onChange(snapshot.docs.map((entry) => toFriendship(entry.id, entry.data())));
    },
    onError,
  );
}

/**
 * Manda o pedido — ou ACEITA o que já existe no sentido contrário.
 *
 * Devolve o que aconteceu, porque a tela precisa dizer coisas diferentes: "seu
 * pedido foi enviado" e "vocês agora são amigos" não são a mesma notícia.
 */
export async function sendFriendRequest(
  me: MemberId,
  other: MemberId,
): Promise<'sent' | 'accepted'> {
  if (me === other) throw new Error('Você não pode adicionar a si mesmo.');

  const ref = doc(db, 'friendships', pairId(me, other));

  /*
   * Esta leitura NÃO tem bloqueio no meio — a regra de `read` só olha o
   * `pairId` (ver firestore.rules). Se ela recusar mesmo assim, não é
   * bloqueio nenhum: é defeito nosso, e a mensagem não pode fingir que foi
   * a pessoa que recusou.
   */
  let atual;
  try {
    atual = await getDoc(ref);
  } catch (error) {
    console.error('Falha ao verificar pedido de amizade existente.', error);
    throw new Error('Não foi possível verificar o pedido. Tente de novo.');
  }

  if (atual.exists()) {
    const existente = toFriendship(atual.id, atual.data());
    if (existente.status === 'accepted') throw new Error('Vocês já são amigos.');
    // PEDIDOS CRUZADOS: o dele já estava aqui, então mandar o meu é aceitar.
    if (existente.to === me) {
      await updateDoc(ref, { status: 'accepted' });
      return 'accepted';
    }
    throw new Error('Você já enviou um pedido para essa pessoa.');
  }

  try {
    await setDoc(ref, {
      members: [me, other],
      from: me,
      to: other,
      status: 'pending',
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    /*
     * AQUI, sim, `permission-denied` tem uma causa esperada: o bloqueio
     * (`!blockedBy` na regra de `create` — ver firestore.rules). A mensagem
     * neutra existe para proteger quem bloqueou, não para engolir defeito
     * nosso — por isso o erro original ainda vai para o console antes de
     * virar a mensagem neutra. Qualquer outro erro sobe cru.
     */
    if ((error as { code?: string }).code === 'permission-denied') {
      console.error('Pedido de amizade recusado pelo servidor.', error);
      throw new Error('Não foi possível enviar o pedido para essa pessoa.');
    }
    throw error;
  }
  return 'sent';
}

/** Aceita um pedido recebido. Só quem recebeu chega aqui — a regra cobra. */
export async function acceptFriendRequest(id: string): Promise<void> {
  await updateDoc(doc(db, 'friendships', id), { status: 'accepted' });
  // 0.12.0: amigo novo conta para a insígnia "Enturmado".
  contarConquista({ evento: 'conferir' });
}

/**
 * Recusar, cancelar e desfazer são a MESMA operação: apagar o documento.
 *
 * Guardar um "recusado" ocuparia o id do par e bloquearia qualquer pedido
 * futuro para sempre — e ainda contaria ao remetente que a pessoa recusou, em
 * vez de apenas não ter respondido.
 */
export async function removeFriendship(id: string): Promise<void> {
  await deleteDoc(doc(db, 'friendships', id));
}

/* -------------------------------------------------------------------------- */
/* Bloqueio                                                                    */
/* -------------------------------------------------------------------------- */

export function blockId(me: MemberId, other: MemberId): string {
  return `${me}_${other}`;
}

export function subscribeBlocks(
  uid: MemberId,
  onChange: (list: Block[]) => void,
  onError: (error: unknown) => void,
): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'blocks'), where('uid', '==', uid)),
    (snapshot) => {
      onChange(
        snapshot.docs.map((entry) => ({
          id: entry.id,
          uid,
          blockedUid: (entry.data()['blockedUid'] as string | undefined) ?? '',
          createdAt: (entry.data()['createdAt'] as string | undefined) ?? '',
        })),
      );
    },
    onError,
  );
}

/**
 * Bloqueia e DESFAZ a amizade na mesma operação.
 *
 * As duas juntas numa batch porque separadas há um instante em que a pessoa
 * está bloqueada e ainda amiga — e é justamente nesse instante que ela apareceria
 * na lista de amigos de quem acabou de bloqueá-la.
 */
export async function blockUser(me: MemberId, other: MemberId): Promise<void> {
  const batch = writeBatch(db);
  batch.set(doc(db, 'blocks', blockId(me, other)), {
    uid: me,
    blockedUid: other,
    createdAt: new Date().toISOString(),
  });
  batch.delete(doc(db, 'friendships', pairId(me, other)));
  await batch.commit();
}

export async function unblockUser(me: MemberId, other: MemberId): Promise<void> {
  await deleteDoc(doc(db, 'blocks', blockId(me, other)));
}

/* -------------------------------------------------------------------------- */

/** Perfil público de alguém, pelo uid. Nunca traz e-mail: `users` não tem. */
export async function publicProfile(uid: MemberId): Promise<UserProfile | null> {
  const snapshot = await getDoc(doc(db, 'users', uid));
  if (!snapshot.exists()) return null;
  const data = snapshot.data();
  const perfil: UserProfile = {
    uid,
    displayName: typeof data['displayName'] === 'string' ? data['displayName'] : 'Usuário',
    initials: typeof data['initials'] === 'string' ? data['initials'] : '?',
    createdAt: typeof data['createdAt'] === 'string' ? data['createdAt'] : '',
  };
  if (typeof data['username'] === 'string') {
    Object.assign(perfil, { username: data['username'] });
  }
  if (typeof data['usernameChanges'] === 'number') {
    Object.assign(perfil, { usernameChanges: data['usernameChanges'] });
  }
  if (typeof data['pendingUsername'] === 'string') {
    Object.assign(perfil, { pendingUsername: data['pendingUsername'] });
  }
  for (const campo of ['bio', 'accentId', 'fontId', 'nameColor'] as const) {
    if (typeof data[campo] === 'string') Object.assign(perfil, { [campo]: data[campo] });
  }
  const photo = safeImage(data['photo'], 'foto');
  if (photo !== undefined) Object.assign(perfil, { photo });
  const customStatus = parseStatus(data['customStatus']);
  if (customStatus !== undefined) Object.assign(perfil, { customStatus });
  const links = parseLinks(data['links']);
  if (links.length > 0) Object.assign(perfil, { links });
  const jogos = parseJogos(data['jogos']);
  if (jogos !== undefined) Object.assign(perfil, { jogos });
  if (Array.isArray(data['insigniasNoCartao'])) {
    const ids = data['insigniasNoCartao'].filter((i): i is string => typeof i === 'string' && /^[a-z0-9]{1,24}$/.test(i)).slice(0, 5);
    if (ids.length > 0) Object.assign(perfil, { insigniasNoCartao: ids });
  }
  return perfil;
}
