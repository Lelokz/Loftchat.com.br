import { auth, USING_EMULATOR } from './firebase';
import { CARTEIRO } from './avisos';

/**
 * AS ESPECIAIS (0.12.5): o Painel do Criador e o presente no privado.
 *
 * Quem confere TUDO é o carteiro (carteiro/src/especiais.ts): só o criador
 * dá e tira, e só quem ganhou abre. Aqui é só a conversa com ele.
 */

/** O @ do criador (no emulador, também o do teste). A tela só esconde; quem barra é o carteiro. */
const CRIADORES = USING_EMULATOR ? ['lelokz', 'criadorteste'] : ['lelokz'];

export function souCriador(username: string | undefined): boolean {
  return username !== undefined && CRIADORES.includes(username.toLowerCase());
}

export type QueDa = 'confidente' | 'testador';

export interface PessoaEspecial {
  uid: string;
  displayName: string;
  initials: string;
  username?: string;
  photo?: string;
  brilho?: 'roxo' | 'ouro' | 'prata';
  desde?: string;
  aberto?: boolean;
}

async function chamar(corpo: Record<string, unknown>): Promise<Record<string, unknown>> {
  const usuario = auth.currentUser;
  if (usuario === null) throw new Error('Sem login.');
  const token = await usuario.getIdToken();
  const r = await fetch(`${CARTEIRO}/especiais`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(corpo),
  });
  const d = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok) throw new Error(typeof d['erro'] === 'string' ? d['erro'] : 'Não deu certo. Tente de novo.');
  return d;
}

function pessoa(x: unknown): PessoaEspecial | null {
  if (typeof x !== 'object' || x === null) return null;
  const a = x as Record<string, unknown>;
  if (typeof a['uid'] !== 'string') return null;
  const b = a['brilho'];
  return {
    uid: a['uid'],
    displayName: typeof a['displayName'] === 'string' ? a['displayName'] : 'Usuário',
    initials: typeof a['initials'] === 'string' ? a['initials'] : '?',
    ...(typeof a['username'] === 'string' ? { username: a['username'] } : {}),
    ...(typeof a['photo'] === 'string' && a['photo'].startsWith('data:image/') ? { photo: a['photo'] } : {}),
    ...(b === 'roxo' || b === 'ouro' || b === 'prata' ? { brilho: b } : {}),
    ...(typeof a['desde'] === 'string' ? { desde: a['desde'] } : {}),
    ...(typeof a['aberto'] === 'boolean' ? { aberto: a['aberto'] } : {}),
  };
}

const lista = (v: unknown): PessoaEspecial[] => (Array.isArray(v) ? v.map(pessoa).filter((p): p is PessoaEspecial => p !== null) : []);

export async function listarEspeciais(): Promise<{ criador: PessoaEspecial | null; quem: Record<QueDa, PessoaEspecial[]> }> {
  const d = await chamar({ acao: 'listar' });
  const q = (d['quem'] ?? {}) as Record<string, unknown>;
  return { criador: pessoa(d['criador']), quem: { confidente: lista(q['confidente']), testador: lista(q['testador']) } };
}

export async function buscarPessoas(texto: string): Promise<PessoaEspecial[]> {
  return lista((await chamar({ acao: 'buscar', texto }))['pessoas']);
}

export async function darEspecial(insignia: QueDa, uid: string): Promise<void> {
  await chamar({ acao: 'dar', insignia, uid });
}

export async function tirarEspecial(insignia: QueDa, uid: string): Promise<void> {
  await chamar({ acao: 'tirar', insignia, uid });
}

export async function abrirPresente(mensagem: string): Promise<{ insignia: QueDa; brilho: 'roxo' | 'ouro' | 'prata' | null }> {
  const d = await chamar({ acao: 'abrir', mensagem });
  const b = d['brilho'];
  return { insignia: d['insignia'] === 'testador' ? 'testador' : 'confidente', brilho: b === 'roxo' || b === 'ouro' || b === 'prata' ? b : null };
}
