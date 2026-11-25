import { collection, doc, onSnapshot, query, setDoc, updateDoc, where } from 'firebase/firestore';
import type { Unsubscribe } from 'firebase/firestore';

import { db } from './firebase';
import { pairId } from './friends';

/**
 * LIGAÇÃO NO PV (0.9.5).
 *
 * A conversa em si usa a MESMA voz dos grupos (motor, presença, sinalização),
 * num "grupo" de mentira só dos dois: `pv_{a}_{b}`. O que é novo é o TOQUE:
 * um documento por par em `chamadas/{a}_{b}` diz quem liga, se é com câmera
 * e em que pé está (tocando → atendida/recusada/perdida → encerrada).
 */

export type EstadoDaChamada = 'tocando' | 'atendida' | 'recusada' | 'perdida' | 'encerrada' | 'cancelada';

export interface Chamada {
  par: string;
  de: string;
  para: string;
  comCamera: boolean;
  estado: EstadoDaChamada;
  criadaEm: string;
  atendidaEm?: string;
  fimEm?: string;
}

/** Quanto tempo toca antes de virar "chamada perdida". */
export const TEMPO_DE_TOQUE_MS = 30_000;

/** O "grupo" (e canal) de voz da ligação com esta pessoa. */
export function grupoDoPv(eu: string, outro: string): string {
  return `pv_${pairId(eu, outro)}`;
}

/** É uma chamada de PV (e não um canal de grupo)? */
export function ehChamadaDePv(groupId: string): boolean {
  return groupId.startsWith('pv_');
}

function paraChamada(par: string, d: Record<string, unknown>): Chamada | null {
  const estados: EstadoDaChamada[] = ['tocando', 'atendida', 'recusada', 'perdida', 'encerrada', 'cancelada'];
  if (typeof d['de'] !== 'string' || typeof d['para'] !== 'string') return null;
  const estado = estados.includes(d['estado'] as EstadoDaChamada) ? (d['estado'] as EstadoDaChamada) : 'encerrada';
  return {
    par,
    de: d['de'],
    para: d['para'],
    comCamera: d['comCamera'] === true,
    estado,
    criadaEm: typeof d['criadaEm'] === 'string' ? d['criadaEm'] : '',
    ...(typeof d['atendidaEm'] === 'string' ? { atendidaEm: d['atendidaEm'] } : {}),
    ...(typeof d['fimEm'] === 'string' ? { fimEm: d['fimEm'] } : {}),
  };
}

/** Começa a tocar na outra pessoa. */
export async function ligar(eu: string, outro: string, comCamera: boolean): Promise<Chamada> {
  const par = pairId(eu, outro);
  const chamada: Chamada = { par, de: eu, para: outro, comCamera, estado: 'tocando', criadaEm: new Date().toISOString() };
  await setDoc(doc(db, 'chamadas', par), {
    de: eu,
    para: outro,
    comCamera,
    estado: 'tocando',
    criadaEm: chamada.criadaEm,
  });
  return chamada;
}

export async function mudarEstado(par: string, estado: EstadoDaChamada): Promise<void> {
  const agora = new Date().toISOString();
  await updateDoc(doc(db, 'chamadas', par), {
    estado,
    ...(estado === 'atendida' ? { atendidaEm: agora } : {}),
    ...(estado !== 'tocando' && estado !== 'atendida' ? { fimEm: agora } : {}),
  });
}

/** Chamadas que chegam para mim (o app mostra só as que estão tocando agora). */
export function ouvirChamadasParaMim(eu: string, aoMudar: (chamadas: Chamada[]) => void): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'chamadas'), where('para', '==', eu)),
    (snap) => aoMudar(snap.docs.map((d) => paraChamada(d.id, d.data())).filter((c): c is Chamada => c !== null)),
    (erro) => console.error('[chamadas] não deu para ouvir as chamadas.', erro),
  );
}

/** Acompanha UMA chamada (quem ligou espera atenderem ou recusarem). */
export function ouvirChamada(par: string, aoMudar: (c: Chamada | null) => void): Unsubscribe {
  return onSnapshot(
    doc(db, 'chamadas', par),
    (snap) => aoMudar(snap.exists() ? paraChamada(snap.id, snap.data()) : null),
    (erro) => console.error('[chamadas] não deu para acompanhar a chamada.', erro),
  );
}

/** Ainda está tocando de verdade? (Documento velho de quem fechou o app no meio não conta.) */
export function tocandoAgora(c: Chamada): boolean {
  return c.estado === 'tocando' && Date.now() - Date.parse(c.criadaEm) < TEMPO_DE_TOQUE_MS + 5_000;
}

/** "12 min", "1 h 05 min", "40 s". */
export function duracaoDaLigacao(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s`;
  const min = Math.floor(s / 60);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`;
}
