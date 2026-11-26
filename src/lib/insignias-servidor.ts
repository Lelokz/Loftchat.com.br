import { collection, doc, getDoc, getDocs, onSnapshot, query, updateDoc, where } from 'firebase/firestore';
import type { Unsubscribe } from 'firebase/firestore';

import { pedirAoCarteiro } from './cargos';
import { db } from './firebase';
import type { Insignia } from './insignias';
import { lerInsigniaDoGrupo } from './insignias-grupo';
import type { Gatilho, InsigniaDoGrupo } from './insignias-grupo';

/**
 * INSÍGNIAS DO SERVIDOR no app (0.12.5): ler as do grupo e o que cada um
 * tem; criar, editar, apagar, dar e tirar vão pelo carteiro (POST /cargos),
 * que confere as permissões.
 */

/** A insígnia do grupo no formato das do Loft (para a medalha, a dica e o aviso). */
export function comoInsignia(i: InsigniaDoGrupo): Insignia {
  return { id: i.id, categoria: 'Servidor', icone: `srv:${i.icone}`, nome: i.nome, desc: i.desc, raridade: i.raridade, conta: '', alvo: 1, ...(i.secreta ? { secreta: true } : {}) };
}

export function ouvirInsigniasDoGrupo(grupo: string, aoMudar: (lista: InsigniaDoGrupo[]) => void): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'insigniasDoGrupo'), where('groupId', '==', grupo)),
    (snap) =>
      aoMudar(
        snap.docs
          .map((d) => lerInsigniaDoGrupo(d.id, d.data()))
          .filter((i): i is InsigniaDoGrupo => i !== null)
          .sort((a, b) => a.criadaEm.localeCompare(b.criadaEm)),
      ),
    () => aoMudar([]),
  );
}

export interface DoMembro {
  tem: Map<string, string>;
  n: Record<string, number>;
  avisadoAte: string;
  groupId: string;
}

export function lerDoMembro(d: Record<string, unknown> | undefined): DoMembro {
  const tem = new Map<string, string>();
  const t = d?.['tem'];
  if (typeof t === 'object' && t !== null) for (const [k, v] of Object.entries(t)) if (typeof v === 'string') tem.set(k, v);
  const n: Record<string, number> = {};
  const nn = d?.['n'];
  if (typeof nn === 'object' && nn !== null) for (const [k, v] of Object.entries(nn)) if (typeof v === 'number' && Number.isFinite(v)) n[k] = v;
  return { tem, n, avisadoAte: typeof d?.['avisadoAte'] === 'string' ? d['avisadoAte'] : '', groupId: typeof d?.['groupId'] === 'string' ? d['groupId'] : '' };
}

export async function doMembro(grupo: string, uid: string): Promise<DoMembro> {
  try {
    const snap = await getDoc(doc(db, 'insigniasDoMembro', `${grupo}_${uid}`));
    return lerDoMembro(snap.data());
  } catch {
    return lerDoMembro(undefined);
  }
}

export interface DadosDaInsignia {
  nome: string;
  desc: string;
  icone: string;
  raridade: string;
  gatilho: Gatilho;
  secreta: boolean;
  limite: number;
  ate: string;
  frase?: string;
}

export async function salvarInsignia(grupo: string, id: string | null, dados: DadosDaInsignia): Promise<string> {
  const r = await pedirAoCarteiro(grupo, 'insignia-salvar', { ...(id === null ? {} : { insignia: id }), dados });
  return typeof r['id'] === 'string' ? r['id'] : (id ?? '');
}

export async function apagarInsignia(grupo: string, id: string): Promise<void> {
  await pedirAoCarteiro(grupo, 'insignia-apagar', { insignia: id });
}

export async function darInsignia(grupo: string, id: string, membro: string, dar: boolean): Promise<void> {
  await pedirAoCarteiro(grupo, dar ? 'insignia-dar' : 'insignia-tirar', { insignia: id, membro });
}

export async function fraseDaInsignia(grupo: string, id: string): Promise<string> {
  const r = await pedirAoCarteiro(grupo, 'insignia-ler', { insignia: id });
  return typeof r['frase'] === 'string' ? r['frase'] : '';
}

/**
 * O AVISO de insígnia nova DO SERVIDOR: ouve todas as minhas (em todos os
 * grupos) e chama `aoGanhar` com as que chegaram depois do `avisadoAte`
 * daquele grupo — e marca como avisadas.
 */
export function ouvirMinhasDosGrupos(uid: string, aoGanhar: (grupo: string, ids: string[]) => void): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'insigniasDoMembro'), where('uid', '==', uid)),
    (snap) => {
      for (const d of snap.docs) {
        const m = lerDoMembro(d.data());
        if (m.groupId === '') continue;
        const novas = [...m.tem.entries()].filter(([, quando]) => quando > m.avisadoAte).sort((a, b) => a[1].localeCompare(b[1]));
        if (novas.length === 0) continue;
        const ultimo = novas[novas.length - 1]![1];
        aoGanhar(m.groupId, novas.map(([id]) => id));
        void updateDoc(d.ref, { avisadoAte: ultimo }).catch(() => undefined);
      }
    },
    () => undefined,
  );
}

export async function insigniaPorId(id: string): Promise<InsigniaDoGrupo | null> {
  try {
    const snap = await getDoc(doc(db, 'insigniasDoGrupo', id));
    return snap.exists() ? lerInsigniaDoGrupo(snap.id, snap.data()) : null;
  } catch {
    return null;
  }
}

/** As insígnias do grupo, uma vez só (o cartão e o perfil completo). */
export async function insigniasDoGrupoUmaVez(grupo: string): Promise<InsigniaDoGrupo[]> {
  try {
    const snap = await getDocs(query(collection(db, 'insigniasDoGrupo'), where('groupId', '==', grupo)));
    return snap.docs
      .map((d) => lerInsigniaDoGrupo(d.id, d.data()))
      .filter((i): i is InsigniaDoGrupo => i !== null)
      .sort((a, b) => a.criadaEm.localeCompare(b.criadaEm));
  } catch {
    return [];
  }
}
