import { auth } from './firebase';
import { CARTEIRO } from './avisos';

/**
 * O QUE CONTA PARA AS INSÍGNIAS (0.12.0).
 *
 * Quem conta é o CARTEIRO (carteiro/src/insignias.ts): o app só avisa "fiz
 * isto" e ele CONFERE no banco antes de contar — reação que existe mesmo,
 * mensagem que é dessa pessoa, chamada em que ela está. As mensagens nem
 * precisam disto: o carteiro já conta quando recebe o /avisar.
 */

type Evento =
  | { evento: 'reagir'; tipo: 'grupo' | 'pv'; id: string; emoji: string }
  | { evento: 'editar'; tipo: 'grupo' | 'pv'; id: string }
  | { evento: 'fixar'; id: string }
  | { evento: 'voz' }
  | { evento: 'jogo' }
  | { evento: 'conferir' };

/** Manda e esquece: nunca atrapalha o que a pessoa fez. */
export function contarConquista(e: Evento): void {
  const usuario = auth.currentUser;
  if (usuario === null) return;
  void usuario
    .getIdToken()
    .then((token) =>
      fetch(`${CARTEIRO}/conquistas`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify(e),
        keepalive: true,
      }),
    )
    .catch(() => {
      // Sem internet agora: a próxima conta.
    });
}

export interface AmigoEmComum {
  uid: string;
  displayName: string;
  initials: string;
  username?: string;
  photo?: string;
}

/** Os amigos que eu e essa pessoa temos em comum (o carteiro confere os dois lados). */
export async function amigosEmComum(uid: string): Promise<AmigoEmComum[]> {
  const usuario = auth.currentUser;
  if (usuario === null) return [];
  try {
    const token = await usuario.getIdToken();
    const r = await fetch(`${CARTEIRO}/amigos-em-comum`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ uid }),
    });
    if (!r.ok) return [];
    const d = (await r.json()) as { amigos?: unknown };
    if (!Array.isArray(d.amigos)) return [];
    return d.amigos
      .filter((a): a is Record<string, unknown> => typeof a === 'object' && a !== null && typeof (a as Record<string, unknown>)['uid'] === 'string')
      .map((a) => ({
        uid: String(a['uid']),
        displayName: typeof a['displayName'] === 'string' ? a['displayName'] : 'Usuário',
        initials: typeof a['initials'] === 'string' ? a['initials'] : '?',
        ...(typeof a['username'] === 'string' ? { username: a['username'] } : {}),
        ...(typeof a['photo'] === 'string' && a['photo'].startsWith('data:image/') ? { photo: a['photo'] } : {}),
      }));
  } catch {
    return [];
  }
}
