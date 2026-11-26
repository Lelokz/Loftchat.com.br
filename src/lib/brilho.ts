/**
 * O NOME QUE BRILHA (0.12.5): quem tem uma insígnia especial tem o nome em
 * metal cromado em todo lugar — roxo (Criador), dourado (Confidente) ou
 * prateado (Linha de Frente).
 *
 * O campo `brilho` mora em `users/{uid}` e só o CARTEIRO escreve (as regras
 * recusam o app). Quem lê um perfil anota aqui, e a foto de quem tem o roxo
 * ganha o aro cromado (avatarEl consulta este mapa).
 */

export type Brilho = 'roxo' | 'ouro' | 'prata';

const BRILHOS = new Set<Brilho>(['roxo', 'ouro', 'prata']);
const conhecidos = new Map<string, Brilho>();

/** O valor do banco → um brilho válido (ou nada). */
export function lerBrilho(v: unknown): Brilho | undefined {
  return typeof v === 'string' && BRILHOS.has(v as Brilho) ? (v as Brilho) : undefined;
}

/** Anota o brilho de alguém (quem lê o perfil chama). */
export function notarBrilho(uid: string, v: unknown): Brilho | undefined {
  const b = lerBrilho(v);
  if (b === undefined) conhecidos.delete(uid);
  else conhecidos.set(uid, b);
  return b;
}

export function brilhoDe(uid: string | undefined): Brilho | undefined {
  return uid === undefined ? undefined : conhecidos.get(uid);
}
