/**
 * Tradução dos códigos de erro do Firebase Auth para português.
 *
 * Regra: nenhum código cru chega à tela. O que não estiver mapeado cai na
 * mensagem genérica.
 *
 * Sobre `auth/invalid-credential`: o projeto está com proteção contra enumeração
 * de e-mail ligada (padrão em projeto novo), então o backend NÃO distingue "não
 * existe conta" de "senha errada" — os dois voltam com esse mesmo código, de
 * propósito, para a tela de login não virar um verificador de quais e-mails têm
 * conta. Por isso a mensagem dele é combinada.
 *
 * `user-not-found` e `wrong-password` continuam mapeados porque voltam a aparecer
 * se a proteção for desligada.
 */

const FALLBACK = 'Não foi possível concluir. Tente novamente.';

const MESSAGES: Record<string, string> = {
  'auth/email-already-in-use': 'Este e-mail já está em uso. Tente entrar.',
  'auth/invalid-email': 'E-mail inválido.',
  'auth/weak-password': 'A senha precisa de pelo menos 6 caracteres.',
  'auth/missing-password': 'Informe a senha.',
  'auth/missing-email': 'Informe o e-mail.',

  'auth/invalid-credential': 'E-mail ou senha incorretos.',
  'auth/user-not-found': 'Não encontramos uma conta com esse e-mail.',
  'auth/wrong-password': 'Senha incorreta.',
  'auth/user-disabled': 'Esta conta está desativada.',

  'auth/too-many-requests': 'Muitas tentativas. Aguarde alguns minutos e tente de novo.',
  'auth/network-request-failed': 'Sem conexão. Verifique sua internet e tente de novo.',
  'auth/operation-not-allowed': 'Login por e-mail e senha não está habilitado no projeto.',
};

/** Lê `code` de um erro do Firebase sem assumir o formato. */
function readCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  const code: unknown = (error as { code: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

export function authErrorMessage(error: unknown): string {
  const code = readCode(error);
  if (code !== undefined) {
    const message = MESSAGES[code];
    if (message !== undefined) return message;
  }
  return FALLBACK;
}
