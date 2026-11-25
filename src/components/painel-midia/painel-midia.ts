import './painel-midia.css';

import { el } from '../../lib/dom';
import {
  AMOSTRAS_DE_TOM,
  carregarEmojis,
  emojisRecentes,
  mudarTomDePele,
  noTom,
  semAcento,
  tomDePele,
  usouEmoji,
} from '../../lib/emojis';
import type { Categoria } from '../../lib/emojis';

/**
 * O PAINEL do botão de figurinha (0.5.0): abas Emojis | Figurinhas | GIFs
 * (em breve). As categorias ficam numa coluna do lado; clicar nelas leva
 * até a seção.
 */

export type AbaDoPainel = 'emojis' | 'figurinhas';

export interface PainelProps {
  aoEmoji: (emoji: string) => void;
  /** Monta a aba de figurinhas dentro do elemento (src/components/figurinhas). */
  montarFigurinhas?: (onde: HTMLElement) => void;
}

export interface Painel {
  element: HTMLElement;
  abrir(aba?: AbaDoPainel): void;
  fechar(): void;
  aberto(): boolean;
}

let ultimaAba: AbaDoPainel = 'emojis';

export function renderPainel(props: PainelProps): Painel {
  const corpo = el('div', { class: 'painel__corpo' });
  const abaEmojis = el('button', { class: 'painel__aba', type: 'button', role: 'tab' }, ['Emojis']);
  const abaFigurinhas = el('button', { class: 'painel__aba', type: 'button', role: 'tab' }, ['Figurinhas']);
  const abaGifs = el('button', { class: 'painel__aba', type: 'button', role: 'tab', disabled: '' }, [
    'GIFs',
    el('small', {}, ['em breve']),
  ]);
  const element = el('div', { class: 'painel', role: 'dialog', 'aria-label': 'Emojis e figurinhas' }, [
    el('div', { class: 'painel__abas', role: 'tablist' }, [abaEmojis, abaFigurinhas, abaGifs]),
    corpo,
  ]);
  element.hidden = true;

  function mostrar(aba: AbaDoPainel): void {
    ultimaAba = aba;
    abaEmojis.classList.toggle('is-active', aba === 'emojis');
    abaFigurinhas.classList.toggle('is-active', aba === 'figurinhas');
    abaEmojis.setAttribute('aria-selected', String(aba === 'emojis'));
    abaFigurinhas.setAttribute('aria-selected', String(aba === 'figurinhas'));
    if (aba === 'emojis') {
      corpo.replaceChildren(montarEmojis(props.aoEmoji));
    } else {
      const onde = el('div', { class: 'painel__figurinhas' });
      corpo.replaceChildren(onde);
      props.montarFigurinhas?.(onde);
    }
  }
  abaEmojis.addEventListener('click', () => mostrar('emojis'));
  abaFigurinhas.addEventListener('click', () => mostrar('figurinhas'));

  return {
    element,
    abrir(aba = ultimaAba) {
      element.hidden = false;
      mostrar(aba);
    },
    fechar() {
      element.hidden = true;
      corpo.replaceChildren();
    },
    aberto: () => !element.hidden,
  };
}

/* --------------------------------- emojis --------------------------------- */

export function montarEmojis(aoEmoji: (e: string) => void): HTMLElement {
  const trilho = el('nav', { class: 'painel__trilho', 'aria-label': 'Categorias' });
  const busca = el('input', {
    class: 'painel__busca',
    type: 'search',
    placeholder: 'Buscar emoji (ex.: risada, coração)',
    'aria-label': 'Buscar emoji',
  });
  const botaoTom = el('button', { class: 'painel__tom', type: 'button', title: 'Tom de pele', 'aria-label': 'Tom de pele' }, [
    el('span', { class: 'emoji' }, [AMOSTRAS_DE_TOM[tomDePele()]!]),
  ]);
  const tons = el(
    'div',
    { class: 'painel__tons', role: 'group', 'aria-label': 'Tom de pele' },
    AMOSTRAS_DE_TOM.map((amostra, i) => {
      const b = el('button', { type: 'button', title: i === 0 ? 'Padrão' : `Tom ${i}` }, [
        el('span', { class: 'emoji' }, [amostra]),
      ]);
      b.addEventListener('click', () => {
        mudarTomDePele(i);
        botaoTom.firstElementChild!.textContent = amostra;
        tons.hidden = true;
        desenhar();
      });
      return b;
    }),
  );
  tons.hidden = true;
  botaoTom.addEventListener('click', () => {
    tons.hidden = !tons.hidden;
  });

  const lista = el('div', { class: 'painel__lista scroll-area' }, [
    el('p', { class: 'painel__carregando' }, ['Carregando emojis…']),
  ]);
  const conteudo = el('div', { class: 'painel__conteudo' }, [
    el('div', { class: 'painel__topo' }, [busca, botaoTom]),
    tons,
    lista,
  ]);

  let categorias: Categoria[] = [];

  function botaoDoEmoji(e: string, nome: string): HTMLElement {
    return el('button', { class: 'painel__emoji', type: 'button', title: nome, 'data-emoji': e }, [
      el('span', { class: 'emoji' }, [e]),
    ]);
  }

  function secao(id: string, titulo: string, botoes: HTMLElement[]): HTMLElement {
    return el('section', { class: 'painel__secao', 'data-secao': id }, [
      el('h3', { class: 'painel__titulo' }, [titulo]),
      el('div', { class: 'painel__grade' }, botoes),
    ]);
  }

  function desenhar(): void {
    const tom = tomDePele();
    const termo = semAcento(busca.value.trim());
    if (termo !== '') {
      const achados = categorias.flatMap((c) => c.emojis).filter((x) => x.busca.includes(termo));
      lista.replaceChildren(
        achados.length === 0
          ? el('p', { class: 'painel__carregando' }, ['Nenhum emoji com esse nome.'])
          : secao('busca', 'Resultados', achados.slice(0, 200).map((x) => botaoDoEmoji(noTom(x, tom), x.nome))),
      );
      return;
    }
    const recentes = emojisRecentes();
    lista.replaceChildren(
      ...(recentes.length > 0 ? [secao('recentes', 'Recentes', recentes.map((e) => botaoDoEmoji(e, e)))] : []),
      ...categorias.map((c) => secao(c.id, c.nome, c.emojis.map((x) => botaoDoEmoji(noTom(x, tom), x.nome)))),
    );
  }

  function irPara(id: string): void {
    busca.value = '';
    desenhar();
    lista.querySelector(`[data-secao="${id}"]`)?.scrollIntoView({ block: 'start' });
    marcar(id);
  }

  function marcar(id: string): void {
    for (const b of trilho.querySelectorAll<HTMLElement>('button')) b.classList.toggle('is-active', b.dataset['ir'] === id);
  }

  lista.addEventListener('click', (evento) => {
    const alvo = (evento.target as HTMLElement).closest<HTMLElement>('[data-emoji]');
    const emoji = alvo?.dataset['emoji'];
    if (emoji === undefined) return;
    usouEmoji(emoji);
    aoEmoji(emoji);
  });
  // A coluna do lado acompanha onde a lista está.
  lista.addEventListener(
    'scroll',
    () => {
      const topo = lista.getBoundingClientRect().top + 8;
      let atual = '';
      for (const s of lista.querySelectorAll<HTMLElement>('[data-secao]')) {
        if (s.getBoundingClientRect().top <= topo) atual = s.dataset['secao'] ?? '';
      }
      if (atual !== '') marcar(atual);
    },
    { passive: true },
  );
  busca.addEventListener('input', desenhar);

  void carregarEmojis().then((lidas) => {
    categorias = lidas;
    const itens = [{ id: 'recentes', nome: 'Recentes', icone: '🕘' }, ...lidas];
    trilho.replaceChildren(
      ...itens.map((c) => {
        const b = el('button', { type: 'button', title: c.nome, 'data-ir': c.id }, [el('span', { class: 'emoji' }, [c.icone])]);
        b.addEventListener('click', () => irPara(c.id));
        return b;
      }),
    );
    desenhar();
    marcar(emojisRecentes().length > 0 ? 'recentes' : 'rostos');
  });

  return el('div', { class: 'painel__emojis' }, [trilho, conteudo]);
}
