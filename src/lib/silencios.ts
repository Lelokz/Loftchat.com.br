import { deleteField, doc, onSnapshot, setDoc } from 'firebase/firestore';
import type { Unsubscribe } from 'firebase/firestore';

import { db } from './firebase';

/**
 * SILENCIAR (0.11.0, maquete aprovada): canal, grupo ou conversa do privado,
 * por um tempo ou "até eu reativar".
 *
 * Mora em `silencios/{uid}` → `mapa` (`c_<canal>`, `g_<grupo>`, `p_<amigo>`
 * → até quando, ISO, ou "sempre"). Na conta: vale em todos os aparelhos. O
 * CARTEIRO lê o mesmo documento e não manda notificação do que está
 * silenciado (vale com o app fechado). Aqui no app, as não lidas do que está
 * silenciado ficam cinza e não entram nas contas do grupo e do "Privado".
 */

export type Alvo = `c_${string}` | `g_${string}` | `p_${string}`;

export const DURACOES: { rotulo: string; ms: number | null }[] = [
  { rotulo: 'Por 15 minutos', ms: 15 * 60_000 },
  { rotulo: 'Por 1 hora', ms: 60 * 60_000 },
  { rotulo: 'Por 8 horas', ms: 8 * 60 * 60_000 },
  { rotulo: 'Por 24 horas', ms: 24 * 60 * 60_000 },
  { rotulo: 'Até eu reativar', ms: null },
];

let mapa: Record<string, string> = {};
let eu = '';
const ouvintes = new Set<() => void>();
let relogio = 0;

function avisar(): void {
  for (const f of ouvintes) f();
}

/** Quando o próximo silêncio vence, redesenha (a bolinha volta a ficar colorida sozinha). */
function agendarVencimento(): void {
  window.clearTimeout(relogio);
  const agora = Date.now();
  const proximos = Object.values(mapa)
    .filter((v) => v !== 'sempre')
    .map((v) => Date.parse(v))
    .filter((t) => Number.isFinite(t) && t > agora);
  if (proximos.length === 0) return;
  const espera = Math.min(...proximos) - agora + 500;
  relogio = window.setTimeout(() => {
    avisar();
    agendarVencimento();
  }, Math.min(espera, 2 ** 31 - 1));
}

export function ouvirSilencios(f: () => void): () => void {
  ouvintes.add(f);
  return () => ouvintes.delete(f);
}

/** Liga a escuta (no login). */
export function ligarSilencios(uid: string): Unsubscribe {
  eu = uid;
  const parar = onSnapshot(
    doc(db, 'silencios', uid),
    (snap) => {
      const m = (snap.data()?.['mapa'] ?? {}) as Record<string, unknown>;
      mapa = Object.fromEntries(Object.entries(m).filter((e): e is [string, string] => typeof e[1] === 'string'));
      agendarVencimento();
      avisar();
    },
    () => undefined,
  );
  return () => {
    parar();
    mapa = {};
    eu = '';
    window.clearTimeout(relogio);
  };
}

/** Silenciado AGORA? Devolve até quando ('sempre' ou ISO), ou null. */
export function silenciadoAte(alvo: Alvo): string | null {
  const v = mapa[alvo];
  if (v === undefined) return null;
  if (v === 'sempre') return v;
  return Date.parse(v) > Date.now() ? v : null;
}

export function estaSilenciado(alvo: Alvo): boolean {
  return silenciadoAte(alvo) !== null;
}

/** "até 21:30", "até amanhã às 9:00", "até você reativar". */
export function textoDoSilencio(ate: string): string {
  if (ate === 'sempre') return 'até você reativar';
  const d = new Date(ate);
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const hoje = new Date();
  if (d.toDateString() === hoje.toDateString()) return `até ${hora}`;
  const amanha = new Date(hoje.getTime() + 24 * 60 * 60_000);
  if (d.toDateString() === amanha.toDateString()) return `até amanhã às ${hora}`;
  return `até ${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} às ${hora}`;
}

/** Silencia por `ms` (null = até reativar). */
export async function silenciar(alvo: Alvo, ms: number | null): Promise<void> {
  if (eu === '') return;
  const ate = ms === null ? 'sempre' : new Date(Date.now() + ms).toISOString();
  mapa = { ...mapa, [alvo]: ate };
  agendarVencimento();
  avisar();
  await setDoc(doc(db, 'silencios', eu), { mapa: { [alvo]: ate } }, { merge: true });
}

export async function reativar(alvo: Alvo): Promise<void> {
  if (eu === '') return;
  const { [alvo]: _fora, ...resto } = mapa;
  mapa = resto;
  avisar();
  await setDoc(doc(db, 'silencios', eu), { mapa: { [alvo]: deleteField() } }, { merge: true });
}
