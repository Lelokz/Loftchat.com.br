/**
 * Código do grupo: 6 letras e números, sem símbolos ambíguos (decisão do Leo,
 * 16/11/2026 — curto para ditar e digitar, e não só números).
 *
 * O alfabeto tira `0/O` e `1/I/L`, que são os pares que as pessoas erram ao ler
 * um código em voz alta ou copiar de uma tela. Sobram 32 símbolos, então
 * 32^6 ≈ 1 bilhão de combinações. Os códigos antigos, de 8, continuam valendo.
 */

const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const CODE_LENGTH = 6;
const ACEITOS = [6, 8];

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
  // Digitado com espaço ou traço ("K7M 2QX", "K7M-2QX"): vale igual.
  return raw.trim().toUpperCase().replace(/[\s-]/g, '');
}

export function isWellFormedInviteCode(code: string): boolean {
  if (!ACEITOS.includes(code.length)) return false;
  return [...code].every((char) => ALPHABET.includes(char));
}
