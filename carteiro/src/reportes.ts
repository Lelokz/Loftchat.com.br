/**
 * REPORTAR BUG (0.13.0).
 *
 *   POST /reportes                    (com login) manda um reporte
 *   GET  /reportes/admin/lista        (chave)     os reportes, do mais novo ao mais velho
 *   GET  /reportes/admin/arquivo/<c>  (chave)     um anexo ou o áudio
 *   POST /reportes/admin              (chave)     { acao: 'visto' | 'confirmar' | 'consertado', ids, versao? }
 *
 * O reporte mora em `reportes/{id}` (só quem mandou lê; só o carteiro grava).
 * Os arquivos sobem antes pelo POST /arquivo?tipo=reporte, numa pasta que o
 * GET público não entrega. A chave de quem lê (o criador) é o segredo
 * CHAVE_REPORTES — fica fora do código.
 *
 * Caçador de bugs: conta BUG CONFIRMADO (n.bugs), não reporte mandado. Cada
 * reporte conta uma vez só (marcasDeConquista/bug_<id>).
 */

import { CATEGORIAS_DE_BUG, LIMITE_DE_REPORTES_POR_DIA, lerReporte } from '../../src/lib/reportes-comum';
import type { Anexo } from '../../src/lib/reportes-comum';
import { firestore, json, ler, lerCampos, lerVarios, quemChamou, raiz } from './index';
import type { Env } from './index';
import { contarPara, diaDe, gravarTudo } from './insignias';

type Dados = Record<string, unknown>;

function texto(v: unknown, max: number): string {
  return typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max) : '';
}

function sorteio(): string {
  const letras = 'abcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(20)), (n) => letras[n % letras.length]).join('');
}

/** A chave do arquivo tem que ser da própria pessoa, na pasta dos reportes. */
function chaveDaPessoa(c: unknown, uid: string): c is string {
  return typeof c === 'string' && c.startsWith(`reporte/${uid}/`) && /^reporte\/[A-Za-z0-9_-]{1,64}\/[a-z0-9]{20}$/.test(c);
}

async function enviar(req: Request, env: Env): Promise<Response> {
  const uid = await quemChamou(req, env);
  if (uid === null) return json({ erro: 'sem login' }, 401);
  const corpo = (await req.json().catch(() => null)) as Dados | null;
  if (corpo === null) return json({ erro: 'pedido inválido' }, 400);

  const titulo = texto(corpo['titulo'], 80);
  const categoria = texto(corpo['categoria'], 40);
  const descricao = texto(corpo['texto'], 2000);
  if (titulo.length < 3) return json({ erro: 'Escreva um título.' }, 400);
  if (!CATEGORIAS_DE_BUG.some((c) => c.id === categoria)) return json({ erro: 'Escolha a categoria.' }, 400);

  const a = corpo['audio'] as Dados | undefined;
  const audio = a !== undefined && a !== null && chaveDaPessoa(a['chave'], uid)
    ? { chave: a['chave'] as string, duracaoMs: Math.max(0, Math.min(5 * 60_000, Math.round(Number(a['duracaoMs']) || 0))) }
    : null;
  if (descricao === '' && audio === null) return json({ erro: 'Conte o que aconteceu (por escrito ou em áudio).' }, 400);

  const anexos: Anexo[] = [];
  for (const x of Array.isArray(corpo['anexos']) ? corpo['anexos'].slice(0, 5) : []) {
    const d = x as Dados;
    if (!chaveDaPessoa(d?.['chave'], uid)) return json({ erro: 'anexo inválido' }, 400);
    const tipo = d['tipo'] === 'imagem' || d['tipo'] === 'video' ? d['tipo'] : 'arquivo';
    anexos.push({ chave: d['chave'] as string, tipo, nome: texto(d['nome'], 120) || 'arquivo' });
  }

  const ap = (corpo['aparelho'] ?? {}) as Dados;
  const aparelho = {
    versao: texto(ap['versao'], 20),
    tipo: ap['tipo'] === 'celular' || ap['tipo'] === 'computador' ? ap['tipo'] : 'navegador',
    sistema: texto(ap['sistema'], 40),
    tela: texto(ap['tela'], 20),
  };

  // 5 por dia (dia de Brasília).
  const hoje = diaDe();
  const interno = await ler(env, `reportesInterno/${uid}`);
  const feitosHoje = interno?.['dia'] === hoje ? Number(interno['n'] ?? 0) : 0;
  if (feitosHoje >= LIMITE_DE_REPORTES_POR_DIA) return json({ erro: `Você já mandou ${LIMITE_DE_REPORTES_POR_DIA} reportes hoje. Amanhã libera de novo.` }, 429);

  const id = sorteio();
  const agora = new Date().toISOString();
  await gravarTudo(env, [
    { caminho: `reportesInterno/${uid}`, definir: { dia: hoje, n: feitosHoje + 1 } },
    {
      caminho: `reportes/${id}`,
      definir: {
        uid,
        titulo,
        categoria,
        texto: descricao,
        ...(audio === null ? {} : { audio }),
        anexos,
        aparelho,
        estado: 'enviado',
        confirmado: false,
        versaoConserto: '',
        criadoEm: agora,
      },
    },
  ]);
  return json({ id, restamHoje: LIMITE_DE_REPORTES_POR_DIA - feitosHoje - 1 });
}

/* --------------------------- o lado do criador --------------------------- */

function chaveConfere(req: Request, env: Env): boolean {
  const esperada = env.CHAVE_REPORTES ?? '';
  const veio = (req.headers.get('authorization') ?? '').replace(/^Chave\s+/i, '');
  if (esperada.length < 32 || veio.length !== esperada.length) return false;
  let dif = 0;
  for (let i = 0; i < esperada.length; i += 1) dif |= esperada.charCodeAt(i) ^ veio.charCodeAt(i);
  return dif === 0;
}

async function lista(env: Env): Promise<Response> {
  const r = await firestore(env, `${raiz(env)}:runQuery`, {
    method: 'POST',
    body: JSON.stringify({
      structuredQuery: { from: [{ collectionId: 'reportes' }], orderBy: [{ field: { fieldPath: 'criadoEm' }, direction: 'DESCENDING' }], limit: 300 },
    }),
  });
  if (!r.ok) throw new Error(`Firestore ${r.status} listando os reportes`);
  const linhas = (await r.json()) as { document?: { name: string; fields?: Dados } }[];
  const reportes = linhas
    .filter((l) => l.document !== undefined)
    .map((l) => ({ id: l.document!.name.split('/').at(-1)!, ...lerCampos(l.document!.fields ?? {}) }) as Dados & { id: string; uid?: string });
  const uids = [...new Set(reportes.map((x) => String(x.uid ?? '')).filter((u) => u !== ''))];
  const perfis = await lerVarios(env, uids.map((u) => `users/${u}`));
  const quem = new Map(uids.map((u, i) => [u, { nome: String(perfis[i]?.['displayName'] ?? ''), arroba: String(perfis[i]?.['username'] ?? '') }]));
  return json({ reportes: reportes.map((x) => ({ ...x, quem: quem.get(String(x.uid ?? '')) ?? null })) });
}

async function arquivo(env: Env, chave: string): Promise<Response> {
  if (env.ARQUIVOS === undefined) return json({ erro: 'arquivos ainda não ligados' }, 503);
  if (!/^reporte\/[A-Za-z0-9_-]{1,64}\/[a-z0-9]{20}$/.test(chave)) return json({ erro: 'não existe' }, 404);
  const obj = await env.ARQUIVOS.get(chave);
  if (obj === null) return json({ erro: 'expirou' }, 404);
  return new Response(obj.body, {
    headers: {
      'content-type': obj.httpMetadata?.contentType ?? 'application/octet-stream',
      'cache-control': 'no-store',
      ...(obj.customMetadata?.['nome'] ? { 'x-nome': encodeURIComponent(obj.customMetadata['nome']) } : {}),
    },
  });
}

async function marcar(req: Request, env: Env): Promise<Response> {
  const corpo = (await req.json().catch(() => null)) as Dados | null;
  const acao = corpo?.['acao'];
  const ids = Array.isArray(corpo?.['ids']) ? (corpo['ids'] as unknown[]).filter((x): x is string => typeof x === 'string' && /^[a-z0-9]{20}$/.test(x)) : [];
  const versao = texto(corpo?.['versao'], 20);
  if (acao !== 'visto' && acao !== 'confirmar' && acao !== 'consertado') return json({ erro: 'acao' }, 400);
  if (ids.length === 0) return json({ erro: 'sem ids' }, 400);
  if (acao === 'consertado' && !/^\d+\.\d+\.\d+$/.test(versao)) return json({ erro: 'versao (ex.: 0.13.5)' }, 400);
  const agora = new Date().toISOString();
  const feito: Record<string, string> = {};
  for (const id of ids) {
    const r = lerReporte(id, await ler(env, `reportes/${id}`));
    if (r === null) {
      feito[id] = 'não existe';
      continue;
    }
    const mudar: Record<string, unknown> = {};
    if (acao === 'visto' && r.estado === 'enviado') Object.assign(mudar, { estado: 'visto', vistoEm: agora });
    if (acao === 'consertado') Object.assign(mudar, { estado: 'consertado', versaoConserto: versao, consertadoEm: agora, ...(r.vistoEm === '' ? { vistoEm: agora } : {}) });
    if (acao === 'confirmar' && r.estado === 'enviado') Object.assign(mudar, { estado: 'visto', vistoEm: agora });
    // Confirmar (ou consertar) conta para o Caçador de bugs — uma vez por reporte.
    if ((acao === 'confirmar' || acao === 'consertado') && !r.confirmado) {
      mudar['confirmado'] = true;
      const extras = [
        { caminho: `marcasDeConquista/bug_${id}`, definir: { em: agora }, soSeNaoExiste: true },
        { caminho: `reportes/${id}`, definir: mudar },
      ];
      const novas = await contarPara(env, r.uid, { somar: { bugs: 1 } }, undefined, extras);
      feito[id] = novas === null ? 'já contado' : `confirmado${novas.length > 0 ? ` (ganhou ${novas.join(', ')})` : ''}`;
      // A marca já existia (contou antes): só acerta o reporte.
      if (novas === null) await gravarTudo(env, [{ caminho: `reportes/${id}`, definir: mudar }]);
      continue;
    }
    if (Object.keys(mudar).length === 0) {
      feito[id] = 'nada a mudar';
      continue;
    }
    await gravarTudo(env, [{ caminho: `reportes/${id}`, definir: mudar }]);
    feito[id] = acao;
  }
  return json({ feito });
}

export async function rotaReportes(req: Request, env: Env, caminho: string): Promise<Response> {
  if (req.method === 'POST' && caminho === '/reportes') return await enviar(req, env);
  if (!caminho.startsWith('/reportes/admin')) return json({ erro: 'não existe' }, 404);
  if (env.CHAVE_REPORTES === undefined) return json({ erro: 'chave não configurada' }, 503);
  if (!chaveConfere(req, env)) return json({ erro: 'chave errada' }, 403);
  if (req.method === 'GET' && caminho === '/reportes/admin/lista') return await lista(env);
  if (req.method === 'GET' && caminho.startsWith('/reportes/admin/arquivo/')) return await arquivo(env, decodeURIComponent(caminho.slice('/reportes/admin/arquivo/'.length)));
  if (req.method === 'POST' && caminho === '/reportes/admin') return await marcar(req, env);
  return json({ erro: 'não existe' }, 404);
}
