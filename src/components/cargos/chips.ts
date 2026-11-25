import './cargos.css';

import { el } from '../../lib/dom';
import { corCss } from '../../lib/cargos';
import type { Cargo, Member } from '../../types/models';

/**
 * As ETIQUETAS dos cargos de uma pessoa (perfil e Configurações → Membros),
 * com o × para tirar e o + que abre a lista com busca e caixinhas.
 */

export interface ChipsProps {
  membro: Member;
  /** Os cargos do grupo, do mais alto ao mais baixo (sem o @todos). */
  cargos: Cargo[];
  podeEditar: boolean;
  /** Cargos que eu não posso dar nem tirar (no meu nível ou acima). */
  travado?: (c: Cargo) => boolean;
  aoDar: (cargoId: string, dar: boolean) => Promise<void>;
}

export function bolinhaDoCargo(c: Cargo): HTMLElement {
  const b = el('span', { class: 'cg-bola', 'aria-hidden': 'true' });
  b.style.background = c.cor === null ? 'var(--border-strong)' : corCss(c.cor);
  return b;
}

export function iconeDoCargoEl(c: Cargo): HTMLElement | null {
  if (c.imagem !== undefined) return el('img', { class: 'cg-icone-img', src: c.imagem, alt: '', draggable: 'false' });
  if (c.icone !== undefined) return el('span', { class: 'cg-icone', 'aria-hidden': 'true' }, [c.icone]);
  return null;
}

export function chipsDeCargos(props: ChipsProps): HTMLElement {
  const caixa = el('div', { class: 'cg-chips', role: 'list', 'aria-label': 'Cargos' });
  // As etiquetas acompanham na hora (sem esperar o banco voltar).
  const tem = new Set(props.membro.cargos ?? []);
  const mudar = async (cargoId: string, dar: boolean): Promise<void> => {
    if (dar) tem.add(cargoId);
    else tem.delete(cargoId);
    desenhar();
    try {
      await props.aoDar(cargoId, dar);
    } catch (erro) {
      if (dar) tem.delete(cargoId);
      else tem.add(cargoId);
      desenhar();
      throw erro;
    }
  };
  const desenhar = (): void => {
    const meus = props.cargos.filter((c) => tem.has(c.id));
    const chips = meus.map((c) => {
      const chip = el('span', { class: 'cg-chip', role: 'listitem' }, [bolinhaDoCargo(c), iconeDoCargoEl(c), el('span', {}, [c.nome])]);
      if (props.podeEditar && props.travado?.(c) !== true) {
        const x = el('button', { class: 'cg-chip__x', type: 'button', title: `Tirar o cargo ${c.nome}`, 'aria-label': `Tirar o cargo ${c.nome}` }, ['×']);
        x.addEventListener('click', (e) => {
          e.stopPropagation();
          void mudar(c.id, false).catch(() => undefined);
        });
        chip.append(x);
      }
      return chip;
    });
    const mais = props.podeEditar
      ? el('button', { class: 'cg-chip cg-chip--mais', type: 'button', title: 'Dar cargo', 'aria-label': 'Dar cargo' }, ['+'])
      : null;
    mais?.addEventListener('click', (e) => {
      e.stopPropagation();
      abrirEscolha(mais, props.cargos, tem, mudar, props.travado ?? (() => false));
    });
    caixa.replaceChildren(...chips, ...(mais === null ? [] : [mais]));
    if (meus.length === 0 && mais === null) caixa.append(el('span', { class: 'cg-nenhum' }, ['Sem cargos.']));
  };
  desenhar();
  return caixa;
}

let escolhaAberta: HTMLElement | null = null;

export function fecharEscolhaDeCargos(): void {
  escolhaAberta?.remove();
  escolhaAberta = null;
}

/** A lista do "+": busca e uma caixinha por cargo (marcar dá, desmarcar tira). */
function abrirEscolha(
  ancora: HTMLElement,
  cargos: Cargo[],
  tem: Set<string>,
  mudar: (cargoId: string, dar: boolean) => Promise<void>,
  travado: (c: Cargo) => boolean,
): void {
  fecharEscolhaDeCargos();
  const busca = el('input', { class: 'cg-escolha__busca', type: 'search', placeholder: 'Procurar cargo', 'aria-label': 'Procurar cargo' });
  const lista = el('div', { class: 'cg-escolha__lista', role: 'group', 'aria-label': 'Cargos' });
  const menu = el('div', { class: 'cg-escolha', role: 'dialog', 'aria-label': 'Dar cargo' }, [busca, lista]);
  const desenhar = (): void => {
    const q = busca.value.trim().toLowerCase();
    const itens = cargos.filter((c) => c.nome.toLowerCase().includes(q));
    lista.replaceChildren(
      ...itens.map((c) => {
        const marcado = tem.has(c.id);
        const preso = travado(c);
        const op = el('button', {
          class: 'cg-escolha__op',
          type: 'button',
          role: 'checkbox',
          'aria-checked': String(marcado),
          disabled: preso,
          title: preso ? 'Este cargo está no seu nível ou acima.' : '',
        }, [
          bolinhaDoCargo(c),
          iconeDoCargoEl(c),
          el('span', { class: 'cg-escolha__nome' }, [c.nome]),
          el('span', { class: 'cg-escolha__caixa', 'aria-hidden': 'true' }, [marcado ? '✓' : '']),
        ]);
        op.addEventListener('click', () => {
          void mudar(c.id, !tem.has(c.id)).catch(() => undefined).finally(desenhar);
          desenhar();
        });
        return op;
      }),
      ...(itens.length === 0 ? [el('p', { class: 'cg-nenhum' }, [cargos.length === 0 ? 'O grupo ainda não tem cargos.' : 'Nenhum cargo com esse nome.'])] : []),
    );
  };
  busca.addEventListener('input', desenhar);
  desenhar();
  // Dentro do <dialog> aberto (se houver), para ficar por cima dele.
  // Dentro do perfil flutuante (senão o clique na lista "fecha o perfil"),
  // ou do <dialog> aberto, para ficar por cima dele.
  const dialogos = document.querySelectorAll('dialog[open]');
  (ancora.closest('.person-popover') ?? dialogos[dialogos.length - 1] ?? document.body).append(menu);
  escolhaAberta = menu;
  const r = ancora.getBoundingClientRect();
  const largura = 240;
  const left = Math.max(8, Math.min(r.right - largura, window.innerWidth - largura - 8));
  let top = r.bottom + 8;
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  const h = menu.offsetHeight;
  if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 8);
  menu.style.top = `${top}px`;
  busca.focus();
  const fora = (e: Event): void => {
    if (menu.contains(e.target as Node)) return;
    fecharEscolhaDeCargos();
    document.removeEventListener('pointerdown', fora, true);
    document.removeEventListener('keydown', esc, true);
  };
  const esc = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    fecharEscolhaDeCargos();
    document.removeEventListener('pointerdown', fora, true);
    document.removeEventListener('keydown', esc, true);
  };
  setTimeout(() => {
    document.addEventListener('pointerdown', fora, true);
    document.addEventListener('keydown', esc, true);
  });
}
