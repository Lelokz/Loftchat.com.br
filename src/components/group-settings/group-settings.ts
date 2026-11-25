import '../settings/settings.css';
import { recalcularDepois } from '../../lib/cargos';
import './group-settings.css';

import { el, iconEl } from '../../lib/dom';
import { arrowLeftIcon, closeIcon, faceIcon, gearIcon, menuIcon, peopleIcon, shieldIcon } from '../../lib/icons';
import { criarSecaoCargos } from '../cargos/cargos-section';
import { fecharEscolhaDeCargos } from '../cargos/chips';
import { MAX_WELCOME, welcomeProblem } from '../../lib/welcome';
import { renderWelcomeCard } from '../welcome-card/welcome-card';
import { CARD_COLOR_IDS, CARD_COLORS, cardColorId } from '../../lib/person-theme';
import type { CardColorId } from '../../lib/person-theme';
import {
  categoryNameProblem,
  channelNameProblem,
  groupDescriptionProblem,
  groupNameProblem,
  loadGroupBanner,
  saveChannelLayout,
  saveGroupProfile,
} from '../../lib/group-profile';
import { draftsEqual, normalizeDraft, renderChannelsEditor } from './channels-editor';
import type { ChannelsDraft } from './channels-editor';
import type { ImageKind } from '../../lib/images';
import { initials } from '../../lib/format';
import { MAX_GROUP_DESCRIPTION, MAX_GROUP_NAME } from '../../types/models';
import type { Channel, Group } from '../../types/models';
import { renderImageField } from '../settings/image-field';
import { renderGroupCard } from './group-card';
import { showToast } from '../toast/toast';
import { textoDoErro } from '../../lib/firestore-errors';

export interface GroupSettingsOptions {
  group: Group;
  memberCount: number;
  /** Os canais do grupo, para a seção "Canais" (etapa 3b). */
  channels: Channel[];
  /** 0.8.5: quem abriu, o que pode (permissões do grupo) e "ver como cargo". */
  eu: string;
  pode: (perm: string) => boolean;
  aoVerComo: (cargoId: string) => void;
  /** 0.8.5 etapa 3: abre as permissões de um canal ou categoria (só no grupo aberto). */
  aoPermissoes?: (alvo: { canal: string } | { categoria: string; nome: string }) => void;
}

type Secao = 'visao' | 'canais' | 'cargos' | 'membros' | 'boas' | 'registro' | 'banidos' | 'comandos';

interface Rascunho {
  name: string;
  description: string;
  welcome: string;
  accentId: CardColorId;
  photo: string;
  banner: string;
}

function iguais(a: Rascunho, b: Rascunho): boolean {
  return (
    a.name.trim() === b.name.trim() &&
    a.description.trim() === b.description.trim() &&
    a.welcome.trim() === b.welcome.trim() &&
    a.accentId === b.accentId &&
    a.photo === b.photo &&
    a.banner === b.banner
  );
}

function copiaCanais(d: ChannelsDraft): ChannelsDraft {
  return { categories: d.categories.map((c) => ({ ...c })), channels: d.channels.map((c) => ({ ...c })) };
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
  let secao: Secao = 'visao';

  /* --- rascunho da seção Canais (etapa 3b) --- */
  let salvoCanais: ChannelsDraft = normalizeDraft({
    categories: group.categories ?? [],
    channels: options.channels.map((c) => ({ ...c })),
  });
  let atualCanais: ChannelsDraft = copiaCanais(salvoCanais);
  /** Como cada canal está NO BANCO — para gravar só o que mudou de verdade. */
  const noBanco = new Map(options.channels.map((c) => [c.id, { ...c }]));
  let categoriasNoBanco = (group.categories ?? []).map((c) => ({ ...c }));

  const dialog = el('dialog', {
    class: 'settings settings--com-previa settings--secao-aberta group-settings',
    'aria-label': 'Configurações do grupo',
  });
  aberta = dialog;

  let salvo: Rascunho = {
    name: group.name,
    description: group.description ?? '',
    welcome: group.welcome ?? '',
    accentId: cardColorId(group.accentId),
    photo: group.photo ?? '',
    banner: '',
  };
  let atual: Rascunho = { ...salvo };
  let carregado = false;
  let salvando = false;
  const originais = new Map<ImageKind, File>();

  /* --- casca --------------------------------------------------------------- */

  const visao = el('button', { class: 'settings__nav-item', type: 'button' }, [
    iconEl(gearIcon(18)),
    el('span', {}, ['Visão geral']),
  ]);
  const canaisBotao = el('button', { class: 'settings__nav-item', type: 'button' }, [
    iconEl(menuIcon(18)),
    el('span', {}, ['Canais']),
  ]);
  const boasBotao = el('button', { class: 'settings__nav-item', type: 'button' }, [
    iconEl(faceIcon(18)),
    el('span', {}, ['Boas-vindas']),
  ]);
  // 0.8.5: Cargos e Membros.
  const cargosBotao = el('button', { class: 'settings__nav-item', type: 'button' }, [
    iconEl(shieldIcon(18)),
    el('span', {}, ['Cargos']),
  ]);
  const membrosBotao = el('button', { class: 'settings__nav-item', type: 'button' }, [
    iconEl(peopleIcon(18)),
    el('span', {}, ['Membros']),
  ]);
  // 0.8.5 etapa 4: Registro e Banidos, na parte "Moderação".
  const registroBotao = el('button', { class: 'settings__nav-item', type: 'button' }, [
    el('span', { class: 'icon', 'aria-hidden': 'true' }, ['📜']),
    el('span', {}, ['Registro']),
  ]);
  const banidosBotao = el('button', { class: 'settings__nav-item', type: 'button' }, [
    el('span', { class: 'icon', 'aria-hidden': 'true' }, ['🚫']),
    el('span', {}, ['Banidos']),
  ]);
  const comandosBotao = el('button', { class: 'settings__nav-item', type: 'button' }, [
    el('span', { class: 'icon', 'aria-hidden': 'true' }, ['⌘']),
    el('span', {}, ['Comandos']),
  ]);
  comandosBotao.addEventListener('click', () => irPara('comandos'));
  registroBotao.addEventListener('click', () => irPara('registro'));
  banidosBotao.addEventListener('click', () => irPara('banidos'));
  cargosBotao.addEventListener('click', () => irPara('cargos'));
  membrosBotao.addEventListener('click', () => irPara('membros'));
  boasBotao.addEventListener('click', () => irPara('boas'));
  visao.addEventListener('click', () => irPara('visao'));
  canaisBotao.addEventListener('click', () => irPara('canais'));

  function irPara(nova: Secao): void {
    // Cargo com mudança não salva: não sai da seção (a barra pisca).
    if (secao === 'cargos' && nova !== 'cargos' && cargosSecao.sujo()) {
      piscarBarra();
      return;
    }
    secao = nova;
    dialog.classList.add('settings--secao-aberta');
    desenhar();
  }
  // 0.8.5: cada seção só aparece para quem pode mexer nela.
  const p = options.pode;
  const podeVisao = ['editar-nome', 'editar-foto', 'editar-banner', 'editar-descricao', 'editar-cor'].some(p);
  const podeCanais = ['editar-canais', 'ordenar-canais', 'gerenciar-categorias', 'permissoes-canais'].some(p);
  const podeCargos = p('gerenciar-cargos') || p('dar-cargos');
  const podeMembros = ['dar-cargos', 'expulsar', 'banir', 'castigo'].some(p);
  const podeBoas = p('editar-boas-vindas');
  visao.hidden = !podeVisao;
  canaisBotao.hidden = !podeCanais;
  cargosBotao.hidden = !podeCargos;
  membrosBotao.hidden = !podeMembros;
  boasBotao.hidden = !podeBoas;
  secao = podeVisao ? 'visao' : podeCanais ? 'canais' : podeCargos ? 'cargos' : podeMembros ? 'membros' : 'boas';
  const podeComandos = p('criar-comandos') || p('gerenciar-comandos');
  comandosBotao.hidden = !podeComandos;
  const podeRegistro = p('ver-registro');
  const podeBanidos = p('banir') || p('desbanir');
  registroBotao.hidden = !podeRegistro;
  banidosBotao.hidden = !podeBanidos;
  const rotuloModeracao = el('span', { class: 'settings__nav-label', hidden: !podeRegistro && !podeBanidos }, ['Moderação']);
  if (!podeVisao && !podeCanais && !podeCargos && !podeMembros && !podeBoas) secao = podeComandos ? 'comandos' : podeRegistro ? 'registro' : 'banidos';
  const nomeNoMenu = el('span', { class: 'group-settings__nav-name' }, [group.name]);
  const menu = el('nav', { class: 'settings__nav', 'aria-label': 'Seções do grupo' }, [
    el('span', { class: 'settings__nav-label' }, ['Grupo']),
    nomeNoMenu,
    visao,
    canaisBotao,
    cargosBotao,
    membrosBotao,
    comandosBotao,
    boasBotao,
    rotuloModeracao,
    registroBotao,
    banidosBotao,
  ]);

  const conteudo = el('div', { class: 'settings__content' });
  const previa = el('aside', { class: 'settings__preview', 'aria-label': 'Prévia do grupo' });

  const fecharBotao = el('button', { class: 'settings__close icon-button', type: 'button', title: 'Fechar (Esc)' }, [
    iconEl(closeIcon(18)),
    el('span', { class: 'sr-only' }, ['Fechar configurações do grupo']),
  ]);
  fecharBotao.addEventListener('click', () => fechar());

  // No celular, "voltar" mostra a lista de seções.
  const voltar = el('button', { class: 'settings__back icon-button', type: 'button', title: 'Voltar' }, [
    iconEl(arrowLeftIcon(18)),
    el('span', { class: 'sr-only' }, ['Voltar para as seções']),
  ]);
  voltar.addEventListener('click', () => dialog.classList.remove('settings--secao-aberta'));

  const desfazer = el('button', { class: 'settings__bar-undo', type: 'button' }, ['Desfazer']);
  const salvar = el('button', { class: 'settings__bar-save', type: 'button' }, ['Salvar']);
  const barra = el('div', { class: 'settings__bar', role: 'region', 'aria-label': 'Alterações não salvas' }, [
    el('span', { class: 'settings__bar-text' }, ['Você tem alterações que não foram salvas.']),
    el('span', { class: 'settings__bar-actions' }, [desfazer, salvar]),
  ]);
  barra.hidden = true;
  desfazer.addEventListener('click', () => {
    atual = { ...salvo };
    atualCanais = copiaCanais(salvoCanais);
    cargosSecao.desfazer();
    desenhar();
  });
  salvar.addEventListener('click', () => void salvarGrupo());

  dialog.append(menu, el('main', { class: 'settings__main' }, [voltar, conteudo, barra]), previa, fecharBotao);

  /* --- cargos e membros (0.8.5) ------------------------------------------- */

  const cargosSecao = criarSecaoCargos({
    groupId: group.id,
    ownerId: group.ownerId,
    eu: options.eu,
    grupo: group,
    aoVerComo: (cargoId) => {
      dialog.close();
      options.aoVerComo(cargoId);
    },
    redesenhar: () => {
      if (aberta === dialog && (secao === 'cargos' || secao === 'membros' || secao === 'registro' || secao === 'banidos' || secao === 'comandos')) desenhar();
      else atualizarBarra();
    },
    mudou: () => atualizarBarra(),
    piscar: () => piscarBarra(),
  });

  /* --- conteúdo ------------------------------------------------------------ */

  let erroGeral: HTMLElement | null = null;

  function atualizarBarra(): void {
    barra.hidden = !(carregado && (!iguais(atual, salvo) || !draftsEqual(atualCanais, salvoCanais) || cargosSecao.sujo()));
    salvar.disabled = salvando;
    desfazer.disabled = salvando;
    salvar.textContent = salvando ? 'Salvando…' : 'Salvar';
  }

  function desenharPrevia(): void {
    if (secao === 'boas') {
      const nome = atual.name.trim() || 'Nome do grupo';
      previa.replaceChildren(
        el('span', { class: 'settings__preview-label' }, ['Quem entra vê no topo do chat']),
        atual.welcome.trim() === ''
          ? el('p', { class: 'settings__help' }, ['Sem texto, ninguém vê cartão nenhum.'])
          : renderWelcomeCard({
              group: { name: nome, initials: initials(nome), accentId: atual.accentId, ...(atual.photo === '' ? {} : { photo: atual.photo }) },
              text: atual.welcome,
            }),
      );
      return;
    }
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

    // 0.8.5: cada campo com a sua permissão.
    nome.disabled = !p('editar-nome');
    descricao.disabled = !p('editar-descricao');
    if (!p('editar-cor')) for (const b of cores.querySelectorAll('button')) b.disabled = true;
    const fotoCampo = imagem('grupo');
    const bannerCampo = imagem('banner');
    fotoCampo.classList.toggle('gs-travado', !p('editar-foto'));
    bannerCampo.classList.toggle('gs-travado', !p('editar-banner'));

    return [
      el('header', { class: 'settings__header' }, [
        el('h2', { class: 'settings__title' }, ['Visão geral']),
        el('p', { class: 'settings__subtitle' }, ['Como o grupo aparece para quem está nele.']),
      ]),
      el('div', { class: 'settings__field' }, [
        el('span', { class: 'settings__label' }, ['Imagens do grupo']),
        el('div', { class: 'settings__images group-settings__images' }, [fotoCampo, bannerCampo]),
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

  function boasVindas(): HTMLElement[] {
    const contador = el('span', { class: 'settings__count' });
    const texto = el('textarea', {
      id: 'grupo-boas-vindas',
      class: 'settings__input settings__textarea',
      maxlength: MAX_WELCOME,
      rows: 6,
      placeholder: 'Ex.: Leia o #anúncios. Partida toda sexta às 20h na Sala Principal.',
    });
    texto.value = atual.welcome;
    const contar = (): void => {
      contador.textContent = `${texto.value.length}/${MAX_WELCOME}`;
    };
    contar();
    texto.addEventListener('input', () => {
      atual.welcome = texto.value;
      contar();
      mudou();
    });
    erroGeral = el('p', { class: 'settings__error', role: 'alert' });
    erroGeral.hidden = true;
    return [
      el('header', { class: 'settings__header' }, [
        el('h2', { class: 'settings__title' }, ['Boas-vindas']),
        el('p', { class: 'settings__subtitle' }, [
          'Quem entra no grupo vê este texto num cartão no topo do chat, até tocar em "Entendi".',
        ]),
      ]),
      el('div', { class: 'settings__field' }, [
        el('label', { class: 'settings__label', for: 'grupo-boas-vindas' }, ['Texto de boas-vindas']),
        texto,
        el('p', { class: 'settings__help' }, [`Até ${MAX_WELCOME} caracteres. Deixe vazio para não mostrar nada. `, contador]),
      ]),
      erroGeral,
    ];
  }

  function desenhar(refocus?: string): void {
    erroGeral = null;
    for (const [qual, botao] of [['visao', visao], ['canais', canaisBotao], ['cargos', cargosBotao], ['membros', membrosBotao], ['boas', boasBotao], ['registro', registroBotao], ['banidos', banidosBotao], ['comandos', comandosBotao]] as const) {
      botao.classList.toggle('is-active', qual === secao);
      if (qual === secao) botao.setAttribute('aria-current', 'page');
      else botao.removeAttribute('aria-current');
    }
    const largo = secao === 'cargos' || secao === 'membros' || secao === 'registro' || secao === 'banidos' || secao === 'comandos';
    dialog.classList.toggle('settings--com-previa', secao !== 'canais' && !largo);
    dialog.classList.toggle('group-settings--larga', largo);
    const rolagem = conteudo.scrollTop;
    if (!carregado) {
      conteudo.replaceChildren(el('p', { class: 'settings__help' }, ['Carregando o grupo…']));
    } else if (largo) {
      // Quem está digitando continua no mesmo campo quando a tela redesenha.
      const ativo = document.activeElement;
      const foco = (ativo instanceof HTMLInputElement || ativo instanceof HTMLTextAreaElement) && conteudo.contains(ativo) ? ativo : null;
      const idDoFoco = foco?.id ?? '';
      const posicao = foco?.selectionStart ?? null;
      erroGeral = el('p', { class: 'settings__error', role: 'alert' });
      erroGeral.hidden = true;
      const partes =
        secao === 'cargos'
          ? cargosSecao.cargos()
          : secao === 'membros'
            ? cargosSecao.membros()
            : secao === 'registro'
              ? cargosSecao.registro()
              : secao === 'comandos'
                ? cargosSecao.comandos()
                : cargosSecao.banidos();
      conteudo.replaceChildren(...partes, erroGeral);
      conteudo.scrollTop = rolagem;
      if (idDoFoco !== '') {
        const de = document.getElementById(idDoFoco);
        if (de instanceof HTMLInputElement || de instanceof HTMLTextAreaElement) {
          de.focus();
          if (posicao !== null) de.setSelectionRange(posicao, posicao);
        }
      }
    } else if (secao === 'visao') {
      conteudo.replaceChildren(...visaoGeral());
    } else if (secao === 'boas') {
      conteudo.replaceChildren(...boasVindas());
    } else {
      erroGeral = el('p', { class: 'settings__error', role: 'alert' });
      erroGeral.hidden = true;
      conteudo.replaceChildren(
        ...renderChannelsEditor({
          pode: { nomes: p('editar-canais'), ordem: p('ordenar-canais') || p('editar-canais'), categorias: p('gerenciar-categorias') },
          ...(options.aoPermissoes !== undefined && p('permissoes-canais') ? { aoPermissoes: options.aoPermissoes } : {}),
          draft: atualCanais,
          onChange: (draft, foco) => {
            atualCanais = draft;
            desenhar(foco);
          },
          onTextChange: () => atualizarBarra(),
        }),
        erroGeral,
      );
      conteudo.scrollTop = rolagem;
      if (refocus === 'cat-nova') {
        const nomes = conteudo.querySelectorAll<HTMLInputElement>('.gc-cat-name');
        const ultimo = nomes[nomes.length - 1];
        ultimo?.focus();
        ultimo?.select();
      } else if (refocus !== undefined) {
        document.getElementById(refocus)?.focus();
      }
    }
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
    const problema =
      groupNameProblem(atual.name) ??
      groupDescriptionProblem(atual.description) ??
      welcomeProblem(atual.welcome) ??
      atualCanais.categories.map((c) => categoryNameProblem(c.name)).find((p) => p !== null) ??
      atualCanais.channels.map((c) => channelNameProblem(c.name)).find((p) => p !== null) ??
      null;
    if (problema !== null) {
      mostrarErro(problema);
      return;
    }
    salvando = true;
    atualizarBarra();
    mostrarErro(null);
    try {
      if (cargosSecao.sujo()) await cargosSecao.salvar();
      if (!iguais(atual, salvo)) await saveGroupProfile(group.id, atual, atual.banner !== salvo.banner);
      if (!draftsEqual(atualCanais, salvoCanais)) {
        const categoriasMudaram =
          JSON.stringify(atualCanais.categories.map((c) => [c.id, c.name.trim()])) !==
          JSON.stringify(categoriasNoBanco.map((c) => [c.id, c.name]));
        const mudados = atualCanais.channels
          .filter((c) => {
            const antes = noBanco.get(c.id);
            return (
              antes === undefined ||
              antes.name !== c.name.trim() ||
              (antes.emoji ?? '') !== (c.emoji ?? '') ||
              (antes.categoryId ?? '') !== (c.categoryId ?? '') ||
              antes.position !== c.position
            );
          })
          .map((c) => ({
            id: c.id,
            name: c.name,
            emoji: c.emoji ?? '',
            categoryId: c.categoryId ?? '',
            position: c.position,
          }));
        await saveChannelLayout(group.id, atualCanais.categories, categoriasMudaram, mudados);
        recalcularDepois(group.id);
        for (const c of atualCanais.channels) noBanco.set(c.id, { ...c, name: c.name.trim() });
        categoriasNoBanco = atualCanais.categories.map((c) => ({ id: c.id, name: c.name.trim() }));
        salvoCanais = normalizeDraft({ categories: categoriasNoBanco, channels: [...noBanco.values()] });
        atualCanais = copiaCanais(salvoCanais);
      }
      salvo = { ...atual, name: atual.name.trim(), description: atual.description.trim(), welcome: atual.welcome.trim() };
      atual = { ...salvo };
      nomeNoMenu.textContent = salvo.name;
      showToast('Grupo salvo.');
      salvando = false;
      desenhar();
    } catch (error) {
      salvando = false;
      mostrarErro(textoDoErro(error, 'Não deu para salvar.'));
      atualizarBarra();
    }
  }

  /* --- abrir e fechar (igual às Configurações pessoais) --------------------- */

  function piscarBarra(): void {
    atualizarBarra();
    barra.classList.remove('settings__bar--pisca');
    void barra.offsetWidth;
    barra.classList.add('settings__bar--pisca');
  }

  function fechar(): void {
    if (!barra.hidden) {
      piscarBarra();
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
    cargosSecao.parar();
    fecharEscolhaDeCargos();
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
