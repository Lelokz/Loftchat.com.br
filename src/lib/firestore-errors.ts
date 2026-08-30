/**
 * Tradução dos códigos de erro do Firestore para português.
 *
 * Mesmo molde do `auth-errors.ts`: nenhum código cru chega à tela.
 *
 * A mensagem final combina O QUE falhou com POR QUE falhou, para a tela dizer
 * "Não foi possível criar o grupo. Sem conexão com o servidor." em vez de só
 * "algo deu errado".
 *
 * `permission-denied` é o mais importante da lista: hoje as regras estão
 * abertas, mas quando elas entrarem — ou quando o modo de teste expirar — é
 * exatamente este erro que vai aparecer. Sem tratamento, o botão simplesmente
 * pararia de funcionar em silêncio.
 */

const CAUSES: Record<string, string> = {
  'permission-denied': 'Você não tem permissão para isso.',
  'failed-precondition': 'O banco ainda não está pronto para esta consulta.',
  unavailable: 'Sem conexão com o servidor. Tente de novo.',
  'deadline-exceeded': 'O servidor demorou para responder. Tente de novo.',
  'not-found': 'Este item não existe mais.',
  'already-exists': 'Este item já existe.',
  'resource-exhausted': 'O limite de uso do projeto foi atingido.',
  unauthenticated: 'Sua sessão expirou. Entre de novo.',
  cancelled: 'A operação foi interrompida. Tente de novo.',
};

function readCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  const code: unknown = (error as { code: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

/**
 * Recusa de permissão.
 *
 * Num listener de grupo isto quase nunca é "deu errado" — é "eu não estou mais
 * neste grupo": fui removido, ou o grupo foi apagado embaixo de mim. Quem chama
 * decide o que fazer, mas quase sempre a resposta certa é sair em silêncio, não
 * gritar no console.
 */
export function isPermissionDenied(error: unknown): boolean {
  return readCode(error) === 'permission-denied';
}

/**
 * @param action frase do que falhou, ex.: 'Não foi possível criar o grupo.'
 */
export function firestoreErrorMessage(error: unknown, action: string): string {
  const code = readCode(error);
  const cause = code === undefined ? undefined : CAUSES[code];
  return cause === undefined ? `${action} Tente de novo.` : `${action} ${cause}`;
}

/**
 * Erro de LEITURA da lista de mensagens.
 *
 * Separado do mapa acima porque aqui a falha não pode virar lista vazia: uma
 * lista vazia é indistinguível de "canal sem mensagens", e as duas causas mais
 * prováveis nesta fase do projeto são justamente as que precisam ser ditas em
 * voz alta.
 */
export function messagesErrorMessage(error: unknown): string {
  switch (readCode(error)) {
    case 'failed-precondition':
      // Índice composto ausente ou ainda em construção. Um índice recém-publicado
      // leva alguns minutos para ficar READY, e até lá a consulta simplesmente falha.
      return (
        'O índice das mensagens ainda está sendo construído. ' +
        'Isso leva alguns minutos — recarregue a página depois.'
      );
    case 'permission-denied':
      return 'Você não tem acesso às mensagens deste canal.';
    case 'unavailable':
      return 'Sem conexão com o servidor. As mensagens voltam quando a rede voltar.';
    case 'unauthenticated':
      return 'Sua sessão expirou. Entre de novo para ver as mensagens.';
    default:
      return 'Não foi possível carregar as mensagens deste canal.';
  }
}
