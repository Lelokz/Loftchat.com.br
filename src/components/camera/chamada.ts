import './camera.css';

import { avatarEl, el, iconEl } from '../../lib/dom';
import { cameraIcon, hangupIcon, phoneIcon } from '../../lib/icons';

/**
 * CHAMADA CHEGANDO (0.9.5, maquete aprovada): no PC, um cartão no meio, em
 * cima; no celular, a tela inteira. Recusar, Atender e Atender com câmera.
 * Enquanto está na tela, toca (um "trim-trim" curto, gerado aqui mesmo).
 */
export interface ChamadaRecebidaView {
  uid: string;
  nome: string;
  initials: string;
  photo?: string | undefined;
  comCamera: boolean;
  /** Tela cheia (celular) ou cartão (PC). */
  telaCheia: boolean;
  aoAtender: (comCamera: boolean) => void;
  aoRecusar: () => void;
}

export function renderChamadaRecebida(v: ChamadaRecebidaView): HTMLElement {
  const redondo = (classe: string, icone: string, rotulo: string, acao: () => void): HTMLElement => {
    const b = el('button', { class: `chamada__botao ${classe}`, type: 'button', title: rotulo }, [
      iconEl(icone),
      el('span', { class: 'sr-only' }, [rotulo]),
    ]);
    b.addEventListener('click', acao);
    return el('div', { class: 'chamada__acao' }, [b, el('span', { 'aria-hidden': 'true' }, [rotulo === 'Atender com câmera' ? 'Com câmera' : rotulo])]);
  };
  const t = v.telaCheia ? 28 : 22;
  return el(
    'div',
    {
      class: `chamada${v.telaCheia ? ' chamada--cheia' : ''}`,
      role: 'dialog',
      'aria-label': `${v.nome} está te ligando`,
      'aria-live': 'assertive',
    },
    [
      el('div', { class: 'chamada__quem' }, [
        el('div', { class: 'chamada__foto' }, [avatarEl(v.initials, 'lg', 'chamada__avatar', v.photo, v.uid)]),
        el('h2', { class: 'chamada__nome' }, [v.nome]),
        el('p', { class: 'chamada__texto' }, [v.comCamera ? 'está te ligando com câmera…' : 'está te ligando…']),
        v.telaCheia && el('p', { class: 'chamada__origem' }, ['Loftchat · chamada no privado']),
      ]),
      el('div', { class: 'chamada__acoes' }, [
        redondo('chamada__botao--recusar', hangupIcon(t), 'Recusar', v.aoRecusar),
        redondo('chamada__botao--atender', phoneIcon(t), 'Atender', () => v.aoAtender(false)),
        redondo('chamada__botao--atender', cameraIcon(t), 'Atender com câmera', () => v.aoAtender(true)),
      ]),
    ],
  );
}

/*
 * O TOQUE: dois bipes suaves a cada 2,5 s, pelo próprio navegador (sem
 * arquivo de som). Para sozinho quando a chamada some da tela.
 */
let toque: { contexto: AudioContext; timer: number } | null = null;

export function tocarChamada(): void {
  if (toque !== null) return;
  let contexto: AudioContext;
  try {
    contexto = new AudioContext();
  } catch {
    return;
  }
  const bipe = (quando: number): void => {
    const osc = contexto.createOscillator();
    const volume = contexto.createGain();
    osc.type = 'sine';
    osc.frequency.value = 660;
    volume.gain.setValueAtTime(0, quando);
    volume.gain.linearRampToValueAtTime(0.12, quando + 0.02);
    volume.gain.linearRampToValueAtTime(0, quando + 0.28);
    osc.connect(volume).connect(contexto.destination);
    osc.start(quando);
    osc.stop(quando + 0.3);
  };
  const tocar = (): void => {
    const agora = contexto.currentTime;
    bipe(agora);
    bipe(agora + 0.4);
  };
  void contexto.resume().catch(() => {});
  tocar();
  toque = { contexto, timer: window.setInterval(tocar, 2500) };
}

export function pararChamada(): void {
  if (toque === null) return;
  window.clearInterval(toque.timer);
  void toque.contexto.close().catch(() => {});
  toque = null;
}
