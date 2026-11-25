import './room-panel.css';

import { el } from '../../lib/dom';
import { renderComposer } from '../chat/composer/composer';
import type { Figurinha } from '../../lib/figurinhas';
import type { Gravacao } from '../../lib/gravador';

/** Abas do painel da direita com a sala de voz na tela (etapa 8b). */
export type AbaDaSala = 'chat' | 'membros' | 'fixadas';

export interface RoomPanelProps {
  /** Nome da sala, para a dica da caixa de mensagem. */
  canal: string;
  /** As abas que aparecem: o chat sempre, Membros e Fixadas conforme as preferências. */
  abas: AbaDaSala[];
  aba: AbaDaSala;
  onAba: (aba: AbaDaSala) => void;
  onSend: (body: string) => Promise<void>;
  /** 0.5.0: imagem, GIF e vídeo no chat da sala. */
  aoArquivos?: (arquivos: File[], legenda: string, vezes?: number) => void;
  destino?: string;
  aoFigurinha?: (figurinha: Figurinha) => void;
  /** 0.5.5: mensagem de voz. */
  aoVoz?: (gravacao: Gravacao) => void;
  /** 0.8.5: comandos com "/" e as pessoas para o "@". */
  comandos?: () => { nome: string; desc: string; args: string }[];
  pessoas?: () => string[];
}

export interface RoomPanelParts {
  element: HTMLElement;
  /** Troca a aba à mostra SEM remontar: o que está sendo digitado fica. */
  setAba: (aba: AbaDaSala) => void;
  /** Lista de mensagens (ou carregando / vazio / erro). */
  messagesSlot: HTMLElement;
  /** Faixa de "respondendo a…", acima da caixa. */
  replySlot: HTMLElement;
  /** Conteúdo das abas Membros e Fixadas. */
  outroSlot: HTMLElement;
}

const NOMES: Record<AbaDaSala, string> = { chat: 'Chat da sala', membros: 'Membros', fixadas: 'Fixadas' };

/**
 * PAINEL DA DIREITA NA SALA DE VOZ (etapa 8b): abas Chat da sala, Membros e
 * Fixadas. É a mesma coluna 4 (`.members`), a mesma gaveta da direita no
 * celular.
 *
 * Montado UMA VEZ por entrada na sala, como a casca do chat: as mensagens
 * entram por um slot e a caixa de texto nunca é recriada — senão cada
 * mensagem que chegasse apagaria o que a pessoa está digitando.
 */
export function renderRoomPanel(props: RoomPanelProps): RoomPanelParts {
  const messagesSlot = el('div', { class: 'chat__messages-slot room-panel__messages' });
  const replySlot = el('div', { class: 'chat__reply-slot' });
  const chat = el('div', { class: 'room-panel__chat', role: 'tabpanel', 'aria-label': NOMES.chat }, [
    messagesSlot,
    replySlot,
    renderComposer({
      channelName: props.canal,
      hashPrefix: false,
      placeholder: 'Mensagem na sala',
      onSend: props.onSend,
      painel: {},
      ...(props.destino === undefined ? {} : { destino: props.destino }),
      ...(props.aoArquivos === undefined ? {} : { aoArquivos: props.aoArquivos }),
      ...(props.aoFigurinha === undefined ? {} : { aoFigurinha: props.aoFigurinha }),
      ...(props.aoVoz === undefined ? {} : { aoVoz: props.aoVoz }),
      ...(props.comandos === undefined ? {} : { comandos: props.comandos }),
      ...(props.pessoas === undefined ? {} : { pessoas: props.pessoas }),
    }),
  ]);
  const outroSlot = el('div', { class: 'members__body column-scroll scroll-area', role: 'tabpanel' });

  const botoes = new Map<AbaDaSala, HTMLElement>();
  const abas = el(
    'div',
    { class: 'group-panel__tabs', role: 'tablist', 'aria-label': 'Painel da sala' },
    props.abas.map((aba) => {
      const botao = el('button', { class: 'group-panel__tab', type: 'button', role: 'tab' }, [NOMES[aba]]);
      botao.addEventListener('click', () => props.onAba(aba));
      botoes.set(aba, botao);
      return botao;
    }),
  );

  const element = el('aside', { class: 'members group-panel room-panel' }, [abas, chat, outroSlot]);

  const setAba = (aba: AbaDaSala): void => {
    for (const [id, botao] of botoes) {
      botao.classList.toggle('is-active', id === aba);
      botao.setAttribute('aria-selected', String(id === aba));
    }
    chat.hidden = aba !== 'chat';
    outroSlot.hidden = aba === 'chat';
    outroSlot.setAttribute('aria-label', NOMES[aba]);
    element.setAttribute('aria-label', NOMES[aba]);
  };
  setAba(props.aba);

  return { element, setAba, messagesSlot, replySlot, outroSlot };
}
