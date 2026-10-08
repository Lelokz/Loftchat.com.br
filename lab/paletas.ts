/**
 * Seção 1 — as cinco paletas, cada uma pintando um mini Loft.
 *
 * Toda cor está escrita em hex direto aqui; a lista mostrada embaixo de cada
 * mini Loft é extraída DESTE objeto, então ela é sempre exatamente o que foi
 * usado — não uma lista mantida à mão que pode ficar para trás.
 */

import { altoFalante, casa, el, secao, seta } from './util';

interface Cores {
  barra: string;
  lateral: string;
  chat: string;
  borda: string;
  casaFundo: string;
  casaIcone: string;
  grupoFundo: string;
  grupoTexto: string;
  texto: string;
  textoFraco: string;
  canalAtivoFundo: string;
  canalAtivoTexto: string;
  balaoOutros: string;
  balaoOutrosTexto: string;
  balaoMeu: string;
  balaoMeuTexto: string;
  citacaoFundo: string;
  citacaoBorda: string;
  citacaoTexto: string;
  autores: [string, string, string];
  entradaFundo: string;
  entradaBorda: string;
  entradaTexto: string;
  enviarFundo: string;
  enviarTexto: string;
  sombra: string;
}

interface Paleta {
  letra: string;
  nome: string;
  ideia: string;
  cores: Cores;
}

const PALETAS: Paleta[] = [
  {
    letra: 'A',
    nome: 'Noite no sótão',
    ideia: 'A sua paleta do Linux: roxo-noite com ciano. O sótão de madrugada, com a tela acesa.',
    cores: {
      barra: '#0E0A1A',
      lateral: '#1A1330',
      chat: '#140F26',
      borda: '#2A2050',
      casaFundo: 'linear-gradient(180deg, #9361F0, #7B3FE4)',
      casaIcone: '#E9E3FF',
      grupoFundo: '#1A1330',
      grupoTexto: '#B9AEE6',
      texto: '#E9E3FF',
      textoFraco: '#9C8FCB',
      canalAtivoFundo: '#2A2050',
      canalAtivoTexto: '#22D3EE',
      balaoOutros: '#231A40',
      balaoOutrosTexto: '#E9E3FF',
      balaoMeu: 'linear-gradient(180deg, #9361F0, #7B3FE4)',
      balaoMeuTexto: '#FFFFFF',
      citacaoFundo: '#6A30CC',
      citacaoBorda: '#22D3EE',
      citacaoTexto: '#E9E3FF',
      autores: ['#22D3EE', '#F0ABFC', '#A3E635'],
      entradaFundo: '#1A1330',
      entradaBorda: '#2A2050',
      entradaTexto: '#9C8FCB',
      enviarFundo: '#22D3EE',
      enviarTexto: '#0E0A1A',
      sombra: '0px 1px 2px #00000066',
    },
  },
  {
    letra: 'B',
    nome: 'Luz de abajur',
    ideia: 'Quente e escura: madeira, âmbar e a luz amarela de um abajur no canto.',
    cores: {
      barra: '#241610',
      lateral: '#34221A',
      chat: '#3E2A1F',
      borda: '#523727',
      casaFundo: 'linear-gradient(180deg, #FFC46B, #F29A3A)',
      casaIcone: '#3A2214',
      grupoFundo: '#3E2A1F',
      grupoTexto: '#E8C9A6',
      texto: '#FBE9D4',
      textoFraco: '#C7A584',
      canalAtivoFundo: '#523727',
      canalAtivoTexto: '#FFC46B',
      balaoOutros: '#4E3526',
      balaoOutrosTexto: '#FBE9D4',
      balaoMeu: 'linear-gradient(180deg, #F6B25A, #E0843A)',
      balaoMeuTexto: '#2B180E',
      citacaoFundo: '#F8C27F',
      citacaoBorda: '#A8502A',
      citacaoTexto: '#2B180E',
      autores: ['#FFC46B', '#F08A6C', '#B8D47A'],
      entradaFundo: '#2E1D15',
      entradaBorda: '#523727',
      entradaTexto: '#C7A584',
      enviarFundo: 'linear-gradient(180deg, #FFC46B, #F29A3A)',
      enviarTexto: '#2B180E',
      sombra: '0px 1px 3px #00000055',
    },
  },
  {
    letra: 'C',
    nome: 'Varanda de manhã',
    ideia: 'Clara: linho, verde-sálvia e terracota. Café na varanda com a janela aberta.',
    cores: {
      barra: '#E8DCC8',
      lateral: '#F5EEE2',
      chat: '#FFFCF6',
      borda: '#E3D3BC',
      casaFundo: 'linear-gradient(180deg, #E58A62, #D2693F)',
      casaIcone: '#FFFFFF',
      grupoFundo: '#F5EEE2',
      grupoTexto: '#8C6F55',
      texto: '#3A2F25',
      textoFraco: '#8F7D69',
      canalAtivoFundo: '#EADFCD',
      canalAtivoTexto: '#C25A33',
      balaoOutros: '#F1E8DA',
      balaoOutrosTexto: '#3A2F25',
      balaoMeu: 'linear-gradient(180deg, #8DB27A, #739B60)',
      balaoMeuTexto: '#FFFFFF',
      citacaoFundo: '#A6C495',
      citacaoBorda: '#FFFFFF',
      citacaoTexto: '#26381D',
      autores: ['#C25A33', '#5E8A4C', '#B0823A'],
      entradaFundo: '#FFFFFF',
      entradaBorda: '#E3D3BC',
      entradaTexto: '#A39079',
      enviarFundo: 'linear-gradient(180deg, #E58A62, #D2693F)',
      enviarTexto: '#FFFFFF',
      sombra: '0px 1px 2px #8C6F5533',
    },
  },
  {
    letra: 'D',
    nome: 'Tarde de 2003',
    ideia: 'Clara e saturada, uma homenagem ao XP: barra de céu azul, botão verde de "Iniciar", laranja de destaque.',
    cores: {
      barra: 'linear-gradient(180deg, #3D86F0, #1F55C4)',
      lateral: 'linear-gradient(180deg, #E3EEFD, #CFDFF8)',
      chat: '#FFFFFF',
      borda: '#B9CDEE',
      casaFundo: 'linear-gradient(180deg, #6CCB5A, #3C9A2D)',
      casaIcone: '#FFFFFF',
      grupoFundo: '#FFFFFF',
      grupoTexto: '#1F55C4',
      texto: '#1B2846',
      textoFraco: '#6578A0',
      canalAtivoFundo: '#FFFFFF',
      canalAtivoTexto: '#1F55C4',
      balaoOutros: '#EEF4FE',
      balaoOutrosTexto: '#1B2846',
      balaoMeu: 'linear-gradient(180deg, #6CCB5A, #3C9A2D)',
      balaoMeuTexto: '#FFFFFF',
      citacaoFundo: '#8AD87A',
      citacaoBorda: '#FFFFFF',
      citacaoTexto: '#123C0C',
      autores: ['#1F55C4', '#D9480F', '#7B3FA0'],
      entradaFundo: '#FFFFFF',
      entradaBorda: '#9DB8E6',
      entradaTexto: '#8193B5',
      enviarFundo: 'linear-gradient(180deg, #FFB547, #F08A1C)',
      enviarTexto: '#FFFFFF',
      sombra: '0px 1px 2px #1F55C433',
    },
  },
  {
    letra: 'E',
    nome: 'Fim de tarde na janela',
    ideia: 'A inesperada: pêssego, coral e ameixa. O pôr do sol batendo na parede do quarto.',
    cores: {
      barra: '#4A2340',
      lateral: '#FCE4D8',
      chat: '#FFF4EE',
      borda: '#F2CDBE',
      casaFundo: 'linear-gradient(180deg, #FF9A76, #F2627B)',
      casaIcone: '#FFFFFF',
      grupoFundo: '#6A3559',
      grupoTexto: '#FCE4D8',
      texto: '#4A2340',
      textoFraco: '#9A6A85',
      canalAtivoFundo: '#F7CDBD',
      canalAtivoTexto: '#4A2340',
      balaoOutros: '#FFFFFF',
      balaoOutrosTexto: '#4A2340',
      balaoMeu: 'linear-gradient(180deg, #F57A8C, #E0566F)',
      balaoMeuTexto: '#FFFFFF',
      citacaoFundo: '#F79AA8',
      citacaoBorda: '#FFFFFF',
      citacaoTexto: '#4A2340',
      autores: ['#E0566F', '#C4691C', '#6A3559'],
      entradaFundo: '#FFFFFF',
      entradaBorda: '#F2CDBE',
      entradaTexto: '#B08A9E',
      enviarFundo: '#4A2340',
      enviarTexto: '#FFF4EE',
      sombra: '0px 1px 3px #4A234022',
    },
  },
];

function grupo(sigla: string, c: Cores): HTMLElement {
  const g = el('div', 'ml-grupo', sigla);
  g.style.background = c.grupoFundo;
  g.style.color = c.grupoTexto;
  return g;
}

function canal(nome: string, c: Cores, ativo = false, voz = false): HTMLElement {
  const linha = el('div', 'ml-canal');
  linha.innerHTML = voz ? altoFalante(14) : '<b>#</b>';
  linha.append(el('span', undefined, nome));
  linha.style.color = ativo ? c.canalAtivoTexto : c.textoFraco;
  if (ativo) {
    linha.style.background = c.canalAtivoFundo;
    linha.style.fontWeight = '700';
  }
  return linha;
}

function rotulo(texto: string, c: Cores): HTMLElement {
  const r = el('div', 'ml-rotulo', texto);
  r.style.color = c.textoFraco;
  return r;
}

function mensagemDeAmigo(c: Cores, autor: 0 | 1 | 2, nome: string, texto: string, hora: string): HTMLElement {
  const linha = el('div', 'ml-msg');
  const avatar = el('div', 'ml-avatar', nome.charAt(0));
  avatar.style.background = c.autores[autor];
  avatar.style.color = c.chat;
  const balao = el('div', 'ml-balao');
  balao.style.background = c.balaoOutros;
  balao.style.color = c.balaoOutrosTexto;
  balao.style.boxShadow = c.sombra;
  const cab = el('div', 'ml-autor', nome);
  cab.style.color = c.autores[autor];
  const h = el('span', 'ml-hora', hora);
  h.style.color = c.textoFraco;
  cab.append(h);
  balao.append(cab, el('div', undefined, texto));
  linha.append(avatar, balao);
  return linha;
}

function minhaMensagem(c: Cores, citadoNome: string, citadoTexto: string, texto: string): HTMLElement {
  const linha = el('div', 'ml-msg ml-msg--minha');
  const balao = el('div', 'ml-balao ml-balao--meu');
  balao.style.background = c.balaoMeu;
  balao.style.color = c.balaoMeuTexto;
  balao.style.boxShadow = c.sombra;
  const citacao = el('div', 'ml-citacao');
  citacao.style.background = c.citacaoFundo;
  citacao.style.borderLeftColor = c.citacaoBorda;
  citacao.style.color = c.citacaoTexto;
  citacao.append(el('b', undefined, citadoNome), el('div', undefined, citadoTexto));
  balao.append(citacao, el('div', undefined, texto));
  linha.append(balao);
  return linha;
}

function miniLoft(c: Cores): HTMLElement {
  const raiz = el('div', 'ml');
  raiz.style.borderColor = c.borda;

  // coluna 1 — barra de grupos, com a casinha em destaque
  const barra = el('div', 'ml-barra');
  barra.style.background = c.barra;
  const botaoCasa = el('div', 'ml-casa');
  botaoCasa.style.background = c.casaFundo;
  botaoCasa.style.color = c.casaIcone;
  botaoCasa.innerHTML = casa(22);
  const sep = el('div', 'ml-sep');
  sep.style.background = c.borda;
  barra.append(botaoCasa, sep, grupo('OS', c), grupo('FM', c));

  // coluna 2 — canais
  const lateral = el('div', 'ml-lateral');
  lateral.style.background = c.lateral;
  const nomeGrupo = el('div', 'ml-lateral-topo', 'Os de sempre');
  nomeGrupo.style.color = c.texto;
  nomeGrupo.style.borderBottomColor = c.borda;
  const rodape = el('div', 'ml-rodape');
  rodape.style.borderTopColor = c.borda;
  const eu = el('div', 'ml-avatar', 'V');
  eu.style.background = c.balaoMeu;
  eu.style.color = c.balaoMeuTexto;
  const euNome = el('span', undefined, 'você');
  euNome.style.color = c.texto;
  rodape.append(eu, euNome);
  lateral.append(
    nomeGrupo,
    rotulo('Canais de texto', c),
    canal('geral', c),
    canal('jogos', c, true),
    canal('filmes', c),
    rotulo('Canais de voz', c),
    canal('Sala', c, false, true),
    rodape,
  );

  // coluna 3 — conversa
  const chat = el('div', 'ml-chat');
  chat.style.background = c.chat;
  const topo = el('div', 'ml-chat-topo', '# jogos');
  topo.style.color = c.texto;
  topo.style.borderBottomColor = c.borda;
  const msgs = el('div', 'ml-msgs');
  msgs.append(
    mensagemDeAmigo(c, 0, 'Ana', 'alguém on hoje à noite?', '19:02'),
    mensagemDeAmigo(c, 1, 'Beto', 'eu! depois das 20h', '19:04'),
    minhaMensagem(c, 'Ana', 'alguém on hoje à noite?', 'bora! eu levo a pipoca 🍿'),
    mensagemDeAmigo(c, 2, 'Carol', 'guardem um lugar no sofá pra mim', '19:07'),
  );
  const composer = el('div', 'ml-composer');
  const entrada = el('div', 'ml-entrada');
  entrada.style.background = c.entradaFundo;
  entrada.style.borderColor = c.entradaBorda;
  const dica = el('span', undefined, 'Conversar em #jogos');
  dica.style.color = c.entradaTexto;
  const enviar = el('div', 'ml-enviar');
  enviar.style.background = c.enviarFundo;
  enviar.style.color = c.enviarTexto;
  enviar.innerHTML = seta(16);
  entrada.append(dica, enviar);
  composer.append(entrada);
  chat.append(topo, msgs, composer);

  raiz.append(barra, lateral, chat);
  return raiz;
}

/** Todos os hex do objeto de cores, na ordem em que aparecem, sem repetir. */
function hexUsados(c: Cores): string[] {
  const achados = JSON.stringify(c).match(/#[0-9A-Fa-f]{6,8}/g) ?? [];
  return [...new Set(achados.map((h) => h.toUpperCase()))];
}

export function secaoPaletas(): HTMLElement {
  const { secao: s, corpo } = secao(
    '1',
    'Paletas',
    'Cada paleta pinta o mesmo mini Loft: barra de grupos com a casinha, canais, uma conversa com citação e a caixa de digitar. Embaixo, o nome e todos os códigos usados.',
  );
  corpo.classList.add('lab-grade--paletas');
  for (const p of PALETAS) {
    const bloco = el('article', 'pal');
    const legenda = el('div', 'pal-legenda');
    const titulo = el('div', 'pal-titulo');
    titulo.append(el('span', 'lab-etiqueta', `Paleta ${p.letra}`), el('span', 'pal-nome', p.nome));
    const lista = el('div', 'pal-hex');
    for (const hex of hexUsados(p.cores)) {
      const item = el('span', 'pal-hex-item');
      const amostra = el('span', 'pal-amostra');
      amostra.style.background = hex;
      item.append(amostra, document.createTextNode(hex));
      lista.append(item);
    }
    legenda.append(titulo, el('p', 'pal-ideia', p.ideia), lista);
    bloco.append(miniLoft(p.cores), legenda);
    corpo.append(bloco);
  }
  return s;
}
