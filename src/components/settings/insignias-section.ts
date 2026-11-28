import { doc, updateDoc } from 'firebase/firestore';

import { el } from '../../lib/dom';
import { db } from '../../lib/firebase';
import { publicProfile } from '../../lib/friends';
import { abaInsignias, ouvirInsignias } from '../insignias/insignias-ui';
import type { DadosDeInsignias } from '../insignias/insignias-ui';
import { insigniasDoCartao } from '../perfil-completo/perfil-completo';
import { showToast } from '../toast/toast';

/**
 * 0.14.0 INSÍGNIAS NAS CONFIGURAÇÕES (ideia do Arthur). Antes era Perfil →
 * Perfil completo → Insígnias: muito caminho. Aqui ficam as mesmas
 * insígnias da aba do perfil completo (as que tem, as que faltam, quanto
 * falta) e o "Escolher as do cartão".
 */
export interface SecaoDeInsignias {
  elementos: HTMLElement[];
  parar: () => void;
}

export function renderInsigniasSection(uid: string): SecaoDeInsignias {
  const celular = matchMedia('(max-width: 720px)').matches;
  const corpo = el('div', { class: 'settings-insignias' }, [el('p', { class: 'settings__help' }, ['Carregando suas insígnias…'])]);
  let dados: DadosDeInsignias | null = null;
  let noCartao: string[] | undefined;
  let escolhendo = false;
  let escolha: string[] = [];

  function barra(): HTMLElement {
    if (!escolhendo) {
      const b = el('button', { class: 'pfc__escolher', type: 'button' }, ['Escolher as do cartão']);
      b.addEventListener('click', () => {
        escolhendo = true;
        escolha = insigniasDoCartao(noCartao, dados);
        desenhar();
      });
      return el('div', { class: 'pfc__escolha' }, [el('span', {}, ['Até 5 aparecem no seu cartão.']), b]);
    }
    const pronto = el('button', { class: 'pfc__escolher is-on', type: 'button' }, ['Pronto']);
    pronto.addEventListener('click', () => {
      escolhendo = false;
      const lista = escolha.slice(0, 5);
      void updateDoc(doc(db, 'users', uid), { insigniasNoCartao: lista }).then(
        () => {
          noCartao = lista;
          showToast('Insígnias do cartão salvas.');
          desenhar();
        },
        () => showToast('Não deu para salvar. Confira a internet.'),
      );
    });
    return el('div', { class: 'pfc__escolha is-escolhendo' }, [el('span', {}, [`Toque nas que você tem · ${escolha.length} de 5`]), pronto]);
  }

  function desenhar(): void {
    if (dados === null) return;
    const conteudo = abaInsignias(dados, celular);
    conteudo.prepend(barra());
    if (escolhendo) {
      conteudo.classList.add('ins-aba--escolhendo');
      for (const item of conteudo.querySelectorAll<HTMLElement>('.ins-grade__item')) {
        const id = item.dataset['insignia'] ?? '';
        if (!dados.tem.has(id)) continue;
        item.classList.add('is-escolhivel');
        item.classList.toggle('is-escolhida', escolha.includes(id));
        item.addEventListener(
          'click',
          (e) => {
            e.stopImmediatePropagation();
            if (escolha.includes(id)) escolha = escolha.filter((x) => x !== id);
            else if (escolha.length < 5) escolha = [...escolha, id];
            desenhar();
          },
          true,
        );
      }
    }
    corpo.replaceChildren(conteudo);
  }

  void publicProfile(uid)
    .then((p) => {
      noCartao = p?.insigniasNoCartao;
    })
    .catch(() => undefined);
  const parar = ouvirInsignias(uid, (d) => {
    dados = d;
    if (!escolhendo) desenhar();
  });

  return {
    elementos: [
      el('header', { class: 'settings__header' }, [
        el('h2', { class: 'settings__title' }, ['Insígnias']),
        el('p', { class: 'settings__subtitle' }, ['As que você já ganhou e as que faltam. Passe o mouse (ou toque) numa para ver como ganhar.']),
      ]),
      corpo,
    ],
    parar,
  };
}
