import { el } from '../../lib/dom';
import { publicProfile } from '../../lib/friends';
import { loadProfileArt } from '../../lib/profile';
import type { MemberId } from '../../types/models';
import { renderPersonCard } from './person-card';
import { jogandoDe } from '../../lib/jogando';
import { blocoJogandoAgora, blocosDosJogos } from '../jogos/jogos-ui';
import type { JogosDoPerfil } from '../../lib/jogos-perfil';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { filaDeInsignias, lerDadosDeInsignias } from '../insignias/insignias-ui';
import type { DadosDeInsignias } from '../insignias/insignias-ui';
import { insigniasDoCartao } from '../perfil-completo/perfil-completo';

/** Em que pé eu estou com a pessoa — decide o botão do cartão. */
export type Vinculo = 'eu' | 'amigo' | 'pedido' | 'bloqueado' | 'nada';

export interface PersonPopoverOptions {
  uid: MemberId;
  /** Onde o clique aconteceu: o cartão abre ao lado. */
  anchor: HTMLElement;
  /** O que já se sabe (nome e iniciais) para o cartão abrir na hora. */
  fallback: { displayName: string; initials: string; photo?: string | undefined };
  vinculo: Vinculo;
  onMessage: () => void;
  onAddFriend: () => Promise<void>;
  onEditProfile: () => void;
  /** 0.8.5: dentro de um grupo, os cargos e "membro desde" (vai antes dos botões). */
  noServidor?: HTMLElement;
  /** 0.12.0: "Ver perfil completo". */
  onVerPerfil?: () => void;
  /** 0.12.5: dentro de um grupo, a fileira é a das insígnias DO GRUPO (no lugar das do Loft). */
  insigniasDoServidor?: HTMLElement;
}

let aberto: { el: HTMLElement; fechar: () => void } | null = null;

export function closePersonPopover(): void {
  aberto?.fechar();
}

/**
 * CARTÃO FLUTUANTE de uma pessoa (proposta A, etapa 2c) — abre ao clicar no
 * nome ou na foto dela (membros, mensagens, painel "Agora").
 *
 * Abre NA HORA com o que já se sabe (nome, iniciais, foto) e completa quando
 * o perfil e as imagens chegam — sempre lidos de novo ao abrir, então mostra
 * a foto/bio mais nova mesmo que tenha mudado agora há pouco.
 *
 * Fecha com Esc, clique fora ou rolagem da página. Sem véu escuro: é uma
 * espiada, não uma tela.
 */
export function openPersonPopover(options: PersonPopoverOptions): void {
  const { uid, anchor, fallback, vinculo } = options;
  closePersonPopover();

  const pop = el('div', {
    class: 'person-popover',
    role: 'dialog',
    'aria-label': `Perfil de ${fallback.displayName}`,
    tabindex: -1,
  });

  function acoes(): HTMLElement[] {
    if (vinculo === 'eu') {
      const editar = el('button', { class: 'person-popover__main', type: 'button' }, ['Editar perfil']);
      editar.addEventListener('click', () => {
        fechar();
        options.onEditProfile();
      });
      return [editar];
    }
    if (vinculo === 'amigo') {
      const msg = el('button', { class: 'person-popover__main', type: 'button' }, ['Enviar mensagem']);
      msg.addEventListener('click', () => {
        fechar();
        options.onMessage();
      });
      return [msg];
    }
    if (vinculo === 'pedido') {
      return [el('p', { class: 'person-popover__note' }, ['Pedido de amizade pendente.'])];
    }
    if (vinculo === 'bloqueado') {
      return [el('p', { class: 'person-popover__note' }, ['Você bloqueou esta pessoa.'])];
    }
    const add = el('button', { class: 'person-popover__main', type: 'button' }, ['Adicionar amigo']);
    add.addEventListener('click', () => {
      add.disabled = true;
      add.textContent = 'Enviando…';
      options.onAddFriend().then(
        () => {
          add.replaceWith(el('p', { class: 'person-popover__note' }, ['Pedido enviado.']));
        },
        () => {
          add.disabled = false;
          add.textContent = 'Adicionar amigo';
        },
      );
    });
    return [add];
  }

  function desenhar(dados: Parameters<typeof renderPersonCard>[0], jogos?: JogosDoPerfil): void {
    // 0.12.0: jogando agora, favorito e "jogando ultimamente".
    const jogo = jogandoDe(uid);
    const ver =
      options.onVerPerfil === undefined
        ? []
        : (() => {
            const b = el('button', { class: 'jg-ver', type: 'button' }, ['Ver perfil completo']);
            b.addEventListener('click', () => {
              fechar();
              options.onVerPerfil?.();
            });
            return [b];
          })();
    pop.replaceChildren(
      renderPersonCard(dados, [
        ...(jogo === null ? [] : [blocoJogandoAgora(jogo)]),
        ...blocosDosJogos(jogos, false),
        ...ver,
        ...(options.noServidor === undefined ? [] : [options.noServidor]),
        el('div', { class: 'person-popover__actions' }, acoes()),
      ]),
    );
    posicionar();
  }

  function posicionar(): void {
    const r = anchor.getBoundingClientRect();
    const w = pop.offsetWidth;
    const h = pop.offsetHeight;
    const margem = 12;
    // Ao lado do que foi clicado: à direita se couber, senão à esquerda.
    let left = r.right + margem;
    if (left + w > window.innerWidth - margem) left = r.left - w - margem;
    left = Math.max(margem, Math.min(left, window.innerWidth - w - margem));
    let top = r.top;
    top = Math.max(margem, Math.min(top, window.innerHeight - h - margem));
    pop.style.left = `${Math.round(left)}px`;
    pop.style.top = `${Math.round(top)}px`;
  }

  desenhar({ displayName: fallback.displayName, initials: fallback.initials, photo: fallback.photo });

  const foraDaqui = (event: PointerEvent): void => {
    // 0.12.5: o menu de dar insígnia (fora do cartão, por cima) é do cartão.
    if ((event.target as Element | null)?.closest?.('.isv-menu') != null) return;
    if (!pop.contains(event.target as Node)) fechar();
  };
  const tecla = (event: KeyboardEvent): void => {
    // A lista de cargos aberta dentro do perfil fecha primeiro (0.8.5).
    if (event.key === 'Escape' && pop.querySelector('.cg-escolha') !== null) return;
    if (event.key === 'Escape') {
      event.stopPropagation();
      fechar();
      anchor.focus?.();
    }
  };
  const rolou = (event: Event): void => {
    if (!pop.contains(event.target as Node)) fechar();
  };

  function fechar(): void {
    document.removeEventListener('pointerdown', foraDaqui, true);
    document.removeEventListener('keydown', tecla, true);
    window.removeEventListener('scroll', rolou, true);
    window.removeEventListener('resize', fechar);
    pop.remove();
    if (aberto?.el === pop) aberto = null;
  }

  // No próximo quadro: o próprio clique que abriu não pode fechar.
  requestAnimationFrame(() => {
    if (!pop.isConnected) return;
    document.addEventListener('pointerdown', foraDaqui, true);
    document.addEventListener('keydown', tecla, true);
    window.addEventListener('scroll', rolou, true);
    window.addEventListener('resize', fechar);
  });

  // Dentro de um <dialog> aberto (Configurações), o cartão precisa estar na
  // mesma camada; fora, no body.
  (anchor.closest('dialog[open]') ?? document.body).append(pop);
  aberto = { el: pop, fechar };
  posicionar();
  pop.focus({ preventScroll: true });

  void Promise.all([
    publicProfile(uid).catch(() => null),
    loadProfileArt(uid).catch(() => ({})),
    getDoc(doc(db, 'insignias', uid)).then((s) => lerDadosDeInsignias(s.data()), (): DadosDeInsignias | null => null),
  ]).then(
    ([perfil, art, insignias]) => {
      if (!pop.isConnected || perfil === null) return;
      desenhar({
        displayName: perfil.displayName,
        initials: perfil.initials,
        username: perfil.username,
        bio: perfil.bio,
        accentId: perfil.accentId,
        brilho: perfil.brilho,
        fontId: perfil.fontId,
        photo: perfil.photo,
        banner: 'banner' in art ? art.banner : undefined,
        cardBg: 'cardBg' in art ? art.cardBg : undefined,
        customStatus: perfil.customStatus,
        links: perfil.links,
        insignias: options.insigniasDoServidor ?? filaDeInsignias(insigniasDoCartao(perfil.insigniasNoCartao, insignias), 22, () => insignias),
      }, perfil.jogos);
    },
  );
}
