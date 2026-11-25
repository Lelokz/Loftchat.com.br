/**
 * CARTEIRO DAS NOTIFICAÇÕES (0.4.0).
 *
 * POST /avisar  { tipo: 'grupo' | 'pv', id }   (Authorization: Bearer <token do Firebase>)
 *   Quem mandou a mensagem chama logo depois de mandar. O carteiro confere
 *   que a mensagem existe, é dessa pessoa e acabou de ser mandada, e avisa
 *   os outros: celular pelo FCM, PC pelo documento `avisos/{uid}`.
 *
 * GET /foto/{uid}?v=..&a=..
 *   A foto de quem mandou, para a notificação. Só com assinatura do carteiro.
 *
 * POST /arquivo, GET /arquivo/<chave> e a limpeza diária: ver arquivos.ts (0.5.0).
 *
 * POST /unica/abrir: visualização única, ver unica.ts (0.10.0).
 */

import { entregarArquivo, limpar, receberArquivo } from './arquivos';
import { quemVeOCanal, rotaCargos } from './cargos';
import { abrirUnica } from './unica';
import type { Balde } from './arquivos';

export interface Env {
  PROJETO: string;
  CHAVE_GOOGLE: string;
  SEGREDO_FOTO: string;
  /** Só no teste local: endereço do emulador do Firestore. */
  EMULADOR?: string;
  /** O R2 com os arquivos (0.5.0). */
  ARQUIVOS?: Balde;
}

const TEXTO_MAX = 180;
const IDADE_MAX_MS = 2 * 60_000;
/** 0.9.5: a ligação toca por 30 s; aviso de chamada mais velha que isto não sai. */
const TOQUE_MAX_MS = 40_000;
const AVISOS_POR_MINUTO = 40;

type Dados = Record<string, unknown>;

interface Aparelho {
  tipo: 'android' | 'pc';
  token?: string;
}

/* ------------------------------ utilidades ------------------------------ */

const codificador = new TextEncoder();

function base64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function deBase64url(texto: string): Uint8Array {
  const b = texto.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b + '='.repeat((4 - (b.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export function json(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { 'content-type': 'application/json', ...CORS },
  });
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, GET, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type, range',
  'access-control-expose-headers': 'content-length, content-range, accept-ranges',
};

/** Guarda resultados por um tempo, dentro da mesma instância do carteiro. */
const guardados = new Map<string, { valor: unknown; ate: number }>();
async function guardado<T>(chave: string, ms: number, buscar: () => Promise<T>): Promise<T> {
  const g = guardados.get(chave);
  if (g !== undefined && g.ate > Date.now()) return g.valor as T;
  const valor = await buscar();
  if (guardados.size > 2000) guardados.clear();
  guardados.set(chave, { valor, ate: Date.now() + ms });
  return valor;
}

/* --------------------------- token do Firebase --------------------------- */

const URL_CHAVES_FIREBASE =
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

async function chaveDoFirebase(kid: string): Promise<CryptoKey | null> {
  const chaves = await guardado('chaves-firebase', 60 * 60_000, async () => {
    const r = await fetch(URL_CHAVES_FIREBASE);
    const { keys } = (await r.json()) as { keys: (JsonWebKey & { kid: string })[] };
    const mapa = new Map<string, CryptoKey>();
    for (const k of keys) {
      mapa.set(
        k.kid,
        await crypto.subtle.importKey('jwk', k, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']),
      );
    }
    return mapa;
  });
  return chaves.get(kid) ?? null;
}

/** Devolve o uid de quem chamou, ou null se o token não vale. */
export async function quemChamou(req: Request, env: Env): Promise<string | null> {
  const cabecalho = req.headers.get('authorization') ?? '';
  const partes = cabecalho.replace(/^Bearer /, '').split('.');
  if (partes.length !== 3) return null;
  try {
    const cab = JSON.parse(new TextDecoder().decode(deBase64url(partes[0]!))) as { alg?: string; kid?: string };
    const d = JSON.parse(new TextDecoder().decode(deBase64url(partes[1]!))) as Dados;
    const agora = Date.now() / 1000;
    if (d['aud'] !== env.PROJETO) return null;
    if (d['iss'] !== `https://securetoken.google.com/${env.PROJETO}`) return null;
    if (typeof d['sub'] !== 'string' || d['sub'] === '') return null;
    if (typeof d['exp'] !== 'number' || d['exp'] < agora) return null;
    if (typeof d['iat'] !== 'number' || d['iat'] > agora + 300) return null;

    if (env.EMULADOR === undefined) {
      if (cab.alg !== 'RS256' || cab.kid === undefined) return null;
      const chave = await chaveDoFirebase(cab.kid);
      if (chave === null) return null;
      const ok = await crypto.subtle.verify(
        'RSASSA-PKCS1-v1_5',
        chave,
        deBase64url(partes[2]!),
        codificador.encode(`${partes[0]}.${partes[1]}`),
      );
      if (!ok) return null;
    }
    return d['sub'];
  } catch {
    return null;
  }
}

/* ------------------------- acesso ao Google (conta de serviço) ------------------------- */

let acesso: { valor: string; ate: number } | null = null;

async function acessoGoogle(env: Env): Promise<string> {
  if (env.EMULADOR !== undefined) return 'owner';
  if (acesso !== null && acesso.ate > Date.now() + 60_000) return acesso.valor;

  const chave = JSON.parse(env.CHAVE_GOOGLE) as { client_email: string; private_key: string };
  const agora = Math.floor(Date.now() / 1000);
  const cab = base64url(codificador.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const corpo = base64url(
    codificador.encode(
      JSON.stringify({
        iss: chave.client_email,
        scope: 'https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/firebase.messaging',
        aud: 'https://oauth2.googleapis.com/token',
        iat: agora,
        exp: agora + 3600,
      }),
    ),
  );
  const pem = chave.private_key.replace(/-----[^-]+-----/g, '').replace(/\s/g, '');
  const chavePrivada = await crypto.subtle.importKey(
    'pkcs8',
    Uint8Array.from(atob(pem), (c) => c.charCodeAt(0)),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const assinatura = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', chavePrivada, codificador.encode(`${cab}.${corpo}`));
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${cab}.${corpo}.${base64url(new Uint8Array(assinatura))}`,
    }),
  });
  if (!r.ok) throw new Error(`Google recusou a chave (${r.status})`);
  const t = (await r.json()) as { access_token: string; expires_in: number };
  acesso = { valor: t.access_token, ate: Date.now() + t.expires_in * 1000 };
  return acesso.valor;
}

/* ------------------------------- Firestore ------------------------------- */

export function raiz(env: Env): string {
  const host = env.EMULADOR === undefined ? 'https://firestore.googleapis.com' : `http://${env.EMULADOR}`;
  return `${host}/v1/projects/${env.PROJETO}/databases/(default)/documents`;
}

export function nomeCompleto(env: Env, caminho: string): string {
  return `projects/${env.PROJETO}/databases/(default)/documents/${caminho}`;
}

/** Valor do Firestore (REST) → valor comum. */
function lerValor(v: Dados): unknown {
  if ('stringValue' in v) return v['stringValue'];
  if ('integerValue' in v) return Number(v['integerValue']);
  if ('doubleValue' in v) return v['doubleValue'];
  if ('booleanValue' in v) return v['booleanValue'];
  if ('timestampValue' in v) return v['timestampValue'];
  if ('mapValue' in v) return lerCampos(((v['mapValue'] as Dados)['fields'] ?? {}) as Dados);
  if ('arrayValue' in v) return (((v['arrayValue'] as Dados)['values'] ?? []) as Dados[]).map(lerValor);
  return null;
}

export function lerCampos(campos: Dados): Dados {
  const saida: Dados = {};
  for (const [k, v] of Object.entries(campos)) saida[k] = lerValor(v as Dados);
  return saida;
}

function camposDeTexto(dados: Record<string, string>): Dados {
  const campos: Dados = {};
  for (const [k, v] of Object.entries(dados)) campos[k] = { stringValue: v };
  return campos;
}

export async function firestore(env: Env, url: string, init: RequestInit = {}): Promise<Response> {
  const token = await acessoGoogle(env);
  return fetch(url, {
    ...init,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
  });
}

export async function ler(env: Env, caminho: string): Promise<Dados | null> {
  const r = await firestore(env, `${raiz(env)}/${caminho}`);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`Firestore ${r.status} lendo ${caminho.split('/')[0]}`);
  const doc = (await r.json()) as { fields?: Dados };
  return lerCampos(doc.fields ?? {});
}

/** Vários documentos numa chamada só. Devolve na mesma ordem (null = não existe). */
export async function lerVarios(env: Env, caminhos: string[]): Promise<(Dados | null)[]> {
  if (caminhos.length === 0) return [];
  const r = await firestore(env, `${raiz(env)}:batchGet`, {
    method: 'POST',
    body: JSON.stringify({ documents: caminhos.map((c) => nomeCompleto(env, c)) }),
  });
  if (!r.ok) throw new Error(`Firestore ${r.status} no batchGet`);
  const linhas = (await r.json()) as { found?: { name: string; fields?: Dados } }[];
  const porNome = new Map<string, Dados>();
  for (const l of linhas) if (l.found !== undefined) porNome.set(l.found.name, lerCampos(l.found.fields ?? {}));
  return caminhos.map((c) => porNome.get(nomeCompleto(env, c)) ?? null);
}

async function membrosDoGrupo(env: Env, grupo: string): Promise<string[]> {
  const r = await firestore(env, `${raiz(env)}:runQuery`, {
    method: 'POST',
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'memberships' }],
        where: { fieldFilter: { field: { fieldPath: 'groupId' }, op: 'EQUAL', value: { stringValue: grupo } } },
        select: { fields: [{ fieldPath: 'memberId' }] },
      },
    }),
  });
  if (!r.ok) throw new Error(`Firestore ${r.status} nos membros`);
  const linhas = (await r.json()) as { document?: { fields?: Dados } }[];
  return linhas
    .map((l) => lerCampos(l.document?.fields ?? {})['memberId'])
    .filter((m): m is string => typeof m === 'string');
}

async function gravar(env: Env, caminho: string, campos: Dados): Promise<void> {
  const r = await firestore(env, `${raiz(env)}/${caminho}`, {
    method: 'PATCH',
    body: JSON.stringify({ fields: campos }),
  });
  if (!r.ok) throw new Error(`Firestore ${r.status} gravando ${caminho.split('/')[0]}`);
}

/** Tira um aparelho que o Google disse que não existe mais. */
async function esquecerAparelho(env: Env, uid: string, aparelho: string): Promise<void> {
  const mascara = encodeURIComponent(`lista.${aparelho}`);
  await firestore(env, `${raiz(env)}/aparelhos/${uid}?updateMask.fieldPaths=${mascara}&currentDocument.exists=true`, {
    method: 'PATCH',
    body: JSON.stringify({ fields: {} }),
  });
}

/* --------------------------------- foto --------------------------------- */

async function assinar(env: Env, texto: string): Promise<string> {
  const chave = await crypto.subtle.importKey(
    'raw',
    codificador.encode(env.SEGREDO_FOTO),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const a = await crypto.subtle.sign('HMAC', chave, codificador.encode(texto));
  return base64url(new Uint8Array(a)).slice(0, 22);
}

async function resumo(texto: string): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', codificador.encode(texto));
  return base64url(new Uint8Array(h)).slice(0, 10);
}

async function enderecoDaFoto(env: Env, origem: string, uid: string, foto: string): Promise<string> {
  const v = await resumo(foto);
  return `${origem}/foto/${uid}?v=${v}&a=${await assinar(env, `${uid}.${v}`)}`;
}

async function servirFoto(req: Request, env: Env, uid: string): Promise<Response> {
  const url = new URL(req.url);
  const v = url.searchParams.get('v') ?? '';
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(uid) || url.searchParams.get('a') !== (await assinar(env, `${uid}.${v}`))) {
    return new Response('não', { status: 403 });
  }
  const cache = (caches as unknown as { default: Cache }).default;
  const guardada = await cache.match(req);
  if (guardada !== undefined) return guardada;

  const perfil = await ler(env, `users/${uid}`);
  const foto = perfil?.['photo'];
  const partes = typeof foto === 'string' ? /^data:(image\/[a-z+]+);base64,(.+)$/.exec(foto) : null;
  if (partes === null) return new Response('sem foto', { status: 404 });
  const resposta = new Response(Uint8Array.from(atob(partes[2]!), (c) => c.charCodeAt(0)), {
    headers: { 'content-type': partes[1]!, 'cache-control': 'public, max-age=86400' },
  });
  await cache.put(req, resposta.clone());
  return resposta;
}

/* -------------------------------- avisar -------------------------------- */

const avisosPorPessoa = new Map<string, { n: number; desde: number }>();
const jaAvisadas = new Set<string>();

function passouDoLimite(uid: string): boolean {
  const agora = Date.now();
  const c = avisosPorPessoa.get(uid);
  if (c === undefined || agora - c.desde > 60_000) {
    avisosPorPessoa.set(uid, { n: 1, desde: agora });
    return false;
  }
  c.n += 1;
  return c.n > AVISOS_POR_MINUTO;
}

/** Mensagem só com arquivo vira "📷 Foto", "🎬 Vídeo"… (com legenda, a legenda). */
function textoDoAviso(msg: Dados): string {
  // 0.10.0: visualização única nunca mostra a legenda nem nada do conteúdo.
  if (typeof msg['unica'] === 'object' && msg['unica'] !== null) {
    return msg['kind'] === 'video' ? '🎬 Vídeo de visualização única' : '📷 Foto de visualização única';
  }
  const corpo = String(msg['body'] ?? '').trim();
  if (corpo !== '') return cortar(corpo);
  const tipos: Record<string, string> = { image: '📷 Foto', gif: 'GIF', video: '🎬 Vídeo', sticker: 'Figurinha', audio: '🎤 Mensagem de voz' };
  return tipos[String(msg['kind'])] ?? '';
}

function cortar(texto: string): string {
  const limpo = texto.trim();
  return limpo.length > TEXTO_MAX ? `${limpo.slice(0, TEXTO_MAX - 1).trimEnd()}…` : limpo;
}

async function mandarPeloGoogle(env: Env, para: string, aparelho: string, token: string, dados: Record<string, string>): Promise<void> {
  if (env.EMULADOR !== undefined) {
    // Teste local: em vez do Google, deixa anotado no emulador.
    await gravar(env, `testeCarteiro/${para}_${aparelho}_${dados['mensagem']}`, camposDeTexto({ para, token, ...dados }));
    return;
  }
  const r = await firestore(env, `https://fcm.googleapis.com/v1/projects/${env.PROJETO}/messages:send`, {
    method: 'POST',
    body: JSON.stringify({ message: { token, data: dados, android: { priority: 'high', ttl: '86400s' } } }),
  });
  if (r.ok) return;
  const erro = await r.text();
  if (r.status === 404 || erro.includes('UNREGISTERED')) {
    await esquecerAparelho(env, para, aparelho);
    return;
  }
  console.log(`FCM ${r.status}: ${erro.slice(0, 300)}`);
}

async function avisar(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const uid = await quemChamou(req, env);
  if (uid === null) return json({ erro: 'sem login' }, 401);

  const corpo = (await req.json().catch(() => null)) as { tipo?: unknown; id?: unknown } | null;
  const tipo = corpo?.tipo;
  const id = corpo?.id;
  // 0.9.5: ligação no PV tocando — o id é o par ({a}_{b}).
  if (tipo === 'chamada') {
    if (typeof id !== 'string' || !/^[A-Za-z0-9]{1,40}_[A-Za-z0-9]{1,40}$/.test(id)) return json({ erro: 'pedido errado' }, 400);
    if (passouDoLimite(uid)) return json({ erro: 'devagar' }, 429);
    const chamada = await ler(env, `chamadas/${id}`);
    if (chamada === null) return json({ erro: 'chamada não existe' }, 404);
    if (chamada['de'] !== uid) return json({ erro: 'chamada de outra pessoa' }, 403);
    if (chamada['estado'] !== 'tocando') return json({ erro: 'não está tocando' }, 409);
    const criada = Date.parse(String(chamada['criadaEm']));
    if (!(Date.now() - criada < TOQUE_MAX_MS)) return json({ erro: 'chamada velha' }, 409);
    const chave = `chamada:${id}:${criada}`;
    if (jaAvisadas.has(chave)) return json({ ok: true, repetido: true });
    jaAvisadas.add(chave);
    const origem = new URL(req.url).origin;
    ctx.waitUntil(entregarChamada(env, origem, uid, chamada).catch((e: unknown) => console.log(String(e))));
    return json({ ok: true }, 202);
  }
  if ((tipo !== 'grupo' && tipo !== 'pv') || typeof id !== 'string' || !/^[A-Za-z0-9]{1,40}$/.test(id)) {
    return json({ erro: 'pedido errado' }, 400);
  }
  if (jaAvisadas.has(id)) return json({ ok: true, repetido: true });
  if (passouDoLimite(uid)) return json({ erro: 'devagar' }, 429);

  const msg = await ler(env, tipo === 'grupo' ? `messages/${id}` : `dmMessages/${id}`);
  if (msg === null) return json({ erro: 'mensagem não existe' }, 404);
  if (msg['authorId'] !== uid) return json({ erro: 'mensagem de outra pessoa' }, 403);
  const enviada = Date.parse(String(msg['sentAt']));
  if (!(Date.now() - enviada < IDADE_MAX_MS)) return json({ erro: 'mensagem velha' }, 409);

  if (jaAvisadas.size > 5000) jaAvisadas.clear();
  jaAvisadas.add(id);

  const origem = new URL(req.url).origin;
  ctx.waitUntil(entregar(env, origem, tipo, id, uid, msg).catch((e: unknown) => console.log(String(e))));
  return json({ ok: true }, 202);
}

async function entregar(env: Env, origem: string, tipo: 'grupo' | 'pv', id: string, uid: string, msg: Dados): Promise<void> {
  const perfil = await guardado(`users/${uid}`, 5 * 60_000, () => ler(env, `users/${uid}`));
  const nome = typeof perfil?.['displayName'] === 'string' ? perfil['displayName'] : 'Alguém';
  const foto = perfil?.['photo'];

  let para: string[];
  let onde: string;
  let conversa: string;
  let abrir: string;
  if (tipo === 'grupo') {
    const grupoId = String(msg['groupId']);
    const canalId = String(msg['channelId']);
    const [grupo, canal, membros] = await Promise.all([
      guardado(`groups/${grupoId}`, 5 * 60_000, () => ler(env, `groups/${grupoId}`)),
      guardado(`channels/${canalId}`, 5 * 60_000, () => ler(env, `channels/${canalId}`)),
      guardado(`membros/${grupoId}`, 2 * 60_000, () => membrosDoGrupo(env, grupoId)),
    ]);
    // 0.8.5: canal privado — só avisa quem vê o canal.
    const veem = new Set(await guardado(`veem/${canalId}`, 60_000, () => quemVeOCanal(env, grupoId, canalId, grupo, canal)));
    if (!membros.includes(uid)) return;
    para = membros.filter((m) => m !== uid && veem.has(m));
    onde = `${String(grupo?.['name'] ?? 'Grupo')} · #${String(canal?.['name'] ?? 'canal')}`;
    conversa = `canal:${canalId}`;
    abrir = `grupo/${grupoId}/${canalId}`;
  } else {
    const dupla = String(msg['threadId']).split('_');
    if (dupla.length !== 2 || !dupla.includes(uid)) return;
    para = dupla.filter((m) => m !== uid);
    onde = 'no seu privado';
    conversa = `pv:${uid}`;
    abrir = `pv/${uid}`;
  }
  if (para.length === 0) return;

  const dados: Record<string, string> = {
    mensagem: id,
    de: nome,
    deUid: uid,
    onde,
    texto: textoDoAviso(msg),
    quando: String(msg['sentAt']),
    conversa,
    abrir,
    foto: typeof foto === 'string' && foto.startsWith('data:image/') ? await enderecoDaFoto(env, origem, uid, foto) : '',
  };

  const aparelhos = await lerVarios(
    env,
    para.map((p) => `aparelhos/${p}`),
  );
  const envios: Promise<void>[] = [];
  para.forEach((pessoa, i) => {
    const lista = (aparelhos[i]?.['lista'] ?? {}) as Record<string, Aparelho>;
    let temPc = false;
    for (const [aparelho, a] of Object.entries(lista)) {
      if (a.tipo === 'android' && typeof a.token === 'string' && a.token.length < 4096) {
        envios.push(mandarPeloGoogle(env, pessoa, aparelho, a.token, dados));
      } else if (a.tipo === 'pc') {
        temPc = true;
      }
    }
    if (temPc) {
      envios.push(gravar(env, `avisos/${pessoa}`, { ultimo: { mapValue: { fields: camposDeTexto(dados) } } }));
    }
  });
  await Promise.all(envios);
}

/**
 * 0.9.5: "Fulano está te ligando". Vai para os aparelhos de quem recebe,
 * pelo mesmo caminho das mensagens (celular pelo Google, PC pelo avisos/{uid}),
 * com `tipo: chamada` — o celular toca como ligação.
 */
async function entregarChamada(env: Env, origem: string, uid: string, chamada: Dados): Promise<void> {
  const para = String(chamada['para']);
  if (!/^[A-Za-z0-9]{1,40}$/.test(para) || para === uid) return;
  const perfil = await guardado(`users/${uid}`, 5 * 60_000, () => ler(env, `users/${uid}`));
  const nome = typeof perfil?.['displayName'] === 'string' ? perfil['displayName'] : 'Alguém';
  const foto = perfil?.['photo'];
  const criadaEm = String(chamada['criadaEm']);
  const comCamera = chamada['comCamera'] === true;
  const dados: Record<string, string> = {
    tipo: 'chamada',
    mensagem: `chamada-${Date.parse(criadaEm)}`,
    de: nome,
    deUid: uid,
    onde: 'no seu privado',
    texto: comCamera ? 'está te ligando com câmera…' : 'está te ligando…',
    comCamera: comCamera ? 'sim' : 'nao',
    quando: criadaEm,
    conversa: `pv:${uid}`,
    abrir: `pv/${uid}`,
    foto: typeof foto === 'string' && foto.startsWith('data:image/') ? await enderecoDaFoto(env, origem, uid, foto) : '',
  };
  const [aparelhos] = await lerVarios(env, [`aparelhos/${para}`]);
  const lista = (aparelhos?.['lista'] ?? {}) as Record<string, Aparelho>;
  const envios: Promise<void>[] = [];
  let temPc = false;
  for (const [aparelho, a] of Object.entries(lista)) {
    if (a.tipo === 'android' && typeof a.token === 'string' && a.token.length < 4096) {
      envios.push(mandarPeloGoogle(env, para, aparelho, a.token, dados));
    } else if (a.tipo === 'pc') {
      temPc = true;
    }
  }
  if (temPc) envios.push(gravar(env, `avisos/${para}`, { ultimo: { mapValue: { fields: camposDeTexto(dados) } } }));
  await Promise.all(envios);
}

/* -------------------------------- entrada -------------------------------- */

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    const url = new URL(req.url);
    try {
      if (req.method === 'POST' && url.pathname === '/avisar') return await avisar(req, env, ctx);
      // 0.8.5: cargos, permissões e moderação (ver cargos.ts).
      if (req.method === 'POST' && url.pathname === '/cargos') return await rotaCargos(req, env);
      const foto = /^\/foto\/([^/]+)$/.exec(url.pathname);
      if (req.method === 'GET' && foto !== null) return await servirFoto(req, env, foto[1]!);
      if (url.pathname === '/arquivo' || url.pathname.startsWith('/arquivo/')) {
        if (env.ARQUIVOS === undefined) return json({ erro: 'arquivos ainda não ligados' }, 503);
        if (req.method === 'POST' && url.pathname === '/arquivo') {
          const uid = await quemChamou(req, env);
          if (uid === null) return json({ erro: 'sem login' }, 401);
          return await receberArquivo(req, env.ARQUIVOS, uid);
        }
        if (req.method === 'GET') return await entregarArquivo(req, env.ARQUIVOS, url.pathname.slice('/arquivo/'.length));
      }
      // 0.10.0: visualização única (ver unica.ts).
      if (req.method === 'POST' && url.pathname === '/unica/abrir') {
        if (env.ARQUIVOS === undefined) return json({ erro: 'arquivos ainda não ligados' }, 503);
        return await abrirUnica(req, env, env.ARQUIVOS);
      }
      // Só no teste local: roda a limpeza como se fosse "agora".
      if (env.EMULADOR !== undefined && req.method === 'POST' && url.pathname === '/teste/limpar' && env.ARQUIVOS !== undefined) {
        const agora = Number(url.searchParams.get('agora') ?? Date.now());
        return json(await limpar(env.ARQUIVOS, agora));
      }
      if (url.pathname === '/') return new Response('Carteiro do Loftchat.', { headers: CORS });
      return json({ erro: 'não existe' }, 404);
    } catch (e) {
      console.log(String(e));
      return json({ erro: 'falhou' }, 500);
    }
  },

  /** A limpeza de todo dia (wrangler.toml → crons). */
  async scheduled(_evento: unknown, env: Env, ctx: ExecutionContext): Promise<void> {
    if (env.ARQUIVOS !== undefined) ctx.waitUntil(limpar(env.ARQUIVOS).then((r) => console.log('limpeza', JSON.stringify(r))));
  },
};
