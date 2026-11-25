import './cargos.css';
import '../galeria/galeria.css';

import { avatarEl, el, iconEl } from '../../lib/dom';
import { closeIcon } from '../../lib/icons';
import { pedirAoCarteiro } from '../../lib/cargos';
import { TODAS_AS_PERMISSOES, PERMISSOES_DO_CANAL, lerRegras } from '../../lib/permissoes';
import type { RegrasDoCanal } from '../../lib/permissoes';
import { showToast } from '../toast/toast';
import type { Cargo, Channel, Member } from '../../types/models';
import { bolinhaDoCargo } from './chips';

/**
 * PERMISSÕES DO CANAL / DA CATEGORIA (0.8.5, etapa 3) — igual ao Discord:
 * à esquerda @todos, os cargos e as pessoas com regra própria; à direita,
 * cada permissão com ✗ negar / ／ seguir / ✓ permitir. "Canal privado" é o
 * atalho: o @todos não vê, e os cargos escolhidos veem. Grava pelo carteiro.
 */

export interface PermissoesDoCanalOpcoes {
  groupId: string;
  /** Um canal, ou uma categoria (aí `categoria` vem com id e nome). */
  canal?: Channel;
  categoria?: { id: string; nome: string };
  /** Regras de agora (do canal, ou da categoria). */
  regras: RegrasDoCanal;
  /** Para o aviso de sincronização: as regras da categoria do canal. */
  regrasDaCategoria?: RegrasDoCanal;
  nomeDaCategoria?: string;
  cargos: Cargo[];
  membros: Member[];
}

const TEXTO = ['ver-canal', 'ler-antigas', 'mandar-mensagens', 'responder', 'mandar-fotos', 'mandar-gifs', 'mandar-videos', 'mandar-audio', 'mandar-figurinhas', 'mandar-links', 'previa-links', 'mencionar-pessoas', 'mencionar-cargos', 'mencionar-todos', 'usar-comandos', 'fixar', 'desafixar', 'apagar-dos-outros', 'apagar-varias', 'ignorar-lento', 'ver-galeria', 'criar-convites', 'editar-canais', 'apagar-canais', 'permissoes-canais', 'mandar-enquetes', 'votar-enquetes', 'encerrar-enquetes', 'visualizacao-unica', 'transcricao', 'reagir', 'mandar-arquivos'];
const VOZ = ['ver-sala', 'entrar', 'falar', 'transmitir', 'transmitir-som', 'camera', 'sala-cheia', 'silenciar-outros', 'ensurdecer-outros', 'parar-transmissao', 'mover', 'tirar-da-chamada', 'ver-chat-sala', 'escrever-chat-sala', 'status-sala', 'criar-convites', 'editar-canais', 'apagar-canais', 'permissoes-canais', 'mini-jogos-iniciar', 'mini-jogos-jogar'];

type Estado = 'nega' | 'segue' | 'permite';

function copia(r: RegrasDoCanal): RegrasDoCanal {
  return Object.fromEntries(Object.entries(r).map(([k, v]) => [k, { permite: [...v.permite], nega: [...v.nega] }]));
}

function limpa(r: RegrasDoCanal): RegrasDoCanal {
  return Object.fromEntries(Object.entries(r).filter(([, v]) => v.permite.length + v.nega.length > 0));
}

function igual(a: RegrasDoCanal, b: RegrasDoCanal): boolean {
  const norm = (r: RegrasDoCanal): string =>
    JSON.stringify(Object.entries(limpa(r)).sort(([x], [y]) => x.localeCompare(y)).map(([k, v]) => [k, [...v.permite].sort(), [...v.nega].sort()]));
  return norm(a) === norm(b);
}

export function abrirPermissoesDoCanal(op: PermissoesDoCanalOpcoes): void {
  const ehCategoria = op.categoria !== undefined;
  const voz = op.canal?.kind === 'voice';
  const ids = ehCategoria ? [...new Set([...TEXTO, ...VOZ])] : voz ? VOZ : TEXTO;
  const lista = TODAS_AS_PERMISSOES.filter((p) => ids.includes(p.id) && PERMISSOES_DO_CANAL.has(p.id));
  const ver = voz ? 'ver-sala' : 'ver-canal';
  const titulo = ehCategoria ? `Categoria ${op.categoria!.nome}` : `${voz ? '🔊 ' : '#'}${op.canal!.name}`;

  let salvo = copia(op.regras);
  let atual = copia(op.regras);
  // Quem aparece na esquerda: @todos sempre, e quem tem regra.
  let alvos = ['todos', ...Object.keys(atual).filter((a) => a !== 'todos')];
  let selecionado = 'todos';
  let salvando = false;
  let busca = '';

  const nomeDo = (alvo: string): string => {
    if (alvo === 'todos') return '@todos';
    if (alvo.startsWith('u:')) return op.membros.find((m) => m.id === alvo.slice(2))?.displayName ?? 'Alguém';
    return op.cargos.find((c) => c.id === alvo)?.nome ?? 'cargo apagado';
  };

  const fechar = el('button', { class: 'galeria__fechar icon-button', type: 'button', title: 'Fechar (Esc)' }, [
    iconEl(closeIcon(18)),
    el('span', { class: 'sr-only' }, ['Fechar permissões']),
  ]);
  const corpo = el('div', { class: 'pc-corpo' });
  const barra = el('div', { class: 'settings__bar pc-barra', role: 'region', 'aria-label': 'Alterações não salvas' });
  const janela = el('dialog', { class: 'galeria pc', 'aria-label': `Permissões — ${titulo}` }, [
    el('div', { class: 'galeria__caixa' }, [fechar, el('div', { class: 'galeria__rolagem scroll-area' }, [corpo]), barra]),
  ]) as HTMLDialogElement;

  const regraDe = (alvo: string): { permite: string[]; nega: string[] } => {
    atual[alvo] ??= { permite: [], nega: [] };
    return atual[alvo]!;
  };
  const estadoDe = (alvo: string, p: string): Estado => {
    const r = atual[alvo];
    return r?.permite.includes(p) ? 'permite' : r?.nega.includes(p) ? 'nega' : 'segue';
  };
  const mudar = (alvo: string, p: string, e: Estado): void => {
    const r = regraDe(alvo);
    r.permite = r.permite.filter((x) => x !== p);
    r.nega = r.nega.filter((x) => x !== p);
    if (e === 'permite') r.permite.push(p);
    if (e === 'nega') r.nega.push(p);
    desenhar();
  };

  function desenharBarra(): void {
    const mudou = !igual(atual, salvo);
    barra.hidden = !mudou;
    const desfazer = el('button', { class: 'settings__bar-undo', type: 'button', disabled: salvando }, ['Desfazer']);
    const salvar = el('button', { class: 'settings__bar-save', type: 'button', disabled: salvando }, [salvando ? 'Salvando…' : 'Salvar']);
    desfazer.addEventListener('click', () => {
      atual = copia(salvo);
      alvos = ['todos', ...Object.keys(atual).filter((a) => a !== 'todos')];
      if (!alvos.includes(selecionado)) selecionado = 'todos';
      desenhar();
    });
    salvar.addEventListener('click', () => void gravar(limpa(atual)));
    barra.replaceChildren(el('span', { class: 'settings__bar-text' }, ['Você tem alterações que não foram salvas.']), el('span', { class: 'settings__bar-actions' }, [desfazer, salvar]));
  }

  async function gravar(regras: RegrasDoCanal): Promise<void> {
    salvando = true;
    desenharBarra();
    try {
      await pedirAoCarteiro(op.groupId, 'regras', {
        ...(ehCategoria ? { categoria: op.categoria!.id } : { canal: op.canal!.id }),
        regras,
      });
      salvo = copia(regras);
      atual = copia(regras);
      showToast('Permissões salvas.');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Não deu para salvar.');
    } finally {
      salvando = false;
      desenhar();
    }
  }

  function desenhar(): void {
    const privado = estadoDe('todos', ver) === 'nega';
    const chavePrivado = el('button', { class: 'cg-sw', type: 'button', role: 'switch', 'aria-checked': String(privado), 'aria-label': voz ? 'Sala privada' : 'Canal privado' });
    chavePrivado.addEventListener('click', () => mudar('todos', ver, privado ? 'segue' : 'nega'));

    // Aviso de sincronização (só canal dentro de categoria).
    let sinc: HTMLElement | null = null;
    if (!ehCategoria && op.canal?.categoryId !== undefined && op.nomeDaCategoria !== undefined) {
      const sincronizado = Object.keys(limpa(salvo)).length === 0;
      if (sincronizado) {
        sinc = el('p', { class: 'pc-sinc' }, [`🔗 Sincronizado com a categoria ${op.nomeDaCategoria}: segue as regras dela. Mudar aqui tira a sincronização.`]);
      } else {
        const agora = el('button', { class: 'cg-link', type: 'button' }, ['Sincronizar agora']);
        agora.addEventListener('click', () => void gravar({}));
        sinc = el('p', { class: 'pc-sinc' }, [`Não está sincronizado com a categoria ${op.nomeDaCategoria}. `, agora]);
      }
    }

    // Esquerda: os alvos.
    const mais = el('button', { class: 'cg-link pc-mais', type: 'button' }, ['+ Cargo ou pessoa']);
    const escolha = el('div', { class: 'pc-escolha', hidden: true });
    mais.addEventListener('click', () => {
      escolha.hidden = !escolha.hidden;
      if (!escolha.hidden) escolha.querySelector('input')?.focus();
    });
    const campo = el('input', { class: 'cg-escolha__busca', type: 'search', placeholder: 'Procurar cargo ou pessoa', 'aria-label': 'Procurar cargo ou pessoa' });
    campo.value = busca;
    const opcoes = el('div', {});
    const desenharOpcoes = (): void => {
      const q = campo.value.trim().toLowerCase();
      busca = campo.value;
      const cs = op.cargos.filter((c) => c.todos !== true && !alvos.includes(c.id) && c.nome.toLowerCase().includes(q));
      const ms = op.membros.filter((m) => !alvos.includes(`u:${m.id}`) && m.displayName.toLowerCase().includes(q));
      opcoes.replaceChildren(
        ...cs.map((c) => {
          const b = el('button', { class: 'cg-escolha__op', type: 'button' }, [bolinhaDoCargo(c), el('span', { class: 'cg-escolha__nome' }, [c.nome])]);
          b.addEventListener('click', () => {
            alvos.push(c.id);
            selecionado = c.id;
            busca = '';
            desenhar();
          });
          return b;
        }),
        ...ms.map((m) => {
          const b = el('button', { class: 'cg-escolha__op', type: 'button' }, [avatarEl(m.initials, 'xs', '', m.photo, m.id), el('span', { class: 'cg-escolha__nome' }, [m.displayName])]);
          b.addEventListener('click', () => {
            alvos.push(`u:${m.id}`);
            selecionado = `u:${m.id}`;
            busca = '';
            desenhar();
          });
          return b;
        }),
      );
    };
    campo.addEventListener('input', desenharOpcoes);
    desenharOpcoes();
    escolha.append(campo, opcoes);

    const itens = alvos.map((alvo) => {
      const cargo = op.cargos.find((c) => c.id === alvo);
      const pessoa = alvo.startsWith('u:') ? op.membros.find((m) => m.id === alvo.slice(2)) : undefined;
      const b = el('button', { class: `cg-lado__item${alvo === selecionado ? ' is-on' : ''}`, type: 'button', 'aria-current': alvo === selecionado ? 'true' : undefined }, [
        pessoa !== undefined ? avatarEl(pessoa.initials, 'xs', '', pessoa.photo, pessoa.id) : cargo !== undefined ? bolinhaDoCargo(cargo) : el('span', { class: 'cg-bola', style: 'background:var(--border-strong)' }),
        el('span', { class: 'cg-lado__nome' }, [nomeDo(alvo)]),
      ]);
      b.addEventListener('click', () => {
        selecionado = alvo;
        desenhar();
      });
      return b;
    });
    const lado = el('nav', { class: 'cg-lado pc-lado', 'aria-label': 'Cargos e pessoas' }, [
      el('div', { class: 'cg-lado__topo' }, [el('span', { class: 'cg-rotulo' }, ['Cargos e pessoas']), mais]),
      escolha,
      ...itens,
    ]);

    // Direita: as permissões do selecionado.
    const tirar = el('button', { class: 'cg-link', type: 'button', hidden: selecionado === 'todos' }, ['Tirar da lista']);
    tirar.addEventListener('click', () => {
      delete atual[selecionado];
      alvos = alvos.filter((a) => a !== selecionado);
      selecionado = 'todos';
      desenhar();
    });
    const linhas = lista.map((p) => {
      const e = estadoDe(selecionado, p.id);
      const tres = el('div', { class: 'pc-tres', role: 'radiogroup', 'aria-label': p.nome }, (
        [['nega', '✗', 'Negar'], ['segue', '／', 'Seguir o padrão'], ['permite', '✓', 'Permitir']] as const
      ).map(([id, sinal, nome]) => {
        const b = el('button', { class: `pc-tres__op pc-tres__op--${id}${e === id ? ' is-on' : ''}`, type: 'button', role: 'radio', 'aria-checked': String(e === id), 'aria-label': `${nome}: ${p.nome}`, title: nome }, [sinal]);
        b.addEventListener('click', () => mudar(selecionado, p.id, id));
        return b;
      }));
      return el('div', { class: 'cg-perm' }, [
        el('span', { class: 'cg-perm__texto' }, [
          el('b', {}, [p.nome, p.futura !== undefined ? el('span', { class: 'cg-futura' }, [`chega com ${p.futura}`]) : null]),
          el('small', {}, [p.desc]),
        ]),
        tres,
      ]);
    });

    corpo.replaceChildren(
      el('header', { class: 'galeria__topo pc-topo' }, [
        el('div', { class: 'galeria__titulo' }, [
          el('h2', {}, ['Permissões']),
          el('p', { class: 'galeria__resumo' }, [titulo, ' · quem vê, ', voz ? 'entra e fala' : 'escreve e manda o quê']),
        ]),
      ]),
      ...(sinc === null ? [] : [sinc]),
      el('div', { class: 'cg-perm pc-privado' }, [
        el('span', { class: 'cg-perm__texto' }, [
          el('b', {}, [ehCategoria ? 'Categoria privada' : voz ? 'Sala privada' : 'Canal privado']),
          el('small', {}, ['Só quem tem um cargo (ou é uma pessoa) com "', voz ? 'Ver a sala' : 'Ver canal', '" permitido aqui vê. Ligar nega isso para o @todos.']),
        ]),
        chavePrivado,
      ]),
      el('div', { class: 'cg-ed pc-ed' }, [
        lado,
        el('div', { class: 'cg-dir' }, [
          el('div', { class: 'cg-dir__topo' }, [el('h2', { class: 'cg-dir__titulo' }, ['Regras de ', el('b', {}, [nomeDo(selecionado)])]), tirar]),
          ...linhas,
        ]),
      ]),
    );
    desenharBarra();
  }

  janela.addEventListener('cancel', (e) => {
    if (!igual(atual, salvo)) {
      e.preventDefault();
      barra.classList.remove('settings__bar--pisca');
      void barra.offsetWidth;
      barra.classList.add('settings__bar--pisca');
    }
  });
  janela.addEventListener('close', () => janela.remove());
  janela.addEventListener('click', (e) => {
    if (e.target === janela && igual(atual, salvo)) janela.close();
  });
  fechar.addEventListener('click', () => {
    if (!igual(atual, salvo)) {
      barra.classList.remove('settings__bar--pisca');
      void barra.offsetWidth;
      barra.classList.add('settings__bar--pisca');
      return;
    }
    janela.close();
  });
  document.body.append(janela);
  janela.showModal();
  desenhar();
}

/** Lê com cuidado as regras de um lugar qualquer (canal ou categoria). */
export function regrasDe(v: unknown): RegrasDoCanal {
  return lerRegras(v);
}
