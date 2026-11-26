import './jogos.css';

import { avatarEl, el, iconEl } from '../../lib/dom';
import { controllerIcon, cubeIcon } from '../../lib/icons';
import { haQuantoTempo } from '../../lib/jogando';
import type { Jogando } from '../../lib/jogando';
import type { JogoDoPerfil, JogosDoPerfil } from '../../lib/jogos-perfil';

/**
 * PEDAÇOS DE TELA DOS JOGOS (0.12.0): a capa, o "Jogando…" da lista de
 * membros, os blocos do cartão/perfil e a seção da aba Agora.
 */

/** A capa vertical do jogo; sem imagem, um cubo com o nome. */
export function capaDoJogo(jogo: { nome: string; capa?: string | undefined }, largura: number, altura: number, classe = ''): HTMLElement {
  const estilo = `width:${largura}px;height:${altura}px`;
  if (jogo.capa !== undefined && jogo.capa !== '') {
    const img = el('img', { class: `jg-capa ${classe}`, src: jogo.capa, alt: '', style: estilo, title: jogo.nome, draggable: 'false' });
    // Capa que não abre vira o cubo (sem ícone quebrado na tela).
    img.addEventListener('error', () => img.replaceWith(capaDoJogo({ nome: jogo.nome }, largura, altura, classe)), { once: true });
    return img;
  }
  return el('span', { class: `jg-capa jg-capa--sem ${classe}`, style: estilo, title: jogo.nome }, [
    iconEl(cubeIcon(Math.round(largura * 0.4)), 'jg-capa__cubo'),
    // O nome só cabe nas capas maiores (nas pequenas quebrava no meio da palavra).
    largura >= 60 && el('b', {}, [jogo.nome]),
  ]);
}

/** "🎮 Jogando Lethal Company" — embaixo do nome na lista de membros. */
export function linhaJogando(jogo: Jogando | null): HTMLElement | false {
  if (jogo === null) return false;
  return el('span', { class: 'jg-jogando', title: `Jogando ${jogo.nome}` }, [
    iconEl(controllerIcon(13), 'jg-jogando__icone'),
    'Jogando ',
    el('b', {}, [jogo.nome]),
  ]);
}

/** O bloco "Jogando agora" (cartão e perfil). */
export function blocoJogandoAgora(jogo: Jogando, grande = false, celular = false): HTMLElement {
  return el('div', { class: `jg-sec${grande ? ' jg-sec--grande' : ''}` }, [
    el('h4', { class: 'jg-sec__titulo' }, ['Jogando agora']),
    el('div', { class: 'jg-agora' }, [
      capaDoJogo(jogo, grande ? (celular ? 52 : 60) : 46, grande ? (celular ? 70 : 80) : 62),
      el('div', { class: 'jg-agora__txt' }, [
        el('b', {}, [jogo.nome]),
        el('small', { class: 'jg-agora__tempo', 'data-desde': String(jogo.desde) }, [haQuantoTempo(jogo.desde)]),
        el('em', {}, [jogo.loja === null ? 'no PC' : `no PC · ${jogo.loja}`]),
      ]),
    ]),
  ]);
}

/** Favorito + "jogando ultimamente" (+ "quero jogar" no perfil completo). */
export function blocosDosJogos(jogos: JogosDoPerfil | undefined, completo: boolean, celular = false): HTMLElement[] {
  if (jogos === undefined) return [];
  const blocos: HTMLElement[] = [];
  const fav = jogos.favorito;
  if (fav !== undefined) {
    blocos.push(
      el('div', { class: `jg-sec${completo ? ' jg-sec--grande' : ''}` }, [
        el('h4', { class: 'jg-sec__titulo' }, ['Jogo favorito']),
        el('div', { class: 'jg-fav' }, [
          capaDoJogo(fav, completo ? (celular ? 76 : 96) : 58, completo ? (celular ? 102 : 130) : 78),
          el('div', {}, [el('b', {}, [fav.nome]), fav.nota !== '' && el('q', {}, [fav.nota])]),
        ]),
      ]),
    );
  }
  if (jogos.ultimamente.length > 0) {
    blocos.push(
      el('div', { class: `jg-sec${completo ? ' jg-sec--grande' : ''}` }, [
        el('h4', { class: 'jg-sec__titulo' }, ['Jogando ultimamente']),
        el(
          'div',
          { class: `jg-fila${completo ? ' jg-fila--grande' : ''}` },
          jogos.ultimamente.map((j) => itemDaFila(j, completo, celular)),
        ),
      ]),
    );
  }
  if (completo && jogos.quero.length > 0) {
    blocos.push(
      el('div', { class: 'jg-sec jg-sec--grande' }, [
        el('h4', { class: 'jg-sec__titulo' }, [`Quero jogar · ${jogos.quero.length}`]),
        el('div', { class: 'jg-fila jg-fila--quero' }, jogos.quero.map((j) => capaDoJogo(j, celular ? 50 : 60, celular ? 68 : 82))),
      ]),
    );
  }
  return blocos;
}

function itemDaFila(j: JogoDoPerfil, completo: boolean, celular: boolean): HTMLElement {
  if (!completo) return capaDoJogo(j, 50, 70);
  return el('div', { class: 'jg-fila__item' }, [
    capaDoJogo(j, celular ? 64 : 92, celular ? 86 : 124),
    ...(j.etiquetas ?? []).slice(0, 2).map((t) => el('span', { class: 'jg-etq' }, [t])),
  ]);
}

export interface PessoaJogando {
  uid: string;
  nome: string;
  initials: string;
  photo?: string | undefined;
  jogo: Jogando;
}

/** Aba Agora: "Jogando agora — 2", quem do grupo está jogando o quê. */
export function secaoJogandoAgora(pessoas: PessoaJogando[]): HTMLElement | false {
  if (pessoas.length === 0) return false;
  return el('section', { class: 'jg-ag' }, [
    el('h4', { class: 'jg-ag__titulo' }, [`Jogando agora — ${pessoas.length}`]),
    el(
      'ul',
      { class: 'jg-ag__lista' },
      pessoas.map((p) =>
        el('li', { class: 'jg-ag__pessoa', 'data-profile-uid': p.uid, tabindex: 0 }, [
          avatarEl(p.initials, 'sm', 'jg-ag__foto', p.photo, p.uid),
          el('div', { class: 'jg-ag__txt' }, [
            el('b', {}, [p.nome]),
            el('span', { class: 'jg-ag__jogo' }, [p.jogo.nome]),
            el('span', {}, [`${p.jogo.loja === null ? '' : `${p.jogo.loja} · `}${haQuantoTempo(p.jogo.desde)}`]),
          ]),
          capaDoJogo(p.jogo, 36, 48),
        ]),
      ),
    ),
  ]);
}
