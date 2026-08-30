import './verify-email.css';

import { el } from '../../lib/dom';

export interface VerifyEmailProps {
  email: string;
  /** Reenvia o e-mail. Rejeita com a mensagem a mostrar. */
  onResend: () => Promise<void>;
  onSignOut: () => void;
}

/**
 * Espera entre reenvios.
 *
 * Não é só cortesia com o servidor de e-mail: sem ela, quem não recebe fica
 * clicando em sequência, e o provedor passa a tratar o remetente como spam —
 * piorando exatamente o problema que a pessoa está tentando resolver.
 */
const RESEND_COOLDOWN_S = 60;

/**
 * O portão entre o cadastro e o app.
 *
 * Enquanto o e-mail não for confirmado a pessoa não entra: não escolhe `@`, não
 * manda nem recebe pedido, não vê grupo. Isso não é rigor à toa — a partir do
 * momento em que existe um `@` único, cadastrar com e-mail alheio é tomar um
 * nome e prendê-lo numa conta que ninguém controla.
 *
 * Quem confirma não precisa entrar de novo: `main.ts` recarrega o usuário de
 * tempos em tempos e entra sozinho quando o estado virar.
 */
export function renderVerifyEmail({
  email,
  onResend,
  onSignOut,
}: VerifyEmailProps): HTMLElement {
  const aviso = el('p', { class: 'verify__note', role: 'status' }, ['']);

  const reenviar = el('button', { class: 'verify__primary', type: 'button' }, [
    'Reenviar e-mail',
  ]);

  let restante = 0;
  let timer = 0;

  const tick = (): void => {
    restante -= 1;
    if (restante <= 0) {
      window.clearInterval(timer);
      reenviar.removeAttribute('disabled');
      reenviar.textContent = 'Reenviar e-mail';
      return;
    }
    reenviar.textContent = `Reenviar em ${restante}s`;
  };

  reenviar.addEventListener('click', () => {
    reenviar.setAttribute('disabled', 'true');
    void onResend()
      .then(() => {
        aviso.textContent = 'Enviamos de novo. Confira também a caixa de spam.';
        restante = RESEND_COOLDOWN_S;
        reenviar.textContent = `Reenviar em ${restante}s`;
        timer = window.setInterval(tick, 1000);
      })
      .catch((error: unknown) => {
        aviso.textContent =
          error instanceof Error ? error.message : 'Não foi possível reenviar agora.';
        reenviar.removeAttribute('disabled');
      });
  });

  const sair = el('button', { class: 'verify__ghost', type: 'button' }, [
    'Sair da conta',
  ]);
  sair.addEventListener('click', onSignOut);

  return el('div', { class: 'screen' }, [
    el('div', { class: 'verify' }, [
      el('h1', { class: 'verify__title' }, ['Confirme seu e-mail']),
      el('p', { class: 'verify__text' }, [
        'Mandamos um link de confirmação para ',
        el('strong', {}, [email]),
        '. Abra o link e volte aqui — a tela entra sozinha.',
      ]),
      el('p', { class: 'verify__text verify__text--muted' }, [
        'Não chegou? Ele costuma cair na caixa de spam.',
      ]),
      aviso,
      el('div', { class: 'verify__actions' }, [reenviar, sair]),
    ]),
  ]);
}
