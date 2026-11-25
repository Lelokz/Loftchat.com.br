import './transcricao.css';

import { el, iconEl } from '../../lib/dom';
import { transcreverIcon } from '../../lib/icons';
import { pedirTranscricao } from '../../lib/transcricao';
import type { MessageBase } from '../../types/models';

/**
 * TRANSCRIÇÃO NO BALÃO DE VOZ (0.10.5, maquete aprovada).
 *
 * O botão de linhas fica ao lado do tempo. Sem texto: pede ao carteiro e
 * mostra "Transcrevendo…". Com texto (de quem pediu ou de qualquer um da
 * conversa — fica na mensagem): o texto aparece embaixo das ondas, e o botão
 * esconde/mostra SÓ para você.
 *
 * O estado mora aqui fora (a lista é redesenhada a cada mensagem nova): quem
 * está transcrevendo, os erros e quem você escondeu.
 */
const transcrevendo = new Set<string>();
const erros = new Map<string, string>();
const escondidas = new Set<string>();
const ouvintes = new Set<() => void>();

function avisar(): void {
  for (const f of ouvintes) f();
}

/** 0.10.5: o cargo deixa transcrever neste canal? (o app liga; no PV, sempre.) */
let podeTranscrever: (canal: string) => boolean = () => true;
export function definirPermissaoDeTranscrever(f: (canal: string) => boolean): void {
  podeTranscrever = f;
  avisar();
}

/**
 * Põe o botão dentro do balão de voz (`.voz`) e devolve o bloco do texto
 * (que vai embaixo dele). `tipo`: em que coleção a mensagem mora.
 */
export function montarTranscricao(voz: HTMLElement, m: MessageBase, tipo: 'pv' | 'grupo'): HTMLElement {
  const botao = el('button', { class: 'transcricao__botao', type: 'button' }, [
    iconEl(transcreverIcon(17)),
    el('span', { class: 'sr-only' }),
  ]);
  const bloco = el('div', { class: 'transcricao', 'aria-live': 'polite' });
  voz.append(botao);

  const desenhar = (): void => {
    if (!bloco.isConnected && bloco.dataset['montado'] === '1') {
      ouvintes.delete(desenhar);
      return;
    }
    const t = m.transcricao;
    // Sem a permissão "Usar transcrição": o botão some (o texto que já existe continua).
    const canal = (m as { channelId?: string }).channelId;
    botao.hidden = t === undefined && tipo === 'grupo' && canal !== undefined && !podeTranscrever(canal);
    const rotulo = t === undefined ? 'Transcrever' : escondidas.has(m.id) ? 'Mostrar texto' : 'Esconder texto';
    botao.title = rotulo;
    botao.lastElementChild!.textContent = rotulo;
    botao.classList.toggle('is-ligado', (t !== undefined && !escondidas.has(m.id)) || transcrevendo.has(m.id));
    // Só redesenha o bloco quando o estado muda (senão o "Transcrevendo…" reinicia a animação).
    const estado = t !== undefined ? (escondidas.has(m.id) ? 'escondida' : `texto:${t.texto}`) : transcrevendo.has(m.id) ? 'carregando' : erros.has(m.id) ? `erro:${erros.get(m.id)}` : 'nada';
    if (bloco.dataset['estado'] === estado) return;
    bloco.dataset['estado'] = estado;
    if (t !== undefined) {
      if (escondidas.has(m.id)) bloco.replaceChildren();
      else if (t.texto === '') bloco.replaceChildren(el('p', { class: 'transcricao__vazia' }, ['Sem fala neste áudio.']));
      else bloco.replaceChildren(el('p', t.idioma !== '' ? { class: 'transcricao__texto', lang: t.idioma } : { class: 'transcricao__texto' }, [t.texto]));
    } else if (transcrevendo.has(m.id)) {
      bloco.replaceChildren(
        el('div', { class: 'transcricao__carregando', 'aria-hidden': 'true' }, [el('i'), el('i')]),
        el('span', { class: 'transcricao__aviso' }, ['Transcrevendo…']),
      );
    } else if (erros.has(m.id)) {
      bloco.replaceChildren(el('span', { class: 'transcricao__erro', role: 'alert' }, [erros.get(m.id)!]));
    } else {
      bloco.replaceChildren();
    }
    bloco.hidden = bloco.childElementCount === 0;
  };

  botao.addEventListener('click', (e) => {
    e.stopPropagation();
    if (m.transcricao !== undefined) {
      if (escondidas.has(m.id)) escondidas.delete(m.id);
      else escondidas.add(m.id);
      avisar();
      return;
    }
    if (transcrevendo.has(m.id)) return;
    transcrevendo.add(m.id);
    erros.delete(m.id);
    avisar();
    void pedirTranscricao(tipo, m.id).then((r) => {
      transcrevendo.delete(m.id);
      // O texto chega pela escuta das mensagens (redesenha a lista); aqui
      // só garante que ele aparece mesmo se a escuta demorar.
      if ('texto' in r) m.transcricao ??= { texto: r.texto, idioma: '' };
      else erros.set(m.id, r.erro);
      avisar();
    });
  });

  ouvintes.add(desenhar);
  desenhar();
  bloco.dataset['montado'] = '1';
  return bloco;
}
