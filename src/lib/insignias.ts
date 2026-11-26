/**
 * INSÍGNIAS (0.12.0): as 100, da mais fácil à mais difícil — e (0.12.5) as
 * especiais, que só o criador dá (Exclusiva) ou que são só dele (Especial).
 *
 * Cada uma diz QUAL contador olha (`conta`) e a META (`alvo`): ganha quem tem
 * `n[conta] >= alvo`. Os contadores moram em `insignias/{uid}.n` e só o
 * CARTEIRO mexe neles (carteiro/src/insignias.ts) — o app só mostra. Este
 * arquivo é o mesmo nos dois lados (como lib/permissoes.ts).
 *
 * Os desenhos ficam em components/insignias/desenhos.ts (o carteiro não
 * precisa deles).
 */

export type Raridade = 'comum' | 'incomum' | 'rara' | 'epica' | 'lendaria' | 'exclusiva' | 'especial';

/** As cromadas (0.12.5): metal com reflexo de arco-íris; a cor do nome que brilha. */
export type Cromo = 'roxo' | 'ouro' | 'prata';

export interface Insignia {
  id: string;
  categoria: string;
  /** Qual desenho (components/insignias/desenhos.ts). */
  icone: string;
  nome: string;
  desc: string;
  raridade: Raridade;
  /** I, II, III… (as que são uma série). */
  nivel?: number;
  /** Só aparece o "?" até ganhar. */
  secreta?: boolean;
  /** O contador (insignias/{uid}.n) e a meta. */
  conta: string;
  alvo: number;
  /** Cromada: o metal da medalha (e do nome de quem tem). */
  cromo?: Cromo;
}

export const RARIDADES: Record<Raridade, { nome: string; a: string; b: string; borda: string; glifo: string; dificuldade: string }> = {
  comum: { nome: 'Comum', a: '#c3cad6', b: '#5b6577', borda: '#e2e8f0', glifo: '#fff', dificuldade: 'fácil' },
  incomum: { nome: 'Incomum', a: '#6ee7a0', b: '#13804a', borda: '#bbf7d0', glifo: '#fff', dificuldade: 'um pouco de esforço' },
  rara: { nome: 'Rara', a: '#7cb8ff', b: '#1d4fd8', borda: '#bfdbfe', glifo: '#fff', dificuldade: 'pra quem usa muito' },
  // 0.12.5: a épica ficou lilás (mais clara), para não confundir com o roxo cromado da Especial.
  epica: { nome: 'Épica', a: '#f0dcff', b: '#b98ae8', borda: '#fbf3ff', glifo: '#4b2470', dificuldade: 'difícil' },
  lendaria: { nome: 'Lendária', a: '#ffe58a', b: '#c47a06', borda: '#fff4c2', glifo: '#4a2a00', dificuldade: 'quase impossível' },
  exclusiva: { nome: 'Exclusiva', a: '#f6f9ff', b: '#6f86ad', borda: '#ffffff', glifo: '#24324d', dificuldade: 'só o criador dá' },
  especial: { nome: 'Especial', a: '#e7d2ff', b: '#6a12e8', borda: '#f1e2ff', glifo: '#fff', dificuldade: 'uma só no Loft' },
};

/** Os pontos de cor de cada metal (o reflexo) e quanto do arco-íris aparece. */
export const CROMOS: Record<Cromo, { cores: string[]; borda: string; glifo: string; holo: number; brilho: string }> = {
  roxo: { cores: ['#2a0570', '#7a1dff', '#e7d2ff', '#9a3dff', '#3d0a9c', '#b46bff', '#f3e8ff', '#6a12e8'], borda: '#f1e2ff', glifo: '#fff', holo: 0.38, brilho: 'rgb(150 70 255 / 70%)' },
  ouro: { cores: ['#7a4d00', '#e0a419', '#fff6d5', '#d39a12', '#8a5a00', '#ffd76a', '#fffbe9', '#b37a05'], borda: '#fff3c8', glifo: '#4a2c00', holo: 0.22, brilho: 'rgb(255 200 80 / 45%)' },
  prata: { cores: ['#3f5376', '#9fb4d6', '#ffffff', '#8aa1c7', '#4a5d80', '#cfe0ff', '#f6f9ff', '#6f86ad'], borda: '#ffffff', glifo: '#24324d', holo: 0.3, brilho: 'rgb(170 200 255 / 45%)' },
};

/** As que não contam na coleção (ninguém consegue todas): Exclusiva e Especial. */
export function eEspecial(ins: Insignia): boolean {
  return ins.raridade === 'exclusiva' || ins.raridade === 'especial';
}

export const ORDEM_DAS_RARIDADES: Raridade[] = ['comum', 'incomum', 'rara', 'epica', 'lendaria', 'exclusiva', 'especial'];
const ROMANOS = ['I', 'II', 'III', 'IV', 'V'];

export const INSIGNIAS: Insignia[] = [];

function um(categoria: string, id: string, icone: string, nome: string, desc: string, raridade: Raridade, conta: string, alvo = 1, extra: Partial<Insignia> = {}): void {
  INSIGNIAS.push({ categoria, id, icone, nome, desc, raridade, conta, alvo, ...extra });
}

/** Uma série (I, II, III…): metas e raridades na ordem. */
function serie(categoria: string, id: string, icone: string, nome: string, conta: string, metas: number[], raridades: Raridade[], texto: (meta: string) => string, escala = 1): void {
  metas.forEach((meta, i) =>
    um(categoria, `${id}${i + 1}`, icone, `${nome} ${ROMANOS[i]}`, texto(meta.toLocaleString('pt-BR')), raridades[i]!, conta, meta * escala, { nivel: i + 1 }),
  );
}

const CINCO: Raridade[] = ['comum', 'incomum', 'rara', 'epica', 'lendaria'];

/* --- Conversa ------------------------------------------------------------- */
um('Conversa', 'primeira', 'primeira', 'Primeira mensagem', 'Mandou a primeira mensagem.', 'comum', 'mensagens');
serie('Conversa', 'tagarela', 'tagarela', 'Tagarela', 'mensagens', [100, 1000, 5000, 20000, 100000], CINCO, (m) => `${m} mensagens.`);
serie('Conversa', 'semfolga', 'semfolga', 'Sem folga', 'diasSeguidos', [7, 30, 100, 365], ['incomum', 'rara', 'epica', 'lendaria'], (m) => `Conversou ${m} dias seguidos.`);
um('Conversa', 'coruja', 'coruja', 'Coruja', '50 mensagens entre 2h e 5h.', 'incomum', 'madrugada', 50);
um('Conversa', 'madrugador', 'madrugador', 'Madrugador', '50 mensagens entre 5h e 7h.', 'incomum', 'cedo', 50);
um('Conversa', 'respondao', 'respondao', 'Respondão', 'Respondeu 500 mensagens.', 'rara', 'respostas', 500);
um('Conversa', 'editor', 'editor', 'Editor', 'Editou 100 mensagens.', 'incomum', 'editadas', 100);
um('Conversa', 'fixador', 'fixador', 'Fixador', 'Fixou 25 mensagens.', 'incomum', 'fixadas', 25);
um('Conversa', 'carteiro', 'carteiro', 'Carteiro', 'Encaminhou 50 mensagens.', 'incomum', 'encaminhadas', 50);

/* --- Mídia ----------------------------------------------------------------- */
serie('Mídia', 'fotografo', 'fotografo', 'Fotógrafo', 'fotos', [10, 100, 1000], ['comum', 'incomum', 'rara'], (m) => `${m} fotos.`);
serie('Mídia', 'cineasta', 'cineasta', 'Cineasta', 'videos', [10, 100], ['incomum', 'rara'], (m) => `${m} vídeos.`);
serie('Mídia', 'locutor', 'locutor', 'Locutor', 'audios', [10, 100, 1000], ['comum', 'incomum', 'rara'], (m) => `${m} áudios.`);
um('Mídia', 'arquivista', 'arquivista', 'Arquivista', 'Mandou 50 arquivos.', 'incomum', 'arquivos', 50);
serie('Mídia', 'figurinheiro', 'figurinheiro', 'Figurinheiro', 'figurinhas', [50, 500], ['incomum', 'rara'], (m) => `${m} figurinhas.`);
um('Mídia', 'fantasma', 'fantasma', 'Fantasma', '10 visualizações únicas.', 'incomum', 'unicas', 10);
um('Mídia', 'leitor', 'leitor', 'Leitor de lábios', '25 transcrições.', 'incomum', 'transcricoes', 25);
um('Mídia', 'gifeiro', 'gifeiro', 'Gifeiro', 'Mandou 100 GIFs.', 'incomum', 'gifs', 100);

/* --- Reações --------------------------------------------------------------- */
serie('Reações', 'reator', 'reator', 'Reator', 'reacoesDadas', [100, 1000, 10000], ['comum', 'incomum', 'rara'], (m) => `Deu ${m} reações.`);
serie('Reações', 'querido', 'querido', 'Querido', 'reacoesRecebidas', [100, 1000, 10000], ['incomum', 'rara', 'epica'], (m) => `Recebeu ${m} reações.`);
um('Reações', 'emojis', 'emojis', 'Paleta de emojis', 'Usou 100 emojis diferentes.', 'incomum', 'emojisDiferentes', 100);
um('Reações', 'viral', 'viral', 'Viral', 'Uma mensagem com 10 reações.', 'rara', 'viral');
um('Reações', 'unanimidade', 'unanimidade', 'Unanimidade', 'Todo mundo de um grupo de 5+ reagiu.', 'epica', 'unanimidade');

/* --- Voz e vídeo (minutos) -------------------------------------------------- */
um('Voz e vídeo', 'chamada', 'chamada', 'Primeira chamada', 'Entrou numa chamada.', 'comum', 'minutosVoz');
serie('Voz e vídeo', 'vozativa', 'vozativa', 'Voz ativa', 'minutosVoz', [1, 10, 50, 200, 1000], CINCO, (m) => `${m} h em sala de voz.`, 60);
um('Voz e vídeo', 'maratonacall', 'ampulheta', 'Maratona de call', '5 h seguidas numa chamada.', 'rara', 'maiorCallMin', 300);
um('Voz e vídeo', 'camera', 'camera', 'Câmera ligada', '10 h de câmera.', 'incomum', 'minutosCamera', 600);
um('Voz e vídeo', 'apresentador', 'apresentador', 'Apresentador', 'Compartilhou a tela 20 vezes.', 'incomum', 'telas', 20);
um('Voz e vídeo', 'telefonista', 'telefonista', 'Telefonista', '50 ligações no privado.', 'rara', 'ligacoes', 50);
um('Voz e vídeo', 'salacheia', 'salacheia', 'Sala cheia', 'Chamada com 8 pessoas.', 'epica', 'salaCheia');
um('Voz e vídeo', 'callnoite', 'callnoite', 'Call da madrugada', 'Em chamada entre 3h e 5h.', 'incomum', 'callNoite');

/* --- Amigos e grupos -------------------------------------------------------- */
serie('Amigos e grupos', 'enturmado', 'enturmado', 'Enturmado', 'amigos', [1, 5, 10, 25], ['comum', 'incomum', 'rara', 'epica'], (m) => `${m} ${m === '1' ? 'amigo' : 'amigos'}.`);
um('Amigos e grupos', 'anfitriao', 'anfitriao', 'Anfitrião', 'Criou um grupo.', 'comum', 'gruposCriados');
serie('Amigos e grupos', 'fundador', 'fundador', 'Fundador', 'maiorGrupo', [5, 15, 50], ['incomum', 'rara', 'lendaria'], (m) => `Seu grupo chegou a ${m} pessoas.`);
um('Amigos e grupos', 'convidador', 'convidador', 'Convidador', '10 pessoas entraram pelo seu convite.', 'rara', 'convidados', 10);
um('Amigos e grupos', 'arquiteto', 'arquiteto', 'Arquiteto', 'Grupo com 10 canais.', 'incomum', 'maisCanais', 10);
um('Amigos e grupos', 'moderador', 'moderador', 'Moderador', 'Tem um cargo que modera.', 'incomum', 'modera');

/* --- Jogos (o PC vê; minutos) ----------------------------------------------- */
um('Jogos', 'jogador', 'jogador', 'Jogador', 'Primeiro jogo que o PC viu.', 'comum', 'minutosJogo');
um('Jogos', 'perfilgamer', 'perfilgamer', 'Perfil gamer', 'Favorito e 5 de "ultimamente".', 'comum', 'perfilGamer');
serie('Jogos', 'horas', 'horas', 'Horas de jogo', 'minutosJogo', [10, 100, 500, 1000, 5000], CINCO, (m) => `${m} h jogando.`, 60);
serie('Jogos', 'colecionador', 'colecionador', 'Colecionador', 'jogosDiferentes', [10, 50, 150], ['incomum', 'rara', 'epica'], (m) => `${m} jogos diferentes.`);
serie('Jogos', 'maratona', 'maratona', 'Maratona', 'maiorJogatinaMin', [4, 8, 12], ['incomum', 'rara', 'epica'], (m) => `${m} h seguidas no mesmo jogo.`, 60);
um('Jogos', 'dupla', 'dupla', 'Dupla dinâmica', '50 h no mesmo jogo junto com um amigo.', 'rara', 'maiorDuplaMin', 3000);
um('Jogos', 'esquadrao', 'esquadrao', 'Esquadrão', '4 do grupo no mesmo jogo, juntos.', 'rara', 'esquadrao');
um('Jogos', 'fiel', 'fiel', 'Fiel', '100 h num jogo só.', 'epica', 'maiorJogoMin', 6000);
um('Jogos', 'naolarga', 'naolarga', 'Não larga', 'O mesmo jogo 30 dias seguidos.', 'epica', 'mesmoJogoDias', 30);
um('Jogos', 'explorador', 'explorador', 'Explorador', 'Jogos de 4 lojas diferentes.', 'rara', 'lojas', 4);
um('Jogos', 'diaum', 'diaum', 'Dia um', 'Jogou no dia do lançamento.', 'rara', 'diaUm');

/* --- Tempo de casa ----------------------------------------------------------- */
um('Tempo de casa', 'pioneiro', 'pioneiro', 'Pioneiro', 'Entrou no beta.', 'rara', 'pioneiro');
serie('Tempo de casa', 'aniversario', 'aniversario', 'Aniversário', 'anos', [1, 2, 3, 5], ['incomum', 'rara', 'epica', 'lendaria'], (m) => `${m} ${m === '1' ? 'ano' : 'anos'} de conta.`);
um('Tempo de casa', 'fielloft', 'fielloft', 'Fiel ao Loft', 'Usou o Loft em 100 dias.', 'rara', 'diasAtivos', 100);
um('Tempo de casa', 'estiloso', 'estiloso', 'Estiloso', 'Perfil completo.', 'comum', 'perfilCompleto');

/* --- Especiais (dadas à mão, ver ESPECIAIS no carteiro) ---------------------- */
um('Especiais', 'criador', 'criador', 'Criador do Loftchat', 'Fez o Loftchat. Só existe uma.', 'especial', 'esp_criador', 1, { cromo: 'roxo' });
um('Especiais', 'confidente', 'confidente', 'Confidente', 'Amigo de confiança do criador.', 'exclusiva', 'esp_confidente', 1, { cromo: 'ouro' });
// O id continua "testador" (é o mesmo de antes); o nome novo é Linha de Frente.
um('Especiais', 'testador', 'linhadefrente', 'Linha de Frente', 'Testou o Loftchat no beta, com bug e tudo.', 'exclusiva', 'esp_testador', 1, { cromo: 'prata' });
// 0.13.0: conta bug CONFIRMADO pelo Reportar bug (Configurações), não reporte mandado.
serie('Especiais', 'bug', 'bug', 'Caçador de bugs', 'bugs', [1, 5, 15], ['rara', 'epica', 'lendaria'], (m) => `${m} ${m === '1' ? 'bug confirmado' : 'bugs confirmados'}.`);
um('Especiais', 'primeiros', 'primeiros', 'Primeiros 10', 'Uma das 10 primeiras contas.', 'lendaria', 'primeiros');
um('Especiais', 'lancamento', 'lancamento', 'Lançamento 1.0', 'Estava no Loft no dia da 1.0.', 'epica', 'esp_lancamento');

/* --- Secretas ----------------------------------------------------------------- */
const S = { secreta: true };
um('Secretas', 'virada', 'virada', 'Virada', 'Mensagem à meia-noite do Ano Novo.', 'epica', 'virada', 1, S);
um('Secretas', 'parabens', 'parabens', 'Parabéns, Loft', 'Conversou no aniversário do Loftchat.', 'rara', 'parabens', 1, S);
um('Secretas', 'risada', 'risada', 'Risada épica', 'Uma mensagem com 50 "k".', 'incomum', 'risada', 1, S);
um('Secretas', 'boanoite', 'boanoite', 'Boa noite', 'Disse "boa noite" 100 vezes.', 'incomum', 'boaNoite', 100, S);
um('Secretas', 'q404', 'q404', '4:04', 'Mensagem às 4h04.', 'incomum', 'q404', 1, S);
um('Secretas', 'colecao', 'colecao', 'Colecionadora', 'Ganhou 50 insígnias.', 'epica', '_ganhas', 50, S);
um('Secretas', 'completo', 'completo', 'Completo', 'Ganhou todas as outras.', 'lendaria', '_ganhas', 99, S);
// "Todas as outras" = as normais (as especiais não entram na conta).
INSIGNIAS.find((i) => i.id === 'completo')!.alvo = INSIGNIAS.filter((i) => !eEspecial(i) && i.id !== 'completo').length;

export const POR_ID: ReadonlyMap<string, Insignia> = new Map(INSIGNIAS.map((i) => [i.id, i]));
export const CATEGORIAS: string[] = [...new Set(INSIGNIAS.map((i) => i.categoria))];

/** Quantas das normais (sem as especiais) estão nesta lista de ids. */
export function normaisGanhas(ids: Iterable<string>): number {
  return [...ids].filter((id) => POR_ID.get(id) !== undefined && !eEspecial(POR_ID.get(id)!)).length;
}

/** As que a pessoa ganha com estes contadores (fora as que já tem). */
export function novasInsignias(n: Record<string, number>, tem: ReadonlySet<string>): string[] {
  const novas: string[] = [];
  const ganhas = new Set(tem);
  // Duas passadas: "Colecionadora" e "Completo" contam as ganhas agora também.
  for (let volta = 0; volta < 2; volta += 1) {
    for (const ins of INSIGNIAS) {
      if (ganhas.has(ins.id)) continue;
      const valor = ins.conta === '_ganhas' ? [...ganhas].filter((id) => id !== ins.id && POR_ID.get(id) !== undefined && !eEspecial(POR_ID.get(id)!)).length : (n[ins.conta] ?? 0);
      if (valor >= ins.alvo) {
        ganhas.add(ins.id);
        novas.push(ins.id);
      }
    }
  }
  return novas;
}

/** "12.840 / 20.000" (as de minutos viram horas). Null = não tem contagem para mostrar. */
export function progresso(ins: Insignia, n: Record<string, number>, ganhas: number): { atual: number; alvo: number; texto: string; falta: string } | null {
  if (ins.alvo <= 1) return null;
  const emHoras = /Min$|^minutos/.test(ins.conta);
  const bruto = ins.conta === '_ganhas' ? ganhas : (n[ins.conta] ?? 0);
  const atual = Math.min(emHoras ? Math.floor(bruto / 60) : bruto, emHoras ? ins.alvo / 60 : ins.alvo);
  const alvo = emHoras ? ins.alvo / 60 : ins.alvo;
  const f = (x: number): string => x.toLocaleString('pt-BR');
  const sufixo = emHoras ? ' h' : '';
  return { atual, alvo, texto: `${f(atual)}${sufixo} / ${f(alvo)}${sufixo}`, falta: `faltam ${f(Math.max(0, alvo - atual))}${sufixo}` };
}
