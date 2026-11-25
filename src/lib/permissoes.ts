/**
 * PERMISSÕES DOS CARGOS (0.8.5) — a lista do plano aprovado, uma por uma.
 *
 * Cada cargo guarda os ids das permissões ligadas. Um membro pode o que
 * QUALQUER um dos cargos dele (ou o @todos) permite. "administrador" vale
 * tudo. O dono sempre pode tudo.
 *
 * `futura`: a função ainda não existe no app (enquetes, câmera…); a
 * permissão já fica na lista e passa a valer quando a função chegar.
 */

export interface Permissao {
  id: string;
  nome: string;
  desc: string;
  aviso?: string;
  futura?: string;
}

export interface SecaoDePermissoes {
  nome: string;
  itens: Permissao[];
}

export const SECOES_DE_PERMISSOES: SecaoDePermissoes[] = [
  {
    nome: 'Servidor',
    itens: [
      { id: 'administrador', nome: 'Administrador', desc: 'Tem TODAS as permissões e passa por cima das regras dos canais.', aviso: 'Cuidado: só dê para quem você confia muito.' },
      { id: 'editar-nome', nome: 'Editar nome do servidor', desc: 'Muda o nome do grupo.' },
      { id: 'editar-foto', nome: 'Editar foto do servidor', desc: 'Troca ou tira a foto do grupo.' },
      { id: 'editar-banner', nome: 'Editar banner', desc: 'Troca ou tira o banner do cartão do grupo.' },
      { id: 'editar-descricao', nome: 'Editar descrição', desc: 'Muda a descrição que aparece no cartão do grupo.' },
      { id: 'editar-boas-vindas', nome: 'Editar mensagem de boas-vindas', desc: 'Muda o cartão que quem entra vê no topo do chat.' },
      { id: 'editar-cor', nome: 'Editar cor do servidor', desc: 'Muda a cor do grupo (aba e cartão).' },
      { id: 'criar-canais', nome: 'Criar canais', desc: 'Cria canais de texto e salas de voz.' },
      { id: 'editar-canais', nome: 'Editar canais', desc: 'Muda nome, emoji, modo lento e limite de pessoas dos canais.' },
      { id: 'apagar-canais', nome: 'Apagar canais', desc: 'Apaga canais de texto e salas de voz.' },
      { id: 'gerenciar-categorias', nome: 'Gerenciar categorias', desc: 'Cria, renomeia e apaga categorias de canais.' },
      { id: 'ordenar-canais', nome: 'Mudar a ordem dos canais', desc: 'Arrasta canais e categorias para outra posição.' },
      { id: 'permissoes-canais', nome: 'Gerenciar permissões dos canais', desc: 'Escolhe quem vê, escreve, entra e fala em cada canal.' },
      { id: 'gerenciar-cargos', nome: 'Gerenciar cargos', desc: 'Cria e edita cargos ABAIXO do cargo mais alto dele, e só com permissões que ele tem.' },
      { id: 'ver-registro', nome: 'Ver registro de auditoria', desc: 'Vê quem fez o quê no grupo: cargos, remoções, mensagens apagadas…' },
      { id: 'adicionar-figurinhas', nome: 'Adicionar figurinhas do servidor', desc: 'Põe figurinhas novas no grupo, que todo mundo pode usar.' },
      { id: 'gerenciar-figurinhas', nome: 'Gerenciar figurinhas do servidor', desc: 'Edita e apaga figurinhas do grupo, inclusive as dos outros.' },
      { id: 'criar-comandos', nome: 'Criar comandos personalizados', desc: 'Cria comandos com / próprios do grupo (ex.: /regras).' },
      { id: 'gerenciar-comandos', nome: 'Gerenciar comandos personalizados', desc: 'Edita e apaga comandos do grupo, inclusive os dos outros.' },
    ],
  },
  {
    nome: 'Membros',
    itens: [
      { id: 'criar-convites', nome: 'Criar convites', desc: 'Gera links para chamar gente nova para o grupo.' },
      { id: 'gerenciar-convites', nome: 'Gerenciar convites', desc: 'Vê e apaga os convites dos outros.' },
      { id: 'expulsar', nome: 'Expulsar', desc: 'Tira alguém do grupo. A pessoa pode voltar com um convite.' },
      { id: 'banir', nome: 'Banir', desc: 'Tira alguém e impede que volte pelo convite.' },
      { id: 'desbanir', nome: 'Ver banidos e desbanir', desc: 'Vê a lista de banidos e deixa alguém voltar.' },
      { id: 'castigo', nome: 'Castigo', desc: 'Deixa alguém sem escrever e sem falar por um tempo (60 s a 1 semana).' },
      { id: 'tirar-castigo', nome: 'Tirar castigo', desc: 'Termina o castigo de alguém antes da hora.' },
      { id: 'apelido-proprio', nome: 'Mudar o próprio apelido no servidor', desc: 'Usa um nome diferente só neste grupo.' },
      { id: 'apelido-outros', nome: 'Mudar o apelido dos outros', desc: 'Muda o nome de outra pessoa neste grupo.' },
      { id: 'dar-cargos', nome: 'Dar e tirar cargos', desc: 'Dá e tira cargos que estão ABAIXO do cargo mais alto dele.' },
      { id: 'ver-entrada', nome: 'Ver como cada um entrou', desc: 'Vê quando cada pessoa entrou e por qual convite.' },
    ],
  },
  {
    nome: 'Texto',
    itens: [
      { id: 'ver-canal', nome: 'Ver canal', desc: 'Vê o canal na lista e lê o que está lá.' },
      { id: 'ler-antigas', nome: 'Ler mensagens antigas', desc: 'Lê o que foi mandado antes de abrir o canal.' },
      { id: 'mandar-mensagens', nome: 'Mandar mensagens', desc: 'Escreve nos canais de texto.' },
      { id: 'responder', nome: 'Responder mensagens', desc: 'Responde citando a mensagem de alguém.' },
      { id: 'mandar-fotos', nome: 'Mandar fotos', desc: 'Manda imagens no chat.' },
      { id: 'mandar-gifs', nome: 'Mandar GIFs', desc: 'Manda GIFs no chat.' },
      { id: 'mandar-videos', nome: 'Mandar vídeos', desc: 'Manda vídeos no chat.' },
      { id: 'mandar-audio', nome: 'Mandar mensagem de voz', desc: 'Grava e manda áudio no chat.' },
      { id: 'mandar-figurinhas', nome: 'Mandar figurinhas', desc: 'Manda figurinhas no chat.' },
      { id: 'mandar-links', nome: 'Mandar links', desc: 'Manda mensagens com links.' },
      { id: 'previa-links', nome: 'Mostrar prévia de links', desc: 'Os links mostram a prévia (ex.: vídeo do YouTube).' },
      { id: 'mencionar-pessoas', nome: 'Mencionar pessoas', desc: 'Usa @ para chamar alguém.' },
      { id: 'mencionar-cargos', nome: 'Mencionar qualquer cargo', desc: 'Chama um cargo inteiro com @, mesmo os que não podem ser mencionados.' },
      { id: 'mencionar-todos', nome: 'Mencionar @todos e @aqui', desc: 'Chama o grupo inteiro de uma vez.' },
      { id: 'usar-comandos', nome: 'Usar comandos', desc: 'Usa os comandos com / na caixa de mensagem.' },
      { id: 'fixar', nome: 'Fixar mensagens', desc: 'Fixa mensagens no canal.' },
      { id: 'desafixar', nome: 'Desafixar mensagens', desc: 'Tira mensagens das fixadas.' },
      { id: 'apagar-dos-outros', nome: 'Apagar mensagens dos outros', desc: 'Apaga mensagens de outras pessoas.' },
      { id: 'apagar-varias', nome: 'Apagar várias de uma vez', desc: 'Usa o /limpar para apagar as últimas mensagens.' },
      { id: 'ignorar-lento', nome: 'Ignorar o modo lento', desc: 'Escreve sem esperar o tempo do modo lento.' },
      { id: 'ver-galeria', nome: 'Ver a galeria', desc: 'Abre a aba Mídia com as fotos e vídeos do grupo.' },
    ],
  },
  {
    nome: 'Voz, vídeo e tela',
    itens: [
      { id: 'ver-sala', nome: 'Ver a sala', desc: 'Vê a sala de voz na lista e quem está nela.' },
      { id: 'entrar', nome: 'Entrar', desc: 'Entra nas salas de voz.' },
      { id: 'falar', nome: 'Falar', desc: 'Liga o microfone dentro da sala.' },
      { id: 'transmitir', nome: 'Transmitir tela', desc: 'Compartilha a tela na sala.' },
      { id: 'transmitir-som', nome: 'Transmitir tela com som', desc: 'Manda o som do computador junto com a tela.' },
      { id: 'camera', nome: 'Ligar câmera', desc: 'Liga a câmera na sala.', futura: 'câmera' },
      { id: 'sala-cheia', nome: 'Entrar em sala cheia', desc: 'Entra mesmo quando a sala chegou no limite de pessoas.' },
      { id: 'silenciar-outros', nome: 'Silenciar o microfone dos outros', desc: 'Desliga o microfone de alguém na sala.' },
      { id: 'ensurdecer-outros', nome: 'Ensurdecer os outros', desc: 'Faz alguém parar de ouvir a sala.' },
      { id: 'parar-transmissao', nome: 'Parar a transmissão dos outros', desc: 'Encerra a tela que outra pessoa está mostrando.' },
      { id: 'mover', nome: 'Mover pessoas entre salas', desc: 'Leva alguém de uma sala de voz para outra.' },
      { id: 'tirar-da-chamada', nome: 'Tirar da chamada', desc: 'Desconecta alguém da sala de voz.' },
      { id: 'ver-chat-sala', nome: 'Ver o chat da sala', desc: 'Lê o chat de texto da sala de voz.' },
      { id: 'escrever-chat-sala', nome: 'Escrever no chat da sala', desc: 'Escreve no chat de texto da sala de voz.' },
      { id: 'status-sala', nome: 'Definir o status da sala', desc: 'Põe um texto curto na sala (ex.: "jogando Minecraft").' },
    ],
  },
  {
    nome: 'Funções que estão chegando',
    itens: [
      { id: 'mandar-enquetes', nome: 'Mandar enquetes', desc: 'Cria enquetes no chat.', futura: 'enquetes' },
      { id: 'votar-enquetes', nome: 'Votar em enquetes', desc: 'Vota nas enquetes do grupo.', futura: 'enquetes' },
      { id: 'encerrar-enquetes', nome: 'Encerrar enquetes dos outros', desc: 'Termina a enquete de outra pessoa.', futura: 'enquetes' },
      { id: 'visualizacao-unica', nome: 'Mandar visualização única', desc: 'Manda algo que some depois de visto.', futura: 'visualização única' },
      { id: 'transcricao', nome: 'Usar transcrição', desc: 'Transforma mensagens de voz em texto.', futura: 'transcrição' },
      { id: 'mini-jogos-iniciar', nome: 'Iniciar mini-jogos', desc: 'Começa um mini-jogo na sala.', futura: 'mini-jogos' },
      { id: 'mini-jogos-jogar', nome: 'Participar de mini-jogos', desc: 'Entra nos mini-jogos dos outros.', futura: 'mini-jogos' },
      { id: 'reagir', nome: 'Reagir', desc: 'Reage às mensagens com emoji.', futura: 'reações' },
      { id: 'mandar-arquivos', nome: 'Mandar arquivos', desc: 'Manda PDF, ZIP e outros arquivos.', futura: 'arquivos' },
    ],
  },
];

export const TODAS_AS_PERMISSOES: Permissao[] = SECOES_DE_PERMISSOES.flatMap((s) => s.itens);
const IDS = new Set(TODAS_AS_PERMISSOES.map((p) => p.id));

/** Só ids que existem (o que vier estranho do banco é ignorado). */
export function permissoesValidas(lista: unknown): string[] {
  return Array.isArray(lista) ? [...new Set(lista.filter((p): p is string => typeof p === 'string' && IDS.has(p)))] : [];
}

/**
 * O @todos nasce com o que todo membro já podia fazer antes dos cargos:
 * conversar, mandar mídia, entrar na voz e transmitir.
 */
export const PERMISSOES_DO_TODOS: string[] = [
  'apelido-proprio',
  'ver-canal',
  'ler-antigas',
  'mandar-mensagens',
  'responder',
  'mandar-fotos',
  'mandar-gifs',
  'mandar-videos',
  'mandar-audio',
  'mandar-figurinhas',
  'mandar-links',
  'previa-links',
  'mencionar-pessoas',
  'usar-comandos',
  'ver-galeria',
  'ver-sala',
  'entrar',
  'falar',
  'transmitir',
  'transmitir-som',
  'camera',
  'ver-chat-sala',
  'escrever-chat-sala',
  'mandar-enquetes',
  'votar-enquetes',
  'visualizacao-unica',
  'transcricao',
  'mini-jogos-iniciar',
  'mini-jogos-jogar',
  'reagir',
  'mandar-arquivos',
];
