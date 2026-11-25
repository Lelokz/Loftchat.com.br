import './unica.css';

import { el, iconEl } from '../../lib/dom';
import { lockIcon } from '../../lib/icons';
import { openModal } from '../modal/modal';

/**
 * MANDAR COM VISUALIZAÇÃO ÚNICA (0.10.0, maquete aprovada): a prévia, a
 * legenda e quantas vezes a pessoa pode ver (1 a 5, começa em 1).
 */
export interface MandarUnicaProps {
  /** "Lucas" ou "#geral". */
  para: string;
  arquivo: File;
  legenda: string;
  aoMandar: (vezes: number, legenda: string) => void;
}

/** Formatos aceitos (sem GIF: o GIF fica sempre no chat). */
export const ACEITA_UNICA = 'image/png,image/jpeg,image/webp,video/*';

export function abrirMandarUnica({ para, arquivo, legenda, aoMandar }: MandarUnicaProps): void {
  const endereco = URL.createObjectURL(arquivo);
  const video = arquivo.type.startsWith('video/');
  const previa = video
    ? (el('video', { class: 'unica-mandar__midia', src: endereco, muted: '', playsinline: '', controls: '' }) as HTMLVideoElement)
    : el('img', { class: 'unica-mandar__midia', src: endereco, alt: 'Prévia' });
  if (previa instanceof HTMLVideoElement) previa.muted = true;

  const campoLegenda = el('input', {
    class: 'unica-mandar__legenda',
    type: 'text',
    maxlength: '2000',
    placeholder: 'Legenda (opcional)',
    'aria-label': 'Legenda',
  }) as HTMLInputElement;
  campoLegenda.value = legenda;

  let vezes = 1;
  const botoes = [1, 2, 3, 4, 5].map((n) => {
    const b = el('button', { class: 'unica-mandar__vez', type: 'button', role: 'radio', 'aria-checked': String(n === vezes) }, [String(n)]);
    b.addEventListener('click', () => {
      vezes = n;
      for (const [i, outro] of botoes.entries()) outro.setAttribute('aria-checked', String(i + 1 === n));
    });
    return b;
  });
  const grupo = el('div', { class: 'unica-mandar__vezes', role: 'radiogroup', 'aria-label': 'Quantas vezes pode ver' }, botoes);

  openModal({
    title: 'Visualização única',
    description: `Para ${para} · some depois de vista`,
    body: el('div', { class: 'unica-mandar' }, [
      el('div', { class: 'unica-mandar__previa' }, [previa]),
      campoLegenda,
      el('div', { class: 'unica-mandar__rotulo', 'aria-hidden': 'true' }, ['Quantas vezes pode ver']),
      grupo,
      el('p', { class: 'unica-mandar__nota' }, [
        iconEl(lockIcon(16)),
        el('span', {}, ['Não dá para baixar, encaminhar nem copiar. No celular e no programa do Windows, o print sai preto.']),
      ]),
    ]),
    confirmLabel: 'Mandar',
    initialFocus: botoes[0]!,
    async onConfirm(c) {
      aoMandar(vezes, campoLegenda.value.trim());
      c.close();
    },
    onClose() {
      URL.revokeObjectURL(endereco);
    },
  });
}
