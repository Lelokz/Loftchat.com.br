import { el } from '../../lib/dom';
import { ORDEM_DAS_RARIDADES } from '../../lib/insignias';
import { progressoDoGatilho, textoDoGatilho } from '../../lib/insignias-grupo';
import type { Extras, InsigniaDoGrupo } from '../../lib/insignias-grupo';
import { comoInsignia, darInsignia } from '../../lib/insignias-servidor';
import type { DoMembro } from '../../lib/insignias-servidor';
import { comDica, medalha } from '../insignias/insignias-ui';
import type { DadosDeInsignias } from '../insignias/insignias-ui';
import { showToast } from '../toast/toast';

/**
 * O PERFIL DENTRO DO SERVIDOR (0.12.5): a fileira "Insígnias do grupo" do
 * cartão (com o "+" de dar e tirar, para quem pode) e a aba do grupo no
 * perfil completo (as que tem, as que faltam e quanto falta).
 */

const raras = (a: InsigniaDoGrupo, b: InsigniaDoGrupo): number => ORDEM_DAS_RARIDADES.indexOf(b.raridade) - ORDEM_DAS_RARIDADES.indexOf(a.raridade);

function dadosParaDica(m: DoMembro): DadosDeInsignias {
  return { tem: m.tem, n: {}, avisadoAte: '' };
}

/** A fileira do cartão. Vazia (sem nenhuma e sem poder dar) = some. */
export function filaDoServidor(opc: {
  grupo: string;
  nomeDoGrupo: string;
  membro: string;
  defs: InsigniaDoGrupo[];
  dele: DoMembro;
  podeDar: boolean;
  aoMudar: () => void;
}): HTMLElement | null {
  const tem = opc.defs.filter((d) => opc.dele.tem.has(d.id)).sort(raras);
  if (tem.length === 0 && !opc.podeDar) return null;
  const fila = el('div', { class: 'isv-fila', 'aria-label': `Insígnias de ${opc.nomeDoGrupo}` });
  for (const d of tem) fila.append(comDica(el('span', { class: 'ins-fila__item', 'data-insignia': d.id }, [medalha(comoInsignia(d), 28)]), comoInsignia(d), 'tem', () => dadosParaDica(opc.dele)));
  if (opc.podeDar && opc.defs.length > 0) {
    const mais = el('button', { class: 'isv-mais', type: 'button', title: 'Dar ou tirar insígnia', 'aria-label': 'Dar ou tirar insígnia', 'aria-haspopup': 'menu' }, ['+']);
    mais.addEventListener('click', (e) => {
      e.stopPropagation();
      abrirMenu(mais, opc);
    });
    fila.append(mais);
  }
  if (tem.length === 0 && opc.defs.length === 0) return null;
  return el('div', { class: 'isv-perfil' }, [el('span', { class: 'isv-perfil__tit' }, ['Insígnias do grupo', el('em', {}, [`· ${opc.nomeDoGrupo}`])]), fila]);
}

function abrirMenu(ancora: HTMLElement, opc: Parameters<typeof filaDoServidor>[0]): void {
  document.querySelector('.isv-menu')?.remove();
  const busca = el('input', { class: 'isv-menu__busca', type: 'search', placeholder: 'Procurar insígnia', 'aria-label': 'Procurar insígnia' }) as HTMLInputElement;
  const lista = el('div', { class: 'isv-menu__lista' });
  const menu = el('div', { class: 'isv-menu', role: 'menu', 'aria-label': 'Dar ou tirar insígnia' }, [
    busca,
    lista,
    el('p', { class: 'isv-menu__nota' }, ['As que se ganham sozinhas também dá para dar ou tirar à mão.']),
  ]);
  function desenhar(): void {
    const t = busca.value.trim().toLowerCase();
    lista.replaceChildren(
      ...opc.defs
        .filter((d) => t === '' || d.nome.toLowerCase().includes(t))
        .map((d) => {
          const on = opc.dele.tem.has(d.id);
          const b = el('button', { class: `isv-menu__op${d.gatilho.tipo === 'mao' ? '' : ' is-auto'}`, type: 'button', role: 'menuitemcheckbox', 'aria-checked': String(on) }, [
            medalha(comoInsignia(d), 30),
            el('span', {}, [d.nome, el('small', {}, [d.gatilho.tipo === 'mao' ? 'dada à mão' : textoDoGatilho(d.gatilho)])]),
            el('em', { class: `isv-menu__v${on ? ' is-on' : ''}` }, [on ? '✓' : '']),
          ]);
          b.addEventListener('click', () => {
            b.disabled = true;
            void darInsignia(opc.grupo, d.id, opc.membro, !on)
              .then(() => {
                if (on) opc.dele.tem.delete(d.id);
                else opc.dele.tem.set(d.id, new Date().toISOString());
                desenhar();
                opc.aoMudar();
              })
              .catch((e: unknown) => showToast(e instanceof Error ? e.message : 'Não deu certo.'))
              .finally(() => {
                b.disabled = false;
              });
          });
          return b;
        }),
    );
  }
  busca.addEventListener('input', desenhar);
  desenhar();
  (ancora.closest('dialog[open]') ?? document.body).append(menu);
  const r = ancora.getBoundingClientRect();
  const w = Math.min(300, window.innerWidth - 24);
  menu.style.width = `${w}px`;
  menu.style.left = `${Math.max(12, Math.min(r.left - w - 10 < 12 ? r.left : r.left - w - 10, window.innerWidth - w - 12))}px`;
  menu.style.top = `${Math.max(12, Math.min(r.top - 40, window.innerHeight - menu.offsetHeight - 12))}px`;
  const fora = (e: PointerEvent): void => {
    if (menu.contains(e.target as Node) || e.target === ancora) return;
    fechar();
  };
  const tecla = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      fechar();
    }
  };
  function fechar(): void {
    document.removeEventListener('pointerdown', fora, true);
    document.removeEventListener('keydown', tecla, true);
    menu.remove();
  }
  requestAnimationFrame(() => {
    document.addEventListener('pointerdown', fora, true);
    document.addEventListener('keydown', tecla, true);
  });
  busca.focus();
}

/** A aba do grupo no perfil completo. */
export function abaDoServidor(defs: InsigniaDoGrupo[], dele: DoMembro, extras: Extras, nomeDoGrupo: string, celular: boolean): HTMLElement {
  const tem = defs.filter((d) => dele.tem.has(d.id)).sort(raras);
  const faltam = defs.filter((d) => !dele.tem.has(d.id));
  const dados = dadosParaDica(dele);
  const cartao = (d: InsigniaDoGrupo, temEsta: boolean): HTMLElement => {
    const secreta = !temEsta && d.secreta;
    const p = temEsta || secreta ? null : progressoDoGatilho(d, dele.n, extras);
    const ins = comoInsignia(d);
    return el('div', { class: `isv-pv${temEsta ? '' : ' isv-pv--falta'}`, 'data-insignia': d.id }, [
      comDica(el('span', {}, [medalha(ins, celular ? 50 : 58, temEsta ? 'tem' : secreta ? 'secreta' : 'falta')]), ins, temEsta ? 'tem' : secreta ? 'secreta' : 'falta', () => dados),
      el('b', {}, [secreta ? '???' : d.nome]),
      el('small', {}, [secreta ? 'Insígnia secreta.' : d.desc || textoDoGatilho(d.gatilho)]),
      p !== null &&
        el('span', { class: 'isv-pv__p' }, [
          el('i', { style: `--w:${Math.min(100, Math.round((p.atual / Math.max(1, p.alvo)) * 100))}%` }),
          el('em', {}, [`${Math.min(p.atual, p.alvo).toLocaleString('pt-BR')} / ${p.alvo.toLocaleString('pt-BR')}`]),
        ]),
    ]);
  };
  if (defs.length === 0) return el('p', { class: 'pfc__vazio' }, [`${nomeDoGrupo} ainda não tem insígnias.`]);
  return el('div', { class: 'isv-pvs' }, [
    el('div', { class: 'isv-pvs__topo' }, [el('b', {}, [String(tem.length)]), el('small', {}, [`de ${defs.length} deste grupo`])]),
    tem.length > 0 && el('h5', { class: 'isv-pvs__sec' }, [`Tem · ${tem.length}`]),
    tem.length > 0 && el('div', { class: 'isv-pvs__grade' }, tem.map((d) => cartao(d, true))),
    faltam.length > 0 && el('h5', { class: 'isv-pvs__sec' }, [`Faltam · ${faltam.length}`]),
    faltam.length > 0 && el('div', { class: 'isv-pvs__grade' }, faltam.map((d) => cartao(d, false))),
  ]);
}
