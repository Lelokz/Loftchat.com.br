import './update-bar.css';

import { el } from '../../lib/dom';
import type { LoftDesktop } from '../../lib/desktop';

/**
 * FAIXA DE ATUALIZAÇÃO (etapa 9d) — só no programa. Aparece quando a versão
 * nova já foi baixada por trás: "Reiniciar" fecha e reabre nela; "Depois"
 * só esconde (ela entra sozinha quando o programa fechar). Não é pop-up: não
 * rouba o foco nem tampa o que se está fazendo.
 */
export function ligarFaixaDeAtualizacao(desktop: LoftDesktop): void {
  let faixa: HTMLElement | null = null;

  const mostrar = (versao: string): void => {
    faixa?.remove();
    const reiniciar = el('button', { class: 'update-bar__reiniciar', type: 'button' }, ['Reiniciar']);
    const depois = el('button', { class: 'update-bar__depois', type: 'button' }, ['Depois']);
    reiniciar.addEventListener('click', () => {
      reiniciar.textContent = 'Reiniciando…';
      reiniciar.setAttribute('disabled', '');
      void desktop.atualizarAgora?.();
    });
    depois.addEventListener('click', () => {
      faixa?.remove();
      faixa = null;
    });
    faixa = el('div', { class: 'update-bar', role: 'status', 'aria-label': 'Atualização do Loftchat' }, [
      el('span', { class: 'update-bar__ponto', 'aria-hidden': 'true' }),
      el('span', { class: 'update-bar__texto' }, [
        el('b', {}, ['Atualização pronta']),
        ` · versão ${versao}`,
      ]),
      depois,
      reiniciar,
    ]);
    document.body.append(faixa);
  };

  desktop.aoAtualizacaoPronta?.(mostrar);
  // Já baixada antes de a página carregar (ex.: recarregou).
  void desktop.atualizacaoPronta?.().then((versao) => {
    if (versao) mostrar(versao);
  });
}
