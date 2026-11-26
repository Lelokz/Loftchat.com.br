import { el } from '../../lib/dom';
import { POR_ID, RARIDADES } from '../../lib/insignias';
import { medalha } from './insignias-ui';

/**
 * O PRESENTE (0.12.5): a insígnia especial chega no privado com o criador
 * como uma caixa fechada. Quem ganhou toca em "Abrir presente" (o app ouve
 * o `data-abrir-presente` na raiz), a tela cheia mostra a insígnia e o nome
 * passa a brilhar. Quem mandou vê "Esperando abrir".
 */

export interface DadosDoPresente {
  insignia: 'confidente' | 'testador';
  aberto: boolean;
  cancelado: boolean;
}

function caixa(): HTMLElement {
  return el('span', { class: 'pr__caixa', 'aria-hidden': 'true' }, [
    el('span', { class: 'pr__corpo' }),
    el('span', { class: 'pr__tampa' }),
    el('span', { class: 'pr__fita' }),
    el('span', { class: 'pr__laco' }),
  ]);
}

/** O cartão dentro da mensagem. */
export function cartaoDoPresente(p: DadosDoPresente, mensagem: string): HTMLElement {
  const ins = POR_ID.get(p.insignia);
  if (p.cancelado || ins === undefined) {
    return el('div', { class: 'pr pr--cancelado' }, [el('p', { class: 'pr__nota' }, ['Este presente foi cancelado.'])]);
  }
  if (p.aberto) {
    return el('div', { class: `pr pr--aberto pr--${ins.cromo ?? 'roxo'}` }, [
      el('div', { class: 'pr__palco' }, [el('span', { class: 'pr__raios' }), medalha(ins, 112)]),
      el('div', { class: 'pr__txt' }, [
        el('small', {}, ['Presente aberto']),
        el('b', {}, [ins.nome]),
        el('span', {}, [`${RARIDADES[ins.raridade].nome} · ${ins.desc}`]),
      ]),
    ]);
  }
  return el('div', { class: 'pr' }, [
    el('div', { class: 'pr__palco' }, [
      el('span', { class: 'pr__raios' }),
      caixa(),
      el('span', { class: 'pr__estrela', style: 'left:26%;top:22%' }, ['✦']),
      el('span', { class: 'pr__estrela', style: 'right:24%;top:30%;font-size:10px' }, ['✦']),
      el('span', { class: 'pr__estrela', style: 'right:30%;bottom:18%;font-size:12px' }, ['✦']),
    ]),
    el('div', { class: 'pr__txt' }, [
      el('small', {}, ['Insígnia especial']),
      el('b', { class: 'pr__titulo-dele' }, ['Uma insígnia para você']),
      el('b', { class: 'pr__titulo-meu' }, [`Você deu: ${ins.nome}`]),
      el('span', { class: 'pr__sub-dele' }, ['Só o criador do Loftchat dá esta.']),
      el('span', { class: 'pr__sub-meu' }, ['Esperando abrir.']),
      el('button', { class: 'pr__bt', type: 'button', 'data-abrir-presente': mensagem }, ['Abrir presente']),
    ]),
  ]);
}

/** A tela cheia de quando abre: raios, confete, a insígnia e o nome brilhando. */
export function mostrarAbertura(opcoes: { insignia: 'confidente' | 'testador'; meuNome: string; brilho: 'roxo' | 'ouro' | 'prata' | null; de: string; onVer: () => void }): void {
  const ins = POR_ID.get(opcoes.insignia);
  if (ins === undefined) return;
  const cores = ['#ffd76a', '#fff3c8', '#e0a419', '#ff7ad9', '#9fd9ff', '#b46bff'];
  const confete = Array.from({ length: 34 }, (_, i) =>
    el('span', {
      class: 'ab__conf',
      style: `left:${(i * 37) % 100}%;top:${-10 - ((i * 53) % 40)}%;background:${cores[i % cores.length]};--giro:${(i * 47) % 360}deg;animation-delay:${(i % 9) * 120}ms`,
    }),
  );
  const ver = el('button', { class: 'ab__a', type: 'button' }, ['Ver no meu perfil']);
  const fechar = el('button', { class: 'ab__b', type: 'button' }, ['Fechar']);
  const tela = el('div', { class: `ab ab--${ins.cromo ?? 'roxo'}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': `Presente: ${ins.nome}` }, [
    el('span', { class: 'ab__raios' }),
    ...confete,
    el('div', { class: 'ab__miolo' }, [
      el('span', { class: 'ab__de' }, [`Presente de ${opcoes.de}`]),
      el('div', { class: 'ab__med' }, [medalha(ins, 190)]),
      el('span', { class: 'ab__nome-ins' }, [ins.nome]),
      el('span', { class: `ab__rar ab__rar--${ins.raridade}` }, [RARIDADES[ins.raridade].nome]),
      el('p', {}, [`${ins.desc} Poucas pessoas têm esta.`]),
      opcoes.brilho !== null &&
        el('div', { class: 'ab__nome' }, ['Seu nome agora aparece assim', el('b', { class: `nome-brilho nome-brilho--${opcoes.brilho}` }, [opcoes.meuNome])]),
      el('div', { class: 'ab__bts' }, [ver, fechar]),
    ]),
  ]);
  const sair = (): void => {
    tela.classList.add('is-saindo');
    document.removeEventListener('keydown', tecla, true);
    window.setTimeout(() => tela.remove(), 220);
  };
  const tecla = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      sair();
    }
  };
  fechar.addEventListener('click', sair);
  ver.addEventListener('click', () => {
    sair();
    opcoes.onVer();
  });
  document.addEventListener('keydown', tecla, true);
  (document.querySelector('dialog[open]') ?? document.body).append(tela);
  fechar.focus();
}
