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

export type MessageKind = 'text' | 'image' | 'file' | 'audio';

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
   * Quantas vezes o `@` já foi trocado.
   *
   * Fica aqui, e não em `userPrivate`, porque a REGRA precisa lê-lo para cobrar
   * o limite — e regra só lê o documento que a escrita toca.
   */
  usernameChanges?: number;
  createdAt: string;
}

/** Quantas trocas de `@` cada conta tem direito. Cobrado na regra, não só na tela. */
export const MAX_USERNAME_CHANGES = 3;

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
}

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
  /** Ordem dentro da própria seção (texto ou voz). */
  position: number;
  createdAt: string;
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
}

/**
 * coleção: messages
 *
 * Índice composto necessário: channelId + sentAt.
 */
export interface Message {
  id: MessageId;
  /**
   * Denormalizado do canal.
   *
   * Com ele a regra de leitura faz UMA consulta (exists da membership) em vez
   * de duas (get do canal + exists) — vezes as 50 mensagens de cada lista.
   */
  groupId: GroupId;
  channelId: ChannelId;
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

/*
 * `UiState` saiu daqui: grupo e canal ativos deixaram de ser constante de mock e
 * viraram estado real, com listeners atrelados. A forma vive em `state/store.ts`,
 * junto do código que a mantém coerente.
 */
