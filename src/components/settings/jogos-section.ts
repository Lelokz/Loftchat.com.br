import { doc, updateDoc } from 'firebase/firestore';

import { el, iconEl } from '../../lib/dom';
import { db } from '../../lib/firebase';
import { loftDesktop } from '../../lib/desktop';
import type { ProgramaAberto } from '../../lib/desktop';
import { publicProfile } from '../../lib/friends';
import { closeIcon, plusIcon, searchIcon } from '../../lib/icons';
import { buscarJogos } from '../../lib/catalogo-jogos';
import type { JogoDoCatalogo } from '../../lib/catalogo-jogos';
import { mostrarJogando, mudarMostrarJogando } from '../../lib/jogando';
import { contarConquista } from '../../lib/conquistas';
import { ETIQUETAS, MAX_ETIQUETAS, MAX_NOTA, MAX_QUERO, MAX_ULTIMAMENTE, paraGravar } from '../../lib/jogos-perfil';
import type { JogoDoPerfil, JogosDoPerfil } from '../../lib/jogos-perfil';
import { capaDoJogo } from '../jogos/jogos-ui';
import { showToast } from '../toast/toast';

/** As lojas que o programa do PC reconhece (desktop/jogos.mjs). */
const LOJAS_DO_PC = [
  'Steam', 'Epic Games', 'GOG Galaxy', 'Battle.net', 'Riot (LoL, Valorant)', 'EA app',
  'Ubisoft Connect', 'Xbox', 'Minecraft', 'Roblox', 'Heroic e Lutris (Linux)',
];

/**
 * CONFIGURAÇÕES → JOGOS (0.12.0): "mostrar o que estou jogando", o jogo
 * favorito com uma frase, "jogando ultimamente" (até 5, com etiquetas),
 * "quero jogar" (até 20) e, no PC, "escolher o programa aberto" para o jogo
 * que ele não reconheceu. Tudo vale na hora, sem botão de salvar.
 *
 * `aoMudar` redesenha a prévia do cartão.
 */
export function renderJogosSection(uid: string, aoMudar: (jogos: JogosDoPerfil) => void): HTMLElement[] {
  const desktop = loftDesktop();
  let jogos: JogosDoPerfil = { ultimamente: [], quero: [] };
  const corpo = el('div', { class: 'jg-cfg__corpo' }, [el('p', { class: 'settings__help' }, ['Carregando seus jogos…'])]);

  let gravando = Promise.resolve();
  function salvar(): void {
    aoMudar(jogos);
    const dados = paraGravar(jogos);
    gravando = gravando
      .then(() => updateDoc(doc(db, 'users', uid), { jogos: dados }))
      // 0.12.0: favorito + 5 "ultimamente" vale a insígnia "Perfil gamer".
      .then(() => {
        if (jogos.favorito !== undefined && jogos.ultimamente.length >= 5) contarConquista({ evento: 'conferir' });
      })
      .catch((erro: unknown) => {
        console.error('Jogos: não deu para salvar.', erro);
        showToast('Não deu para salvar seus jogos. Confira a internet.');
      });
  }

  function desenhar(): void {
    corpo.replaceChildren(blocoFavorito(), blocoUltimamente(), blocoQuero(), ...(desktop === null ? [] : [blocoDoPc()]));
  }

  /* --- mostrar o que estou jogando --------------------------------------- */

  // Fora do programa do PC a chave fica desligada (e não dá para ligar): quem vê o jogo é o PC.
  const chave = el('button', { class: 'jg-cfg__toggle', type: 'button', role: 'switch', 'aria-checked': String(desktop !== null && mostrarJogando()), 'aria-label': 'Mostrar o que estou jogando' });
  chave.disabled = desktop === null;
  chave.addEventListener('click', () => {
    mudarMostrarJogando(!mostrarJogando());
    chave.setAttribute('aria-checked', String(mostrarJogando()));
  });
  const blocoMostrar = el('div', { class: 'jg-cfg__bloco' }, [
    el('div', { class: 'jg-cfg__chave' }, [
      el('div', {}, [
        el('b', {}, ['Mostrar o que estou jogando']),
        el('span', {}, [
          desktop === null
            ? 'Quem vê o jogo aberto é o programa do Loftchat no PC. Ligue lá.'
            : 'Quando o Loftchat do PC vê um jogo aberto, seus amigos e grupos veem "Jogando…" com o tempo.',
        ]),
      ]),
      chave,
    ]),
  ]);

  /* --- favorito ------------------------------------------------------------ */

  function blocoFavorito(): HTMLElement {
    const fav = jogos.favorito;
    if (fav === undefined) {
      return bloco('Jogo favorito', '', [
        busca('Procurar o seu jogo favorito', (j) => {
          jogos.favorito = { ...j, nota: '' };
          salvar();
          desenhar();
        }),
      ]);
    }
    const nota = el('input', {
      class: 'jg-cfg__nota-campo',
      type: 'text',
      maxlength: MAX_NOTA,
      value: fav.nota,
      placeholder: 'Uma frase sobre ele (opcional)',
      'aria-label': 'Frase sobre o jogo favorito',
    });
    let espera: number | undefined;
    nota.addEventListener('input', () => {
      window.clearTimeout(espera);
      espera = window.setTimeout(() => {
        if (jogos.favorito === undefined) return;
        jogos.favorito.nota = nota.value.slice(0, MAX_NOTA);
        salvar();
      }, 700);
    });
    return bloco('Jogo favorito', '', [
      el('div', { class: 'jg-cfg__fav' }, [
        capaDoJogo(fav, 54, 72),
        el('div', { class: 'jg-cfg__nota' }, [el('b', {}, [fav.nome]), nota]),
        tirar(`Tirar ${fav.nome}`, () => {
          delete jogos.favorito;
          salvar();
          desenhar();
        }),
      ]),
    ]);
  }

  /* --- jogando ultimamente ------------------------------------------------- */

  function blocoUltimamente(): HTMLElement {
    const linhas = jogos.ultimamente.map((j, i) =>
      el('div', { class: 'jg-cfg__linha' }, [
        capaDoJogo(j, 40, 54),
        el('div', { class: 'jg-cfg__nm' }, [
          el('b', {}, [j.nome, j.loja === undefined ? false : el('span', { class: 'jg-cfg__loja' }, [j.loja])]),
          el(
            'span',
            { class: 'jg-cfg__tags' },
            ETIQUETAS.map((t) => {
              const marcada = j.etiquetas?.includes(t) ?? false;
              const b = el('button', { class: `jg-cfg__tag${marcada ? ' is-on' : ''}`, type: 'button', 'aria-pressed': String(marcada) }, [t]);
              b.addEventListener('click', () => {
                const atuais = j.etiquetas ?? [];
                if (atuais.includes(t)) j.etiquetas = atuais.filter((x) => x !== t);
                else j.etiquetas = [...atuais, t].slice(-MAX_ETIQUETAS);
                salvar();
                desenhar();
              });
              return b;
            }),
          ),
        ]),
        tirar(`Tirar ${j.nome}`, () => {
          jogos.ultimamente.splice(i, 1);
          salvar();
          desenhar();
        }),
      ]),
    );
    return bloco('Jogando ultimamente', `${jogos.ultimamente.length} de ${MAX_ULTIMAMENTE}`, [
      ...linhas,
      jogos.ultimamente.length < MAX_ULTIMAMENTE &&
        busca('Adicionar um jogo', (j) => {
          if (jogos.ultimamente.some((x) => x.nome === j.nome)) return;
          jogos.ultimamente.push(j);
          salvar();
          desenhar();
        }),
    ]);
  }

  /* --- quero jogar ----------------------------------------------------------- */

  let adicionandoQuero = false;
  function blocoQuero(): HTMLElement {
    const capas = jogos.quero.map((j, i) => {
      const item = el('div', { class: 'jg-cfg__quero' }, [capaDoJogo(j, 42, 56)]);
      item.append(
        tirar(`Tirar ${j.nome}`, () => {
          jogos.quero.splice(i, 1);
          salvar();
          desenhar();
        }),
      );
      return item;
    });
    const adicionar = el('button', { class: 'jg-cfg__add', type: 'button' }, [iconEl(plusIcon(14)), 'Adicionar']);
    adicionar.addEventListener('click', () => {
      adicionandoQuero = true;
      desenhar();
      corpo.querySelector<HTMLInputElement>('.jg-cfg__bloco--quero input')?.focus();
    });
    return bloco(
      'Quero jogar',
      `${jogos.quero.length} de ${MAX_QUERO}`,
      [
        el('div', { class: 'jg-cfg__fila' }, [...capas, jogos.quero.length < MAX_QUERO && !adicionandoQuero && adicionar]),
        adicionandoQuero &&
          busca('Procurar um jogo', (j) => {
            adicionandoQuero = false;
            if (!jogos.quero.some((x) => x.nome === j.nome)) jogos.quero.push(j);
            salvar();
            desenhar();
          }),
      ],
      'jg-cfg__bloco--quero',
    );
  }

  /* --- o que o PC reconhece + escolher o programa ---------------------------- */

  function blocoDoPc(): HTMLElement {
    const area = el('div', { class: 'jg-cfg__programas' });
    const abrir = el('button', { class: 'jg-cfg__add', type: 'button' }, [iconEl(plusIcon(14)), 'Jogo não apareceu? Escolher o programa aberto']);
    abrir.addEventListener('click', () => void listarProgramas(area));
    const escolhidos = el('div', { class: 'jg-cfg__escolhidos' });
    void desktop?.jogosEscolhidos?.().then((lista) => {
      escolhidos.replaceChildren(
        ...lista.map((p) => {
          const esquecer = el('button', { class: 'jg-cfg__esquecer', type: 'button' }, ['Esquecer']);
          esquecer.addEventListener('click', () => {
            void desktop.esquecerJogo?.(p.caminho).then(() => esquecer.closest('.jg-cfg__escolhido')?.remove());
          });
          return el('div', { class: 'jg-cfg__escolhido' }, [el('b', {}, [p.nome]), el('span', { title: p.caminho }, [p.caminho]), esquecer]);
        }),
      );
    });
    return bloco('O PC reconhece jogos de', 'só no programa do PC', [
      el('div', { class: 'jg-cfg__fila' }, LOJAS_DO_PC.map((l) => el('span', { class: 'jg-cfg__tag is-on' }, [l]))),
      el('div', { class: 'jg-cfg__pc' }, [abrir]),
      area,
      escolhidos,
    ]);
  }

  async function listarProgramas(area: HTMLElement): Promise<void> {
    area.replaceChildren(el('p', { class: 'settings__help' }, ['Olhando os programas abertos…']));
    const lista: ProgramaAberto[] = (await desktop?.programasAbertos?.().catch(() => [])) ?? [];
    if (lista.length === 0) {
      area.replaceChildren(el('p', { class: 'settings__help' }, ['Não achei nenhum programa aberto. Abra o jogo e tente de novo.']));
      return;
    }
    area.replaceChildren(
      el('p', { class: 'settings__help' }, ['Abra o jogo, depois clique nele aqui:']),
      el(
        'ul',
        { class: 'jg-cfg__lista-pc' },
        lista.map((p) => {
          const b = el('button', { class: 'jg-cfg__programa', type: 'button', title: p.caminho }, [el('b', {}, [p.nome]), el('span', {}, [p.caminho])]);
          b.addEventListener('click', () => nomear(area, p));
          return el('li', {}, [b]);
        }),
      ),
    );
  }

  function nomear(area: HTMLElement, p: ProgramaAberto): void {
    const campo = el('input', { class: 'jg-cfg__nota-campo', type: 'text', maxlength: 80, value: p.nome, 'aria-label': 'Nome do jogo' });
    const ok = el('button', { class: 'jg-cfg__ok', type: 'button' }, ['É este jogo']);
    ok.addEventListener('click', () => {
      const nome = campo.value.trim();
      if (nome === '') return;
      void desktop?.marcarJogo?.(p.caminho, nome).then(() => {
        showToast(`Pronto: quando ${nome} abrir, aparece "Jogando".`);
        desenhar();
      });
    });
    area.replaceChildren(
      el('p', { class: 'settings__help' }, [`Que jogo é o ${p.nome}?`]),
      el('div', { class: 'jg-cfg__nomear' }, [campo, ok]),
    );
    campo.focus();
    campo.select();
  }

  /* --- peças ----------------------------------------------------------------- */

  function bloco(titulo: string, contagem: string, filhos: Array<HTMLElement | false>, extra = ''): HTMLElement {
    return el('div', { class: `jg-cfg__bloco ${extra}` }, [
      el('h3', { class: 'jg-cfg__titulo' }, [titulo, contagem !== '' && el('span', {}, [contagem])]),
      ...filhos,
    ]);
  }

  function tirar(rotulo: string, acao: () => void): HTMLElement {
    const b = el('button', { class: 'jg-cfg__x', type: 'button', 'aria-label': rotulo, title: rotulo }, [iconEl(closeIcon(15))]);
    b.addEventListener('click', acao);
    return b;
  }

  /** Campo de busca no catálogo, com a lista embaixo e "adicionar mesmo assim". */
  function busca(rotulo: string, escolher: (j: JogoDoPerfil) => void): HTMLElement {
    const campo = el('input', { type: 'search', placeholder: rotulo, 'aria-label': rotulo, maxlength: 60, autocomplete: 'off' });
    const lista = el('div', { class: 'jg-cfg__res', role: 'listbox' });
    lista.hidden = true;
    let pedido = 0;
    let espera: number | undefined;

    function mostrar(achados: JogoDoCatalogo[], texto: string): void {
      const opcoes = achados.map((j) => {
        const b = el('button', { class: 'jg-cfg__opcao', type: 'button', role: 'option' }, [
          capaDoJogo(j, 30, 40),
          el('span', { class: 'jg-cfg__opcao-nome' }, [j.nome]),
          el('small', {}, [[j.ano, j.lojas].filter((x) => x !== undefined).join(' · ')]),
        ]);
        b.addEventListener('click', () =>
          escolher({
            nome: j.nome,
            ...(j.capa === undefined ? {} : { capa: j.capa }),
            id: j.id,
            ...(j.lojas === undefined ? {} : { loja: j.lojas.split(',')[0]!.trim() }),
          }),
        );
        return b;
      });
      const mesmoAssim = el('button', { class: 'jg-cfg__opcao jg-cfg__outro', type: 'button' }, [
        iconEl(plusIcon(15)),
        `Não achou? Adicionar "${texto}" mesmo assim`,
      ]);
      mesmoAssim.addEventListener('click', () => escolher({ nome: texto.slice(0, 80) }));
      lista.replaceChildren(...opcoes, mesmoAssim);
      lista.hidden = false;
    }

    campo.addEventListener('input', () => {
      window.clearTimeout(espera);
      const texto = campo.value.trim();
      if (texto.length < 2) {
        lista.hidden = true;
        return;
      }
      espera = window.setTimeout(() => {
        const meu = ++pedido;
        lista.replaceChildren(el('p', { class: 'jg-cfg__procurando' }, ['Procurando…']));
        lista.hidden = false;
        void buscarJogos(texto).then((achados) => {
          if (meu === pedido) mostrar(achados, texto);
        });
      }, 300);
    });
    campo.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !lista.hidden) {
        e.stopPropagation();
        lista.hidden = true;
      }
    });
    return el('div', { class: 'jg-cfg__busca' }, [el('div', { class: 'jg-cfg__campo' }, [iconEl(searchIcon(16)), campo]), lista]);
  }

  void publicProfile(uid)
    .catch(() => null)
    .then((perfil) => {
      jogos = perfil?.jogos ?? { ultimamente: [], quero: [] };
      aoMudar(jogos);
      desenhar();
    });

  return [
    el('h2', { class: 'settings__title' }, ['Jogos']),
    el('p', { class: 'settings__help' }, [
      'Aparecem no seu cartão e no seu perfil. Vale jogo de qualquer loja — Steam, Epic, GOG, Battle.net, Riot, Xbox, EA, Ubisoft — e os sem loja, como Minecraft e Roblox.',
    ]),
    blocoMostrar,
    corpo,
  ];
}
