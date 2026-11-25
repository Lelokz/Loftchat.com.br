import './bolinha.css';

import { el } from '../../lib/dom';
import { textoDaBolinha } from '../../lib/nao-lidas';

/** A bolinha de não lidas (0.4.5). Nada quando não há nenhuma. */
export function bolinha(n: number, jeito: 'aba' | 'fim', silenciada = false): HTMLElement | false {
  if (n <= 0) return false;
  const texto = textoDaBolinha(n);
  // 0.11.0: do que está silenciado, a bolinha fica cinza.
  return el('span', { class: `bolinha bolinha--${jeito}${silenciada ? ' bolinha--silenciada' : ''}`, title: `${texto} não lidas` }, [
    el('span', { 'aria-hidden': 'true' }, [texto]),
    el('span', { class: 'sr-only' }, [`, ${texto} não lidas`]),
  ]);
}
