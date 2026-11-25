import './unica.css';

import { avatarEl, el, iconEl } from '../../lib/dom';
import { closeIcon, lockIcon, unicaIcon } from '../../lib/icons';
import { formatDayLabel, formatTime } from '../../lib/format';
import { abrirUnica } from '../../lib/unicas';
import { protegerTela } from '../../lib/protecao-de-tela';

/**
 * VENDO UMA VISUALIZAÇÃO ÚNICA (0.10.0, maquete aprovada): tela cheia, sem
 * baixar, encaminhar, copiar ou arrastar. Em cima, de quem é e "1ª de 3
 * vezes"; embaixo, quantas sobram. Abrir CONTA (quem conta é o carteiro).
 * O vídeo toca uma vez. É um <dialog>: Esc e o VOLTAR do Android fecham.
 */
export interface TelaUnicaProps {
  tipo: 'pv' | 'grupo';
  id: string;
  video: boolean;
  legenda: string;
  autor: { uid: string; nome: string; initials: string; photo?: string | undefined };
  sentAt: string;
}

export function abrirTelaUnica(p: TelaUnicaProps): void {
  const fechar = el('button', { class: 'unica-ver__x', type: 'button', title: 'Fechar (Esc)' }, [
    iconEl(closeIcon(20)),
    el('span', { class: 'sr-only' }, ['Fechar']),
  ]);
  const selo = el('span', { class: 'unica-ver__selo' }, [iconEl(unicaIcon(18)), el('span', {}, ['Visualização única'])]);
  const quando = `${formatDayLabel(p.sentAt).toLowerCase()} às ${formatTime(p.sentAt)}`;
  const topo = el('div', { class: 'unica-ver__topo' }, [
    avatarEl(p.autor.initials, 'md', 'unica-ver__avatar', p.autor.photo, p.autor.uid),
    el('span', { class: 'unica-ver__quem' }, [el('b', {}, [p.autor.nome]), el('small', {}, [quando])]),
    selo,
    fechar,
  ]);
  const palco = el('div', { class: 'unica-ver__palco' }, [el('p', { class: 'unica-ver__aviso' }, ['Abrindo…'])]);
  const pe = el('div', { class: 'unica-ver__pe' });
  const janela = el('dialog', { class: 'unica-ver', 'aria-label': p.video ? 'Vídeo de visualização única' : 'Foto de visualização única' }, [
    topo,
    palco,
    pe,
  ]) as HTMLDialogElement;

  let endereco: string | null = null;
  // Nada de botão direito, arrastar ou copiar aqui dentro.
  for (const evento of ['contextmenu', 'dragstart', 'copy', 'cut'] as const) {
    janela.addEventListener(evento, (e) => e.preventDefault());
  }
  janela.addEventListener('close', () => {
    protegerTela(false);
    palco.replaceChildren();
    if (endereco !== null) URL.revokeObjectURL(endereco);
    janela.remove();
  });
  fechar.addEventListener('click', () => janela.close());
  document.body.append(janela);
  janela.showModal();
  // Celular e programa do Windows: print e gravação saem pretos enquanto está aberta.
  protegerTela(true);

  void abrirUnica(p.tipo, p.id).then((r) => {
    if (!janela.open) {
      if (typeof r !== 'string') URL.revokeObjectURL(r.endereco);
      return;
    }
    if (typeof r === 'string') {
      palco.replaceChildren(el('p', { class: 'unica-ver__aviso' }, [r]));
      return;
    }
    endereco = r.endereco;
    const midia = p.video
      ? (el('video', {
          class: 'unica-ver__midia',
          src: r.endereco,
          autoplay: '',
          playsinline: '',
          controls: '',
          controlslist: 'nodownload noplaybackrate noremoteplayback',
          disablepictureinpicture: '',
          disableremoteplayback: '',
        }) as HTMLVideoElement)
      : el('img', { class: 'unica-ver__midia', src: r.endereco, alt: '', draggable: 'false' });
    palco.replaceChildren(midia);
    const ordinal = `${r.vez}ª de ${r.vezes} ${r.vezes === 1 ? 'vez' : 'vezes'}`;
    selo.lastElementChild!.textContent = r.vezes === 1 ? 'Visualização única' : ordinal;
    const sobram = r.vezes - r.vez;
    pe.replaceChildren(
      ...(p.legenda !== '' ? [el('p', { class: 'unica-ver__legenda' }, [p.legenda])] : []),
      el('p', { class: 'unica-ver__conta' }, [
        iconEl(lockIcon(15)),
        sobram <= 0
          ? 'Esta é a última vez.'
          : `Esta conta como 1 vez. ${sobram === 1 ? 'Sobra 1.' : `Sobram ${sobram}.`}`,
      ]),
    );
  });
}
