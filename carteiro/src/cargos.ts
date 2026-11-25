/**
 * CARGOS E PERMISSÕES (0.8.5) — o carteiro é quem GRAVA cargos e calcula o
 * que cada pessoa pode. O app pede; o carteiro confere quem pediu (token do
 * Firebase), se a pessoa pode (permissão + hierarquia) e grava como dono do
 * projeto. As regras do banco só deixam o carteiro mexer em cargos e nos
 * campos calculados das memberships (perms, topo, canais, castigoAte).
 *
 * POST /cargos  { grupo, acao, ... }  (Authorization: Bearer <token>)
 *
 * O cálculo (igual ao Discord):
 *   base = @todos + todos os cargos da pessoa (soma);
 *   "administrador" ou dono = tudo, e passa por cima dos canais;
 *   em cada canal: @todos nega/permite → cargos negam/permitem → a pessoa
 *   nega/permite (a pessoa vence); negar "Ver canal" tira o canal inteiro.
 */

import {
  PERMISSOES_DO_CANAL,
  PERMISSOES_DO_TODOS,
  TODAS_AS_PERMISSOES,
  calcCanal,
  calcServidor,
  lerRegras,
  regrasQueValem,
} from '../../src/lib/permissoes';
import type { RegrasDoCanal } from '../../src/lib/permissoes';
import { firestore, json, lerCampos, nomeCompleto, quemChamou, raiz } from './index';
import type { Env } from './index';

type Dados = Record<string, unknown>;

const IDS = new Set(TODAS_AS_PERMISSOES.map((p) => p.id));
const DO_CANAL = PERMISSOES_DO_CANAL;
const HEX = /^#[0-9a-f]{6}$/i;

export interface Cargo {
  id: string;
  nome: string;
  posicao: number;
  permissoes: string[];
  todos: boolean;
}

interface Membro {
  id: string;
  uid: string;
  cargos: string[];
  perms?: string[];
  topo?: number;
}


interface Canal {
  id: string;
  kind: string;
  categoryId?: string;
  permissoes: RegrasDoCanal;
}

/* --------------------------- Firestore (REST) --------------------------- */

/** Data/hora gravada como timestamp do Firestore (as regras comparam com request.time). */
export class Momento {
  constructor(readonly iso: string) {}
}

/** Valor comum → valor do Firestore. */
export function valor(v: unknown): Dados {
  if (v instanceof Momento) return { timestampValue: v.iso };
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(valor) } };
  return { mapValue: { fields: campos(v as Dados) } };
}

export function campos(d: Dados): Dados {
  const f: Dados = {};
  for (const [k, v] of Object.entries(d)) if (v !== undefined) f[k] = valor(v);
  return f;
}

/** Uma escrita do :commit (atualiza só os campos dados, ou apaga). */
export type Escrita = { atualizar: string; dados: Dados; criar?: boolean } | { apagar: string };

/** "a.b" vira { a: { b } } (a máscara de atualização mexe só em a.b). */
function aninhar(d: Dados): Dados {
  const saida: Dados = {};
  for (const [k, v] of Object.entries(d)) {
    const partes = k.split('.');
    let alvo = saida;
    for (const p of partes.slice(0, -1)) {
      if (typeof alvo[p] !== 'object' || alvo[p] === null) alvo[p] = {};
      alvo = alvo[p] as Dados;
    }
    alvo[partes[partes.length - 1]!] = v;
  }
  return saida;
}

function segmento(k: string): string {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(k) ? k : `\`${k.replace(/`/g, '\\`')}\``;
}

export async function gravarTudo(env: Env, escritas: Escrita[]): Promise<void> {
  for (let i = 0; i < escritas.length; i += 400) {
    const parte = escritas.slice(i, i + 400).map((e) =>
      'apagar' in e
        ? { delete: nomeCompleto(env, e.apagar) }
        : {
            update: { name: nomeCompleto(env, e.atualizar), fields: campos(aninhar(e.dados)) },
            updateMask: { fieldPaths: Object.keys(e.dados).map((k) => k.split('.').map(segmento).join('.')) },
            ...(e.criar === true ? {} : { currentDocument: { exists: true } }),
          },
    );
    const r = await firestore(env, `${raiz(env)}:commit`, { method: 'POST', body: JSON.stringify({ writes: parte }) });
    if (!r.ok) throw new Error(`Firestore ${r.status} no commit: ${(await r.text()).slice(0, 200)}`);
  }
}

export async function porGrupo(env: Env, colecao: string, grupo: string): Promise<{ id: string; d: Dados }[]> {
  const r = await firestore(env, `${raiz(env)}:runQuery`, {
    method: 'POST',
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: colecao }],
        where: { fieldFilter: { field: { fieldPath: 'groupId' }, op: 'EQUAL', value: { stringValue: grupo } } },
      },
    }),
  });
  if (!r.ok) throw new Error(`Firestore ${r.status} lendo ${colecao}`);
  const linhas = (await r.json()) as { document?: { name: string; fields?: Dados } }[];
  return linhas
    .filter((l) => l.document !== undefined)
    .map((l) => ({ id: l.document!.name.split('/').pop()!, d: lerCampos(l.document!.fields ?? {}) }));
}

async function lerDoc(env: Env, caminho: string): Promise<Dados | null> {
  const r = await firestore(env, `${raiz(env)}/${caminho}`);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`Firestore ${r.status} lendo ${caminho.split('/')[0]}`);
  return lerCampos(((await r.json()) as { fields?: Dados }).fields ?? {});
}

/* -------------------------------- cálculo -------------------------------- */

function lista(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

function validas(v: unknown): string[] {
  return [...new Set(lista(v).filter((p) => IDS.has(p)))];
}

export function lerCargo(id: string, d: Dados): Cargo {
  return {
    id,
    nome: typeof d['nome'] === 'string' ? d['nome'] : 'cargo',
    posicao: typeof d['posicao'] === 'number' ? d['posicao'] : 999,
    permissoes: validas(d['permissoes']),
    todos: d['todos'] === true,
  };
}

function regrasDoCanal(c: Canal, porCategoria: Dados): RegrasDoCanal {
  const cats: Record<string, RegrasDoCanal> = {};
  for (const [k, v] of Object.entries(porCategoria)) cats[k] = lerRegras(v);
  return regrasQueValem(c.permissoes, c.categoryId, cats);
}

/** Recalcula perms/topo/canais de TODO MUNDO do grupo e grava o que mudou. */
export async function recalcular(env: Env, grupo: string): Promise<void> {
  const [g, cargosDocs, membros, canaisDocs] = await Promise.all([
    lerDoc(env, `groups/${grupo}`),
    porGrupo(env, 'cargos', grupo),
    porGrupo(env, 'memberships', grupo),
    porGrupo(env, 'channels', grupo),
  ]);
  if (g === null) return;
  const dono = String(g['ownerId'] ?? '');
  const categorias = (typeof g['permsCategorias'] === 'object' && g['permsCategorias'] !== null ? g['permsCategorias'] : {}) as Dados;
  const cargos = cargosDocs.map((c) => lerCargo(c.id, c.d));
  const canais: Canal[] = canaisDocs.map((c) => ({
    id: c.id,
    kind: String(c.d['kind'] ?? 'text'),
    ...(typeof c.d['categoryId'] === 'string' && c.d['categoryId'] !== '' ? { categoryId: c.d['categoryId'] } : {}),
    permissoes: lerRegras(c.d['permissoes']),
  }));
  const escritas: Escrita[] = [];
  for (const m of membros) {
    const uid = String(m.d['memberId'] ?? '');
    if (uid === '') continue;
    const meus = lista(m.d['cargos']);
    const s = calcServidor(uid, dono, cargos, meus);
    const porCanal: Dados = {};
    for (const c of canais) {
      const regras = regrasDoCanal(c, categorias);
      if (Object.keys(regras).length === 0) continue;
      porCanal[c.id] = calcCanal(uid, s.perms, s.admin, meus, regras, c.kind === 'voice');
    }
    const novo = { perms: s.perms.sort(), topo: s.topo, canais: porCanal };
    const antes = { perms: lista(m.d['perms']).sort(), topo: m.d['topo'], canais: m.d['canais'] ?? {} };
    if (JSON.stringify(novo) !== JSON.stringify(antes)) escritas.push({ atualizar: `memberships/${m.id}`, dados: novo });
  }
  if (escritas.length > 0) await gravarTudo(env, escritas);
}

/* -------------------------------- ações -------------------------------- */

interface Quem {
  uid: string;
  dono: boolean;
  perms: Set<string>;
  topo: number;
}

class Recusa extends Error {
  constructor(
    msg: string,
    readonly status = 403,
  ) {
    super(msg);
  }
}

function precisa(q: Quem, p: string): void {
  if (!q.dono && !q.perms.has('administrador') && !q.perms.has(p)) throw new Recusa('Você não tem permissão para isso.');
}

function abaixo(q: Quem, posicao: number): void {
  if (!q.dono && !(posicao > q.topo)) throw new Recusa('Esse cargo está acima (ou no nível) do seu.');
}

export async function registrar(env: Env, grupo: string, quem: string, acao: string, alvo: string, detalhe: string): Promise<Escrita> {
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  // Os nomes vão junto: quem saiu do grupo continua com nome no registro.
  const nome = async (uid: string): Promise<string> => {
    if (!/^[A-Za-z0-9]{20,40}$/.test(uid)) return '';
    const u = await lerDoc(env, `users/${uid}`).catch(() => null);
    return typeof u?.['displayName'] === 'string' ? u['displayName'] : '';
  };
  const [quemNome, alvoNome] = await Promise.all([nome(quem), nome(alvo)]);
  return {
    atualizar: `registro/${id}`,
    criar: true,
    dados: { groupId: grupo, quem, quemNome, acao, alvo, alvoNome, detalhe: detalhe.slice(0, 300), em: new Date().toISOString() },
  };
}

function lerCamposDoCargo(c: Dados): Dados {
  const nome = typeof c['nome'] === 'string' ? c['nome'].trim().slice(0, 40) : '';
  if (nome === '') throw new Recusa('O cargo precisa de um nome.', 400);
  const cor = c['cor'] as Dados | null | undefined;
  let corOk: Dados | null = null;
  if (cor !== null && cor !== undefined) {
    if (typeof cor['a'] !== 'string' || !HEX.test(cor['a'])) throw new Recusa('Cor inválida.', 400);
    corOk = typeof cor['b'] === 'string' && HEX.test(cor['b']) ? { a: cor['a'], b: cor['b'] } : { a: cor['a'] };
  }
  const icone = typeof c['icone'] === 'string' ? c['icone'].slice(0, 16) : '';
  const imagem = typeof c['imagem'] === 'string' && c['imagem'].startsWith('data:image/') && c['imagem'].length <= 30000 ? c['imagem'] : '';
  return { nome, cor: corOk, icone, imagem, separado: c['separado'] === true, mencionavel: c['mencionavel'] === true, permissoes: validas(c['permissoes']) };
}

export async function rotaCargos(req: Request, env: Env): Promise<Response> {
  const uid = await quemChamou(req, env);
  if (uid === null) return json({ erro: 'sem login' }, 401);
  const corpo = ((await req.json().catch(() => null)) ?? {}) as Dados;
  const grupo = corpo['grupo'];
  const acao = corpo['acao'];
  if (typeof grupo !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(grupo) || typeof acao !== 'string') return json({ erro: 'pedido errado' }, 400);

  try {
    const [g, eu, cargosDocs] = await Promise.all([
      lerDoc(env, `groups/${grupo}`),
      lerDoc(env, `memberships/${grupo}_${uid}`),
      porGrupo(env, 'cargos', grupo),
    ]);
    if (g === null || eu === null) return json({ erro: 'você não está nesse grupo' }, 403);
    const dono = String(g['ownerId'] ?? '');
    const cargos = cargosDocs.map((c) => ({ ...lerCargo(c.id, c.d), d: c.d }));
    const calc = calcServidor(uid, dono, cargos, lista(eu['cargos']));
    const castigo = typeof eu['castigoAte'] === 'string' && Date.parse(eu['castigoAte']) > Date.now();
    const q: Quem = { uid, dono: uid === dono, perms: new Set(castigo && uid !== dono && !calc.admin ? [] : calc.perms), topo: calc.topo };
    const cargo = (id: unknown): (typeof cargos)[number] => {
      const c = cargos.find((x) => x.id === id);
      if (c === undefined) throw new Recusa('Esse cargo não existe mais.', 404);
      return c;
    };
    const escritas: Escrita[] = [];
    let resposta: Dados = { ok: true };

    switch (acao) {
      case 'recalcular': {
        // Grupo de antes dos cargos: nasce o @todos e o Administrador.
        if (!cargos.some((c) => c.todos) && q.dono) {
          const agora = new Date().toISOString();
          escritas.push({
            atualizar: `cargos/${grupo}_todos`,
            criar: true,
            dados: { groupId: grupo, nome: '@todos', cor: null, posicao: 9999, separado: false, mencionavel: false, permissoes: PERMISSOES_DO_TODOS, todos: true, criadoEm: agora },
          });
          if (!cargos.some((c) => c.permissoes.includes('administrador'))) {
            escritas.push({
              atualizar: `cargos/${grupo}${Date.now().toString(36)}adm`,
              criar: true,
              dados: { groupId: grupo, nome: 'Administrador', cor: { a: '#b23a48' }, icone: '⚡', imagem: '', posicao: 0, separado: true, mencionavel: false, permissoes: ['administrador'], criadoEm: agora },
            });
          }
        }
        break;
      }
      case 'criar': {
        precisa(q, 'gerenciar-cargos');
        const normais = cargos.filter((c) => !c.todos);
        if (normais.length >= 100) throw new Recusa('Limite de 100 cargos.', 400);
        const id = `${grupo.slice(0, 8)}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
        escritas.push({
          atualizar: `cargos/${id}`,
          criar: true,
          dados: { groupId: grupo, nome: 'cargo novo', cor: null, icone: '', imagem: '', posicao: normais.reduce((m, c) => Math.max(m, c.posicao), -1) + 1, separado: false, mencionavel: false, permissoes: [], criadoEm: new Date().toISOString() },
        });
        escritas.push(await registrar(env, grupo, uid, 'criou o cargo', id, 'cargo novo'));
        resposta = { ok: true, id };
        break;
      }
      case 'salvar': {
        precisa(q, 'gerenciar-cargos');
        const c = cargo(corpo['cargo']);
        abaixo(q, c.posicao);
        const novos = lerCamposDoCargo((corpo['campos'] ?? {}) as Dados);
        const novas = novos['permissoes'] as string[];
        // Ninguém dá a um cargo uma permissão que não tem.
        if (!q.dono && !q.perms.has('administrador')) {
          const ganhou = novas.filter((p) => !c.permissoes.includes(p) && !q.perms.has(p));
          if (ganhou.length > 0) throw new Recusa('Você não pode dar uma permissão que você não tem.');
        }
        escritas.push({ atualizar: `cargos/${c.id}`, dados: c.todos ? { permissoes: novas } : novos });
        escritas.push(await registrar(env, grupo, uid, 'editou o cargo', c.id, c.todos ? '@todos' : String(novos['nome'])));
        break;
      }
      case 'apagar': {
        precisa(q, 'gerenciar-cargos');
        const c = cargo(corpo['cargo']);
        if (c.todos) throw new Recusa('O @todos não pode ser apagado.', 400);
        abaixo(q, c.posicao);
        const membros = await porGrupo(env, 'memberships', grupo);
        for (const m of membros) {
          const tem = lista(m.d['cargos']);
          if (tem.includes(c.id)) escritas.push({ atualizar: `memberships/${m.id}`, dados: { cargos: tem.filter((x) => x !== c.id) } });
        }
        escritas.push({ apagar: `cargos/${c.id}` });
        escritas.push(await registrar(env, grupo, uid, 'apagou o cargo', c.id, c.nome));
        break;
      }
      case 'ordenar': {
        precisa(q, 'gerenciar-cargos');
        const ids = lista(corpo['ids']);
        const normais = [...cargos.filter((c) => !c.todos)].sort((a, b) => a.posicao - b.posicao);
        if (ids.length !== normais.length || !normais.every((c) => ids.includes(c.id))) throw new Recusa('A lista de cargos mudou. Tente de novo.', 409);
        // Quem não é dono não mexe na posição dos cargos do nível dele para cima.
        if (!q.dono) {
          normais.forEach((c, i) => {
            if (c.posicao <= q.topo && ids[i] !== c.id) throw new Recusa('Você só muda a ordem dos cargos abaixo do seu.');
          });
        }
        ids.forEach((id, i) => {
          if (cargo(id).posicao !== i) escritas.push({ atualizar: `cargos/${id}`, dados: { posicao: i } });
        });
        break;
      }
      case 'dar': {
        precisa(q, 'dar-cargos');
        const c = cargo(corpo['cargo']);
        if (c.todos) throw new Recusa('Todo mundo já tem o @todos.', 400);
        abaixo(q, c.posicao);
        const alvo = String(corpo['membro'] ?? '');
        const dele = await lerDoc(env, `memberships/${grupo}_${alvo}`);
        if (dele === null) throw new Recusa('Essa pessoa não está no grupo.', 404);
        if (alvo === dono && !q.dono) throw new Recusa('Ninguém mexe nos cargos do dono.');
        const topoDele = calcServidor(alvo, dono, cargos, lista(dele['cargos'])).topo;
        if (!q.dono && alvo !== uid && !(topoDele > q.topo)) throw new Recusa('Essa pessoa está no seu nível ou acima.');
        const tem = lista(dele['cargos']);
        const dar = corpo['dar'] === true;
        const nova = dar ? [...new Set([...tem, c.id])] : tem.filter((x) => x !== c.id);
        escritas.push({ atualizar: `memberships/${grupo}_${alvo}`, dados: { cargos: nova } });
        escritas.push(await registrar(env, grupo, uid, dar ? 'deu o cargo' : 'tirou o cargo', alvo, c.nome));
        break;
      }
      case 'expulsar': {
        precisa(q, 'expulsar');
        const alvo = String(corpo['membro'] ?? '');
        if (alvo === uid) throw new Recusa('Para sair, use "Sair do grupo".', 400);
        if (alvo === dono) throw new Recusa('O dono não pode ser expulso.');
        const dele = await lerDoc(env, `memberships/${grupo}_${alvo}`);
        if (dele === null) throw new Recusa('Essa pessoa não está no grupo.', 404);
        const topoDele = calcServidor(alvo, dono, cargos, lista(dele['cargos'])).topo;
        if (!q.dono && !(topoDele > q.topo)) throw new Recusa('Essa pessoa está no seu nível ou acima.');
        escritas.push({ apagar: `memberships/${grupo}_${alvo}` });
        escritas.push(await registrar(env, grupo, uid, 'expulsou', alvo, String(corpo['motivo'] ?? '')));
        break;
      }
      case 'regras': {
        // 0.8.5 etapa 3: regras próprias de um canal (ou de uma categoria).
        const canalId = typeof corpo['canal'] === 'string' ? corpo['canal'] : null;
        const catId = typeof corpo['categoria'] === 'string' ? corpo['categoria'] : null;
        if ((canalId === null) === (catId === null)) throw new Recusa('Diga o canal ou a categoria.', 400);
        const regras = lerRegras(corpo['regras']);
        if (Object.keys(regras).length > 60) throw new Recusa('Regras demais.', 400);
        let antes: RegrasDoCanal = {};
        if (canalId !== null) {
          const canal = await lerDoc(env, `channels/${canalId}`);
          if (canal === null || canal['groupId'] !== grupo) throw new Recusa('Esse canal não existe.', 404);
          antes = lerRegras(canal['permissoes']);
          // Quem mexe precisa de "Gerenciar permissões dos canais" NAQUELE canal.
          if (!q.dono && !q.perms.has('administrador')) {
            const eu = await lerDoc(env, `memberships/${grupo}_${uid}`);
            const noCanal = ((eu?.['canais'] ?? {}) as Dados)[canalId];
            const minhas = new Set(Array.isArray(noCanal) ? lista(noCanal) : [...q.perms]);
            if (!minhas.has('permissoes-canais')) throw new Recusa('Você não tem permissão para isso.');
            q.perms = minhas;
          }
        } else {
          precisa(q, 'permissoes-canais');
          antes = lerRegras(((g['permsCategorias'] ?? {}) as Dados)[catId!]);
        }
        if (!q.dono && !q.perms.has('administrador')) {
          for (const [alvo, r] of Object.entries(regras)) {
            const velha = antes[alvo] ?? { permite: [], nega: [] };
            // Só o que mudou é cobrado: não dá permissão (nem tira) que não tem…
            const mexeu = [...r.permite, ...r.nega].filter((x) => !velha.permite.includes(x) && !velha.nega.includes(x));
            if (mexeu.some((x) => !q.perms.has(x))) throw new Recusa('Você não pode mexer numa permissão que você não tem.');
            // …e não mexe na regra de cargo do seu nível ou acima.
            const c = cargos.find((x) => x.id === alvo);
            if (c !== undefined && !c.todos && c.posicao <= q.topo && JSON.stringify(velha) !== JSON.stringify(r)) {
              throw new Recusa('Esse cargo está acima (ou no nível) do seu.');
            }
          }
        }
        if (canalId !== null) escritas.push({ atualizar: `channels/${canalId}`, dados: { permissoes: regras } });
        else escritas.push({ atualizar: `groups/${grupo}`, dados: { [`permsCategorias.${catId}`]: regras } });
        escritas.push(await registrar(env, grupo, uid, 'mudou as permissões', canalId ?? catId!, canalId !== null ? 'canal' : 'categoria'));
        break;
      }
      case 'castigo':
      case 'tirar-castigo':
      case 'banir':
      case 'apelido': {
        const alvo = String(corpo['membro'] ?? '');
        const proprio = acao === 'apelido' && alvo === uid;
        precisa(q, acao === 'apelido' ? (proprio ? 'apelido-proprio' : 'apelido-outros') : acao);
        if (alvo === dono && !q.dono) throw new Recusa('Ninguém mexe no dono.');
        if (acao !== 'apelido' && alvo === uid) throw new Recusa('Isso não dá para fazer em você mesmo.', 400);
        const dele = await lerDoc(env, `memberships/${grupo}_${alvo}`);
        if (dele === null) throw new Recusa('Essa pessoa não está no grupo.', 404);
        const topoDele = calcServidor(alvo, dono, cargos, lista(dele['cargos'])).topo;
        if (!q.dono && !proprio && !(topoDele > q.topo)) throw new Recusa('Essa pessoa está no seu nível ou acima.');
        const motivo = String(corpo['motivo'] ?? '').slice(0, 200);
        if (acao === 'castigo') {
          const segundos = Number(corpo['segundos']);
          if (!Number.isFinite(segundos) || segundos < 60 || segundos > 7 * 24 * 3600) throw new Recusa('Tempo de castigo inválido.', 400);
          const ate = new Date(Date.now() + segundos * 1000).toISOString();
          escritas.push({ atualizar: `memberships/${grupo}_${alvo}`, dados: { castigoAte: new Momento(ate) } });
          // Quem estava falando ou transmitindo na sala fica mudo na hora.
          for (const v of await porGrupo(env, 'voiceParticipants', grupo)) {
            if (v.d['uid'] === alvo) escritas.push({ atualizar: `voiceParticipants/${v.id}`, dados: { muted: true, sharingScreen: false } });
          }
          escritas.push(await registrar(env, grupo, uid, 'pôs de castigo', alvo, `${Math.round(segundos / 60)} min${motivo === '' ? '' : ` · ${motivo}`}`));
        } else if (acao === 'tirar-castigo') {
          escritas.push({ atualizar: `memberships/${grupo}_${alvo}`, dados: { castigoAte: null } });
          escritas.push(await registrar(env, grupo, uid, 'tirou o castigo de', alvo, ''));
        } else if (acao === 'banir') {
          const perfil = await lerDoc(env, `users/${alvo}`);
          escritas.push({ apagar: `memberships/${grupo}_${alvo}` });
          escritas.push({
            atualizar: `banidos/${grupo}_${alvo}`,
            criar: true,
            dados: { groupId: grupo, uid: alvo, nome: String(perfil?.['displayName'] ?? 'Alguém'), motivo, por: uid, em: new Date().toISOString() },
          });
          for (const v of await porGrupo(env, 'voiceParticipants', grupo)) {
            if (v.d['uid'] === alvo) escritas.push({ apagar: `voiceParticipants/${v.id}` });
          }
          escritas.push(await registrar(env, grupo, uid, 'baniu', alvo, motivo));
        } else {
          const apelido = String(corpo['apelido'] ?? '').trim().slice(0, 32);
          escritas.push({ atualizar: `memberships/${grupo}_${alvo}`, dados: { apelido } });
          escritas.push(await registrar(env, grupo, uid, 'mudou o apelido de', alvo, apelido === '' ? '(tirou)' : apelido));
        }
        break;
      }
      case 'desbanir': {
        precisa(q, 'desbanir');
        const alvo = String(corpo['membro'] ?? '');
        escritas.push({ apagar: `banidos/${grupo}_${alvo}` });
        escritas.push(await registrar(env, grupo, uid, 'desbaniu', alvo, ''));
        break;
      }
      case 'dono': {
        if (!q.dono) throw new Recusa('Só o dono passa o grupo.');
        const alvo = String(corpo['membro'] ?? '');
        if (alvo === uid) throw new Recusa('Você já é o dono.', 400);
        if ((await lerDoc(env, `memberships/${grupo}_${alvo}`)) === null) throw new Recusa('Essa pessoa não está no grupo.', 404);
        escritas.push({ atualizar: `groups/${grupo}`, dados: { ownerId: alvo } });
        escritas.push({ atualizar: `memberships/${grupo}_${alvo}`, dados: { role: 'owner' } });
        escritas.push({ atualizar: `memberships/${grupo}_${uid}`, dados: { role: 'member' } });
        escritas.push(await registrar(env, grupo, uid, 'passou o grupo para', alvo, ''));
        break;
      }
      case 'limpar': {
        // /limpar N: as últimas N mensagens do canal ("Apagar várias de uma vez" NAQUELE canal).
        const canalId = String(corpo['canal'] ?? '');
        const n = Math.round(Number(corpo['quantidade']));
        if (!Number.isFinite(n) || n < 1 || n > 100) throw new Recusa('Diga quantas (de 1 a 100).', 400);
        const canal = await lerDoc(env, `channels/${canalId}`);
        if (canal === null || canal['groupId'] !== grupo) throw new Recusa('Esse canal não existe.', 404);
        if (!q.dono && !q.perms.has('administrador')) {
          const eu = await lerDoc(env, `memberships/${grupo}_${uid}`);
          const noCanal = ((eu?.['canais'] ?? {}) as Dados)[canalId];
          const minhas = new Set(Array.isArray(noCanal) ? lista(noCanal) : [...q.perms]);
          if (!minhas.has('apagar-varias')) throw new Recusa('Você não tem permissão para isso.');
        }
        const r = await firestore(env, `${raiz(env)}:runQuery`, {
          method: 'POST',
          body: JSON.stringify({
            structuredQuery: {
              from: [{ collectionId: 'messages' }],
              where: {
                compositeFilter: {
                  op: 'AND',
                  filters: [
                    { fieldFilter: { field: { fieldPath: 'groupId' }, op: 'EQUAL', value: { stringValue: grupo } } },
                    { fieldFilter: { field: { fieldPath: 'channelId' }, op: 'EQUAL', value: { stringValue: canalId } } },
                  ],
                },
              },
              orderBy: [{ field: { fieldPath: 'sentAt' }, direction: 'DESCENDING' }],
              limit: n,
            },
          }),
        });
        if (!r.ok) throw new Error(`Firestore ${r.status} no limpar`);
        const linhas = (await r.json()) as { document?: { name: string } }[];
        for (const l of linhas) if (l.document !== undefined) escritas.push({ apagar: `messages/${l.document.name.split('/').pop()!}` });
        escritas.push(await registrar(env, grupo, uid, 'limpou', canalId, `${escritas.length} mensagens em #${String(canal['name'] ?? '')}`));
        resposta = { ok: true, apagadas: linhas.filter((l) => l.document !== undefined).length };
        break;
      }
      case 'comando-salvar':
      case 'comando-apagar': {
        // Comandos personalizados do grupo (etapa 6).
        const id = typeof corpo['comando'] === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(corpo['comando']) ? corpo['comando'] : null;
        const velho = id === null ? null : await lerDoc(env, `comandos/${id}`);
        if (velho !== null && velho['groupId'] !== grupo) throw new Recusa('Esse comando não é deste grupo.', 404);
        const meu = velho === null || velho['criadoPor'] === uid;
        precisa(q, meu ? 'criar-comandos' : 'gerenciar-comandos');
        if (acao === 'comando-apagar') {
          if (velho === null) throw new Recusa('Esse comando não existe mais.', 404);
          escritas.push({ apagar: `comandos/${id}` });
          escritas.push(await registrar(env, grupo, uid, 'apagou o comando', id!, `/${String(velho['nome'] ?? '')}`));
          break;
        }
        const c = (corpo['campos'] ?? {}) as Dados;
        const nome = String(c['nome'] ?? '').trim().toLowerCase();
        if (!/^[a-z0-9-]{1,32}$/.test(nome)) throw new Recusa('O nome do comando usa só letras sem acento, números e "-" (até 32).', 400);
        const PRONTOS = ['dado', 'moeda', 'sortear', 'escolher', 'spoiler', 'shrug', 'me', 'castigo', 'expulsar', 'banir', 'cargo', 'apelido', 'limpar', 'lento', 'convite'];
        if (PRONTOS.includes(nome)) throw new Recusa(`/${nome} já é um comando pronto do Loftchat.`, 400);
        const iguais = (await porGrupo(env, 'comandos', grupo)).filter((x) => x.d['nome'] === nome && x.id !== id);
        if (iguais.length > 0) throw new Recusa(`Já existe /${nome} neste grupo.`, 409);
        const respostaTexto = String(c['resposta'] ?? '').trim().slice(0, 2000);
        if (respostaTexto === '') throw new Recusa('O comando precisa de uma resposta.', 400);
        const novoId = id ?? `${grupo.slice(0, 8)}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
        escritas.push({
          atualizar: `comandos/${novoId}`,
          criar: true,
          dados: {
            groupId: grupo,
            nome,
            descricao: String(c['descricao'] ?? '').trim().slice(0, 100),
            resposta: respostaTexto,
            cargos: lista(c['cargos']).filter((x) => cargos.some((k) => k.id === x)),
            criadoPor: String(velho?.['criadoPor'] ?? uid),
            em: new Date().toISOString(),
          },
        });
        escritas.push(await registrar(env, grupo, uid, velho === null ? 'criou o comando' : 'editou o comando', novoId, `/${nome}`));
        resposta = { ok: true, id: novoId };
        break;
      }
      default: {
        const extra = await acoesExtras(env, acao, grupo, q, dono, cargos, corpo, escritas);
        if (extra === null) return json({ erro: 'ação não existe' }, 400);
        resposta = extra;
      }
    }

    if (escritas.length > 0) await gravarTudo(env, escritas);
    await recalcular(env, grupo);
    return json(resposta);
  } catch (e) {
    if (e instanceof Recusa) return json({ erro: e.message }, e.status);
    throw e;
  }
}

/* Ganchos das próximas etapas (canais, moderação). Devolve null = ação desconhecida. */
type Extras = (
  env: Env,
  acao: string,
  grupo: string,
  q: Quem,
  dono: string,
  cargos: Cargo[],
  corpo: Dados,
  escritas: Escrita[],
) => Promise<Dados | null>;
let acoesExtras: Extras = async () => null;
export function ligarAcoesExtras(f: Extras): void {
  acoesExtras = f;
}
export { Recusa, precisa, abaixo, lista, validas, lerDoc, DO_CANAL };
export type { Quem };

/**
 * Quem VÊ o canal (para as notificações): o mesmo que as regras do banco —
 * o que o carteiro calculou; sem cálculo, canal com regra própria fica fora.
 */
export async function quemVeOCanal(env: Env, grupo: string, canalId: string, g: Dados | null, canal: Dados | null): Promise<string[]> {
  const membros = await porGrupo(env, 'memberships', grupo);
  const dono = String(g?.['ownerId'] ?? '');
  const proprias = lerRegras(canal?.['permissoes']);
  const cat = typeof canal?.['categoryId'] === 'string' ? (canal['categoryId'] as string) : '';
  const daCategoria = cat === '' ? {} : lerRegras(((g?.['permsCategorias'] ?? {}) as Dados)[cat]);
  const temRegras = Object.keys(proprias).length > 0 || Object.keys(daCategoria).length > 0;
  const saida: string[] = [];
  for (const m of membros) {
    const uid = String(m.d['memberId'] ?? '');
    if (uid === '') continue;
    if (uid === dono) {
      saida.push(uid);
      continue;
    }
    const porCanal = (m.d['canais'] ?? {}) as Dados;
    const lista_ = Array.isArray(porCanal[canalId]) ? lista(porCanal[canalId]) : temRegras ? [] : lista(m.d['perms'] ?? PERMISSOES_DO_TODOS);
    if (!Array.isArray(m.d['perms']) && !temRegras) {
      saida.push(uid);
      continue;
    }
    const ver = canal?.['kind'] === 'voice' ? 'ver-sala' : 'ver-canal';
    if (lista_.some((p) => p === 'administrador' || p === ver)) saida.push(uid);
  }
  return saida;
}

/**
 * 0.10.5: UMA pessoa pode fazer `p` neste canal? O mesmo que `podeNoCanal`
 * das regras do banco: dono sempre; castigo tira; senão as permissões do
 * canal (ou do servidor, se o canal não tem regra própria).
 */
export async function podeNoCanal(env: Env, grupo: string, canalId: string, uid: string, p: string, g: Dados | null, canal: Dados | null): Promise<boolean> {
  if (String(g?.['ownerId'] ?? '') === uid) return true;
  const m = await lerDoc(env, `memberships/${grupo}_${uid}`);
  if (m === null) return false;
  if (typeof m['castigoAte'] === 'string' && Date.parse(m['castigoAte']) > Date.now()) return false;
  const proprias = lerRegras(canal?.['permissoes']);
  const cat = typeof canal?.['categoryId'] === 'string' ? (canal['categoryId'] as string) : '';
  const daCategoria = cat === '' ? {} : lerRegras(((g?.['permsCategorias'] ?? {}) as Dados)[cat]);
  const temRegras = Object.keys(proprias).length > 0 || Object.keys(daCategoria).length > 0;
  const porCanal = (m['canais'] ?? {}) as Dados;
  const perms = Array.isArray(porCanal[canalId]) ? lista(porCanal[canalId]) : temRegras ? [] : lista(m['perms'] ?? PERMISSOES_DO_TODOS);
  return perms.some((x) => x === 'administrador' || x === p);
}
