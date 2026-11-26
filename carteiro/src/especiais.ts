/**
 * AS INSÍGNIAS ESPECIAIS (0.12.5) — só o CRIADOR do Loftchat dá.
 *
 *   POST /especiais { acao: 'listar' }                       quem tem cada uma (só o criador)
 *   POST /especiais { acao: 'buscar', texto }                procurar pessoa pelo @ ou nome (só o criador)
 *   POST /especiais { acao: 'dar', insignia, uid }           manda o PRESENTE no privado (só o criador)
 *   POST /especiais { acao: 'tirar', insignia, uid }         tira (e some o brilho) (só o criador)
 *   POST /especiais { acao: 'abrir', mensagem }              quem ganhou abre o presente
 *
 * O criador é quem tem o @ de `env.CRIADOR` (padrão: lelokz). A dele
 * ("Criador do Loftchat") ninguém dá: ela é dele. As outras duas
 * (Confidente e Linha de Frente) chegam como presente no privado com o
 * criador; o nome só brilha DEPOIS que a pessoa abre.
 *
 * Quem tem o quê mora em `especiais/estado` (ninguém lê pelo app; só por
 * aqui). O que a pessoa ganhou vai para `insignias/{uid}` (tem + n) e o
 * brilho do nome para `users/{uid}.brilho`.
 */

import { firestore, json, ler, lerCampos, lerVarios, nomeCompleto, quemChamou, raiz } from './index';
import type { Env } from './index';
import { campos } from './cargos';

type Dados = Record<string, unknown>;

/** As que o criador dá (a dele não entra). */
const QUE_DA = ['confidente', 'testador'] as const;
type QueDa = (typeof QUE_DA)[number];
const ID = /^[A-Za-z0-9]{10,40}$/;
const MSG = /^[A-Za-z0-9_-]{1,64}$/;
const BRILHO_DE: Record<QueDa, 'ouro' | 'prata'> = { confidente: 'ouro', testador: 'prata' };

export function criadorDe(env: Env): string {
  return (env.CRIADOR ?? 'lelokz').toLowerCase().replace(/^@/, '');
}

/** O brilho que vale (o mais forte): roxo (criador) > ouro > prata. */
export function melhorBrilho(criador: boolean, tem: Iterable<string>): 'roxo' | 'ouro' | 'prata' | null {
  const ids = new Set(tem);
  if (criador) return 'roxo';
  if (ids.has('confidente')) return 'ouro';
  if (ids.has('testador')) return 'prata';
  return null;
}

/* ------------------------------ gravar ------------------------------ */

interface Mudanca {
  caminho: string;
  definir?: Dados;
  /** Campos que somem ('tem.confidente'). */
  apagar?: string[];
  /** Só se o documento já existe. */
  existe?: boolean;
  /** Só se ainda não existe. */
  novo?: boolean;
}

function segmento(p: string): string {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(p) ? p : `\`${p.replace(/`/g, '\\`')}\``;
}

function arvore(planos: Dados): Dados {
  const raizObj: Dados = {};
  for (const [caminho, v] of Object.entries(planos)) {
    const partes = caminho.split('.');
    let atual = raizObj;
    for (const p of partes.slice(0, -1)) {
      atual[p] = (atual[p] as Dados | undefined) ?? {};
      atual = atual[p] as Dados;
    }
    atual[partes.at(-1)!] = v;
  }
  return raizObj;
}

async function gravar(env: Env, mudancas: Mudanca[]): Promise<void> {
  const writes = mudancas.map((m) => ({
    update: { name: nomeCompleto(env, m.caminho), fields: campos(arvore(m.definir ?? {})) },
    updateMask: { fieldPaths: [...Object.keys(m.definir ?? {}), ...(m.apagar ?? [])].map((c) => c.split('.').map(segmento).join('.')) },
    ...(m.existe === true ? { currentDocument: { exists: true } } : m.novo === true ? { currentDocument: { exists: false } } : {}),
  }));
  const r = await firestore(env, `${raiz(env)}:commit`, { method: 'POST', body: JSON.stringify({ writes }) });
  if (!r.ok) throw new Error(`Firestore ${r.status} nas especiais: ${(await r.text()).slice(0, 200)}`);
}

/* ------------------------------ ajudas ------------------------------ */

interface Pessoa {
  uid: string;
  displayName: string;
  initials: string;
  username?: string;
  photo?: string;
  brilho?: string;
}

function pessoa(uid: string, u: Dados | null): Pessoa {
  return {
    uid,
    displayName: typeof u?.['displayName'] === 'string' ? u['displayName'] : 'Usuário',
    initials: typeof u?.['initials'] === 'string' ? u['initials'] : '?',
    ...(typeof u?.['username'] === 'string' ? { username: u['username'] } : {}),
    ...(typeof u?.['photo'] === 'string' && u['photo'].startsWith('data:image/') ? { photo: u['photo'] } : {}),
    ...(typeof u?.['brilho'] === 'string' ? { brilho: u['brilho'] } : {}),
  };
}

type Estado = Record<QueDa, Record<string, { desde: string; aberto: boolean; msg: string }>>;

function lerEstado(d: Dados | null): Estado {
  const e = { confidente: {}, testador: {} } as Estado;
  for (const ins of QUE_DA) {
    const m = d?.[ins];
    if (typeof m !== 'object' || m === null) continue;
    for (const [uid, v] of Object.entries(m as Dados)) {
      const x = v as Dados;
      if (!ID.test(uid) || typeof x !== 'object' || x === null) continue;
      e[ins][uid] = { desde: String(x['desde'] ?? ''), aberto: x['aberto'] === true, msg: String(x['msg'] ?? '') };
    }
  }
  return e;
}

function par(a: string, b: string): string {
  return a < b ? `${a}_${b}` : `${b}_${a}`;
}

/** Procura pelo começo do @ (e do nome, do jeito que foi escrito). */
async function procurar(env: Env, campo: 'username' | 'displayName', texto: string): Promise<{ id: string; d: Dados }[]> {
  const r = await firestore(env, `${raiz(env)}:runQuery`, {
    method: 'POST',
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'users' }],
        where: {
          compositeFilter: {
            op: 'AND',
            filters: [
              { fieldFilter: { field: { fieldPath: campo }, op: 'GREATER_THAN_OR_EQUAL', value: { stringValue: texto } } },
              { fieldFilter: { field: { fieldPath: campo }, op: 'LESS_THAN', value: { stringValue: `${texto}\uf8ff` } } },
            ],
          },
        },
        orderBy: [{ field: { fieldPath: campo }, direction: 'ASCENDING' }],
        limit: 8,
      },
    }),
  });
  if (!r.ok) return [];
  const linhas = (await r.json()) as { document?: { name: string; fields?: Dados } }[];
  return linhas.filter((l) => l.document !== undefined).map((l) => ({ id: l.document!.name.split('/').at(-1)!, d: lerCampos(l.document!.fields ?? {}) }));
}

/* ------------------------------ a rota ------------------------------ */

export async function rotaEspeciais(req: Request, env: Env): Promise<Response> {
  const uid = await quemChamou(req, env);
  if (uid === null) return json({ erro: 'sem login' }, 401);
  const corpo = ((await req.json().catch(() => null)) ?? {}) as Dados;
  const acao = corpo['acao'];
  const [eu, estadoDoc] = await lerVarios(env, [`users/${uid}`, 'especiais/estado']);
  const souCriador = typeof eu?.['username'] === 'string' && eu['username'].toLowerCase() === criadorDe(env);
  const estado = lerEstado(estadoDoc);

  // Abrir o presente: quem ganhou.
  if (acao === 'abrir') {
    const id = typeof corpo['mensagem'] === 'string' && MSG.test(corpo['mensagem']) ? corpo['mensagem'] : null;
    if (id === null) return json({ erro: 'pedido errado' }, 400);
    const msg = await ler(env, `dmMessages/${id}`);
    const p = msg?.['presente'] as Dados | undefined;
    const ins = p?.['insignia'] as QueDa | undefined;
    if (msg === null || p === undefined || ins === undefined || !QUE_DA.includes(ins)) return json({ erro: 'esse presente não existe' }, 404);
    if (!String(msg['threadId'] ?? '').split('_').includes(uid) || msg['authorId'] === uid) return json({ erro: 'esse presente não é seu' }, 403);
    const meu = estado[ins][uid];
    if (meu === undefined || meu.msg !== id) return json({ erro: 'esse presente não vale mais' }, 410);
    const insignias = await ler(env, `insignias/${uid}`);
    const tem = Object.keys((insignias?.['tem'] ?? {}) as Dados);
    const agora = new Date().toISOString();
    const brilho = melhorBrilho(String(eu?.['username'] ?? '').toLowerCase() === criadorDe(env), [...tem, ins]);
    if (meu.aberto) return json({ ok: true, insignia: ins, brilho });
    await gravar(env, [
      { caminho: `insignias/${uid}`, definir: { [`tem.${ins}`]: agora, [`n.esp_${ins}`]: 1, atualizadoEm: agora } },
      { caminho: `users/${uid}`, definir: { brilho }, existe: true },
      { caminho: `dmMessages/${id}`, definir: { 'presente.aberto': true }, existe: true },
      { caminho: 'especiais/estado', definir: { [`${ins}.${uid}.aberto`]: true } },
    ]);
    return json({ ok: true, insignia: ins, brilho });
  }

  if (!souCriador) return json({ erro: 'só o criador do Loftchat pode' }, 403);

  if (acao === 'listar') {
    const uids = [...new Set(QUE_DA.flatMap((i) => Object.keys(estado[i])))].slice(0, 200);
    const perfis = await lerVarios(env, uids.map((u) => `users/${u}`));
    const porUid = new Map(uids.map((u, i) => [u, pessoa(u, perfis[i] ?? null)]));
    return json({
      criador: pessoa(uid, eu),
      quem: Object.fromEntries(
        QUE_DA.map((i) => [
          i,
          Object.entries(estado[i])
            .sort((a, b) => a[1].desde.localeCompare(b[1].desde))
            .map(([u, x]) => ({ ...porUid.get(u)!, desde: x.desde, aberto: x.aberto })),
        ]),
      ),
    });
  }

  if (acao === 'buscar') {
    const texto = typeof corpo['texto'] === 'string' ? corpo['texto'].trim().replace(/^@/, '').slice(0, 32) : '';
    if (texto.length < 1) return json({ pessoas: [] });
    const nome = texto.charAt(0).toUpperCase() + texto.slice(1);
    const listas = await Promise.all([procurar(env, 'username', texto.toLowerCase()), procurar(env, 'displayName', nome), procurar(env, 'displayName', texto)]);
    const vistos = new Set<string>([uid]);
    const pessoas: Pessoa[] = [];
    for (const l of listas) for (const x of l) if (!vistos.has(x.id) && pessoas.length < 8) {
      vistos.add(x.id);
      pessoas.push(pessoa(x.id, x.d));
    }
    return json({ pessoas });
  }

  const ins = corpo['insignia'] as QueDa;
  const alvo = typeof corpo['uid'] === 'string' && ID.test(corpo['uid']) ? corpo['uid'] : null;
  if (!QUE_DA.includes(ins) || alvo === null) return json({ erro: 'pedido errado' }, 400);
  if (alvo === uid) return json({ erro: 'essa é para dar para os outros' }, 400);

  if (acao === 'dar') {
    if (estado[ins][alvo] !== undefined) return json({ erro: 'essa pessoa já tem' }, 409);
    const quem = await ler(env, `users/${alvo}`);
    if (quem === null) return json({ erro: 'essa pessoa não existe' }, 404);
    const agora = new Date().toISOString();
    const msg = `pres${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    await gravar(env, [
      {
        caminho: `dmMessages/${msg}`,
        novo: true,
        definir: { threadId: par(uid, alvo), authorId: uid, kind: 'text', body: '', sentAt: agora, presente: { insignia: ins, aberto: false } },
      },
      { caminho: 'especiais/estado', definir: { [`${ins}.${alvo}`]: { desde: agora, aberto: false, msg } } },
    ]);
    return json({ ok: true, mensagem: msg });
  }

  if (acao === 'tirar') {
    const tinha = estado[ins][alvo];
    if (tinha === undefined) return json({ ok: true });
    const insignias = await ler(env, `insignias/${alvo}`);
    const tem = Object.keys((insignias?.['tem'] ?? {}) as Dados).filter((i) => i !== ins);
    const quem = await ler(env, `users/${alvo}`);
    const brilho = melhorBrilho(String(quem?.['username'] ?? '').toLowerCase() === criadorDe(env), tem);
    const mudancas: Mudanca[] = [{ caminho: 'especiais/estado', apagar: [`${ins}.${alvo}`] }];
    if (tinha.aberto) {
      mudancas.push({ caminho: `insignias/${alvo}`, apagar: [`tem.${ins}`, `n.esp_${ins}`] });
      if (quem !== null) mudancas.push(brilho === null ? { caminho: `users/${alvo}`, apagar: ['brilho'], existe: true } : { caminho: `users/${alvo}`, definir: { brilho }, existe: true });
    }
    // O presente fechado some do privado.
    if (!tinha.aberto && MSG.test(tinha.msg)) mudancas.push({ caminho: `dmMessages/${tinha.msg}`, definir: { 'presente.cancelado': true }, existe: true });
    await gravar(env, mudancas).catch(async () => {
      // A mensagem pode ter sido apagada: tira sem ela.
      await gravar(env, mudancas.filter((m) => !m.caminho.startsWith('dmMessages/')));
    });
    return json({ ok: true });
  }

  return json({ erro: 'ação não existe' }, 400);
}
