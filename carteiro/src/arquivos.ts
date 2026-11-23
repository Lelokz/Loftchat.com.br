/**
 * ARQUIVOS (0.5.0): imagem, GIF, vídeo e figurinha, guardados no R2 da
 * Cloudflare (grátis até 10 GB guardados; baixar é sempre grátis).
 *
 * POST /arquivo?tipo=imagem|gif|video|capa|figurinha|audio   (com login; o corpo é o arquivo)
 * GET  /arquivo/<chave>                                 (público, com suporte a pedaço — vídeo avança)
 *
 * LIMPEZA (todo dia): some o que tem mais de 60 dias; passando de 8 GB
 * guardados, o prazo cai para 30. Com 9,5 GB o envio para, então nunca
 * passa do grátis. Figurinha nunca some.
 */

/* Tipos mínimos do R2 (sem o pacote de tipos da Cloudflare). */
interface Objeto {
  key: string;
  size: number;
  uploaded: Date;
  httpEtag: string;
  httpMetadata?: { contentType?: string };
  range?: { offset: number; length: number };
}
interface ObjetoComCorpo extends Objeto {
  body: ReadableStream;
}
export interface Balde {
  put(chave: string, corpo: ReadableStream | ArrayBuffer, opcoes?: unknown): Promise<Objeto | null>;
  get(chave: string, opcoes?: unknown): Promise<ObjetoComCorpo | null>;
  delete(chaves: string | string[]): Promise<void>;
  list(opcoes?: { cursor?: string; limit?: number; prefix?: string }): Promise<{
    objects: Objeto[];
    truncated: boolean;
    cursor?: string;
  }>;
}

const MB = 1024 * 1024;
const GB = 1024 * MB;

export const TIPOS: Record<string, { maximo: number; aceita: RegExp }> = {
  imagem: { maximo: 20 * MB, aceita: /^image\/(webp|jpeg|png)$/ },
  gif: { maximo: 20 * MB, aceita: /^image\/gif$/ },
  video: { maximo: 50 * MB, aceita: /^video\/(mp4|webm|quicktime|3gpp|x-matroska)$/ },
  capa: { maximo: 1 * MB, aceita: /^image\/(webp|jpeg)$/ },
  figurinha: { maximo: 1 * MB, aceita: /^image\/(webp|png|gif)$/ },
  // Mensagem de voz (0.5.5): até 5 minutos em Opus dá ~2 MB; 5 MB sobra.
  audio: { maximo: 5 * MB, aceita: /^audio\/(webm|ogg|mp4|aac|mpeg)$/ },
};

const LIMITE_GUARDADO = 9.5 * GB;
const PRAZO_CURTO_A_PARTIR = 8 * GB;
const DIA = 24 * 60 * 60 * 1000;
const ENVIOS_POR_HORA = 120;

const USO = 'sistema/uso.json';

interface Uso {
  total: number;
  prazoDias: number;
  em: string;
}

let usoGuardado: { uso: Uso; ate: number } | null = null;

async function lerUso(balde: Balde): Promise<Uso> {
  if (usoGuardado !== null && usoGuardado.ate > Date.now()) return usoGuardado.uso;
  const obj = await balde.get(USO);
  const uso: Uso = obj === null ? { total: 0, prazoDias: 60, em: '' } : ((await new Response(obj.body).json()) as Uso);
  usoGuardado = { uso, ate: Date.now() + 10 * 60_000 };
  return uso;
}

const enviosPorPessoa = new Map<string, { n: number; desde: number }>();
function passouDoLimite(uid: string): boolean {
  const agora = Date.now();
  const c = enviosPorPessoa.get(uid);
  if (c === undefined || agora - c.desde > 60 * 60_000) {
    enviosPorPessoa.set(uid, { n: 1, desde: agora });
    return false;
  }
  c.n += 1;
  return c.n > ENVIOS_POR_HORA;
}

function sorteio(): string {
  const letras = 'abcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(20)), (n) => letras[n % letras.length]).join('');
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, GET, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type, range',
  'access-control-expose-headers': 'content-length, content-range, accept-ranges',
};

function json(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json', ...CORS } });
}

/** Recebe um arquivo. `uid` já vem conferido pelo login. */
export async function receberArquivo(req: Request, balde: Balde, uid: string): Promise<Response> {
  const url = new URL(req.url);
  const tipo = url.searchParams.get('tipo') ?? '';
  const regra = TIPOS[tipo];
  if (regra === undefined) return json({ erro: 'tipo de arquivo desconhecido' }, 400);
  const formato = (req.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
  if (!regra.aceita.test(formato)) return json({ erro: 'formato não aceito' }, 415);
  const tamanho = Number(req.headers.get('content-length') ?? 'NaN');
  if (!Number.isFinite(tamanho) || tamanho <= 0) return json({ erro: 'sem tamanho' }, 411);
  if (tamanho > regra.maximo) return json({ erro: 'arquivo grande demais', maximo: regra.maximo }, 413);
  if (passouDoLimite(uid)) return json({ erro: 'muitos envios, espere um pouco' }, 429);
  const uso = await lerUso(balde);
  if (uso.total + tamanho > LIMITE_GUARDADO) return json({ erro: 'espaço cheio' }, 507);
  if (req.body === null) return json({ erro: 'sem arquivo' }, 400);

  const chave = `${tipo}/${uid}/${sorteio()}`;
  const salvo = await balde.put(chave, req.body, {
    httpMetadata: { contentType: formato, cacheControl: 'public, max-age=31536000, immutable' },
    customMetadata: { uid },
  });
  if (salvo === null) return json({ erro: 'não salvou' }, 500);
  // Conta o que entrou, até a próxima limpeza recontar tudo.
  if (usoGuardado !== null) usoGuardado.uso.total += tamanho;
  return json({ chave, url: `${url.origin}/arquivo/${chave}`, tamanho: salvo.size, prazoDias: tipo === 'figurinha' ? 0 : uso.prazoDias });
}

/** Entrega um arquivo. Aceita pedaço (Range), que é o que deixa o vídeo avançar. */
export async function entregarArquivo(req: Request, balde: Balde, chave: string): Promise<Response> {
  const [tipo, ...resto] = chave.split('/');
  if (tipo === undefined || !Object.hasOwn(TIPOS, tipo) || !/^[A-Za-z0-9_-]{1,64}\/[a-z0-9]{20}$/.test(resto.join('/'))) {
    return new Response('não existe', { status: 404, headers: CORS });
  }
  const pedaco = req.headers.get('range');
  const obj = await balde.get(chave, pedaco === null ? undefined : { range: req.headers });
  if (obj === null) return new Response('expirou', { status: 404, headers: CORS });
  const cabecalhos = new Headers(CORS);
  cabecalhos.set('content-type', obj.httpMetadata?.contentType ?? 'application/octet-stream');
  cabecalhos.set('cache-control', 'public, max-age=31536000, immutable');
  cabecalhos.set('accept-ranges', 'bytes');
  cabecalhos.set('etag', obj.httpEtag);
  if (pedaco !== null && obj.range !== undefined) {
    const { offset, length } = obj.range;
    cabecalhos.set('content-range', `bytes ${offset}-${offset + length - 1}/${obj.size}`);
    cabecalhos.set('content-length', String(length));
    return new Response(obj.body, { status: 206, headers: cabecalhos });
  }
  cabecalhos.set('content-length', String(obj.size));
  return new Response(obj.body, { headers: cabecalhos });
}

/** A limpeza de todo dia. Devolve o resumo (também gravado em sistema/uso.json). */
export async function limpar(balde: Balde, agora = Date.now()): Promise<Uso & { apagados: number }> {
  const todos: Objeto[] = [];
  let cursor: string | undefined;
  do {
    const pagina = await balde.list({ limit: 1000, ...(cursor === undefined ? {} : { cursor }) });
    todos.push(...pagina.objects.filter((o) => !o.key.startsWith('sistema/')));
    cursor = pagina.truncated ? pagina.cursor : undefined;
  } while (cursor !== undefined);

  const somados = todos.reduce((s, o) => s + o.size, 0);
  const prazoDias = somados > PRAZO_CURTO_A_PARTIR ? 30 : 60;
  const vencidos = todos.filter(
    (o) => !o.key.startsWith('figurinha/') && agora - new Date(o.uploaded).getTime() > prazoDias * DIA,
  );
  for (let i = 0; i < vencidos.length; i += 1000) {
    await balde.delete(vencidos.slice(i, i + 1000).map((o) => o.key));
  }
  const total = somados - vencidos.reduce((s, o) => s + o.size, 0);
  const uso: Uso = { total, prazoDias, em: new Date(agora).toISOString() };
  await balde.put(USO, new TextEncoder().encode(JSON.stringify(uso)).buffer as ArrayBuffer, {
    httpMetadata: { contentType: 'application/json' },
  });
  usoGuardado = { uso, ate: Date.now() + 10 * 60_000 };
  return { ...uso, apagados: vencidos.length };
}

export { CORS as CORS_DOS_ARQUIVOS };
