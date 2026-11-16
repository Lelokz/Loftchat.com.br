import './empty-state.css';

import { el, iconEl } from '../../lib/dom';
import { logoIcon, plusIcon } from '../../lib/icons';

/**
 * Telas de "não há nada aqui".
 *
 * Cada uma tem um par próprio de estado carregando/vazio: quem chama só mostra
 * o vazio depois que o `loaded` correspondente virou true, senão a tela pisca
 * "nenhum grupo" antes dos dados chegarem.
 */

export interface NoGroupsProps {
  onCreateGroup: () => void;
  /**
   * Recebe o que a pessoa colou — link inteiro ou só o código.
   *
   * Devolve uma mensagem de erro para mostrar no campo, ou `null` quando
   * aceitou e já navegou.
   */
  onJoinByCode: (raw: string) => string | null;
}

/**
 * Conteúdo da coluna central quando não sou membro de nenhum grupo.
 *
 * Não é mais tela cheia: a barra de grupos, a coluna de canais e o rodapé
 * (com o "Sair da conta" de sempre) continuam montados por trás. Sem isso,
 * quem acabou de criar a conta e ainda não tem grupo ficava sem o único
 * caminho para o botão "Tela inicial" — que é exatamente de onde vem a
 * amizade, o único jeito de conseguir alguma coisa sem grupo nenhum.
 */
export function renderNoGroups({ onCreateGroup, onJoinByCode }: NoGroupsProps): HTMLElement {
  const createButton = el('button', { class: 'empty__action', type: 'button' }, [
    iconEl(plusIcon(16)),
    el('span', {}, ['Criar meu primeiro grupo']),
  ]);
  createButton.addEventListener('click', onCreateGroup);

  /*
   * Entrar por convite sem depender de clicar no link.
   *
   * O campo aceita o link inteiro OU só o código porque quem recebe um convite
   * cola o que estiver na mão — e não deveria precisar saber qual das duas
   * formas é a "certa". Só o formato é conferido aqui, sem ida ao servidor; se
   * passar, a tela de convite que já existe cuida do resto, inclusive de um
   * código bem formado que não corresponde a grupo nenhum.
   */
  const joinInput = el('input', {
    class: 'empty__join-input',
    type: 'text',
    id: 'join-code',
    placeholder: 'Cole o link ou o código do convite',
    autocomplete: 'off',
    autocapitalize: 'off',
    spellcheck: 'false',
  });

  const joinError = el('p', { class: 'empty__join-error', role: 'alert' });
  joinError.hidden = true;

  const joinButton = el('button', { class: 'empty__join-submit', type: 'submit' }, ['Entrar']);

  const joinForm = el('form', { class: 'empty__join', novalidate: true }, [
    el('label', { class: 'sr-only', for: 'join-code' }, ['Link ou código do convite']),
    el('div', { class: 'empty__join-row' }, [joinInput, joinButton]),
    joinError,
  ]);

  joinForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const problem = onJoinByCode(joinInput.value);
    joinError.textContent = problem ?? '';
    joinError.hidden = problem === null;
  });

  // Digitar de novo limpa o erro: ele falava do texto anterior.
  joinInput.addEventListener('input', () => {
    if (!joinError.hidden) joinError.hidden = true;
  });

  return el('div', { class: 'empty' }, [
    el('div', { class: 'empty__mark' }, [iconEl(logoIcon(26))]),
    el('h2', { class: 'empty__title' }, ['Nenhum grupo por aqui ainda']),
    el('p', { class: 'empty__text' }, [
      'Crie um grupo para começar, ou entre em um usando o convite que alguém te mandar.',
    ]),
    createButton,
    el('p', { class: 'empty__or' }, ['ou']),
    joinForm,
  ]);
}

/** Dentro da área de chat, quando o canal existe mas não tem mensagem. */
export function renderNoMessages(texto = 'Seja a primeira pessoa a falar neste canal.'): HTMLElement {
  return el('div', { class: 'empty' }, [
    el('p', { class: 'empty__title empty__title--small' }, ['Nenhuma mensagem ainda']),
    el('p', { class: 'empty__text' }, [texto]),
  ]);
}

/** Grupo sem nenhum canal — possível se alguém apagar todos. */
export function renderNoChannel(): HTMLElement {
  return el('div', { class: 'empty' }, [
    el('p', { class: 'empty__title empty__title--small' }, ['Este grupo não tem canais']),
    el('p', { class: 'empty__text' }, ['Crie um canal pelo menu ao lado do nome do grupo.']),
  ]);
}

/** Placeholder neutro enquanto os dados de uma coluna ainda não chegaram. */
export function renderLoading(label = 'Carregando…'): HTMLElement {
  return el('div', { class: 'empty' }, [el('p', { class: 'empty__text' }, [label])]);
}

/**
 * Falha ao LER as mensagens.
 *
 * Existe para "índice em construção" e "sem permissão" não virarem uma lista
 * vazia — que seria indistinguível de um canal realmente sem mensagens, e
 * mentiria para quem está olhando.
 */
export function renderMessagesError(message: string): HTMLElement {
  return el('div', { class: 'empty' }, [
    el('p', { class: 'empty__error' }, [message]),
  ]);
}
