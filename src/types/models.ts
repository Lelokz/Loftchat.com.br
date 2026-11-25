/**
 * Modelo de dados do Loft.
 *
 * Estes tipos foram desenhados para virar coleções do Firestore sem retrabalho:
 *  - o `id` mora no tipo, mas no Firestore é o id do documento (não um campo duplicado);
 *  - relações são sempre por id, nunca por objeto aninhado;
 *  - datas são string ISO 8601, que viram `Timestamp` na migração.
 *
 * Nesta etapa nada disso é lido de rede: `src/data/mock.ts` monta tudo em memória.
 */

import type { ChannelCategory } from '../lib/channel-layout';
import type { CustomStatus } from '../lib/profile-extras';

export type GroupId = string;
export type ChannelId = string;
export type MemberId = string;
export type MessageId = string;

/** Canal de texto (prefixo #) ou de voz (ícone de alto-falante). */
export type ChannelKind = 'text' | 'voice';

export type PresenceStatus = 'online' | 'offline';

/**
 * Papel na membership.
 *
 * Havia um 'admin' aqui que nenhuma regra tratava e ninguém produzia. Um valor
 * que o banco aceita e o resto do sistema não entende é uma armadilha — saiu.
 *
 * Quem manda sobre posse é `Group.ownerId`, não este campo. Ver lib/permissions.ts.
 */
export type MemberRole = 'owner' | 'member';

/** 0.5.0: `gif`, `video` e `sticker` (figurinha) entram junto da `image`. */
export type MessageKind = 'text' | 'image' | 'gif' | 'video' | 'sticker' | 'file' | 'audio';

/**
 * coleção: users — a VITRINE PÚBLICA da pessoa, id = uid.
 *
 * É daqui que o painel de membros tira nome e iniciais, e é escrito no login e
 * no cadastro — quem entra sempre tem perfil.
 *
 * Legível por qualquer autenticado, e é isso que faz a busca por `@` funcionar.
 * Por isso ela contém EXATAMENTE o que pode ser público e nada mais: nunca
 * e-mail, nunca configuração. O que for privado mora em `userPrivate/{uid}`,
 * que só o dono lê.
 */
export interface UserProfile {
  uid: MemberId;
  displayName: string;
  initials: string;
  /** O `@`, sem a arroba. Ausente até a pessoa escolher. */
  username?: string;
  /**
   * O `@` escolhido NO CADASTRO, esperando a confirmação do e-mail para ser
   * reservado (as regras só deixam reservar com e-mail confirmado). Some
   * quando a reserva acontece.
   */
  pendingUsername?: string;
  /**
   * Quantas vezes o `@` já foi trocado.
   *
   * Fica aqui, e não em `userPrivate`, porque a REGRA precisa lê-lo para cobrar
   * o limite — e regra só lê o documento que a escrita toca.
   */
  usernameChanges?: number;
  createdAt: string;
  /**
   * Proposta A, etapa 2 — escritos em Configurações → Perfil.
   *
   * `accentId` (cor do cartão) e `fontId` (fonte do nome) seguem listas
   * FECHADAS (ver `lib/person-theme.ts`, cobradas também na regra) — nunca
   * texto livre, para não virar CSS arbitrário na tela de outra pessoa.
   */
  bio?: string;
  accentId?: string;
  fontId?: string;
  /** Foto 256×256 (data URL), etapa 2b. Ver lib/images.ts. */
  photo?: string;
  /**
   * Etapa 2d: cor do nome nas mensagens (lista fechada), status com emoji e
   * prazo, e até 3 links. Ver lib/person-theme.ts e lib/profile-extras.ts.
   */
  nameColor?: string;
  customStatus?: CustomStatus;
  links?: string[];
  /**
   * Banner e fundo do cartão — NÃO moram em `users/` (moram em
   * `profileArt/{uid}`); o cliente junta aqui depois de ler, só para quem
   * precisa mostrar o cartão.
   */
  banner?: string;
  cardBg?: string;
}

/** Quantas trocas de `@` cada conta tem direito. Cobrado na regra, não só na tela. */
export const MAX_USERNAME_CHANGES = 3;

/** Tamanhos do perfil, cobrados também na regra (firestore.rules). */
export const MAX_BIO = 160;
export const MAX_DISPLAY_NAME = 32;

/**
 * coleção: friendships — UM documento por PAR, id `${menorUid}_${maiorUid}`.
 *
 * O id sai dos dois uids ORDENADOS, então o mesmo par cai sempre no mesmo
 * documento, venha de que lado vier. Isso não é economia: é o que impede o
 * estado de desincronizar. Com uma lista em cada pessoa, aceitar teria de
 * escrever nos dois lugares, e falhar no meio deixaria A amigo de B sem B ser
 * amigo de A — sem ninguém para consertar. Aqui esse estado nem existe.
 *
 * E pedidos cruzados viram amizade DE GRAÇA: B mandando pedido enquanto o de A
 * está pendente colidiria no mesmo id, então o cliente encontra o pendente
 * endereçado a ele e ACEITA. Não é caso especial, é consequência da chave.
 *
 * `recusado` e `cancelado` do enunciado APAGAM o documento em vez de virarem
 * status: guardado, um "recusado" ocuparia o id do par e bloquearia qualquer
 * pedido futuro para sempre — e ainda contaria ao remetente que a pessoa
 * recusou, em vez de apenas não ter respondido.
 */
export interface Friendship {
  id: string;
  /** Os dois uids. É por ele que cada lado encontra os próprios vínculos. */
  members: MemberId[];
  from: MemberId;
  to: MemberId;
  status: 'pending' | 'accepted';
  createdAt: string;
}

/** coleção: blocks — id `${meuUid}_${bloqueadoUid}`. Só o dono lê e escreve. */
export interface Block {
  id: string;
  uid: MemberId;
  blockedUid: MemberId;
  createdAt: string;
}

/** coleção: groups */
export interface Group {
  id: GroupId;
  name: string;
  /** 1–2 letras mostradas no avatar da barra de grupos. */
  initials: string;
  /** uid de quem criou. Só o dono pode renomear. */
  ownerId: MemberId;
  createdAt: string;
  /**
   * Etapa 3a — escritos pelo dono em "Configurações do grupo". A cor segue a
   * MESMA lista fechada da cor do cartão (lib/person-theme.ts).
   */
  photo?: string;
  description?: string;
  accentId?: string;
  /** Etapa 3b: categorias de canais, na ordem da tela. Ver lib/channel-layout.ts. */
  categories?: ChannelCategory[];
  /** Etapa 3c: texto de boas-vindas para quem entra. Ver lib/welcome.ts. */
  welcome?: string;
}

/** Tamanhos do grupo, cobrados também na regra (firestore.rules). */
export const MAX_GROUP_NAME = 60;
export const MAX_GROUP_DESCRIPTION = 300;

/**
 * coleção: channels
 *
 * `groupId` como campo (em vez de subcoleção de group) porque a coluna de canais
 * faz uma query só: where('groupId','==',ativo).orderBy('position').
 */
export interface Channel {
  id: ChannelId;
  groupId: GroupId;
  /** Sem o "#": o prefixo é decoração da UI, não faz parte do nome. */
  name: string;
  kind: ChannelKind;
  /** Ordem dentro da própria seção (texto ou voz) do seu bloco. */
  position: number;
  createdAt: string;
  /** Etapa 3b: emoji na frente do nome e a categoria (ausente = sem categoria). */
  emoji?: string;
  categoryId?: string;
}

/**
 * coleção: members
 *
 * O perfil global da pessoa, independente de grupo. Quem liga pessoa a grupo é
 * `Membership`.
 */
export interface Member {
  id: MemberId;
  displayName: string;
  initials: string;
  /** O `@`, quando se sabe (o meu sempre). */
  username?: string;
  /** Foto (data URL), quando a pessoa pôs uma. */
  photo?: string;
  /** Cor do nome nas mensagens e status escolhido (etapa 2d). */
  nameColor?: string;
  customStatus?: CustomStatus;
  /**
   * ATENÇÃO — presença como campo simples só serve para o mock.
   *
   * Se a aba fechar, a rede cair ou o processo morrer, ninguém escreve 'offline':
   * o campo fica preso em 'online' para sempre. A implementação real vai precisar
   * de heartbeat (um `lastSeenAt` renovado periodicamente, com TTL avaliado por
   * quem lê) ou do `onDisconnect()` do Realtime Database espelhando o estado para
   * o Firestore — o Firestore sozinho não tem gancho de desconexão.
   */
  status: PresenceStatus;
  /**
   * 0.8.5 CARGOS — só quando a pessoa vem de um GRUPO (vem do membership):
   * os ids dos cargos dela, quando entrou e por qual convite.
   */
  cargos?: string[];
  entrouEm?: string;
  convite?: string;
  /** Calculada pelo store: cor, ícone e bloco da lista vindos do cargo mais alto. */
  insignia?: Insignia;
}

/** Cor de um cargo: `a` sozinha = sólida; com `b` = degradê de `a` para `b`. */
export interface CorDoCargo {
  a: string;
  b?: string;
}

/**
 * coleção: cargos (0.8.5) — id autogerado; o "@todos" de cada grupo tem id
 * `${groupId}_todos`. Cargo é LIVRE: nome, cor, ícone e permissões quaisquer.
 * `posicao` menor = mais alto (manda em quem está embaixo).
 */
export interface Cargo {
  id: string;
  groupId: GroupId;
  nome: string;
  cor: CorDoCargo | null;
  /** Emoji do ícone, ou imagem pequena (data URL). */
  icone?: string;
  imagem?: string;
  posicao: number;
  /** Mostrar separado na lista de membros. */
  separado: boolean;
  /** Qualquer um pode mencionar @cargo. */
  mencionavel: boolean;
  permissoes: string[];
  /** O "@todos": o básico de quem não tem cargo nenhum. */
  todos?: boolean;
  criadoEm: string;
}

/** O que aparece junto do nome: cor e ícone do cargo mais alto, e em que bloco da lista. */
export interface Insignia {
  cor: CorDoCargo | null;
  icone?: string;
  imagem?: string;
  /** Nome do bloco na lista de membros (cargo separado mais alto), ou null = "Membros". */
  bloco: string | null;
  /** Ordem do bloco (Dono = -1). */
  blocoPosicao: number;
  /** Cargos da pessoa, já ordenados do mais alto. */
  cargos: Cargo[];
  dono: boolean;
}

/**
 * coleção: memberships — vínculo N:N entre member e group.
 *
 * É o que permite convidar alguém para UM grupo só, sem dar acesso aos outros.
 * Chave natural do documento: `${groupId}_${memberId}`, o que impede vínculo
 * duplicado por construção.
 *
 * Query da barra de grupos:   where('memberId','==',euMesmo)
 * Query do painel de membros: where('groupId','==',grupoAtivo)
 */
export interface Membership {
  /** Sempre `${groupId}_${memberId}` — ver comentário acima. */
  id: string;
  groupId: GroupId;
  memberId: MemberId;
  role: MemberRole;
  joinedAt: string;
  /**
   * Código do convite usado para entrar. Ausente para o dono, que criou o grupo.
   *
   * Existe por causa das regras de segurança: elas não fazem query, então não
   * têm como descobrir se existe ALGUM convite para o grupo. Só conseguem
   * conferir um convite cujo código o cliente informe — e este é o campo que
   * informa.
   */
  inviteCode?: string;
  /** 0.8.5: ids dos cargos da pessoa neste grupo. */
  cargos?: string[];
}

/**
 * coleção: invites — id do documento é o PRÓPRIO código.
 *
 * Assim abrir um convite é um `getDoc` direto, sem query e sem índice.
 */
export interface Invite {
  code: string;
  groupId: GroupId;
  /**
   * Nome do grupo no momento em que o convite foi criado.
   *
   * Denormalizado porque as regras só deixam MEMBROS lerem o documento do
   * grupo — e quem abre um convite ainda não é membro. Sem isto, o convidado
   * não conseguiria ver para onde está sendo chamado.
   *
   * É um rótulo congelado: se o grupo for renomeado depois, este nome fica
   * velho. Por isso a tela de convite o apresenta dentro de uma frase, e não
   * como título — e o app, depois de entrar, mostra o nome atual do grupo.
   */
  groupName: string;
  createdBy: MemberId;
  createdAt: string;
}

/**
 * Anexo de uma mensagem. Presente sempre que `Message.kind !== 'text'`.
 *
 * `url` vai apontar para o Cloud Storage depois; no mock é um data URI (imagem)
 * ou um placeholder (áudio e arquivo), para não abrir nenhuma requisição.
 */
export interface Attachment {
  url: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  /** Só para áudio (e vídeo, depois). */
  durationMs?: number;
  /** 0.5.0: onde mora no R2 (pelo carteiro), o tamanho em pixels e a capa do vídeo. */
  chave?: string;
  largura?: number;
  altura?: number;
  capaUrl?: string;
  /** 0.5.5: mensagem de voz — as ondas (48 valores de 0 a 100) para o balão desenhar sem baixar o áudio. */
  ondas?: number[];
}

/**
 * O que toda mensagem tem em comum, de GRUPO ou de PV.
 *
 * É a forma que `message-list.ts` conhece — ele nunca lê `groupId`/
 * `channelId`/`threadId`, só o que está aqui. Extrair esta base é o que
 * deixa o mesmo componente renderizar as duas sem saber de onde a mensagem
 * veio (etapa 18).
 */
export interface MessageBase {
  id: MessageId;
  authorId: MemberId;
  kind: MessageKind;
  /** Texto da mensagem; em image/file/audio vira legenda e pode ser ''. */
  body: string;
  attachment?: Attachment;
  sentAt: string;
  /**
   * Quando foi editada. Ausente = nunca foi.
   *
   * O `sentAt` NÃO muda numa edição: a ordem da conversa não pode se mexer
   * porque alguém corrigiu uma palavra.
   */
  editedAt?: string;
  replyTo?: ReplyTo;
}

/**
 * coleção: messages — mensagem de GRUPO.
 *
 * Índice composto necessário: groupId + channelId + sentAt.
 */
export interface Message extends MessageBase {
  /**
   * Denormalizado do canal.
   *
   * Com ele a regra de leitura faz UMA consulta (exists da membership) em vez
   * de duas (get do canal + exists) — vezes as 50 mensagens de cada lista.
   */
  groupId: GroupId;
  channelId: ChannelId;
}

/**
 * A mensagem citada, DENORMALIZADA dentro da resposta.
 *
 * Mesmo motivo do `groupId` acima: sem isto, montar a lista exigiria uma leitura
 * extra por citação — e a original pode nem estar carregada, ou nem existir mais.
 *
 * O `sentAt` da citada é o que permite distinguir, sem adivinhar, três casos que
 * pareceriam iguais: original carregada (rola até ela), original apagada (a
 * janela cobre aquele tempo e ela não está lá) e original antiga demais (é
 * anterior à mensagem mais antiga que temos). Ver `citationState` em
 * components/chat/message-list.
 */
export interface ReplyTo {
  messageId: MessageId;
  authorId: MemberId;
  /** Copiado no envio: o nome de quem escreveu, mesmo que a pessoa saia do grupo. */
  authorName: string;
  /** Só o começo do texto — a citação é uma pista, não a mensagem inteira. */
  excerpt: string;
  sentAt: string;
}

/**
 * coleção: dmThreads — a CONVERSA privada, um documento por PAR.
 *
 * Mesma ideia da `Friendship`: id = `pairId(a, b)` (a mesma função de
 * `lib/friends.ts`, reaproveitada — não outra). Não existe dono, não existe
 * canal: é o análogo do par de amigos, não do grupo.
 */
export interface DmThread {
  /** Sempre `pairId(members[0], members[1])`. */
  id: string;
  members: MemberId[];
  /**
   * Denormalizado — é o que faz a lista de conversas custar UMA leitura por
   * conversa, e não uma por MENSAGEM. Atualizado no mesmo `writeBatch` que
   * grava cada `DmMessage` nova, dos dois lados da conversa.
   */
  lastMessage: {
    body: string;
    authorId: MemberId;
    sentAt: string;
  };
  /**
   * Igual a `lastMessage.sentAt`, mas campo PRÓPRIO: `orderBy` sobre um
   * campo aninhado funciona no Firestore, mas manter os dois planos (thread
   * e índice) simples pesou mais que economizar um campo.
   */
  lastMessageAt: string;
}

/**
 * coleção: dmMessages — mensagem de conversa PRIVADA.
 *
 * Índice composto: threadId (ASCENDING) + sentAt (DESCENDING) — publicado
 * em `firestore.indexes.json`. A etapa 18 apostou que um campo de
 * igualdade mais `orderBy` não precisaria de índice composto; estava
 * errado (achado em produção, corrigido na etapa 19 — ver PROGRESSO.md).
 */
export interface DmMessage extends MessageBase {
  /** = `DmThread.id` = `pairId(a, b)`. Nunca `groupId`/`channelId`: PV não tem nenhum dos dois. */
  threadId: string;
}

/**
 * coleção: voiceParticipants — quem está DE FATO num canal de voz.
 *
 * id determinístico `${channelId}_${uid}`: garante por construção um documento
 * por pessoa por canal, e a regra de criação confere exatamente isso.
 *
 * `groupId` é denormalizado por causa das REGRAS, não da busca: toda consulta
 * precisa restringir groupId para ser provável (ver o topo de firestore.rules).
 *
 * SOBRE `lastSeen` — a presença fantasma:
 *
 * O Firestore não tem `onDisconnect` (isso é do Realtime Database). Um navegador
 * fechado deixaria a pessoa conectada para sempre. Daí o heartbeat: quem está
 * conectado atualiza `lastSeen` a cada 15s, e quem lê ignora participante mais
 * velho que 45s. Apagar o documento ao fechar a aba é tentado, mas é melhor
 * esforço — a garantia é o heartbeat.
 *
 * `sessionId` identifica a ABA. Duas abas da mesma conta escreveriam no mesmo
 * documento e brigariam pelo heartbeat; com ele, a aba deslocada percebe que
 * perdeu o lugar em vez de disputar em silêncio.
 */
export interface VoiceParticipant {
  channelId: ChannelId;
  groupId: GroupId;
  uid: MemberId;
  sessionId: string;
  joinedAt: string;
  muted: boolean;
  /**
   * Está transmitindo a tela? Um por canal.
   *
   * Mora aqui, e não numa coleção própria, porque é um fato DA PRESENÇA: some
   * junto com a pessoa. Se ficasse à parte, quem fechasse o navegador deixaria
   * uma transmissão fantasma sem dono.
   */
  sharingScreen: boolean;
  lastSeen: string;
}

/**
 * Tipo de conteúdo de uma mensagem FIXADA.
 *
 * Não é `MessageKind`: o app ainda não tem anexo (depende do Storage), mas
 * o pedido é para o modelo já nascer pronto para as seis categorias
 * (`'video'`/`'gif'` que `MessageKind` nem tem). Hoje só `'text'` é
 * alcançável — o resto existe para quando anexos chegarem, sem migração.
 */
export type PinnedKind = 'text' | 'image' | 'video' | 'gif' | 'file' | 'audio';

/**
 * coleção: pinnedMessages — id AUTOGERADO (não determinístico: `threadId`
 * já tem `_` no meio, compor um id de escopo+mensagem sem ambiguidade
 * pediria mais complexidade do que vale).
 *
 * Uma fixada pertence a um CANAL (grupo) ou a uma THREAD (PV), nunca aos
 * dois — `groupId`/`channelId` juntos OU `threadId` sozinho. Guarda o
 * bastante para aparecer na lista SEM ler a mensagem original de novo
 * (mesmo princípio do `groupId` em `Message`): autor, trecho, data, e o id
 * da original só para permitir "pular até ela".
 *
 * Índice composto: nenhum. As duas consultas (grupo: groupId+channelId;
 * PV: threadId) não usam `orderBy` — a lista ordena no CLIENTE por
 * `pinnedAt`, de propósito, para não repetir a aposta que saiu errada com
 * `dmMessages` (ver PROGRESSO.md, etapa 19).
 */
export interface PinnedMessage {
  id: string;
  groupId?: GroupId;
  channelId?: ChannelId;
  threadId?: string;
  messageId: MessageId;
  authorId: MemberId;
  /** Denormalizado — mesmo motivo do `ReplyTo.authorName`: o autor pode sair do grupo. */
  authorName: string;
  kind: PinnedKind;
  /**
   * Trecho de quando foi FIXADA, não o texto atual da mensagem.
   *
   * Se a original for editada depois, isto NÃO muda — decisão consciente,
   * não bug: manter sincronizado custaria uma leitura extra por item toda
   * vez que a lista de fixadas for exibida, só para refletir uma edição
   * que pode nunca acontecer.
   */
  excerpt: string;
  /** Presente só quando kind !== 'text'. Reaproveita `Attachment` — nasce pronto para quando anexos existirem. */
  attachment?: Attachment;
  /** sentAt da mensagem ORIGINAL — é a data mostrada no item. */
  sentAt: string;
  /** Quando foi fixada. Ordena a lista (mais recente primeiro) — não é `sentAt`. */
  pinnedAt: string;
  pinnedBy: MemberId;
}

/** Quantas mensagens cada canal/conversa pode ter fixadas ao mesmo tempo. */
export const MAX_PINNED_MESSAGES = 50;

/*
 * `UiState` saiu daqui: grupo e canal ativos deixaram de ser constante de mock e
 * viraram estado real, com listeners atrelados. A forma vive em `state/store.ts`,
 * junto do código que a mantém coerente.
 */
