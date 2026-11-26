import './insignias-servidor.css';

import { ouvirCargos } from '../../lib/cargos';
import { el, iconEl } from '../../lib/dom';
import { closeIcon } from '../../lib/icons';
import { RARIDADES } from '../../lib/insignias';
import { GATILHOS, LIMITE_POR_GRUPO, NOMES_DAS_MIDIAS, RARIDADES_DO_SERVIDOR, temAlvo, textoDoGatilho } from '../../lib/insignias-grupo';
import type { Gatilho, InsigniaDoGrupo, MidiaDoGatilho, TipoDeGatilho } from '../../lib/insignias-grupo';
import { apagarInsignia, comoInsignia, fraseDaInsignia, ouvirInsigniasDoGrupo, salvarInsignia } from '../../lib/insignias-servidor';
import type { Cargo, Channel, Group } from '../../types/models';
import { CATEGORIAS_DE_ICONES, ICONES_DO_SERVIDOR } from '../insignias/desenhos';
import { medalha } from '../insignias/insignias-ui';
import { showToast } from '../toast/toast';

/**
 * CONFIGURAÇÕES DO GRUPO → INSÍGNIAS (0.12.5): a lista das insígnias do
 * servidor e a TELA SOBREPOSTA de criar/editar (fundo desfocado; no celular,
 * tela cheia), com a prévia ao vivo da medalha e do aviso.
 */

const COR_DA_RARIDADE: Record<string, string> = { comum: '#c3cad6', incomum: '#6ee7a0', rara: '#7cb8ff', epica: '#e2c4ff', lendaria: '#ffd75e' };

const icone = (k: string, t = 22): HTMLElement => {
  const s = el('span', { class: 'isv-ic', 'aria-hidden': 'true' });
  s.innerHTML = `<svg viewBox="0 0 24 24" width="${t}" height="${t}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONES_DO_SERVIDOR[k] ?? ''}</svg>`;
  return s;
};

export interface SecaoDeInsignias {
  raiz: HTMLElement;
  parar: () => void;
}

export function criarSecaoDeInsignias(opc: { grupo: Group; canais: Channel[]; pode: (p: string) => boolean }): SecaoDeInsignias {
  const raiz = el('div', { class: 'isv' });
  let lista: InsigniaDoGrupo[] = [];
  let cargos: Cargo[] = [];
  let carregou = false;
  let busca = '';
  let confirmando: string | null = null;
  const podeCriar = opc.pode('criar-insignias');
  const podeEditar = opc.pode('editar-insignias');

  const nomeDoCanal = (id: string): string | undefined => opc.canais.find((c) => c.id === id)?.name;
  const nomeDoCargo = (id: string): string | undefined => cargos.find((c) => c.id === id)?.nome;

  const campoBusca = el('input', { class: 'cg-busca', type: 'search', placeholder: 'Procurar insígnia', 'aria-label': 'Procurar insígnia' });
  campoBusca.addEventListener('input', () => {
    busca = campoBusca.value.trim().toLowerCase();
    desenharLista();
  });
  const criar = el('button', { class: 'cg-criar', type: 'button', hidden: !podeCriar }, ['+ Criar insígnia']);
  criar.addEventListener('click', () => {
    if (lista.length >= LIMITE_POR_GRUPO) {
      showToast(`O grupo já tem ${LIMITE_POR_GRUPO} insígnias (o máximo).`);
      return;
    }
    abrirEditor(null);
  });
  const conta = el('div', { class: 'isv-conta' });
  const tabela = el('div', { class: 'isv-tabela', role: 'list', 'aria-label': 'Insígnias do grupo' });

  raiz.append(
    el('header', { class: 'settings__header' }, [
      el('h2', { class: 'settings__title' }, ['Insígnias']),
      el('p', { class: 'settings__subtitle' }, [
        'Insígnias só deste grupo. Aparecem no perfil de quem ganhou, quando alguém abre esse perfil aqui dentro. Quem cumpre o "como ganhar" recebe sozinho.',
      ]),
    ]),
    el('div', { class: 'cg-barra' }, [campoBusca, criar]),
    conta,
    tabela,
  );

  function desenharLista(): void {
    conta.replaceChildren(
      `${lista.length} de ${LIMITE_POR_GRUPO} insígnias`,
      el('span', { class: 'isv-conta__barra' }, [el('i', { style: `width:${Math.round((lista.length / LIMITE_POR_GRUPO) * 100)}%` })]),
    );
    if (!carregou) {
      tabela.replaceChildren(el('p', { class: 'settings__help' }, ['Carregando as insígnias…']));
      return;
    }
    const vistas = lista.filter((i) => busca === '' || i.nome.toLowerCase().includes(busca));
    if (lista.length === 0) {
      tabela.replaceChildren(
        el('div', { class: 'isv-vazio' }, [
          icone('medalha', 34),
          el('b', {}, ['Nenhuma insígnia ainda']),
          el('span', {}, [podeCriar ? 'Crie a primeira: escolha o ícone, a raridade e como a galera ganha.' : 'Quem tem permissão pode criar as insígnias do grupo.']),
        ]),
      );
      return;
    }
    tabela.replaceChildren(
      el('div', { class: 'isv-linha isv-linha--cab', 'aria-hidden': 'true' }, [
        el('span', {}, [`Insígnia — ${lista.length}`]),
        el('span', {}, ['Raridade']),
        el('span', {}, ['Quem tem']),
        el('span', {}),
      ]),
      ...vistas.map((i) => {
        const cor = COR_DA_RARIDADE[i.raridade] ?? '#fff';
        const acoes: HTMLElement[] = [];
        if (confirmando === i.id) {
          const sim = el('button', { class: 'cg-confirma cg-confirma--sim', type: 'button' }, ['Apagar']);
          const nao = el('button', { class: 'cg-confirma', type: 'button' }, ['Cancelar']);
          nao.addEventListener('click', () => {
            confirmando = null;
            desenharLista();
          });
          sim.addEventListener('click', () => {
            sim.disabled = true;
            void apagarInsignia(opc.grupo.id, i.id)
              .then(() => showToast(`Insígnia "${i.nome}" apagada.`))
              .catch((e: unknown) => showToast(e instanceof Error ? e.message : 'Não deu para apagar.'))
              .finally(() => {
                confirmando = null;
                desenharLista();
              });
          });
          acoes.push(el('span', { class: 'cg-pergunta' }, ['Tira de todo mundo. Apagar?']), sim, nao);
        } else if (podeEditar) {
          const editar = el('button', { class: 'cg-acao', type: 'button', title: `Editar ${i.nome}`, 'aria-label': `Editar ${i.nome}` }, ['✎']);
          editar.addEventListener('click', () => abrirEditor(i));
          const apagar = el('button', { class: 'cg-acao', type: 'button', title: `Apagar ${i.nome}`, 'aria-label': `Apagar ${i.nome}` }, ['🗑']);
          apagar.addEventListener('click', () => {
            confirmando = i.id;
            desenharLista();
          });
          acoes.push(editar, apagar);
        }
        return el('div', { class: 'isv-linha', role: 'listitem', 'data-insignia': i.id }, [
          el('span', { class: 'isv-quem' }, [
            medalha(comoInsignia(i), 44),
            el('span', {}, [
              el('b', {}, [i.nome]),
              el('small', {}, [
                i.secreta ? el('span', { class: 'isv-tag' }, ['secreta']) : '',
                textoDoGatilho(i.gatilho, { canal: nomeDoCanal, cargo: nomeDoCargo }),
                i.limite > 0 ? ` · só ${i.limite}` : '',
                i.ate !== '' ? ` · até ${i.ate.slice(8, 10)}/${i.ate.slice(5, 7)}` : '',
              ]),
            ]),
          ]),
          el('span', { class: 'isv-rar', style: `color:${cor};border-color:${cor}55;background:${cor}14` }, [RARIDADES[i.raridade].nome]),
          el('span', { class: 'isv-qtd' }, [`👤 ${i.quantos}`]),
          el('span', { class: `isv-acoes${confirmando === i.id ? ' isv-acoes--confirma' : ''}` }, acoes),
        ]);
      }),
    );
  }

  /* ------------------------------ o editor ------------------------------ */

  function abrirEditor(def: InsigniaDoGrupo | null): void {
    const camada = raiz.closest('dialog') ?? document.body;
    const celular = window.matchMedia('(max-width: 720px)').matches;
    const r = {
      nome: def?.nome ?? '',
      desc: def?.desc ?? '',
      icone: def?.icone ?? 'estrela',
      raridade: def?.raridade ?? 'rara',
      gatilho: { ...(def?.gatilho ?? { tipo: 'mensagens' as TipoDeGatilho, alvo: 100 }) } as Gatilho,
      secreta: def?.secreta ?? false,
      limite: def?.limite ?? 0,
      ate: def?.ate ?? '',
      frase: '',
    };
    let aba = 'Todos';
    let buscaIcone = '';
    let listaAberta = false;
    let salvando = false;
    if (def !== null && def.gatilho.tipo === 'frase') {
      void fraseDaInsignia(opc.grupo.id, def.id).then((f) => {
        r.frase = f;
        desenharForm();
      });
    }

    const fundo = el('div', { class: 'isv-fundo' });
    const previa = el('aside', { class: 'isv-ed__previa' });
    const form = el('div', { class: 'isv-ed__rolo' });
    const erro = el('p', { class: 'settings__error', role: 'alert', hidden: true });
    const fecharBt = el('button', { class: 'isv-ed__x', type: 'button', 'aria-label': 'Fechar' }, [iconEl(closeIcon(16))]);
    const cancelar = el('button', { class: 'isv-ed__n', type: 'button' }, ['Cancelar']);
    const salvarBt = el('button', { class: 'isv-ed__s', type: 'button' }, [def === null ? 'Criar insígnia' : 'Salvar']);
    const caixa = el('div', { class: `isv-ed${celular ? ' isv-ed--celular' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': def === null ? 'Criar insígnia' : 'Editar insígnia' }, [
      previa,
      el('section', { class: 'isv-ed__form' }, [
        el('div', { class: 'isv-ed__topo' }, [
          el('div', {}, [el('h2', {}, [def === null ? 'Criar insígnia' : 'Editar insígnia']), el('div', { class: 'isv-ed__sub' }, [`${opc.grupo.name} · ${lista.length} de ${LIMITE_POR_GRUPO}`])]),
          fecharBt,
        ]),
        form,
        el('div', { class: 'isv-ed__pe' }, [erro, cancelar, salvarBt]),
      ]),
    ]);

    const fechar = (): void => {
      document.removeEventListener('keydown', tecla, true);
      fundo.remove();
      caixa.remove();
      criar.focus();
    };
    const tecla = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      if (listaAberta) {
        listaAberta = false;
        desenharForm();
        return;
      }
      fechar();
    };
    document.addEventListener('keydown', tecla, true);
    fundo.addEventListener('click', fechar);
    fecharBt.addEventListener('click', fechar);
    cancelar.addEventListener('click', fechar);

    function desenharPrevia(): void {
      const ins = comoInsignia({ ...(def ?? ({} as InsigniaDoGrupo)), id: def?.id ?? 'nova', nome: r.nome || 'Nome da insígnia', desc: r.desc, icone: r.icone, raridade: r.raridade, secreta: false, gatilho: r.gatilho } as InsigniaDoGrupo);
      const cor = COR_DA_RARIDADE[r.raridade] ?? '#fff';
      const como = textoDoGatilho(r.gatilho, { canal: nomeDoCanal, cargo: nomeDoCargo });
      if (celular) {
        previa.replaceChildren(
          medalha(ins, 74),
          el('div', {}, [
            el('b', { class: 'isv-ed__nome' }, [ins.nome]),
            el('span', { class: 'isv-ed__rar', style: `color:${cor};background:${cor}22;border-color:${cor}66` }, [RARIDADES[r.raridade].nome]),
            el('span', { class: 'isv-ed__desc' }, [r.desc || como]),
          ]),
        );
        return;
      }
      previa.replaceChildren(
        el('span', { class: 'isv-ed__rot' }, ['Prévia']),
        el('div', { class: 'isv-ed__palco' }, [
          medalha(ins, 150),
          el('b', { class: 'isv-ed__nome' }, [ins.nome]),
          el('span', { class: 'isv-ed__rar', style: `color:${cor};background:${cor}22;border-color:${cor}66` }, [RARIDADES[r.raridade].nome]),
          r.desc !== '' && el('p', {}, [r.desc]),
          el('span', { class: 'isv-ed__como' }, [icone(GATILHOS.find((g) => g.tipo === r.gatilho.tipo)?.icone ?? 'estrela', 16), como]),
          r.secreta && el('span', { class: 'isv-ed__secreta' }, ['Secreta: aparece como "?" até alguém ganhar']),
        ]),
        el('div', { class: 'isv-ed__mini' }, [
          el('span', { class: 'isv-ed__rot' }, ['Quem ganhar vê assim']),
          el('div', { class: 'isv-ed__aviso', style: `--c:${cor}` }, [
            medalha(ins, 52),
            el('div', {}, [el('small', {}, [`Insígnia nova · ${opc.grupo.name}`]), el('b', {}, [ins.nome]), el('span', {}, [r.desc || como])]),
          ]),
        ]),
      );
    }

    function campoTexto(id: string, valor: string, max: number, aoMudar: (v: string) => void, area = false): HTMLElement {
      const c = el(area ? 'textarea' : 'input', { class: 'isv-ed__in', id, maxlength: max, value: valor }) as HTMLInputElement;
      if (area) c.value = valor;
      c.addEventListener('input', () => {
        aoMudar(c.value);
        const cont = form.querySelector(`[data-conta="${id}"]`);
        if (cont !== null) cont.textContent = `${c.value.length}/${max}`;
        desenharPrevia();
      });
      return c;
    }

    function numeroEl(valor: number, aoMudar: (n: number) => void, rotulo: string, min = 1): HTMLElement {
      const c = el('input', { class: 'isv-ed__num', type: 'number', min, max: 1000000, value: String(valor), 'aria-label': rotulo }) as HTMLInputElement;
      c.addEventListener('input', () => {
        aoMudar(Math.max(0, Math.floor(Number(c.value) || 0)));
        desenharPrevia();
      });
      return c;
    }

    function selectEl(opcoes: Array<[string, string]>, valor: string, aoMudar: (v: string) => void, rotulo: string): HTMLElement {
      const s = el('select', { class: 'isv-ed__sel', 'aria-label': rotulo }, opcoes.map(([v, t]) => el('option', { value: v, selected: v === valor }, [t]))) as HTMLSelectElement;
      s.addEventListener('change', () => {
        aoMudar(s.value);
        desenharPrevia();
      });
      return s;
    }

    function linhaDoGatilho(): HTMLElement | false {
      const g = r.gatilho;
      const alvo = (rotulo: string): HTMLElement => numeroEl(g.alvo, (n) => (g.alvo = Math.max(1, n)), rotulo);
      const textos = opc.canais.filter((c) => c.kind === 'text');
      switch (g.tipo) {
        case 'mensagens':
          return el('div', { class: 'isv-ed__param' }, [
            'Ganha com',
            alvo('Quantas mensagens'),
            'mensagens em',
            selectEl([['', 'todos os canais'], ...textos.map((c): [string, string] => [c.id, `# ${c.name}`])], g.canal ?? '', (v) => {
              if (v === '') delete g.canal;
              else g.canal = v;
            }, 'Em qual canal'),
          ]);
        case 'midia':
          return el('div', { class: 'isv-ed__param' }, [
            'Ganha com',
            alvo('Quantas'),
            selectEl(Object.entries(NOMES_DAS_MIDIAS) as Array<[string, string]>, g.midia ?? 'fotos', (v) => (g.midia = v as MidiaDoGatilho), 'Tipo'),
          ]);
        case 'reacoes':
          return el('div', { class: 'isv-ed__param' }, ['Ganha com', alvo('Quantas reações'), 'reações recebidas']);
        case 'seguidos':
          return el('div', { class: 'isv-ed__param' }, ['Ganha com', alvo('Quantos dias'), 'dias seguidos conversando']);
        case 'voz':
          return el('div', { class: 'isv-ed__param' }, ['Ganha com', alvo('Quantas horas'), 'horas nas salas de voz do grupo']);
        case 'jogo': {
          const jogo = el('input', { class: 'isv-ed__in isv-ed__in--curto', placeholder: 'Ex.: Minecraft', value: g.jogo ?? '', maxlength: 60, 'aria-label': 'Qual jogo' }) as HTMLInputElement;
          jogo.addEventListener('input', () => {
            g.jogo = jogo.value;
            desenharPrevia();
          });
          return el('div', { class: 'isv-ed__param' }, ['Ganha com', alvo('Quantas horas'), 'horas de', jogo, 'junto com alguém do grupo']);
        }
        case 'membro':
          return el('div', { class: 'isv-ed__param' }, ['Ganha quem é membro há', alvo('Quantos dias'), 'dias']);
        case 'convites':
          return el('div', { class: 'isv-ed__param' }, ['Ganha quem convidou', alvo('Quantas pessoas'), 'pessoas que entraram']);
        case 'primeiros':
          return el('div', { class: 'isv-ed__param' }, ['Ganham os', alvo('Quantos primeiros'), 'primeiros membros do grupo']);
        case 'cargo':
          return el('div', { class: 'isv-ed__param' }, [
            'Ganha quem tem o cargo',
            selectEl([['', 'escolha…'], ...cargos.filter((c) => c.todos !== true).map((c): [string, string] => [c.id, c.nome])], g.cargo ?? '', (v) => {
              if (v === '') delete g.cargo;
              else g.cargo = v;
            }, 'Qual cargo'),
            el('small', {}, ['(perde se perder o cargo)']),
          ]);
        case 'frase': {
          const f = el('input', { class: 'isv-ed__in', placeholder: 'A frase que a pessoa tem que mandar', value: r.frase, maxlength: 80, 'aria-label': 'Frase secreta' }) as HTMLInputElement;
          f.addEventListener('input', () => (r.frase = f.value));
          return el('div', { class: 'isv-ed__param isv-ed__param--col' }, [f, el('small', {}, ['Só quem tem permissão de editar vê a frase. Vale sem acento e sem maiúscula.'])]);
        }
        default:
          return false;
      }
    }

    function desenharForm(): void {
      const rolagem = form.scrollTop;
      const todos = CATEGORIAS_DE_ICONES.flatMap(([, l]) => l);
      const daAba = aba === 'Todos' ? todos : (CATEGORIAS_DE_ICONES.find(([c]) => c === aba)?.[1] ?? todos);
      const vistos = buscaIcone === '' ? daAba : todos.filter((k) => k.includes(buscaIcone));
      const abas = ['Todos', ...CATEGORIAS_DE_ICONES.map(([c]) => c)].map((c) => {
        const b = el('button', { class: `isv-ed__aba${c === aba ? ' is-on' : ''}`, type: 'button', 'aria-pressed': String(c === aba) }, [c]);
        b.addEventListener('click', () => {
          aba = c;
          buscaIcone = '';
          desenharForm();
        });
        return b;
      });
      const procurar = el('input', { class: 'isv-ed__busca', type: 'search', placeholder: 'Procurar', value: buscaIcone, 'aria-label': 'Procurar ícone' }) as HTMLInputElement;
      procurar.addEventListener('input', () => {
        buscaIcone = procurar.value.trim().toLowerCase();
        desenharForm();
        form.querySelector<HTMLInputElement>('.isv-ed__busca')?.focus();
      });
      const grade = el(
        'div',
        { class: 'isv-ed__grade', role: 'radiogroup', 'aria-label': 'Ícone' },
        vistos.map((k) => {
          const b = el('button', { class: `isv-ed__ico${k === r.icone ? ' is-on' : ''}`, type: 'button', role: 'radio', 'aria-checked': String(k === r.icone), 'aria-label': k, title: k }, [icone(k)]);
          b.addEventListener('click', () => {
            r.icone = k;
            desenharForm();
          });
          return b;
        }),
      );
      const rars = el(
        'div',
        { class: 'isv-ed__rars', role: 'radiogroup', 'aria-label': 'Raridade' },
        RARIDADES_DO_SERVIDOR.map((k) => {
          const rr = RARIDADES[k];
          const b = el('button', { class: `isv-ed__rarbt${k === r.raridade ? ' is-on' : ''}`, type: 'button', role: 'radio', 'aria-checked': String(k === r.raridade), style: `--c:${COR_DA_RARIDADE[k]}` }, [
            el('i', { style: `background:linear-gradient(135deg,${rr.a},${rr.b})` }),
            rr.nome,
          ]);
          b.addEventListener('click', () => {
            r.raridade = k;
            desenharForm();
          });
          return b;
        }),
      );
      const atual = GATILHOS.find((g) => g.tipo === r.gatilho.tipo)!;
      const sel = el('button', { class: `isv-ed__como-bt${listaAberta ? ' is-on' : ''}`, type: 'button', 'aria-expanded': String(listaAberta), 'aria-haspopup': 'listbox' }, [
        el('span', { class: 'isv-ed__como-ic' }, [icone(atual.icone, 18)]),
        el('span', {}, [el('b', {}, [atual.nome]), el('small', {}, [r.gatilho.tipo === 'mao' ? 'Só quem tem a permissão dá' : 'O Loft confere sozinho'])]),
        el('span', { class: 'isv-ed__seta' }, ['▾']),
      ]);
      sel.addEventListener('click', () => {
        listaAberta = !listaAberta;
        desenharForm();
      });
      let grupoAtual = '';
      const listaDeGatilhos = listaAberta
        ? el(
            'div',
            { class: 'isv-ed__lista', role: 'listbox', 'aria-label': 'Como ganhar' },
            GATILHOS.flatMap((g) => {
              const itens: HTMLElement[] = [];
              if (g.grupo !== grupoAtual) {
                grupoAtual = g.grupo;
                itens.push(el('h6', {}, [g.grupo]));
              }
              const b = el('button', { class: `isv-ed__op${g.tipo === r.gatilho.tipo ? ' is-on' : ''}`, type: 'button', role: 'option', 'aria-selected': String(g.tipo === r.gatilho.tipo) }, [
                el('span', { class: 'isv-ed__como-ic' }, [icone(g.icone, 16)]),
                el('span', { class: 'isv-ed__op-nome' }, [g.nome]),
                el('small', {}, [g.desc]),
              ]);
              b.addEventListener('click', () => {
                const antes = r.gatilho;
                r.gatilho = { tipo: g.tipo, alvo: temAlvo(g.tipo) ? (antes.alvo > 0 ? antes.alvo : 10) : 1 };
                if (g.tipo === 'midia') r.gatilho.midia = 'fotos';
                listaAberta = false;
                desenharForm();
                desenharPrevia();
              });
              itens.push(b);
              return itens;
            }),
          )
        : false;
      const limite = numeroEl(r.limite, (n) => (r.limite = n), 'Só os primeiros', 0);
      const ate = el('input', { class: 'isv-ed__num isv-ed__data', type: 'date', value: r.ate, 'aria-label': 'Vale até' }) as HTMLInputElement;
      ate.addEventListener('change', () => (r.ate = ate.value));
      const secreta = el('button', { class: `isv-ed__sw${r.secreta ? ' is-on' : ''}`, type: 'button', role: 'switch', 'aria-checked': String(r.secreta), 'aria-label': 'Secreta' });
      secreta.addEventListener('click', () => {
        r.secreta = !r.secreta;
        desenharForm();
        desenharPrevia();
      });

      form.replaceChildren(
        el('div', { class: 'isv-ed__duas' }, [
          el('div', { class: 'isv-ed__campo' }, [
            el('label', { for: 'isv-nome' }, ['Nome', el('em', { 'data-conta': 'isv-nome' }, [`${r.nome.length}/24`])]),
            campoTexto('isv-nome', r.nome, 24, (v) => (r.nome = v)),
          ]),
          el('div', { class: 'isv-ed__campo' }, [
            el('label', { for: 'isv-desc' }, ['Descrição', el('em', { 'data-conta': 'isv-desc' }, [`${r.desc.length}/80`])]),
            campoTexto('isv-desc', r.desc, 80, (v) => (r.desc = v)),
          ]),
        ]),
        el('div', { class: 'isv-ed__campo' }, [
          el('span', { class: 'isv-ed__rotulo' }, ['Ícone', el('em', {}, [`${todos.length} desenhos`])]),
          el('div', { class: 'isv-ed__icones' }, [el('div', { class: 'isv-ed__abas' }, [...abas, procurar]), grade]),
        ]),
        el('div', { class: 'isv-ed__campo' }, [el('span', { class: 'isv-ed__rotulo' }, ['Raridade', el('em', {}, ['a cor vem dela'])]), rars]),
        el('div', { class: 'isv-ed__campo isv-ed__campo--como' }, [el('span', { class: 'isv-ed__rotulo' }, ['Como ganhar']), sel, listaDeGatilhos, linhaDoGatilho()]),
        el('div', { class: 'isv-ed__campo' }, [
          el('span', { class: 'isv-ed__rotulo' }, ['Opções']),
          el('div', { class: 'isv-ed__ops' }, [
            el('div', { class: 'isv-ed__op2' }, [el('span', {}, [el('b', {}, ['Secreta']), el('small', {}, ['Aparece como "?" até alguém ganhar'])]), secreta]),
            el('div', { class: 'isv-ed__op2' }, [el('span', {}, [el('b', {}, ['Só os primeiros ganham']), el('small', {}, ['Depois de X pessoas, ninguém mais ganha (0 = sem limite)'])]), limite]),
            el('div', { class: 'isv-ed__op2' }, [el('span', {}, [el('b', {}, ['Vale até']), el('small', {}, ['Bom para evento: depois da data, ninguém mais ganha'])]), ate]),
          ]),
        ]),
      );
      form.scrollTop = rolagem;
    }

    salvarBt.addEventListener('click', () => {
      if (salvando) return;
      erro.hidden = true;
      const g = r.gatilho;
      const problema =
        r.nome.trim() === ''
          ? 'Dê um nome para a insígnia.'
          : g.tipo === 'cargo' && g.cargo === undefined
            ? 'Escolha o cargo.'
            : g.tipo === 'jogo' && (g.jogo ?? '').trim() === ''
              ? 'Escreva qual jogo.'
              : g.tipo === 'frase' && r.frase.trim().length < 2 && def === null
                ? 'Escreva a frase secreta.'
                : temAlvo(g.tipo) && !(g.alvo >= 1)
                  ? 'A meta precisa ser 1 ou mais.'
                  : null;
      if (problema !== null) {
        erro.textContent = problema;
        erro.hidden = false;
        return;
      }
      salvando = true;
      salvarBt.disabled = true;
      salvarBt.textContent = 'Salvando…';
      void salvarInsignia(opc.grupo.id, def?.id ?? null, {
        nome: r.nome.trim(),
        desc: r.desc.trim(),
        icone: r.icone,
        raridade: r.raridade,
        gatilho: g,
        secreta: r.secreta,
        limite: r.limite,
        ate: r.ate,
        ...(g.tipo === 'frase' && r.frase.trim() !== '' ? { frase: r.frase.trim() } : {}),
      })
        .then(() => {
          showToast(def === null ? `Insígnia "${r.nome.trim()}" criada. Quem já cumpre ganha agora.` : 'Insígnia salva.');
          fechar();
        })
        .catch((e: unknown) => {
          erro.textContent = e instanceof Error ? e.message : 'Não deu para salvar.';
          erro.hidden = false;
          salvando = false;
          salvarBt.disabled = false;
          salvarBt.textContent = def === null ? 'Criar insígnia' : 'Salvar';
        });
    });

    desenharPrevia();
    desenharForm();
    camada.append(fundo, caixa);
    form.querySelector<HTMLInputElement>('#isv-nome')?.focus();
  }

  const pararInsignias = ouvirInsigniasDoGrupo(opc.grupo.id, (l) => {
    lista = l;
    carregou = true;
    desenharLista();
  });
  const pararCargos = ouvirCargos(
    opc.grupo.id,
    (c) => {
      cargos = c;
      desenharLista();
    },
    () => undefined,
  );
  desenharLista();
  return {
    raiz,
    parar: () => {
      pararInsignias();
      pararCargos();
    },
  };
}
