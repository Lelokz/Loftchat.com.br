import { avatarEl, el } from '../../lib/dom';
import {
  ACCENT_PRESETS,
  APP_FONT_IDS,
  APP_FONTS,
  DEFAULT_TEXT_SIZE,
  TEXT_SIZES,
  THEME_IDS,
  THEME_LABELS,
} from '../../lib/appearance';
import type { Appearance } from '../../lib/appearance';

/**
 * CONFIGURAÇÕES → APARÊNCIA (proposta A, etapa 5).
 *
 * Cada clique muda `atual` e chama `onChange`: as Configurações põem a
 * prévia no app INTEIRO na hora (inclusive nesta tela) e mostram a barra de
 * salvar. Nada aqui é redesenhado ao clicar — só os `aria-checked` mudam —,
 * então o foco do teclado não se perde.
 */
export function renderAppearanceSection(atual: Appearance, aoMudar: () => void): HTMLElement[] {
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
    previaDoChat(),
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

/* --- prévia -------------------------------------------------------------- */

/**
 * Duas mensagens de mentira com as MESMAS classes do chat de verdade
 * (message-list.css): o que se vê aqui é exatamente o que o chat vai ser.
 */
function previaDoChat(): HTMLElement {
  const deles = el('div', { class: 'message message--start message--end' }, [
    el('span', { class: 'message__avatar' }, [avatarEl('AN', 'sm')]),
    el('div', { class: 'message__bubble' }, [
      el('div', { class: 'message__meta' }, [
        el('span', { class: 'message__author', 'data-name-color': 'verde' }, ['Ana']),
        el('span', { class: 'message__time' }, ['20:14']),
      ]),
      el('p', { class: 'message__text' }, ['Alguém online pra uma partida?']),
    ]),
  ]);
  const minha = el('div', { class: 'message message--mine message--start message--end' }, [
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
    el('div', { class: 'aparencia-previa', 'aria-hidden': 'true' }, [deles, minha]),
  ]);
}
