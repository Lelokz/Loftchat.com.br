import '../settings/settings.css';
import './group-settings.css';

import { el, iconEl } from '../../lib/dom';
import { arrowLeftIcon, closeIcon, gearIcon } from '../../lib/icons';
import { CARD_COLOR_IDS, CARD_COLORS, cardColorId } from '../../lib/person-theme';
import type { CardColorId } from '../../lib/person-theme';
import {
  groupDescriptionProblem,
  groupNameProblem,
  loadGroupBanner,
  saveGroupProfile,
} from '../../lib/group-profile';
import type { ImageKind } from '../../lib/images';
import { initials } from '../../lib/format';
import { MAX_GROUP_DESCRIPTION, MAX_GROUP_NAME } from '../../types/models';
import type { Group } from '../../types/models';
import { renderImageField } from '../settings/image-field';
import { renderGroupCard } from './group-card';
import { showToast } from '../toast/toast';

export interface GroupSettingsOptions {
  group: Group;
  memberCount: number;
}

interface Rascunho {
  name: string;
  description: string;
  accentId: CardColorId;
  photo: string;
  banner: string;
}

function iguais(a: Rascunho, b: Rascunho): boolean {
  return (
    a.name.trim() === b.name.trim() &&
    a.description.trim() === b.description.trim() &&
    a.accentId === b.accentId &&
    a.photo === b.photo &&
    a.banner === b.banner
  );
}

let aberta: HTMLDialogElement | null = null;

/**
 * CONFIGURAÇÕES DO GRUPO (proposta A, etapa 3a) — só o dono abre.
 *
 * Mesma casca das Configurações pessoais (settings.css): tela inteira por
 * cima do app, prévia ao vivo à direita, barra de salvar que pisca no Esc
 * em vez de pop-up. Por ora uma seção, "Visão geral": foto, banner, nome
 * (obrigatório), descrição e cor. Canais, categorias e boas-vindas entram
 * nas próximas partes da etapa 3.
 */
export function openGroupSettings(options: GroupSettingsOptions): void {
  if (aberta !== null) return;
  const { group, memberCount } = options;

  const dialog = el('dialog', {
    class: 'settings settings--com-previa settings--secao-aberta group-settings',
    'aria-label': 'Configurações do grupo',
  });
  aberta = dialog;

  let salvo: Rascunho = {
    name: group.name,
    description: group.description ?? '',
    accentId: cardColorId(group.accentId),
    photo: group.photo ?? '',
    banner: '',
  };
  let atual: Rascunho = { ...salvo };
  let carregado = false;
  let salvando = false;
  const originais = new Map<ImageKind, File>();

  /* --- casca --------------------------------------------------------------- */

  const visao = el('button', { class: 'settings__nav-item is-active', type: 'button', 'aria-current': 'page' }, [
    iconEl(gearIcon(18)),
    el('span', {}, ['Visão geral']),
  ]);
  const nomeNoMenu = el('span', { class: 'group-settings__nav-name' }, [group.name]);
  const menu = el('nav', { class: 'settings__nav', 'aria-label': 'Seções do grupo' }, [
    el('span', { class: 'settings__nav-label' }, ['Grupo']),
    nomeNoMenu,
    visao,
  ]);

  const conteudo = el('div', { class: 'settings__content' });
  const previa = el('aside', { class: 'settings__preview', 'aria-label': 'Prévia do grupo' });

  const fecharBotao = el('button', { class: 'settings__close icon-button', type: 'button', title: 'Fechar (Esc)' }, [
    iconEl(closeIcon(18)),
    el('span', { class: 'sr-only' }, ['Fechar configurações do grupo']),
  ]);
  fecharBotao.addEventListener('click', () => fechar());

  // No celular só há uma seção: "voltar" fecha.
  const voltar = el('button', { class: 'settings__back icon-button', type: 'button', title: 'Voltar' }, [
    iconEl(arrowLeftIcon(18)),
    el('span', { class: 'sr-only' }, ['Voltar para o grupo']),
  ]);
  voltar.addEventListener('click', () => fechar());

  const desfazer = el('button', { class: 'settings__bar-undo', type: 'button' }, ['Desfazer']);
  const salvar = el('button', { class: 'settings__bar-save', type: 'button' }, ['Salvar']);
  const barra = el('div', { class: 'settings__bar', role: 'region', 'aria-label': 'Alterações não salvas' }, [
    el('span', { class: 'settings__bar-text' }, ['Você tem alterações que não foram salvas.']),
    el('span', { class: 'settings__bar-actions' }, [desfazer, salvar]),
  ]);
  barra.hidden = true;
  desfazer.addEventListener('click', () => {
    atual = { ...salvo };
    desenhar();
  });
  salvar.addEventListener('click', () => void salvarGrupo());

  dialog.append(menu, el('main', { class: 'settings__main' }, [voltar, conteudo, barra]), previa, fecharBotao);

  /* --- conteúdo ------------------------------------------------------------ */

  let erroGeral: HTMLElement | null = null;

  function atualizarBarra(): void {
    barra.hidden = !(carregado && !iguais(atual, salvo));
    salvar.disabled = salvando;
    desfazer.disabled = salvando;
    salvar.textContent = salvando ? 'Salvando…' : 'Salvar';
  }

  function desenharPrevia(): void {
    previa.replaceChildren(
      el('span', { class: 'settings__preview-label' }, ['Prévia do grupo']),
      renderGroupCard({
        name: atual.name.trim() === '' ? 'Nome do grupo' : atual.name.trim(),
        description: atual.description,
        accentId: atual.accentId,
        photo: atual.photo,
        banner: atual.banner,
        memberCount,
      }),
    );
  }

  function mudou(): void {
    desenharPrevia();
    atualizarBarra();
  }

  function imagem(kind: 'grupo' | 'banner'): HTMLElement {
    const campo = kind === 'grupo' ? 'photo' : 'banner';
    return renderImageField({
      kind,
      value: atual[campo],
      initials: initials(atual.name.trim() || 'Grupo'),
      originals: originais,
      onChange: (url) => {
        atual[campo] = url;
        desenhar();
      },
    });
  }

  function visaoGeral(): HTMLElement[] {
    const nome = el('input', {
      id: 'grupo-nome',
      class: 'settings__input',
      type: 'text',
      maxlength: MAX_GROUP_NAME,
      required: true,
      autocomplete: 'off',
    });
    nome.value = atual.name;
    const avisoNome = el('p', { class: 'settings__help', id: 'grupo-nome-aviso' }, ['Obrigatório. Aparece na aba do grupo.']);
    nome.setAttribute('aria-describedby', 'grupo-nome-aviso');
    nome.addEventListener('input', () => {
      atual.name = nome.value;
      const problema = groupNameProblem(nome.value);
      avisoNome.dataset['tom'] = problema === null ? '' : 'erro';
      avisoNome.textContent = problema ?? 'Obrigatório. Aparece na aba do grupo.';
      nome.toggleAttribute('aria-invalid', problema !== null);
      mudou();
    });

    const contador = el('span', { class: 'settings__count' });
    const descricao = el('textarea', {
      id: 'grupo-descricao',
      class: 'settings__input settings__textarea',
      maxlength: MAX_GROUP_DESCRIPTION,
      rows: 3,
      placeholder: 'Sobre o que é o grupo? Regras, horários, o que for.',
    });
    descricao.value = atual.description;
    const contar = (): void => {
      contador.textContent = `${descricao.value.length}/${MAX_GROUP_DESCRIPTION}`;
    };
    contar();
    descricao.addEventListener('input', () => {
      atual.description = descricao.value;
      contar();
      mudou();
    });

    const cores = el('div', { class: 'settings__swatches', role: 'radiogroup', 'aria-label': 'Cor do grupo' });
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

    erroGeral = el('p', { class: 'settings__error', role: 'alert' });
    erroGeral.hidden = true;

    return [
      el('header', { class: 'settings__header' }, [
        el('h2', { class: 'settings__title' }, ['Visão geral']),
        el('p', { class: 'settings__subtitle' }, ['Como o grupo aparece para quem está nele.']),
      ]),
      el('div', { class: 'settings__field' }, [
        el('span', { class: 'settings__label' }, ['Imagens do grupo']),
        el('div', { class: 'settings__images group-settings__images' }, [imagem('grupo'), imagem('banner')]),
        el('p', { class: 'settings__help' }, ['A foto aparece na aba do grupo; o banner, no cartão do grupo.']),
      ]),
      el('div', { class: 'settings__field' }, [
        el('label', { class: 'settings__label', for: 'grupo-nome' }, ['Nome do grupo']),
        nome,
        avisoNome,
      ]),
      el('div', { class: 'settings__field' }, [
        el('label', { class: 'settings__label', for: 'grupo-descricao' }, ['Descrição']),
        descricao,
        el('p', { class: 'settings__help' }, [`Até ${MAX_GROUP_DESCRIPTION} caracteres. `, contador]),
      ]),
      el('div', { class: 'settings__field' }, [
        el('span', { class: 'settings__label' }, ['Cor do grupo']),
        cores,
        el('p', { class: 'settings__help' }, ['Fundo da aba quando o grupo não tem foto, e a faixa do cartão.']),
      ]),
      erroGeral,
    ];
  }

  function desenhar(): void {
    erroGeral = null;
    conteudo.replaceChildren(
      ...(carregado ? visaoGeral() : [el('p', { class: 'settings__help' }, ['Carregando o grupo…'])]),
    );
    desenharPrevia();
    atualizarBarra();
  }

  function mostrarErro(texto: string | null): void {
    if (erroGeral === null) return;
    erroGeral.hidden = texto === null;
    erroGeral.textContent = texto ?? '';
  }

  async function salvarGrupo(): Promise<void> {
    if (salvando) return;
    const problema = groupNameProblem(atual.name) ?? groupDescriptionProblem(atual.description);
    if (problema !== null) {
      mostrarErro(problema);
      return;
    }
    salvando = true;
    atualizarBarra();
    mostrarErro(null);
    try {
      await saveGroupProfile(group.id, atual, atual.banner !== salvo.banner);
      salvo = { ...atual, name: atual.name.trim(), description: atual.description.trim() };
      atual = { ...salvo };
      nomeNoMenu.textContent = salvo.name;
      showToast('Grupo salvo.');
      salvando = false;
      desenhar();
    } catch (error) {
      salvando = false;
      mostrarErro(
        error instanceof Error && error.message !== ''
          ? error.message
          : 'Não deu para salvar. Confira a internet e tente de novo.',
      );
      atualizarBarra();
    }
  }

  /* --- abrir e fechar (igual às Configurações pessoais) --------------------- */

  function fechar(): void {
    if (!barra.hidden) {
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
  // O Esc é nosso (ver o comentário em settings.ts: o Chrome engole Esc
  // depois de diálogos abertos sem clique, como o ajustador).
  const onKey = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    const abertos = document.querySelectorAll('dialog[open]');
    if (abertos[abertos.length - 1] !== dialog) return;
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
  desenhar();

  void loadGroupBanner(group.id)
    .catch(() => undefined)
    .then((banner) => {
      if (aberta !== dialog) return;
      salvo = { ...salvo, banner: banner ?? '' };
      atual = { ...salvo };
      carregado = true;
      desenhar();
    });
}
