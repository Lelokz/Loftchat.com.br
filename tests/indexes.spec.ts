import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

import {
  activeGroupId,
  cleanupFirestore,
  createGroupThroughUi,
  limparTudo,
  probeQuery,
  resolveTokens,
  sendMessageThroughUi,
  signInThroughUi,
  USING_EMULATOR,
} from './helpers';
import type { TestAccount } from './helpers';

/**
 * OS ÍNDICES COMPOSTOS EXISTEM MESMO? — contra o projeto REAL, de propósito.
 *
 * ====================================================================
 * `npm run check:indexes`
 *
 * FORA do `npm test`. Rode DEPOIS DE MEXER EM CONSULTA — qualquer coisa
 * com `where` + `orderBy`, ou um `where` a mais numa consulta que já
 * existia.
 * ====================================================================
 *
 * POR QUE ELE PRECISA EXISTIR: o emulador do Firestore **não valida índices
 * compostos**. Ele responde qualquer consulta, com ou sem índice publicado. Ao
 * mover a suíte para o emulador (etapa 12), a classe de erro que derrubou quatro
 * testes na etapa 4 — um índice publicado com a direção errada — deixou de ser
 * pega por qualquer teste. Este arquivo é a reposição dessa cobertura.
 *
 * COMO ELE DETECTA, em duas camadas:
 *
 *   1. SONDAS EXPLÍCITAS — cada consulta do produto é disparada por REST e o
 *      resultado é AFIRMADO. É esta camada que dá garantia: um teste que só
 *      escuta passa quando nada é dito, inclusive quando nada foi consultado.
 *   2. O console do navegador, como rede de segurança para o que o app faz
 *      sozinho e as sondas não cobrem.
 *
 * O CAMINHO DE FALHA FOI PROVADO (etapa 12): com uma sonda deliberadamente sem
 * índice, o teste fica vermelho com
 *
 *     HTTP 400 — "The query requires an index. You can create it here: <link>"
 *     "status": "FAILED_PRECONDITION"
 *
 * O link do próprio Firestore cria o índice certo. Depois de criar, acrescente
 * a firestore.indexes.json e publique com
 * `firebase deploy --only firestore:indexes` — e ESPERE ficar READY.
 *
 * CUSTO: ~10 gravações por execução. Desprezível perto do limite diário, e é o
 * preço de não descobrir isso em produção.
 *
 * A CONTA É FIXA, e por dois motivos que se somam. Desde a etapa 14 as regras
 * exigem `email_verified` para criar grupo, e em produção não existe API para
 * confirmar e-mail — então a conta precisa ter sido confirmada à mão, uma vez.
 * E como ela é fixa, o lixo se ACUMULA: cada execução cria um grupo no projeto
 * real. Por isso a faxina roda DUAS vezes, e a primeira é a que costuma faltar:
 * antes de criar, para varrer o que uma execução interrompida deixou para trás.
 */

/**
 * Credenciais da conta fixa, fora do repositório.
 *
 * Falta o arquivo → o teste falha DIZENDO como criar. Um `skip` silencioso
 * seria pior: o comando passaria sem ter conferido nada.
 */
function contaFixa(): TestAccount {
  const caminho = join(process.cwd(), '.check-indexes.json');
  if (!existsSync(caminho)) {
    throw new Error(
      'Falta o arquivo .check-indexes.json (ele está no .gitignore).\n' +
        'Crie UMA conta no Loft, confirme o e-mail dela, e escreva:\n' +
        '  { "email": "...", "password": "...", "displayName": "Índices" }\n' +
        'Ela precisa de e-mail confirmado: desde a etapa 14 as regras exigem ' +
        'isso para criar grupo, e em produção não há API que confirme por você.',
    );
  }
  const dados = JSON.parse(readFileSync(caminho, 'utf-8')) as {
    email: string;
    password: string;
    displayName?: string;
  };
  return {
    email: dados.email,
    password: dados.password,
    displayName: dados.displayName ?? 'Índices',
  };
}

const accounts: TestAccount[] = [];

test.afterAll(async () => {
  await limparTudo(accounts, "indices — limpeza");
});

test('@indices as consultas compostas do produto têm índice no projeto real', async ({
  page,
}) => {
  test.setTimeout(90_000);

  /*
   * Rodar isto contra o emulador seria pior do que não rodar: passaria sempre,
   * dando a impressão de que os índices foram conferidos. Falhar alto é o
   * comportamento certo.
   */
  expect(
    USING_EMULATOR,
    'check:indexes precisa do projeto REAL — o emulador aceita qualquer consulta ' +
      'e um verde aqui não significaria nada. Rode `npm run check:indexes`, ' +
      'nunca dentro de `npm test`.',
  ).toBe(false);

  /*
   * Tudo o que o Firestore reclamar, de qualquer listener.
   *
   * Guardado e avaliado no fim, e não a cada mensagem: uma consulta pode falhar
   * depois de a tela já ter assentado, e abortar no primeiro erro esconderia as
   * outras — o valor deste teste é listar TODAS as que faltam de uma vez.
   */
  const reclamacoes: string[] = [];
  const anotar = (texto: string): void => {
    const alvo = texto.toLowerCase();
    if (
      alvo.includes('requires an index') ||
      alvo.includes('failed-precondition') ||
      alvo.includes('índice')
    ) {
      if (!reclamacoes.includes(texto)) reclamacoes.push(texto);
    }
  };
  page.on('console', (message) => anotar(message.text()));
  page.on('pageerror', (error) => anotar(error.message));

  const account = contaFixa();
  accounts.push(account);
  await resolveTokens(account);

  /*
   * FAXINA DE ENTRADA — antes de criar qualquer coisa.
   *
   * A conta é fixa, então uma execução que morreu no meio deixou um grupo para
   * trás. Sem esta varredura eles se acumulariam no projeto real, um por falha,
   * com canais e mensagens pendurados. `cleanupFirestore` é a cascata da etapa
   * 5: apaga mensagens, participantes de voz, canais e convites ANTES do grupo,
   * porque a regra desses quatro lê o documento do grupo — apagar o grupo
   * primeiro deixaria o resto ilegível e inapagável por qualquer pessoa.
   */
  await cleanupFirestore([account]);

  await page.goto('/');
  await signInThroughUi(page, account);

  // Criar o grupo aciona a lista de grupos (memberships por memberId) e a de
  // canais (channels por groupId — a ordenação por position é feita no CLIENTE).
  await createGroupThroughUi(page, 'Grupo Índices');

  // Abrir o canal de texto aciona a consulta que quebrou na etapa 4:
  // groupId + channelId + orderBy sentAt, com limitToLast.
  await sendMessageThroughUi(page, 'sonda de índice');
  await expect(page.locator('.message')).toHaveCount(1, { timeout: 30_000 });

  // O painel de membros aciona memberships por groupId — o outro sentido.
  await expect(page.locator('.members')).toBeVisible({ timeout: 30_000 });

  /*
   * Entrar na voz aciona as duas consultas que faltam: voiceParticipants por
   * groupId e a sinalização (signals por groupId + to), que tem DOIS filtros de
   * igualdade e foi conferida na etapa 6.
   */
  await page
    .locator('.channels__body')
    .getByRole('button', { name: 'Sala Principal' })
    .click();
  await expect(page.locator('.room')).toBeVisible({ timeout: 30_000 });
  // Uma folga para os listeners de voz assentarem e reclamarem, se for o caso.
  await page.waitForTimeout(5_000);

  /*
   * AS SONDAS EXPLÍCITAS.
   *
   * Escutar o console cobre o que o app faz sozinho, mas um teste que só escuta
   * passa quando nada é dito — inclusive quando nada foi consultado. Aqui cada
   * consulta composta do produto é DISPARADA e o resultado é AFIRMADO.
   *
   * A conta é membro do grupo que ela mesma criou, o que é obrigatório: a regra
   * recusa antes de o Firestore avaliar o índice, e uma sonda de não-membro
   * levaria 403 sem nunca chegar no erro que interessa.
   */
  await resolveTokens(account);
  const groupId = await activeGroupId(page);
  const channelId =
    (await page.locator('.channel.is-active').getAttribute('data-channel-id')) ?? '';

  const sondas: { nome: string; resultado: { status: number; message: string } }[] = [];
  const sondar = async (
    nome: string,
    spec: Parameters<typeof probeQuery>[1],
  ): Promise<void> => {
    sondas.push({ nome, resultado: await probeQuery(account, spec) });
  };

  await sondar('mensagens do canal', {
    collection: 'messages',
    equals: { groupId, channelId },
    orderBy: 'sentAt',
    direction: 'DESCENDING',
  });
  // SEM orderBy: `subscribeChannels` ordena no cliente. Ver o comentário em
  // `probeQuery` — sonda que não espelha a consulta real acusa falso positivo.
  await sondar('canais do grupo', { collection: 'channels', equals: { groupId } });
  await sondar('meus grupos', {
    collection: 'memberships',
    equals: { memberId: account.uid ?? '' },
  });
  await sondar('membros do grupo', {
    collection: 'memberships',
    equals: { groupId },
  });

  /*
   * ETAPA 18 — conversas privadas. Não precisa de uma conversa DE VERDADE
   * (dois participantes) para provar o índice: o Firestore valida a FORMA da
   * consulta contra o índice publicado antes de olhar para os documentos, e
   * uma consulta vazia continua exigindo o mesmo índice que uma cheia.
   *
   * O valor de `threadId` na segunda sonda precisa CONTER o uid da conta —
   * não porque exista uma mensagem de verdade com esse id, mas porque a
   * REGRA de `dmMessages` (`threadId.split('_').hasAny([uid()])`) só é
   * PROVÁVEL para o Firestore se o valor fixado pela consulta já satisfizer
   * a regra — a mesma exigência de "a regra recusa antes do índice" que a
   * conta-membro das sondas de grupo já respeita.
   */
  await sondar('lista de conversas privadas', {
    collection: 'dmThreads',
    equals: {},
    arrayContains: { fieldPath: 'members', value: account.uid ?? '' },
    orderBy: 'lastMessageAt',
    direction: 'DESCENDING',
  });
  await sondar('histórico do PV', {
    collection: 'dmMessages',
    equals: { threadId: `${account.uid ?? ''}_sonda` },
    orderBy: 'sentAt',
    direction: 'DESCENDING',
  });

  for (const { nome, resultado } of sondas) {
    const semIndice =
      /requires an index|FAILED_PRECONDITION/i.test(resultado.message) === true;
    expect(
      semIndice,
      `A consulta "${nome}" ESTÁ SEM ÍNDICE no projeto real.
` +
        `Resposta do Firestore (HTTP ${resultado.status}):
${resultado.message}`,
    ).toBe(false);
  }

  expect(
    reclamacoes,
    'ALGUMA CONSULTA DO PRODUTO ESTÁ SEM ÍNDICE no projeto real.\n' +
      'A mensagem do Firestore abaixo traz o link que cria o índice certo. ' +
      'Depois de criar, acrescente-o a firestore.indexes.json e publique com ' +
      '`firebase deploy --only firestore:indexes` — e ESPERE ficar READY antes ' +
      'de confiar no resultado.\n' +
      reclamacoes.join('\n'),
  ).toEqual([]);
});
