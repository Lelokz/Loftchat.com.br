/**
 * Faxina do PROJETO REAL: apaga o que as contas de teste deixaram para trás.
 *
 * Escrito para a etapa 15, depois que a investigação encontrou 175 contas
 * `loft-e2e-` e centenas de documentos órfãos no `loft-3d6c0f`. Apagar isso à
 * mão pelo console é inviável e erra.
 *
 * USO:
 *
 *     node scripts/limpar-projeto-real.mjs              # só LISTA (padrão)
 *     node scripts/limpar-projeto-real.mjs --apagar     # pede confirmação e apaga
 *     node scripts/limpar-projeto-real.mjs --apagar --orfaos   # inclui os órfãos
 *
 * O padrão NÃO APAGA NADA. É preciso pedir explicitamente, e depois confirmar
 * digitando o total — porque um script que apaga produção não deve poder ser
 * disparado por engano numa seta para cima no terminal.
 *
 * AS DUAS REGRAS QUE NÃO SE NEGOCIAM
 *
 * 1. Conta só é apagada se o e-mail começar com `loft-e2e-`. A checagem é feita
 *    contra a lista VIVA do Auth, no momento de apagar — não contra um arquivo
 *    lido antes, que poderia estar velho.
 * 2. Documento de GRUPO só entra se o grupo for de uma conta `loft-e2e-`. Uma
 *    conta de teste que entrou num grupo SEU deixa só a `membership` dela para
 *    trás; o grupo, os canais e as mensagens são seus e ficam.
 *
 * ORDEM: documentos primeiro, contas depois. Ao contrário, os documentos ficam
 * inalcançáveis — foi assim que nasceram os 529 órfãos que este script também
 * sabe limpar (`--orfaos`).
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
    for (const u of pagina.users ?? []) contas.push({ uid: u.localId, email: u.email ?? '' });
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

/**
 * O uid dono de um documento, quando o documento diz quem é.
 *
 * `from` está na lista por causa dos `signals`, que são mensagens de sinalização
 * do WebRTC entre DUAS pessoas: quem manda é o dono para efeito de faxina.
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

async function montarPlano() {
  const contas = await lerContas();
  const uidsVivos = new Set(contas.map((c) => c.uid));
  const contasE2e = contas.filter((c) => c.email.startsWith(PREFIXO));
  const uidsE2e = new Set(contasE2e.map((c) => c.uid));

  const colecoes = await lerColecoes();
  const banco = {};
  for (const c of colecoes) banco[c] = await lerDocumentos(c);
  banco['signals'] = await lerSignals();

  /*
   * GRUPOS DE TESTE são só os que uma conta `loft-e2e-` CRIOU.
   *
   * Deliberadamente não inclui grupo em que uma conta de teste apenas entrou:
   * esse grupo é de outra pessoa, e apagar os canais e mensagens dele seria
   * apagar conversa de gente de verdade. Dali sai só a membership do teste.
   */
  const gruposE2e = new Set(
    (banco['groups'] ?? [])
      .filter((d) => uidsE2e.has(txt(d.fields, 'ownerId') ?? ''))
      .map(idDe),
  );

  const doTeste = [];
  const orfaos = [];

  for (const [colecao, documentos] of Object.entries(banco)) {
    for (const doc of documentos) {
      const dono = donoDe(colecao, doc);
      const grupo = txt(doc.fields, 'groupId');

      const partes = envolvidos(doc);
      const tocaTeste =
        (dono !== null && uidsE2e.has(dono)) ||
        (grupo !== undefined && gruposE2e.has(grupo)) ||
        partes.some((u) => uidsE2e.has(u));

      if (tocaTeste) {
        doTeste.push({ colecao, nome: doc.name });
        continue;
      }

      /*
       * ÓRFÃO É SÓ QUEM PERDEU O DONO — não "tudo o que sobrou".
       *
       * Uma versão anterior deste script jogava TODO `signal` aqui, porque os
       * `voiceChannels` pai não existem. Mas parte deles é de contas VIVAS, suas
       * e dos seus amigos, e "o pai sumiu" não é o mesmo que "o dono sumiu".
       * Documento de conta viva não é órfão e não se apaga por engano.
       */
      const semDono = dono !== null && !uidsVivos.has(dono);
      const semNinguemVivo = partes.length > 0 && partes.every((u) => !uidsVivos.has(u));
      if (semDono || semNinguemVivo) orfaos.push({ colecao, nome: doc.name });
    }
  }

  return { contas, contasE2e, doTeste, orfaos, banco, gruposE2e };
}

function porColecao(itens) {
  const contagem = {};
  for (const i of itens) contagem[i.colecao] = (contagem[i.colecao] ?? 0) + 1;
  return contagem;
}

function mostrarPlano(plano) {
  const { contas, contasE2e, doTeste, orfaos } = plano;

  console.log(`\n${'='.repeat(72)}`);
  console.log(`PROJETO: ${PROJETO}`);
  console.log(`${'='.repeat(72)}\n`);

  console.log(`CONTAS NO AUTH: ${contas.length}`);
  console.log(`  com prefixo ${PREFIXO} (serão apagadas): ${contasE2e.length}`);
  console.log(`  sem o prefixo (NÃO SERÃO TOCADAS):       ${contas.length - contasE2e.length}\n`);

  console.log('CONTAS QUE FICAM (todas as que não têm o prefixo):');
  for (const c of contas.filter((c) => !c.email.startsWith(PREFIXO))) {
    console.log(`    ${c.email || '(sem e-mail)'}`);
  }

  console.log(`\n${'-'.repeat(72)}`);
  console.log(`DOCUMENTOS DAS CONTAS DE TESTE: ${doTeste.length}`);
  console.log(`${'-'.repeat(72)}`);
  for (const [colecao, n] of Object.entries(porColecao(doTeste)).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${String(n).padStart(5)}  ${colecao}`);
  }

  console.log(`\n${'-'.repeat(72)}`);
  console.log(
    `DOCUMENTOS ÓRFÃOS (dono já não existe): ${orfaos.length}` +
      `   ${incluirOrfaos ? '<< INCLUÍDOS (--orfaos)' : '<< NÃO incluídos; use --orfaos'}`,
  );
  console.log(`${'-'.repeat(72)}`);
  for (const [colecao, n] of Object.entries(porColecao(orfaos)).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${String(n).padStart(5)}  ${colecao}`);
  }

  const total = doTeste.length + (incluirOrfaos ? orfaos.length : 0);
  console.log(`\n${'='.repeat(72)}`);
  console.log(`TOTAL A APAGAR: ${total} documentos + ${contasE2e.length} contas`);
  console.log(`${'='.repeat(72)}\n`);
  return total;
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
 * Apaga as contas — RECONFERINDO o prefixo contra o Auth vivo.
 *
 * A lista foi montada no começo da execução; entre lá e aqui passaram minutos
 * de faxina. Reler é barato e é o que garante que a regra 1 valha no instante
 * em que a conta some, e não no instante em que foi planejada.
 */
async function apagarContas() {
  const agora = await lerContas();
  const alvos = agora.filter((c) => c.email.startsWith(PREFIXO)).map((c) => c.uid);

  const recusadas = agora.filter((c) => !c.email.startsWith(PREFIXO)).length;
  console.log(`  conferência: ${alvos.length} contas com o prefixo; ${recusadas} preservadas`);

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

async function confirmar(total) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  console.log('Isto APAGA DE VERDADE, no projeto real, e não tem desfazer.');
  const resposta = await rl.question(`Digite ${total} para confirmar (qualquer outra coisa cancela): `);
  rl.close();
  return resposta.trim() === String(total);
}

/* -------------------------------------------------------------------------- */

(async () => {
  TOKEN = await tokenDeDono();

  console.log('lendo o estado do projeto…');
  const plano = await montarPlano();
  const total = mostrarPlano(plano);

  if (!apagar) {
    console.log('Modo LISTA — nada foi apagado.');
    console.log('Para apagar de verdade:  node scripts/limpar-projeto-real.mjs --apagar' +
      (plano.orfaos.length > 0 ? ' [--orfaos]' : ''));
    return;
  }

  if (total === 0 && plano.contasE2e.length === 0) {
    console.log('Nada a fazer — o projeto já está limpo.');
    return;
  }

  if (!(await confirmar(total))) {
    console.log('Cancelado. Nada foi apagado.');
    return;
  }

  console.log('\n— documentos primeiro —');
  await apagarDocumentos(plano.doTeste, 'contas de teste');
  if (incluirOrfaos) await apagarDocumentos(plano.orfaos, 'órfãos');

  console.log('\n— agora as contas —');
  await apagarContas();

  /*
   * O RELATO FINAL É UMA LEITURA NOVA, não a soma do que o script achou que fez.
   * Um número calculado a partir das próprias intenções não prova nada; releitura
   * prova.
   */
  console.log('\n— conferindo o que sobrou —');
  const depois = await montarPlano();
  console.log(`\n  contas ${PREFIXO} restantes : ${depois.contasE2e.length}`);
  console.log(`  documentos de teste restantes: ${depois.doTeste.length}`);
  console.log(`  documentos órfãos restantes  : ${depois.orfaos.length}`);
  console.log(`  contas preservadas           : ${depois.contas.length - depois.contasE2e.length}`);

  const sobrou = depois.doTeste.length + depois.contasE2e.length +
    (incluirOrfaos ? depois.orfaos.length : 0);
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
