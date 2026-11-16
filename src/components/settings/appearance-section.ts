import { avatarEl, el } from '../../lib/dom';
import {
  ACCENT_PRESETS,
  APP_FONT_IDS,
  APP_FONTS,
  DEFAULT_TEXT_SIZE,
  DENSITIES,
  MESSAGE_STYLES,
  MY_SIDES,
  TEXT_SIZES,
  THEME_IDS,
  THEME_LABELS,
} from '../../lib/appearance';
import type { Appearance, Density, MessageStyle, MySide } from '../../lib/appearance';
import { CHAVE_GERAL, DIM_MAX, DIM_PADRAO, paintChatBackground } from '../../lib/chat-background';
import type { ChatBackground } from '../../lib/chat-background';
import type { ImageKind } from '../../lib/images';
import { renderImageField } from './image-field';

/** O rascunho dos fundos do chat (etapa 5c) — as Configurações guardam e salvam. */
export interface FundoDoChat {
  /** Já leu os fundos salvos? */
  carregado: boolean;
  /** Rascunho: chave (`geral` ou id do canal) → fundo. Ausente = sem fundo. */
  fundos: Map<string, ChatBackground>;
  /** Para onde dá para escolher agora: sempre "todos"; o canal, se veio dele. */
  alvos: { chave: string; rotulo: string; nome: string }[];
  /** Qual alvo está escolhido (muda aqui). */
  alvo: string;
  originais: Map<ImageKind, File>;
  /** Algo no rascunho mudou (as Configurações atualizam a barra de salvar). */
  onChange: () => void;
}

/**
 * CONFIGURAÇÕES → APARÊNCIA (proposta A, etapa 5).
 *
 * Cada clique muda `atual` e chama `onChange`: as Configurações põem a
 * prévia no app INTEIRO na hora (inclusive nesta tela) e mostram a barra de
 * salvar. Nada aqui é redesenhado ao clicar — só os `aria-checked` mudam —,
 * então o foco do teclado não se perde.
 */
export function renderAppearanceSection(atual: Appearance, aoMudar: () => void, fundo: FundoDoChat): HTMLElement[] {
  // A bolinha "cor do tema" mostra a cor DO TEMA escolhido — não a livre que
  // está ligada no <html> — então acompanha a troca de tema.
  let doTema: HTMLElement | null = null;
  const onChange = (): void => {
    if (doTema !== null) doTema.dataset['tema'] = atual.theme;
    aoMudar();
  };
  const cores = blocoDaCor(atual, onChange);
  doTema = cores.querySelector<HTMLElement>('.aparencia-cores__tema');
  return [
    el('header', { class: 'settings__header' }, [
      el('h2', { class: 'settings__title' }, ['Aparência']),
      el('p', { class: 'settings__subtitle' }, [
        'Só na sua tela. Muda na hora para você ver; salve para guardar na conta (vale no PC e no celular).',
      ]),
    ]),
    blocoDoTema(atual, onChange),
    cores,
    blocoDaFonte(atual, onChange),
    blocoDoTamanho(atual, onChange),
    blocoDasMensagens(atual, onChange),
    ...comFundo(fundo),
  ];
}

function marcar(grupo: HTMLElement, escolhido: Element): void {
  for (const outro of grupo.querySelectorAll('[role="radio"]')) {
    outro.setAttribute('aria-checked', String(outro === escolhido));
  }
}

/* --- tema ---------------------------------------------------------------- */

function blocoDoTema(atual: Appearance, onChange: () => void): HTMLElement {
  const grupo = el('div', { class: 'aparencia-temas', role: 'radiogroup', 'aria-label': 'Tema' });
  for (const id of THEME_IDS) {
    // A miniatura usa as cores DO PRÓPRIO tema (tokens.css, .tema-amostra).
    const mini = el('span', { class: 'tema-amostra aparencia-temas__mini', 'data-tema': id, 'aria-hidden': 'true' }, [
      el('span', { class: 'aparencia-temas__trilho' }),
      el('span', { class: 'aparencia-temas__coluna' }, [el('span', { class: 'aparencia-temas__item' })]),
      el('span', { class: 'aparencia-temas__chat' }, [
        el('span', { class: 'aparencia-temas__balao' }),
        el('span', { class: 'aparencia-temas__balao aparencia-temas__balao--meu' }),
      ]),
    ]);
    const botao = el(
      'button',
      { class: 'aparencia-temas__opcao', type: 'button', role: 'radio', 'aria-checked': String(atual.theme === id) },
      [mini, el('span', { class: 'aparencia-temas__nome' }, [THEME_LABELS[id]])],
    );
    botao.addEventListener('click', () => {
      atual.theme = id;
      marcar(grupo, botao);
      onChange();
    });
    grupo.append(botao);
  }
  return el('div', { class: 'settings__field' }, [el('span', { class: 'settings__label' }, ['Tema']), grupo]);
}

/* --- cor de destaque ----------------------------------------------------- */

function blocoDaCor(atual: Appearance, onChange: () => void): HTMLElement {
  const grupo = el('div', { class: 'settings__swatches aparencia-cores', role: 'radiogroup', 'aria-label': 'Cor de destaque' });
  const ajuda = el('p', { class: 'settings__help' });
  const pronta = ACCENT_PRESETS.find((p) => p.hex === atual.accent);

  function explicar(): void {
    ajuda.textContent =
      atual.accent === ''
        ? 'A cor do próprio tema.'
        : 'Botões, suas mensagens e o que está selecionado. O texto em cima dela fica branco ou escuro, o que ler melhor.';
  }

  // "Do tema": a bolinha pinta com a cor de destaque do tema escolhido.
  const doTema = el('button', {
    class: 'settings__swatch aparencia-cores__tema tema-amostra',
    'data-tema': atual.theme,
    type: 'button',
    role: 'radio',
    title: 'Do tema',
    'aria-label': 'Cor do tema',
    'aria-checked': String(atual.accent === ''),
  });
  doTema.addEventListener('click', () => {
    atual.accent = '';
    marcar(grupo, doTema);
    explicar();
    onChange();
  });
  grupo.append(doTema);

  for (const cor of ACCENT_PRESETS) {
    const botao = el('button', {
      class: 'settings__swatch',
      type: 'button',
      role: 'radio',
      title: cor.label,
      'aria-label': cor.label,
      'aria-checked': String(atual.accent === cor.hex),
    });
    botao.style.setProperty('--swatch', cor.hex);
    botao.addEventListener('click', () => {
      atual.accent = cor.hex;
      marcar(grupo, botao);
      explicar();
      onChange();
    });
    grupo.append(botao);
  }

  // Cor livre: o seletor de cor do próprio sistema, dentro de uma bolinha.
  const livre = atual.accent !== '' && pronta === undefined;
  const entrada = el('input', {
    class: 'aparencia-cores__entrada',
    type: 'color',
    'aria-label': 'Escolher outra cor',
    value: livre ? atual.accent : '#7b3fe4',
  });
  const outra = el(
    'label',
    {
      class: 'settings__swatch aparencia-cores__livre',
      role: 'radio',
      title: 'Outra cor',
      'aria-checked': String(livre),
    },
    [entrada],
  );
  if (livre) outra.style.setProperty('--swatch', atual.accent);
  entrada.addEventListener('input', () => {
    atual.accent = entrada.value.toLowerCase();
    outra.style.setProperty('--swatch', atual.accent);
    marcar(grupo, outra);
    explicar();
    onChange();
  });
  grupo.append(outra);
  explicar();

  return el('div', { class: 'settings__field' }, [el('span', { class: 'settings__label' }, ['Cor de destaque']), grupo, ajuda]);
}

/* --- fonte do app -------------------------------------------------------- */

function blocoDaFonte(atual: Appearance, onChange: () => void): HTMLElement {
  const grupo = el('div', { class: 'settings__fonts', role: 'radiogroup', 'aria-label': 'Fonte do app' });
  for (const id of APP_FONT_IDS) {
    const rotulo = el('span', {}, [APP_FONTS[id].label]);
    rotulo.style.fontFamily = APP_FONTS[id].family;
    const botao = el(
      'button',
      { class: 'settings__font', type: 'button', role: 'radio', 'aria-checked': String(atual.font === id) },
      [rotulo],
    );
    botao.addEventListener('click', () => {
      atual.font = id;
      marcar(grupo, botao);
      onChange();
    });
    grupo.append(botao);
  }
  return el('div', { class: 'settings__field' }, [
    el('span', { class: 'settings__label' }, ['Fonte do app']),
    grupo,
    el('p', { class: 'settings__help' }, [
      '"Leitura fácil" foi feita para quem tem baixa visão: letras que não se confundem, como I, l e 1.',
    ]),
  ]);
}

/* --- tamanho do texto ---------------------------------------------------- */

function blocoDoTamanho(atual: Appearance, onChange: () => void): HTMLElement {
  const indice = Math.max(0, TEXT_SIZES.indexOf(atual.textSize as (typeof TEXT_SIZES)[number]));
  const valor = el('output', { class: 'aparencia-tamanho__valor', for: 'aparencia-tamanho' });
  const regua = el('input', {
    class: 'aparencia-tamanho__regua',
    id: 'aparencia-tamanho',
    type: 'range',
    min: 0,
    max: TEXT_SIZES.length - 1,
    step: 1,
    value: indice,
    'aria-label': 'Tamanho do texto das mensagens',
  });
  function escrever(): void {
    const px = TEXT_SIZES[Number(regua.value)] ?? DEFAULT_TEXT_SIZE;
    valor.textContent = px === DEFAULT_TEXT_SIZE ? `${px} px (padrão)` : `${px} px`;
    regua.setAttribute('aria-valuetext', `${px} pixels`);
  }
  regua.addEventListener('input', () => {
    atual.textSize = TEXT_SIZES[Number(regua.value)] ?? DEFAULT_TEXT_SIZE;
    escrever();
    onChange();
  });
  escrever();
  return el('div', { class: 'settings__field' }, [
    el('label', { class: 'settings__label', for: 'aparencia-tamanho' }, ['Tamanho do texto das mensagens']),
    el('div', { class: 'aparencia-tamanho' }, [
      el('span', { class: 'aparencia-tamanho__a aparencia-tamanho__a--p', 'aria-hidden': 'true' }, ['A']),
      regua,
      el('span', { class: 'aparencia-tamanho__a aparencia-tamanho__a--g', 'aria-hidden': 'true' }, ['A']),
      valor,
    ]),
  ]);
}

/* --- jeito das mensagens (etapa 5b) -------------------------------------- */

const ESTILOS: Record<MessageStyle, { titulo: string; texto: string }> = {
  baloes: { titulo: 'Balões', texto: 'Cada mensagem num balão; as suas na cor de destaque.' },
  lista: { titulo: 'Lista', texto: 'Sem balão, tudo à esquerda, nome em cima. Cabe mais.' },
};
const LADOS: Record<MySide, string> = { direita: 'À direita', esquerda: 'À esquerda' };
const DENSIDADES: Record<Density, string> = { confortavel: 'Confortável', compacto: 'Compacto' };

/** Botões de escolha simples (o mesmo visual das fontes). */
function opcoes<T extends string>(
  rotulo: string,
  ids: readonly T[],
  nomes: Record<T, string>,
  valor: () => T,
  escolher: (id: T) => void,
): HTMLElement {
  const grupo = el('div', { class: 'settings__fonts', role: 'radiogroup', 'aria-label': rotulo });
  for (const id of ids) {
    const botao = el(
      'button',
      { class: 'settings__font', type: 'button', role: 'radio', 'aria-checked': String(valor() === id) },
      [nomes[id]],
    );
    botao.addEventListener('click', () => {
      escolher(id);
      marcar(grupo, botao);
    });
    grupo.append(botao);
  }
  return grupo;
}

function blocoDasMensagens(atual: Appearance, onChange: () => void): HTMLElement {
  const lado = el('div', { class: 'settings__field' }, [
    el('span', { class: 'settings__label' }, ['Suas mensagens']),
    opcoes('Lado das suas mensagens', MY_SIDES, LADOS, () => atual.mySide, (id) => {
      atual.mySide = id;
      onChange();
    }),
  ]);
  // Na lista todas já ficam à esquerda: a escolha do lado some.
  lado.hidden = atual.messageStyle === 'lista';

  const estilos = el('div', { class: 'settings-abas', role: 'radiogroup', 'aria-label': 'Jeito das mensagens' });
  for (const id of MESSAGE_STYLES) {
    const linhas = [0, 1, 2].map((i) =>
      el('span', { class: `aparencia-msg__linha${i === 2 ? ' is-minha' : ''}` }, [
        el('span', { class: 'aparencia-msg__bola' }),
        el('span', { class: 'aparencia-msg__texto' }),
      ]),
    );
    const botao = el(
      'button',
      { class: 'settings-abas__opcao', type: 'button', role: 'radio', 'aria-checked': String(atual.messageStyle === id) },
      [
        el('span', { class: `aparencia-msg aparencia-msg--${id}`, 'aria-hidden': 'true' }, linhas),
        el('span', { class: 'settings-abas__titulo' }, [ESTILOS[id].titulo]),
        el('span', { class: 'settings-abas__texto' }, [ESTILOS[id].texto]),
      ],
    );
    botao.addEventListener('click', () => {
      atual.messageStyle = id;
      marcar(estilos, botao);
      lado.hidden = id === 'lista';
      onChange();
    });
    estilos.append(botao);
  }

  return el('div', { class: 'aparencia-mensagens' }, [
    el('div', { class: 'settings__field' }, [el('span', { class: 'settings__label' }, ['Mensagens']), estilos]),
    lado,
    el('div', { class: 'settings__field' }, [
      el('span', { class: 'settings__label' }, ['Espaçamento']),
      opcoes('Espaçamento das mensagens', DENSITIES, DENSIDADES, () => atual.density, (id) => {
        atual.density = id;
        onChange();
      }),
    ]),
  ]);
}

/* --- fundo do chat (etapa 5c) -------------------------------------------- */

/** O bloco do fundo e a prévia (que mostra o fundo do alvo escolhido). */
function comFundo(fundo: FundoDoChat): HTMLElement[] {
  const previa = previaDoChat();
  const caixa = previa.querySelector<HTMLElement>('.aparencia-previa')!;
  const bloco = el('div', { class: 'settings__field aparencia-fundo' });

  function desenhar(): void {
    const atual = fundo.fundos.get(fundo.alvo) ?? null;
    paintChatBackground(caixa, atual);
    if (!fundo.carregado) {
      bloco.replaceChildren(el('span', { class: 'settings__label' }, ['Fundo do chat']), el('p', { class: 'settings__help' }, ['Carregando…']));
      return;
    }
    const partes: (HTMLElement | false)[] = [el('span', { class: 'settings__label' }, ['Fundo do chat'])];

    if (fundo.alvos.length > 1) {
      const grupo = el('div', { class: 'settings__fonts', role: 'radiogroup', 'aria-label': 'Onde vale o fundo' });
      for (const a of fundo.alvos) {
        const b = el('button', { class: 'settings__font', type: 'button', role: 'radio', 'aria-checked': String(fundo.alvo === a.chave) }, [a.rotulo]);
        b.addEventListener('click', () => {
          fundo.alvo = a.chave;
          desenhar();
        });
        grupo.append(b);
      }
      partes.push(grupo);
    }

    const nomeDoAlvo = fundo.alvos.find((a) => a.chave === fundo.alvo)?.nome ?? '';
    partes.push(
      renderImageField({
        kind: 'chat',
        value: atual?.image ?? '',
        initials: '',
        originals: fundo.originais,
        onChange: (imagem) => {
          if (imagem === '') fundo.fundos.delete(fundo.alvo);
          else
            fundo.fundos.set(fundo.alvo, {
              image: imagem,
              dim: atual?.dim ?? DIM_PADRAO,
              label: nomeDoAlvo,
            });
          desenhar();
          fundo.onChange();
        },
      }),
    );

    if (atual !== null) {
      const valor = el('output', { class: 'aparencia-tamanho__valor', for: 'aparencia-veu' }, [`${atual.dim}%`]);
      const regua = el('input', {
        class: 'aparencia-tamanho__regua',
        id: 'aparencia-veu',
        type: 'range',
        min: 0,
        max: DIM_MAX,
        step: 5,
        value: atual.dim,
        'aria-label': 'Escurecer o fundo',
      });
      regua.addEventListener('input', () => {
        atual.dim = Number(regua.value);
        valor.textContent = `${atual.dim}%`;
        paintChatBackground(caixa, atual);
        fundo.onChange();
      });
      partes.push(
        el('label', { class: 'settings__label aparencia-fundo__sub', for: 'aparencia-veu' }, ['Escurecer']),
        el('div', { class: 'aparencia-tamanho' }, [regua, valor]),
      );
    }

    // Os outros canais que já têm fundo próprio: dá para tirar daqui.
    const outros = [...fundo.fundos].filter(([chave]) => chave !== CHAVE_GERAL && chave !== fundo.alvo);
    if (outros.length > 0) {
      const lista = el(
        'ul',
        { class: 'aparencia-fundo__lista', 'aria-label': 'Canais com fundo próprio' },
        outros.map(([chave, f]) => {
          const tirar = el('button', { class: 'settings__link', type: 'button', 'aria-label': `Tirar o fundo de ${f.label || 'canal'}` }, ['Tirar']);
          tirar.addEventListener('click', () => {
            fundo.fundos.delete(chave);
            desenhar();
            fundo.onChange();
          });
          const mini = el('span', { class: 'aparencia-fundo__mini' });
          mini.style.backgroundImage = `url("${f.image}")`;
          return el('li', { class: 'aparencia-fundo__item' }, [mini, el('span', { class: 'aparencia-fundo__nome' }, [f.label || 'Canal']), tirar]);
        }),
      );
      partes.push(el('span', { class: 'settings__label aparencia-fundo__sub' }, ['Canais com fundo próprio']), lista);
    }

    partes.push(
      el('p', { class: 'settings__help' }, [
        'Só na sua tela. O fundo de um canal ganha do geral. Para pôr num canal só: botão direito no canal (no celular, segure o dedo) → "Fundo deste canal".',
      ]),
    );
    bloco.replaceChildren(...partes.filter((p): p is HTMLElement => p !== false));
  }

  desenhar();
  return [bloco, previa];
}

/* --- prévia -------------------------------------------------------------- */

/**
 * Duas mensagens de mentira com as MESMAS classes do chat de verdade
 * (message-list.css): o que se vê aqui é exatamente o que o chat vai ser.
 */
function previaDoChat(): HTMLElement {
  const deles = el('div', { class: 'message message--start' }, [
    el('span', { class: 'message__avatar' }, [avatarEl('AN', 'sm')]),
    el('div', { class: 'message__bubble' }, [
      el('div', { class: 'message__meta' }, [
        el('span', { class: 'message__author', 'data-name-color': 'verde' }, ['Ana']),
        el('span', { class: 'message__time' }, ['20:14']),
      ]),
      el('p', { class: 'message__text' }, ['Alguém online pra uma partida?']),
    ]),
  ]);
  const deles2 = el('div', { class: 'message message--end' }, [
    el('span', { class: 'message__avatar' }),
    el('div', { class: 'message__bubble' }, [el('p', { class: 'message__text' }, ['Pode ser depois das 20h'])]),
  ]);
  const minha = el('div', { class: 'message message--mine message--start message--end' }, [
    el('span', { class: 'message__avatar message__avatar--mine' }, [avatarEl('VC', 'sm')]),
    el('div', { class: 'message__bubble' }, [
      el('div', { class: 'message__meta' }, [
        el('span', { class: 'message__author' }, ['Você']),
        el('span', { class: 'message__time' }, ['20:15']),
      ]),
      el('p', { class: 'message__text' }, ['Bora! Entro na voz em 5 minutos.']),
    ]),
  ]);
  return el('div', { class: 'settings__field' }, [
    el('span', { class: 'settings__label' }, ['Prévia']),
    el('div', { class: 'aparencia-previa', 'aria-hidden': 'true' }, [deles, deles2, minha]),
  ]);
}
