import './perfil-completo.css';

import { doc, updateDoc } from 'firebase/firestore';

import { avatarEl, el, iconEl } from '../../lib/dom';
import { db } from '../../lib/firebase';
import { publicProfile } from '../../lib/friends';
import { arrowLeftIcon, closeIcon } from '../../lib/icons';
import { jogandoDe } from '../../lib/jogando';
import { applyPersonLook } from '../../lib/person-theme';
import { loadProfileArt } from '../../lib/profile';
import { POR_ID, ORDEM_DAS_RARIDADES } from '../../lib/insignias';
import { amigosEmComum } from '../../lib/conquistas';
import type { UserProfile } from '../../types/models';
import { blocoJogandoAgora, blocosDosJogos } from '../jogos/jogos-ui';
import { abaInsignias, filaDeInsignias, ouvirInsignias } from '../insignias/insignias-ui';
import type { DadosDeInsignias } from '../insignias/insignias-ui';
import { showToast } from '../toast/toast';

export type AbaDoPerfil = 'jogos' | 'insignias' | 'amigos';

export interface PerfilCompletoOptions {
  uid: string;
  souEu: boolean;
  fallback: { displayName: string; initials: string; photo?: string | undefined };
  /** O botão de baixo do nome ("Enviar mensagem", "Editar perfil"…), ou nada. */
  acao?: { rotulo: string; fazer: () => void };
  aba?: AbaDoPerfil;
  /** Abrir o perfil de um amigo em comum. */
  abrirOutro?: (uid: string) => void;
}

let aberto: (() => void) | null = null;

export function fecharPerfilCompleto(): void {
  aberto?.();
}

/**
 * As 5 do cartão: as escolhidas, ou (sem escolha) as 5 mais raras que tem.
 */
export function insigniasDoCartao(escolhidas: string[] | undefined, dados: DadosDeInsignias | null): string[] {
  const tem = dados?.tem ?? new Map<string, string>();
  const validas = (escolhidas ?? []).filter((id) => tem.has(id) || dados === null);
  if (validas.length > 0) return validas.slice(0, 5);
  return [...tem.keys()]
    .filter((id) => POR_ID.has(id))
    .sort((a, b) => ORDEM_DAS_RARIDADES.indexOf(POR_ID.get(b)!.raridade) - ORDEM_DAS_RARIDADES.indexOf(POR_ID.get(a)!.raridade))
    .slice(0, 5);
}

/**
 * PERFIL COMPLETO (0.12.0): no PC, uma janela no meio (à esquerda quem é; à
 * direita as abas Jogos, Insígnias e Amigos em comum). No celular, tela
 * cheia com o botão de voltar.
 */
export function abrirPerfilCompleto(opcoes: PerfilCompletoOptions): void {
  fecharPerfilCompleto();
  const celular = matchMedia('(max-width: 720px)').matches;
  let aba: AbaDoPerfil = opcoes.aba ?? 'jogos';
  let perfil: UserProfile | null = null;
  let dados: DadosDeInsignias | null = null;
  let escolhendo = false;

  const veu = el('div', { class: 'pc-veu' });
  const caixa = el('div', { class: `pc${celular ? ' pc--celular' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': `Perfil de ${opcoes.fallback.displayName}`, tabindex: -1 });
  const banner = el('div', { class: 'pc__banner' });
  const esquerda = el('div', { class: 'pc__quem' });
  const abas = el('div', { class: 'pc__abas', role: 'tablist' });
  const corpo = el('div', { class: 'pc__corpo', role: 'tabpanel' });

  function fechar(): void {
    pararInsignias();
    document.removeEventListener('keydown', tecla, true);
    veu.remove();
    caixa.remove();
    if (aberto === fechar) aberto = null;
  }
  const tecla = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' && document.querySelector('.ins-folha') === null) {
      e.stopPropagation();
      fechar();
    }
  };
  veu.addEventListener('click', fechar);

  const voltar = el('button', { class: 'pc__fechar', type: 'button', 'aria-label': celular ? 'Voltar' : 'Fechar' }, [
    iconEl(celular ? arrowLeftIcon(18) : closeIcon(16)),
  ]);
  voltar.addEventListener('click', fechar);

  function desenharQuem(): void {
    const nomeTxt = perfil?.displayName ?? opcoes.fallback.displayName;
    const nome = el('h2', { class: 'pc__nome' }, [nomeTxt]);
    const desde = perfil?.createdAt ? new Date(perfil.createdAt) : null;
    const botao =
      opcoes.acao === undefined
        ? false
        : (() => {
            const b = el('button', { class: 'pc__acao', type: 'button' }, [opcoes.acao.rotulo]);
            b.addEventListener('click', () => {
              fechar();
              opcoes.acao!.fazer();
            });
            return b;
          })();
    esquerda.replaceChildren(
      avatarEl(perfil?.initials ?? opcoes.fallback.initials, 'xl', 'pc__foto', perfil?.photo ?? opcoes.fallback.photo, opcoes.uid),
      nome,
      ...(perfil?.username ? [el('span', { class: 'pc__arroba' }, [`@${perfil.username}`])] : []),
      ...[filaDeInsignias(insigniasDoCartao(perfil?.insigniasNoCartao, dados), celular ? 32 : 34, () => dados)].filter((x): x is HTMLElement => x !== false),
      ...(!celular && (perfil?.bio ?? '') !== '' ? [el('p', { class: 'pc__bio' }, [perfil!.bio!])] : []),
      ...(!celular && desde !== null && !Number.isNaN(desde.getTime())
        ? [
            el('div', { class: 'pc__desde' }, [
              'Membro do Loftchat desde',
              el('b', {}, [desde.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' })]),
            ]),
          ]
        : []),
      ...(botao === false ? [] : [botao]),
    );
    if (perfil !== null) applyPersonLook(caixa, nome, perfil);
  }

  function desenharAbas(): void {
    const nomes: Record<AbaDoPerfil, string> = { jogos: 'Jogos', insignias: 'Insígnias', amigos: 'Amigos em comum' };
    abas.replaceChildren(
      ...(Object.keys(nomes) as AbaDoPerfil[])
        .filter((a) => a !== 'amigos' || !opcoes.souEu)
        .map((a) => {
          const b = el('button', { class: `pc__aba${a === aba ? ' is-on' : ''}`, type: 'button', role: 'tab', 'aria-selected': String(a === aba) }, [nomes[a]]);
          b.addEventListener('click', () => {
            aba = a;
            escolhendo = false;
            desenharAbas();
            desenharCorpo();
          });
          return b;
        }),
    );
  }

  function desenharCorpo(): void {
    if (aba === 'jogos') {
      const jogo = jogandoDe(opcoes.uid);
      const blocos = [...(jogo === null ? [] : [blocoJogandoAgora(jogo, true, celular)]), ...blocosDosJogos(perfil?.jogos, true, celular)];
      corpo.replaceChildren(
        ...(blocos.length > 0
          ? blocos
          : [el('p', { class: 'pc__vazio' }, [perfil === null ? 'Carregando…' : opcoes.souEu ? 'Você ainda não pôs jogos no perfil. Vá em Configurações → Jogos.' : 'Nenhum jogo no perfil ainda.'])]),
      );
      return;
    }
    if (aba === 'insignias') {
      if (dados === null) {
        corpo.replaceChildren(el('p', { class: 'pc__vazio' }, ['Carregando…']));
        return;
      }
      const conteudo = abaInsignias(dados, celular);
      if (opcoes.souEu) conteudo.prepend(barraDeEscolha());
      if (escolhendo) ligarEscolha(conteudo);
      corpo.replaceChildren(conteudo);
      return;
    }
    corpo.replaceChildren(el('p', { class: 'pc__vazio' }, ['Procurando amigos em comum…']));
    void amigosEmComum(opcoes.uid).then((lista) => {
      if (aba !== 'amigos' || !caixa.isConnected) return;
      corpo.replaceChildren(
        lista.length === 0
          ? el('p', { class: 'pc__vazio' }, ['Nenhum amigo em comum.'])
          : el(
              'ul',
              { class: 'pc__amigos' },
              lista.map((a) => {
                const item = el('button', { class: 'pc__amigo', type: 'button' }, [
                  avatarEl(a.initials, 'md', '', a.photo, a.uid),
                  el('span', {}, [el('b', {}, [a.displayName]), a.username ? el('span', {}, [`@${a.username}`]) : false]),
                ]);
                item.addEventListener('click', () => {
                  fechar();
                  opcoes.abrirOutro?.(a.uid);
                });
                return el('li', {}, [item]);
              }),
            ),
      );
    });
  }

  /* --- escolher as 5 do cartão (só no meu) ----------------------------------- */

  let escolha: string[] = [];
  function barraDeEscolha(): HTMLElement {
    if (!escolhendo) {
      const b = el('button', { class: 'pc__escolher', type: 'button' }, ['Escolher as do cartão']);
      b.addEventListener('click', () => {
        escolhendo = true;
        escolha = insigniasDoCartao(perfil?.insigniasNoCartao, dados);
        desenharCorpo();
      });
      return el('div', { class: 'pc__escolha' }, [el('span', {}, ['Até 5 aparecem no seu cartão.']), b]);
    }
    const salvar = el('button', { class: 'pc__escolher is-on', type: 'button' }, ['Pronto']);
    salvar.addEventListener('click', () => {
      escolhendo = false;
      const lista = escolha.slice(0, 5);
      void updateDoc(doc(db, 'users', opcoes.uid), { insigniasNoCartao: lista }).then(
        () => {
          if (perfil !== null) perfil = { ...perfil, insigniasNoCartao: lista };
          desenharQuem();
          desenharCorpo();
        },
        () => showToast('Não deu para salvar. Confira a internet.'),
      );
    });
    return el('div', { class: 'pc__escolha is-escolhendo' }, [el('span', {}, [`Toque nas que você tem · ${escolha.length} de 5`]), salvar]);
  }

  function ligarEscolha(conteudo: HTMLElement): void {
    conteudo.classList.add('ins-aba--escolhendo');
    for (const item of conteudo.querySelectorAll<HTMLElement>('.ins-grade__item')) {
      const id = item.dataset['insignia'] ?? '';
      if (!dados?.tem.has(id)) continue;
      item.classList.add('is-escolhivel');
      item.classList.toggle('is-escolhida', escolha.includes(id));
      item.addEventListener(
        'click',
        (e) => {
          e.stopImmediatePropagation();
          if (escolha.includes(id)) escolha = escolha.filter((x) => x !== id);
          else if (escolha.length < 5) escolha = [...escolha, id];
          desenharCorpo();
        },
        true,
      );
    }
  }

  /* --- montar ------------------------------------------------------------- */

  const pararInsignias = ouvirInsignias(opcoes.uid, (d) => {
    dados = d;
    desenharQuem();
    if (aba === 'insignias' && !escolhendo) desenharCorpo();
  });

  desenharQuem();
  desenharAbas();
  desenharCorpo();
  caixa.append(
    voltar,
    el('div', { class: 'pc__esquerda' }, [banner, esquerda]),
    el('div', { class: 'pc__direita' }, [abas, corpo]),
  );
  if (!celular) document.body.append(veu);
  document.body.append(caixa);
  document.addEventListener('keydown', tecla, true);
  caixa.focus({ preventScroll: true });
  aberto = fechar;

  void Promise.all([publicProfile(opcoes.uid).catch(() => null), loadProfileArt(opcoes.uid).catch(() => ({}))]).then(([p, art]) => {
    if (!caixa.isConnected) return;
    perfil = p;
    if ('banner' in art && art.banner) banner.style.backgroundImage = `url("${art.banner}")`;
    desenharQuem();
    desenharCorpo();
  });
}
