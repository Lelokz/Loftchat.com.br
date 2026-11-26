/**
 * INSÍGNIAS DO SERVIDOR (0.12.5) — o carteiro conta e dá.
 *
 * Os contadores de cada pessoa POR GRUPO moram em
 * `insigniasDoMembro/{grupo}_{uid}` (ver src/lib/insignias-grupo.ts).
 * Tudo que já é contado nas insígnias do Loft também conta aqui (mensagem,
 * reação, minutos de chamada, minutos de jogo, o "conferir" ao abrir). Só
 * grupo QUE TEM insígnia gasta alguma coisa.
 *
 * As ações (criar, editar, apagar, dar, tirar) vêm pelo POST /cargos, com as
 * permissões e a hierarquia de lá (ver cargos.ts).
 */

import { ICONES_DO_SERVIDOR } from '../../src/components/insignias/desenhos';
import {
  GATILHOS,
  LIMITE_POR_GRUPO,
  RARIDADES_DO_SERVIDOR,
  aindaVale,
  chaveDoJogo,
  cumpriu,
  lerInsigniaDoGrupo,
  normalizarFrase,
  temAlvo,
} from '../../src/lib/insignias-grupo';
import type { Extras, InsigniaDoGrupo } from '../../src/lib/insignias-grupo';
import { calcServidor } from '../../src/lib/permissoes';
import { lerVarios } from './index';
import type { Env } from './index';
import { Recusa, lerCargo, lerDoc, lista, porGrupo, precisa, registrar } from './cargos';
import type { Escrita as EscritaDeCargo, Quem } from './cargos';
import { TIPOS, consultar, contar, diaDe, gravarTudo, ontem } from './insignias';
import type { Escrita } from './insignias';

type Dados = Record<string, unknown>;

/** As insígnias do grupo (vazio = o grupo não tem, e nada mais é gasto). */
export async function insigniasDoGrupo(env: Env, grupo: string): Promise<InsigniaDoGrupo[]> {
  const docs = await consultar(env, 'insigniasDoGrupo', [['groupId', 'EQUAL', grupo]], [], 100);
  return docs.map((d) => lerInsigniaDoGrupo(d.id, d.dados)).filter((i): i is InsigniaDoGrupo => i !== null);
}

interface Conta {
  somar?: Record<string, number>;
  maximo?: Record<string, number>;
  definir?: Record<string, unknown>;
}

/** O que mais conta (tempo de membro, cargos, convites, posição) — só o que alguma insígnia usa. */
async function extrasDe(env: Env, grupo: string, uid: string, defs: InsigniaDoGrupo[], membro: Dados | null): Promise<Extras> {
  const x: Extras = {
    ...(typeof membro?.['joinedAt'] === 'string' ? { entrou: membro['joinedAt'] } : {}),
    cargos: lista(membro?.['cargos']),
  };
  if (defs.some((d) => d.gatilho.tipo === 'convites')) {
    const codigos = (await consultar(env, 'invites', [['createdBy', 'EQUAL', uid], ['groupId', 'EQUAL', grupo]], ['code'], 100)).map((c) => c.id);
    let n = 0;
    for (let i = 0; i < codigos.length; i += 30) n += await contar(env, 'memberships', [['groupId', 'EQUAL', grupo], ['inviteCode', 'IN', codigos.slice(i, i + 30)]]);
    x.convidados = n;
  }
  if (defs.some((d) => d.gatilho.tipo === 'primeiros') && typeof membro?.['joinedAt'] === 'string') {
    const membros = await consultar(env, 'memberships', [['groupId', 'EQUAL', grupo]], ['joinedAt'], 1000);
    const ordem = membros.map((m) => String(m.dados['joinedAt'] ?? '9999')).sort();
    const posicao = ordem.indexOf(String(membro['joinedAt'])) + 1;
    if (posicao > 0) x.posicao = posicao;
  }
  return x;
}

/**
 * Soma os contadores da pessoa NESTE grupo, confere as insígnias e dá as
 * que fechar (e tira a de cargo de quem perdeu o cargo). Uma escrita só.
 */
export async function contarNoGrupo(env: Env, uid: string, grupo: string, conta: Conta, defsProntas?: InsigniaDoGrupo[]): Promise<string[]> {
  const defs = defsProntas ?? (await insigniasDoGrupo(env, grupo));
  if (defs.length === 0) return [];
  const [doc, membro] = await lerVarios(env, [`insigniasDoMembro/${grupo}_${uid}`, `memberships/${grupo}_${uid}`]);
  if (membro === null) return [];
  const n = { ...((doc?.['n'] ?? {}) as Record<string, number>) };
  const tem = (doc?.['tem'] ?? {}) as Record<string, string>;
  const definir: Record<string, unknown> = { groupId: grupo, uid };
  for (const [k, v] of Object.entries(conta.somar ?? {})) n[k] = (n[k] ?? 0) + v;
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
  const x = await extrasDe(env, grupo, uid, defs, membro);
  const agora = new Date().toISOString();
  const hoje = diaDe();
  const novas: string[] = [];
  const escritas: Escrita[] = [];
  const apagar: string[] = [];
  for (const d of defs) {
    if (tem[d.id] !== undefined) {
      // A de cargo some com o cargo.
      if (d.gatilho.tipo === 'cargo' && !cumpriu(d, n, x)) {
        apagar.push(d.id);
        escritas.push({ caminho: `insigniasDoGrupo/${d.id}`, somar: { quantos: -1 } });
      }
      continue;
    }
    if (!aindaVale(d, hoje) || !cumpriu(d, n, x)) continue;
    definir[`tem.${d.id}`] = agora;
    novas.push(d.id);
    escritas.push({ caminho: `insigniasDoGrupo/${d.id}`, somar: { quantos: 1 } });
  }
  const somar: Record<string, number> = {};
  for (const [k, v] of Object.entries(conta.somar ?? {})) if (v !== 0) somar[`n.${k}`] = v;
  definir['atualizadoEm'] = agora;
  await gravarTudo(env, [{ caminho: `insigniasDoMembro/${grupo}_${uid}`, definir, somar }, ...escritas]);
  if (apagar.length > 0) await apagarCampos(env, `insigniasDoMembro/${grupo}_${uid}`, apagar.map((id) => `tem.${id}`));
  return novas;
}

async function apagarCampos(env: Env, caminho: string, campos: string[]): Promise<void> {
  const { firestore, nomeCompleto, raiz } = await import('./index');
  const seg = (p: string): string => (/^[A-Za-z_][A-Za-z0-9_]*$/.test(p) ? p : `\`${p}\``);
  await firestore(env, `${raiz(env)}:commit`, {
    method: 'POST',
    body: JSON.stringify({
      writes: [{ update: { name: nomeCompleto(env, caminho), fields: {} }, updateMask: { fieldPaths: campos.map((c) => c.split('.').map(seg).join('.')) }, currentDocument: { exists: true } }],
    }),
  });
}

/* --------------------------- os ganchos da contagem --------------------------- */

/** Chamado pelo /avisar: uma mensagem nova no grupo. */
export async function contarMensagemNoGrupo(env: Env, uid: string, msg: Dados): Promise<void> {
  const grupo = typeof msg['groupId'] === 'string' ? msg['groupId'] : '';
  if (grupo === '') return;
  const defs = await insigniasDoGrupo(env, grupo);
  if (defs.length === 0) return;
  const somar: Record<string, number> = { msg: 1 };
  const canal = typeof msg['channelId'] === 'string' ? msg['channelId'] : '';
  if (canal !== '') somar[`c_${canal}`] = 1;
  const midia = TIPOS[String(msg['kind'])];
  if (midia === 'fotos' || midia === 'videos' || midia === 'audios' || midia === 'figurinhas') somar[midia] = 1;
  const maximo: Record<string, number> = {};
  const definir: Record<string, unknown> = {};

  // Dias seguidos conversando NESTE grupo.
  const doc = await lerDoc(env, `insigniasDoMembro/${grupo}_${uid}`);
  const n = (doc?.['n'] ?? {}) as Record<string, number>;
  const hoje = diaDe();
  if (doc?.['ultimoDia'] !== hoje) {
    const seguidos = doc?.['ultimoDia'] === ontem(hoje) ? (n['seguidosAgora'] ?? 0) + 1 : 1;
    definir['n.seguidosAgora'] = seguidos;
    maximo['seguidos'] = seguidos;
    definir['ultimoDia'] = hoje;
  }

  // A frase secreta (comparada sem acento e sem maiúscula).
  const frases = defs.filter((d) => d.gatilho.tipo === 'frase');
  if (frases.length > 0) {
    const corpo = normalizarFrase(String(msg['body'] ?? ''));
    const internos = await lerVarios(env, frases.map((d) => `insigniasDoGrupoInterno/${d.id}`));
    frases.forEach((d, i) => {
      const frase = normalizarFrase(String(internos[i]?.['frase'] ?? ''));
      if (frase.length >= 2 && corpo.includes(frase)) maximo[`f_${d.id}`] = 1;
    });
  }
  await contarNoGrupo(env, uid, grupo, { somar, maximo, definir }, defs);
}

/** Reação recebida numa mensagem de grupo (já conferida e contada uma vez só). */
export async function contarReacaoNoGrupo(env: Env, autor: string, grupo: string): Promise<void> {
  if (grupo === '') return;
  await contarNoGrupo(env, autor, grupo, { somar: { reacoes: 1 } });
}

/** Minutos de chamada numa sala do grupo. */
export async function contarVozNoGrupo(env: Env, uid: string, canal: string, minutos: number): Promise<void> {
  if (canal === '' || minutos <= 0) return;
  const c = await lerDoc(env, `channels/${canal}`);
  const grupo = typeof c?.['groupId'] === 'string' ? c['groupId'] : '';
  if (grupo === '') return;
  await contarNoGrupo(env, uid, grupo, { somar: { vozMin: minutos } });
}

/** Minutos jogando o mesmo jogo que alguém do grupo. */
export async function contarJogoNoGrupo(env: Env, uid: string, jogo: string, outros: string[], minutos: number): Promise<void> {
  if (outros.length === 0 || minutos <= 0) return;
  const meus = (await consultar(env, 'memberships', [['memberId', 'EQUAL', uid]], ['groupId'], 100)).map((m) => String(m.dados['groupId']));
  for (const g of meus.slice(0, 20)) {
    const defs = await insigniasDoGrupo(env, g);
    if (!defs.some((d) => d.gatilho.tipo === 'jogo')) continue;
    const juntos = await lerVarios(env, outros.slice(0, 20).map((o) => `memberships/${g}_${o}`));
    if (!juntos.some((m) => m !== null)) continue;
    await contarNoGrupo(env, uid, g, { somar: { [chaveDoJogo(jogo)]: minutos } }, defs);
  }
}

/** Ao abrir o app: tempo de membro, cargo, convites, primeiros — em cada grupo com insígnia. */
export async function conferirNosGrupos(env: Env, uid: string): Promise<void> {
  const meus = (await consultar(env, 'memberships', [['memberId', 'EQUAL', uid]], ['groupId'], 100)).map((m) => String(m.dados['groupId']));
  for (const g of meus.slice(0, 30)) {
    const defs = await insigniasDoGrupo(env, g);
    if (defs.length > 0) await contarNoGrupo(env, uid, g, {}, defs);
  }
}

/* ------------------------------ o histórico ------------------------------ */

/**
 * Insígnia criada agora vale para quem JÁ cumpre: conta as mensagens e a
 * mídia de cada membro neste grupo (o resto — chamada, reações, dias
 * seguidos, jogo — conta daqui pra frente).
 */
async function contarHistorico(env: Env, grupo: string, defs: InsigniaDoGrupo[]): Promise<void> {
  const membros = (await porGrupo(env, 'memberships', grupo)).slice(0, 300);
  const canais = [...new Set(defs.filter((d) => d.gatilho.tipo === 'mensagens' && d.gatilho.canal !== undefined).map((d) => d.gatilho.canal!))];
  const midias = [...new Set(defs.filter((d) => d.gatilho.tipo === 'midia').map((d) => d.gatilho.midia ?? 'fotos'))];
  const kindDe: Record<string, string> = Object.fromEntries(Object.entries(TIPOS).map(([k, v]) => [v, k]));
  const precisaMsg = defs.some((d) => d.gatilho.tipo === 'mensagens');
  for (const m of membros) {
    const uid = String(m.d['memberId'] ?? '');
    if (uid === '') continue;
    const maximo: Record<string, number> = {};
    const base: Array<[string, 'EQUAL', unknown]> = [['groupId', 'EQUAL', grupo], ['authorId', 'EQUAL', uid]];
    if (precisaMsg) maximo['msg'] = await contar(env, 'messages', base);
    for (const c of canais) maximo[`c_${c}`] = await contar(env, 'messages', [...base, ['channelId', 'EQUAL', c]]);
    for (const md of midias) maximo[md] = await contar(env, 'messages', [...base, ['kind', 'EQUAL', kindDe[md] ?? 'image']]);
    await contarNoGrupo(env, uid, grupo, { maximo }, defs);
  }
}

/* -------------------------------- as ações -------------------------------- */

const TIPOS_OK = new Set(GATILHOS.map((g) => g.tipo));
const ID_DOC = /^[A-Za-z0-9_-]{1,64}$/;

function numero(v: unknown, min: number, max: number): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : null;
}

/**
 * As ações das insígnias do servidor (vêm do POST /cargos). Devolve a
 * resposta, ou null = não é ação de insígnia.
 */
export async function acaoDeInsignia(
  env: Env,
  acao: string,
  grupo: string,
  q: Quem,
  dono: string,
  cargos: ReturnType<typeof lerCargo>[],
  corpo: Dados,
  escritas: EscritaDeCargo[],
): Promise<Dados | null> {
  if (!acao.startsWith('insignia-')) return null;
  const id = typeof corpo['insignia'] === 'string' && ID_DOC.test(corpo['insignia']) ? corpo['insignia'] : null;
  const velha = id === null ? null : await lerDoc(env, `insigniasDoGrupo/${id}`);
  if (velha !== null && velha['groupId'] !== grupo) throw new Recusa('Essa insígnia não é deste grupo.', 404);
  const def = id === null || velha === null ? null : lerInsigniaDoGrupo(id, velha);

  switch (acao) {
    case 'insignia-ler': {
      precisa(q, 'editar-insignias');
      if (def === null) throw new Recusa('Essa insígnia não existe mais.', 404);
      const interno = await lerDoc(env, `insigniasDoGrupoInterno/${def.id}`);
      return { ok: true, frase: String(interno?.['frase'] ?? '') };
    }

    case 'insignia-salvar': {
      precisa(q, def === null ? 'criar-insignias' : 'editar-insignias');
      if (id !== null && def === null) throw new Recusa('Essa insígnia não existe mais.', 404);
      const d = (corpo['dados'] ?? {}) as Dados;
      const nome = typeof d['nome'] === 'string' ? d['nome'].trim().slice(0, 24) : '';
      if (nome === '') throw new Recusa('A insígnia precisa de um nome.', 400);
      const desc = typeof d['desc'] === 'string' ? d['desc'].trim().slice(0, 80) : '';
      const icone = typeof d['icone'] === 'string' && ICONES_DO_SERVIDOR[d['icone']] !== undefined ? d['icone'] : null;
      if (icone === null) throw new Recusa('Escolha um ícone.', 400);
      const raridade = d['raridade'];
      if (typeof raridade !== 'string' || !RARIDADES_DO_SERVIDOR.includes(raridade as never)) throw new Recusa('Escolha a raridade.', 400);
      const g = (d['gatilho'] ?? {}) as Dados;
      const tipo = g['tipo'];
      if (typeof tipo !== 'string' || !TIPOS_OK.has(tipo as never)) throw new Recusa('Escolha como ganhar.', 400);
      const gatilho: Dados = { tipo };
      if (temAlvo(tipo as never)) {
        const alvo = numero(g['alvo'], 1, 1_000_000);
        if (alvo === null) throw new Recusa('A meta precisa ser um número de 1 a 1.000.000.', 400);
        gatilho['alvo'] = alvo;
      } else gatilho['alvo'] = 1;
      if (tipo === 'mensagens' && typeof g['canal'] === 'string' && g['canal'] !== '') {
        const canal = await lerDoc(env, `channels/${g['canal']}`);
        if (canal === null || canal['groupId'] !== grupo) throw new Recusa('Esse canal não é deste grupo.', 400);
        gatilho['canal'] = g['canal'];
      }
      if (tipo === 'midia') {
        if (!['fotos', 'videos', 'audios', 'figurinhas'].includes(String(g['midia']))) throw new Recusa('Escolha o tipo (fotos, vídeos, áudios ou figurinhas).', 400);
        gatilho['midia'] = g['midia'];
      }
      if (tipo === 'cargo') {
        const c = cargos.find((x) => x.id === g['cargo']);
        if (c === undefined || c.todos) throw new Recusa('Escolha um cargo do grupo.', 400);
        gatilho['cargo'] = c.id;
      }
      if (tipo === 'jogo') {
        const jogo = typeof g['jogo'] === 'string' ? g['jogo'].trim().slice(0, 60) : '';
        if (jogo === '') throw new Recusa('Escreva qual jogo.', 400);
        gatilho['jogo'] = jogo;
      }
      let frase: string | null = null;
      if (tipo === 'frase') {
        frase = typeof d['frase'] === 'string' ? d['frase'].trim().slice(0, 80) : '';
        if (frase.length < 2 && def === null) throw new Recusa('Escreva a frase secreta.', 400);
      }
      const limite = numero(d['limite'] ?? 0, 0, 100_000);
      if (limite === null) throw new Recusa('O limite de pessoas precisa ser um número.', 400);
      const ate = typeof d['ate'] === 'string' && (d['ate'] === '' || /^\d{4}-\d{2}-\d{2}$/.test(d['ate'])) ? d['ate'] : '';
      if (def === null && (await insigniasDoGrupo(env, grupo)).length >= LIMITE_POR_GRUPO) {
        throw new Recusa(`O grupo já tem ${LIMITE_POR_GRUPO} insígnias (o máximo).`, 400);
      }
      const novoId = def?.id ?? `${grupo}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
      const agora = new Date().toISOString();
      escritas.push({
        atualizar: `insigniasDoGrupo/${novoId}`,
        criar: def === null,
        dados: {
          groupId: grupo,
          nome,
          desc,
          icone,
          raridade,
          gatilho,
          secreta: d['secreta'] === true,
          limite,
          ate,
          ...(def === null ? { quantos: 0, criadaEm: agora, criadaPor: q.uid } : {}),
          editadaEm: agora,
        },
      });
      if (frase !== null && frase !== '') escritas.push({ atualizar: `insigniasDoGrupoInterno/${novoId}`, criar: true, dados: { groupId: grupo, frase } });
      escritas.push(await registrar(env, grupo, q.uid, def === null ? 'criou a insígnia' : 'editou a insígnia', novoId, nome));
      return { ok: true, id: novoId, historico: true };
    }

    case 'insignia-apagar': {
      precisa(q, 'editar-insignias');
      if (def === null) throw new Recusa('Essa insígnia não existe mais.', 404);
      escritas.push({ apagar: `insigniasDoGrupo/${def.id}` });
      escritas.push({ apagar: `insigniasDoGrupoInterno/${def.id}` });
      escritas.push(await registrar(env, grupo, q.uid, 'apagou a insígnia', def.id, def.nome));
      // Some de todo mundo.
      const quem = await consultar(env, 'insigniasDoMembro', [['groupId', 'EQUAL', grupo]], ['tem'], 1000);
      for (const m of quem) {
        const tem = (m.dados['tem'] ?? {}) as Dados;
        if (tem[def.id] !== undefined) await apagarCampos(env, `insigniasDoMembro/${m.id}`, [`tem.${def.id}`]);
      }
      return { ok: true };
    }

    case 'insignia-dar':
    case 'insignia-tirar': {
      precisa(q, 'dar-insignias');
      if (def === null) throw new Recusa('Essa insígnia não existe mais.', 404);
      const alvo = String(corpo['membro'] ?? '');
      const dele = await lerDoc(env, `memberships/${grupo}_${alvo}`);
      if (dele === null) throw new Recusa('Essa pessoa não está no grupo.', 404);
      if (alvo === dono && !q.dono && alvo !== q.uid) throw new Recusa('Só o dono mexe nas insígnias do dono.');
      const topoDele = calcServidor(alvo, dono, cargos, lista(dele['cargos'])).topo;
      if (!q.dono && alvo !== q.uid && !(topoDele > q.topo)) throw new Recusa('Essa pessoa está no seu nível ou acima.');
      const doc = await lerDoc(env, `insigniasDoMembro/${grupo}_${alvo}`);
      const tem = (doc?.['tem'] ?? {}) as Dados;
      const dar = acao === 'insignia-dar';
      if (dar && tem[def.id] !== undefined) return { ok: true };
      if (!dar && tem[def.id] === undefined) return { ok: true };
      if (dar) {
        await gravarTudo(env, [
          { caminho: `insigniasDoMembro/${grupo}_${alvo}`, definir: { groupId: grupo, uid: alvo, [`tem.${def.id}`]: new Date().toISOString(), atualizadoEm: new Date().toISOString() } },
          { caminho: `insigniasDoGrupo/${def.id}`, somar: { quantos: 1 } },
        ]);
      } else {
        await apagarCampos(env, `insigniasDoMembro/${grupo}_${alvo}`, [`tem.${def.id}`]);
        await gravarTudo(env, [{ caminho: `insigniasDoGrupo/${def.id}`, somar: { quantos: -1 } }]);
      }
      escritas.push(await registrar(env, grupo, q.uid, dar ? 'deu a insígnia' : 'tirou a insígnia', alvo, def.nome));
      return { ok: true };
    }
  }
  return null;
}

/** Depois de gravar a insígnia nova/editada: quem já cumpre ganha. */
export async function depoisDeSalvar(env: Env, grupo: string): Promise<void> {
  const defs = await insigniasDoGrupo(env, grupo);
  if (defs.length > 0) await contarHistorico(env, grupo, defs);
}
