import './camera.css';

import { el } from '../../lib/dom';
import { listarCameras, loadCameraSettings, saveCameraSettings } from '../../lib/camera-settings';
import { emAppAndroid } from '../../lib/android';
import { openModal } from '../modal/modal';

/**
 * PRÉVIA ANTES DE LIGAR A CÂMERA (0.9.5, maquete aprovada): você se vê,
 * escolhe a câmera e se quer espelhado — e só liga ao apertar "Ligar câmera".
 * Ninguém aparece na sala sem querer.
 *
 * `aoLigar` recebe a câmera escolhida e devolve o motivo da recusa (ou null).
 */
export function abrirPreviaDaCamera(aoLigar: (cameraId: string, frente: boolean) => Promise<string | null>): void {
  const ajustes = loadCameraSettings();
  const celular = emAppAndroid() || /Android|iPhone|iPad/i.test(navigator.userAgent);
  let fluxo: MediaStream | null = null;
  let fechado = false;

  const video = el('video', { class: 'cam-previa__video', autoplay: '', playsinline: '', muted: '' }) as HTMLVideoElement;
  video.muted = true;
  const aviso = el('p', { class: 'cam-previa__aviso' }, ['Abrindo a câmera…']);
  const quadro = el('div', { class: `cam-previa${ajustes.espelhar ? ' is-espelhada' : ''}` }, [video, aviso]);

  const escolha = el('select', { class: 'cam-previa__select', 'aria-label': 'Câmera' }) as HTMLSelectElement;
  const campoEscolha = el('label', { class: 'cam-campo' }, [el('span', {}, ['Câmera']), escolha]);

  const chave = el('button', { class: 'cam-sw', type: 'button', role: 'switch', 'aria-checked': String(ajustes.espelhar), 'aria-label': 'Espelhar o meu vídeo' });
  chave.addEventListener('click', () => {
    ajustes.espelhar = !ajustes.espelhar;
    chave.setAttribute('aria-checked', String(ajustes.espelhar));
    quadro.classList.toggle('is-espelhada', ajustes.espelhar);
  });
  const linhaEspelhar = el('div', { class: 'cam-linha' }, [
    el('span', {}, ['Espelhar o meu vídeo', el('small', {}, ['Só para você. Os outros te veem do jeito certo.'])]),
    chave,
  ]);

  const soltar = (): void => {
    fluxo?.getTracks().forEach((t) => t.stop());
    fluxo = null;
    video.srcObject = null;
  };

  async function abrir(): Promise<void> {
    soltar();
    aviso.hidden = false;
    aviso.textContent = 'Abrindo a câmera…';
    const pedido: MediaTrackConstraints = { width: { ideal: 1280 }, height: { ideal: 720 } };
    if (ajustes.cameraId !== '') pedido.deviceId = { ideal: ajustes.cameraId };
    else if (celular) pedido.facingMode = ajustes.frente ? 'user' : 'environment';
    try {
      const novo = await navigator.mediaDevices.getUserMedia({ video: pedido });
      if (fechado) {
        novo.getTracks().forEach((t) => t.stop());
        return;
      }
      fluxo = novo;
      video.srcObject = novo;
      void video.play().catch(() => {});
      aviso.hidden = true;
      await encherEscolha();
    } catch (erro) {
      const nome = (erro as { name?: string }).name ?? '';
      aviso.textContent =
        nome === 'NotAllowedError'
          ? 'O Loftchat não tem permissão para usar a câmera. Libere nas configurações do aparelho.'
          : nome === 'NotFoundError'
            ? 'Nenhuma câmera encontrada.'
            : 'Não deu para abrir a câmera. Ela pode estar sendo usada por outro programa.';
    }
  }

  async function encherEscolha(): Promise<void> {
    const cameras = await listarCameras();
    const atual = fluxo?.getVideoTracks()[0]?.getSettings().deviceId ?? ajustes.cameraId;
    escolha.replaceChildren(...cameras.map((c) => el('option', { value: c.id }, [c.nome])));
    if (cameras.some((c) => c.id === atual)) escolha.value = atual;
    campoEscolha.hidden = cameras.length === 0;
  }

  escolha.addEventListener('change', () => {
    ajustes.cameraId = escolha.value;
    void abrir();
  });

  openModal({
    title: 'Ligar câmera',
    description: 'Só você está vendo esta prévia. Ninguém na sala vê até você ligar.',
    body: el('div', { class: 'cam-corpo' }, [quadro, campoEscolha, linhaEspelhar]),
    confirmLabel: 'Ligar câmera',
    busyLabel: 'Ligando…',
    async onConfirm(c) {
      // A câmera é uma só: a prévia solta antes de a chamada pegar.
      const escolhida = fluxo?.getVideoTracks()[0]?.getSettings().deviceId ?? ajustes.cameraId;
      soltar();
      saveCameraSettings({ ...ajustes, cameraId: escolha.value !== '' ? escolha.value : ajustes.cameraId });
      const motivo = await aoLigar(escolhida ?? '', ajustes.frente);
      if (motivo === null) c.close();
      else {
        c.setError(motivo);
        void abrir();
      }
    },
    onClose() {
      fechado = true;
      soltar();
    },
  });
  void abrir();
}
