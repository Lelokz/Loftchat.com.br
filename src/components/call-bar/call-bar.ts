import './call-bar.css';

import { el, iconEl } from '../../lib/dom';
import { hangupIcon, micIcon } from '../../lib/icons';

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
}

export function renderCallBar(props: CallBarProps, variant: 'desktop' | 'mobile'): HTMLElement {
  const where =
    props.otherGroupName === null
      ? props.channelName
      : `${props.channelName} · ${props.otherGroupName}`;

  // O corpo inteiro é o caminho de volta para a sala, não só um ícone.
  const back = el('button', { class: 'callbar__back', type: 'button' }, [
    el('span', { class: 'callbar__status' }, ['Conectado']),
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

  return el('div', { class: `callbar callbar--${variant}` }, [back, mute, leave]);
}
