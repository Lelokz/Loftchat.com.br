import './update-bar.css';

import { el } from '../../lib/dom';
import { aoMudarAtualizacao, estadoDaAtualizacao, instalarAtualizacao } from '../../lib/atualizacao';
import type { EstadoDaAtualizacao } from '../../lib/atualizacao';

/**
 * FAIXA DE ATUALIZAÇÃO — no programa (Windows e Linux) e no app Android.
 *
 * "Atualização disponível · versão X" com Depois e Atualizar. Atualizar: o
 * programa reinicia na versão nova; o Android baixa (a faixa mostra quanto) e
 * abre a tela de instalar. Depois: a faixa some até sair outra versão, o
 * Loftchat segue igual, e a atualização fica em Configurações → Sobre o
 * Loftchat. Não é pop-up: não rouba o foco nem tampa o que se está fazendo.
 */
export function ligarFaixaDeAtualizacao(): void {
  let faixa: HTMLElement | null = null;
  /** A versão que a pessoa mandou para "Depois". */
  let dispensada: string | null = null;

  const desenhar = (e: EstadoDaAtualizacao): void => {
    const mostrar = e.nova !== null && (e.pronta || e.progresso !== null) && e.nova !== dispensada;
    if (!mostrar) {
      faixa?.remove();
      faixa = null;
      return;
    }

    const baixando = e.progresso !== null && !(e.onde === 'pc' && e.pronta);
    const texto = el('span', { class: 'update-bar__texto' }, [
      el('b', {}, [baixando ? 'Baixando a atualização' : 'Atualização disponível']),
      baixando ? ` · versão ${e.nova} · ${e.progresso}%` : ` · versão ${e.nova}`,
    ]);

    const depois = el('button', { class: 'update-bar__depois', type: 'button' }, ['Depois']);
    depois.addEventListener('click', () => {
      dispensada = e.nova;
      desenhar(estadoDaAtualizacao());
    });

    const atualizar = el('button', { class: 'update-bar__reiniciar', type: 'button' }, [
      e.onde === 'pc' && e.progresso === 100 ? 'Reiniciando…' : 'Atualizar',
    ]);
    if (!e.pronta || e.progresso !== null) atualizar.setAttribute('disabled', '');
    atualizar.addEventListener('click', () => void instalarAtualizacao());

    const novo = el('div', { class: 'update-bar', role: 'status', 'aria-label': 'Atualização do Loftchat' }, [
      el('span', { class: 'update-bar__ponto', 'aria-hidden': 'true' }),
      texto,
      e.erro !== null && el('span', { class: 'update-bar__erro' }, [e.erro]),
      depois,
      atualizar,
    ]);
    if (faixa === null) {
      novo.classList.add('update-bar--entra');
      document.body.append(novo);
    } else faixa.replaceWith(novo);
    faixa = novo;
  };

  aoMudarAtualizacao(desenhar);
  desenhar(estadoDaAtualizacao());
}
