import './encaminhar.css';

import { avatarEl, el, iconEl } from '../../lib/dom';
import { semAcento } from '../../lib/emojis';
import { encaminharIcon } from '../../lib/icons';
import { openModal } from '../modal/modal';

/**
 * ENCAMINHAR (0.11.0, maquete aprovada): a prévia da mensagem, uma busca,
 * as conversas recentes e os canais (até 5 destinos) e uma mensagem junto
 * (opcional).
 */

export interface Destino {
  /** `pv:<uid>` ou `canal:<grupo>/<canal>`. */
  chave: string;
  nome: string;
  sub: string;
  pessoa?: { uid: string; initials: string; photo?: string | undefined };
}

export interface EncaminharProps {
  autor: string;
  resumo: string;
  recentes: Destino[];
  canais: Destino[];
  /** Manda; devolve os destinos em que NÃO deu (para avisar). */
  aoEncaminhar: (destinos: Destino[], comentario: string) => Promise<string[]>;
}

export const MAX_DESTINOS = 5;

export function abrirEncaminhar(p: EncaminharProps): void {
  const escolhidos = new Set<string>();
  const busca = el('input', { class: 'encaminhar__busca', type: 'search', placeholder: 'Buscar pessoa ou canal', 'aria-label': 'Buscar pessoa ou canal' }) as HTMLInputElement;
  const lista = el('div', { class: 'encaminhar__lista scroll-area', role: 'group', 'aria-label': 'Destinos' });
  const contagem = el('small', { class: 'encaminhar__contagem' });
  const comentario = el('input', { class: 'encaminhar__comentario', type: 'text', maxlength: '2000', placeholder: 'Mensagem junto (opcional)', 'aria-label': 'Mensagem junto' }) as HTMLInputElement;

  let controle: { setConfirmEnabled(v: boolean): void } | null = null;
  const atualizar = (): void => {
    contagem.textContent = `${escolhidos.size} ${escolhidos.size === 1 ? 'escolhido' : 'escolhidos'} · até ${MAX_DESTINOS}`;
    controle?.setConfirmEnabled(escolhidos.size > 0);
  };

  const linha = (d: Destino): HTMLElement => {
    const marcado = escolhidos.has(d.chave);
    const b = el(
      'button',
      { class: `encaminhar__destino${marcado ? ' is-escolhido' : ''}`, type: 'button', role: 'checkbox', 'aria-checked': String(marcado) },
      [
        d.pessoa !== undefined
          ? avatarEl(d.pessoa.initials, 'sm', 'encaminhar__avatar', d.pessoa.photo, d.pessoa.uid)
          : el('span', { class: 'encaminhar__avatar encaminhar__avatar--canal', 'aria-hidden': 'true' }, ['#']),
        el('span', { class: 'encaminhar__nome' }, [d.nome, el('small', {}, [d.sub])]),
        el('span', { class: 'encaminhar__caixa', 'aria-hidden': 'true' }),
      ],
    );
    b.addEventListener('click', () => {
      if (escolhidos.has(d.chave)) escolhidos.delete(d.chave);
      else if (escolhidos.size < MAX_DESTINOS) escolhidos.add(d.chave);
      desenhar();
    });
    return b;
  };

  function desenhar(): void {
    const termo = semAcento(busca.value.trim().toLowerCase());
    const filtra = (ds: Destino[]): Destino[] => (termo === '' ? ds : ds.filter((d) => semAcento(`${d.nome} ${d.sub}`.toLowerCase()).includes(termo)));
    const recentes = filtra(p.recentes);
    const canais = filtra(p.canais);
    lista.replaceChildren(
      ...(recentes.length > 0 ? [el('div', { class: 'encaminhar__rotulo' }, ['Conversas recentes']), ...recentes.map(linha)] : []),
      ...(canais.length > 0 ? [el('div', { class: 'encaminhar__rotulo' }, ['Canais']), ...canais.map(linha)] : []),
      ...(recentes.length + canais.length === 0 ? [el('p', { class: 'encaminhar__vazio' }, ['Nada com esse nome.'])] : []),
    );
    atualizar();
  }
  busca.addEventListener('input', desenhar);

  controle = openModal({
    title: 'Encaminhar',
    body: el('div', { class: 'encaminhar' }, [
      el('div', { class: 'encaminhar__previa' }, [el('b', {}, [p.autor]), el('span', {}, [p.resumo])]),
      busca,
      lista,
      comentario,
      contagem,
    ]),
    confirmLabel: 'Encaminhar',
    busyLabel: 'Encaminhando…',
    confirmDisabled: true,
    initialFocus: busca,
    async onConfirm(c) {
      const todos = [...p.recentes, ...p.canais];
      const destinos = [...escolhidos].map((k) => todos.find((d) => d.chave === k)!).filter(Boolean);
      const falhas = await p.aoEncaminhar(destinos, comentario.value.trim());
      if (falhas.length === 0) c.close();
      else c.setError(`Não deu para mandar em: ${falhas.join(', ')}.`);
    },
  });
  // O ícone de encaminhar no botão (como na maquete).
  lista.closest('dialog')?.querySelector('.modal__confirm')?.prepend(iconEl(encaminharIcon(16)));
  desenhar();
}
