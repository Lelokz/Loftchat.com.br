/**
 * COMANDOS COM "/" (0.8.5, etapas 5 e 6).
 *
 * Os prontos (diversão e moderação) e os personalizados do grupo. Digitar
 * "/" na caixa abre a lista; ao mandar, o app reconhece o comando e faz o
 * que ele faz. O resultado aparece no chat como "Fulano usou /x" com um
 * cartão. Cada comando pede a sua permissão (e todos pedem "Usar comandos").
 */

import type { Member } from '../types/models';

export interface DefDeComando {
  nome: string;
  desc: string;
  /** Dica do que vem depois (ex.: "@pessoa tempo [motivo]"). */
  args: string;
  /** Permissão que o comando pede (além de "Usar comandos"). */
  perm?: string;
  /** Personalizado do grupo (id do documento). */
  id?: string;
}

export const COMANDOS_PRONTOS: DefDeComando[] = [
  { nome: 'dado', desc: 'Joga um dado (6 lados, ou quantos você disser).', args: '[lados]' },
  { nome: 'moeda', desc: 'Cara ou coroa.', args: '' },
  { nome: 'sortear', desc: 'Sorteia alguém do grupo (ou "voz": de quem está na sala).', args: '[voz]' },
  { nome: 'escolher', desc: 'Escolhe uma das opções, separadas por |.', args: 'pizza | hambúrguer | sushi' },
  { nome: 'spoiler', desc: 'Manda um texto escondido, que abre ao tocar.', args: 'texto' },
  { nome: 'shrug', desc: 'Põe ¯\\_(ツ)_/¯ no fim da mensagem.', args: '[texto]' },
  { nome: 'me', desc: 'Conta uma ação sua, em itálico.', args: 'texto' },
  { nome: 'castigo', desc: 'Deixa alguém sem escrever e sem falar por um tempo.', args: '@pessoa tempo [motivo]', perm: 'castigo' },
  { nome: 'expulsar', desc: 'Tira alguém do grupo.', args: '@pessoa [motivo]', perm: 'expulsar' },
  { nome: 'banir', desc: 'Tira alguém e impede que volte.', args: '@pessoa [motivo]', perm: 'banir' },
  { nome: 'cargo', desc: 'Dá ou tira um cargo de alguém.', args: '@pessoa Cargo', perm: 'dar-cargos' },
  { nome: 'apelido', desc: 'Muda o apelido de alguém neste grupo.', args: '@pessoa apelido', perm: 'apelido-outros' },
  { nome: 'limpar', desc: 'Apaga as últimas mensagens do canal (até 100).', args: 'quantidade', perm: 'apagar-varias' },
  { nome: 'lento', desc: 'Liga o modo lento do canal (0 desliga).', args: 'segundos', perm: 'editar-canais' },
  { nome: 'convite', desc: 'Copia um link de convite do grupo.', args: '', perm: 'criar-convites' },
];

/** "10m", "1h", "30s", "2d", "1sem" → segundos (ou null). */
export function lerTempo(texto: string): number | null {
  const m = /^(\d+)\s*(s|seg|m|min|h|d|dia|dias|sem|semana)?$/i.exec(texto.trim());
  if (m === null) return null;
  const n = Number(m[1]);
  const u = (m[2] ?? 'm').toLowerCase();
  const mult = u.startsWith('s') && u !== 'sem' && u !== 'semana' ? 1 : u.startsWith('m') ? 60 : u === 'h' ? 3600 : u.startsWith('d') ? 86400 : 7 * 86400;
  return n * mult;
}

/** Acha "@Nome Com Espaço" no começo do texto: devolve a pessoa e o resto. */
export function lerPessoa(texto: string, membros: Member[]): { pessoa: Member; resto: string } | null {
  const t = texto.trim();
  if (!t.startsWith('@')) return null;
  const sem = t.slice(1).toLowerCase();
  // O nome mais comprido que bate (para "Ana" não pegar "Ana Souza" errado).
  const candidatos = membros
    .filter((m) => sem.startsWith(m.displayName.toLowerCase()) && (sem.length === m.displayName.length || sem[m.displayName.length] === ' '))
    .sort((a, b) => b.displayName.length - a.displayName.length);
  const pessoa = candidatos[0];
  if (pessoa === undefined) return null;
  return { pessoa, resto: t.slice(1 + pessoa.displayName.length).trim() };
}

/** Separa "/nome resto". */
export function separar(texto: string): { nome: string; resto: string } | null {
  const m = /^\/([a-z0-9-]{1,32})(?:\s+([\s\S]*))?$/i.exec(texto.trim());
  return m === null ? null : { nome: m[1]!.toLowerCase(), resto: (m[2] ?? '').trim() };
}

/** Número inteiro aleatório em [1, n]. */
export function sortearNumero(n: number): number {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return (a[0]! % n) + 1;
}
