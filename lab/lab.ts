/**
 * Laboratório de identidade visual do Loft — entrada da página lab.html.
 *
 * Isolado do app: não importa nada de src/ e nada de src/ importa daqui.
 */

import './lab.css';
import { secaoPaletas } from './paletas';
import { animar, cartao, casa, casaDetalhada, el, secao } from './util';

/* ------------------------------------------------------------------------ */
/* Topo                                                                      */
/* ------------------------------------------------------------------------ */

function topo(): HTMLElement {
  const t = el('header', 'lab-topo');
  const marca = el('div', 'lab-marca');
  marca.innerHTML = casa(30);
  marca.append(el('h1', undefined, 'Laboratório de identidade do Loft'));
  const como = el(
    'p',
    'lab-topo-texto',
    'Tudo aqui tem letra ou número. Para escolher, responda algo como: "paleta B, botão 3, clique 2, transição 1 em 200 ms, cantos 2, chegada 3, detalhes 7.1 e 7.4".',
  );
  const chave = el('label', 'lab-chave');
  const caixa = el('input');
  caixa.type = 'checkbox';
  caixa.addEventListener('change', () => document.body.classList.toggle('lab-reduzido', caixa.checked));
  const sistema = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  chave.append(
    caixa,
    document.createTextNode(
      ` Simular "reduzir movimento" (o do sistema está ${sistema ? 'LIGADO' : 'desligado'} nesta máquina)`,
    ),
  );
  t.append(marca, como, chave);
  return t;
}

/* ------------------------------------------------------------------------ */
/* 2. Estilos de botão                                                       */
/* ------------------------------------------------------------------------ */

const BOTOES: Array<[string, string, string]> = [
  ['1', 'Chapado e bem arredondado', 'Cor sólida, sem sombra. Ao passar o mouse clareia; ao apertar, encolhe um pouco.'],
  ['2', 'Com volume (à la XP)', 'Gradiente de cima para baixo, brilho na borda de cima e sombra. Ao apertar, o gradiente inverte e afunda.'],
  ['3', 'Pílula', 'Totalmente arredondado nas pontas. Ao passar o mouse sobe 1px; ao apertar, encolhe.'],
  ['4', 'Macio (borracha)', 'Sombras internas em cima e embaixo, como um botão de controle remoto. Ao apertar, achata.'],
  ['5', 'Tecla com altura', 'Tem "espessura" embaixo. Ao apertar, desce até encostar na base, como uma tecla.'],
];

function botaoExemplo(classe: string, soIcone: boolean): HTMLButtonElement {
  const b = el('button', `bt ${classe}${soIcone ? ' bt-icone' : ''}`);
  b.type = 'button';
  b.innerHTML = casa(soIcone ? 22 : 18);
  if (soIcone) b.setAttribute('aria-label', 'Tela inicial');
  else b.append(el('span', undefined, 'Enviar'));
  return b;
}

function secaoBotoes(): HTMLElement {
  const { secao: s, corpo } = secao(
    '2',
    'Estilos de botão',
    'O mesmo botão "Enviar" e o mesmo botão só com a casinha, em cinco estilos. Passe o mouse e aperte.',
  );
  for (const [n, titulo, desc] of BOTOES) {
    const { cartao: c, corpo: dentro } = cartao(`Botão ${n}`, titulo, desc);
    const linha = el('div', 'lab-linha');
    linha.append(botaoExemplo(`b${n}`, false), botaoExemplo(`b${n}`, true));
    dentro.append(linha);
    corpo.append(c);
  }
  return s;
}

/* ------------------------------------------------------------------------ */
/* 3. Reação ao clique                                                       */
/* ------------------------------------------------------------------------ */

type Reacao = 1 | 2 | 3 | 4;

const REACOES: Array<[Reacao, string, string]> = [
  [1, 'Encolher e voltar', 'Aperta: encolhe para 92% em 150 ms. Solta: volta ao normal em 150 ms.'],
  [2, 'Esmagar de leve', 'Aperta: achata (mais largo e mais baixo) em 150 ms. Solta: estica um pouco para cima e assenta, 250 ms.'],
  [3, 'Pulinho', 'Aperta: encolhe para 90% em 150 ms. Solta: passa do tamanho original (108%) e assenta, 250 ms.'],
  [4, 'Ondinha', 'Uma onda clara sai do ponto exato do clique e se espalha pelo botão em 250 ms.'],
];

function ligarReacao(botao: HTMLButtonElement, tipo: Reacao): void {
  let atual: Animation | null = null;
  let apertado = false;

  const apertar = (x: number, y: number): void => {
    apertado = true;
    if (tipo === 4) {
      ondinha(botao, x, y);
      return;
    }
    atual?.cancel();
    const fim = tipo === 1 ? 'scale(0.92)' : tipo === 2 ? 'scale(1.08, 0.86)' : 'scale(0.9)';
    atual = animar(botao, [{ transform: 'scale(1)' }, { transform: fim }], 150, { fill: 'forwards' });
  };

  const soltar = (): void => {
    if (!apertado) return;
    apertado = false;
    if (tipo === 4) return;
    atual?.cancel();
    if (tipo === 1) {
      atual = animar(botao, [{ transform: 'scale(0.92)' }, { transform: 'scale(1)' }], 150);
    } else if (tipo === 2) {
      atual = animar(
        botao,
        [{ transform: 'scale(1.08, 0.86)' }, { transform: 'scale(0.96, 1.05)', offset: 0.55 }, { transform: 'scale(1)' }],
        250,
      );
    } else {
      atual = animar(
        botao,
        [{ transform: 'scale(0.9)' }, { transform: 'scale(1.08)', offset: 0.55 }, { transform: 'scale(1)' }],
        250,
      );
    }
  };

  botao.addEventListener('pointerdown', (e) => {
    const r = botao.getBoundingClientRect();
    apertar(e.clientX - r.left, e.clientY - r.top);
  });
  botao.addEventListener('pointerup', soltar);
  botao.addEventListener('pointerleave', soltar);
  botao.addEventListener('pointercancel', soltar);
  botao.addEventListener('keydown', (e) => {
    if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) apertar(botao.offsetWidth / 2, botao.offsetHeight / 2);
  });
  botao.addEventListener('keyup', soltar);
}

function ondinha(botao: HTMLElement, x: number, y: number): void {
  const tamanho = Math.max(botao.offsetWidth, botao.offsetHeight) * 2.2;
  const onda = el('span', 'onda');
  onda.style.width = `${tamanho}px`;
  onda.style.height = `${tamanho}px`;
  onda.style.left = `${x - tamanho / 2}px`;
  onda.style.top = `${y - tamanho / 2}px`;
  botao.append(onda);
  const a = animar(
    onda,
    [
      { transform: 'scale(0)', opacity: 0.45 },
      { transform: 'scale(1)', opacity: 0 },
    ],
    250,
    { easing: 'ease-out', fill: 'forwards' },
  );
  a.finished.then(() => onda.remove(), () => onda.remove());
}

function secaoReacoes(): HTMLElement {
  const { secao: s, corpo } = secao(
    '3',
    'Reação ao clique',
    'Quatro sensações no mesmo botão. Segure apertado um instante e solte, para sentir as duas metades (apertar e soltar).',
  );
  for (const [n, titulo, desc] of REACOES) {
    const { cartao: c, corpo: dentro } = cartao(`Clique ${n}`, titulo, desc);
    const b = el('button', 'r-base');
    b.type = 'button';
    b.innerHTML = casa(18);
    b.append(el('span', undefined, 'Enviar'));
    ligarReacao(b, n);
    const linha = el('div', 'lab-linha lab-linha--centro');
    linha.append(b);
    dentro.append(linha);
    corpo.append(c);
  }
  return s;
}

/* ------------------------------------------------------------------------ */
/* 4. Transição entre telas                                                  */
/* ------------------------------------------------------------------------ */

type Transicao = 1 | 2 | 3 | 4;

const TRANSICOES: Array<[Transicao, string, string]> = [
  [1, 'Esmaecer', 'Uma tela some enquanto a outra aparece, no mesmo lugar.'],
  [2, 'Deslizar para o lado', 'A Conversa entra pela direita empurrando Amigos; voltar faz o caminho inverso.'],
  [3, 'Esmaecer com zoom', 'A tela nova aparece crescendo de leve (94% → 100%); a antiga some crescendo um pouco.'],
  [4, 'Deslizar de baixo', 'A Conversa sobe por cima de Amigos, como uma folha; voltar a faz descer.'],
];

const LARGURA_PALCO = 340;
const ALTURA_PALCO = 230;

function telaAmigos(): HTMLElement {
  const t = el('div', 'tr-tela tr-tela--amigos');
  t.append(el('div', 'tr-titulo', 'Amigos'));
  const amigos: Array<[string, string, string]> = [
    ['Ana', 'jogando agora', '#F08A6C'],
    ['Beto', 'disponível', '#7FA36B'],
    ['Carol', 'volta já', '#E0A53A'],
    ['Davi', 'offline', '#8C7B68'],
  ];
  for (const [nome, estado, cor] of amigos) {
    const linha = el('div', 'tr-amigo');
    const av = el('span', 'tr-avatar', nome.charAt(0));
    av.style.background = cor;
    const textos = el('div');
    textos.append(el('b', undefined, nome), el('div', 'tr-estado', estado));
    linha.append(av, textos);
    t.append(linha);
  }
  return t;
}

function telaConversa(): HTMLElement {
  const t = el('div', 'tr-tela tr-tela--conversa');
  t.append(el('div', 'tr-titulo', '← Conversa com Ana'));
  t.append(
    el('div', 'tr-balao', 'oi! viu o trailer novo?'),
    el('div', 'tr-balao tr-balao--meu', 'vi!! sábado a gente assiste'),
    el('div', 'tr-balao', 'fechado 🍿'),
  );
  return t;
}

function montarTransicao(tipo: Transicao): HTMLElement {
  const bloco = el('div');
  const palco = el('div', 'tr-palco');
  const amigos = telaAmigos();
  const conversa = telaConversa();
  conversa.hidden = true;
  palco.append(amigos, conversa);

  let naConversa = false;
  let ocupado = false;
  const legenda = el('div', 'tr-legenda', 'Agora: Amigos');

  const alternar = (ms: number): void => {
    if (ocupado) return;
    ocupado = true;
    const sai = naConversa ? conversa : amigos;
    const entra = naConversa ? amigos : conversa;
    const indoParaConversa = !naConversa;
    entra.hidden = false;
    sai.style.zIndex = '1';
    entra.style.zIndex = '2';

    let animacoes: Animation[];
    if (tipo === 1) {
      animacoes = [
        animar(sai, [{ opacity: 1 }, { opacity: 0 }], ms, { fill: 'forwards' }),
        animar(entra, [{ opacity: 0 }, { opacity: 1 }], ms),
      ];
    } else if (tipo === 2) {
      const d = indoParaConversa ? 1 : -1;
      animacoes = [
        animar(sai, [{ transform: 'translateX(0px)' }, { transform: `translateX(${-d * LARGURA_PALCO}px)` }], ms, {
          fill: 'forwards',
        }),
        animar(entra, [{ transform: `translateX(${d * LARGURA_PALCO}px)` }, { transform: 'translateX(0px)' }], ms),
      ];
    } else if (tipo === 3) {
      animacoes = [
        animar(sai, [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(1.04)' }], ms, {
          fill: 'forwards',
        }),
        animar(entra, [{ opacity: 0, transform: 'scale(0.94)' }, { opacity: 1, transform: 'scale(1)' }], ms),
      ];
    } else if (indoParaConversa) {
      animacoes = [
        animar(entra, [{ transform: `translateY(${ALTURA_PALCO}px)` }, { transform: 'translateY(0px)' }], ms),
      ];
    } else {
      // voltando: a Conversa (que sai) desce por cima, Amigos já está embaixo
      sai.style.zIndex = '2';
      entra.style.zIndex = '1';
      animacoes = [
        animar(sai, [{ transform: 'translateY(0px)' }, { transform: `translateY(${ALTURA_PALCO}px)` }], ms, {
          fill: 'forwards',
        }),
      ];
    }

    Promise.all(animacoes.map((a) => a.finished)).then(() => {
      sai.hidden = true;
      for (const a of animacoes) a.cancel();
      naConversa = indoParaConversa;
      legenda.textContent = `Agora: ${naConversa ? 'Conversa' : 'Amigos'}`;
      ocupado = false;
    });
  };

  const botoes = el('div', 'lab-linha');
  for (const ms of [150, 200, 250]) {
    const b = el('button', 'bt b1 bt-pequeno', `Alternar em ${ms} ms`);
    b.type = 'button';
    b.addEventListener('click', () => alternar(ms));
    botoes.append(b);
  }
  bloco.append(palco, botoes, legenda);
  return bloco;
}

function secaoTransicoes(): HTMLElement {
  const { secao: s, corpo } = secao(
    '4',
    'Transição entre telas',
    'Duas telas falsas, "Amigos" e "Conversa". Cada botão alterna entre elas numa duração diferente: 150, 200 ou 250 ms.',
  );
  for (const [n, titulo, desc] of TRANSICOES) {
    const { cartao: c, corpo: dentro } = cartao(`Transição ${n}`, titulo, desc);
    dentro.append(montarTransicao(n));
    corpo.append(c);
  }
  return s;
}

/* ------------------------------------------------------------------------ */
/* 5. Cantos arredondados                                                    */
/* ------------------------------------------------------------------------ */

function secaoCantos(): HTMLElement {
  const { secao: s, corpo } = secao(
    '5',
    'Cantos arredondados',
    'O mesmo cartão de mensagem e o mesmo botão, em três níveis de arredondamento.',
  );
  const niveis: Array<[string, string, string]> = [
    ['1', 'Moderado', 'Cartão 8px, botão 8px.'],
    ['2', 'Bem redondo', 'Cartão 16px, botão 14px.'],
    ['3', 'Máximo (bolha e pílula)', 'Cartão 24px com a ponta de baixo mais fechada, como balão; botão pílula.'],
  ];
  for (const [n, titulo, desc] of niveis) {
    const { cartao: c, corpo: dentro } = cartao(`Cantos ${n}`, titulo, desc);
    dentro.classList.add(`cn-${n}`);
    const msg = el('div', 'cn-msg');
    const av = el('span', 'tr-avatar', 'A');
    av.style.background = '#F08A6C';
    const textos = el('div');
    textos.append(el('b', undefined, 'Ana'), el('div', undefined, 'chegando em 10 min, alguém quer pão de queijo?'));
    msg.append(av, textos);
    const b = el('button', 'bt b1 cn-botao');
    b.type = 'button';
    b.innerHTML = casa(18);
    b.append(el('span', undefined, 'Enviar'));
    dentro.append(msg, b);
    corpo.append(c);
  }
  return s;
}

/* ------------------------------------------------------------------------ */
/* 6. Mensagem chegando                                                      */
/* ------------------------------------------------------------------------ */

type Chegada = 1 | 2 | 3;

const CHEGADAS: Array<[Chegada, string, string]> = [
  [1, 'Sobe e aparece', 'A mensagem sobe 12px enquanto aparece, 200 ms.'],
  [2, 'Balão que infla', 'O balão nasce pequeno a partir do canto do avatar, passa um pouco do tamanho e assenta, 250 ms.'],
  [3, 'Luz que acende', 'A mensagem aparece com um brilho âmbar em volta que se apaga, 250 ms.'],
];

const FALAS: Array<[string, string, string]> = [
  ['Ana', 'chegueeei', '#F08A6C'],
  ['Beto', 'alguém viu meu fone?', '#7FA36B'],
  ['Carol', 'kkkkkkk', '#E0A53A'],
  ['Davi', 'boa noite, gente', '#8A6FB8'],
  ['Ana', 'quem topa um jogo rápido?', '#F08A6C'],
  ['Beto', 'eu!', '#7FA36B'],
];

function balaoChegada(nome: string, texto: string, cor: string): HTMLElement {
  const linha = el('div', 'mc-msg');
  const av = el('span', 'tr-avatar', nome.charAt(0));
  av.style.background = cor;
  const balao = el('div', 'mc-balao');
  const autor = el('b', undefined, nome);
  autor.style.color = cor;
  balao.append(autor, el('div', undefined, texto));
  linha.append(av, balao);
  return linha;
}

function secaoChegada(): HTMLElement {
  const { secao: s, corpo } = secao(
    '6',
    'Mensagem chegando',
    'Cada chat tem o seu botão "Simular mensagem". As mensagens antigas sobem para dar lugar.',
  );
  for (const [n, titulo, desc] of CHEGADAS) {
    const { cartao: c, corpo: dentro } = cartao(`Chegada ${n}`, titulo, desc);
    const chat = el('div', 'mc-chat');
    const lista = el('div', 'mc-msgs');
    lista.append(
      balaoChegada('Carol', 'cheguei em casa', '#E0A53A'),
      balaoChegada('Davi', 'alguém on?', '#8A6FB8'),
    );
    chat.append(lista);
    let proxima = 0;
    const b = el('button', 'bt b1 bt-pequeno', 'Simular mensagem');
    b.type = 'button';
    b.addEventListener('click', () => {
      const [nome, texto, cor] = FALAS[proxima % FALAS.length]!;
      proxima += 1;
      const nova = balaoChegada(nome, texto, cor);
      lista.append(nova);
      while (lista.children.length > 6) lista.firstElementChild?.remove();
      const balao = nova.querySelector('.mc-balao')!;
      if (n === 1) {
        animar(nova, [{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'translateY(0px)' }], 200);
      } else if (n === 2) {
        animar(
          nova,
          [
            { opacity: 0, transform: 'scale(0.5)' },
            { opacity: 1, transform: 'scale(1.04)', offset: 0.6 },
            { opacity: 1, transform: 'scale(1)' },
          ],
          250,
        );
      } else {
        animar(nova, [{ opacity: 0 }, { opacity: 1 }], 150);
        animar(
          balao,
          [
            { boxShadow: '0px 0px 0px 3px #FFC35C, 0px 0px 14px #FFB43A' },
            { boxShadow: '0px 1px 2px #8C6F5533' },
          ],
          250,
          { easing: 'ease-out' },
        );
      }
    });
    const linha = el('div', 'lab-linha');
    linha.append(b);
    dentro.append(chat, linha);
    corpo.append(c);
  }
  return s;
}

/* ------------------------------------------------------------------------ */
/* 7. Detalhes de identidade                                                 */
/* ------------------------------------------------------------------------ */

function botaoPequeno(texto: string, aoClicar: (b: HTMLButtonElement) => void): HTMLButtonElement {
  const b = el('button', 'bt b1 bt-pequeno', texto);
  b.type = 'button';
  b.addEventListener('click', () => aoClicar(b));
  return b;
}

function detalheJanela(): HTMLElement {
  const { cartao: c, corpo } = cartao(
    'Detalhe 7.1',
    'Luz acesa na janela',
    'A casinha de cada grupo, na barra da esquerda, acende a janela quando chega mensagem que você ainda não leu. Substitui a bolinha de "não lido". Clique na casinha para "ler" e apagar a luz.',
  );
  const palco = el('div', 'id-palco');
  const casinha = el('button', 'id-casa');
  casinha.type = 'button';
  casinha.setAttribute('aria-label', 'Abrir o grupo');
  casinha.innerHTML = casaDetalhada(96);
  casinha.addEventListener('click', () => casinha.classList.remove('acesa'));
  palco.append(casinha);
  const linha = el('div', 'lab-linha');
  linha.append(botaoPequeno('Chegar mensagem nova', () => casinha.classList.add('acesa')));
  corpo.append(palco, linha);
  return c;
}

function detalhePorta(): HTMLElement {
  const { cartao: c, corpo } = cartao(
    'Detalhe 7.2',
    'Porta aberta = tem gente na sala de voz',
    'Quando alguém está numa chamada do grupo, a porta da casinha fica entreaberta, com a luz de dentro aparecendo. Porta fechada = ninguém na sala.',
  );
  const palco = el('div', 'id-palco');
  const casinha = el('div', 'id-casa');
  casinha.innerHTML = casaDetalhada(96);
  const nota = el('div', 'id-nota', 'ninguém na sala');
  palco.append(casinha, nota);
  const linha = el('div', 'lab-linha');
  linha.append(
    botaoPequeno('Alguém entrou na sala', (b) => {
      const aberta = casinha.classList.toggle('aberta');
      nota.textContent = aberta ? '2 pessoas na sala' : 'ninguém na sala';
      b.textContent = aberta ? 'Todo mundo saiu' : 'Alguém entrou na sala';
    }),
  );
  corpo.append(palco, linha);
  return c;
}

function detalheTocToc(): HTMLElement {
  const { cartao: c, corpo } = cartao(
    'Detalhe 7.3',
    'Toc toc',
    'Pedido de amizade novo não é "notificação": é alguém batendo na porta. A casinha da tela inicial dá duas sacudidas e aparece um "toc toc!".',
  );
  const palco = el('div', 'id-palco');
  const casinha = el('div', 'id-casa id-casa--base');
  casinha.innerHTML = casaDetalhada(96);
  const balao = el('div', 'id-toc', 'toc toc!');
  balao.hidden = true;
  palco.append(casinha, balao);
  const linha = el('div', 'lab-linha');
  linha.append(
    botaoPequeno('Receber pedido de amizade', () => {
      animar(
        casinha,
        [
          { transform: 'rotate(0deg)' },
          { transform: 'rotate(-7deg)', offset: 0.2 },
          { transform: 'rotate(6deg)', offset: 0.45 },
          { transform: 'rotate(-4deg)', offset: 0.7 },
          { transform: 'rotate(0deg)' },
        ],
        250,
        { easing: 'ease-in-out' },
      );
      balao.hidden = false;
      animar(
        balao,
        [
          { opacity: 0, transform: 'scale(0.4)' },
          { opacity: 1, transform: 'scale(1.1)', offset: 0.6 },
          { opacity: 1, transform: 'scale(1)' },
        ],
        200,
      );
    }),
    botaoPequeno('Abrir a porta (ver pedido)', () => {
      balao.hidden = true;
    }),
  );
  corpo.append(palco, linha);
  return c;
}

function detalheBilhete(): HTMLElement {
  const { cartao: c, corpo } = cartao(
    'Detalhe 7.4',
    'Bilhete na porta',
    'Mensagem fixada vira um bilhete de papel preso com fita, meio torto, no alto da conversa. Fixar "cola" o bilhete; desafixar o tira.',
  );
  const conversa = el('div', 'id-conversa');
  const cabeca = el('div', 'id-conversa-topo', '# rolês');
  const area = el('div', 'id-bilhetes');
  conversa.append(cabeca, area);
  let bilhete: HTMLElement | null = null;
  const linha = el('div', 'lab-linha');
  linha.append(
    botaoPequeno('Fixar mensagem', (b) => {
      if (bilhete === null) {
        const novo = el('div', 'id-bilhete');
        novo.append(
          el('span', 'id-fita'),
          el('div', undefined, 'sábado 20h na casa da Carol 🎲'),
          el('div', 'id-bilhete-autor', 'fixado por Ana'),
        );
        area.append(novo);
        bilhete = novo;
        animar(
          novo,
          [
            { opacity: 0, transform: 'translateY(-14px) rotate(-8deg) scale(1.08)' },
            { opacity: 1, transform: 'translateY(0px) rotate(-2deg) scale(1)' },
          ],
          220,
        );
        b.textContent = 'Desafixar';
      } else {
        const velho = bilhete;
        bilhete = null;
        animar(velho, [{ opacity: 1 }, { opacity: 0, transform: 'translateY(-8px) rotate(-6deg)' }], 150, {
          fill: 'forwards',
        }).finished.then(() => velho.remove());
        b.textContent = 'Fixar mensagem';
      }
    }),
  );
  corpo.append(conversa, linha);
  return c;
}

function detalheTapete(): HTMLElement {
  const { cartao: c, corpo } = cartao(
    'Detalhe 7.5',
    'Tapete de boas-vindas',
    'O começo de todo canal (onde hoje aparece "Início de #canal") é um capacho na porta, com franja e costura.',
  );
  const canais = ['jogos', 'filmes', 'receitas', 'geral'];
  let i = 0;
  const area = el('div', 'id-tapete-area');
  const desenhar = (): void => {
    area.replaceChildren();
    const tapete = el('div', 'id-tapete');
    const miolo = el('div', 'id-tapete-miolo');
    miolo.append(el('div', 'id-tapete-ola', 'BEM-VINDOS AO'), el('div', 'id-tapete-canal', `#${canais[i % canais.length]}`));
    tapete.append(miolo);
    area.append(tapete, el('div', 'id-tapete-dica', 'este é o começo do canal'));
    animar(tapete, [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'translateY(0px)' }], 200);
  };
  desenhar();
  const linha = el('div', 'lab-linha');
  linha.append(
    botaoPequeno('Abrir outro canal', () => {
      i += 1;
      desenhar();
    }),
  );
  corpo.append(area, linha);
  return c;
}

function secaoDetalhes(): HTMLElement {
  const { secao: s, corpo } = secao(
    '7',
    'Detalhes de identidade',
    'Pequenas coisas que podem virar "marca registrada" do Loft, todas puxando para a casinha. Cada uma funciona: use os botões.',
  );
  corpo.append(detalheJanela(), detalhePorta(), detalheTocToc(), detalheBilhete(), detalheTapete());
  return s;
}

/* ------------------------------------------------------------------------ */

const raiz = document.getElementById('lab')!;
raiz.append(
  topo(),
  secaoPaletas(),
  secaoBotoes(),
  secaoReacoes(),
  secaoTransicoes(),
  secaoCantos(),
  secaoChegada(),
  secaoDetalhes(),
);
