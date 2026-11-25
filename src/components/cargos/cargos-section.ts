import './cargos.css';

import { avatarEl, corDoCargo, el, iconeDoCargo } from '../../lib/dom';
import { enableDragSort } from '../../lib/drag-sort';
import { encolher } from '../../lib/midia';
import { subscribeGroupMembers } from '../../lib/firestore';
import {
  MAX_NOME_DO_CARGO,
  apagarCargo,
  comInsignias,
  corCss,
  criarCargo,
  darCargo,
  garantirBasicos,
  ouvirCargos,
  reordenarCargos,
  salvarCargo,
} from '../../lib/cargos';
import type { CamposDoCargo } from '../../lib/cargos';
import { SECOES_DE_PERMISSOES, TODAS_AS_PERMISSOES } from '../../lib/permissoes';
import { textoDoErro } from '../../lib/firestore-errors';
import { showToast } from '../toast/toast';
import type { Cargo, Member } from '../../types/models';
import { bolinhaDoCargo, chipsDeCargos } from './chips';

/**
 * CONFIGURAÇÕES DO GRUPO → CARGOS e MEMBROS (0.8.5, etapa 1), igual às
 * fotos aprovadas: lista (arrastar para ordenar), editor com Aparência /
 * Permissões / Membros, e a tela de Membros com as etiquetas.
 *
 * Os dados vêm direto do banco (cargos + membros do grupo), então funciona
 * até abrindo as configurações de um grupo que não está aberto no chat.
 *
 * Criar, reordenar, apagar e dar cargo gravam NA HORA; o que se edita num
 * cargo (nome, cor, ícone, opções, permissões) vai para a barra "alterações
 * não salvas" das Configurações, como o resto.
 */

export interface SecaoCargosOpcoes {
  groupId: string;
  ownerId: string;
  /** Redesenhar o conteúdo das Configurações. */
  redesenhar: () => void;
  /** Só a barra de salvar mudou (digitação). */
  mudou: () => void;
  /** Pisca a barra (tentou sair com coisa não salva). */
  piscar: () => void;
}

export interface SecaoCargos {
  cargos(): HTMLElement[];
  membros(): HTMLElement[];
  /** Prévia (aba Aparência) — fica dentro do conteúdo, não na coluna da direita. */
  sujo(): boolean;
  salvar(): Promise<void>;
  desfazer(): void;
  parar(): void;
}

type Aba = 'aparencia' | 'permissoes' | 'membros';
type Tela = { tipo: 'lista' } | { tipo: 'editar'; id: string; aba: Aba };

const CORES = ['#7b3fe4', '#c2467e', '#3d6fd1', '#2f8f7a', '#c2761f', '#b23a48', '#1f8a9e', '#ecd36a', '#5cd6b0', '#8db7ff', '#f590c4', '#9c8fcb'];
const EMOJIS = ['🛡️', '⭐', '👑', '⚡', '🎮', '🔥', '💎', '🎧', '🎨', '🌙', '🍕', '👀', '🤖', '🏆', '🎵', '💜'];

function campos(c: Cargo): CamposDoCargo {
  return {
    nome: c.nome,
    cor: c.cor === null ? null : { ...c.cor },
    ...(c.icone === undefined ? {} : { icone: c.icone }),
    ...(c.imagem === undefined ? {} : { imagem: c.imagem }),
    separado: c.separado,
    mencionavel: c.mencionavel,
    permissoes: [...c.permissoes],
  };
}

function mesmos(a: CamposDoCargo, b: CamposDoCargo): boolean {
  return (
    a.nome.trim() === b.nome.trim() &&
    JSON.stringify(a.cor) === JSON.stringify(b.cor) &&
    (a.icone ?? '') === (b.icone ?? '') &&
    (a.imagem ?? '') === (b.imagem ?? '') &&
    a.separado === b.separado &&
    a.mencionavel === b.mencionavel &&
    [...a.permissoes].sort().join() === [...b.permissoes].sort().join()
  );
}

function interruptor(ligado: boolean, nome: string, aoMudar: (v: boolean) => void, desligado = false): HTMLButtonElement {
  const b = el('button', {
    class: 'cg-sw',
    type: 'button',
    role: 'switch',
    'aria-checked': String(ligado),
    'aria-label': nome,
    disabled: desligado,
  });
  b.addEventListener('click', () => aoMudar(!ligado));
  return b;
}

export function criarSecaoCargos(op: SecaoCargosOpcoes): SecaoCargos {
  let cargos: Cargo[] = [];
  let carregou = false;
  let membrosCrus: Member[] = [];
  let tela: Tela = { tipo: 'lista' };
  let rascunho: CamposDoCargo | null = null;
  let salvoDoRascunho: CamposDoCargo | null = null;
  let buscaCargo = '';
  let buscaPermissao = '';
  let buscaMembro = '';
  let pontaAtiva: 'a' | 'b' = 'a';
  let apagando: string | null = null;
  let garantiu = false;

  const membros = (): Member[] => comInsignias(membrosCrus, cargos, op.ownerId);
  const normais = (): Cargo[] => cargos.filter((c) => c.todos !== true);
  const cargoDe = (id: string): Cargo | undefined => cargos.find((c) => c.id === id);

  const pararCargos = ouvirCargos(
    op.groupId,
    (lista) => {
      cargos = lista;
      carregou = true;
      // Grupo de antes dos cargos: cria o @todos e o Administrador (uma vez).
      if (!garantiu && !lista.some((c) => c.todos === true)) {
        garantiu = true;
        void garantirBasicos(op.groupId, lista).catch((e) => showToast(textoDoErro(e, 'Não deu para preparar os cargos.')));
      }
      // O cargo em edição foi apagado (por outra pessoa/aba): volta para a lista.
      if (tela.tipo === 'editar' && cargoDe(tela.id) === undefined) {
        tela = { tipo: 'lista' };
        rascunho = salvoDoRascunho = null;
      }
      // Chegou a versão nova do cargo em edição e eu não mexi nele: acompanha.
      if (tela.tipo === 'editar' && rascunho !== null && salvoDoRascunho !== null && mesmos(rascunho, salvoDoRascunho)) {
        const c = cargoDe(tela.id);
        if (c !== undefined) {
          rascunho = campos(c);
          salvoDoRascunho = campos(c);
        }
      }
      op.redesenhar();
    },
    (e) => console.error('[cargos]', e),
  );
  const pararMembros = subscribeGroupMembers(
    op.groupId,
    (lista) => {
      membrosCrus = lista;
      op.redesenhar();
    },
    (e) => console.error('[cargos membros]', e),
  );

  function sujo(): boolean {
    return rascunho !== null && salvoDoRascunho !== null && !mesmos(rascunho, salvoDoRascunho);
  }

  function irPara(nova: Tela): void {
    if (sujo()) {
      op.piscar();
      return;
    }
    tela = nova;
    if (nova.tipo === 'editar') {
      const c = cargoDe(nova.id);
      rascunho = c === undefined ? null : campos(c);
      salvoDoRascunho = c === undefined ? null : campos(c);
      pontaAtiva = 'a';
      buscaPermissao = '';
      buscaMembro = '';
    } else {
      rascunho = salvoDoRascunho = null;
    }
    op.redesenhar();
  }

  function falhou(e: unknown, texto: string): void {
    showToast(textoDoErro(e, texto));
  }

  /* --- LISTA ------------------------------------------------------------------ */

  function lista(): HTMLElement[] {
    const todos = cargos.find((c) => c.todos === true);
    const cartaoTodos = el('button', { class: 'cg-todos', type: 'button', disabled: todos === undefined }, [
      el('span', { class: 'cg-todos__ic', 'aria-hidden': 'true' }, ['@']),
      el('span', { class: 'cg-todos__texto' }, [
        el('b', {}, ['@todos — o básico do grupo']),
        el('small', {}, [`Vale para todo mundo, com ou sem cargo · ${membrosCrus.length} ${membrosCrus.length === 1 ? 'membro' : 'membros'}`]),
      ]),
      el('span', { class: 'cg-todos__seta', 'aria-hidden': 'true' }, ['›']),
    ]);
    if (todos !== undefined) cartaoTodos.addEventListener('click', () => irPara({ tipo: 'editar', id: todos.id, aba: 'permissoes' }));

    const busca = el('input', { class: 'cg-busca', type: 'search', placeholder: 'Procurar cargo', 'aria-label': 'Procurar cargo' });
    busca.value = buscaCargo;
    const criar = el('button', { class: 'cg-criar', type: 'button' }, ['+ Criar cargo']);
    criar.addEventListener('click', () => {
      criar.disabled = true;
      void criarCargo(op.groupId, cargos)
        .then((id) => {
          // Espera o cargo chegar pela escuta e abre direto no editor.
          const abrir = (): void => {
            if (cargoDe(id) !== undefined) irPara({ tipo: 'editar', id, aba: 'aparencia' });
            else setTimeout(abrir, 100);
          };
          abrir();
        })
        .catch((e) => {
          criar.disabled = false;
          falhou(e, 'Não deu para criar o cargo.');
        });
    });

    const q = buscaCargo.trim().toLowerCase();
    const visiveis = normais().filter((c) => c.nome.toLowerCase().includes(q));
    const contagem = (id: string): number => membrosCrus.filter((m) => m.cargos?.includes(id)).length;

    const linhas = el('ul', { class: 'cg-linhas', 'aria-label': 'Cargos' });
    const dono = el('li', { class: 'cg-linha cg-linha--dono' }, [
      el('span', { class: 'cg-pega' }),
      el('span', { class: 'cg-nome' }, [
        el('span', { class: 'cg-esc', style: 'background:#c2761f' }, ['👑']),
        el('span', { class: 'cg-nome__texto' }, ['Dono']),
        el('span', { class: 'cg-tranca' }, ['🔒 fixo']),
      ]),
      el('span', { class: 'cg-qtd' }, ['👤 1']),
      el('span', { class: 'cg-acoes' }),
    ]);
    if (q === '' || 'dono'.includes(q)) linhas.append(dono);
    for (const c of visiveis) {
      const esc = el('span', { class: 'cg-esc' }, [c.icone ?? '']);
      esc.style.background = c.cor === null ? 'var(--border-strong)' : corCss(c.cor);
      if (c.imagem !== undefined) esc.replaceChildren(el('img', { src: c.imagem, alt: '', draggable: 'false' }));
      const nome = el('span', { class: 'cg-nome__texto' }, [c.nome]);
      if (c.cor !== null) corDoCargo(nome, { insignia: { cor: c.cor, bloco: null, blocoPosicao: 0, cargos: [], dono: false } });
      const editar = el('button', { class: 'cg-acao', type: 'button', title: `Editar ${c.nome}`, 'aria-label': `Editar ${c.nome}` }, ['✎']);
      editar.addEventListener('click', (e) => {
        e.stopPropagation();
        irPara({ tipo: 'editar', id: c.id, aba: 'aparencia' });
      });
      const apagar = el('button', { class: 'cg-acao', type: 'button', title: `Apagar ${c.nome}`, 'aria-label': `Apagar ${c.nome}` }, ['🗑']);
      apagar.addEventListener('click', (e) => {
        e.stopPropagation();
        apagando = c.id;
        op.redesenhar();
      });
      const acoes =
        apagando === c.id
          ? (() => {
              const sim = el('button', { class: 'cg-confirma cg-confirma--sim', type: 'button' }, ['Apagar']);
              const nao = el('button', { class: 'cg-confirma', type: 'button' }, ['Cancelar']);
              sim.addEventListener('click', (e) => {
                e.stopPropagation();
                sim.disabled = true;
                void apagarCargo(op.groupId, c.id, membrosCrus)
                  .then(() => showToast(`Cargo ${c.nome} apagado.`))
                  .catch((erro) => falhou(erro, 'Não deu para apagar o cargo.'))
                  .finally(() => {
                    apagando = null;
                    op.redesenhar();
                  });
              });
              nao.addEventListener('click', (e) => {
                e.stopPropagation();
                apagando = null;
                op.redesenhar();
              });
              return el('span', { class: 'cg-acoes cg-acoes--confirma' }, [el('span', { class: 'cg-pergunta' }, ['Apagar?']), sim, nao]);
            })()
          : el('span', { class: 'cg-acoes' }, [editar, apagar]);
      const linha = el('li', { class: 'cg-linha', 'data-sort-id': c.id, tabindex: 0 }, [
        el('span', { class: 'cg-pega', title: 'Arraste para mudar a ordem', 'aria-hidden': 'true' }, ['⋮⋮']),
        el('span', { class: 'cg-nome' }, [esc, nome]),
        el('span', { class: 'cg-qtd' }, [`👤 ${contagem(c.id)}`]),
        acoes,
      ]);
      linha.addEventListener('click', () => irPara({ tipo: 'editar', id: c.id, aba: 'aparencia' }));
      linha.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.target === linha) irPara({ tipo: 'editar', id: c.id, aba: 'aparencia' });
      });
      linhas.append(linha);
    }
    if (q === '') {
      enableDragSort({
        container: linhas,
        itemSelector: 'li[data-sort-id]',
        handleSelector: '.cg-pega',
        axis: 'y',
        onDrop: (ids) => {
          cargos = [...ids.map((id) => cargoDe(id)!).filter(Boolean), ...cargos.filter((c) => !ids.includes(c.id))];
          void reordenarCargos(ids).catch((e) => falhou(e, 'Não deu para mudar a ordem.'));
        },
      });
    }

    busca.addEventListener('input', () => {
      buscaCargo = busca.value;
      op.redesenhar();
      const nova = document.querySelector<HTMLInputElement>('.cg-busca');
      nova?.focus();
      nova?.setSelectionRange(nova.value.length, nova.value.length);
    });

    return [
      el('header', { class: 'settings__header' }, [
        el('h2', { class: 'settings__title' }, ['Cargos']),
        el('p', { class: 'settings__subtitle' }, [
          'Crie cargos com o nome que quiser e escolha, uma por uma, o que cada cargo pode fazer. A ordem importa: quem tem cargo mais alto manda em quem está embaixo. Arraste para mudar.',
        ]),
      ]),
      cartaoTodos,
      el('div', { class: 'cg-barra' }, [busca, criar]),
      el('div', { class: 'cg-tabela' }, [
        el('div', { class: 'cg-cab', 'aria-hidden': 'true' }, [
          el('span', {}),
          el('span', {}, [`Cargos — ${normais().length + 1}`]),
          el('span', {}, ['Membros']),
          el('span', {}),
        ]),
        linhas,
        !carregou && el('p', { class: 'settings__help' }, ['Carregando os cargos…']),
      ]),
    ];
  }

  /* --- EDITOR ----------------------------------------------------------------- */

  function listaLateral(atual: string): HTMLElement {
    const voltar = el('button', { class: 'cg-lado__voltar', type: 'button' }, ['‹ Voltar']);
    voltar.addEventListener('click', () => irPara({ tipo: 'lista' }));
    const mais = el('button', { class: 'cg-lado__mais', type: 'button', title: 'Criar cargo', 'aria-label': 'Criar cargo' }, ['+']);
    mais.addEventListener('click', () => {
      if (sujo()) {
        op.piscar();
        return;
      }
      void criarCargo(op.groupId, cargos)
        .then((id) => {
          const abrir = (): void => {
            if (cargoDe(id) !== undefined) irPara({ tipo: 'editar', id, aba: 'aparencia' });
            else setTimeout(abrir, 100);
          };
          abrir();
        })
        .catch((e) => falhou(e, 'Não deu para criar o cargo.'));
    });
    const itens = [
      el('div', { class: 'cg-lado__item cg-lado__item--dono', 'aria-disabled': 'true' }, [
        el('span', { class: 'cg-bola', style: 'background:#c2761f' }),
        'Dono',
        el('span', { class: 'cg-lado__cad', 'aria-hidden': 'true' }, ['🔒']),
      ]),
      ...cargos.map((c) => {
        const b = el('button', { class: `cg-lado__item${c.id === atual ? ' is-on' : ''}`, type: 'button', 'aria-current': c.id === atual ? 'true' : undefined }, [
          bolinhaDoCargo(c),
          el('span', { class: 'cg-lado__nome' }, [c.todos === true ? '@todos' : c.id === atual && rascunho !== null ? rascunho.nome.trim() || 'cargo' : c.nome]),
        ]);
        b.addEventListener('click', () => irPara({ tipo: 'editar', id: c.id, aba: c.todos === true ? 'permissoes' : tela.tipo === 'editar' ? tela.aba : 'aparencia' }));
        return b;
      }),
    ];
    return el('nav', { class: 'cg-lado', 'aria-label': 'Cargos' }, [el('div', { class: 'cg-lado__topo' }, [voltar, mais]), ...itens]);
  }

  function editor(t: Extract<Tela, { tipo: 'editar' }>): HTMLElement[] {
    const c = cargoDe(t.id);
    if (c === undefined || rascunho === null) return lista();
    const ehTodos = c.todos === true;
    const aba: Aba = ehTodos && t.aba === 'aparencia' ? 'permissoes' : t.aba;
    const qtd = membrosCrus.filter((m) => m.cargos?.includes(c.id)).length;

    const abas = el('div', { class: 'cg-abas', role: 'tablist' }, (
      ehTodos ? ([['permissoes', 'Permissões']] as const) : ([['aparencia', 'Aparência'], ['permissoes', 'Permissões'], ['membros', `Membros (${qtd})`]] as const)
    ).map(([id, nome]) => {
      const b = el('button', { class: `cg-aba${aba === id ? ' is-on' : ''}`, type: 'button', role: 'tab', 'aria-selected': String(aba === id) }, [nome]);
      b.addEventListener('click', () => {
        tela = { tipo: 'editar', id: c.id, aba: id };
        op.redesenhar();
      });
      return b;
    }));

    const nomeNoTopo = ehTodos ? '@todos' : rascunho.nome.trim() || 'cargo';
    const voltarCel = el('button', { class: 'cg-dir__voltar', type: 'button' }, ['‹ Cargos']);
    voltarCel.addEventListener('click', () => irPara({ tipo: 'lista' }));
    const topo = el('div', { class: 'cg-dir__topo' }, [
      voltarCel,
      el('h2', { class: 'cg-dir__titulo' }, ['Editar cargo — ', el('b', {}, [nomeNoTopo])]),
    ]);

    const corpo = aba === 'aparencia' ? aparencia(c) : aba === 'permissoes' ? permissoes(ehTodos) : membrosDoCargo(c);
    return [
      el('div', { class: 'cg-ed' }, [
        listaLateral(c.id),
        el('div', { class: 'cg-dir' }, [topo, abas, ...corpo]),
      ]),
    ];
  }

  function aparencia(c: Cargo): HTMLElement[] {
    const r = rascunho!;
    const nome = el('input', { id: 'cargo-nome', class: 'settings__input cg-input', type: 'text', maxlength: MAX_NOME_DO_CARGO, autocomplete: 'off' });
    nome.value = r.nome;
    const aviso = el('p', { class: 'settings__help', id: 'cargo-nome-aviso' }, ['Obrigatório. Qualquer nome.']);
    nome.addEventListener('input', () => {
      r.nome = nome.value;
      const vazio = nome.value.trim() === '';
      aviso.dataset['tom'] = vazio ? 'erro' : '';
      aviso.textContent = vazio ? 'O cargo precisa de um nome.' : 'Obrigatório. Qualquer nome.';
      atualizarPrevia();
      op.mudou();
      const titulo = document.querySelector('.cg-dir__titulo b');
      if (titulo !== null) titulo.textContent = nome.value.trim() || 'cargo';
    });

    // Cor: sem cor / sólida / degradê
    const tipo: 'sem' | 'solida' | 'degrade' = r.cor === null ? 'sem' : r.cor.b === undefined ? 'solida' : 'degrade';
    const seg = el('div', { class: 'cg-seg', role: 'radiogroup', 'aria-label': 'Tipo de cor' }, (
      [['sem', 'Sem cor'], ['solida', 'Sólida'], ['degrade', 'Degradê']] as const
    ).map(([id, rotulo]) => {
      const b = el('button', { class: `cg-seg__op${tipo === id ? ' is-on' : ''}`, type: 'button', role: 'radio', 'aria-checked': String(tipo === id) }, [rotulo]);
      b.addEventListener('click', () => {
        const base = r.cor?.a ?? CORES[2]!;
        r.cor = id === 'sem' ? null : id === 'solida' ? { a: base } : { a: base, b: r.cor?.b ?? '#5cd6b0' };
        pontaAtiva = 'a';
        op.redesenhar();
      });
      return b;
    }));
    const escolherCor = (hex: string): void => {
      if (r.cor === null) r.cor = { a: hex };
      else if (r.cor.b !== undefined && pontaAtiva === 'b') r.cor = { a: r.cor.a, b: hex };
      else r.cor = r.cor.b === undefined ? { a: hex } : { a: hex, b: r.cor.b };
      op.redesenhar();
    };
    const atualDaPonta = r.cor === null ? '' : pontaAtiva === 'b' && r.cor.b !== undefined ? r.cor.b : r.cor.a;
    const cores = el('div', { class: 'cg-cores', role: 'radiogroup', 'aria-label': 'Cor do cargo' }, [
      ...CORES.map((hex) => {
        const b = el('button', { class: `cg-cor${atualDaPonta === hex ? ' is-on' : ''}`, type: 'button', role: 'radio', 'aria-checked': String(atualDaPonta === hex), 'aria-label': hex, title: hex });
        b.style.background = hex;
        b.addEventListener('click', () => escolherCor(hex));
        return b;
      }),
      (() => {
        const livre = el('input', { class: 'cg-cor-livre', type: 'color', value: atualDaPonta || '#7b3fe4', title: 'Outra cor', 'aria-label': 'Outra cor' });
        livre.addEventListener('change', () => escolherCor(livre.value.toLowerCase()));
        return el('label', { class: 'cg-cor cg-cor--mais', title: 'Outra cor' }, ['+', livre]);
      })(),
    ]);
    const degrade =
      r.cor?.b !== undefined
        ? (() => {
            const ponta = (qual: 'a' | 'b'): HTMLElement => {
              const b = el('button', { class: `cg-ponta${pontaAtiva === qual ? ' is-on' : ''}`, type: 'button', 'aria-label': qual === 'a' ? 'Cor do começo' : 'Cor do fim', 'aria-pressed': String(pontaAtiva === qual) });
              b.style.background = qual === 'a' ? r.cor!.a : r.cor!.b!;
              b.addEventListener('click', () => {
                pontaAtiva = qual;
                op.redesenhar();
              });
              return b;
            };
            const barra = el('span', { class: 'cg-degrade__barra' });
            barra.style.background = corCss(r.cor);
            return el('div', { class: 'cg-degrade' }, [ponta('a'), barra, ponta('b')]);
          })()
        : null;

    // Ícone
    const grande = el('span', { class: 'cg-icone-grande' }, [
      r.imagem !== undefined ? el('img', { src: r.imagem, alt: '' }) : (r.icone ?? '—'),
    ]);
    const emojis = el('div', { class: 'cg-emojis', role: 'group', 'aria-label': 'Emoji do cargo' }, EMOJIS.map((e) => {
      const b = el('button', { class: `cg-emoji${r.icone === e && r.imagem === undefined ? ' is-on' : ''}`, type: 'button', 'aria-label': e }, [e]);
      b.addEventListener('click', () => {
        r.icone = e;
        delete r.imagem;
        op.redesenhar();
      });
      return b;
    }));
    const outro = el('input', { class: 'settings__input cg-emoji-livre', type: 'text', maxlength: 8, placeholder: 'Outro emoji', 'aria-label': 'Outro emoji' });
    outro.addEventListener('change', () => {
      const v = outro.value.trim();
      if (v === '') return;
      r.icone = [...v].slice(0, 2).join('');
      delete r.imagem;
      op.redesenhar();
    });
    const arquivo = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', hidden: true });
    const enviar = el('button', { class: 'cg-botao', type: 'button' }, ['Enviar imagem']);
    enviar.addEventListener('click', () => arquivo.click());
    arquivo.addEventListener('change', () => {
      const f = arquivo.files?.[0];
      if (f === undefined) return;
      void imagemPequena(f)
        .then((url) => {
          r.imagem = url;
          op.redesenhar();
        })
        .catch(() => showToast('Não deu para usar essa imagem.'));
    });
    const tirar = el('button', { class: 'cg-link', type: 'button' }, ['Tirar ícone']);
    tirar.addEventListener('click', () => {
      delete r.icone;
      delete r.imagem;
      op.redesenhar();
    });

    const opcao = (titulo: string, desc: string, valor: boolean, mudar: (v: boolean) => void): HTMLElement =>
      el('div', { class: 'cg-perm' }, [
        el('span', { class: 'cg-perm__texto' }, [el('b', {}, [titulo]), el('small', {}, [desc])]),
        interruptor(valor, titulo, (v) => {
          mudar(v);
          op.redesenhar();
        }),
      ]);

    const form = el('div', { class: 'cg-form' }, [
      el('div', { class: 'cg-campo' }, [el('label', { class: 'cg-rotulo', for: 'cargo-nome' }, ['Nome do cargo']), nome, aviso]),
      el('div', { class: 'cg-campo' }, [el('span', { class: 'cg-rotulo' }, ['Cor']), seg, r.cor !== null && cores, degrade]),
      el('div', { class: 'cg-campo' }, [
        el('span', { class: 'cg-rotulo' }, ['Ícone do cargo']),
        el('div', { class: 'cg-icone-linha' }, [grande, el('div', { class: 'cg-icone-botoes' }, [emojis, el('div', { class: 'cg-icone-mais' }, [outro, enviar, arquivo, tirar])])]),
      ]),
      el('div', {}, [
        opcao('Mostrar separado na lista de membros', `Quem tem este cargo aparece num bloco próprio (${(r.nome.trim() || 'cargo').toUpperCase()} — N).`, r.separado, (v) => (r.separado = v)),
        opcao(`Qualquer um pode mencionar @${r.nome.trim() || 'cargo'}`, 'Sem isso, só quem tem a permissão "Mencionar qualquer cargo" consegue.', r.mencionavel, (v) => (r.mencionavel = v)),
      ]),
    ]);
    const previa = el('div', { class: 'cg-previa', 'aria-label': 'Prévia' });
    function atualizarPrevia(): void {
      previa.replaceChildren(...conteudoDaPrevia(c));
    }
    atualizarPrevia();
    return [el('div', { class: 'cg-2col' }, [form, previa])];
  }

  /** Como fica: a lista de membros e uma mensagem, com o rascunho aplicado. */
  function conteudoDaPrevia(c: Cargo): HTMLElement[] {
    const r = rascunho!;
    const falso: Cargo = { ...c, ...r, nome: r.nome.trim() || 'cargo' } as Cargo;
    if (r.icone === undefined) delete falso.icone;
    if (r.imagem === undefined) delete falso.imagem;
    const outros = cargos.map((x) => (x.id === c.id ? falso : x));
    const comEle = membros()
      .filter((m) => m.cargos?.includes(c.id))
      .slice(0, 3)
      .map((m) => comInsignias([m], outros, op.ownerId)[0]!);
    const exemplo: Member[] = comEle.length > 0 ? comEle : comInsignias([{ id: 'exemplo', displayName: 'Alguém', initials: 'AL', status: 'online', cargos: [c.id] }], outros, op.ownerId);
    const pessoa = (m: Member): HTMLElement =>
      el('span', { class: 'cg-previa__pessoa' }, [
        avatarEl(m.initials, 'md', '', m.photo, m.id),
        corDoCargo(el('span', { class: 'cg-previa__nome' }, [m.displayName]), m),
        iconeDoCargo(m),
      ]);
    const p = exemplo[0]!;
    return [
      el('span', { class: 'cg-rotulo' }, ['Prévia']),
      el('div', { class: 'cg-previa__caixa' }, [
        r.separado ? el('span', { class: 'cg-previa__bloco' }, [`${falso.nome} — ${exemplo.length}`]) : el('span', { class: 'cg-previa__bloco' }, ['Membros']),
        ...exemplo.map(pessoa),
      ]),
      el('div', { class: 'cg-previa__caixa' }, [
        el('div', { class: 'cg-previa__msg' }, [
          avatarEl(p.initials, 'md', '', p.photo, p.id),
          el('div', {}, [
            el('span', { class: 'cg-previa__meta' }, [corDoCargo(el('span', { class: 'cg-previa__nome' }, [p.displayName]), p), iconeDoCargo(p), el('small', {}, ['21:40'])]),
            el('div', { class: 'cg-previa__balao' }, ['bora pro servidor hoje?']),
          ]),
        ]),
      ]),
    ];
  }

  function permissoes(ehTodos: boolean): HTMLElement[] {
    const r = rascunho!;
    const ligadas = new Set(r.permissoes);
    const busca = el('input', { class: 'cg-busca cg-busca--perm', type: 'search', placeholder: `Procurar entre as ${TODAS_AS_PERMISSOES.length} permissões`, 'aria-label': 'Procurar permissão' });
    busca.value = buscaPermissao;
    const desligar = el('button', { class: 'cg-link', type: 'button' }, ['Desligar todas']);
    desligar.addEventListener('click', () => {
      r.permissoes = [];
      op.redesenhar();
    });
    const q = buscaPermissao.trim().toLowerCase();
    const secoes = SECOES_DE_PERMISSOES.map((s) => {
      const itens = s.itens.filter(
        (p) => !(ehTodos && p.id === 'administrador') && (q === '' || p.nome.toLowerCase().includes(q) || p.desc.toLowerCase().includes(q)),
      );
      if (itens.length === 0) return null;
      return el('section', { class: 'cg-secao' }, [
        el('h3', { class: 'cg-rotulo' }, [s.nome]),
        ...itens.map((p) =>
          el('div', { class: 'cg-perm' }, [
            el('span', { class: 'cg-perm__texto' }, [
              el('b', {}, [p.nome, p.futura !== undefined ? el('span', { class: 'cg-futura' }, [`chega com ${p.futura}`]) : null]),
              el('small', {}, [p.desc]),
              p.aviso !== undefined ? el('small', { class: 'cg-perm__aviso' }, [p.aviso]) : null,
            ]),
            interruptor(ligadas.has(p.id), p.nome, (v) => {
              r.permissoes = v ? [...ligadas, p.id] : [...ligadas].filter((x) => x !== p.id);
              op.redesenhar();
            }),
          ]),
        ),
      ]);
    });
    busca.addEventListener('input', () => {
      buscaPermissao = busca.value;
      op.redesenhar();
      const nova = document.querySelector<HTMLInputElement>('.cg-busca--perm');
      nova?.focus();
      nova?.setSelectionRange(nova.value.length, nova.value.length);
    });
    return [
      ehTodos
        ? el('p', { class: 'settings__help' }, ['O que todo mundo do grupo pode fazer, mesmo sem cargo nenhum. Os cargos somam por cima disto.'])
        : null,
      el('div', { class: 'cg-pbarra' }, [busca, desligar]),
      el('p', { class: 'settings__help cg-etapa' }, [
        'As permissões ficam guardadas agora e passam a valer de verdade na próxima parte desta atualização.',
      ]),
      ...secoes.filter((s): s is HTMLElement => s !== null),
      secoes.every((s) => s === null) ? el('p', { class: 'settings__help' }, ['Nenhuma permissão com esse nome.']) : null,
    ].filter((x): x is HTMLElement => x !== null);
  }

  function membrosDoCargo(c: Cargo): HTMLElement[] {
    const busca = el('input', { class: 'cg-busca cg-busca--membro', type: 'search', placeholder: 'Procurar membro', 'aria-label': 'Procurar membro' });
    busca.value = buscaMembro;
    busca.addEventListener('input', () => {
      buscaMembro = busca.value;
      op.redesenhar();
      const nova = document.querySelector<HTMLInputElement>('.cg-busca--membro');
      nova?.focus();
      nova?.setSelectionRange(nova.value.length, nova.value.length);
    });
    const q = buscaMembro.trim().toLowerCase();
    const todos = membros().filter((m) => m.displayName.toLowerCase().includes(q));
    const com = todos.filter((m) => m.cargos?.includes(c.id));
    const sem = todos.filter((m) => !m.cargos?.includes(c.id));
    const linha = (m: Member, tem: boolean): HTMLElement => {
      const b = el('button', { class: 'cg-membro__botao', type: 'button' }, [tem ? 'Tirar' : 'Dar']);
      b.addEventListener('click', () => {
        b.disabled = true;
        void darCargo(op.groupId, m.id, c.id, !tem).catch((e) => {
          b.disabled = false;
          falhou(e, 'Não deu para mudar o cargo.');
        });
      });
      return el('div', { class: 'cg-membro' }, [
        avatarEl(m.initials, 'md', '', m.photo, m.id),
        el('span', { class: 'cg-membro__nome' }, [corDoCargo(el('span', {}, [m.displayName]), m), iconeDoCargo(m)]),
        b,
      ]);
    };
    return [
      busca,
      el('h3', { class: 'cg-rotulo' }, [`Com este cargo — ${com.length}`]),
      ...(com.length === 0 ? [el('p', { class: 'settings__help' }, ['Ninguém ainda.'])] : com.map((m) => linha(m, true))),
      el('h3', { class: 'cg-rotulo' }, [`Dar para — ${sem.length}`]),
      ...sem.map((m) => linha(m, false)),
    ];
  }

  /* --- MEMBROS (seção do menu) ------------------------------------------------ */

  function secaoMembros(): HTMLElement[] {
    const busca = el('input', { class: 'cg-busca cg-busca--membros', type: 'search', placeholder: 'Procurar membro', 'aria-label': 'Procurar membro' });
    busca.value = buscaMembro;
    busca.addEventListener('input', () => {
      buscaMembro = busca.value;
      op.redesenhar();
      const nova = document.querySelector<HTMLInputElement>('.cg-busca--membros');
      nova?.focus();
      nova?.setSelectionRange(nova.value.length, nova.value.length);
    });
    const q = buscaMembro.trim().toLowerCase();
    const lista = membros()
      .filter((m) => m.displayName.toLowerCase().includes(q))
      .sort((a, b) => (a.insignia?.blocoPosicao ?? 99999) - (b.insignia?.blocoPosicao ?? 99999) || a.displayName.localeCompare(b.displayName, 'pt-BR'));
    return [
      el('header', { class: 'settings__header' }, [
        el('h2', { class: 'settings__title' }, ['Membros']),
        el('p', { class: 'settings__subtitle' }, [`${membrosCrus.length} ${membrosCrus.length === 1 ? 'pessoa' : 'pessoas'} no grupo. Dê e tire cargos pelas etiquetas.`]),
      ]),
      busca,
      el('ul', { class: 'cg-mlista', 'aria-label': 'Membros' }, lista.map((m) =>
        el('li', { class: 'cg-mlinha' }, [
          avatarEl(m.initials, 'md', '', m.photo, m.id),
          el('span', { class: 'cg-mlinha__quem' }, [
            el('span', { class: 'cg-mlinha__nome' }, [corDoCargo(el('span', {}, [m.displayName]), m), iconeDoCargo(m)]),
            el('small', {}, [m.id === op.ownerId ? 'Dono do grupo' : m.entrouEm !== undefined ? `Entrou em ${dataCurta(m.entrouEm)}` : '']),
          ]),
          chipsDeCargos({
            membro: m,
            cargos: normais(),
            podeEditar: true,
            aoDar: (cargoId, dar) => darCargo(op.groupId, m.id, cargoId, dar).catch((e) => {
              falhou(e, 'Não deu para mudar o cargo.');
              throw e;
            }),
          }),
        ]),
      )),
    ];
  }

  return {
    cargos: () => (tela.tipo === 'editar' ? editor(tela) : lista()),
    membros: secaoMembros,
    sujo,
    async salvar() {
      if (tela.tipo !== 'editar' || rascunho === null || !sujo()) return;
      const c = cargoDe(tela.id);
      if (c === undefined) return;
      if (rascunho.nome.trim() === '' && c.todos !== true) throw new Error('O cargo precisa de um nome.');
      await salvarCargo(c.id, rascunho, c.todos === true);
      salvoDoRascunho = { ...rascunho, nome: rascunho.nome.trim(), permissoes: [...rascunho.permissoes] };
      rascunho = { ...salvoDoRascunho, permissoes: [...salvoDoRascunho.permissoes] };
    },
    desfazer() {
      if (salvoDoRascunho !== null) rascunho = { ...salvoDoRascunho, permissoes: [...salvoDoRascunho.permissoes], cor: salvoDoRascunho.cor === null ? null : { ...salvoDoRascunho.cor } };
    },
    parar() {
      pararCargos();
      pararMembros();
    },
  };
}

function dataCurta(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Imagem do ícone: no máximo 64 px, WebP, guardada no próprio cargo. */
async function imagemPequena(f: File): Promise<string> {
  const url = URL.createObjectURL(f);
  try {
    const img = await new Promise<HTMLImageElement>((ok, falha) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => falha(new Error('imagem'));
      i.src = url;
    });
    const tela = encolher(img, img.naturalWidth, img.naturalHeight, 64);
    return tela.toDataURL('image/webp', 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}
