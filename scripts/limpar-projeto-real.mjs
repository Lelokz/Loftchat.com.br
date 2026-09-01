/**
 * Faxina do PROJETO REAL: apaga contas e o que elas deixaram para trás.
 *
 * Escrito para a etapa 15, depois que a investigação encontrou 175 contas
 * `loft-e2e-` e centenas de documentos órfãos no `loft-3d6c0f`. Apagar isso à
 * mão pelo console é inviável e erra. A etapa 17 acrescentou um segundo modo,
 * por LISTA DE EXCEÇÃO — apagar todo mundo menos quem se diz para manter —,
 * para limpar contas de gente de verdade (amigos que usaram por pouco tempo)
 * em vez de só contas de teste.
 *
 * USO:
 *
 *     node scripts/limpar-projeto-real.mjs                      # lista, modo prefixo loft-e2e-
 *     node scripts/limpar-projeto-real.mjs --apagar              # apaga, modo prefixo
 *     node scripts/limpar-projeto-real.mjs --apagar --orfaos     # + órfãos antigos (dono sumiu)
 *
 *     node scripts/limpar-projeto-real.mjs --manter=a@x.com,b@y.com             # lista, modo exceção
 *     node scripts/limpar-projeto-real.mjs --manter=a@x.com --apagar            # apaga, modo exceção
 *     node scripts/limpar-projeto-real.mjs --manter=a@x.com --apagar --orfaos   # + órfãos antigos
 *
 * O padrão NÃO APAGA NADA. É preciso pedir explicitamente, e depois confirmar
 * digitando o total — porque um script que apaga produção não deve poder ser
 * disparado por engano numa seta para cima no terminal. Com `--manter`, contas
 * e órfãos pedem CONFIRMAÇÕES SEPARADAS, com totais separados: são duas
 * operações de risco diferente, e uma não deve esconder o número da outra.
 *
 * AS REGRAS QUE NÃO SE NEGOCIAM
 *
 * 1. Sem `--manter`: conta só é apagada se o e-mail começar com `loft-e2e-`.
 *    Com `--manter`: conta só é apagada se o e-mail NÃO estiver na lista. Em
 *    QUALQUER modo, a checagem final é feita contra a lista VIVA do Auth, no
 *    momento de apagar — não contra o que foi lido no começo, que pode estar
 *    velho (a faxina inteira pode levar minutos).
 * 2. Documento de GRUPO só entra se o dono do grupo for uma conta alvo desta
 *    execução. Uma conta a apagar que só ENTROU num grupo de outra pessoa
 *    deixa só a `membership` dela para trás; o grupo, os canais e as
 *    mensagens são de outra conta e ficam — mesmo que essa conta também vá
 *    ser apagada por outro motivo, o dono real é quem decide, não quem visita.
 *
 * ORDEM: documentos primeiro, contas depois. Ao contrário, os documentos ficam
 * inalcançáveis — foi assim que nasceram os primeiros órfãos que este script
 * também sabe limpar (`--orfaos`).
 *
 * `--orfaos` sozinho pega dois tipos de órfão: (a) documento cujo "dono" já
 * não existe entre as contas vivas (a checagem original, etapa 15); (b) EM
 * MODO `--manter`, documento com `groupId` que não bate com NENHUM grupo
 * atualmente existente — o caso de `channels`/`messages` sobrando de um grupo
 * apagado há muito tempo, que a checagem (a) nunca pegava porque essas duas
 * coleções não têm campo de "dono" (ver `donoDe`). Antes de apagar este tipo,
 * o script mostra uma AMOSTRA — documento órfão é irrecuperável.
 *
 * REEXECUTÁVEL: cada execução relê o estado do projeto. Se cair no meio, rodar
 * de novo simplesmente encontra menos coisa. Não há arquivo de estado para
 * ficar dessincronizado.
 */

import { createInterface } from 'node:readline/promises';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const PROJETO = 'loft-3d6c0f';
const PREFIXO = 'loft-e2e-';
const LOTE = 400; // o `:commit` do Firestore aceita 500 escritas; 400 dá folga

const apagar = process.argv.includes('--apagar');
const incluirOrfaos = process.argv.includes('--orfaos');

/** `--manter=a@x.com,b@y.com` → Set de e-mails; `null` fora do modo exceção. */
const MANTER = (() => {
  const arg = process.argv.find((a) => a.startsWith('--manter='));
  if (arg === undefined) return null;
  const emails = arg
    .slice('--manter='.length)
    .split(',')
    .map((e) => e.trim())
    .filter((e) => e !== '');
  if (emails.length === 0) {
    throw new Error('--manter precisa de pelo menos um e-mail: --manter=fulano@exemplo.com');
  }
  return new Set(emails);
})();

/* -------------------------------------------------------------------------- */
/* Credencial de dono                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Um token NOVO a cada execução, tirado do refresh token do `firebase login`.
 *
 * O access token guardado pelo firebase-tools dura uma hora. Uma faxina de
 * milhares de documentos pode passar disso, e um 401 no meio deixaria o
 * trabalho pela metade — que é exatamente o estado que produz órfão.
 */
async function tokenDeDono() {
  const caminho = join(homedir(), '.config', 'configstore', 'firebase-tools.json');
  let refresh;
  try {
    refresh = JSON.parse(readFileSync(caminho, 'utf8'))?.tokens?.refresh_token;
  } catch {
    refresh = undefined;
  }
  if (refresh === undefined) {
    throw new Error(
      'Não achei a credencial do firebase-tools. Rode `npx firebase login` primeiro.',
    );
  }

  const resposta = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com',
      client_secret: 'j9iVZfS8kkCEFUPaAeJV0sAi',
      refresh_token: refresh,
      grant_type: 'refresh_token',
    }),
  });
  const dados = await resposta.json();
  if (!resposta.ok) throw new Error(`não consegui renovar o token: ${JSON.stringify(dados)}`);
  return dados.access_token;
}

let TOKEN = '';
const cabecalhos = () => ({ authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' });

const FS_BASE = `https://firestore.googleapis.com/v1/projects/${PROJETO}/databases/(default)/documents`;

async function chamar(url, opcoes = {}) {
  const resposta = await fetch(url, { ...opcoes, headers: cabecalhos() });
  const texto = await resposta.text();
  if (!resposta.ok) throw new Error(`${resposta.status} ${url}\n${texto.slice(0, 500)}`);
  return texto === '' ? {} : JSON.parse(texto);
}

/* -------------------------------------------------------------------------- */
/* Leitura do estado                                                           */
/* -------------------------------------------------------------------------- */

/** Todas as contas do Auth, paginando. */
async function lerContas() {
  const contas = [];
  let proxima;
  do {
    const url =
      `https://identitytoolkit.googleapis.com/v1/projects/${PROJETO}/accounts:batchGet` +
      `?maxResults=1000${proxima ? `&nextPageToken=${encodeURIComponent(proxima)}` : ''}`;
    const pagina = await chamar(url);
    for (const u of pagina.users ?? []) {
      contas.push({
        uid: u.localId,
        email: u.email ?? '',
        // epoch ms em string, como o Auth devolve.
        createdAt: u.createdAt !== undefined ? Number(u.createdAt) : null,
      });
    }
    proxima = pagina.nextPageToken;
  } while (proxima !== undefined);
  return contas;
}

async function lerColecoes() {
  const { collectionIds = [] } = await chamar(`${FS_BASE}:listCollectionIds`, {
    method: 'POST',
    body: '{}',
  });
  return collectionIds;
}

async function lerDocumentos(colecao) {
  const documentos = [];
  let proxima;
  do {
    const url =
      `${FS_BASE}/${colecao}?pageSize=300` +
      (proxima ? `&pageToken=${encodeURIComponent(proxima)}` : '');
    const pagina = await chamar(url);
    for (const d of pagina.documents ?? []) documentos.push(d);
    proxima = pagina.nextPageToken;
  } while (proxima !== undefined);
  return documentos;
}

/** Os `signals`, que vivem em subcoleções de `voiceChannels`. */
async function lerSignals() {
  const linhas = await chamar(`${FS_BASE}:runQuery`, {
    method: 'POST',
    body: JSON.stringify({
      structuredQuery: { from: [{ collectionId: 'signals', allDescendants: true }] },
    }),
  });
  return (Array.isArray(linhas) ? linhas : []).filter((l) => l.document).map((l) => l.document);
}

const txt = (campos, nome) => campos?.[nome]?.stringValue;
const idDe = (doc) => doc.name.split('/').pop();

function dataBr(epochMs) {
  if (epochMs === null || epochMs === undefined || Number.isNaN(epochMs)) return '(sem data)';
  const d = new Date(epochMs);
  const dois = (n) => String(n).padStart(2, '0');
  return (
    `${dois(d.getDate())}/${dois(d.getMonth() + 1)}/${d.getFullYear()} ` +
    `${dois(d.getHours())}:${dois(d.getMinutes())}`
  );
}

/**
 * O uid dono de um documento, quando o documento diz quem é.
 *
 * `from` está na lista por causa dos `signals`, que são mensagens de sinalização
 * do WebRTC entre DUAS pessoas: quem manda é o dono para efeito de faxina.
 *
 * `channels` e `messages` (esta com `authorId`, mas SEM os outros nomes) não
 * têm todos os campos daqui — é por isso que órfão de `channels` nunca é
 * pego por "dono sumiu": não tem dono nenhum, só `groupId`. Ver `semGrupo`
 * em `montarPlano`.
 */
function donoDe(colecao, doc) {
  const f = doc.fields ?? {};
  if (colecao === 'users') return idDe(doc);
  for (const chave of ['memberId', 'ownerId', 'authorId', 'uid', 'createdBy', 'from']) {
    const v = txt(f, chave);
    if (v !== undefined) return v;
  }
  return null;
}

/** Os dois lados de um `signal`; vazio para o resto. */
function envolvidos(doc) {
  const f = doc.fields ?? {};
  return [txt(f, 'from'), txt(f, 'to')].filter((v) => v !== undefined);
}

/* -------------------------------------------------------------------------- */
/* O plano                                                                     */
/* -------------------------------------------------------------------------- */

/** É "alvo" (vai ser apagada) segundo o modo desta execução. */
function contaEhAlvo(email) {
  return MANTER !== null ? !MANTER.has(email) : email.startsWith(PREFIXO);
}

async function montarPlano() {
  const contas = await lerContas();
  const uidsVivos = new Set(contas.map((c) => c.uid));
  const contasAlvo = contas.filter((c) => contaEhAlvo(c.email));
  const uidsAlvo = new Set(contasAlvo.map((c) => c.uid));
  const uidsMantidos = new Set(contas.filter((c) => !contaEhAlvo(c.email)).map((c) => c.uid));

  /*
   * UM UID DE REFERÊNCIA (dono, autor, from/to) É ALVO — e não `uidsAlvo.has`
   * direto, que exige o uid bater com uma conta VIVA e alvo.
   *
   * O bug que isso conserta: um "dono-fantasma" (uid gravado num documento
   * cuja CONTA já não existe mais — sobra de exclusão anterior) nunca está em
   * `uidsAlvo`, porque `uidsAlvo` só enumera contas que EXISTEM agora. No modo
   * `--manter`, isso fazia grupo de dono-fantasma (e tudo dentro dele) escapar
   * da Parte 1 inteira e cair errado na Parte 2 como "órfão antigo" — mesmo
   * sendo, na really, um grupo cujo dono não está na lista de exceção, então
   * É alvo desta limpeza. Testar contra o CONJUNTO PEQUENO dos mantidos, com
   * negação, resolve os dois modos: um uid-fantasma nunca está em
   * `uidsMantidos` (não é a conta que sobrevive), então conta como alvo —
   * exatamente o que deveria.
   *
   * No modo prefixo (sem --manter) o comportamento não muda: `uidsMantidos`
   * aqui é "todo mundo sem o prefixo", e negar isso dá de volta o mesmo
   * `uidsAlvo.has` de antes para qualquer uid que corresponda a conta viva —
   * a diferença só aparece para uid-fantasma, que no modo prefixo cai no
   * órfão de sempre (`semDono`), como já caía.
   */
  const donoEhAlvo = (uid) => uid !== null && (MANTER !== null ? !uidsMantidos.has(uid) : uidsAlvo.has(uid));

  const colecoes = await lerColecoes();
  const banco = {};
  for (const c of colecoes) banco[c] = await lerDocumentos(c);
  banco['signals'] = await lerSignals();

  const idsGruposAtuais = new Set((banco['groups'] ?? []).map(idDe));

  /*
   * GRUPOS ALVO são só os que uma conta alvo CRIOU.
   *
   * Deliberadamente não inclui grupo em que uma conta alvo apenas entrou:
   * esse grupo é de outra pessoa, e apagar os canais e mensagens dele seria
   * apagar conversa de gente que fica. Dali sai só a membership de quem sai.
   */
  const gruposAlvo = new Set(
    (banco['groups'] ?? [])
      .filter((d) => donoEhAlvo(txt(d.fields, 'ownerId') ?? null))
      .map(idDe),
  );

  const doApagar = [];
  const orfaos = [];

  for (const [colecao, documentos] of Object.entries(banco)) {
    for (const doc of documentos) {
      const dono = donoDe(colecao, doc);
      const grupo = txt(doc.fields, 'groupId');

      const partes = envolvidos(doc);
      const tocaAlvo =
        donoEhAlvo(dono) ||
        (grupo !== undefined && gruposAlvo.has(grupo)) ||
        partes.some((u) => donoEhAlvo(u));

      if (tocaAlvo) {
        doApagar.push({ colecao, nome: doc.name });
        continue;
      }

      /*
       * ÓRFÃO É SÓ QUEM PERDEU O DONO (ou o grupo) — não "tudo o que sobrou".
       *
       * Uma versão anterior deste script jogava TODO `signal` aqui, porque os
       * `voiceChannels` pai não existem. Mas parte deles é de contas VIVAS, suas
       * e dos seus amigos, e "o pai sumiu" não é o mesmo que "o dono sumiu".
       * Documento de conta viva não é órfão e não se apaga por engano.
       */
      const semDono = dono !== null && !uidsVivos.has(dono);
      const semNinguemVivo = partes.length > 0 && partes.every((u) => !uidsVivos.has(u));
      /*
       * SÓ EM MODO --manter: `channels`/`messages` sem campo de dono, mas com
       * `groupId` apontando para um grupo que JÁ NÃO EXISTE — sobra de uma
       * exclusão de grupo anterior a esta execução (produto ou script). Fora
       * do modo --manter mantém o comportamento original: não mexe nisso.
       */
      const semGrupo = MANTER !== null && grupo !== undefined && !idsGruposAtuais.has(grupo);
      if (semDono || semNinguemVivo || semGrupo) orfaos.push({ colecao, nome: doc.name, doc });
    }
  }

  return { contas, contasAlvo, doApagar, orfaos, banco, gruposAlvo };
}

function porColecao(itens) {
  const contagem = {};
  for (const i of itens) contagem[i.colecao] = (contagem[i.colecao] ?? 0) + 1;
  return contagem;
}

function imprimirPorColecao(itens) {
  for (const [colecao, n] of Object.entries(porColecao(itens)).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${String(n).padStart(5)}  ${colecao}`);
  }
}

function mostrarPlanoContas(plano) {
  const { contas, contasAlvo } = plano;
  const rotuloModo =
    MANTER !== null
      ? `NÃO estão na lista de exceção (${[...MANTER].join(', ')})`
      : `começam com "${PREFIXO}"`;

  console.log(`\n${'='.repeat(72)}`);
  console.log(`PROJETO: ${PROJETO}${MANTER !== null ? '  (modo: lista de exceção)' : '  (modo: prefixo loft-e2e-)'}`);
  console.log(`${'='.repeat(72)}\n`);

  console.log(`CONTAS NO AUTH: ${contas.length}`);
  console.log(`  ${rotuloModo} (serão apagadas): ${contasAlvo.length}`);
  console.log(`  as demais (NÃO SERÃO TOCADAS):    ${contas.length - contasAlvo.length}\n`);

  console.log('CONTAS A APAGAR — e-mail e data de criação, da mais antiga à mais nova:');
  for (const c of [...contasAlvo].sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))) {
    console.log(`    ${(c.email || '(sem e-mail)').padEnd(42)}  criada em ${dataBr(c.createdAt)}`);
  }

  console.log('\nCONTAS QUE FICAM:');
  for (const c of contas.filter((c) => !contaEhAlvo(c.email))) {
    console.log(`    ${c.email || '(sem e-mail)'}`);
  }
}

function mostrarPlanoDocumentos(plano) {
  const { doApagar, contasAlvo } = plano;

  console.log(`\n${'-'.repeat(72)}`);
  console.log(`DOCUMENTOS DAS CONTAS A APAGAR: ${doApagar.length}`);
  console.log(`${'-'.repeat(72)}`);
  imprimirPorColecao(doApagar);

  const total = doApagar.length;
  console.log(`\n${'='.repeat(72)}`);
  console.log(`PARTE 1 — TOTAL: ${total} documentos + ${contasAlvo.length} contas`);
  console.log(`${'='.repeat(72)}\n`);
  return total;
}

/** Amostra — documento órfão apagado não volta. Mostrada ANTES do total e da confirmação. */
function mostrarAmostraOrfaos(orfaos, idsGruposAtuais) {
  const porGroupId = (colecao) =>
    orfaos.filter((o) => o.colecao === colecao && txt(o.doc.fields, 'groupId') !== undefined);

  const channels = porGroupId('channels');
  const messages = porGroupId('messages');

  if (channels.length === 0 && messages.length === 0) return;

  console.log(`\n${'-'.repeat(72)}`);
  console.log('AMOSTRA — confira à mão antes de confirmar (documento órfão não volta)');
  console.log(`${'-'.repeat(72)}`);

  if (channels.length > 0) {
    console.log(`\n5 de ${channels.length} "channels" órfãos:`);
    for (const c of channels.slice(0, 5)) {
      const gid = txt(c.doc.fields, 'groupId');
      console.log(
        `    channels/${idDe(c.doc)}  nome="${txt(c.doc.fields, 'name')}"  groupId=${gid}` +
          `  (esse grupo existe? ${idsGruposAtuais.has(gid)})`,
      );
    }
  }

  if (messages.length > 0) {
    console.log(`\nTodos os ${messages.length} "messages" órfãos:`);
    for (const m of messages) {
      const gid = txt(m.doc.fields, 'groupId');
      const corpo = (txt(m.doc.fields, 'body') ?? '').slice(0, 40);
      console.log(
        `    messages/${idDe(m.doc)}  groupId=${gid}  autor=${txt(m.doc.fields, 'authorId')}` +
          `  "${corpo}"  (esse grupo existe? ${idsGruposAtuais.has(gid)})`,
      );
    }
  }
  console.log('');
}

function mostrarPlanoOrfaos(plano) {
  const { orfaos, banco } = plano;
  const idsGruposAtuais = new Set((banco['groups'] ?? []).map(idDe));

  mostrarAmostraOrfaos(orfaos, idsGruposAtuais);

  console.log(`${'-'.repeat(72)}`);
  console.log(
    `DOCUMENTOS ÓRFÃOS (sem relação com a Parte 1 — dono ou grupo já não existem): ${orfaos.length}`,
  );
  console.log(`${'-'.repeat(72)}`);
  imprimirPorColecao(orfaos);

  console.log(`\n${'='.repeat(72)}`);
  console.log(`PARTE 2 — TOTAL: ${orfaos.length} documentos órfãos`);
  console.log(`${'='.repeat(72)}\n`);
  return orfaos.length;
}

/* -------------------------------------------------------------------------- */
/* A execução                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Apaga em lotes pelo `:commit`.
 *
 * Uma requisição por documento seriam milhares de idas e voltas; o `commit`
 * leva 400 de uma vez. Cada lote é independente: se o processo morrer entre
 * dois lotes, os lotes já confirmados continuam confirmados e rodar de novo
 * pega o resto.
 */
async function apagarDocumentos(itens, rotulo) {
  let feitos = 0;
  for (let i = 0; i < itens.length; i += LOTE) {
    const fatia = itens.slice(i, i + LOTE);
    await chamar(`${FS_BASE.replace(/\/documents$/, '')}/documents:commit`, {
      method: 'POST',
      body: JSON.stringify({ writes: fatia.map((it) => ({ delete: it.nome })) }),
    });
    feitos += fatia.length;
    process.stdout.write(`\r  ${rotulo}: ${feitos}/${itens.length} documentos apagados`);
  }
  if (itens.length > 0) process.stdout.write('\n');
  return feitos;
}

/**
 * Apaga as contas — RECONFERINDO o alvo contra o Auth vivo.
 *
 * A lista foi montada no começo da execução; entre lá e aqui passaram minutos
 * de faxina. Reler é barato e é o que garante que a regra 1 valha no instante
 * em que a conta some, e não no instante em que foi planejada.
 */
async function apagarContas() {
  const agora = await lerContas();
  const alvos = agora.filter((c) => contaEhAlvo(c.email)).map((c) => c.uid);

  const recusadas = agora.filter((c) => !contaEhAlvo(c.email)).length;
  console.log(`  conferência: ${alvos.length} contas alvo; ${recusadas} preservadas`);

  let feitas = 0;
  for (let i = 0; i < alvos.length; i += 500) {
    const fatia = alvos.slice(i, i + 500);
    await chamar(
      `https://identitytoolkit.googleapis.com/v1/projects/${PROJETO}/accounts:batchDelete`,
      { method: 'POST', body: JSON.stringify({ localIds: fatia, force: true }) },
    );
    feitas += fatia.length;
    process.stdout.write(`\r  contas: ${feitas}/${alvos.length} apagadas`);
  }
  if (alvos.length > 0) process.stdout.write('\n');
  return feitas;
}

async function confirmar(total, rotulo) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  console.log(`Isto APAGA DE VERDADE ${rotulo}, no projeto real, e não tem desfazer.`);
  const resposta = await rl.question(`Digite ${total} para confirmar (qualquer outra coisa cancela): `);
  rl.close();
  return resposta.trim() === String(total);
}

/* -------------------------------------------------------------------------- */

(async () => {
  TOKEN = await tokenDeDono();

  console.log('lendo o estado do projeto…');
  const plano = await montarPlano();
  mostrarPlanoContas(plano);
  const totalParte1 = mostrarPlanoDocumentos(plano);

  let totalParte2 = 0;
  if (incluirOrfaos) totalParte2 = mostrarPlanoOrfaos(plano);

  if (!apagar) {
    console.log('Modo LISTA — nada foi apagado.');
    console.log(
      'Para apagar de verdade:  node scripts/limpar-projeto-real.mjs' +
        (MANTER !== null ? ` --manter=${[...MANTER].join(',')}` : '') +
        ' --apagar' +
        (plano.orfaos.length > 0 ? ' [--orfaos]' : ''),
    );
    return;
  }

  const apagadosPorColecao = {}; // acumula PARTE 1 + PARTE 2, para o relato final

  /* --- PARTE 1: contas e o que pertence a elas -------------------------- */
  if (totalParte1 === 0 && plano.contasAlvo.length === 0) {
    console.log('PARTE 1: nada a fazer — nenhuma conta alvo.');
  } else if (!(await confirmar(totalParte1, 'as contas alvo e os documentos delas'))) {
    console.log('PARTE 1 cancelada. Nada foi apagado.');
  } else {
    console.log('\n— Parte 1: documentos primeiro —');
    for (const [colecao, n] of Object.entries(porColecao(plano.doApagar))) {
      apagadosPorColecao[colecao] = (apagadosPorColecao[colecao] ?? 0) + n;
    }
    await apagarDocumentos(plano.doApagar, 'contas alvo');

    console.log('\n— Parte 1: agora as contas —');
    await apagarContas();
  }

  /* --- PARTE 2: órfãos antigos, confirmação própria ---------------------- */
  if (incluirOrfaos) {
    console.log(`\n${'='.repeat(72)}`);
    console.log('PARTE 2 — ÓRFÃOS ANTIGOS (sem relação com a Parte 1 acima)');
    console.log(`${'='.repeat(72)}`);
    if (totalParte2 === 0) {
      console.log('Nenhum órfão encontrado.');
    } else if (!(await confirmar(totalParte2, 'os documentos órfãos antigos'))) {
      console.log('PARTE 2 cancelada. Nada foi apagado.');
    } else {
      for (const [colecao, n] of Object.entries(porColecao(plano.orfaos))) {
        apagadosPorColecao[colecao] = (apagadosPorColecao[colecao] ?? 0) + n;
      }
      await apagarDocumentos(plano.orfaos, 'órfãos antigos');
    }
  }

  /*
   * O RELATO FINAL É UMA LEITURA NOVA, não a soma do que o script achou que fez.
   * Um número calculado a partir das próprias intenções não prova nada; releitura
   * prova. O total apagado por coleção, por outro lado, É a soma das intenções —
   * mas só chega aqui se o `apagarDocumentos` correspondente terminou sem
   * lançar erro, então é seguro: ou apagou tudo daquele lote, ou o script já
   * teria parado antes com uma mensagem de erro.
   */
  console.log('\n— conferindo o que sobrou —');
  const depois = await montarPlano();

  console.log(`\nAPAGADOS NESTA EXECUÇÃO, por coleção:`);
  const totalApagado = Object.values(apagadosPorColecao).reduce((s, n) => s + n, 0);
  if (totalApagado === 0) {
    console.log('    (nada foi apagado)');
  } else {
    for (const [colecao, n] of Object.entries(apagadosPorColecao).sort((a, b) => b[1] - a[1])) {
      console.log(`    ${String(n).padStart(5)}  ${colecao}`);
    }
  }
  console.log(`  total de documentos apagados: ${totalApagado}`);

  console.log(`\n  contas alvo restantes        : ${depois.contasAlvo.length}`);
  console.log(`  documentos de contas alvo restantes: ${depois.doApagar.length}`);
  console.log(`  documentos órfãos restantes  : ${depois.orfaos.length}`);
  console.log(`  contas preservadas           : ${depois.contas.length - depois.contasAlvo.length}`);

  const sobrou = depois.doApagar.length + depois.contasAlvo.length + (incluirOrfaos ? depois.orfaos.length : 0);
  console.log(
    sobrou === 0
      ? '\n  Limpeza completa.\n'
      : `\n  !! ${sobrou} item(ns) ficaram para trás. Rode o script de novo.\n`,
  );
})().catch((erro) => {
  console.error('\nERRO:', erro.message);
  console.error('Nada além do que já foi confirmado em lote foi apagado. Pode rodar de novo.');
  process.exit(1);
});
