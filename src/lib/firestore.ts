/**
 * Camada de dados do Firestore. Nenhum componente fala com o banco direto.
 *
 * Duas decisões que valem para o arquivo inteiro:
 *
 * 1. A MAIORIA das consultas usa igualdade num campo só (ou várias
 *    igualdades sem `orderBy`), que o Firestore indexa sozinho — sem
 *    índice composto. Onde isso bastava, a ordenação é feita no CLIENTE de
 *    propósito, para não exigir índice à mão no console. Mas isto NÃO É
 *    universal: `orderBy` combinado com um `where`, mesmo um só, PODE
 *    exigir índice composto (`messages`, `dmMessages` — a etapa 18 apostou
 *    que não precisaria para `dmMessages` e errou, achado em produção; ver
 *    PROGRESSO.md). Consulta nova com `orderBy`: meça com
 *    `npm run check:indexes`, não deduza.
 *
 * 2. Documentos de `groups` e `users` são acompanhados UM A UM com
 *    onSnapshot(doc(...)), sincronizando um Map de unsubscribe. Isso evita o
 *    limite de 30 do operador `in` e faz um rename aparecer na hora.
 *
 * Datas são string ISO gerada no cliente, casando com os tipos em
 * `types/models.ts`. Quando houver regras de segurança, isto vira
 * serverTimestamp().
 */

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  limitToLast,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { Timestamp, serverTimestamp } from 'firebase/firestore';
import type { DocumentData, Unsubscribe } from 'firebase/firestore';

import { db } from './firebase';
import { avisarCarteiro } from './avisos';
import { arquivoDoLoft } from './midia';
import { isPermissionDenied } from './firestore-errors';
import { pairId } from './friends';
import { initials } from './format';
import { safeImage } from './images';
import { parseStatus } from './profile-extras';
import { parseCategories } from './channel-layout';
import { generateInviteCode } from './invite-code';
import { lerRegras } from './permissoes';
import type {
  Attachment,
  Channel,
  ChannelKind,
  DmMessage,
  DmThread,
  Group,
  Invite,
  Member,
  MemberId,
  Message,
  MessageBase,
  MessageKind,
  PinnedKind,
  PinnedMessage,
  ReplyTo,
  UserProfile,
  VoiceParticipant,
} from '../types/models';

const nowIso = (): string => new Date().toISOString();

/**
 * Id determinístico da membership.
 *
 * É o que impede vínculo duplicado por construção e torna entrar num grupo uma
 * operação idempotente, sem precisar procurar antes se já existe.
 */
export const membershipId = (groupId: string, memberId: MemberId): string =>
  `${groupId}_${memberId}`;

type ErrorHandler = (error: unknown) => void;

/**
 * Erro de listener com a assinatura que caiu escrita no texto.
 *
 * "Falha ao ouvir o Firestore" sem dizer QUAL assinatura morreu não ajuda
 * ninguém — foi exatamente o que me custou tempo ao caçar uma corrida aqui.
 *
 * O `code` original é PRESERVADO de propósito: o store decide pelo código se um
 * permission-denied significa "fui removido do grupo" em vez de "falhou".
 * Embrulhar sem copiar o código quebraria essa decisão em silêncio.
 */
function listenerError(label: string, error: unknown): Error {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code: unknown }).code)
      : 'unknown';
  const wrapped = new Error(`assinatura "${label}" falhou (${code})`);
  return Object.assign(wrapped, { code, cause: error });
}

/* -------------------------------------------------------------------------- */
/* Tempo limite das escritas                                                   */
/*                                                                             */
/* O SDK do Firestore NÃO rejeita quando a rede cai: ele enfileira a escrita e  */
/* deixa a promise pendente até reconectar. Sem isto, uma queda de rede deixaria*/
/* o botão preso em "Criando…" para sempre — exatamente o "o botão não faz      */
/* nada" que o tratamento de erro existe para evitar.                          */
/*                                                                             */
/* O código 'deadline-exceeded' faz o firestore-errors.ts produzir a mensagem   */
/* certa sem nenhum caso especial.                                             */
/* -------------------------------------------------------------------------- */

const WRITE_TIMEOUT_MS = 8000;

function timeoutError(): Error {
  const error = new Error('A operação passou do tempo limite.') as Error & { code: string };
  error.code = 'deadline-exceeded';
  return error;
}

function withTimeout<T>(operation: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(timeoutError()), WRITE_TIMEOUT_MS);
    operation.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

/* -------------------------------------------------------------------------- */
/* Conversores — o banco não tem tipo, então tudo entra por aqui              */
/* -------------------------------------------------------------------------- */

function toGroup(id: string, data: DocumentData): Group {
  const photo = safeImage(data['photo'], 'grupo');
  return {
    id,
    name: typeof data['name'] === 'string' ? data['name'] : 'Sem nome',
    initials: typeof data['initials'] === 'string' ? data['initials'] : '?',
    ownerId: typeof data['ownerId'] === 'string' ? data['ownerId'] : '',
    createdAt: typeof data['createdAt'] === 'string' ? data['createdAt'] : '',
    ...(photo === undefined ? {} : { photo }),
    ...(typeof data['description'] === 'string' ? { description: data['description'] } : {}),
    ...(typeof data['accentId'] === 'string' ? { accentId: data['accentId'] } : {}),
    ...(Array.isArray(data['categories']) ? { categories: parseCategories(data['categories']) } : {}),
    ...(typeof data['welcome'] === 'string' && data['welcome'].trim() !== ''
      ? { welcome: data['welcome'].slice(0, 500) }
      : {}),
    ...(typeof data['permsCategorias'] === 'object' && data['permsCategorias'] !== null
      ? { permsCategorias: Object.fromEntries(Object.entries(data['permsCategorias'] as Record<string, unknown>).map(([k, v]) => [k, lerRegras(v)])) }
      : {}),
  };
}

function toChannel(id: string, data: DocumentData): Channel {
  const kind: ChannelKind = data['kind'] === 'voice' ? 'voice' : 'text';
  return {
    id,
    groupId: typeof data['groupId'] === 'string' ? data['groupId'] : '',
    name: typeof data['name'] === 'string' ? data['name'] : 'sem nome',
    kind,
    position: typeof data['position'] === 'number' ? data['position'] : 0,
    createdAt: typeof data['createdAt'] === 'string' ? data['createdAt'] : '',
    ...(typeof data['emoji'] === 'string' && data['emoji'] !== '' ? { emoji: data['emoji'].slice(0, 16) } : {}),
    ...(typeof data['categoryId'] === 'string' && data['categoryId'] !== '' ? { categoryId: data['categoryId'] } : {}),
    ...(typeof data['permissoes'] === 'object' && data['permissoes'] !== null ? { permissoes: lerRegras(data['permissoes']) } : {}),
    ...(typeof data['lento'] === 'number' && data['lento'] > 0 ? { lento: data['lento'] } : {}),
  };
}

/**
 * Os campos comuns a `Message` (grupo) e `DmMessage` (PV) — o que os dois
 * convertores abaixo compartilham. Ver `MessageBase` em `types/models.ts`.
 */
/** Um arquivo mandado (0.5.0): o tipo da mensagem e o anexo (src/lib/midia.ts). */
export interface Midia {
  kind: MessageKind;
  attachment: Attachment;
}

/** Como uma mensagem só com arquivo aparece numa prévia ou citação. */
export function rotuloDaMidia(kind: MessageKind | undefined): string {
  switch (kind) {
    case 'image':
      return '📷 Foto';
    case 'gif':
      return 'GIF';
    case 'video':
      return '🎬 Vídeo';
    case 'sticker':
      return 'Figurinha';
    case 'audio':
      return '🎤 Mensagem de voz';
    default:
      return '';
  }
}

/** Tipos de mensagem com arquivo (0.5.0). Arquivo de fora do Loftchat vira texto. */
const TIPOS_COM_ANEXO = new Set<unknown>(['image', 'gif', 'video', 'sticker', 'audio']);

function toMessageBase(id: string, data: DocumentData): MessageBase {
  const kind = data['kind'];
  const attachment = data['attachment'];

  const message: MessageBase = {
    id,
    authorId: typeof data['authorId'] === 'string' ? data['authorId'] : '',
    kind: TIPOS_COM_ANEXO.has(kind) && arquivoDoLoft((attachment as { url?: unknown } | null)?.url) ? (kind as MessageKind) : 'text',
    body: typeof data['body'] === 'string' ? data['body'] : '',
    sentAt: typeof data['sentAt'] === 'string' ? data['sentAt'] : '',
  };

  // `exactOptionalPropertyTypes` não deixa atribuir undefined: ou o campo entra
  // com valor, ou não entra.
  if (attachment !== undefined && attachment !== null) {
    Object.assign(message, { attachment: attachment as Attachment });
  }
  if (typeof data['editedAt'] === 'string') {
    Object.assign(message, { editedAt: data['editedAt'] });
  }
  // 0.8.5: comando e spoiler.
  const comando = data['comando'] as { nome?: unknown } | undefined;
  if (typeof comando === 'object' && comando !== null && typeof comando.nome === 'string' && /^[a-z0-9-]{1,32}$/.test(comando.nome)) {
    Object.assign(message, { comando: { nome: comando.nome } });
  }
  if (data['spoiler'] === true) Object.assign(message, { spoiler: true });

  const reply = data['replyTo'];
  if (reply !== undefined && reply !== null && typeof reply === 'object') {
    const raw = reply as Record<string, unknown>;
    // Campo a campo, e não um cast: `replyTo` é escrito pelo cliente e uma
    // citação malformada não pode derrubar a lista inteira.
    if (typeof raw['messageId'] === 'string') {
      Object.assign(message, {
        replyTo: {
          messageId: raw['messageId'],
          authorId: typeof raw['authorId'] === 'string' ? raw['authorId'] : '',
          authorName: typeof raw['authorName'] === 'string' ? raw['authorName'] : 'Usuário',
          excerpt: typeof raw['excerpt'] === 'string' ? raw['excerpt'] : '',
          sentAt: typeof raw['sentAt'] === 'string' ? raw['sentAt'] : '',
        },
      });
    }
  }

  return message;
}

function toMessage(id: string, data: DocumentData): Message {
  return {
    ...toMessageBase(id, data),
    groupId: typeof data['groupId'] === 'string' ? data['groupId'] : '',
    channelId: typeof data['channelId'] === 'string' ? data['channelId'] : '',
  };
}

function toDmMessage(id: string, data: DocumentData): DmMessage {
  return {
    ...toMessageBase(id, data),
    threadId: typeof data['threadId'] === 'string' ? data['threadId'] : '',
  };
}

function toDmThread(id: string, data: DocumentData): DmThread {
  const raw = data['lastMessage'];
  const lastMessage =
    raw !== undefined && raw !== null && typeof raw === 'object'
      ? (raw as Record<string, unknown>)
      : {};
  return {
    id,
    members: Array.isArray(data['members'])
      ? data['members'].filter((m): m is string => typeof m === 'string')
      : [],
    lastMessage: {
      body: typeof lastMessage['body'] === 'string' ? lastMessage['body'] : '',
      authorId: typeof lastMessage['authorId'] === 'string' ? lastMessage['authorId'] : '',
      sentAt: typeof lastMessage['sentAt'] === 'string' ? lastMessage['sentAt'] : '',
    },
    lastMessageAt: typeof data['lastMessageAt'] === 'string' ? data['lastMessageAt'] : '',
  };
}

function toPinnedMessage(id: string, data: DocumentData): PinnedMessage {
  const kind = data['kind'];
  const attachment = data['attachment'];

  const pin: PinnedMessage = {
    id,
    messageId: typeof data['messageId'] === 'string' ? data['messageId'] : '',
    authorId: typeof data['authorId'] === 'string' ? data['authorId'] : '',
    authorName: typeof data['authorName'] === 'string' ? data['authorName'] : 'Usuário',
    kind:
      kind === 'image' || kind === 'video' || kind === 'gif' || kind === 'file' || kind === 'audio'
        ? (kind as PinnedKind)
        : 'text',
    excerpt: typeof data['excerpt'] === 'string' ? data['excerpt'] : '',
    sentAt: typeof data['sentAt'] === 'string' ? data['sentAt'] : '',
    pinnedAt: typeof data['pinnedAt'] === 'string' ? data['pinnedAt'] : '',
    pinnedBy: typeof data['pinnedBy'] === 'string' ? data['pinnedBy'] : '',
  };

  if (typeof data['groupId'] === 'string') Object.assign(pin, { groupId: data['groupId'] });
  if (typeof data['channelId'] === 'string') Object.assign(pin, { channelId: data['channelId'] });
  if (typeof data['threadId'] === 'string') Object.assign(pin, { threadId: data['threadId'] });
  if (attachment !== undefined && attachment !== null) {
    Object.assign(pin, { attachment: attachment as Attachment });
  }

  return pin;
}

function toMember(uid: MemberId, data: DocumentData | undefined): Member {
  const displayName =
    data !== undefined && typeof data['displayName'] === 'string' ? data['displayName'] : 'Usuário';
  const photo = safeImage(data?.['photo'], 'foto');
  const customStatus = parseStatus(data?.['customStatus']);
  const nameColor = typeof data?.['nameColor'] === 'string' ? (data['nameColor'] as string) : undefined;
  return {
    id: uid,
    displayName,
    initials:
      data !== undefined && typeof data['initials'] === 'string'
        ? data['initials']
        : initials(displayName),
    // Presença de verdade é outra etapa; por ora todo membro aparece online.
    status: 'online',
    ...(photo === undefined ? {} : { photo }),
    ...(customStatus === undefined ? {} : { customStatus }),
    ...(nameColor === undefined ? {} : { nameColor }),
  };
}

/* -------------------------------------------------------------------------- */
/* Perfil                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Cria ou atualiza o doc em `users`, com o uid como id.
 * Preserva o `createdAt` original quando o perfil já existe.
 */
export async function upsertUserProfile(
  uid: MemberId,
  displayName: string,
  pendingUsername?: string,
): Promise<void> {
  const ref = doc(db, 'users', uid);
  const snapshot = await getDoc(ref);
  const existingCreatedAt = snapshot.exists() ? snapshot.get('createdAt') : undefined;

  const profile: UserProfile = {
    uid,
    displayName,
    initials: initials(displayName),
    createdAt: typeof existingCreatedAt === 'string' ? existingCreatedAt : nowIso(),
    ...(pendingUsername === undefined ? {} : { pendingUsername }),
  };

  /*
   * MERGE, não substituição. Sem ele, cada login reescrevia o documento
   * INTEIRO sem `username`/`usernameChanges` — e a regra (com razão) recusava
   * isso como "trocar de `@` sem pagar a troca". A recusa era calada: o login
   * seguia porque a tela já tinha trocado.
   */
  await setDoc(ref, profile, { merge: true });
}

/* -------------------------------------------------------------------------- */
/* Assinaturas em tempo real                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Grupos em que EU sou membro.
 *
 * memberships(memberId == uid) → um listener por doc de grupo. `loaded` só vira
 * true quando todo grupo apontado por uma membership já respondeu, senão a UI
 * piscaria "nenhum grupo" antes dos documentos chegarem.
 */
export function subscribeMyGroups(
  uid: MemberId,
  onChange: (groups: Group[], loaded: boolean) => void,
  onError: ErrorHandler,
): Unsubscribe {
  const groupUnsubs = new Map<string, Unsubscribe>();
  const groupDocs = new Map<string, Group>();
  const resolved = new Set<string>();
  let membershipsSeen = false;
  let awaitingServer = false;

  const emit = (): void => {
    const loaded =
      membershipsSeen && !awaitingServer && [...groupUnsubs.keys()].every((id) => resolved.has(id));
    const list = [...groupDocs.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    onChange(list, loaded);
  };

  const stopMemberships = onSnapshot(
    query(collection(db, 'memberships'), where('memberId', '==', uid)),
    // `includeMetadataChanges` é obrigatório aqui, não é ajuste fino: sem ele o
    // snapshot dispara UMA vez, na escrita local, e a confirmação do servidor —
    // que é só mudança de metadado, sem mudança de documento — nunca chega. A
    // guarda de hasPendingWrites abaixo esperaria por um evento que não viria, e
    // o grupo recém-criado ficaria invisível para sempre.
    { includeMetadataChanges: true },
    (snapshot) => {
      membershipsSeen = true;
      awaitingServer = false;

      const ids = new Set<string>();
      for (const membership of snapshot.docs) {
        // CORRIDA DE COMPENSAÇÃO DE LATÊNCIA — não remova esta guarda.
        //
        // O SDK entrega a membership recém-criada NA HORA, direto do cache local,
        // antes de o servidor confirmar. Se eu abrisse o listener do documento do
        // grupo agora, ele nasceria RECUSADO: a regra roda no servidor, onde a
        // membership ainda não existe, e um listener negado morre para sempre —
        // o grupo recém-criado nunca apareceria na barra.
        //
        // Esperar a confirmação custa um instante e resolve na raiz. O
        // `awaitingServer` segura o `loaded` nesse meio-tempo, senão a tela
        // piscaria "Nenhum grupo por aqui ainda" logo depois de criar um grupo.
        if (membership.metadata.hasPendingWrites) {
          awaitingServer = true;
          continue;
        }
        const groupId: unknown = membership.get('groupId');
        if (typeof groupId === 'string') ids.add(groupId);
      }

      for (const [id, unsubscribe] of [...groupUnsubs]) {
        if (ids.has(id)) continue;
        unsubscribe();
        groupUnsubs.delete(id);
        groupDocs.delete(id);
        resolved.delete(id);
      }

      for (const id of ids) {
        if (groupUnsubs.has(id)) continue;
        groupUnsubs.set(
          id,
          onSnapshot(
            doc(db, 'groups', id),
            (groupSnapshot) => {
              resolved.add(id);
              if (groupSnapshot.exists()) {
                groupDocs.set(id, toGroup(groupSnapshot.id, groupSnapshot.data()));
              } else {
                groupDocs.delete(id);
              }
              emit();
            },
            (error) => {
              // Perder acesso ao doc do grupo não é falha: é a membership tendo
              // caído — fui removido, ou o grupo foi apagado. Tira da lista em
              // silêncio; o listener de memberships confirma logo em seguida.
              if (isPermissionDenied(error)) {
                groupUnsubs.get(id)?.();
                groupUnsubs.delete(id);
                groupDocs.delete(id);
                resolved.delete(id);
                emit();
                return;
              }
              onError(listenerError(`doc do grupo ${id}`, error));
            },
          ),
        );
      }

      emit();
    },
    (error) => onError(listenerError('minhas memberships', error)),
  );

  return () => {
    stopMemberships();
    for (const unsubscribe of groupUnsubs.values()) unsubscribe();
    groupUnsubs.clear();
  };
}

/** Canais do grupo, ordenados no cliente para não exigir índice composto. */
/** Os canais de um grupo, lidos uma vez (Configurações do grupo aberto pela aba de outro grupo). */
export async function loadChannels(groupId: string): Promise<Channel[]> {
  const snapshot = await getDocs(query(collection(db, 'channels'), where('groupId', '==', groupId)));
  return snapshot.docs.map((entry) => toChannel(entry.id, entry.data()));
}

export function subscribeChannels(
  groupId: string,
  onChange: (channels: Channel[], loaded: boolean) => void,
  onError: ErrorHandler,
): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'channels'), where('groupId', '==', groupId)),
    (snapshot) => {
      const channels = snapshot.docs.map((entry) => toChannel(entry.id, entry.data()));
      channels.sort(
        (a, b) => a.position - b.position || a.name.localeCompare(b.name, 'pt-BR'),
      );
      onChange(channels, true);
    },
    onError,
  );
}

/**
 * Membros do grupo: memberships(groupId) → um listener por doc de usuário.
 *
 * Se o doc de usuário não existir, a pessoa entra na lista como "Usuário" em vez
 * de sumir — membership existente com perfil faltando é dado, não motivo para
 * esconder alguém do painel.
 */
export function subscribeGroupMembers(
  groupId: string,
  onChange: (members: Member[], loaded: boolean) => void,
  onError: ErrorHandler,
): Unsubscribe {
  const userUnsubs = new Map<string, Unsubscribe>();
  const memberDocs = new Map<string, Member>();
  const resolved = new Set<string>();
  const doVinculo = new Map<string, Pick<Member, 'cargos' | 'entrouEm' | 'convite' | 'perms' | 'topo' | 'canais' | 'castigoAte' | 'apelido'>>();
  let membershipsSeen = false;

  const emit = (): void => {
    const loaded = membershipsSeen && [...userUnsubs.keys()].every((id) => resolved.has(id));
    // 0.8.5: com apelido no grupo, o nome que aparece é o apelido.
    const list = [...memberDocs.values()]
      .map((m) => {
        const v = doVinculo.get(m.id);
        return v?.apelido !== undefined ? { ...m, ...v, displayName: v.apelido, nomeReal: m.displayName } : { ...m, ...v };
      })
      .sort((a, b) =>
      a.displayName.localeCompare(b.displayName, 'pt-BR'),
    );
    onChange(list, loaded);
  };

  const stopMemberships = onSnapshot(
    query(collection(db, 'memberships'), where('groupId', '==', groupId)),
    (snapshot) => {
      membershipsSeen = true;
      const ids = new Set<string>();
      for (const membership of snapshot.docs) {
        const memberId: unknown = membership.get('memberId');
        if (typeof memberId !== 'string') continue;
        ids.add(memberId);
        // 0.8.5: cargos, quando entrou e por qual convite.
        const cargos: unknown = membership.get('cargos');
        const entrouEm: unknown = membership.get('joinedAt');
        const convite: unknown = membership.get('inviteCode');
        const perms: unknown = membership.get('perms');
        const topo: unknown = membership.get('topo');
        const canais: unknown = membership.get('canais');
        const castigo: unknown = membership.get('castigoAte');
        const textos = (v: unknown): string[] => (Array.isArray(v) ? v.filter((c): c is string => typeof c === 'string') : []);
        doVinculo.set(memberId, {
          cargos: textos(cargos),
          ...(typeof entrouEm === 'string' ? { entrouEm } : {}),
          ...(typeof convite === 'string' ? { convite } : {}),
          ...(Array.isArray(perms) ? { perms: textos(perms) } : {}),
          ...(typeof topo === 'number' ? { topo } : {}),
          ...(typeof canais === 'object' && canais !== null
            ? { canais: Object.fromEntries(Object.entries(canais as Record<string, unknown>).map(([k, v]) => [k, textos(v)])) }
            : {}),
          ...(castigo instanceof Timestamp ? { castigoAte: castigo.toDate().toISOString() } : {}),
          ...(typeof membership.get('apelido') === 'string' && membership.get('apelido') !== '' ? { apelido: String(membership.get('apelido')).slice(0, 32) } : {}),
        });
      }

      for (const [id, unsubscribe] of [...userUnsubs]) {
        if (ids.has(id)) continue;
        unsubscribe();
        userUnsubs.delete(id);
        memberDocs.delete(id);
        resolved.delete(id);
      }

      for (const id of ids) {
        if (userUnsubs.has(id)) continue;
        userUnsubs.set(
          id,
          onSnapshot(
            doc(db, 'users', id),
            (userSnapshot) => {
              resolved.add(id);
              memberDocs.set(
                id,
                toMember(id, userSnapshot.exists() ? userSnapshot.data() : undefined),
              );
              emit();
            },
            onError,
          ),
        );
      }

      emit();
    },
    onError,
  );

  return () => {
    stopMemberships();
    for (const unsubscribe of userUnsubs.values()) unsubscribe();
    userUnsubs.clear();
  };
}

/**
 * Últimas mensagens do canal, em tempo real.
 *
 * `where('channelId') + orderBy('sentAt')` EXIGE índice composto — ele está em
 * `firestore.indexes.json`. Aqui, ao contrário dos canais, ordenar no cliente
 * não resolveria: com `limitToLast` o servidor precisa saber a ordem para
 * escolher QUAIS 50 devolver.
 *
 * O `onError` importa tanto quanto o sucesso: enquanto o índice está sendo
 * construído a consulta falha, e sem avisar a tela mostraria "nenhuma mensagem
 * ainda" — indistinguível da verdade.
 */
/**
 * Mensagens de um canal, em tempo real.
 *
 * O `where('groupId')` NÃO é redundante com o `where('channelId')`, embora um
 * canal só pertença a um grupo. Ele existe porque REGRAS NÃO FILTRAM: num
 * `list`, o Firestore confere se as RESTRIÇÕES DA CONSULTA garantem a regra —
 * ele não inspeciona os documentos que voltariam. A regra de `messages` exige
 * isMember(resource.data.groupId); sem groupId na consulta, o servidor não tem
 * como provar nada e recusa tudo com permission-denied, mesmo que o resultado
 * fosse vazio. Tirar esta linha faz toda leitura de mensagem parar de funcionar.
 */
export function subscribeMessages(
  groupId: string,
  channelId: string,
  pages: number,
  onChange: (messages: Message[], atStart: boolean) => void,
  onError: ErrorHandler,
): Unsubscribe {
  const limit = MESSAGE_PAGE_SIZE * pages;
  return onSnapshot(
    query(
      collection(db, 'messages'),
      where('groupId', '==', groupId),
      where('channelId', '==', channelId),
      orderBy('sentAt'),
      limitToLast(limit),
    ),
    (snapshot) => {
      /*
       * MENOS documentos do que o limite = chegamos ao começo do canal.
       *
       * Não precisa de contagem nem de consulta extra: se o servidor tinha mais,
       * ele teria mandado o limite cheio.
       */
      const atStart = snapshot.size < limit;
      onChange(
        snapshot.docs.map((entry) => toMessage(entry.id, entry.data())),
        atStart,
      );
    },
    onError,
  );
}

/** Teto da galeria: as fotos, GIFs e vídeos mais novos do grupo. */
export const LIMITE_DA_GALERIA = 300;

/**
 * GALERIA DO GRUPO (0.8.0): imagens, GIFs e vídeos, das mais novas para as
 * mais velhas, só dos últimos 60 dias (os arquivos somem do carteiro depois
 * disso). 0.8.5: UMA consulta por canal que a pessoa vê — o banco fecha as
 * mensagens canal a canal. Índice groupId + channelId + kind + sentAt.
 */
export function subscribeGaleria(
  groupId: string,
  canais: string[],
  desde: string,
  onChange: (messages: Message[]) => void,
  onError: ErrorHandler,
): Unsubscribe {
  const porCanal = new Map<string, Message[]>();
  const juntar = (): void => {
    if (porCanal.size < canais.length) return;
    const todas = [...porCanal.values()].flat().sort((a, b) => b.sentAt.localeCompare(a.sentAt));
    onChange(todas.slice(0, LIMITE_DA_GALERIA));
  };
  if (canais.length === 0) queueMicrotask(() => onChange([]));
  const paradas = canais.map((canal) =>
    onSnapshot(
      query(
        collection(db, 'messages'),
        where('groupId', '==', groupId),
        where('channelId', '==', canal),
        where('kind', 'in', ['image', 'gif', 'video']),
        where('sentAt', '>=', desde),
        orderBy('sentAt', 'desc'),
        limit(LIMITE_DA_GALERIA),
      ),
      (snapshot) => {
        porCanal.set(canal, snapshot.docs.map((entry) => toMessage(entry.id, entry.data())).filter((m) => m.attachment !== undefined && m.kind !== 'text'));
        juntar();
      },
      onError,
    ),
  );
  return () => paradas.forEach((p) => p());
}

/* -------------------------------------------------------------------------- */
/* Mutações                                                                    */
/* -------------------------------------------------------------------------- */

export const MESSAGE_PAGE_SIZE = 50;

/**
 * Teto de páginas do histórico. 10 × 50 = 500 mensagens.
 *
 * POR QUE EXISTE TETO: paginar aqui é REABRIR o listener com um limite maior, e
 * cada página relê a janela inteira. O custo acumulado até a página N é
 * `50 · N(N+1)/2` — cresce ao QUADRADO:
 *
 *     até a página  3 →   150 mensagens →     300 leituras
 *     até a página  5 →   250 mensagens →     750 leituras
 *     até a página 10 →   500 mensagens →   2.750 leituras   ← o teto
 *     até a página 20 → 1.000 mensagens →  10.500 leituras
 *
 * O plano gratuito dá 50 mil leituras POR DIA, e ela estourou em 23/08/2026. Sem
 * teto, uma pessoa rolando uma conversa longa consome uma fração absurda dela.
 *
 * No teto o topo DIZ que parou e por quê. Um limite silencioso seria pior: a
 * pessoa acharia que chegou ao começo da conversa quando não chegou.
 *
 * Mexer neste número é comprar leituras na tabela acima. A saída definitiva —
 * quando existir busca de mensagem — é cursor + merge; ver PROGRESSO.md.
 */
export const MAX_MESSAGE_PAGES = 10;

/**
 * `sentAt` é ISO gerado no cliente, e não `serverTimestamp()`, de propósito: o
 * sentinel chega NULO no snapshot local até o servidor confirmar, e nulo ordena
 * primeiro — a mensagem recém-enviada pularia para o topo da lista por um
 * instante. Com valor concreto a compensação de latência põe ela no lugar certo.
 * A dívida é relógio dessincronizado entre máquinas.
 */
/* 0.8.5 MODO LENTO: o app diz se este canal pede a marca (canal lento e eu sem "Ignorar o modo lento"). */
let marcarLento: (channelId: string) => boolean = () => false;
let aoMandarNoCanal: (channelId: string) => void = () => undefined;
export function ligarModoLento(precisa: (channelId: string) => boolean, mandou: (channelId: string) => void): void {
  marcarLento = precisa;
  aoMandarNoCanal = mandou;
}

/** Liga/desliga o modo lento de um canal (permissão "Editar canais"). */
export async function mudarModoLento(channelId: string, segundos: number): Promise<void> {
  await withTimeout(updateDoc(doc(db, 'channels', channelId), { lento: Math.max(0, Math.min(21600, Math.round(segundos))) }));
}

export async function sendMessage(
  groupId: string,
  channelId: string,
  authorId: MemberId,
  rawBody: string,
  replyTo?: ReplyTo,
  midia?: Midia,
  /** 0.8.5: a mensagem vem de um comando (e/ou é spoiler). */
  extra?: { comando?: string; spoiler?: boolean },
): Promise<void> {
  const body = rawBody.trim();
  if (body === '' && midia === undefined) return;

  const sentAt = nowIso();
  const dados = {
    groupId,
    channelId,
    authorId,
    kind: midia?.kind ?? 'text',
    body,
    sentAt,
    ...(midia === undefined ? {} : { attachment: midia.attachment }),
    // Só entra quando existe: documento com `replyTo: undefined` é recusado.
    ...(replyTo === undefined ? {} : { replyTo }),
    ...(extra?.comando === undefined ? {} : { comando: { nome: extra.comando } }),
    ...(extra?.spoiler === true ? { spoiler: true } : {}),
  };
  let nova: { id: string };
  if (marcarLento(channelId)) {
    // 0.8.5 MODO LENTO: a mensagem vai junto com a marca de horário (o banco confere o intervalo).
    const ref = doc(collection(db, 'messages'));
    const lote = writeBatch(db);
    lote.set(ref, dados);
    lote.set(doc(db, 'lentos', `${channelId}_${authorId}`), { channelId, em: serverTimestamp() });
    await withTimeout(lote.commit());
    nova = ref;
  } else {
    nova = await withTimeout(addDoc(collection(db, 'messages'), dados));
  }
  aoMandarNoCanal(channelId);
  avisarCarteiro('grupo', nova.id);
  // Não lidas (0.4.5): o canal guarda a hora e o autor da última mensagem.
  void updateDoc(doc(db, 'channels', channelId), { ultimaEm: sentAt, ultimaDe: authorId }).catch(() => undefined);
}

/** Quanto do texto citado (resposta ou fixada) é copiado para dentro do documento novo. */
const EXCERPT_MAX = 120;

function excerptOf(rawBody: string): string {
  const texto = rawBody.trim();
  return texto.length > EXCERPT_MAX ? `${texto.slice(0, EXCERPT_MAX)}…` : texto;
}

/**
 * Monta a citação a partir da mensagem original, no momento de responder.
 * `MessageBase`, não `Message`: serve para citar tanto mensagem de grupo
 * quanto de PV — nenhum dos dois campos extras de `Message` é usado aqui.
 */
export function buildReplyTo(message: MessageBase, authorName: string): ReplyTo {
  return {
    messageId: message.id,
    authorId: message.authorId,
    authorName,
    excerpt: excerptOf(message.body !== '' ? message.body : rotuloDaMidia(message.kind)),
    sentAt: message.sentAt,
  };
}

/**
 * Edita o TEXTO de uma mensagem. Só o autor, e só o texto.
 *
 * `sentAt` fica intocado de propósito: a lista é ordenada por ele, então editar
 * não pode fazer a mensagem pular de lugar na conversa. A regra do Firestore
 * cobra isso independentemente daqui — ver `hasOnly` em firestore.rules.
 */
export async function editMessage(messageId: string, rawBody: string): Promise<void> {
  const body = rawBody.trim();
  // Texto vazio CANCELA em vez de apagar: apagar tem caminho próprio, e um
  // Enter distraído não pode virar exclusão silenciosa.
  if (body === '') return;

  await withTimeout(
    updateDoc(doc(db, 'messages', messageId), { body, editedAt: nowIso() }),
  );
}

export interface CreatedGroup {
  groupId: string;
  /** Canal #geral, que fica selecionado logo após criar. */
  generalChannelId: string;
}

/**
 * Cria grupo + minha membership de dono + três canais numa operação em lote.
 * Ou tudo isso existe, ou nada existe — nunca um grupo órfão sem canais.
 */
export async function createGroup(uid: MemberId, rawName: string): Promise<CreatedGroup> {
  const name = rawName.trim();
  const createdAt = nowIso();
  const batch = writeBatch(db);

  const groupRef = doc(collection(db, 'groups'));
  batch.set(groupRef, {
    name,
    initials: initials(name),
    ownerId: uid,
    createdAt,
  });

  batch.set(doc(db, 'memberships', membershipId(groupRef.id, uid)), {
    groupId: groupRef.id,
    memberId: uid,
    role: 'owner',
    joinedAt: createdAt,
  });

  const announcements = doc(collection(db, 'channels'));
  const general = doc(collection(db, 'channels'));
  const voice = doc(collection(db, 'channels'));

  // `geral` é position 0 de propósito, e isso NÃO é só ordem visual: quem cria o
  // grupo cai em `geral` por causa do generalChannelId devolvido aqui, enquanto
  // qualquer outra aba cai no primeiro canal de texto por posição. Se as duas
  // regras discordarem, o mesmo grupo abre em canais diferentes dependendo de
  // como você chegou nele. Mexer nestas posições exige rever pickDefaultChannel.
  batch.set(general, {
    groupId: groupRef.id,
    name: 'geral',
    kind: 'text',
    position: 0,
    createdAt,
  });
  batch.set(announcements, {
    groupId: groupRef.id,
    name: 'anúncios',
    kind: 'text',
    position: 1,
    createdAt,
  });
  batch.set(voice, {
    groupId: groupRef.id,
    name: 'Sala Principal',
    kind: 'voice',
    position: 0,
    createdAt,
  });

  await withTimeout(batch.commit());
  return { groupId: groupRef.id, generalChannelId: general.id };
}

/**
 * `existing` são os canais que o store já tem em memória — evita uma leitura só
 * para descobrir a próxima posição dentro do tipo.
 */
export async function createChannel(
  groupId: string,
  rawName: string,
  kind: ChannelKind,
  existing: Channel[],
): Promise<void> {
  const sameKind = existing.filter((channel) => channel.kind === kind);
  const position =
    sameKind.length === 0 ? 0 : Math.max(...sameKind.map((channel) => channel.position)) + 1;

  await withTimeout(
    setDoc(doc(collection(db, 'channels')), {
      groupId,
      name: rawName.trim(),
      kind,
      position,
      createdAt: nowIso(),
    }),
  );
}

/**
 * Sorteia um código livre e grava o convite. O código é o id do documento.
 *
 * `groupName` vai junto porque as regras só deixam MEMBROS lerem o documento do
 * grupo — e quem abre o convite ainda não é membro.
 */
export async function createInvite(
  groupId: string,
  groupName: string,
  uid: MemberId,
): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateInviteCode();
    const ref = doc(db, 'invites', code);
    const existing = await withTimeout(getDoc(ref));
    if (existing.exists()) continue;

    const invite: Invite = { code, groupId, groupName, createdBy: uid, createdAt: nowIso() };
    await withTimeout(setDoc(ref, invite));
    return code;
  }
  throw new Error('Não foi possível sortear um código livre.');
}

/**
 * O CÓDIGO DO GRUPO (16/11/2026): um código fixo por grupo, que o dono passa
 * adiante. É um convite como os outros (o id do documento em `invites`); o
 * "fixo" é usar sempre o que já existe. Grupo sem nenhum (os de antes desta
 * mudança) ganha um aqui. Só o dono chega aqui: a regra de `invites` só deixa
 * o dono listar os convites do próprio grupo.
 */
export async function groupInviteCode(groupId: string, groupName: string, uid: MemberId): Promise<string> {
  const existentes = await withTimeout(
    getDocs(query(collection(db, 'invites'), where('groupId', '==', groupId), limit(1))),
  );
  const atual = existentes.docs[0];
  if (atual !== undefined) return atual.id;
  return await createInvite(groupId, groupName, uid);
}

/**
 * TROCAR O CÓDIGO: apaga todos os convites do grupo (o código antigo para de
 * valer na hora) e sorteia um novo. Para quando o código vazou.
 */
export async function newGroupInviteCode(groupId: string, groupName: string, uid: MemberId): Promise<string> {
  const todos = await withTimeout(getDocs(query(collection(db, 'invites'), where('groupId', '==', groupId))));
  await Promise.all(todos.docs.map((d) => withTimeout(deleteDoc(d.ref))));
  return await createInvite(groupId, groupName, uid);
}

export async function getInvite(code: string): Promise<Invite | null> {
  const snapshot = await getDoc(doc(db, 'invites', code));
  if (!snapshot.exists()) return null;
  const data = snapshot.data();
  return {
    code,
    groupId: typeof data['groupId'] === 'string' ? data['groupId'] : '',
    groupName: typeof data['groupName'] === 'string' ? data['groupName'] : '',
    createdBy: typeof data['createdBy'] === 'string' ? data['createdBy'] : '',
    createdAt: typeof data['createdAt'] === 'string' ? data['createdAt'] : '',
  };
}

export async function getGroup(groupId: string): Promise<Group | null> {
  const snapshot = await getDoc(doc(db, 'groups', groupId));
  return snapshot.exists() ? toGroup(snapshot.id, snapshot.data()) : null;
}

export async function isMemberOf(groupId: string, uid: MemberId): Promise<boolean> {
  const snapshot = await getDoc(doc(db, 'memberships', membershipId(groupId, uid)));
  return snapshot.exists();
}

/**
 * Entra no grupo. LÊ ANTES DE ESCREVER de propósito: o id determinístico torna o
 * setDoc idempotente, mas um setDoc cego rebaixaria o DONO para 'member' se ele
 * abrisse o próprio link de convite.
 */
export async function joinGroup(
  groupId: string,
  uid: MemberId,
  inviteCode: string,
): Promise<void> {
  const ref = doc(db, 'memberships', membershipId(groupId, uid));
  const existing = await withTimeout(getDoc(ref));
  if (existing.exists()) return;

  await withTimeout(
    setDoc(ref, {
      groupId,
      memberId: uid,
      role: 'member',
      joinedAt: nowIso(),
      // As regras conferem este código: é a única forma de elas saberem que
      // existe um convite válido para este grupo (regra não faz query).
      inviteCode,
    }),
  );
}

/* -------------------------------------------------------------------------- */
/* Sair e apagar                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Sair do grupo é apagar a própria membership.
 *
 * As mensagens que a pessoa escreveu FICAM. Sair de um grupo não é apagar o que
 * você disse nele — quem continua lá perderia metade das conversas.
 */
export async function leaveGroup(groupId: string, uid: MemberId): Promise<void> {
  await withTimeout(deleteDoc(doc(db, 'memberships', membershipId(groupId, uid))));
}

/** Etapas da cascata, na ordem em que acontecem. */
export type DeleteStep = 'voice' | 'messages' | 'channels' | 'invites' | 'members' | 'group';

export interface DeleteProgress {
  step: DeleteStep;
  /** Quantos documentos já saíram no total. */
  removed: number;
}

/** Teto do writeBatch é 500 operações; 400 deixa folga. */
const DELETE_PAGE = 400;

/**
 * Apaga uma página de documentos filtrados por groupId, e opcionalmente por mais
 * um campo.
 *
 * `groupId` é obrigatório mesmo quando o filtro que interessa é outro — apagar
 * um canal quer as mensagens DAQUELE canal, mas uma consulta só por `channelId`
 * seria recusada inteira: as regras examinam `resource.data.groupId`, e o que
 * não está nas restrições da consulta não é provável. É a mesma armadilha que
 * custou a etapa 4.
 *
 * Devolve quantos saíram. Zero significa "acabou" — quem chama repete até isso.
 */
async function deletePage(
  collectionId: string,
  groupId: string,
  skipDocId: string | null,
  extra?: { field: string; value: string },
): Promise<number> {
  const filters = [where('groupId', '==', groupId)];
  if (extra !== undefined) filters.push(where(extra.field, '==', extra.value));

  const snapshot = await withTimeout(
    getDocs(query(collection(db, collectionId), ...filters, limit(DELETE_PAGE))),
  );

  const docs = snapshot.docs.filter((entry) => entry.id !== skipDocId);
  if (docs.length === 0) return 0;

  const batch = writeBatch(db);
  for (const entry of docs) batch.delete(entry.ref);
  await withTimeout(batch.commit());
  return docs.length;
}

/**
 * Os sinais WebRTC que sobraram nos canais de voz do grupo (de quem fechou o
 * programa à força no meio da chamada). Quem sai direito já limpa os seus.
 *
 * Melhor esforço: a regra que deixa o DONO apagar sinal dos outros é de
 * 23/11/2026; se ela ainda não estiver publicada, o permission-denied aqui não
 * pode travar a exclusão do grupo inteiro — sobra lixo, como antes.
 */
async function apagarSobrasDaVoz(groupId: string): Promise<number> {
  let apagados = 0;
  const canais = await withTimeout(
    getDocs(query(collection(db, 'channels'), where('groupId', '==', groupId), where('kind', '==', 'voice'))),
  );
  for (const canal of canais.docs) {
    try {
      for (;;) {
        const sinais = await withTimeout(
          getDocs(
            query(
              collection(db, 'voiceChannels', canal.id, 'signals'),
              where('groupId', '==', groupId),
              limit(DELETE_PAGE),
            ),
          ),
        );
        if (sinais.empty) break;
        const batch = writeBatch(db);
        for (const sinal of sinais.docs) batch.delete(sinal.ref);
        await withTimeout(batch.commit());
        apagados += sinais.size;
      }
    } catch (error) {
      if (!isPermissionDenied(error)) throw error;
    }
  }
  return apagados;
}

/**
 * Apaga o grupo inteiro, na ordem que as REGRAS exigem.
 *
 * A ordem não é estética. `isOwner()` faz um get() no documento do grupo, então
 * todo passo protegido por isOwner precisa acontecer ENQUANTO O GRUPO AINDA
 * EXISTE. Apagar o grupo primeiro deixaria mensagens, canais e convites órfãos e
 * inalcançáveis para sempre — ninguém mais teria permissão de tocá-los.
 *
 * O passo 6 é o único que sobrevive ao grupo, porque cai no outro ramo da regra
 * de memberships (`memberId == uid()`), que não olha o grupo.
 *
 * IDEMPOTENTE POR CONSTRUÇÃO: cada passo re-consulta antes de apagar. Se cair no
 * meio, chamar de novo continua de onde parou. É isso que faz o "Tentar de novo"
 * funcionar sem guardar estado nenhum.
 */
export async function deleteGroupCascade(
  groupId: string,
  uid: MemberId,
  onProgress: (progress: DeleteProgress) => void,
): Promise<void> {
  let removed = 0;
  const advance = (step: DeleteStep): void => onProgress({ step, removed });

  // 0. A sala de voz (revisão 23/11/2026): quem estava nela e os sinais da
  //    chamada. Antes dos canais, porque os sinais moram DENTRO do canal de
  //    voz, e antes das memberships, porque a leitura pede isMember.
  advance('voice');
  removed += await apagarSobrasDaVoz(groupId);
  for (;;) {
    const count = await deletePage('voiceParticipants', groupId, null);
    if (count === 0) break;
    removed += count;
    advance('voice');
  }

  // 1-3. Mensagens podem ser milhares; canais e convites, poucos. O laço é o
  //      mesmo para os três, e é o que respeita o teto do batch.
  for (const step of ['messages', 'channels', 'invites'] as const) {
    advance(step);
    for (;;) {
      const count = await deletePage(step, groupId, null);
      if (count === 0) break;
      removed += count;
      advance(step);
    }
  }
  // 0.8.5: cargos, comandos, registro e banidos, junto com os convites na barra.
  for (const colecao of ['cargos', 'comandos', 'registro', 'banidos']) {
    for (;;) {
      const count = await deletePage(colecao, groupId, null);
      if (count === 0) break;
      removed += count;
      advance('invites');
    }
  }

  // 4. Memberships dos OUTROS. A minha fica para o fim — apagá-la aqui me
  //    tiraria o isOwner e travaria os passos seguintes.
  advance('members');
  const myMembershipId = membershipId(groupId, uid);
  for (;;) {
    const count = await deletePage('memberships', groupId, myMembershipId);
    if (count === 0) break;
    removed += count;
    advance('members');
  }

  // 5. O banner (etapa 3a) e o documento do grupo.
  advance('group');
  await withTimeout(deleteDoc(doc(db, 'groupArt', groupId)));
  await withTimeout(deleteDoc(doc(db, 'groups', groupId)));
  removed += 1;

  // 6. E só agora a minha membership.
  await withTimeout(deleteDoc(doc(db, 'memberships', myMembershipId)));
  removed += 1;
  advance('group');
}

/**
 * Apaga um canal e as mensagens dele.
 *
 * As mensagens vão junto de propósito: um canal apagado deixaria mensagens que
 * nenhuma tela alcança — invisíveis, mas ocupando espaço e aparecendo em
 * qualquer varredura futura por grupo. Mesma paginação da cascata.
 */
export async function deleteChannel(groupId: string, channelId: string): Promise<void> {
  for (;;) {
    const count = await deletePage('messages', groupId, null, {
      field: 'channelId',
      value: channelId,
    });
    if (count === 0) break;
  }
  await withTimeout(deleteDoc(doc(db, 'channels', channelId)));
}

/** O dono remove alguém do grupo apagando a membership daquela pessoa. */
export async function removeMember(groupId: string, memberId: MemberId): Promise<void> {
  await withTimeout(deleteDoc(doc(db, 'memberships', membershipId(groupId, memberId))));
}

/**
 * Apaga uma mensagem.
 *
 * Quem pode é decidido pela REGRA (autor ou dono do grupo), não aqui. A tela só
 * oferece o item a quem pode, mas essa é a camada de conveniência — a de
 * verdade é o banco.
 */
export async function deleteMessage(messageId: string): Promise<void> {
  await withTimeout(deleteDoc(doc(db, 'messages', messageId)));
}

/* -------------------------------------------------------------------------- */
/* Conversas privadas (PV) — etapa 18                                          */
/*                                                                             */
/* Duas coleções PRÓPRIAS, `dmThreads` e `dmMessages` — não reaproveitam       */
/* `messages`: PV não tem grupo, não tem canal, não tem dono. Ver PROGRESSO.md */
/* (etapa 18) para a comparação completa com a alternativa descartada.        */
/* -------------------------------------------------------------------------- */

/**
 * Minhas conversas, mais recente primeiro — em tempo real, numa assinatura só.
 *
 * `where('members', 'array-contains', uid)` é o que a REGRA de `list` exige
 * (ver firestore.rules); o `orderBy('lastMessageAt')` vem do trecho da última
 * mensagem, DENORMALIZADO no próprio documento — é isso que faz a lista
 * inteira custar UMA leitura por conversa, e nunca uma por mensagem.
 */
export function subscribeDmThreads(
  uid: MemberId,
  onChange: (threads: DmThread[]) => void,
  onError: ErrorHandler,
): Unsubscribe {
  return onSnapshot(
    query(
      collection(db, 'dmThreads'),
      where('members', 'array-contains', uid),
      orderBy('lastMessageAt', 'desc'),
    ),
    (snapshot) => onChange(snapshot.docs.map((entry) => toDmThread(entry.id, entry.data()))),
    onError,
  );
}

/**
 * Histórico de UMA conversa privada, em tempo real.
 *
 * `where('threadId')` existe pela MESMA razão do `where('groupId')` em
 * `subscribeMessages`: regras não filtram, e a regra de `dmMessages` olha
 * `resource.data.threadId` — sem restringir esse campo na consulta, o
 * Firestore recusa tudo, mesmo que o resultado fosse vazio.
 */
export function subscribeDmMessages(
  threadId: string,
  pages: number,
  onChange: (messages: DmMessage[], atStart: boolean) => void,
  onError: ErrorHandler,
): Unsubscribe {
  const cap = MESSAGE_PAGE_SIZE * pages;
  return onSnapshot(
    query(
      collection(db, 'dmMessages'),
      where('threadId', '==', threadId),
      orderBy('sentAt'),
      limitToLast(cap),
    ),
    (snapshot) => {
      const atStart = snapshot.size < cap;
      onChange(
        snapshot.docs.map((entry) => toDmMessage(entry.id, entry.data())),
        atStart,
      );
    },
    onError,
  );
}

/**
 * Manda uma mensagem privada — e, no MESMO `writeBatch`, atualiza o resumo em
 * `dmThreads` (o que a lista de conversas lê, sem nunca tocar em `dmMessages`).
 *
 * `set(..., { merge: true })` no doc da thread serve para os dois casos —
 * primeira mensagem (documento ainda não existe: a regra avalia como
 * `create`) e as seguintes (documento já existe: `update`) — sem o cliente
 * precisar saber qual dos dois é. `members` vai em toda escrita, mesmo
 * quando não muda: `diff().affectedKeys()` da regra de `update` só nota
 * campo que realmente mudou de VALOR, então reenviar o mesmo valor não
 * dispara o `hasOnly(['lastMessage', 'lastMessageAt'])`.
 *
 * `permission-denied` aqui SÓ tem uma causa esperada: bloqueio (é a única
 * condição da regra de `create` que depende de outra pessoa, e não do
 * remetente). Por isso — e só aqui, ao redor do `commit`, não da função
 * inteira — ele vira a mensagem neutra; qualquer outro erro sobe cru. Mesmo
 * padrão do `sendFriendRequest` corrigido na etapa 16.
 */
export async function sendDmMessage(
  me: MemberId,
  other: MemberId,
  rawBody: string,
  replyTo?: ReplyTo,
  midia?: Midia,
): Promise<void> {
  const body = rawBody.trim();
  if (body === '' && midia === undefined) return;

  const threadId = pairId(me, other);
  const sentAt = nowIso();
  const batch = writeBatch(db);

  const nova = doc(collection(db, 'dmMessages'));
  batch.set(nova, {
    threadId,
    authorId: me,
    kind: midia?.kind ?? 'text',
    body,
    sentAt,
    ...(midia === undefined ? {} : { attachment: midia.attachment }),
    ...(replyTo === undefined ? {} : { replyTo }),
  });
  batch.set(
    doc(db, 'dmThreads', threadId),
    {
      /*
       * SEMPRE NA MESMA ORDEM, não `[me, other]`. Achado rodando o teste, não
       * por leitura: `[me, other]` grava `[A,B]` quando A manda e `[B,A]`
       * quando B manda — o MESMO PAR, mas ARRAYS DIFERENTES para o
       * Firestore, cuja comparação é por posição. A regra de `update` só
       * aceita mexer em `lastMessage`/`lastMessageAt` (`hasOnly`); um
       * `members` que muda de ORDEM (não de conteúdo) contava como campo
       * tocado e derrubava a regra — a SEGUNDA pessoa a responder em
       * qualquer PV nunca conseguia mandar mensagem nenhuma. Ordenar aqui
       * como `pairId` já ordena o id resolve: o valor sai sempre igual,
       * venha de quem vier, e `diff()` não vê `members` como alterado.
       */
      members: me < other ? [me, other] : [other, me],
      lastMessage: { body: body !== '' ? body : rotuloDaMidia(midia?.kind), authorId: me, sentAt },
      lastMessageAt: sentAt,
    },
    { merge: true },
  );

  try {
    await withTimeout(batch.commit());
  } catch (error) {
    if (isPermissionDenied(error)) {
      console.error('Mensagem privada recusada pelo servidor.', error);
      throw new Error('Não foi possível enviar a mensagem.');
    }
    throw error;
  }
  avisarCarteiro('pv', nova.id);
}

/** Edita o TEXTO de uma mensagem privada. Só o autor, e só o texto — mesma disciplina de `editMessage`. */
export async function editDmMessage(messageId: string, rawBody: string): Promise<void> {
  const body = rawBody.trim();
  if (body === '') return;

  await withTimeout(
    updateDoc(doc(db, 'dmMessages', messageId), { body, editedAt: nowIso() }),
  );
}

/**
 * Apaga uma mensagem privada. Só o autor — PV não tem dono, não tem
 * moderação, ao contrário de `deleteMessage`.
 */
export async function deleteDmMessage(messageId: string): Promise<void> {
  await withTimeout(deleteDoc(doc(db, 'dmMessages', messageId)));
}

/* -------------------------------------------------------------------------- */
/* Mensagens fixadas — etapa 19                                                */
/*                                                                             */
/* UMA coleção para grupo e PV, com o escopo por presença de campo             */
/* (`groupId`+`channelId` OU `threadId` — nunca os dois, ver firestore.rules). */
/* Sem `orderBy` nas duas consultas — a lista ordena por `pinnedAt` no         */
/* CLIENTE, de propósito, para não repetir a aposta que saiu errada com       */
/* `dmMessages` (ver PROGRESSO.md). ids são AUTOGERADOS, nunca                 */
/* determinísticos: fixar a mesma mensagem duas vezes (a corrida do PV, com   */
/* os dois participantes fixando ao mesmo tempo) não quebra nada — a TELA     */
/* agrupa por `messageId` ao exibir, e `unpinMessages` apaga o grupo inteiro. */
/* -------------------------------------------------------------------------- */

/**
 * Fixadas de UM canal, em tempo real.
 *
 * `groupId` + `channelId`: dois filtros de igualdade, SEM `orderBy` — a
 * mesma forma que `signals` (`voice-signaling.ts`) já usa em produção sem
 * pedir índice composto. Ordena no cliente por `pinnedAt` (mais recente
 * primeiro — quando foi FIXADA, não quando foi enviada).
 */
export function subscribePinnedChannelMessages(
  groupId: string,
  channelId: string,
  onChange: (pins: PinnedMessage[]) => void,
  onError: ErrorHandler,
): Unsubscribe {
  return onSnapshot(
    query(
      collection(db, 'pinnedMessages'),
      where('groupId', '==', groupId),
      where('channelId', '==', channelId),
    ),
    (snapshot) => {
      const pins = snapshot.docs.map((entry) => toPinnedMessage(entry.id, entry.data()));
      pins.sort((a, b) => b.pinnedAt.localeCompare(a.pinnedAt));
      onChange(pins);
    },
    (error) => onError(listenerError('fixadas do canal', error)),
  );
}

/**
 * Fixadas de UMA conversa privada, em tempo real.
 *
 * Um único campo de igualdade (`threadId`), sem `orderBy` — o Firestore
 * indexa sozinho, sem risco algum de precisar de índice composto.
 */
export function subscribePinnedDmMessages(
  threadId: string,
  onChange: (pins: PinnedMessage[]) => void,
  onError: ErrorHandler,
): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'pinnedMessages'), where('threadId', '==', threadId)),
    (snapshot) => {
      const pins = snapshot.docs.map((entry) => toPinnedMessage(entry.id, entry.data()));
      pins.sort((a, b) => b.pinnedAt.localeCompare(a.pinnedAt));
      onChange(pins);
    },
    (error) => onError(listenerError('fixadas da conversa', error)),
  );
}

async function createPin(
  scope: DocumentData,
  message: MessageBase,
  authorName: string,
  pinnedBy: MemberId,
): Promise<void> {
  const data: DocumentData = {
    ...scope,
    messageId: message.id,
    authorId: message.authorId,
    authorName,
    kind: message.kind,
    excerpt: excerptOf(message.body !== '' ? message.body : rotuloDaMidia(message.kind)),
    sentAt: message.sentAt,
    pinnedAt: nowIso(),
    pinnedBy,
  };
  // `exactOptionalPropertyTypes`/Firestore: campo ausente, nunca `undefined`.
  if (message.attachment !== undefined) data['attachment'] = message.attachment;

  await withTimeout(addDoc(collection(db, 'pinnedMessages'), data));
}

/** Fixa uma mensagem de GRUPO. Só o DONO pode — cobrado na regra; aqui é só a escrita. */
export async function pinChannelMessage(
  groupId: string,
  channelId: string,
  message: MessageBase,
  authorName: string,
  pinnedBy: MemberId,
): Promise<void> {
  await createPin({ groupId, channelId }, message, authorName, pinnedBy);
}

/** Fixa uma mensagem de PV. Qualquer um dos dois participantes pode. */
export async function pinDmMessage(
  threadId: string,
  message: MessageBase,
  authorName: string,
  pinnedBy: MemberId,
): Promise<void> {
  await createPin({ threadId }, message, authorName, pinnedBy);
}

/**
 * Desafixa — apaga o(s) documento(s) de fixada daquele `messageId`.
 *
 * Normalmente um id só; mais de um só na corrida rara do PV (os dois
 * participantes fixando a mesma mensagem ao mesmo tempo — ver o comentário
 * no topo desta seção). `renderPinnedList` já agrupa por `messageId` e
 * entrega TODOS os ids do grupo aqui, então desafixar remove todos de uma
 * vez, dos dois lados.
 */
export async function unpinMessages(pinIds: string[]): Promise<void> {
  if (pinIds.length === 0) return;
  const batch = writeBatch(db);
  for (const id of pinIds) batch.delete(doc(db, 'pinnedMessages', id));
  await withTimeout(batch.commit());
}

/* -------------------------------------------------------------------------- */
/* Presença nos canais de voz                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Quem está nos canais de voz do grupo — TODOS os canais, numa assinatura só.
 *
 * Um listener por canal seria o caminho óbvio e o errado: a coluna precisa
 * mostrar a lista sob CADA canal de voz ao mesmo tempo, e a checagem de sala
 * cheia precisa de qualquer canal antes de eu entrar nele. Agrupar no cliente
 * custa nada e evita abrir e fechar assinaturas a cada clique.
 *
 * A consulta restringe `groupId` porque é o que a regra examina — sem isso ela é
 * recusada inteira, e não por falta de permissão de verdade. Provei por sonda
 * que dois filtros de igualdade NÃO exigem índice composto aqui.
 */
export function subscribeVoiceParticipants(
  groupId: string,
  onChange: (participants: VoiceParticipant[]) => void,
  onError: ErrorHandler,
): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'voiceParticipants'), where('groupId', '==', groupId)),
    (snapshot) => onChange(snapshot.docs.map((entry) => toVoiceParticipant(entry.data()))),
    (error) => onError(listenerError('participantes de voz', error)),
  );
}

function toVoiceParticipant(data: DocumentData): VoiceParticipant {
  return {
    channelId: typeof data['channelId'] === 'string' ? data['channelId'] : '',
    groupId: typeof data['groupId'] === 'string' ? data['groupId'] : '',
    uid: typeof data['uid'] === 'string' ? data['uid'] : '',
    sessionId: typeof data['sessionId'] === 'string' ? data['sessionId'] : '',
    joinedAt: typeof data['joinedAt'] === 'string' ? data['joinedAt'] : '',
    muted: data['muted'] === true,
    sharingScreen: data['sharingScreen'] === true,
    // Sem lastSeen, o participante conta como fantasma na hora — é o padrão
    // seguro: melhor sumir alguém de verdade do que mostrar quem não está lá.
    lastSeen: typeof data['lastSeen'] === 'string' ? data['lastSeen'] : '',
  };
}
