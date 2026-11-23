import { el, iconEl } from '../../lib/dom';
import { logoIcon } from '../../lib/icons';
import {
  NOVIDADES,
  aoMudarAtualizacao,
  estadoDaAtualizacao,
  instalarAtualizacao,
  procurarAtualizacao,
} from '../../lib/atualizacao';
import type { EstadoDaAtualizacao } from '../../lib/atualizacao';
import { mandarInfoDaTela } from '../../lib/info-da-tela';
import { textoDoErro } from '../../lib/firestore-errors';

/**
 * CONFIGURAÇÕES → SOBRE O LOFTCHAT (17/11/2026).
 *
 * A versão que está rodando, se tem atualização (e o botão de instalar — é
 * aqui que ela fica depois de um "Depois" na faixa), e as novidades de cada
 * versão. Acompanha ao vivo: achar, baixar e instalar mudam a tela na hora.
 */
export interface SobreSection {
  elementos: HTMLElement[];
  parar: () => void;
}

function dataBonita(iso: string): string {
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}

function blocoDeVersao(titulo: string, itens: string[], extra?: string): HTMLElement {
  return el('section', { class: 'sobre__versao' }, [
    el('h3', { class: 'sobre__versao-titulo' }, [titulo, extra !== undefined && el('span', { class: 'sobre__versao-data' }, [extra])]),
    el('ul', { class: 'sobre__itens' }, itens.map((item) => el('li', {}, [item]))),
  ]);
}

/**
 * "A tela está estranha no seu celular?" — um toque manda o retrato do
 * aparelho (ver `lib/info-da-tela.ts`). Sem print, sem foto.
 */
function blocoDaTela(nome: () => string): HTMLElement {
  const aviso = el('p', { class: 'settings__help', role: 'status' }, [
    'Manda para quem faz o Loftchat o modelo do aparelho, o tamanho da tela e o tamanho da letra. Sem foto e sem nada das suas conversas.',
  ]);
  const botao = el('button', { class: 'settings__font sobre__tela', type: 'button' }, ['Mandar informações da tela']);
  botao.addEventListener('click', () => {
    botao.setAttribute('disabled', '');
    botao.textContent = 'Mandando…';
    void mandarInfoDaTela(nome())
      .then(() => {
        botao.textContent = 'Informações mandadas';
        aviso.textContent = 'Pronto! Obrigado — com isso dá para arrumar a tela do seu aparelho.';
      })
      .catch((error: unknown) => {
        botao.removeAttribute('disabled');
        botao.textContent = 'Mandar informações da tela';
        aviso.textContent = textoDoErro(error, 'Não deu para mandar.');
      });
  });
  return el('div', { class: 'settings__field' }, [
    el('span', { class: 'settings__label' }, ['A tela está estranha no seu aparelho?']),
    botao,
    aviso,
  ]);
}

export function renderSobreSection(nome: () => string = () => ''): SobreSection {
  const caixa = el('div', { class: 'sobre__estado', role: 'status' });

  const desenhar = (e: EstadoDaAtualizacao): void => {
    const linhas: (HTMLElement | false)[] = [];
    if (e.onde === 'site') {
      linhas.push(el('p', { class: 'sobre__estado-texto' }, ['No site você sempre usa a versão mais nova.']));
    } else if (e.nova !== null) {
      const baixando = e.progresso !== null && !(e.onde === 'pc' && e.pronta);
      linhas.push(
        el('p', { class: 'sobre__estado-texto' }, [
          el('b', {}, [`Versão ${e.nova} disponível`]),
          baixando ? ` · baixando ${e.progresso}%` : e.pronta ? '' : ' · baixando…',
        ]),
      );
      const instalar = el('button', { class: 'settings__font sobre__instalar', type: 'button' }, [
        e.onde === 'pc' && e.progresso === 100 ? 'Reiniciando…' : 'Instalar atualização',
      ]);
      if (!e.pronta || e.progresso !== null) instalar.setAttribute('disabled', '');
      instalar.addEventListener('click', () => void instalarAtualizacao());
      linhas.push(instalar);
      if (e.onde === 'pc') {
        linhas.push(el('p', { class: 'settings__help' }, ['O Loftchat fecha e abre de novo já na versão nova.']));
      } else {
        linhas.push(
          el('p', { class: 'settings__help' }, [
            'O Loftchat baixa a versão nova e o Android pede para você tocar em Instalar.',
          ]),
        );
      }
    } else {
      linhas.push(
        el('p', { class: 'sobre__estado-texto' }, [
          e.procurando
            ? 'Procurando atualizações…'
            : e.conferido
              ? 'Você está na versão mais nova.'
              : 'O Loftchat procura atualizações sozinho de tempos em tempos.',
        ]),
      );
      const procurar = el('button', { class: 'settings__font sobre__procurar', type: 'button' }, [
        'Procurar atualizações',
      ]);
      if (e.procurando) procurar.setAttribute('disabled', '');
      procurar.addEventListener('click', () => void procurarAtualizacao());
      linhas.push(procurar);
    }
    if (e.erro !== null) linhas.push(el('p', { class: 'settings__error', role: 'alert' }, [e.erro]));
    caixa.replaceChildren(...linhas.filter((l): l is HTMLElement => l !== false));
    desenharNovidades(e);
  };

  const novidades = el('div', { class: 'sobre__novidades' });
  const desenharNovidades = (e: EstadoDaAtualizacao): void => {
    const blocos: HTMLElement[] = [];
    if (e.nova !== null && e.notas !== null && e.notas.length > 0) {
      blocos.push(blocoDeVersao(`Versão ${e.nova}`, e.notas, 'nova · ainda não instalada'));
    }
    for (const v of NOVIDADES) {
      blocos.push(
        blocoDeVersao(`Versão ${v.versao}`, v.itens, v.versao === e.atual ? `${dataBonita(v.data)} · a sua` : dataBonita(v.data)),
      );
    }
    novidades.replaceChildren(...blocos);
  };

  const estado = estadoDaAtualizacao();
  const parar = aoMudarAtualizacao(desenhar);
  desenhar(estado);

  const elementos = [
    el('h2', { class: 'settings__title' }, ['Sobre o Loftchat']),
    el('div', { class: 'sobre__cartao' }, [
      el('span', { class: 'sobre__marca', 'aria-hidden': 'true' }, [iconEl(logoIcon(28))]),
      el('div', {}, [
        el('p', { class: 'sobre__nome' }, ['Loft', el('b', {}, ['chat'])]),
        el('p', { class: 'sobre__numero' }, [
          `Versão ${estado.atual} (beta) · `,
          estado.onde === 'pc' ? 'programa do computador' : estado.onde === 'android' ? 'app Android' : 'site',
        ]),
      ]),
    ]),
    el('div', { class: 'settings__field' }, [el('span', { class: 'settings__label' }, ['Atualizações']), caixa]),
    blocoDaTela(nome),
    el('div', { class: 'settings__field' }, [el('span', { class: 'settings__label' }, ['Novidades']), novidades]),
  ];

  return { elementos, parar: () => void parar() };
}
