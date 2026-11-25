import { el, iconEl } from '../../lib/dom';
import { faceIcon } from '../../lib/icons';
import {
  CHANNEL_EMOJIS,
  channelSections,
  MAX_CATEGORIES,
  MAX_CATEGORY_NAME,
  MAX_CHANNEL_NAME,
  newCategoryId,
} from '../../lib/channel-layout';
import type { ChannelCategory } from '../../lib/channel-layout';
import type { Channel, ChannelKind } from '../../types/models';

/** O rascunho da tela "Canais": categorias na ordem, e cada canal como vai ficar. */
export interface ChannelsDraft {
  categories: ChannelCategory[];
  channels: Channel[];
}

/**
 * Posições renumeradas 0, 1, 2... dentro de cada lista (bloco × tipo), na
 * ordem da tela. Feito ao abrir e depois de cada movimento: assim "arrastei
 * e devolvi para o mesmo lugar" não conta como alteração.
 */
export function normalizeDraft(draft: ChannelsDraft): ChannelsDraft {
  const porId = new Map<string, Channel>();
  for (const bloco of channelSections(draft.channels, draft.categories)) {
    const cat = bloco.category?.id;
    for (const lista of [bloco.text, bloco.voice]) {
      lista.forEach((c, i) => {
        const novo: Channel = { ...c, position: i };
        if (cat === undefined) delete novo.categoryId;
        else novo.categoryId = cat;
        porId.set(c.id, novo);
      });
    }
  }
  return {
    categories: draft.categories.map((c) => ({ ...c })),
    channels: draft.channels.map((c) => porId.get(c.id) ?? c),
  };
}

export function draftsEqual(a: ChannelsDraft, b: ChannelsDraft): boolean {
  if (a.categories.length !== b.categories.length) return false;
  if (a.categories.some((c, i) => c.id !== b.categories[i]!.id || c.name.trim() !== b.categories[i]!.name.trim())) {
    return false;
  }
  const outros = new Map(b.channels.map((c) => [c.id, c]));
  return a.channels.every((c) => {
    const o = outros.get(c.id);
    return (
      o !== undefined &&
      o.name.trim() === c.name.trim() &&
      (o.emoji ?? '') === (c.emoji ?? '') &&
      (o.categoryId ?? '') === (c.categoryId ?? '') &&
      o.position === c.position
    );
  });
}

export interface ChannelsEditorOptions {
  draft: ChannelsDraft;
  /** O rascunho mudou: quem chama guarda, redesenha e atualiza a barra de salvar. */
  onChange: (draft: ChannelsDraft, refocus?: string) => void;
  /** Mudou só texto (nome): atualiza a barra sem redesenhar (o foco fica no campo). */
  onTextChange: () => void;
  /** 0.8.5: o que a pessoa pode mexer aqui (ausente = tudo). */
  pode?: { nomes: boolean; ordem: boolean; categorias: boolean };
  /** 0.8.5: abre as permissões de um canal ou de uma categoria (sem isto, o botão não aparece). */
  aoPermissoes?: (alvo: { canal: string } | { categoria: string; nome: string }) => void;
}

const ROTULO_TIPO: Record<ChannelKind, string> = { text: 'texto', voice: 'voz' };

/**
 * A SEÇÃO "CANAIS" das Configurações do grupo (etapa 3b): ordem arrastando
 * pela alça (mouse ou dedo), setas do teclado na alça como alternativa,
 * emoji e nome de cada canal, e as categorias (criar, renomear, subir,
 * descer, apagar — apagar devolve os canais para "Sem categoria").
 */
export function renderChannelsEditor(options: ChannelsEditorOptions): HTMLElement[] {
  const { draft, onChange, onTextChange } = options;

  function mudar(fn: (d: ChannelsDraft) => void, refocus?: string): void {
    const copia: ChannelsDraft = {
      categories: draft.categories.map((c) => ({ ...c })),
      channels: draft.channels.map((c) => ({ ...c })),
    };
    fn(copia);
    onChange(normalizeDraft(copia), refocus);
  }

  /** Põe o canal no FIM da lista do tipo dele no bloco `cat` ('' = sem categoria). */
  function moverParaBloco(id: string, cat: string): void {
    mudar((d) => {
      const canal = d.channels.find((c) => c.id === id);
      if (canal === undefined) return;
      if (cat === '') delete canal.categoryId;
      else canal.categoryId = cat;
      canal.position = 10_000;
    }, `alca-${id}`);
  }

  /** Lê a ordem que ficou na tela depois de arrastar. */
  function lerOrdem(raiz: HTMLElement): void {
    mudar((d) => {
      for (const lista of raiz.querySelectorAll<HTMLElement>('.gc-list')) {
        const cat = lista.dataset['cat'] ?? '';
        lista.querySelectorAll<HTMLElement>('.gc-row').forEach((row, i) => {
          const canal = d.channels.find((c) => c.id === row.dataset['id']);
          if (canal === undefined) return;
          if (cat === '') delete canal.categoryId;
          else canal.categoryId = cat;
          canal.position = i;
        });
      }
    });
  }

  /* --- uma linha de canal -------------------------------------------------- */

  function linha(canal: Channel, vizinhos: Channel[], raiz: () => HTMLElement): HTMLElement {
    const alca = el(
      'button',
      {
        class: 'gc-handle',
        type: 'button',
        id: `alca-${canal.id}`,
        'aria-label': `Mover ${canal.name}`,
        'aria-describedby': 'gc-dica',
        title: 'Arraste para mover (ou use as setas)',
      },
      ['⠿'],
    );

    // Teclado: setas sobem/descem dentro da lista.
    alca.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
      event.preventDefault();
      const i = vizinhos.findIndex((c) => c.id === canal.id);
      const j = event.key === 'ArrowUp' ? i - 1 : i + 1;
      if (j < 0 || j >= vizinhos.length) return;
      const outro = vizinhos[j]!;
      mudar((d) => {
        const a = d.channels.find((c) => c.id === canal.id)!;
        const b = d.channels.find((c) => c.id === outro.id)!;
        [a.position, b.position] = [b.position, a.position];
      }, `alca-${canal.id}`);
    });

    // Arrastar: o próprio item anda pela tela; ao soltar, a ordem é lida.
    // Os movimentos são ouvidos no DOCUMENTO, não na alça: mover a linha de
    // lugar no DOM solta a "captura" do ponteiro, e a alça deixaria de ouvir.
    alca.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      const row = alca.closest<HTMLElement>('.gc-row')!;
      const tipo = row.closest<HTMLElement>('.gc-list')!.dataset['kind'];
      const rolagem = row.closest<HTMLElement>('.settings__content');
      row.classList.add('is-dragging');
      let moveu = false;

      const mover = (e: PointerEvent): void => {
        // Perto da borda de cima/baixo, a lista rola sozinha.
        if (rolagem !== null) {
          const r = rolagem.getBoundingClientRect();
          if (e.clientY < r.top + 48) rolagem.scrollBy(0, -16);
          else if (e.clientY > r.bottom - 48) rolagem.scrollBy(0, 16);
        }
        const alvo = document.elementFromPoint(e.clientX, e.clientY);
        const lista = alvo?.closest<HTMLElement>(`.gc-list[data-kind="${tipo}"]`);
        if (lista === null || lista === undefined) return;
        const depois = [...lista.querySelectorAll<HTMLElement>('.gc-row')].find((r) => {
          if (r === row) return false;
          const caixa = r.getBoundingClientRect();
          return e.clientY < caixa.top + caixa.height / 2;
        });
        if (depois === undefined) {
          const ultimaLinha = [...lista.querySelectorAll<HTMLElement>('.gc-row')].pop();
          if (ultimaLinha !== row) lista.insertBefore(row, lista.querySelector('.gc-empty'));
        } else if (depois.previousElementSibling !== row) {
          lista.insertBefore(row, depois);
        }
        moveu = true;
      };
      const soltar = (): void => {
        document.removeEventListener('pointermove', mover);
        document.removeEventListener('pointerup', soltar);
        document.removeEventListener('pointercancel', soltar);
        row.classList.remove('is-dragging');
        if (moveu) lerOrdem(raiz());
      };
      document.addEventListener('pointermove', mover);
      document.addEventListener('pointerup', soltar);
      document.addEventListener('pointercancel', soltar);
    });

    /* emoji */
    const emojiBotao = el('button', {
      class: 'settings__emoji-button gc-emoji',
      type: 'button',
      'aria-label': canal.emoji === undefined ? `Escolher emoji de ${canal.name}` : `Emoji de ${canal.name}: ${canal.emoji}. Trocar`,
      'aria-expanded': 'false',
    });
    if (canal.emoji === undefined) emojiBotao.append(iconEl(faceIcon(18)));
    else emojiBotao.textContent = canal.emoji;
    const grade = el('div', { class: 'settings__emojis gc-emojis', role: 'group', 'aria-label': `Emojis para ${canal.name}` });
    grade.hidden = true;
    const escolher = (emoji: string): void =>
      mudar((d) => {
        const c = d.channels.find((x) => x.id === canal.id)!;
        if (emoji === '') delete c.emoji;
        else c.emoji = emoji;
      }, `alca-${canal.id}`);
    for (const emoji of CHANNEL_EMOJIS) {
      const b = el('button', { class: 'settings__emoji', type: 'button', 'aria-pressed': String(canal.emoji === emoji) }, [emoji]);
      b.addEventListener('click', () => escolher(emoji));
      grade.append(b);
    }
    if (canal.emoji !== undefined) {
      const sem = el('button', { class: 'settings__link settings__emojis-none', type: 'button' }, ['Sem emoji']);
      sem.addEventListener('click', () => escolher(''));
      grade.append(sem);
    }
    emojiBotao.addEventListener('click', () => {
      grade.hidden = !grade.hidden;
      emojiBotao.setAttribute('aria-expanded', String(!grade.hidden));
    });

    /* nome */
    const nome = el('input', {
      class: 'settings__input gc-name',
      type: 'text',
      maxlength: MAX_CHANNEL_NAME,
      'aria-label': `Nome do canal ${canal.name}`,
    });
    nome.value = canal.name;
    nome.addEventListener('input', () => {
      const c = draft.channels.find((x) => x.id === canal.id)!;
      c.name = nome.value;
      nome.toggleAttribute('aria-invalid', nome.value.trim() === '');
      onTextChange();
    });

    /* categoria */
    const categoria = el('select', { class: 'settings__input settings__select gc-cat', 'aria-label': `Categoria de ${canal.name}` }, [
      el('option', { value: '' }, ['Sem categoria']),
      ...draft.categories.map((c) => el('option', { value: c.id }, [c.name.trim() || 'Sem nome'])),
    ]);
    categoria.value = canal.categoryId ?? '';
    categoria.addEventListener('change', () => moverParaBloco(canal.id, categoria.value));

    return el('li', { class: 'gc-row', 'data-id': canal.id }, [
      el('div', { class: 'gc-row-main' }, [
        alca,
        emojiBotao,
        nome,
        el('span', { class: 'gc-kind' }, [canal.kind === 'voice' ? '🔊' : '#']),
        categoria,
        ...(options.aoPermissoes === undefined
          ? []
          : [
              (() => {
                const b = el('button', { class: 'gc-perms', type: 'button', title: `Permissões de ${canal.name}`, 'aria-label': `Permissões de ${canal.name}` }, ['🔒']);
                b.addEventListener('click', () => options.aoPermissoes?.({ canal: canal.id }));
                return b;
              })(),
            ]),
      ]),
      grade,
    ]);
  }

  /* --- os blocos ----------------------------------------------------------- */

  let raizEl: HTMLElement | null = null;
  const raiz = (): HTMLElement => raizEl!;

  const blocos = channelSections(draft.channels, draft.categories).map((bloco, indice) => {
    const cat = bloco.category;
    const listas = (['text', 'voice'] as const).map((kind) => {
      const canais = kind === 'text' ? bloco.text : bloco.voice;
      return el('div', { class: 'gc-kind-block' }, [
        el('span', { class: 'gc-kind-label' }, [ROTULO_TIPO[kind]]),
        el('ul', { class: 'gc-list', 'data-kind': kind, 'data-cat': cat?.id ?? '' }, [
          ...canais.map((c) => linha(c, canais, raiz)),
          el('li', { class: 'gc-empty' }, [`Nenhum canal de ${ROTULO_TIPO[kind]} aqui. Arraste um para cá.`]),
        ]),
      ]);
    });

    let cabeca: HTMLElement;
    if (cat === null) {
      cabeca = el('div', { class: 'gc-head' }, [el('h3', { class: 'gc-title' }, ['Sem categoria'])]);
    } else {
      const nome = el('input', {
        class: 'settings__input gc-cat-name',
        type: 'text',
        maxlength: MAX_CATEGORY_NAME,
        'aria-label': 'Nome da categoria',
      });
      nome.value = cat.name;
      nome.addEventListener('input', () => {
        draft.categories.find((c) => c.id === cat.id)!.name = nome.value;
        nome.toggleAttribute('aria-invalid', nome.value.trim() === '');
        // O nome novo já aparece nos seletores "Categoria de…" das linhas.
        for (const opcao of raiz().querySelectorAll<HTMLOptionElement>(`.gc-cat option[value="${cat.id}"]`)) {
          opcao.textContent = nome.value.trim() || 'Sem nome';
        }
        onTextChange();
      });
      const botao = (rotulo: string, aria: string, acao: () => void, desligado = false): HTMLButtonElement => {
        const b = el('button', { class: 'settings__link', type: 'button', 'aria-label': aria }, [rotulo]);
        b.disabled = desligado;
        b.addEventListener('click', acao);
        return b;
      };
      const pos = indice - 1;
      const trocar = (de: number, para: number): void =>
        mudar((d) => {
          const [item] = d.categories.splice(de, 1);
          d.categories.splice(para, 0, item!);
        });
      cabeca = el('div', { class: 'gc-head' }, [
        nome,
        el('span', { class: 'gc-head-actions' }, [
          ...(options.aoPermissoes === undefined
            ? []
            : [botao('Permissões', `Permissões da categoria ${cat.name}`, () => options.aoPermissoes?.({ categoria: cat.id, nome: cat.name.trim() || 'Sem nome' }))]),
          botao('Subir', `Subir a categoria ${cat.name}`, () => trocar(pos, pos - 1), pos === 0),
          botao('Descer', `Descer a categoria ${cat.name}`, () => trocar(pos, pos + 1), pos === draft.categories.length - 1),
          botao('Apagar', `Apagar a categoria ${cat.name}`, () =>
            mudar((d) => {
              d.categories = d.categories.filter((c) => c.id !== cat.id);
              for (const c of d.channels) {
                if (c.categoryId === cat.id) {
                  delete c.categoryId;
                  c.position = 10_000 + c.position;
                }
              }
            }),
          ),
        ]),
      ]);
    }
    return el('section', { class: 'gc-block', 'aria-label': cat === null ? 'Sem categoria' : `Categoria ${cat.name}` }, [
      cabeca,
      ...listas,
    ]);
  });

  const nova = el('button', { class: 'settings__button gc-new', type: 'button' }, ['Nova categoria']);
  nova.disabled = draft.categories.length >= MAX_CATEGORIES;
  nova.addEventListener('click', () => {
    const id = newCategoryId();
    mudar((d) => {
      d.categories.push({ id, name: 'Nova categoria' });
    }, `cat-nova`);
  });

  raizEl = el('div', { class: 'gc-blocks' }, blocos);
  // 0.8.5: o que a pessoa não pode, fica travado (o banco recusaria).
  const pode = options.pode ?? { nomes: true, ordem: true, categorias: true };
  if (!pode.nomes) for (const x of raizEl.querySelectorAll<HTMLInputElement | HTMLButtonElement>('.gc-name, .gc-emoji')) x.disabled = true;
  if (!pode.ordem) {
    for (const x of raizEl.querySelectorAll<HTMLElement>('.gc-handle')) x.hidden = true;
    for (const x of raizEl.querySelectorAll<HTMLSelectElement>('.gc-cat')) x.disabled = true;
  }
  if (!pode.categorias) {
    for (const x of raizEl.querySelectorAll<HTMLInputElement>('.gc-cat-name')) x.disabled = true;
    for (const x of raizEl.querySelectorAll<HTMLElement>('.gc-head-actions')) x.hidden = true;
    nova.hidden = true;
  }

  return [
    el('header', { class: 'settings__header' }, [
      el('h2', { class: 'settings__title' }, ['Canais']),
      el('p', { class: 'settings__subtitle' }, ['Emoji, nome, ordem e categorias. Vale para todo mundo do grupo.']),
    ]),
    el('p', { class: 'settings__help', id: 'gc-dica' }, [
      'Arraste pela alça ⠿ para mudar a ordem ou de categoria. No teclado: as setas na alça sobem e descem.',
    ]),
    raizEl,
    el('div', { class: 'gc-foot' }, [
      nova,
      el('span', { class: 'settings__help' }, [`Até ${MAX_CATEGORIES} categorias. Categoria vazia não aparece na coluna de canais.`]),
    ]),
  ];
}
