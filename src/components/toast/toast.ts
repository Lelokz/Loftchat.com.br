import './toast.css';

import { el } from '../../lib/dom';

/**
 * Aviso curto e passageiro, no rodapé da tela.
 *
 * Existe por causa de uma classe de ação que não tem onde falhar: copiar e colar
 * pelo menu de contexto acontecem longe de qualquer campo de erro. Sem isto,
 * "Colar" recusado pelo navegador seria a única opção do menu sem resposta
 * nenhuma — a pessoa clica e não acontece nada.
 *
 * Um por vez, de propósito: dois avisos empilhados competem pela atenção e
 * nenhum é importante o bastante para isso. O novo substitui o anterior.
 */

const VISIBLE_MS = 3200;

let current: HTMLElement | null = null;
let timer: number | null = null;

function clear(): void {
  if (timer !== null) window.clearTimeout(timer);
  timer = null;
  current?.remove();
  current = null;
}

export function showToast(message: string): void {
  clear();

  // `role=status` e não `alert`: isto é retorno de uma ação que a pessoa acabou
  // de pedir, não uma interrupção. O leitor de tela anuncia sem atropelar.
  const toast = el('div', { class: 'toast', role: 'status' }, [message]);
  document.body.append(toast);

  current = toast;
  timer = window.setTimeout(clear, VISIBLE_MS);
}

/** Some na hora — usado ao desmontar o app. */
export function hideToast(): void {
  clear();
}
