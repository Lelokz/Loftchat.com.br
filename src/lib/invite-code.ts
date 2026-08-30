/**
 * Código de convite: 8 caracteres, sem símbolos ambíguos.
 *
 * O alfabeto tira `0/O` e `1/I/L`, que são os pares que as pessoas erram ao ler
 * um código em voz alta ou copiar de uma tela. Sobram 32 símbolos, então
 * 32^8 ≈ 1,1 trilhão de combinações.
 */

const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const CODE_LENGTH = 8;

export function generateInviteCode(): string {
  // 32 é potência de dois e divide 256 exatamente, então o resto de 256/32 é
  // zero e mapear byte % 32 não enviesa nenhum símbolo.
  const bytes = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(bytes);

  let code = '';
  for (const byte of bytes) code += ALPHABET[byte % ALPHABET.length];
  return code;
}

/** Normaliza o que veio da URL: maiúsculas e só caracteres do alfabeto. */
export function normalizeInviteCode(raw: string): string {
  return raw.trim().toUpperCase();
}

export function isWellFormedInviteCode(code: string): boolean {
  if (code.length !== CODE_LENGTH) return false;
  return [...code].every((char) => ALPHABET.includes(char));
}
