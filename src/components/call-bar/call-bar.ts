import './call-bar.css';

import { el, iconEl } from '../../lib/dom';
import { cameraIcon, cameraOffIcon, hangupIcon, micIcon, screenShareIcon } from '../../lib/icons';

/**
 * Faixa de chamada em andamento.
 *
 * MONTADA EM DOIS LUGARES, e o CSS mostra exatamente um:
 *
 *   desktop → rodapé da coluna de canais
 *   mobile  → logo acima da barra de composição
 *
 * A duplicação é deliberada. No mobile a coluna de canais vira gaveta, e a
 * faixa ficaria escondida: você estaria numa chamada sem nenhum sinal na tela e
 * sem caminho de volta para a sala. Mover o elemento entre pais é coisa que CSS
 * não faz, então a escolha é entre dois pontos de montagem ou duas
 * implementações — e duas implementações divergem.
 */

export interface CallBarProps {
  channelName: string;
  /** Nome do grupo da chamada, só quando ela é de OUTRO grupo. */
  otherGroupName: string | null;
  muted: boolean;
  onOpenRoom: () => void;
  onToggleMute: () => void;
  onDisconnect: () => void;
  /** Transmitir a tela sem voltar para a sala (cartão do desktop). */
  onToggleScreen?: () => void;
  sharingScreen?: boolean;
  /** 0.9.5: ligar/desligar a câmera sem voltar para a sala. */
  onToggleCamera?: () => void;
  cameraOn?: boolean;
}

export function renderCallBar(props: CallBarProps, variant: 'desktop' | 'mobile'): HTMLElement {
  const where =
    props.otherGroupName === null
      ? props.channelName
      : `${props.channelName} · ${props.otherGroupName}`;

  // O corpo inteiro é o caminho de volta para a sala, não só um ícone.
  const back = el('button', { class: 'callbar__back', type: 'button' }, [
    el('span', { class: 'callbar__status' }, ['Em chamada']),
    el('span', { class: 'callbar__where' }, [where]),
  ]);
  back.title = `Voltar para ${where}`;
  back.addEventListener('click', props.onOpenRoom);

  const muteLabel = props.muted ? 'Ativar microfone' : 'Desativar microfone';
  const mute = el(
    'button',
    {
      class: `icon-button callbar__btn${props.muted ? ' is-off' : ''}`,
      type: 'button',
      title: muteLabel,
      'aria-pressed': String(props.muted),
    },
    [iconEl(micIcon(16)), el('span', { class: 'sr-only' }, [muteLabel])],
  );
  mute.addEventListener('click', props.onToggleMute);

  const leave = el(
    'button',
    {
      class: 'icon-button callbar__btn callbar__btn--danger',
      type: 'button',
      title: 'Desconectar',
    },
    [iconEl(hangupIcon(16)), el('span', { class: 'sr-only' }, ['Desconectar'])],
  );
  leave.addEventListener('click', props.onDisconnect);

  // Só no computador: navegador de celular não transmite tela.
  const screen =
    variant === 'desktop' &&
    props.onToggleScreen !== undefined &&
    el(
      'button',
      {
        class: `icon-button callbar__btn${props.sharingScreen === true ? ' is-on' : ''}`,
        type: 'button',
        title: props.sharingScreen === true ? 'Parar a transmissão' : 'Transmitir tela',
        'aria-pressed': String(props.sharingScreen === true),
      },
      [
        iconEl(screenShareIcon(16)),
        el('span', { class: 'sr-only' }, [
          props.sharingScreen === true ? 'Parar a transmissão' : 'Transmitir tela',
        ]),
      ],
    );
  if (screen !== false) screen.addEventListener('click', props.onToggleScreen!);

  const camLabel = props.cameraOn === true ? 'Desligar câmera' : 'Ligar câmera';
  const camera =
    props.onToggleCamera !== undefined &&
    el(
      'button',
      {
        class: `icon-button callbar__btn${props.cameraOn === true ? ' is-on' : ''}`,
        type: 'button',
        title: camLabel,
        'aria-pressed': String(props.cameraOn === true),
      },
      [iconEl(props.cameraOn === true ? cameraIcon(16) : cameraOffIcon(16)), el('span', { class: 'sr-only' }, [camLabel])],
    );
  if (camera !== false) camera.addEventListener('click', props.onToggleCamera!);

  return el('div', { class: `callbar callbar--${variant}` }, [back, mute, camera, screen, leave]);
}
