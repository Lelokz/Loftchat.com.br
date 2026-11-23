import './choose-username.css';

import { el } from '../../lib/dom';
import { usernameProblem } from '../../lib/friends';
import { textoDoErro } from '../../lib/firestore-errors';

export interface ChooseUsernameProps {
  /** Rejeita com a mensagem a mostrar. */
  onChoose: (name: string) => Promise<void>;
  onSignOut: () => void;
  /** Já vem escrito no campo (o `@` do cadastro que não deu para reservar). */
  sugestao?: string;
  /** Por que esta tela apareceu — dito com todas as letras. */
  aviso?: string;
}

/**
 * Escolher o `@`, sem opção de pular.
 *
 * É o `@` que torna alguém encontrável — e-mail não é usado para busca, de
 * propósito: buscar por e-mail transformaria a lista de contatos de qualquer
 * pessoa num diretório do Loft inteiro.
 *
 * Quem já tinha conta antes da etapa 14 passa por aqui na primeira entrada.
 */
export function renderChooseUsername({
  onChoose,
  onSignOut,
  sugestao,
  aviso,
}: ChooseUsernameProps): HTMLElement {
  const campo = el('input', {
    class: 'username__input',
    type: 'text',
    id: 'username',
    autocomplete: 'off',
    spellcheck: 'false',
    placeholder: 'lelokz',
    'aria-label': 'Nome de usuário',
  }) as HTMLInputElement;

  if (sugestao !== undefined) campo.value = sugestao;

  const erro = el('p', { class: 'username__error', role: 'alert' }, [aviso ?? '']);

  const enviar = el('button', { class: 'username__submit', type: 'submit' }, [
    'Continuar',
  ]);

  const form = el('form', { class: 'username__form' }, [
    el('label', { class: 'username__label', for: 'username' }, ['Escolha seu nome de usuário']),
    el('div', { class: 'username__row' }, [el('span', { class: 'username__at' }, ['@']), campo]),
    el('p', { class: 'username__hint' }, [
      'De 3 a 20 caracteres: letras minúsculas, números, ponto e underline.',
    ]),
    erro,
    enviar,
  ]) as HTMLFormElement;

  /*
   * A validação de formato acontece enquanto se digita, mas o erro só aparece
   * DEPOIS da primeira tentativa. Reclamar da terceira letra de um nome que a
   * pessoa ainda está escrevendo é ruído, não ajuda.
   */
  let tentou = false;
  const revalidar = (): void => {
    if (!tentou) return;
    erro.textContent = usernameProblem(campo.value.trim().toLowerCase()) ?? '';
  };
  campo.addEventListener('input', revalidar);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    tentou = true;

    // Minúsculas SEMPRE: `Lelokz` e `lelokz` seriam nomes diferentes no banco e
    // a mesma coisa para quem lê — e essa confusão é material de golpe.
    const nome = campo.value.trim().toLowerCase();
    const problema = usernameProblem(nome);
    if (problema !== null) {
      erro.textContent = problema;
      return;
    }

    erro.textContent = '';
    enviar.setAttribute('disabled', 'true');
    enviar.textContent = 'Reservando…';

    void onChoose(nome)
      .catch((error: unknown) => {
        erro.textContent =
          textoDoErro(error, 'Não foi possível reservar esse nome.');
      })
      .finally(() => {
        enviar.removeAttribute('disabled');
        enviar.textContent = 'Continuar';
      });
  });

  const sair = el('button', { class: 'username__ghost', type: 'button' }, ['Sair da conta']);
  sair.addEventListener('click', onSignOut);

  return el('div', { class: 'screen' }, [
    el('div', { class: 'username' }, [
      el('h1', { class: 'username__title' }, ['Seu nome de usuário']),
      el('p', { class: 'username__text' }, [
        'É o @ que as pessoas usam para te adicionar como amigo. Ele aparece embaixo do seu nome, no seu cartão. Seu e-mail nunca é usado para busca.',
      ]),
      form,
      sair,
    ]),
  ]);
}
