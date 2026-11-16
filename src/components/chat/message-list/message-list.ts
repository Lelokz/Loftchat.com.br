import "./message-list.css";

import { avatarEl, el, iconEl } from "../../../lib/dom";
import { nameColorId } from "../../../lib/person-theme";
import { clipIcon, fileIcon, micIcon } from "../../../lib/icons";
import {
  formatBytes,
  formatDayLabel,
  formatDuration,
  formatTime,
  localDayKey,
} from "../../../lib/format";
import type {
  Attachment,
  Member,
  MemberId,
  MessageBase,
  MessageId,
} from "../../../types/models";

export interface MessageListProps {
  messages: MessageBase[];
  /** Perfis vindos da coleção `users`, pelo authorId. */
  authors: Map<MemberId, Member>;
  /** Meu uid. Acabaram as duas noções de "eu": esta é a única. */
  currentMemberId: MemberId;
  /** Uma página de histórico está em voo. */
  loadingOlder: boolean;
  /** Não há mais nada antes: é o começo do canal. */
  atStart: boolean;
  /** Parei de paginar pelo TETO, não por ter chegado ao começo. */
  atPageCap: boolean;
  /** Nome do canal, para o "Início de #geral". */
  channelName: string;
  /**
   * Substitui o "Início de #{channelName}" quando fornecido — para o PV
   * (etapa 18), onde "#Fulano" não faz sentido nenhum. Ausente = o padrão
   * de canal, sem mudança para quem já chama isto hoje.
   */
  startLabel?: string;
  /**
   * Estampado em `data-context` de cada balão — é o que o menu de contexto
   * (`context-menus.ts`) usa para decidir QUAL função de permissão chamar.
   * Ausente = `'message'` (grupo, dono pode apagar). PV usa `'dm-message'`
   * (etapa 18): não tem dono, só o autor apaga.
   */
  dataContext?: 'message' | 'dm-message';
  /** Rolou perto do topo — quem chama decide se busca. */
  onReachTop: () => void;
  /** Clique numa citação cuja original está carregada. */
  onJumpTo: (messageId: MessageId) => void;
  /** Salvar uma edição. Texto vazio já foi filtrado por quem chama. */
  onEdit: (messageId: MessageId, body: string) => void;
  /** Mensagem em edição agora, ou null. */
  editingId: MessageId | null;
  /** Sai do modo de edição sem salvar. */
  onCancelEdit: () => void;
}

/** A que distância do topo o histórico começa a carregar. */
const LOAD_MORE_MARGIN_PX = 200;

/** Quanto esperar sem uma renderização nova antes de medir overflow. */
const SETTLE_MS = 400;

/**
 * Autor sem doc em `users` — saiu do grupo, ou o perfil ainda não chegou.
 * Fallback discreto em vez de tela quebrada.
 */
function authorOf(authors: Map<MemberId, Member>, authorId: MemberId): Member {
  const known = authors.get(authorId);
  if (known !== undefined) return known;
  return {
    id: authorId,
    displayName: "Usuário",
    initials: "?",
    status: "offline",
  };
}

/** Quantas barrinhas o "áudio" estático desenha. Puramente decorativo. */
const WAVEFORM_BARS = 22;

/** Janela de agrupamento: mensagens seguidas do mesmo autor dentro disso viram um bloco. */
const GROUP_WINDOW_MS = 5 * 60 * 1000;

/**
 * A mensagem abre um dia novo? É o que decide onde entra o separador.
 *
 * A primeira mensagem carregada abre dia por definição — e é assim que o
 * separador do topo sai do mesmo caminho, sem caso especial.
 */
function startsNewDay(
  current: MessageBase,
  previous: MessageBase | undefined,
): boolean {
  if (previous === undefined) return true;
  return localDayKey(current.sentAt) !== localDayKey(previous.sentAt);
}

/**
 * A mensagem continua o bloco da anterior?
 * Mesmo autor e no máximo GROUP_WINDOW_MS de distância da mensagem imediatamente
 * anterior (não do início do bloco — assim uma conversa contínua não é quebrada
 * só porque o bloco já dura mais de cinco minutos).
 *
 * DIA NOVO SEMPRE QUEBRA, mesmo dentro da janela de cinco minutos: um bloco que
 * atravessa a meia-noite ficaria com o separador no meio dele, e a mensagem
 * logo abaixo do separador apareceria sem nome e sem horário — órfã. Como
 * `isBlockEnd` também sai daqui, o balão de bico acerta sozinho nos dois lados.
 */
function continuesBlock(
  current: MessageBase,
  previous: MessageBase | undefined,
): boolean {
  if (previous === undefined) return false;
  if (previous.authorId !== current.authorId) return false;
  if (startsNewDay(current, previous)) return false;
  const gap =
    new Date(current.sentAt).getTime() - new Date(previous.sentAt).getTime();
  return gap >= 0 && gap <= GROUP_WINDOW_MS;
}

/**
 * O topo da lista: carregando, começo do canal, ou o teto de páginas.
 *
 * Os três são exclusivos e SILENCIOSO NÃO É OPÇÃO em nenhum deles. Sem o aviso
 * do teto, a pessoa rolaria até parar e concluiria que chegou ao começo da
 * conversa — quando na verdade o app desistiu para não gastar leitura.
 */
function historyTop(props: MessageListProps): HTMLElement | false {
  if (props.loadingOlder) {
    return el('li', { class: 'messages__top' }, [
      el('span', { class: 'messages__top-note' }, ['Carregando mensagens anteriores…']),
    ]);
  }

  if (props.atStart) {
    return el('li', { class: 'messages__top' }, [
      el('span', { class: 'messages__top-note' }, [
        props.startLabel ?? `Início de #${props.channelName}`,
      ]),
    ]);
  }

  if (props.atPageCap) {
    return el('li', { class: 'messages__top' }, [
      el('span', { class: 'messages__top-note' }, [
        'Para ver mensagens mais antigas, use a busca.',
      ]),
    ]);
  }

  return false;
}

/**
 * A GARANTIA que não depende de rolar — flutua por cima, não empurra nada.
 *
 * Numa janela alta ou com mensagens curtas, a página carregada pode não
 * estourar a área visível — e sem estourar, `scrollTop` nunca sai de zero,
 * nenhum evento de `scroll` dispara, e o histórico mais antigo fica
 * inacessível para sempre. O carregamento automático em `renderMessageList`
 * cobre o caso comum; este botão é o caminho que funciona sempre, com ou sem
 * mouse e sem depender de nenhuma medida de layout.
 *
 * `position: absolute` DE PROPÓSITO — não é um item de `historyTop` como os
 * outros três. Testado como item de lista primeiro, e media: aparecer e
 * sumir do FLUXO a cada `renderOlder`/`atStart` mexe no `offsetTop` de toda
 * mensagem abaixo dele — e isso interferia direto na compensação de rolagem
 * do `swapMessages` (`app.ts`), que mede a posição da mensagem-âncora antes
 * e depois. Numa bateria de dez execuções, aquele teste saltava a âncora em
 * ~1 de cada 2; flutuando por cima (fora do fluxo), o item mais próximo do
 * topo nunca perde nem ganha altura por causa dele, e voltou a ~1 em 10 —
 * a mesma instabilidade de fundo que já existia antes, sem ligação com este
 * botão.
 */
function loadMoreOverlay(props: MessageListProps): HTMLElement | false {
  if (props.loadingOlder || props.atStart || props.atPageCap) return false;

  const botao = el(
    'button',
    { class: 'messages__load-more', type: 'button' },
    ['Carregar mensagens anteriores'],
  );
  botao.addEventListener('click', () => props.onReachTop());
  return botao;
}

/**
 * O que dá para dizer sobre a mensagem citada, sem adivinhar.
 *
 * `carregada`  → está na lista: dá para rolar até ela.
 * `apagada`    → não está, e a janela PROVADAMENTE cobre o tempo dela.
 * `fora-da-janela` → pode existir mais atrás; não vale um laço de leituras
 *                para descobrir, e chutar "apagada" seria mentir.
 *
 * São DUAS as provas de cobertura, e a segunda foi descoberta quebrando:
 *
 *   1. temos mensagens mais ANTIGAS que a citada — a janela passou por ali;
 *   2. o canal inteiro está carregado (`atStart`) — não há mais nada em lugar
 *      nenhum. Sem esta, apagar a mensagem mais antiga de um canal caía em
 *      "fora-da-janela": some a única coisa mais velha que ela, e a regra 1
 *      deixa de valer justamente no caso em que a certeza é maior.
 */
/**
 * Exportada para a lista de FIXADAS (etapa 19) reaproveitar sem duplicar:
 * `PinnedMessage` tem `messageId`/`authorId`/`authorName`/`excerpt`/`sentAt`
 * com os mesmos nomes e tipos de `ReplyTo` (mais campos próprios, que esta
 * função ignora), então a tipagem estrutural aceita passar uma fixada aqui
 * direto, sem cast.
 */
export function citationState(
  reply: NonNullable<MessageBase['replyTo']>,
  messages: MessageBase[],
  atStart: boolean,
): 'carregada' | 'apagada' | 'fora-da-janela' {
  if (messages.some((message) => message.id === reply.messageId)) return 'carregada';
  if (atStart) return 'apagada';
  const oldest = messages[0];
  if (oldest !== undefined && oldest.sentAt <= reply.sentAt) return 'apagada';
  return 'fora-da-janela';
}

/** A citação acima do texto: quem escreveu e o começo do que disse. */
function citation(
  reply: NonNullable<MessageBase['replyTo']>,
  messages: MessageBase[],
  atStart: boolean,
  onJumpTo: (messageId: MessageId) => void,
): HTMLElement {
  const estado = citationState(reply, messages, atStart);

  const corpo =
    estado === 'apagada'
      ? el('span', { class: 'quote__gone' }, ['mensagem apagada'])
      : el('span', { class: 'quote__text' }, [reply.excerpt]);

  const linhas = [el('span', { class: 'quote__author' }, [reply.authorName]), corpo];

  // Fora da janela a citação continua LEGÍVEL — é para isso que o texto é
  // copiado dentro da resposta —, só não é clicável.
  if (estado === 'fora-da-janela') {
    linhas.push(
      el('span', { class: 'quote__gone' }, [
        `de ${formatDayLabel(reply.sentAt)} — antiga demais para abrir aqui`,
      ]),
    );
  }

  if (estado !== 'carregada') return el('div', { class: 'quote' }, linhas);

  const botao = el(
    'button',
    { class: 'quote quote--jump', type: 'button', 'data-quote-target': reply.messageId },
    linhas,
  );
  botao.addEventListener('click', () => onJumpTo(reply.messageId));
  return botao;
}

/** Separador de dia: linha fina, rótulo no meio, linha fina. */
function dayDivider(iso: string): HTMLElement {
  return el("li", { class: "messages__day" }, [
    el("span", { class: "messages__day-label" }, [formatDayLabel(iso)]),
  ]);
}

/**
 * Lista de mensagens em balões — a ÚNICA região rolável da tela.
 *
 * Minhas mensagens (authorId === currentMemberId) vão para a direita com fundo
 * de destaque; as dos outros ficam à esquerda em superfície neutra. Não existe
 * flag `isMine` gravada no dado: quem sou eu é contexto de sessão, não do documento.
 */
export function renderMessageList(props: MessageListProps): HTMLElement {
  const { messages, authors, currentMemberId } = props;
  const items = messages.flatMap((message, index) => {
    const isMine = message.authorId === currentMemberId;
    const author = authorOf(authors, message.authorId);

    const previous = index > 0 ? messages[index - 1] : undefined;
    const next = index + 1 < messages.length ? messages[index + 1] : undefined;

    const continued = continuesBlock(message, previous);
    // Última do bloco: só ela leva o canto "de bico", para o bloco ler como um só.
    const isBlockEnd = next === undefined || !continuesBlock(next, message);

    const classes = [
      "message",
      isMine ? "message--mine" : "",
      continued ? "" : "message--start",
      isBlockEnd ? "message--end" : "",
    ]
      .filter(Boolean)
      .join(" ");

    const bubble = el(
      "li",
      {
        class: classes,
        // Ganchos do menu de contexto. O autor vai junto porque quem pode
        // apagar depende dele: o autor, ou (só em grupo) o dono. `dataContext`
        // é o que separa as duas regras — ver o comentário na prop.
        "data-context": props.dataContext ?? "message",
        "data-message-id": message.id,
        "data-author-id": message.authorId,
      },
      [
        // Avatar: na primeira do bloco ele traz as iniciais; nas continuações
        // fica vazio, reservando a largura para o texto não desalinhar. Nas
        // MINHAS ele existe mas fica escondido no jeito padrão (balão à
        // direita) — aparece na lista e no balão à esquerda (Aparência, etapa 5b).
        el(
          "span",
          continued
            ? { class: isMine ? "message__avatar message__avatar--mine" : "message__avatar" }
            : {
                class: isMine ? "message__avatar message__avatar--mine" : "message__avatar",
                "data-profile-uid": message.authorId,
              },
          [continued ? false : avatarEl(author.initials, "sm", "", author.photo)],
        ),

        el("div", { class: "message__bubble" }, [
          // Nome e horário só na primeira mensagem do bloco.
          !continued &&
            el("div", { class: "message__meta" }, [
              el(
                "span",
                isMine
                  ? { class: "message__author" }
                  : {
                      class: "message__author",
                      "data-profile-uid": message.authorId,
                      role: "button",
                      tabindex: 0,
                      // A cor que a PESSOA escolheu (etapa 2d) — lista
                      // fechada; o CSS pinta com os --nome-* de tokens.css.
                      "data-name-color":
                        nameColorId(author.nameColor) === "padrao" ? undefined : nameColorId(author.nameColor),
                    },
                [author.displayName],
              ),
              el("time", { class: "message__time", datetime: message.sentAt }, [
                formatTime(message.sentAt),
              ]),
            ]),
          // A citação vem ANTES do texto: é o contexto do que se vai ler.
          message.replyTo !== undefined &&
            citation(message.replyTo, messages, props.atStart, props.onJumpTo),
          props.editingId === message.id
            ? editor(message, props)
            : renderContent(message),
          // Marca de editado, discreta e depois do texto.
          message.editedAt !== undefined &&
            props.editingId !== message.id &&
            el("span", { class: "message__edited", title: `Editada às ${formatTime(message.editedAt)}` }, [
              "editado",
            ]),
        ]),
      ],
    );

    // O separador entra ANTES da mensagem que abre o dia.
    return startsNewDay(message, previous)
      ? [dayDivider(message.sentAt), bubble]
      : [bubble];
  });

  const topo = historyTop(props);
  const carregarMais = loadMoreOverlay(props);

  const lista = el(
    "ul",
    { class: "messages column-scroll scroll-area", "aria-label": "Mensagens" },
    [
      ...(topo === false ? items : [topo, ...items]),
      // Flutua por cima (position: absolute) — não é um item da lista como
      // os outros. Ver o comentário em `loadMoreOverlay`.
      carregarMais,
    ],
  );

  /*
   * O gatilho do histórico.
   *
   * A trava de verdade é no store (`loadOlderMessages` sai cedo se já há uma em
   * voo, se chegou ao começo ou se bateu no teto). Aqui só evitamos chamar a
   * cada pixel: sem `atStart`/`atPageCap` no caminho, rolar até o topo depois
   * do fim do histórico chamaria sem parar.
   *
   * `isConnected` PRIMEIRO — medido, não suposto. `swapMessages` troca este nó
   * inteiro a cada entrega nova do listener (uma mensagem chegando já basta).
   * O nó ANTIGO, já fora do documento, pode receber um evento de scroll
   * enfileirado antes da troca — e um elemento desconectado relata
   * `scrollTop/scrollHeight/clientHeight` todos zero. Como `0 <= 200`, isso
   * satisfazia "cheguei ao topo" sem ninguém ter rolado nada, carregando uma
   * página a mais do histórico por conta própria. Medido com uma sonda:
   * dezenas desses eventos fantasma aparecem só de mensagens chegando, e nem
   * precisa ser muitas de uma vez — uma mensagem nova num canal aberto já
   * basta, então isso também atinge quem só está conversando normalmente.
   */
  lista.addEventListener("scroll", () => {
    if (!lista.isConnected) return;
    if (props.loadingOlder || props.atStart || props.atPageCap) return;
    if (lista.scrollTop <= LOAD_MORE_MARGIN_PX) props.onReachTop();
  });

  /*
   * SE A PÁGINA NÃO ESTOURA A ÁREA VISÍVEL, NÃO HÁ COMO ROLAR — e sem rolar,
   * o listener acima nunca dispara. Numa janela alta ou com mensagens
   * curtas, a pessoa ficava presa na primeira página para sempre, mesmo
   * havendo histórico de verdade logo ali: sem overflow, `scrollTop` nunca
   * sai de zero e nenhum evento de `scroll` acontece.
   *
   * Reproduzido com números: janela de 2600px, 55 mensagens curtas — as 50
   * primeiras cabem inteiras (`scrollHeight === clientHeight`), e nem
   * `scrollTop = 0` nem a roda do mouse mudam a contagem.
   *
   * ESPERA O CANAL SE ASSENTAR antes de medir — de propósito, não é
   * `requestAnimationFrame`. Um canal costuma chegar aos pedaços (cache,
   * depois servidor; ou, em teste, mensagem por mensagem escrita por REST
   * com o listener já ativo), e cada pedaço passa por aqui de novo. Medir a
   * cada quadro pega o meio do caminho — poucas mensagens ainda, óbvio que
   * "não estoura" — e adianta página que o crescimento normal preencheria
   * sozinho, sem pedir. O temporizador reagenda a cada render; como o nó
   * antigo já não está mais no documento quando o dele dispara
   * (`isConnected` cobre isso), só o ÚLTIMO render — o que ficou de pé por
   * `SETTLE_MS` sem ser substituído — chega a medir de verdade.
   *
   * SÓ AGENDA quando `atStart`/`atPageCap`/`loadingOlder` já dizem, NA HORA
   * deste render, que não há nada a fazer — nesses três casos o temporizador
   * ia disparar e sair sem medir de qualquer jeito. Não agendar é o que
   * importa: um canal enchendo aos pedaços (`seedHistory` num teste, ou o
   * cache-depois-servidor do Firestore) passa pela MAIORIA dos seus renders
   * com `atStart=true` (menos mensagens do que o limite, até a página
   * encher) — agendar um temporizador cancelado a cada um deles ainda soma
   * trabalho no laço de eventos, e foi o bastante para mudar o resultado de
   * uma corrida preexistente entre o `seedHistory` de outro teste e o
   * listener alcançando: a posição da âncora chegou a saltar 45px numa
   * fração das execuções. Cortar o agendamento nesses casos devolve o
   * comportamento de antes.
   */
  if (!props.loadingOlder && !props.atStart && !props.atPageCap) {
    window.setTimeout(() => {
      if (!lista.isConnected) return;
      if (props.loadingOlder || props.atStart || props.atPageCap) return;
      if (lista.scrollHeight <= lista.clientHeight) props.onReachTop();
    }, SETTLE_MS);
  }

  return lista;
}

/**
 * Edição NO LUGAR, dentro do próprio balão.
 *
 * Enter salva, Escape cancela, e texto vazio CANCELA em vez de apagar: apagar
 * tem caminho próprio no menu, e um Enter distraído não pode virar exclusão.
 */
function editor(message: MessageBase, props: MessageListProps): HTMLElement {
  const campo = el("textarea", {
    class: "message__editor",
    rows: "1",
    "aria-label": "Editar mensagem",
  }) as HTMLTextAreaElement;
  campo.value = message.body;

  const salvar = (): void => {
    const texto = campo.value.trim();
    if (texto === "" || texto === message.body) {
      props.onCancelEdit();
      return;
    }
    props.onEdit(message.id, texto);
  };

  campo.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      salvar();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      props.onCancelEdit();
    }
  });

  /*
   * O foco vai para o fim do texto, e não para o começo: quem edita quase sempre
   * quer continuar escrevendo ou corrigir o final.
   *
   * Num microtask porque o elemento ainda não está no documento — `focus()` num
   * nó solto não faz nada.
   */
  queueMicrotask(() => {
    campo.focus();
    campo.setSelectionRange(campo.value.length, campo.value.length);
  });

  return campo;
}

/** Um balão por `kind`. O alinhamento e a cor vêm do balão base, então uma imagem
 *  minha também sai à direita com fundo de destaque. */
function renderContent(message: MessageBase): HTMLElement {
  switch (message.kind) {
    case "text":
      return el("p", { class: "message__text" }, [message.body]);

    case "image":
      return el("div", { class: "message__content" }, [
        message.attachment && renderImage(message.attachment),
        message.body !== "" &&
          el("p", { class: "message__text" }, [message.body]),
      ]);

    case "file":
      return el("div", { class: "message__content" }, [
        message.attachment && renderFile(message.attachment),
        message.body !== "" &&
          el("p", { class: "message__text" }, [message.body]),
      ]);

    case "audio":
      return el("div", { class: "message__content" }, [
        message.attachment && renderAudio(message.attachment),
        message.body !== "" &&
          el("p", { class: "message__text" }, [message.body]),
      ]);
  }
}

function renderImage(attachment: Attachment): HTMLElement {
  return el("figure", { class: "message__image" }, [
    el("img", {
      src: attachment.url,
      alt: attachment.fileName,
      loading: "lazy",
      decoding: "async",
    }),
  ]);
}

function renderFile(attachment: Attachment): HTMLElement {
  return el("div", { class: "attachment" }, [
    iconEl(fileIcon(20), "icon attachment__icon"),
    el("span", { class: "attachment__info" }, [
      el("span", { class: "attachment__name", title: attachment.fileName }, [
        attachment.fileName,
      ]),
      el("span", { class: "attachment__meta" }, [
        formatBytes(attachment.sizeBytes),
      ]),
    ]),
    iconEl(clipIcon(16), "icon attachment__trailing"),
  ]);
}

/**
 * Balão de áudio estático: ícone, barras fixas e duração.
 * Não existe <audio> aqui — nesta etapa nada toca.
 */
function renderAudio(attachment: Attachment): HTMLElement {
  const bars = el(
    "span",
    { class: "waveform", "aria-hidden": "true" },
    Array.from({ length: WAVEFORM_BARS }, () =>
      el("span", { class: "waveform__bar" }),
    ),
  );

  return el("div", { class: "attachment attachment--audio" }, [
    iconEl(micIcon(18), "icon attachment__icon"),
    bars,
    el("span", { class: "attachment__meta" }, [
      attachment.durationMs === undefined
        ? "--:--"
        : formatDuration(attachment.durationMs),
    ]),
  ]);
}
