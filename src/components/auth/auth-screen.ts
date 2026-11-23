import './auth-screen.css';

import { el, iconEl } from '../../lib/dom';
import { usernameProblem } from '../../lib/friends';
import { logoIcon } from '../../lib/icons';
import { textoDoErro } from '../../lib/firestore-errors';

export interface AuthScreenProps {
  /** Rejeita com um Error cuja `message` já está traduzida para português. */
  onSignIn(email: string, password: string): Promise<void>;
  onSignUp(displayName: string, username: string, email: string, password: string): Promise<void>;
  /** O `@` está livre? Usado para avisar enquanto a pessoa digita. */
  checkUsername(name: string): Promise<boolean>;
  /**
   * Manda o link de recuperação. NUNCA rejeita por e-mail inexistente.
   *
   * Quem chama já responde a mesma coisa para endereço que existe e endereço
   * que não existe — ver `handlePasswordReset` em main.ts.
   */
  onResetPassword(email: string): Promise<void>;
}

type Mode = 'signIn' | 'signUp';

const LABELS: Record<Mode, { submit: string; busy: string; toggle: string; hint: string }> = {
  signIn: {
    submit: 'Entrar',
    busy: 'Entrando…',
    toggle: 'Criar conta',
    hint: 'Ainda não tem conta?',
  },
  signUp: {
    submit: 'Criar conta',
    busy: 'Criando conta…',
    toggle: 'Entrar',
    hint: 'Já tem uma conta?',
  },
};

/**
 * Tela de login / cadastro.
 *
 * Este componente NÃO conhece o Firebase: recebe callbacks e exibe a mensagem de
 * erro que eles rejeitarem. Ele cuida só de DOM, alternância de modo, validação
 * de campo vazio e estado de carregando.
 */
export function renderAuthScreen({
  onSignIn,
  onSignUp,
  checkUsername,
  onResetPassword,
}: AuthScreenProps): HTMLElement {
  let mode: Mode = 'signIn';
  let busy = false;

  const nameInput = el('input', {
    class: 'auth__input',
    id: 'auth-name',
    name: 'displayName',
    type: 'text',
    autocomplete: 'name',
    placeholder: 'Como você aparece para os outros',
  });

  const emailInput = el('input', {
    class: 'auth__input',
    id: 'auth-email',
    name: 'email',
    type: 'email',
    autocomplete: 'email',
    placeholder: 'voce@exemplo.com',
  });

  const passwordInput = el('input', {
    class: 'auth__input',
    id: 'auth-current-password',
    name: 'current-password',
    type: 'password',
    autocomplete: 'current-password',
    placeholder: 'Pelo menos 6 caracteres',
  });

  const nameField = el('div', { class: 'auth__field' }, [
    el('label', { class: 'auth__label', for: 'auth-name' }, ['Nome de exibição']),
    nameInput,
  ]);
  nameField.hidden = true;

  /*
   * O `@` nasce NO CADASTRO, junto do nome de exibição — e os dois ficam
   * claros: um é como te VEEM, o outro é como te ACHAM. Antes o `@` vinha numa
   * tela separada depois do cadastro e nunca mais aparecia; quem esquecia o que
   * digitou não tinha como descobrir.
   */
  const usernameInput = el('input', {
    class: 'auth__input auth__input--at',
    id: 'auth-username',
    name: 'username',
    type: 'text',
    autocomplete: 'off',
    spellcheck: 'false',
    autocapitalize: 'off',
    placeholder: 'lelokz',
  }) as HTMLInputElement;
  const USERNAME_HINT = 'É por ele que as pessoas te adicionam como amigo.';
  const usernameStatus = el('p', { class: 'auth__note', id: 'auth-username-status' }, [
    USERNAME_HINT,
  ]);
  const usernameField = el('div', { class: 'auth__field' }, [
    el('label', { class: 'auth__label', for: 'auth-username' }, ['Nome de usuário']),
    el('div', { class: 'auth__at-row' }, [el('span', { class: 'auth__at' }, ['@']), usernameInput]),
    usernameStatus,
  ]);
  usernameField.hidden = true;

  const confirmInput = el('input', {
    class: 'auth__input',
    id: 'auth-confirm-password',
    name: 'confirm-password',
    type: 'password',
    autocomplete: 'new-password',
    placeholder: 'Digite a senha de novo',
  }) as HTMLInputElement;
  const confirmField = el('div', { class: 'auth__field' }, [
    el('label', { class: 'auth__label', for: 'auth-confirm-password' }, ['Repetir senha']),
    confirmInput,
  ]);
  confirmField.hidden = true;

  /* Aviso enquanto digita: regra do nome primeiro, depois se está livre. */
  let checagem = 0;
  let timerChecagem = 0;
  function setUsernameStatus(texto: string, tom: 'neutro' | 'ok' | 'erro'): void {
    usernameStatus.textContent = texto;
    usernameStatus.dataset['tom'] = tom;
  }
  usernameInput.addEventListener('input', () => {
    window.clearTimeout(timerChecagem);
    const nome = usernameInput.value.trim().toLowerCase();
    if (nome === '') {
      setUsernameStatus(USERNAME_HINT, 'neutro');
      return;
    }
    const problema = usernameProblem(nome);
    if (problema !== null) {
      setUsernameStatus(problema, 'erro');
      return;
    }
    setUsernameStatus('Conferindo…', 'neutro');
    const minha = ++checagem;
    timerChecagem = window.setTimeout(() => {
      void checkUsername(nome)
        .then((livre) => {
          if (minha !== checagem) return;
          setUsernameStatus(
            livre ? `@${nome} está livre.` : `@${nome} já é de alguém. Escolha outro.`,
            livre ? 'ok' : 'erro',
          );
        })
        .catch(() => {
          if (minha === checagem) setUsernameStatus(USERNAME_HINT, 'neutro');
        });
    }, 350);
  });

  const passwordLabel = el('label', { class: 'auth__label', for: 'auth-current-password' }, [
    'Senha',
  ]);

  const errorBox = el('p', { class: 'auth__error', role: 'alert' });
  errorBox.hidden = true;

  const submitButton = el('button', { class: 'auth__submit', type: 'submit' }, [
    LABELS.signIn.submit,
  ]);

  const hintText = el('span', { class: 'auth__hint' }, [LABELS.signIn.hint]);

  const toggleButton = el('button', { class: 'auth__toggle', type: 'button' }, [
    LABELS.signIn.toggle,
  ]);

  /*
   * "Esqueci minha senha" só existe no modo ENTRAR.
   *
   * No cadastro ele não faz sentido — a conta ainda não existe — e um link que
   * some conforme o modo é menos ruído do que um que aparece sempre e às vezes
   * não serve para nada.
   */
  const resetButton = el('button', { class: 'auth__toggle auth__reset', type: 'button' }, [
    'Esqueci minha senha',
  ]);

  resetButton.addEventListener('click', () => {
    if (busy) return;
    const email = emailInput.value.trim();
    if (email === '') {
      setError('Digite seu e-mail acima para receber o link.');
      emailInput.focus();
      return;
    }
    resetButton.disabled = true;
    void onResetPassword(email)
      .then(() => {
        /*
         * MENSAGEM NEUTRA, sempre a mesma.
         *
         * Dizer "não encontramos esse e-mail" transformaria esta tela num
         * verificador de quem tem conta no Loft — é assim que se monta lista
         * para phishing. A resposta é idêntica exista ou não.
         */
        setError('Se existir uma conta com esse e-mail, o link chegou. Confira o spam.');
      })
      .finally(() => {
        resetButton.disabled = false;
      });
  });

  toggleButton.addEventListener('click', () => {
    if (busy) return;
    setMode(mode === 'signIn' ? 'signUp' : 'signIn');
  });

  // `novalidate`: a validação nativa mostraria balão em inglês, e todas as
  // mensagens desta tela são em português.
  const form = el('form', { class: 'auth__form', novalidate: true }, [
    nameField,
    usernameField,
    el('div', { class: 'auth__field' }, [
      el('label', { class: 'auth__label', for: 'auth-email' }, ['E-mail']),
      emailInput,
    ]),
    el('div', { class: 'auth__field' }, [passwordLabel, passwordInput]),
    confirmField,
    errorBox,
    submitButton,
  ]);

  // Sendo um <form> de verdade, o Enter em qualquer campo — inclusive no de
  // senha — envia nativamente. Nenhum listener de tecla envolvido.
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    void submit();
  });

  function setError(message: string): void {
    errorBox.textContent = message;
    errorBox.hidden = message === '';
  }

  function setBusy(value: boolean): void {
    busy = value;
    submitButton.disabled = value;
    toggleButton.disabled = value;
    nameInput.disabled = value;
    usernameInput.disabled = value;
    emailInput.disabled = value;
    passwordInput.disabled = value;
    confirmInput.disabled = value;
    submitButton.textContent = value ? LABELS[mode].busy : LABELS[mode].submit;
  }

  function setMode(next: Mode): void {
    mode = next;
    setError('');

    nameField.hidden = next === 'signIn';
    usernameField.hidden = next === 'signIn';
    resetRow.hidden = next === 'signUp';
    confirmField.hidden = next === 'signIn';

    // O campo de senha é o mesmo elemento nos dois modos, então id, name e
    // autocomplete precisam acompanhar — senão o gerenciador de senhas oferece
    // salvar uma senha nova onde deveria preencher a existente.
    const isSignUp = next === 'signUp';
    const passwordId = isSignUp ? 'auth-new-password' : 'auth-current-password';
    passwordInput.id = passwordId;
    passwordInput.name = isSignUp ? 'new-password' : 'current-password';
    passwordInput.autocomplete = isSignUp ? 'new-password' : 'current-password';
    passwordLabel.setAttribute('for', passwordId);

    submitButton.textContent = LABELS[next].submit;
    toggleButton.textContent = LABELS[next].toggle;
    hintText.textContent = LABELS[next].hint;

    (isSignUp ? nameInput : emailInput).focus();
  }

  async function submit(): Promise<void> {
    if (busy) return;
    setError('');

    // Normaliza o e-mail: espaço colado e maiúscula não podem virar falha de
    // login. A senha NÃO é normalizada — espaço nela é caractere legítimo.
    const email = emailInput.value.trim().toLowerCase();
    const password = passwordInput.value;
    const displayName = nameInput.value.trim();
    const username = usernameInput.value.trim().toLowerCase();

    if (mode === 'signUp' && displayName === '') {
      setError('Informe um nome de exibição.');
      nameInput.focus();
      return;
    }
    if (mode === 'signUp') {
      const problema = username === '' ? 'Escolha um nome de usuário.' : usernameProblem(username);
      if (problema !== null) {
        setError(problema);
        usernameInput.focus();
        return;
      }
    }
    if (email === '') {
      setError('Informe o e-mail.');
      emailInput.focus();
      return;
    }
    if (password === '') {
      setError('Informe a senha.');
      passwordInput.focus();
      return;
    }
    if (mode === 'signUp' && confirmInput.value !== password) {
      setError('As duas senhas não são iguais.');
      confirmInput.focus();
      return;
    }

    setBusy(true);
    try {
      if (mode === 'signUp') await onSignUp(displayName, username, email, password);
      else await onSignIn(email, password);
      // Em caso de sucesso a tela inteira é substituída pelo app, então o estado
      // de carregando fica de propósito — evita duplo envio durante a troca.
    } catch (error) {
      setError(textoDoErro(error, 'Não foi possível concluir.'));
      setBusy(false);
      passwordInput.focus();
    }
  }

  // Começa no modo entrar, onde ele existe; `setMode` esconde no cadastro.
  const resetRow = el('div', { class: 'auth__reset-row' }, [resetButton]);

  const card = el('section', { class: 'auth' }, [
    el('header', { class: 'auth__header' }, [
      el('div', { class: 'auth__mark' }, [iconEl(logoIcon(24))]),
      el('h1', { class: 'auth__title' }, ['Loft', el('b', {}, ['chat'])]),
      el('p', { class: 'auth__subtitle' }, [
        'Seus grupos, canais e conversas em um lugar só.',
      ]),
    ]),
    form,
    el('footer', { class: 'auth__footer' }, [hintText, toggleButton]),
    resetRow,
  ]);

  // O elemento ainda não está no documento aqui; o microtask roda depois da
  // montagem síncrona feita pelo main.ts.
  queueMicrotask(() => {
    if (emailInput.isConnected) emailInput.focus();
  });

  return card;
}
