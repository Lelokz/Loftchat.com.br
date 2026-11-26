/**
 * INSÍGNIAS (0.12.0) — quem CONTA é o carteiro. O app só avisa "fiz isto" e
 * o carteiro confere no banco antes de contar.
 *
 *   - Mensagem: o /avisar (que o app já chama a cada mensagem) conta aqui.
 *   - POST /conquistas { evento: 'reagir' | 'editar' | 'fixar' | 'voz' | 'jogo' | 'conferir' }
 *   - POST /amigos-em-comum { uid }
 *
 * Os contadores e as insígnias ganhas moram em `insignias/{uid}` (todo mundo
 * com conta lê; só o carteiro escreve, menos `avisadoAte`). O que é só do
 * carteiro (sessão de chamada, jogo aberto, minutos por jogo…) mora em
 * `insigniasInterno/{uid}`, que ninguém lê. Cada coisa contada uma vez só:
 * `marcasDeConquista/{chave}` é criado junto, e se já existe a conta não
 * passa (reação tirada e posta de novo não conta duas vezes).
 */

import { novasInsignias } from '../../src/lib/insignias';
import { firestore, json, ler, lerCampos, lerVarios, nomeCompleto, quemChamou, raiz } from './index';
import type { Env } from './index';
import { lancamentoDoJogo } from './jogos';
import { criadorDe } from './especiais';
import { conferirNosGrupos, contarJogoNoGrupo, contarMensagemNoGrupo, contarReacaoNoGrupo, contarVozNoGrupo } from './insignias-grupo';

type Dados = Record<string, unknown>;

/** O aniversário do Loftchat (o primeiro commit): 30 de agosto. */
const ANIVERSARIO = '08-30';
/** Enquanto não sai a 1.0, toda conta é de "beta". */
const BETA = true;
const MINUTO = 60_000;
/** Uma batida de chamada/jogo conta no máximo isto (o app bate de 5 em 5 min). */
const TETO_DA_BATIDA = 7;
const VISTO_VALE_MS = 4 * MINUTO;

/* ------------------------------ utilidades ------------------------------ */

/** Hora de Brasília (UTC−3, sem horário de verão desde 2019). */
function local(ms = Date.now()): Date {
  return new Date(ms - 3 * 60 * MINUTO);
}

export function diaDe(ms = Date.now()): string {
  return local(ms).toISOString().slice(0, 10);
}

export function ontem(dia: string): string {
  return new Date(Date.parse(`${dia}T12:00:00Z`) - 24 * 60 * MINUTO).toISOString().slice(0, 10);
}

/** Um nome qualquer → chave curta que vale como campo do Firestore. */
export function chaveDe(texto: string): string {
  let h = 5381;
  for (const c of texto.toLowerCase()) h = ((h * 33) ^ c.codePointAt(0)!) >>> 0;
  return `j${h.toString(36)}`;
}

function valor(v: unknown): Dados {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(valor) } };
  const campos: Dados = {};
  for (const [k, x] of Object.entries(v as Dados)) campos[k] = valor(x);
  return { mapValue: { fields: campos } };
}

/** Monta { a: { b: 1 } } a partir de { 'a.b': 1 } (para o `fields` do Firestore). */
function arvore(planos: Record<string, unknown>): Dados {
  const raizObj: Dados = {};
  for (const [caminho, v] of Object.entries(planos)) {
    const partes = caminho.split('.');
    let atual = raizObj;
    partes.slice(0, -1).forEach((p) => {
      atual[p] = (atual[p] as Dados | undefined) ?? {};
      atual = atual[p] as Dados;
    });
    atual[partes.at(-1)!] = v;
  }
  const campos: Dados = {};
  for (const [k, v] of Object.entries(raizObj)) campos[k] = valor(v);
  return campos;
}

export interface Escrita {
  caminho: string;
  /** Campos trocados ('n.amigos', 'tem.primeira'…). */
  definir?: Record<string, unknown>;
  /** Contadores que sobem ('n.mensagens': 1). */
  somar?: Record<string, number>;
  /** Só cria se não existir (a marca de "já contado"). */
  soSeNaoExiste?: boolean;
}

/** Grava tudo de uma vez. false = alguma marca já existia (já contado). */
export async function gravarTudo(env: Env, escritas: Escrita[]): Promise<boolean> {
  const writes = escritas.map((e) => ({
    update: { name: nomeCompleto(env, e.caminho), fields: arvore(e.definir ?? {}) },
    updateMask: { fieldPaths: Object.keys(e.definir ?? {}).map((c) => c.split('.').map((p) => (/^[A-Za-z_][A-Za-z0-9_]*$/.test(p) ? p : `\`${p}\``)).join('.')) },
    ...(e.somar === undefined || Object.keys(e.somar).length === 0
      ? {}
      : { updateTransforms: Object.entries(e.somar).map(([fieldPath, n]) => ({ fieldPath, increment: { integerValue: String(n) } })) }),
    ...(e.soSeNaoExiste === true ? { currentDocument: { exists: false } } : {}),
  }));
  const r = await firestore(env, `${raiz(env)}:commit`, { method: 'POST', body: JSON.stringify({ writes }) });
  if (r.ok) return true;
  const erro = await r.text();
  if (r.status === 409 || erro.includes('ALREADY_EXISTS') || erro.includes('FAILED_PRECONDITION')) return false;
  throw new Error(`Firestore ${r.status} no commit das insígnias: ${erro.slice(0, 200)}`);
}

/** Uma consulta simples (só igualdades / array-contains). */
export async function consultar(
  env: Env,
  colecao: string,
  filtros: Array<[string, 'EQUAL' | 'ARRAY_CONTAINS' | 'IN', unknown]>,
  campos: string[] = [],
  limite = 500,
): Promise<Array<{ id: string; dados: Dados }>> {
  const where =
    filtros.length === 1
      ? { fieldFilter: { field: { fieldPath: filtros[0]![0] }, op: filtros[0]![1], value: valor(filtros[0]![2]) } }
      : { compositeFilter: { op: 'AND', filters: filtros.map(([f, op, v]) => ({ fieldFilter: { field: { fieldPath: f }, op, value: valor(v) } })) } };
  const r = await firestore(env, `${raiz(env)}:runQuery`, {
    method: 'POST',
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: colecao }],
        where,
        ...(campos.length > 0 ? { select: { fields: campos.map((fieldPath) => ({ fieldPath })) } } : {}),
        limit: limite,
      },
    }),
  });
  if (!r.ok) throw new Error(`Firestore ${r.status} consultando ${colecao}`);
  const linhas = (await r.json()) as { document?: { name: string; fields?: Dados } }[];
  return linhas
    .filter((l) => l.document !== undefined)
    .map((l) => ({ id: l.document!.name.split('/').at(-1)!, dados: lerCampos(l.document!.fields ?? {}) }));
}

/** Quantos documentos batem (sem ler um por um). */
export async function contar(env: Env, colecao: string, filtros: Array<[string, 'EQUAL' | 'IN', unknown]>): Promise<number> {
  const where =
    filtros.length === 1
      ? { fieldFilter: { field: { fieldPath: filtros[0]![0] }, op: filtros[0]![1], value: valor(filtros[0]![2]) } }
      : { compositeFilter: { op: 'AND', filters: filtros.map(([f, op, v]) => ({ fieldFilter: { field: { fieldPath: f }, op, value: valor(v) } })) } };
  const r = await firestore(env, `${raiz(env)}:runAggregationQuery`, {
    method: 'POST',
    body: JSON.stringify({
      structuredAggregationQuery: { structuredQuery: { from: [{ collectionId: colecao }], where }, aggregations: [{ alias: 'n', count: {} }] },
    }),
  });
  if (!r.ok) throw new Error(`Firestore ${r.status} contando ${colecao}`);
  const linhas = (await r.json()) as { result?: { aggregateFields?: { n?: { integerValue?: string } } } }[];
  return Number(linhas[0]?.result?.aggregateFields?.n?.integerValue ?? 0);
}

/* --------------------------- o coração: contar --------------------------- */

interface Conta {
  somar?: Record<string, number>;
  /** Valor novo de um contador (só se for MAIOR que o de agora). */
  maximo?: Record<string, number>;
  /** Valor novo, seja qual for. */
  definir?: Record<string, unknown>;
}

/**
 * Soma/atualiza os contadores de alguém, dá as insígnias que fechar e grava
 * tudo numa escrita só (mais as `extras`, como a marca de já contado).
 * Devolve as insígnias novas (null = já tinha sido contado).
 */
async function contarPara(env: Env, uid: string, conta: Conta, doc?: Dados | null, extras: Escrita[] = []): Promise<string[] | null> {
  const atual = doc === undefined ? await ler(env, `insignias/${uid}`) : doc;
  const n = { ...((atual?.['n'] ?? {}) as Record<string, number>) };
  const tem = new Set(Object.keys((atual?.['tem'] ?? {}) as Dados));
  for (const [k, v] of Object.entries(conta.somar ?? {})) n[k] = (n[k] ?? 0) + v;
  const definir: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(conta.maximo ?? {})) {
    if (v > (n[k] ?? 0)) {
      n[k] = v;
      definir[`n.${k}`] = v;
    }
  }
  for (const [k, v] of Object.entries(conta.definir ?? {})) {
    definir[k] = v;
    if (k.startsWith('n.') && typeof v === 'number') n[k.slice(2)] = v;
  }
  const novas = novasInsignias(n, tem);
  const agora = new Date().toISOString();
  for (const id of novas) definir[`tem.${id}`] = agora;
  definir['atualizadoEm'] = agora;
  const somar: Record<string, number> = {};
  for (const [k, v] of Object.entries(conta.somar ?? {})) if (v !== 0) somar[`n.${k}`] = v;
  const ok = await gravarTudo(env, [...extras, { caminho: `insignias/${uid}`, definir, somar }]);
  return ok ? novas : null;
}

/* -------------------------------- mensagens -------------------------------- */

const EMOJI = /\p{Extended_Pictographic}/gu;
export const TIPOS: Record<string, string> = { image: 'fotos', video: 'videos', audio: 'audios', file: 'arquivos', sticker: 'figurinhas', gif: 'gifs' };

/** Chamado pelo /avisar, depois de conferir que a mensagem é dessa pessoa e é nova. */
export async function contarMensagem(env: Env, uid: string, tipo: 'grupo' | 'pv', msg: Dados): Promise<void> {
  const doc = await ler(env, `insignias/${uid}`);
  const n = (doc?.['n'] ?? {}) as Record<string, number>;
  const somar: Record<string, number> = { mensagens: 1 };
  const maximo: Record<string, number> = {};
  const definir: Record<string, unknown> = {};

  const tipoDeMidia = TIPOS[String(msg['kind'])];
  if (tipoDeMidia !== undefined) somar[tipoDeMidia] = 1;
  if (typeof msg['unica'] === 'object' && msg['unica'] !== null) somar['unicas'] = 1;
  if (typeof msg['replyTo'] === 'object' && msg['replyTo'] !== null) somar['respostas'] = 1;
  if (msg['encaminhada'] === true) somar['encaminhadas'] = 1;
  const chamada = msg['chamada'] as Dados | undefined;
  if (tipo === 'pv' && chamada !== undefined && chamada['perdida'] !== true) somar['ligacoes'] = 1;

  const quando = local(Date.parse(String(msg['sentAt'])) || Date.now());
  const hora = quando.getUTCHours();
  const minuto = quando.getUTCMinutes();
  if (hora >= 2 && hora < 5) somar['madrugada'] = 1;
  if (hora >= 5 && hora < 7) somar['cedo'] = 1;
  if (hora === 4 && minuto === 4) maximo['q404'] = 1;
  if (quando.getUTCMonth() === 0 && quando.getUTCDate() === 1 && hora === 0 && minuto === 0) maximo['virada'] = 1;
  if (quando.toISOString().slice(5, 10) === ANIVERSARIO) maximo['parabens'] = 1;

  const corpo = String(msg['body'] ?? '');
  if ((corpo.match(/k/gi)?.length ?? 0) >= 50) maximo['risada'] = 1;
  if (/boa\s*noite/i.test(corpo)) somar['boaNoite'] = 1;

  // Emojis diferentes (guardados, até 150).
  const emojis = new Set(Array.isArray(doc?.['emojis']) ? (doc['emojis'] as string[]) : []);
  const antes = emojis.size;
  for (const e of corpo.match(EMOJI) ?? []) if (emojis.size < 150) emojis.add(e);
  if (emojis.size > antes) {
    definir['emojis'] = [...emojis];
    maximo['emojisDiferentes'] = emojis.size;
  }

  // Dias: ativos, e seguidos (o maior trecho).
  const hoje = diaDe();
  if (doc?.['ultimoDia'] !== hoje) {
    somar['diasAtivos'] = 1;
    const seguidos = doc?.['ultimoDia'] === ontem(hoje) ? (n['seguidosAgora'] ?? 0) + 1 : 1;
    definir['n.seguidosAgora'] = seguidos;
    maximo['diasSeguidos'] = seguidos;
    definir['ultimoDia'] = hoje;
  }
  await contarPara(env, uid, { somar, maximo, definir }, doc);
  // 0.12.5: as insígnias do servidor também contam.
  if (tipo === 'grupo') await contarMensagemNoGrupo(env, uid, msg).catch(grupoFalhou);
}

/** Chamado pela transcrição (0.10.5) quando deu certo. */
export async function contarTranscricao(env: Env, uid: string): Promise<void> {
  await contarPara(env, uid, { somar: { transcricoes: 1 } });
}

/** As insígnias do servidor nunca atrapalham a conta do Loft (nem a mensagem). */
function grupoFalhou(e: unknown): void {
  console.log('insígnias do grupo:', e instanceof Error ? e.message : String(e));
}

/* ------------------------------- os eventos ------------------------------- */

const ID = /^[A-Za-z0-9]{1,40}$/;

async function reagir(env: Env, uid: string, corpo: Dados): Promise<string[]> {
  const tipo = corpo['tipo'] === 'pv' ? 'pv' : corpo['tipo'] === 'grupo' ? 'grupo' : null;
  const id = typeof corpo['id'] === 'string' && ID.test(corpo['id']) ? corpo['id'] : null;
  const emoji = typeof corpo['emoji'] === 'string' ? corpo['emoji'].slice(0, 16) : '';
  if (tipo === null || id === null || emoji === '') return [];
  const msg = await ler(env, `${tipo === 'pv' ? 'dmMessages' : 'messages'}/${id}`);
  if (msg === null) return [];
  const reacoes = (msg['reacoes'] ?? {}) as Record<string, unknown>;
  const minhas = reacoes[uid];
  if (!Array.isArray(minhas) || !minhas.includes(emoji)) return [];
  const autor = String(msg['authorId'] ?? '');

  const marca: Escrita = { caminho: `marcasDeConquista/${chaveDe(`r:${tipo}:${id}:${uid}:${emoji}`)}`, definir: { em: new Date().toISOString() }, soSeNaoExiste: true };
  const [meu, dele] = await lerVarios(env, [`insignias/${uid}`, `insignias/${autor}`]);
  const emojis = new Set(Array.isArray(meu?.['emojis']) ? (meu['emojis'] as string[]) : []);
  const definirMeu: Record<string, unknown> = {};
  const maximoMeu: Record<string, number> = {};
  if (!emojis.has(emoji) && emojis.size < 150) {
    emojis.add(emoji);
    definirMeu['emojis'] = [...emojis];
    maximoMeu['emojisDiferentes'] = emojis.size;
  }
  const minhasNovas = await contarPara(env, uid, { somar: { reacoesDadas: 1 }, maximo: maximoMeu, definir: definirMeu }, meu, [marca]);
  if (minhasNovas === null) return [];

  if (autor !== '' && autor !== uid && ID.test(autor)) {
    const total = Object.values(reacoes).reduce<number>((s, l) => s + (Array.isArray(l) ? l.length : 0), 0);
    const maximo: Record<string, number> = {};
    if (total >= 10) maximo['viral'] = 1;
    if (tipo === 'grupo') {
      const quem = Object.entries(reacoes).filter(([u, l]) => u !== autor && Array.isArray(l) && l.length > 0).length;
      if (quem >= 4) {
        const membros = await contar(env, 'memberships', [['groupId', 'EQUAL', String(msg['groupId'])]]);
        if (membros >= 5 && quem >= membros - 1) maximo['unanimidade'] = 1;
      }
    }
    await contarPara(env, autor, { somar: { reacoesRecebidas: 1 }, maximo }, dele);
    if (tipo === 'grupo') await contarReacaoNoGrupo(env, autor, String(msg['groupId'] ?? '')).catch(grupoFalhou);
  }
  return minhasNovas;
}

async function editar(env: Env, uid: string, corpo: Dados): Promise<string[]> {
  const tipo = corpo['tipo'] === 'pv' ? 'pv' : corpo['tipo'] === 'grupo' ? 'grupo' : null;
  const id = typeof corpo['id'] === 'string' && ID.test(corpo['id']) ? corpo['id'] : null;
  if (tipo === null || id === null) return [];
  const msg = await ler(env, `${tipo === 'pv' ? 'dmMessages' : 'messages'}/${id}`);
  if (msg === null || msg['authorId'] !== uid) return [];
  const editada = Date.parse(String(msg['editedAt'] ?? ''));
  if (!(Date.now() - editada < 2 * MINUTO)) return [];
  const marca: Escrita = { caminho: `marcasDeConquista/${chaveDe(`e:${tipo}:${id}`)}`, definir: { em: new Date().toISOString() }, soSeNaoExiste: true };
  return (await contarPara(env, uid, { somar: { editadas: 1 } }, undefined, [marca])) ?? [];
}

async function fixar(env: Env, uid: string, corpo: Dados): Promise<string[]> {
  const id = typeof corpo['id'] === 'string' && /^[A-Za-z0-9]{1,40}$/.test(corpo['id']) ? corpo['id'] : null;
  if (id === null) return [];
  const pin = await ler(env, `pinnedMessages/${id}`);
  if (pin === null || pin['pinnedBy'] !== uid) return [];
  if (!(Date.now() - Date.parse(String(pin['pinnedAt'] ?? '')) < 2 * MINUTO)) return [];
  const marca: Escrita = { caminho: `marcasDeConquista/${chaveDe(`f:${String(pin['messageId'])}:${uid}`)}`, definir: { em: new Date().toISOString() }, soSeNaoExiste: true };
  return (await contarPara(env, uid, { somar: { fixadas: 1 } }, undefined, [marca])) ?? [];
}

/** "Ainda estou na chamada": conta os minutos desde a última batida (no máximo 7). */
async function voz(env: Env, uid: string): Promise<string[]> {
  const [eu] = await consultar(env, 'voiceParticipants', [['uid', 'EQUAL', uid]], ['channelId', 'joinedAt', 'camera', 'cameraPausada', 'sharingScreen'], 1);
  const interno = (await ler(env, `insigniasInterno/${uid}`)) ?? {};
  const antes = (interno['voz'] ?? {}) as Dados;
  if (eu === undefined) {
    if (antes['canal'] !== undefined) await gravarTudo(env, [{ caminho: `insigniasInterno/${uid}`, definir: { voz: {} } }]);
    return [];
  }
  const agora = Date.now();
  const entrou = Date.parse(String(eu.dados['joinedAt'] ?? '')) || agora;
  const mesma = antes['entrou'] === entrou;
  const desde = mesma ? Math.max(Number(antes['ultima'] ?? entrou), entrou) : Math.max(entrou, agora - TETO_DA_BATIDA * MINUTO);
  const minutos = Math.max(0, Math.min(TETO_DA_BATIDA, Math.floor((agora - desde) / MINUTO)));
  const inicio = mesma ? Number(antes['inicio'] ?? agora) : Math.max(entrou, agora - TETO_DA_BATIDA * MINUTO);
  const transmitindo = eu.dados['sharingScreen'] === true;

  const somar: Record<string, number> = {};
  const maximo: Record<string, number> = {};
  if (minutos > 0) somar['minutosVoz'] = minutos;
  else maximo['minutosVoz'] = 1; // "Primeira chamada" sai já na primeira batida.
  if (eu.dados['camera'] === true && eu.dados['cameraPausada'] !== true && minutos > 0) somar['minutosCamera'] = minutos;
  if (transmitindo && antes['tela'] !== true) somar['telas'] = 1;
  maximo['maiorCallMin'] = Math.floor((agora - inicio) / MINUTO);
  const hora = local(agora).getUTCHours();
  if (hora >= 3 && hora < 5) maximo['callNoite'] = 1;
  const canal = String(eu.dados['channelId'] ?? '');
  const naSala = canal === '' ? 0 : await contar(env, 'voiceParticipants', [['channelId', 'EQUAL', canal]]);
  if (naSala >= 8) maximo['salaCheia'] = 1;

  const extras: Escrita[] = [
    { caminho: `insigniasInterno/${uid}`, definir: { voz: { canal, entrou, ultima: agora, inicio, tela: transmitindo } } },
  ];
  const novas = (await contarPara(env, uid, { somar, maximo }, undefined, extras)) ?? [];
  await contarVozNoGrupo(env, uid, canal, minutos).catch(grupoFalhou);
  return novas;
}

/** "Ainda estou jogando": o jogo vem de `jogando/{uid}` (o PC grava). */
async function jogo(env: Env, uid: string): Promise<string[]> {
  const [jogandoAgora, interno] = await lerVarios(env, [`jogando/${uid}`, `insigniasInterno/${uid}`]);
  if (jogandoAgora === null) return [];
  const visto = Date.parse(String(jogandoAgora['visto'] ?? ''));
  if (!(Date.now() - visto < VISTO_VALE_MS)) return [];
  const nome = String(jogandoAgora['nome'] ?? '').slice(0, 80);
  if (nome === '') return [];
  const loja = typeof jogandoAgora['loja'] === 'string' ? jogandoAgora['loja'] : '';
  const agora = Date.now();
  const antes = ((interno ?? {})['jogo'] ?? {}) as Dados;
  const mesmo = antes['nome'] === nome && agora - Number(antes['ultima'] ?? 0) < 10 * MINUTO;
  const desde = mesmo ? Number(antes['ultima']) : agora - TETO_DA_BATIDA * MINUTO;
  const minutos = Math.max(0, Math.min(TETO_DA_BATIDA, Math.floor((agora - desde) / MINUTO)));
  // O começo da sessão nunca vem só da palavra do PC (`desde`): no máximo 7 min antes da primeira batida.
  const inicio = mesmo ? Number(antes['inicio'] ?? agora) : Math.max(Number(jogandoAgora['desde']) || agora, agora - TETO_DA_BATIDA * MINUTO);

  const chave = chaveDe(nome);
  const porJogo = ((interno ?? {})['porJogo'] ?? {}) as Record<string, Dados>;
  const este = porJogo[chave] ?? {};
  const hoje = diaDe();
  const seguidos = este['dia'] === hoje ? Number(este['seguidos'] ?? 1) : este['dia'] === ontem(hoje) ? Number(este['seguidos'] ?? 0) + 1 : 1;
  const minDoJogo = Number(este['min'] ?? 0) + minutos;
  const lojas = new Set(Array.isArray((interno ?? {})['lojas']) ? ((interno ?? {})['lojas'] as string[]) : []);
  if (loja !== '') lojas.add(loja);

  const somar: Record<string, number> = {};
  const maximo: Record<string, number> = {
    maiorJogatinaMin: Math.floor((agora - inicio) / MINUTO),
    maiorJogoMin: minDoJogo,
    mesmoJogoDias: seguidos,
    lojas: lojas.size,
    jogosDiferentes: Object.keys(porJogo).length + (porJogo[chave] === undefined ? 1 : 0),
  };
  if (minutos > 0) somar['minutosJogo'] = minutos;

  // Dia um: o jogo saiu hoje (pergunta à IGDB uma vez por jogo).
  let lancamento = typeof este['lancamento'] === 'string' ? este['lancamento'] : undefined;
  if (lancamento === undefined) lancamento = (await lancamentoDoJogo(env, nome).catch(() => null)) ?? '';
  if (lancamento !== '' && lancamento === hoje) maximo['diaUm'] = 1;

  const definirInterno: Record<string, unknown> = {
    jogo: { nome, ultima: agora, inicio },
    [`porJogo.${chave}`]: { min: minDoJogo, dia: hoje, seguidos, lancamento },
    lojas: [...lojas].slice(0, 20),
  };

  // Junto com amigos (Dupla dinâmica) e com o grupo (Esquadrão).
  const outros = (await consultar(env, 'jogando', [['nome', 'EQUAL', nome]], ['visto'], 50)).filter(
    (o) => o.id !== uid && agora - Date.parse(String(o.dados['visto'] ?? '')) < VISTO_VALE_MS,
  );
  if (outros.length > 0 && minutos > 0) {
    const amizades = await consultar(env, 'friendships', [['members', 'ARRAY_CONTAINS', uid]], ['members', 'status'], 500);
    const amigos = new Set(amizades.filter((a) => a.dados['status'] === 'accepted').flatMap((a) => (a.dados['members'] as string[]) ?? []));
    const dupla = ((interno ?? {})['dupla'] ?? {}) as Record<string, number>;
    for (const o of outros) {
      if (!amigos.has(o.id)) continue;
      const total = Number(dupla[o.id] ?? 0) + minutos;
      definirInterno[`dupla.${o.id}`] = total;
      maximo['maiorDuplaMin'] = Math.max(maximo['maiorDuplaMin'] ?? 0, total);
    }
  }
  if (outros.length >= 3) {
    const meusGrupos = (await consultar(env, 'memberships', [['memberId', 'EQUAL', uid]], ['groupId'], 100)).map((m) => String(m.dados['groupId']));
    const caminhos = meusGrupos.flatMap((g) => outros.slice(0, 20).map((o) => `memberships/${g}_${o.id}`));
    const achados = await lerVarios(env, caminhos.slice(0, 300));
    const porGrupo = new Map<string, number>();
    achados.forEach((m, i) => {
      if (m === null) return;
      const g = caminhos[i]!.split('/')[1]!.split('_')[0]!;
      porGrupo.set(g, (porGrupo.get(g) ?? 0) + 1);
    });
    if ([...porGrupo.values()].some((q) => q >= 3)) maximo['esquadrao'] = 1;
  }

  const novas = (await contarPara(env, uid, { somar, maximo }, undefined, [{ caminho: `insigniasInterno/${uid}`, definir: definirInterno }])) ?? [];
  await contarJogoNoGrupo(env, uid, nome, outros.map((o) => o.id), minutos).catch(grupoFalhou);
  return novas;
}

/** Ao abrir o app (e depois de criar grupo, aceitar amigo, salvar o perfil): amigos, grupos, convites, cargo, tempo de conta, perfil. */
async function conferir(env: Env, uid: string): Promise<string[]> {
  const [doc, interno, usuario, arte] = await lerVarios(env, [`insignias/${uid}`, `insigniasInterno/${uid}`, `users/${uid}`, `profileArt/${uid}`]);
  const agora = Date.now();
  // No máximo uma vez a cada 10 s por pessoa (são umas 20 leituras).
  if (agora - Number(interno?.['conferidoEm'] ?? 0) < 10_000 && doc !== null) return [];

  const maximo: Record<string, number> = {};
  const definir: Record<string, unknown> = {};

  // Primeira vez: conta o histórico de mensagens e mídia (o resto conta daqui pra frente).
  if (doc === null || (doc['n'] as Dados | undefined)?.['historico'] !== 1) {
    const total = async (kind?: string): Promise<number> => {
      const filtros: Array<[string, 'EQUAL', unknown]> = [['authorId', 'EQUAL', uid]];
      if (kind !== undefined) filtros.push(['kind', 'EQUAL', kind]);
      const [a, b] = await Promise.all([contar(env, 'messages', filtros), contar(env, 'dmMessages', filtros)]);
      return a + b;
    };
    maximo['mensagens'] = await total();
    for (const [kind, nome] of Object.entries(TIPOS)) maximo[nome] = await total(kind);
    definir['n.historico'] = 1;
    definir['avisadoAte'] = '';
  }

  const amizades = await consultar(env, 'friendships', [['members', 'ARRAY_CONTAINS', uid]], ['status'], 1000);
  maximo['amigos'] = amizades.filter((a) => a.dados['status'] === 'accepted').length;

  const meus = await consultar(env, 'groups', [['ownerId', 'EQUAL', uid]], ['ownerId'], 50);
  maximo['gruposCriados'] = meus.length;
  for (const g of meus.slice(0, 15)) {
    const [pessoas, canais] = await Promise.all([
      contar(env, 'memberships', [['groupId', 'EQUAL', g.id]]),
      contar(env, 'channels', [['groupId', 'EQUAL', g.id]]),
    ]);
    maximo['maiorGrupo'] = Math.max(maximo['maiorGrupo'] ?? 0, pessoas);
    maximo['maisCanais'] = Math.max(maximo['maisCanais'] ?? 0, canais);
  }

  const convites = (await consultar(env, 'invites', [['createdBy', 'EQUAL', uid]], ['code'], 200)).map((c) => c.id);
  let convidados = 0;
  for (let i = 0; i < convites.length; i += 30) {
    convidados += await contar(env, 'memberships', [['inviteCode', 'IN', convites.slice(i, i + 30)]]);
  }
  maximo['convidados'] = convidados;

  // Modera: dono de grupo, ou um cargo com permissão de moderar.
  if (meus.length > 0) maximo['modera'] = 1;
  else {
    const minhas = await consultar(env, 'memberships', [['memberId', 'EQUAL', uid]], ['cargos'], 100);
    const ids = [...new Set(minhas.flatMap((m) => (Array.isArray(m.dados['cargos']) ? (m.dados['cargos'] as string[]) : [])))].slice(0, 100);
    const cargos = await lerVarios(env, ids.map((c) => `cargos/${c}`));
    const MODERAR = ['administrador', 'expulsar', 'banir', 'castigo', 'apagar-dos-outros'];
    if (cargos.some((c) => Array.isArray(c?.['permissoes']) && (c['permissoes'] as string[]).some((p) => MODERAR.includes(p)))) maximo['modera'] = 1;
  }

  const criada = Date.parse(String(usuario?.['createdAt'] ?? ''));
  if (!Number.isNaN(criada)) maximo['anos'] = Math.floor((agora - criada) / (365.25 * 24 * 60 * MINUTO));
  if (BETA) maximo['pioneiro'] = 1;
  if (typeof usuario?.['photo'] === 'string' && String(usuario['bio'] ?? '').trim() !== '' && typeof arte?.['banner'] === 'string') maximo['perfilCompleto'] = 1;
  const jogos = (usuario?.['jogos'] ?? {}) as Dados;
  if (typeof jogos['favorito'] === 'object' && jogos['favorito'] !== null && Array.isArray(jogos['ultimamente']) && jogos['ultimamente'].length >= 5) maximo['perfilGamer'] = 1;

  // As 10 primeiras contas.
  const r = await firestore(env, `${raiz(env)}:runQuery`, {
    method: 'POST',
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'users' }], orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'ASCENDING' }], select: { fields: [] }, limit: 10 } }),
  });
  if (r.ok) {
    const primeiras = ((await r.json()) as { document?: { name: string } }[]).map((l) => l.document?.name.split('/').at(-1));
    if (primeiras.includes(uid)) maximo['primeiros'] = 1;
  }

  // As especiais, dadas à mão (wrangler.toml → ESPECIAIS).
  try {
    // Cada lista tem uids ou @ (ex.: "@lelokz"); o @ vale o de agora da pessoa.
    const especiais = JSON.parse(env.ESPECIAIS ?? '{}') as Record<string, string[]>;
    const arroba = typeof usuario?.['username'] === 'string' ? `@${String(usuario['username']).toLowerCase()}` : null;
    // 0.12.5: o criador (env.CRIADOR) tem a dele sempre.
    for (const [id, quem] of Object.entries(especiais)) {
      if (Array.isArray(quem) && quem.some((q) => q === uid || (arroba !== null && q.toLowerCase() === arroba))) maximo[`esp_${id}`] = 1;
    }
  } catch {
    console.log('ESPECIAIS não é um JSON');
  }
  const extras: Escrita[] = [{ caminho: `insigniasInterno/${uid}`, definir: { conferidoEm: agora } }];
  if (typeof usuario?.['username'] === 'string' && usuario['username'].toLowerCase() === criadorDe(env)) {
    maximo['esp_criador'] = 1;
    // O nome roxo cromado do criador.
    if (usuario['brilho'] !== 'roxo') extras.push({ caminho: `users/${uid}`, definir: { brilho: 'roxo' } });
  }

  const novas = (await contarPara(env, uid, { maximo, definir }, doc, extras)) ?? [];
  await conferirNosGrupos(env, uid).catch(grupoFalhou);
  return novas;
}

/* -------------------------------- as rotas -------------------------------- */

const porPessoa = new Map<string, { n: number; desde: number }>();
function devagar(uid: string): boolean {
  const agora = Date.now();
  const c = porPessoa.get(uid);
  if (c === undefined || agora - c.desde > MINUTO) {
    if (porPessoa.size > 5000) porPessoa.clear();
    porPessoa.set(uid, { n: 1, desde: agora });
    return false;
  }
  c.n += 1;
  return c.n > 60;
}

export async function rotaConquistas(req: Request, env: Env): Promise<Response> {
  const uid = await quemChamou(req, env);
  if (uid === null) return json({ erro: 'sem login' }, 401);
  if (devagar(uid)) return json({ erro: 'devagar' }, 429);
  const corpo = (await req.json().catch(() => null)) as Dados | null;
  if (corpo === null) return json({ erro: 'pedido errado' }, 400);
  const evento = corpo['evento'];
  const novas =
    evento === 'reagir'
      ? await reagir(env, uid, corpo)
      : evento === 'editar'
        ? await editar(env, uid, corpo)
        : evento === 'fixar'
          ? await fixar(env, uid, corpo)
          : evento === 'voz'
            ? await voz(env, uid)
            : evento === 'jogo'
              ? await jogo(env, uid)
              : evento === 'conferir'
                ? await conferir(env, uid)
                : null;
  if (novas === null) return json({ erro: 'evento não existe' }, 400);
  return json({ novas });
}

/** Os amigos que as duas pessoas têm (o carteiro lê as amizades dos dois lados). */
export async function rotaAmigosEmComum(req: Request, env: Env): Promise<Response> {
  const uid = await quemChamou(req, env);
  if (uid === null) return json({ erro: 'sem login' }, 401);
  const corpo = (await req.json().catch(() => null)) as Dados | null;
  const outro = typeof corpo?.['uid'] === 'string' && ID.test(corpo['uid']) ? corpo['uid'] : null;
  if (outro === null || outro === uid) return json({ amigos: [] });
  const amigosDe = async (quem: string): Promise<Set<string>> =>
    new Set(
      (await consultar(env, 'friendships', [['members', 'ARRAY_CONTAINS', quem]], ['members', 'status'], 1000))
        .filter((a) => a.dados['status'] === 'accepted')
        .flatMap((a) => (a.dados['members'] as string[]) ?? [])
        .filter((m) => m !== quem),
    );
  const [meus, dele] = await Promise.all([amigosDe(uid), amigosDe(outro)]);
  const comum = [...meus].filter((m) => dele.has(m) && m !== uid && m !== outro).slice(0, 60);
  const perfis = await lerVarios(env, comum.map((m) => `users/${m}`));
  return json({
    amigos: perfis.flatMap((p, i) =>
      p === null
        ? []
        : [
            {
              uid: comum[i],
              displayName: String(p['displayName'] ?? 'Usuário'),
              initials: String(p['initials'] ?? '?'),
              ...(typeof p['username'] === 'string' ? { username: p['username'] } : {}),
              ...(typeof p['photo'] === 'string' && p['photo'].startsWith('data:image/') ? { photo: p['photo'] } : {}),
            },
          ],
    ),
  });
}
