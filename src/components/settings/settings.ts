import './settings.css';

import { sendPasswordResetEmail } from 'firebase/auth';
import type { User } from 'firebase/auth';

import { auth } from '../../lib/firebase';
import { el, iconEl } from '../../lib/dom';
import { arrowLeftIcon, closeIcon, faceIcon, logoIcon, logoutIcon, shieldIcon } from '../../lib/icons';
import {
  CARD_COLOR_IDS,
  CARD_COLORS,
  cardColorId,
  NAME_FONT_IDS,
  NAME_FONTS,
  applyNameFont,
  nameFontId,
} from '../../lib/person-theme';
import type { CardColorId, NameFontId } from '../../lib/person-theme';
import { bioProblem, displayNameProblem, saveProfile } from '../../lib/profile';
import {
  claimUsername,
  publicProfile,
  usernameFree,
  usernameProblem,
  UsernameTakenError,
} from '../../lib/friends';
import { initials } from '../../lib/format';
import { MAX_BIO, MAX_DISPLAY_NAME, MAX_USERNAME_CHANGES } from '../../types/models';
import type { UserProfile } from '../../types/models';
import { renderPersonCard } from '../person-card/person-card';
import { showToast } from '../toast/toast';

export interface SettingsOptions {
  user: User;
  onSignOut: () => void;
  /** Depois de salvar: o app atualiza o meu cartão na barra de cima. */
  onSaved: (perfil: { displayName: string; initials: string; username: string | undefined }) => void;
}

type Secao = 'perfil' | 'conta';

/** Os valores editáveis do Perfil — o "antes" e o "agora" da barra de salvar. */
interface Rascunho {
  displayName: string;
  username: string;
  bio: string;
  accentId: CardColorId;
  fontId: NameFontId;
}

function rascunhoDe(perfil: UserProfile | null, user: User): Rascunho {
  return {
    displayName: perfil?.displayName ?? user.displayName ?? '',
    username: perfil?.username ?? '',
    bio: perfil?.bio ?? '',
    accentId: cardColorId(perfil?.accentId),
    fontId: nameFontId(perfil?.fontId),
  };
}

function iguais(a: Rascunho, b: Rascunho): boolean {
  return (
    a.displayName.trim() === b.displayName.trim() &&
    a.username === b.username &&
    a.bio.trim() === b.bio.trim() &&
    a.accentId === b.accentId &&
    a.fontId === b.fontId
  );
}

let aberta: HTMLDialogElement | null = null;

/**
 * CONFIGURAÇÕES EM TELA INTEIRA (proposta A, etapa 2).
 *
 * Um <dialog> por cima do app: a chamada de voz, a transmissão e as
 * conversas continuam vivas por baixo — fechar volta exatamente para onde
 * estava. Esc fecha.
 *
 * Seções que ainda não existem NÃO aparecem no menu: cada uma entra quando
 * fizer alguma coisa de verdade (Voz e áudio, Aparência, Atalhos... nas
 * próximas etapas). Nada de botão que não faz nada.
 *
 * Fechar com alteração não salva NÃO abre pergunta: a barra de salvar pisca
 * e a tela fica — como no Discord, sem pop-up.
 */
export function openSettings(options: SettingsOptions): void {
  if (aberta !== null) return;
  const { user, onSignOut, onSaved } = options;

  const dialog = el('dialog', { class: 'settings', 'aria-label': 'Configurações' });
  aberta = dialog;

  let salvo: Rascunho = rascunhoDe(null, user);
  let atual: Rascunho = { ...salvo };
  let trocasFeitas = 0;
  let carregado = false;
  let salvando = false;

  /* --- menu da esquerda --------------------------------------------------- */

  const botoesDoMenu = new Map<Secao, HTMLButtonElement>();
  function itemDoMenu(secao: Secao, rotulo: string, icone: string): HTMLElement {
    const botao = el('button', { class: 'settings__nav-item', type: 'button' }, [
      iconEl(icone),
      el('span', {}, [rotulo]),
    ]);
    botao.addEventListener('click', () => mostrar(secao));
    botoesDoMenu.set(secao, botao);
    return botao;
  }

  const sair = el('button', { class: 'settings__nav-item settings__signout', type: 'button' }, [
    iconEl(logoutIcon(18)),
    el('span', {}, ['Sair da conta']),
  ]);
  sair.addEventListener('click', () => {
    fechar(true);
    onSignOut();
  });

  const menu = el('nav', { class: 'settings__nav', 'aria-label': 'Seções das configurações' }, [
    el('span', { class: 'settings__brand' }, [
      el('span', { class: 'settings__mark' }, [iconEl(logoIcon(17))]),
      el('span', {}, ['Loft', el('b', {}, ['chat'])]),
    ]),
    el('span', { class: 'settings__nav-label' }, ['Você']),
    itemDoMenu('perfil', 'Perfil', faceIcon(18)),
    itemDoMenu('conta', 'Conta e segurança', shieldIcon(18)),
    el('span', { class: 'settings__nav-spacer' }),
    sair,
  ]);

  /* --- conteúdo ----------------------------------------------------------- */

  const conteudo = el('div', { class: 'settings__content' });
  const previa = el('aside', { class: 'settings__preview', 'aria-label': 'Prévia do seu cartão' });

  const fecharBotao = el('button', { class: 'settings__close icon-button', type: 'button', title: 'Fechar (Esc)' }, [
    iconEl(closeIcon(18)),
    el('span', { class: 'sr-only' }, ['Fechar configurações']),
  ]);
  fecharBotao.addEventListener('click', () => fechar());

  const voltar = el('button', { class: 'settings__back icon-button', type: 'button', title: 'Voltar' }, [
    iconEl(arrowLeftIcon(18)),
    el('span', { class: 'sr-only' }, ['Voltar para as seções']),
  ]);
  voltar.addEventListener('click', () => dialog.classList.remove('settings--secao-aberta'));

  /* --- barra de salvar ---------------------------------------------------- */

  const barraTexto = el('span', { class: 'settings__bar-text' }, ['Você tem alterações que não foram salvas.']);
  const desfazer = el('button', { class: 'settings__bar-undo', type: 'button' }, ['Desfazer']);
  const salvar = el('button', { class: 'settings__bar-save', type: 'button' }, ['Salvar']);
  const barra = el('div', { class: 'settings__bar', role: 'region', 'aria-label': 'Alterações não salvas' }, [
    barraTexto,
    el('span', { class: 'settings__bar-actions' }, [desfazer, salvar]),
  ]);
  barra.hidden = true;

  desfazer.addEventListener('click', () => {
    atual = { ...salvo };
    mostrar('perfil');
  });
  salvar.addEventListener('click', () => void salvarPerfil());

  dialog.append(
    menu,
    el('main', { class: 'settings__main' }, [voltar, conteudo, barra]),
    previa,
    fecharBotao,
  );

  /* --- seção Perfil ------------------------------------------------------- */

  let erroDoArroba: string | null = null;
  let checagem = 0;
  let avisoArroba: HTMLElement | null = null;
  let erroGeral: HTMLElement | null = null;

  function atualizarBarra(): void {
    const sujo = carregado && !iguais(atual, salvo);
    barra.hidden = !sujo;
    salvar.disabled = salvando || erroDoArroba !== null;
    desfazer.disabled = salvando;
    salvar.textContent = salvando ? 'Salvando…' : 'Salvar';
  }

  function desenharPrevia(): void {
    const nome = atual.displayName.trim() === '' ? 'Seu nome' : atual.displayName.trim();
    previa.replaceChildren(
      el('span', { class: 'settings__preview-label' }, ['Prévia do seu cartão']),
      renderPersonCard({
        displayName: nome,
        initials: initials(nome),
        username: atual.username,
        bio: atual.bio,
        accentId: atual.accentId,
        fontId: atual.fontId,
      }),
    );
  }

  function mudou(): void {
    desenharPrevia();
    atualizarBarra();
  }

  function campo(rotulo: string, id: string, controle: HTMLElement, ajuda?: HTMLElement): HTMLElement {
    return el('div', { class: 'settings__field' }, [
      el('label', { class: 'settings__label', for: id }, [rotulo]),
      controle,
      ajuda ?? false,
    ]);
  }

  async function conferirArroba(nome: string): Promise<void> {
    const minha = ++checagem;
    if (avisoArroba === null) return;
    if (nome === salvo.username) {
      erroDoArroba = null;
      avisoArroba.dataset['tom'] = '';
      avisoArroba.textContent = textoDasTrocas();
      atualizarBarra();
      return;
    }
    const problema = usernameProblem(nome);
    if (problema !== null) {
      erroDoArroba = problema;
      avisoArroba.dataset['tom'] = 'erro';
      avisoArroba.textContent = problema;
      atualizarBarra();
      return;
    }
    erroDoArroba = 'Conferindo…';
    avisoArroba.dataset['tom'] = '';
    avisoArroba.textContent = `Conferindo @${nome}…`;
    atualizarBarra();
    const livre = await usernameFree(nome).catch(() => true);
    if (minha !== checagem || avisoArroba === null) return;
    erroDoArroba = livre ? null : 'ocupado';
    avisoArroba.dataset['tom'] = livre ? 'ok' : 'erro';
    avisoArroba.textContent = livre
      ? `@${nome} está livre. ${textoDasTrocas(true)}`
      : `@${nome} já é de alguém. Escolha outro.`;
    atualizarBarra();
  }

  function trocasRestantes(): number {
    return Math.max(0, MAX_USERNAME_CHANGES - trocasFeitas);
  }

  function textoDasTrocas(trocando = false): string {
    const n = trocasRestantes();
    if (trocando) return `Salvar gasta 1 das ${n} trocas que sobram.`;
    if (n === 0) return 'É por ele que te adicionam. Você já usou todas as trocas.';
    return `É por ele que te adicionam. Você ainda pode trocar ${n === 1 ? '1 vez' : `${n} vezes`}.`;
  }

  function secaoPerfil(): HTMLElement[] {
    const nome = el('input', {
      id: 'settings-nome',
      class: 'settings__input',
      type: 'text',
      maxlength: MAX_DISPLAY_NAME,
      autocomplete: 'nickname',
    });
    nome.value = atual.displayName;
    nome.addEventListener('input', () => {
      atual.displayName = nome.value;
      mudou();
    });

    const arroba = el('input', {
      id: 'settings-arroba',
      class: 'settings__input settings__input--arroba',
      type: 'text',
      maxlength: 20,
      autocomplete: 'off',
      spellcheck: 'false',
      autocapitalize: 'none',
    });
    arroba.value = atual.username;
    const semTrocas = trocasRestantes() === 0 || salvo.username === '';
    arroba.disabled = semTrocas;
    avisoArroba = el('p', { class: 'settings__help', id: 'settings-arroba-aviso', 'aria-live': 'polite' }, [
      salvo.username === '' ? 'Você ainda não tem um nome de usuário.' : textoDasTrocas(),
    ]);
    arroba.setAttribute('aria-describedby', 'settings-arroba-aviso');
    arroba.addEventListener('input', () => {
      const limpo = arroba.value.toLowerCase().replace(/^@+/, '').replace(/\s/g, '');
      if (limpo !== arroba.value) arroba.value = limpo;
      atual.username = limpo;
      mudou();
      void conferirArroba(limpo);
    });

    const contador = el('span', { class: 'settings__count' });
    const bio = el('textarea', {
      id: 'settings-bio',
      class: 'settings__input settings__textarea',
      maxlength: MAX_BIO,
      rows: 3,
      placeholder: 'Conte um pouco sobre você.',
    });
    bio.value = atual.bio;
    const contar = (): void => {
      contador.textContent = `${bio.value.length}/${MAX_BIO}`;
    };
    contar();
    bio.addEventListener('input', () => {
      atual.bio = bio.value;
      contar();
      mudou();
    });

    const cores = el('div', { class: 'settings__swatches', role: 'radiogroup', 'aria-label': 'Cor do cartão' });
    for (const id of CARD_COLOR_IDS) {
      const cor = CARD_COLORS[id];
      const botao = el('button', {
        class: 'settings__swatch',
        type: 'button',
        role: 'radio',
        title: cor.label,
        'aria-label': cor.label,
        'aria-checked': String(atual.accentId === id),
      });
      botao.style.setProperty('--swatch', cor.base);
      botao.addEventListener('click', () => {
        atual.accentId = id;
        for (const outro of cores.children) outro.setAttribute('aria-checked', String(outro === botao));
        mudou();
      });
      cores.append(botao);
    }

    const fontes = el('div', { class: 'settings__fonts', role: 'radiogroup', 'aria-label': 'Fonte do nome' });
    for (const id of NAME_FONT_IDS) {
      const rotulo = el('span', {}, [NAME_FONTS[id].label]);
      applyNameFont(rotulo, id);
      const botao = el(
        'button',
        { class: 'settings__font', type: 'button', role: 'radio', 'aria-checked': String(atual.fontId === id) },
        [rotulo],
      );
      botao.addEventListener('click', () => {
        atual.fontId = id;
        for (const outro of fontes.children) outro.setAttribute('aria-checked', String(outro === botao));
        mudou();
      });
      fontes.append(botao);
    }

    erroGeral = el('p', { class: 'settings__error', role: 'alert' });
    erroGeral.hidden = true;

    return [
      el('header', { class: 'settings__header' }, [
        el('h2', { class: 'settings__title' }, ['Perfil']),
        el('p', { class: 'settings__subtitle' }, ['Como as pessoas te veem no Loftchat.']),
      ]),
      el('div', { class: 'settings__row' }, [
        campo(
          'Nome de exibição',
          'settings-nome',
          nome,
          el('p', { class: 'settings__help' }, ['Aparece grande no seu cartão.']),
        ),
        campo(
          'Nome de usuário',
          'settings-arroba',
          el('div', { class: 'settings__arroba' }, [el('span', { 'aria-hidden': 'true' }, ['@']), arroba]),
          avisoArroba,
        ),
      ]),
      campo('Bio', 'settings-bio', bio, el('p', { class: 'settings__help' }, [`Até ${MAX_BIO} caracteres. `, contador])),
      el('div', { class: 'settings__field' }, [el('span', { class: 'settings__label' }, ['Cor do cartão']), cores]),
      el('div', { class: 'settings__field' }, [el('span', { class: 'settings__label' }, ['Fonte do nome']), fontes]),
      erroGeral,
    ];
  }

  async function salvarPerfil(): Promise<void> {
    if (salvando) return;
    const problema = displayNameProblem(atual.displayName) ?? bioProblem(atual.bio);
    if (problema !== null) {
      mostrarErro(problema);
      return;
    }
    salvando = true;
    atualizarBarra();
    mostrarErro(null);
    try {
      if (atual.username !== salvo.username) {
        await claimUsername(user.uid, atual.username, salvo.username, trocasFeitas);
        trocasFeitas += 1;
        salvo = { ...salvo, username: atual.username };
      }
      await saveProfile(user, atual);
      salvo = { ...atual, displayName: atual.displayName.trim(), bio: atual.bio.trim() };
      atual = { ...salvo };
      onSaved({
        displayName: salvo.displayName,
        initials: initials(salvo.displayName),
        username: salvo.username === '' ? undefined : salvo.username,
      });
      showToast('Perfil salvo.');
      salvando = false;
      mostrar('perfil');
    } catch (error) {
      salvando = false;
      mostrarErro(
        error instanceof UsernameTakenError
          ? `@${atual.username} já é de alguém. Escolha outro.`
          : error instanceof Error && error.message !== ''
            ? error.message
            : 'Não deu para salvar. Confira a internet e tente de novo.',
      );
      atualizarBarra();
    }
  }

  function mostrarErro(texto: string | null): void {
    if (erroGeral === null) return;
    erroGeral.hidden = texto === null;
    erroGeral.textContent = texto ?? '';
  }

  /* --- seção Conta e segurança ------------------------------------------- */

  function secaoConta(): HTMLElement[] {
    const email = user.email ?? '';
    const aviso = el('p', { class: 'settings__help', 'aria-live': 'polite' });
    const trocarSenha = el('button', { class: 'settings__button', type: 'button' }, ['Mandar link para trocar a senha']);
    trocarSenha.addEventListener('click', () => {
      trocarSenha.disabled = true;
      sendPasswordResetEmail(auth, email).then(
        () => {
          aviso.dataset['tom'] = 'ok';
          aviso.textContent = `Mandamos o link para ${email}. Confira também o spam.`;
        },
        () => {
          trocarSenha.disabled = false;
          aviso.dataset['tom'] = 'erro';
          aviso.textContent = 'Não deu para mandar agora. Tente de novo em alguns minutos.';
        },
      );
    });

    return [
      el('header', { class: 'settings__header' }, [
        el('h2', { class: 'settings__title' }, ['Conta e segurança']),
        el('p', { class: 'settings__subtitle' }, ['Só você vê o que está aqui.']),
      ]),
      el('div', { class: 'settings__field' }, [
        el('span', { class: 'settings__label' }, ['E-mail']),
        el('p', { class: 'settings__value' }, [email]),
        el('p', { class: 'settings__help' }, [
          user.emailVerified ? 'Confirmado.' : 'Ainda não confirmado.',
          ' É com ele que você entra.',
        ]),
      ]),
      el('div', { class: 'settings__field' }, [
        el('span', { class: 'settings__label' }, ['Senha']),
        el('p', { class: 'settings__help' }, ['Mandamos um link para o seu e-mail, e a senha nova é escolhida lá.']),
        trocarSenha,
        aviso,
      ]),
    ];
  }

  /* --- navegação ---------------------------------------------------------- */

  let secaoAtual: Secao = 'perfil';

  function mostrar(secao: Secao): void {
    secaoAtual = secao;
    for (const [qual, botao] of botoesDoMenu) {
      botao.classList.toggle('is-active', qual === secao);
      if (qual === secao) botao.setAttribute('aria-current', 'page');
      else botao.removeAttribute('aria-current');
    }
    dialog.classList.add('settings--secao-aberta');
    dialog.classList.toggle('settings--com-previa', secao === 'perfil');
    avisoArroba = null;
    erroGeral = null;
    erroDoArroba = null;
    checagem++;
    if (secao === 'perfil') {
      conteudo.replaceChildren(
        ...(carregado ? secaoPerfil() : [el('p', { class: 'settings__help' }, ['Carregando seu perfil…'])]),
      );
      desenharPrevia();
    } else {
      conteudo.replaceChildren(...secaoConta());
    }
    atualizarBarra();
  }

  /* --- abrir e fechar ----------------------------------------------------- */

  function fechar(forcar = false): void {
    if (!forcar && !barra.hidden) {
      // Alteração não salva: a barra pisca, a tela fica. Sem pop-up.
      barra.classList.remove('settings__bar--pisca');
      void barra.offsetWidth;
      barra.classList.add('settings__bar--pisca');
      return;
    }
    dialog.close();
  }

  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    fechar();
  });
  dialog.addEventListener('close', () => {
    dialog.remove();
    aberta = null;
  });

  document.body.append(dialog);
  dialog.showModal();
  mostrar('perfil');
  // No celular, abre na lista de seções; no computador, já no Perfil.
  if (window.matchMedia('(max-width: 768px)').matches) dialog.classList.remove('settings--secao-aberta');

  void publicProfile(user.uid)
    .catch(() => null)
    .then((perfil) => {
      if (aberta !== dialog) return;
      salvo = rascunhoDe(perfil, user);
      atual = { ...salvo };
      trocasFeitas = perfil?.usernameChanges ?? 0;
      carregado = true;
      if (secaoAtual === 'perfil') {
        const naLista = !dialog.classList.contains('settings--secao-aberta');
        mostrar('perfil');
        if (naLista) dialog.classList.remove('settings--secao-aberta');
      }
    });
}
