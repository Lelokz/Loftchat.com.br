import './figurinhas.css';

import { el } from '../../lib/dom';
import { desfavoritar, favoritas, ouvirFigurinhas, recentes } from '../../lib/figurinhas';
import type { Figurinha } from '../../lib/figurinhas';
import { escolherECriarFigurinha } from './criador';

/**
 * A ABA FIGURINHAS do painel (0.5.0): RECENTES em cima (as 10 últimas) e
 * FAVORITAS embaixo — e o primeiro quadrado das Favoritas é SEMPRE
 * "+ Criar figurinha". A coluna do lado leva a cada uma.
 */
export function montarAbaFigurinhas(onde: HTMLElement, aoEnviar: (f: Figurinha) => void): void {
  let editando = false;
  const trilho = el('nav', { class: 'painel__trilho', 'aria-label': 'Seções' });
  const lista = el('div', { class: 'painel__lista painel__lista--figurinhas scroll-area' });

  const irPara = (id: string): void => {
    lista.querySelector(`[data-secao="${id}"]`)?.scrollIntoView({ block: 'start' });
    for (const b of trilho.querySelectorAll<HTMLElement>('button')) b.classList.toggle('is-active', b.dataset['ir'] === id);
  };
  trilho.append(
    ...[
      { id: 'recentes', icone: '🕘', nome: 'Recentes' },
      { id: 'favoritas', icone: '⭐', nome: 'Favoritas' },
    ].map(({ id, icone, nome }) => {
      const b = el('button', { type: 'button', title: nome, 'data-ir': id }, [el('span', { class: 'emoji' }, [icone])]);
      b.addEventListener('click', () => irPara(id));
      return b;
    }),
  );

  function quadrinho(f: Figurinha, podeTirar: boolean): HTMLElement {
    const botao = el('button', { class: 'figurinhas__item', type: 'button', title: 'Mandar figurinha', 'data-figurinha': f.url }, [
      el('img', { src: f.url, alt: 'Figurinha', loading: 'lazy' }),
    ]);
    botao.addEventListener('click', () => aoEnviar(f));
    if (!podeTirar || !editando) return botao;
    const tirar = el('button', { class: 'figurinhas__tirar', type: 'button', title: 'Tirar das favoritas', 'aria-label': 'Tirar das favoritas' }, ['✕']);
    tirar.addEventListener('click', () => void desfavoritar(f.url));
    return el('div', { class: 'figurinhas__editavel' }, [botao, tirar]);
  }

  function desenhar(): void {
    if (!onde.isConnected && onde.childElementCount > 0) return;
    const criar = el('button', { class: 'figurinhas__item figurinhas__criar', type: 'button' }, [
      el('b', { 'aria-hidden': 'true' }, ['+']),
      el('span', {}, ['Criar figurinha']),
    ]);
    criar.addEventListener('click', () => escolherECriarFigurinha());
    const editar = el('button', { class: 'figurinhas__editar', type: 'button' }, [editando ? 'Pronto' : 'Editar']);
    editar.addEventListener('click', () => {
      editando = !editando;
      desenhar();
    });
    const rec = recentes();
    const fav = favoritas();
    lista.replaceChildren(
      el('section', { class: 'painel__secao', 'data-secao': 'recentes' }, [
        el('h3', { class: 'painel__titulo' }, ['Recentes']),
        rec.length === 0
          ? el('p', { class: 'figurinhas__vazio' }, ['As figurinhas que você mandar aparecem aqui.'])
          : el('div', { class: 'figurinhas__grade' }, rec.map((f) => quadrinho(f, false))),
      ]),
      el('section', { class: 'painel__secao', 'data-secao': 'favoritas' }, [
        el('div', { class: 'figurinhas__cabeca' }, [el('h3', { class: 'painel__titulo' }, ['Favoritas']), fav.length > 0 && editar]),
        el('div', { class: 'figurinhas__grade' }, [criar, ...fav.map((f) => quadrinho(f, true))]),
      ]),
    );
  }

  onde.replaceChildren(trilho, lista);
  desenhar();
  irPara('recentes');
  const parar = ouvirFigurinhas(() => {
    if (!onde.isConnected) {
      parar();
      return;
    }
    desenhar();
  });
}
