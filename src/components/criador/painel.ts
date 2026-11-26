import './painel.css';

import { avatarEl, el } from '../../lib/dom';
import { buscarPessoas, darEspecial, listarEspeciais, tirarEspecial } from '../../lib/especiais';
import type { PessoaEspecial, QueDa } from '../../lib/especiais';
import { POR_ID, RARIDADES } from '../../lib/insignias';
import { medalha } from '../insignias/insignias-ui';
import { showToast } from '../toast/toast';

/**
 * O PAINEL DO CRIADOR (0.12.5) — Configurações → Criador, só na conta do
 * criador. As 3 especiais: a dele (ninguém dá), Confidente e Linha de
 * Frente (quem tem, desde quando, "+ Dar para alguém" e o ✕ para tirar).
 * Dar = um presente no privado; o nome da pessoa só brilha quando ela abre.
 */

const CARTOES: Array<{ id: 'criador' | QueDa; cor: string; extra: string }> = [
  { id: 'criador', cor: '#8a35ff', extra: 'Só existe uma, e é sua.' },
  { id: 'confidente', cor: '#e0a419', extra: 'Nome dourado.' },
  { id: 'testador', cor: '#9fb4d6', extra: 'Nome prateado.' },
];

function quando(iso: string | undefined): string {
  if (iso === undefined || iso === '') return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `desde ${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`;
}

function nomeEl(p: PessoaEspecial): HTMLElement {
  return el('span', { class: p.brilho === undefined ? '' : `nome-brilho nome-brilho--${p.brilho}` }, [p.displayName]);
}

export function renderPainelDoCriador(): HTMLElement[] {
  const corpo = el('div', { class: 'cri' }, [el('p', { class: 'settings__help' }, ['Carregando…'])]);
  let busca: HTMLElement | null = null;

  const fecharBusca = (): void => {
    busca?.remove();
    busca = null;
    corpo.querySelectorAll('.cri__dar.is-on').forEach((b) => b.classList.remove('is-on'));
  };

  async function carregar(): Promise<void> {
    try {
      const dados = await listarEspeciais();
      desenhar(dados.criador, dados.quem);
    } catch (e) {
      corpo.replaceChildren(el('p', { class: 'settings__error' }, [e instanceof Error ? e.message : 'Não deu para carregar.']));
    }
  }

  function chip(p: PessoaEspecial, ins: QueDa | null): HTMLElement {
    const detalhe = p.aberto === false ? 'presente ainda fechado' : quando(p.desde);
    const filhos: Array<HTMLElement | string | false> = [avatarEl(p.initials, 'xs', '', p.photo, p.uid), nomeEl(p), detalhe !== '' && el('small', {}, [detalhe])];
    const c = el('span', { class: 'cri__p', 'data-uid': p.uid }, filhos);
    if (ins === null) return c;
    const x = el('button', { class: 'cri__x', type: 'button', title: `Tirar de ${p.displayName}`, 'aria-label': `Tirar de ${p.displayName}` }, ['✕']);
    x.addEventListener('click', () => {
      // Confirma ali mesmo (sem janela).
      const sim = el('button', { class: 'cri__sim', type: 'button' }, ['Tirar']);
      const nao = el('button', { class: 'cri__nao', type: 'button' }, ['Não']);
      const pergunta = el('span', { class: 'cri__p cri__p--pergunta' }, [`Tirar de ${p.displayName}?`, sim, nao]);
      c.replaceWith(pergunta);
      nao.addEventListener('click', () => pergunta.replaceWith(c));
      sim.addEventListener('click', () => {
        sim.disabled = true;
        void tirarEspecial(ins, p.uid)
          .then(() => {
            showToast(`${POR_ID.get(ins)?.nome ?? 'Insígnia'} tirada de ${p.displayName}.`);
            return carregar();
          })
          .catch((e: unknown) => {
            showToast(e instanceof Error ? e.message : 'Não deu para tirar.');
            pergunta.replaceWith(c);
          });
      });
    });
    c.append(x);
    return c;
  }

  function abrirBusca(botao: HTMLButtonElement, ins: QueDa, jaTem: Set<string>): void {
    fecharBusca();
    botao.classList.add('is-on');
    const campo = el('input', { class: 'cri-busca__in', type: 'search', placeholder: 'Nome ou @', 'aria-label': 'Procurar pessoa' });
    const lista = el('div', { class: 'cri-busca__lista' });
    const nome = POR_ID.get(ins)?.nome ?? '';
    busca = el('div', { class: 'cri-busca', role: 'dialog', 'aria-label': `Dar ${nome}` }, [
      el('div', { class: 'cri-busca__t' }, [`Dar ${nome} para…`]),
      campo,
      lista,
      el('div', { class: 'cri-busca__nota' }, ['🎁 Chega como presente no privado com você. O nome só brilha depois que a pessoa abrir o presente.']),
    ]);
    botao.after(busca);
    campo.focus();
    let vez = 0;
    let tempo: number | undefined;
    campo.addEventListener('input', () => {
      window.clearTimeout(tempo);
      const texto = campo.value.trim();
      if (texto === '') {
        lista.replaceChildren();
        return;
      }
      tempo = window.setTimeout(() => {
        const minha = ++vez;
        void buscarPessoas(texto)
          .then((pessoas) => {
            if (minha !== vez || busca === null) return;
            if (pessoas.length === 0) {
              lista.replaceChildren(el('p', { class: 'cri-busca__vazio' }, ['Ninguém com esse nome ou @.']));
              return;
            }
            lista.replaceChildren(
              ...pessoas.map((p) => {
                const tem = jaTem.has(p.uid);
                const dar = el('button', { class: 'cri-busca__dar', type: 'button', disabled: tem }, [tem ? 'Já tem' : 'Dar']);
                dar.addEventListener('click', () => {
                  dar.disabled = true;
                  dar.textContent = 'Mandando…';
                  void darEspecial(ins, p.uid)
                    .then(() => {
                      showToast(`Presente mandado para ${p.displayName}.`);
                      fecharBusca();
                      return carregar();
                    })
                    .catch((e: unknown) => {
                      dar.disabled = false;
                      dar.textContent = 'Dar';
                      showToast(e instanceof Error ? e.message : 'Não deu para mandar.');
                    });
                });
                return el('div', { class: 'cri-busca__r' }, [
                  avatarEl(p.initials, 'sm', '', p.photo, p.uid),
                  el('span', {}, [el('b', {}, [p.displayName]), p.username !== undefined && el('small', {}, [`@${p.username}`])]),
                  dar,
                ]);
              }),
            );
          })
          .catch(() => undefined);
      }, 250);
    });
    campo.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        fecharBusca();
        botao.focus();
      }
    });
  }

  function desenhar(criador: PessoaEspecial | null, quem: Record<QueDa, PessoaEspecial[]>): void {
    corpo.replaceChildren(
      ...CARTOES.map(({ id, cor, extra }) => {
        const ins = POR_ID.get(id)!;
        const r = RARIDADES[ins.raridade];
        const pessoas = id === 'criador' ? (criador === null ? [] : [{ ...criador, brilho: 'roxo' as const }]) : quem[id];
        const linha: HTMLElement[] = pessoas.map((p) => chip(p, id === 'criador' ? null : id));
        if (id === 'criador') {
          linha.push(el('span', { class: 'cri__trava' }, ['🔒 Não dá para dar para ninguém']));
        } else {
          const dar = el('button', { class: 'cri__dar', type: 'button' }, ['+ Dar para alguém']);
          const ja = new Set(pessoas.map((p) => p.uid));
          dar.addEventListener('click', () => (dar.classList.contains('is-on') ? fecharBusca() : abrirBusca(dar, id, ja)));
          linha.push(dar);
        }
        return el('section', { class: 'cri__c', style: `--g:${cor}`, 'data-especial': id }, [
          medalha(ins, 96),
          el('div', { class: 'cri__miolo' }, [
            el('h3', {}, [ins.nome, el('span', { class: `cri__tag cri__tag--${id}` }, [r.nome])]),
            el('p', {}, [`${ins.desc.replace(/ Só existe uma\.$/, '')} ${extra}`]),
            el('div', { class: 'cri__quem' }, linha),
          ]),
        ]);
      }),
    );
  }

  void carregar();
  return [
    el('header', { class: 'settings__header' }, [
      el('h2', { class: 'settings__title cri__titulo' }, ['Painel do Criador', el('span', { class: 'cri__tag cri__tag--criador' }, ['só você vê'])]),
      el('p', { class: 'settings__subtitle' }, [
        'As insígnias especiais do Loftchat. Quem você escolher recebe a insígnia como presente no privado com você, e o nome passa a brilhar em todo lugar.',
      ]),
    ]),
    corpo,
  ];
}
