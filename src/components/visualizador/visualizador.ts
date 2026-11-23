import './visualizador.css';

import { el, iconEl } from '../../lib/dom';
import { closeIcon } from '../../lib/icons';

/**
 * Imagem em tela cheia (0.5.0). É um <dialog>: Esc e o VOLTAR do Android
 * fecham, como as outras janelas. Clicar fora da imagem também.
 */
export function abrirVisualizador(url: string, descricao: string): void {
  const fechar = el('button', { class: 'visualizador__fechar icon-button', type: 'button', title: 'Fechar (Esc)' }, [
    iconEl(closeIcon(20)),
    el('span', { class: 'sr-only' }, ['Fechar']),
  ]);
  const imagem = el('img', { class: 'visualizador__img', src: url, alt: descricao });
  const janela = el('dialog', { class: 'visualizador', 'aria-label': 'Imagem' }, [fechar, imagem]) as HTMLDialogElement;
  const sair = (): void => {
    janela.close();
  };
  janela.addEventListener('close', () => janela.remove());
  janela.addEventListener('click', (evento) => {
    if (evento.target !== imagem) sair();
  });
  fechar.addEventListener('click', sair);
  document.body.append(janela);
  janela.showModal();
}
