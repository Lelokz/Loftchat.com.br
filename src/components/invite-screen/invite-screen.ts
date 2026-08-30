import './invite-screen.css';

import { el, iconEl } from '../../lib/dom';
import { firestoreErrorMessage } from '../../lib/firestore-errors';
import { logoIcon } from '../../lib/icons';

export interface InviteScreenProps {
  /** Nome do grupo do convite; `null` quando o código não existe. */
  groupName: string | null;
  /** Já sou membro — muda o texto de "entrar" para "abrir". */
  alreadyMember: boolean;
  onAccept: () => Promise<void>;
  onDecline: () => void;
}

/** Tela de "/convite/CODIGO" para quem já está autenticado. */
export function renderInviteScreen(props: InviteScreenProps): HTMLElement {
  const { groupName, alreadyMember, onAccept, onDecline } = props;

  const errorBox = el('p', { class: 'invite__error', role: 'alert' });
  errorBox.hidden = true;

  const declineButton = el('button', { class: 'invite__decline', type: 'button' }, [
    groupName === null ? 'Voltar' : 'Agora não',
  ]);
  declineButton.addEventListener('click', onDecline);

  // Convite inválido: sem botão de aceitar, só o caminho de volta.
  if (groupName === null) {
    return el('section', { class: 'invite' }, [
      el('div', { class: 'invite__mark' }, [iconEl(logoIcon(24))]),
      el('h1', { class: 'invite__title' }, ['Convite inválido']),
      el('p', { class: 'invite__text' }, [
        'Este link não corresponde a nenhum grupo. Ele pode ter sido digitado errado ou o convite foi removido.',
      ]),
      el('div', { class: 'invite__actions' }, [declineButton]),
    ]);
  }

  const acceptLabel = alreadyMember ? 'Abrir o grupo' : 'Entrar no grupo';
  const acceptButton = el('button', { class: 'invite__accept', type: 'button' }, [acceptLabel]);

  acceptButton.addEventListener('click', () => {
    errorBox.hidden = true;
    acceptButton.disabled = true;
    declineButton.disabled = true;
    acceptButton.textContent = 'Entrando…';

    void onAccept()
      .catch((error: unknown) => {
        // Erro visível na tela; o console é complemento, não o único sinal.
        console.error('Não foi possível entrar no grupo.', error);
        errorBox.textContent = firestoreErrorMessage(error, 'Não foi possível entrar no grupo.');
        errorBox.hidden = false;
      })
      .finally(() => {
        acceptButton.disabled = false;
        declineButton.disabled = false;
        acceptButton.textContent = acceptLabel;
      });
  });

  /*
   * O nome do grupo vem CONGELADO no convite (as regras só deixam membros lerem
   * o documento do grupo, e quem está aqui ainda não é membro). Por isso ele
   * aparece dentro de uma frase, e não como título de autoridade: se o grupo
   * tiver sido renomeado desde o convite, a diferença entre esta tela e o app
   * fica explicável em vez de parecer bug.
   */
  return el('section', { class: 'invite' }, [
    el('div', { class: 'invite__mark' }, [iconEl(logoIcon(24))]),
    el('h1', { class: 'invite__title' }, ['Convite para um grupo']),
    el('p', { class: 'invite__text' }, [
      alreadyMember ? 'Você já faz parte do grupo ' : 'Você foi convidado para o grupo ',
      el('strong', { class: 'invite__group' }, [groupName]),
      '.',
    ]),
    errorBox,
    el('div', { class: 'invite__actions' }, [declineButton, acceptButton]),
  ]);
}
