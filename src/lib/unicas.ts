import { collection, onSnapshot, query, where } from 'firebase/firestore';
import type { Unsubscribe } from 'firebase/firestore';

import { auth, db } from './firebase';
import { CARTEIRO } from './avisos';

/**
 * VISUALIZAÇÃO ÚNICA (0.10.0) — o lado do app.
 *
 * Quantas vezes cada pessoa abriu mora em `unicas/{msg}_{uid}`, que só o
 * carteiro escreve. Aqui o app ESCUTA duas coisas: as que eu abri (para o
 * balão dizer quantas vezes sobram) e quem abriu as que eu mandei ("Lucas
 * abriu", "vista por Ana e Gabriel").
 */

/** Some sozinha depois disto (o carteiro também confere). */
export const PRAZO_DA_UNICA_MS = 14 * 24 * 60 * 60 * 1000;

const minhas = new Map<string, number>();
const mandadas = new Map<string, Map<string, number>>();
const ouvintes = new Set<() => void>();

function avisar(): void {
  for (const f of ouvintes) f();
}

export function ouvirUnicas(f: () => void): () => void {
  ouvintes.add(f);
  return () => ouvintes.delete(f);
}

/** Quantas vezes EU já abri esta mensagem. */
export function vezesQueAbri(msg: string): number {
  return minhas.get(msg) ?? 0;
}

/** Quem abriu uma mensagem que EU mandei (uid → vezes). */
export function quemAbriu(msg: string): Map<string, number> {
  return mandadas.get(msg) ?? new Map();
}

/** Liga as duas escutas (no login). Devolve como desligar. */
export function ligarUnicas(eu: string): Unsubscribe {
  minhas.clear();
  mandadas.clear();
  const ler = (d: Record<string, unknown>): { msg: string; uid: string; vistas: number } | null =>
    typeof d['msg'] === 'string' && typeof d['uid'] === 'string' && typeof d['vistas'] === 'number'
      ? { msg: d['msg'], uid: d['uid'], vistas: d['vistas'] }
      : null;
  const a = onSnapshot(
    query(collection(db, 'unicas'), where('uid', '==', eu)),
    (snap) => {
      minhas.clear();
      for (const doc of snap.docs) {
        const c = ler(doc.data());
        if (c !== null) minhas.set(c.msg, c.vistas);
      }
      avisar();
    },
    (erro) => console.error('[unicas] não deu para ouvir as que eu abri.', erro),
  );
  const b = onSnapshot(
    query(collection(db, 'unicas'), where('autor', '==', eu)),
    (snap) => {
      mandadas.clear();
      for (const doc of snap.docs) {
        const c = ler(doc.data());
        if (c === null) continue;
        const quem = mandadas.get(c.msg) ?? new Map<string, number>();
        quem.set(c.uid, c.vistas);
        mandadas.set(c.msg, quem);
      }
      avisar();
    },
    (erro) => console.error('[unicas] não deu para ouvir quem abriu as minhas.', erro),
  );
  return () => {
    a();
    b();
    minhas.clear();
    mandadas.clear();
  };
}

export interface Aberta {
  /** Endereço local (blob:) — some quando a tela fecha. */
  endereco: string;
  formato: string;
  vez: number;
  vezes: number;
}

/** Pede ao carteiro (que CONTA a vez). Devolve o arquivo ou o motivo de não abrir. */
export async function abrirUnica(tipo: 'pv' | 'grupo', msg: string): Promise<Aberta | string> {
  const usuario = auth.currentUser;
  if (usuario === null) return 'Entre de novo para abrir.';
  let r: Response;
  try {
    r = await fetch(`${CARTEIRO}/unica/abrir`, {
      method: 'POST',
      headers: { authorization: `Bearer ${await usuario.getIdToken()}`, 'content-type': 'application/json' },
      body: JSON.stringify({ tipo, id: msg }),
    });
  } catch {
    return 'Sem conexão. Tente de novo.';
  }
  if (!r.ok) {
    const motivos: Record<number, string> = {
      403: 'Você já usou todas as vezes.',
      404: 'Essa mensagem não existe mais.',
      410: 'Expirou.',
    };
    return motivos[r.status] ?? 'Não deu para abrir. Tente de novo.';
  }
  const blob = await r.blob();
  const vez = Number(r.headers.get('x-vez') ?? '1');
  const vezes = Number(r.headers.get('x-vezes') ?? '1');
  // A escuta vai confirmar; aqui já atualiza, para o balão não esperar.
  minhas.set(msg, Math.max(minhas.get(msg) ?? 0, vez));
  avisar();
  return { endereco: URL.createObjectURL(blob), formato: blob.type, vez, vezes };
}
