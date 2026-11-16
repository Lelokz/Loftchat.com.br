import './screen-picker.css';

import { el } from '../../lib/dom';
import type { FonteDeTela, LoftDesktop } from '../../lib/desktop';
import { openModal } from '../modal/modal';

/**
 * Seletor de tela da JANELA do Loft (app de computador).
 *
 * No navegador quem escolhe a tela é o próprio navegador; na janela não existe
 * seletor nenhum, então o Loft mostra o dele. Resolve `true` depois de avisar a
 * janela da escolha, e `false` se a pessoa desistiu.
 */
export function openScreenPicker(desktop: LoftDesktop): Promise<boolean> {
  return new Promise((resolve) => {
    let escolheu = false;
    const corpo = el('div', { class: 'screen-picker' }, [
      el('p', { class: 'modal__note' }, ['Procurando telas e janelas…']),
    ]);

    const controller = openModal({
      title: 'Compartilhar tela',
      description: 'Escolha o que os outros vão ver.',
      body: corpo,
      confirmLabel: 'Transmitir',
      busyLabel: 'Começando…',
      confirmDisabled: true,
      wide: true,
      onClose: () => resolve(escolheu),
      async onConfirm(ctrl) {
        const marcada = corpo.querySelector<HTMLInputElement>('input[name="fonte"]:checked');
        if (marcada === null) return;
        await desktop.escolherFonte(marcada.value);
        escolheu = true;
        ctrl.close();
      },
    });

    void desktop
      .fontesDeTela()
      .then((fontes) => {
        if (fontes.length === 0) {
          corpo.replaceChildren(
            el('p', { class: 'modal__note' }, ['Nenhuma tela ou janela encontrada.']),
          );
          return;
        }
        const secoes = [
          secao('Telas', fontes.filter((f) => f.tipo === 'tela')),
          secao('Janelas', fontes.filter((f) => f.tipo === 'janela')),
        ];
        corpo.replaceChildren(...secoes.filter((s) => s !== null));
        corpo.addEventListener('change', () => controller.setConfirmEnabled(true));
      })
      .catch((error: unknown) => {
        console.error('Não foi possível listar as telas.', error);
        controller.setError('Não foi possível listar as telas e janelas.');
      });
  });
}

function secao(titulo: string, fontes: FonteDeTela[]): HTMLElement | null {
  if (fontes.length === 0) return null;
  return el('section', { class: 'screen-picker__section' }, [
    el('h3', { class: 'screen-picker__heading' }, [titulo]),
    el('div', { class: 'screen-picker__grid' }, fontes.map(cartao)),
  ]);
}

function cartao(fonte: FonteDeTela): HTMLElement {
  const imagem =
    fonte.miniatura === null
      ? el('span', { class: 'screen-picker__thumb screen-picker__thumb--empty' })
      : el('img', { class: 'screen-picker__thumb', src: fonte.miniatura, alt: '' });

  return el('label', { class: 'screen-picker__card', title: fonte.nome }, [
    el('input', { class: 'screen-picker__radio', type: 'radio', name: 'fonte', value: fonte.id }),
    imagem,
    el('span', { class: 'screen-picker__name' }, [
      fonte.icone !== null && el('img', { class: 'screen-picker__icon', src: fonte.icone, alt: '' }),
      el('span', { class: 'screen-picker__label' }, [fonte.nome]),
    ]),
  ]);
}
