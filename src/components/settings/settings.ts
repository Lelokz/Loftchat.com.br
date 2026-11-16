import './settings.css';

import { sendPasswordResetEmail } from 'firebase/auth';
import type { User } from 'firebase/auth';

import { auth } from '../../lib/firebase';
import { avatarEl, el, iconEl } from '../../lib/dom';
import { arrowLeftIcon, closeIcon, faceIcon, logoIcon, logoutIcon, shieldIcon } from '../../lib/icons';
import {
  CARD_COLOR_IDS,
  CARD_COLORS,
  cardColorId,
  NAME_COLOR_IDS,
  NAME_COLOR_LABELS,
  NAME_FONT_IDS,
  NAME_FONTS,
  applyNameFont,
  nameColorId,
  nameFontId,
} from '../../lib/person-theme';
import type { CardColorId, NameColorId, NameFontId } from '../../lib/person-theme';
import { bioProblem, displayNameProblem, extrasProblem, loadProfileArt, saveProfile } from '../../lib/profile';
import {
  activeStatus,
  linkProblem,
  MAX_LINKS,
  MAX_STATUS_TEXT,
  normalizeLink,
  STATUS_DURATIONS,
  STATUS_EMOJIS,
  statusUntil,
  untilLabel,
} from '../../lib/profile-extras';
import type { CustomStatus, StatusDurationId } from '../../lib/profile-extras';
import type { ProfileArt } from '../../lib/profile';
import type { ImageKind } from '../../lib/images';
import { renderImageField } from './image-field';
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
  onSaved: (perfil: {
    displayName: string;
    initials: string;
    username: string | undefined;
    photo: string | undefined;
  }) => void;
}

type Secao = 'perfil' | 'conta';

/** Os valores editáveis do Perfil — o "antes" e o "agora" da barra de salvar. */
interface Rascunho {
  displayName: string;
  username: string;
  bio: string;
  accentId: CardColorId;
  fontId: NameFontId;
  nameColor: NameColorId;
  /** Status (etapa 2d). '' nos dois = sem status. */
  statusEmoji: string;
  statusText: string;
  /** Por quanto tempo; 'manter' = o prazo que já está salvo (`statusUntil`). */
  statusDuracao: StatusDurationId | 'manter';
  statusUntil: number;
  /** Os links como a pessoa escreveu (normalizados só na hora de salvar). */
  links: string[];
  /** Imagens (data URL); '' = sem imagem. */
  photo: string;
  banner: string;
  cardBg: string;
}

function rascunhoDe(perfil: UserProfile | null, art: ProfileArt, user: User): Rascunho {
  // Status vencido = sem status (ele some sozinho, mesmo ainda no banco).
  const status = activeStatus(perfil?.customStatus);
  const links = [...(perfil?.links ?? [])];
  while (links.length < MAX_LINKS) links.push('');
  return {
    displayName: perfil?.displayName ?? user.displayName ?? '',
    username: perfil?.username ?? '',
    bio: perfil?.bio ?? '',
    accentId: cardColorId(perfil?.accentId),
    fontId: nameFontId(perfil?.fontId),
    nameColor: nameColorId(perfil?.nameColor),
    statusEmoji: status?.emoji ?? '',
    statusText: status?.text ?? '',
    statusDuracao: status === undefined ? 'hoje' : status.until === 0 ? 'nunca' : 'manter',
    statusUntil: status?.until ?? 0,
    links,
    photo: perfil?.photo ?? '',
    banner: art.banner ?? '',
    cardBg: art.cardBg ?? '',
  };
}

/** Qual campo do rascunho guarda cada imagem. */
const CAMPO_DA_IMAGEM = { foto: 'photo', banner: 'banner', fundo: 'cardBg' } as const;

function semStatus(r: Rascunho): boolean {
  return r.statusEmoji === '' && r.statusText.trim() === '';
}

/** O status do rascunho no formato do banco (o prazo é contado a partir de agora). */
function statusDoRascunho(r: Rascunho): CustomStatus | null {
  if (semStatus(r)) return null;
  const until = r.statusDuracao === 'manter' ? r.statusUntil : statusUntil(r.statusDuracao);
  return { emoji: r.statusEmoji, text: r.statusText.trim(), until };
}

function linksDoRascunho(r: Rascunho): string[] {
  return r.links.map(normalizeLink).filter((l) => l !== '');
}

function iguais(a: Rascunho, b: Rascunho): boolean {
  return (
    a.nameColor === b.nameColor &&
    a.statusEmoji === b.statusEmoji &&
    a.statusText.trim() === b.statusText.trim() &&
    (semStatus(a) || a.statusDuracao === b.statusDuracao) &&
    linksDoRascunho(a).join(' ') === linksDoRascunho(b).join(' ') &&
    a.displayName.trim() === b.displayName.trim() &&
    a.username === b.username &&
    a.bio.trim() === b.bio.trim() &&
    a.accentId === b.accentId &&
    a.fontId === b.fontId &&
    a.photo === b.photo &&
    a.banner === b.banner &&
    a.cardBg === b.cardBg
  );
}

/** Cópia do rascunho (a lista de links não pode ser a mesma nos dois). */
function copia(r: Rascunho): Rascunho {
  return { ...r, links: [...r.links] };
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

  let salvo: Rascunho = rascunhoDe(null, {}, user);
  let atual: Rascunho = copia(salvo);
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
    atual = copia(salvo);
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
        photo: atual.photo,
        banner: atual.banner,
        cardBg: atual.cardBg,
        customStatus: statusDoRascunho(atual) ?? undefined,
        links: linksDoRascunho(atual).filter((l) => linkProblem(l) === null),
      }),
      el('span', { class: 'settings__preview-label' }, ['Nas mensagens']),
      previaMensagem(nome),
    );
  }

  /** Uma mensagem de mentira, com o nome na cor escolhida. */
  function previaMensagem(nome: string): HTMLElement {
    const autor = el('span', { class: 'settings__msg-name' }, [nome]);
    if (atual.nameColor !== 'padrao') autor.style.color = `var(--nome-${atual.nameColor})`;
    return el('div', { class: 'settings__msg', 'aria-hidden': 'true' }, [
      avatarEl(initials(nome), 'sm', '', atual.photo === '' ? undefined : atual.photo),
      el('div', { class: 'settings__msg-bubble' }, [
        el('div', { class: 'settings__msg-meta' }, [autor, el('span', { class: 'settings__msg-time' }, ['agora'])]),
        el('p', { class: 'settings__msg-text' }, ['Bora jogar mais tarde?']),
      ]),
    ]);
  }

  /* --- imagens ------------------------------------------------------------ */

  /** Os arquivos originais escolhidos nesta visita (ver image-field.ts). */
  const originais = new Map<ImageKind, File>();

  function blocoDeImagem(kind: 'foto' | 'banner' | 'fundo'): HTMLElement {
    const campo = CAMPO_DA_IMAGEM[kind];
    return renderImageField({
      kind,
      value: atual[campo],
      initials: initials(atual.displayName.trim() || 'Seu nome'),
      originals: originais,
      onChange: (url) => {
        atual[campo] = url;
        mostrar('perfil');
      },
    });
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

    /* --- cor do nome nas mensagens (etapa 2d) --- */
    const coresDoNome = el('div', {
      class: 'settings__swatches',
      role: 'radiogroup',
      'aria-label': 'Cor do nome nas mensagens',
    });
    for (const id of NAME_COLOR_IDS) {
      const botao = el('button', {
        class: 'settings__swatch',
        type: 'button',
        role: 'radio',
        title: NAME_COLOR_LABELS[id],
        'aria-label': NAME_COLOR_LABELS[id],
        'aria-checked': String(atual.nameColor === id),
      });
      botao.style.setProperty('--swatch', id === 'padrao' ? 'var(--text-secondary)' : `var(--nome-${id})`);
      botao.addEventListener('click', () => {
        atual.nameColor = id;
        for (const outro of coresDoNome.children) outro.setAttribute('aria-checked', String(outro === botao));
        mudou();
      });
      coresDoNome.append(botao);
    }

    erroGeral = el('p', { class: 'settings__error', role: 'alert' });
    erroGeral.hidden = true;

    return [
      el('header', { class: 'settings__header' }, [
        el('h2', { class: 'settings__title' }, ['Perfil']),
        el('p', { class: 'settings__subtitle' }, ['Como as pessoas te veem no Loftchat.']),
      ]),
      el('div', { class: 'settings__field' }, [
        el('span', { class: 'settings__label' }, ['Imagens do perfil']),
        el('div', { class: 'settings__images' }, [
          blocoDeImagem('foto'),
          blocoDeImagem('banner'),
          blocoDeImagem('fundo'),
        ]),
        el('p', { class: 'settings__help' }, ['Arraste e aproxime cada uma no formato em que ela aparece.']),
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
      blocoDoStatus(),
      blocoDosLinks(),
      el('div', { class: 'settings__field' }, [el('span', { class: 'settings__label' }, ['Cor do cartão']), cores]),
      el('div', { class: 'settings__field' }, [el('span', { class: 'settings__label' }, ['Fonte do nome']), fontes]),
      el('div', { class: 'settings__field' }, [
        el('span', { class: 'settings__label' }, ['Cor do nome nas mensagens']),
        coresDoNome,
        el('p', { class: 'settings__help' }, ['É assim que os outros veem o seu nome quando você escreve.']),
      ]),
      erroGeral,
    ];
  }

  /* --- status (etapa 2d) ------------------------------------------------- */

  function blocoDoStatus(): HTMLElement {
    const emojiBotao = el('button', {
      class: 'settings__emoji-button',
      type: 'button',
      'aria-label': atual.statusEmoji === '' ? 'Escolher emoji do status' : `Emoji do status: ${atual.statusEmoji}. Trocar`,
      'aria-expanded': 'false',
      'aria-controls': 'settings-emojis',
    });
    if (atual.statusEmoji === '') emojiBotao.append(iconEl(faceIcon(20)));
    else emojiBotao.textContent = atual.statusEmoji;

    // A grade de emojis abre EMBAIXO, dentro da página — nada de janela por cima.
    const grade = el('div', { class: 'settings__emojis', id: 'settings-emojis', role: 'group', 'aria-label': 'Emojis' });
    grade.hidden = true;
    const escolher = (emoji: string): void => {
      atual.statusEmoji = emoji;
      mostrar('perfil');
      document.getElementById('settings-status')?.focus();
    };
    for (const emoji of STATUS_EMOJIS) {
      const b = el('button', { class: 'settings__emoji', type: 'button', 'aria-pressed': String(atual.statusEmoji === emoji) }, [
        emoji,
      ]);
      b.addEventListener('click', () => escolher(emoji));
      grade.append(b);
    }
    if (atual.statusEmoji !== '') {
      const sem = el('button', { class: 'settings__link settings__emojis-none', type: 'button' }, ['Sem emoji']);
      sem.addEventListener('click', () => escolher(''));
      grade.append(sem);
    }
    emojiBotao.addEventListener('click', () => {
      grade.hidden = !grade.hidden;
      emojiBotao.setAttribute('aria-expanded', String(!grade.hidden));
      if (!grade.hidden) grade.querySelector<HTMLButtonElement>('button')?.focus();
    });

    const texto = el('input', {
      id: 'settings-status',
      class: 'settings__input',
      type: 'text',
      maxlength: MAX_STATUS_TEXT,
      placeholder: 'O que você está fazendo?',
      autocomplete: 'off',
    });
    texto.value = atual.statusText;

    const prazo = el('select', { class: 'settings__input settings__select', 'aria-label': 'Limpar o status depois de' });
    if (atual.statusDuracao === 'manter' || salvo.statusDuracao === 'manter') {
      prazo.append(el('option', { value: 'manter' }, [`Manter (${untilLabel(salvo.statusUntil)})`]));
    }
    for (const { id, label } of STATUS_DURATIONS) prazo.append(el('option', { value: id }, [label]));
    prazo.value = atual.statusDuracao;
    prazo.addEventListener('change', () => {
      atual.statusDuracao = prazo.value as Rascunho['statusDuracao'];
      mudou();
    });

    const limpar = el('button', { class: 'settings__link', type: 'button' }, ['Limpar status']);
    limpar.hidden = semStatus(atual);
    limpar.addEventListener('click', () => {
      atual.statusEmoji = '';
      atual.statusText = '';
      mostrar('perfil');
    });
    texto.addEventListener('input', () => {
      atual.statusText = texto.value;
      limpar.hidden = semStatus(atual);
      mudou();
    });

    return el('div', { class: 'settings__field' }, [
      el('label', { class: 'settings__label', for: 'settings-status' }, ['Status']),
      el('div', { class: 'settings__status' }, [emojiBotao, texto, prazo]),
      grade,
      el('p', { class: 'settings__help' }, [
        'Aparece no seu cartão e na lista de membros. Some sozinho no prazo escolhido. ',
        limpar,
      ]),
    ]);
  }

  /* --- links (etapa 2d) -------------------------------------------------- */

  function blocoDosLinks(): HTMLElement {
    const linhas = atual.links.map((valor, i) => {
      const id = `settings-link-${i}`;
      const input = el('input', {
        id,
        class: 'settings__input',
        type: 'text',
        inputmode: 'url',
        autocomplete: 'url',
        spellcheck: 'false',
        autocapitalize: 'none',
        maxlength: 220,
        placeholder: i === 0 ? 'youtube.com/@voce' : 'Outro link (opcional)',
        'aria-label': `Link ${i + 1}`,
      });
      input.value = valor;
      const aviso = el('p', { class: 'settings__help', id: `${id}-aviso`, 'data-tom': 'erro' });
      aviso.hidden = true;
      input.setAttribute('aria-describedby', `${id}-aviso`);
      // O aviso aparece ao sair do campo (enquanto digita "you..." ainda não é link).
      const conferir = (): void => {
        const problema = linkProblem(normalizeLink(input.value));
        aviso.hidden = problema === null;
        aviso.textContent = problema ?? '';
        input.toggleAttribute('aria-invalid', problema !== null);
      };
      input.addEventListener('input', () => {
        atual.links[i] = input.value;
        if (!aviso.hidden) conferir();
        mudou();
      });
      input.addEventListener('blur', conferir);
      if (valor !== '') conferir();
      return el('div', { class: 'settings__link-row' }, [input, aviso]);
    });
    return el('div', { class: 'settings__field' }, [
      el('span', { class: 'settings__label' }, ['Links']),
      ...linhas,
      el('p', { class: 'settings__help' }, [`Até ${MAX_LINKS}: canal, rede social, site. Aparecem no seu cartão.`]),
    ]);
  }

  async function salvarPerfil(): Promise<void> {
    if (salvando) return;
    const problema =
      displayNameProblem(atual.displayName) ??
      bioProblem(atual.bio) ??
      extrasProblem({ customStatus: statusDoRascunho(atual), links: linksDoRascunho(atual) });
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
      const artChanged = atual.banner !== salvo.banner || atual.cardBg !== salvo.cardBg;
      const status = statusDoRascunho(atual);
      const links = linksDoRascunho(atual);
      await saveProfile(user, { ...atual, customStatus: status, links }, artChanged);
      while (links.length < MAX_LINKS) links.push('');
      salvo = {
        ...atual,
        displayName: atual.displayName.trim(),
        bio: atual.bio.trim(),
        statusText: status?.text ?? '',
        statusEmoji: status?.emoji ?? '',
        // Depois de salvo, o prazo vira "manter o que está salvo".
        statusDuracao: status === null ? 'hoje' : status.until === 0 ? 'nunca' : 'manter',
        statusUntil: status?.until ?? 0,
        links,
      };
      atual = copia(salvo);
      onSaved({
        displayName: salvo.displayName,
        initials: initials(salvo.displayName),
        username: salvo.username === '' ? undefined : salvo.username,
        photo: salvo.photo === '' ? undefined : salvo.photo,
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
  /*
   * O ESC É NOSSO, não só do navegador. O Chrome agrupa os "fechar com Esc"
   * de diálogos abertos sem clique da pessoa — o ajustador abre depois que o
   * arquivo é escolhido, sem clique — e, depois de alguns, o Esc seguinte era
   * engolido sem fechar nada (medido nos testes: o `cancel` nem disparava).
   * Só age quando as Configurações são o diálogo de cima e não há cartão
   * flutuante aberto.
   */
  const onKey = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    const abertos = document.querySelectorAll('dialog[open]');
    if (abertos[abertos.length - 1] !== dialog) return;
    if (document.querySelector('.person-popover') !== null) return;
    event.preventDefault();
    fechar();
  };
  document.addEventListener('keydown', onKey);

  dialog.addEventListener('close', () => {
    document.removeEventListener('keydown', onKey);
    dialog.remove();
    aberta = null;
  });

  document.body.append(dialog);
  dialog.showModal();
  mostrar('perfil');
  // No celular, abre na lista de seções; no computador, já no Perfil.
  if (window.matchMedia('(max-width: 768px)').matches) dialog.classList.remove('settings--secao-aberta');

  void Promise.all([
    publicProfile(user.uid).catch(() => null),
    loadProfileArt(user.uid).catch((): ProfileArt => ({})),
  ]).then(([perfil, art]) => {
      if (aberta !== dialog) return;
      salvo = rascunhoDe(perfil, art, user);
      atual = copia(salvo);
      trocasFeitas = perfil?.usernameChanges ?? 0;
      carregado = true;
      if (secaoAtual === 'perfil') {
        const naLista = !dialog.classList.contains('settings--secao-aberta');
        mostrar('perfil');
        if (naLista) dialog.classList.remove('settings--secao-aberta');
      }
    });
}
