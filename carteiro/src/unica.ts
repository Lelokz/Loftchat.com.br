/**
 * VISUALIZAÇÃO ÚNICA (0.10.0).
 *
 * A foto/vídeo sobe como `tipo=unica` e fica em `unica/<uid>/<sorteio>` — o
 * GET público de /arquivo RECUSA essa pasta. Só sai por aqui:
 *
 * POST /unica/abrir  { tipo: 'pv' | 'grupo', id }   (com login)
 *   Confere que a mensagem existe, tem `unica.vezes` (1 a 5), que quem pede
 *   está no PV ou vê o canal, que não é quem mandou e que ainda tem vez.
 *   Conta +1 em `unicas/{id}_{uid}` (só o carteiro escreve lá) e devolve o
 *   arquivo inteiro, sem cache. No PV, a última vez apaga o arquivo.
 *
 * Some sozinho em 14 dias (limpeza diária, arquivos.ts).
 */

import type { Balde } from './arquivos';
import { quemVeOCanal } from './cargos';
import { firestore, json, ler, lerCampos, nomeCompleto, quemChamou, raiz } from './index';
import type { Env } from './index';

type Dados = Record<string, unknown>;

export const VEZES_MAX = 5;
export const PRAZO_DA_UNICA_MS = 14 * 24 * 60 * 60 * 1000;

const ID = /^[A-Za-z0-9]{1,64}$/;

/**
 * Conta +1 numa TRANSAÇÃO do Firestore: dois pedidos ao mesmo tempo não
 * ganham a mesma vez (o segundo é abortado e tenta de novo).
 * Devolve a vez contada, 'acabou' ou null (não conseguiu).
 */
async function contarUmaVez(env: Env, caminho: string, novo: (n: number) => Dados, vezes: number): Promise<number | 'acabou' | null> {
  for (let tentativa = 0; tentativa < 4; tentativa++) {
    const t = await firestore(env, `${raiz(env)}:beginTransaction`, { method: 'POST', body: '{}' });
    if (!t.ok) throw new Error(`Firestore ${t.status} abrindo a transação`);
    const { transaction } = (await t.json()) as { transaction: string };
    // Leitura em lote (o GET simples com `transaction` trava no emulador).
    const r = await firestore(env, `${raiz(env)}:batchGet`, {
      method: 'POST',
      body: JSON.stringify({ transaction, documents: [nomeCompleto(env, caminho)] }),
    });
    if (!r.ok) throw new Error(`Firestore ${r.status} lendo a contagem`);
    const achado = ((await r.json()) as { found?: { fields?: Dados } }[])[0]?.found;
    const atual = achado === undefined ? 0 : Number(lerCampos(achado.fields ?? {})['vistas'] ?? 0);
    const n = Number.isFinite(atual) ? atual : 0;
    if (n >= vezes) {
      await firestore(env, `${raiz(env)}:rollback`, { method: 'POST', body: JSON.stringify({ transaction }) });
      return 'acabou';
    }
    const c = await firestore(env, `${raiz(env)}:commit`, {
      method: 'POST',
      body: JSON.stringify({ transaction, writes: [{ update: { name: nomeCompleto(env, caminho), fields: novo(n + 1) } }] }),
    });
    if (c.ok) return n + 1;
    if (c.status !== 409) throw new Error(`Firestore ${c.status} gravando a contagem`);
  }
  return null;
}

/** Quem pode ver esta mensagem (fora quem mandou)? */
async function podeVer(env: Env, tipo: 'pv' | 'grupo', msg: Dados, uid: string): Promise<boolean> {
  if (tipo === 'pv') {
    const par = String(msg['threadId'] ?? '').split('_');
    return par.length === 2 && par.includes(uid);
  }
  const grupo = String(msg['groupId'] ?? '');
  const canal = String(msg['channelId'] ?? '');
  if (grupo === '' || canal === '') return false;
  const [g, c] = await Promise.all([ler(env, `groups/${grupo}`), ler(env, `channels/${canal}`)]);
  if (g === null || c === null) return false;
  return (await quemVeOCanal(env, grupo, canal, g, c)).includes(uid);
}

export async function abrirUnica(req: Request, env: Env, balde: Balde): Promise<Response> {
  const uid = await quemChamou(req, env);
  if (uid === null) return json({ erro: 'sem login' }, 401);
  let pedido: { tipo?: unknown; id?: unknown };
  try {
    pedido = (await req.json()) as typeof pedido;
  } catch {
    return json({ erro: 'pedido inválido' }, 400);
  }
  const tipo = pedido.tipo === 'pv' || pedido.tipo === 'grupo' ? pedido.tipo : null;
  const id = typeof pedido.id === 'string' && ID.test(pedido.id) ? pedido.id : null;
  if (tipo === null || id === null) return json({ erro: 'pedido inválido' }, 400);

  const msg = await ler(env, `${tipo === 'pv' ? 'dmMessages' : 'messages'}/${id}`);
  // Mensagem que não existe e mensagem que a pessoa não vê respondem IGUAL.
  if (msg === null || !(await podeVer(env, tipo, msg, uid))) return json({ erro: 'não existe' }, 404);
  const unica = msg['unica'] as Dados | undefined;
  const anexo = msg['attachment'] as Dados | undefined;
  const vezes = Number(unica?.['vezes']);
  const chave = String(anexo?.['chave'] ?? '');
  if (!Number.isInteger(vezes) || vezes < 1 || vezes > VEZES_MAX || !chave.startsWith('unica/')) {
    return json({ erro: 'não é visualização única' }, 400);
  }
  const autor = String(msg['authorId'] ?? '');
  if (autor === uid) return json({ erro: 'quem mandou não abre' }, 403);
  const enviada = Date.parse(String(msg['sentAt'] ?? ''));
  if (!Number.isFinite(enviada) || Date.now() - enviada > PRAZO_DA_UNICA_MS) return json({ erro: 'expirou' }, 410);

  // Conta antes de entregar: se a conexão cair no meio, a vez já foi.
  const vez = await contarUmaVez(
    env,
    `unicas/${id}_${uid}`,
    (n) => ({
      msg: { stringValue: id },
      uid: { stringValue: uid },
      autor: { stringValue: autor },
      vistas: { integerValue: String(n) },
      vezes: { integerValue: String(vezes) },
      em: { timestampValue: new Date().toISOString() },
    }),
    vezes,
  );
  if (vez === 'acabou') return json({ erro: 'acabou', vezes }, 403);
  if (vez === null) return json({ erro: 'tente de novo' }, 409);

  const obj = await balde.get(chave);
  if (obj === null) return json({ erro: 'expirou' }, 410);
  const corpo = await new Response(obj.body).arrayBuffer();
  // No PV só tem uma pessoa para ver: a última vez apaga o arquivo de vez.
  if (tipo === 'pv' && vez >= vezes) await balde.delete(chave);
  return new Response(corpo, {
    headers: {
      'content-type': obj.httpMetadata?.contentType ?? 'application/octet-stream',
      'content-length': String(corpo.byteLength),
      'cache-control': 'no-store',
      'x-vez': String(vez),
      'x-vezes': String(vezes),
      'access-control-allow-origin': '*',
      'access-control-expose-headers': 'x-vez, x-vezes, content-length',
    },
  });
}
