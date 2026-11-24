import { expect, test } from '@playwright/test';
import type { Browser, BrowserContext, Page } from '@playwright/test';

import {
  activeGroupId,
  createGroupThroughUi,
  limparTudo,
  newAccount,
  patchDocViaRest,
  putDocViaRest,
  readDocViaRest,
  resolveTokens,
  sendMessageThroughUi,
  signUpThroughUi,
  usernameFor,
  USING_EMULATOR,
} from './helpers';
import type { TestAccount } from './helpers';

/**
 * Etapa 18, Entrega 2 de 3 — conversas privadas.
 *
 * Mesmo padrão de `friends.spec.ts`: contas descartáveis, `track`/`signedIn`
 * locais, limpeza no `afterAll`.
 */

const accounts: TestAccount[] = [];

function track(label: string): TestAccount {
  const account = newAccount(label);
  accounts.push(account);
  return account;
}

test.afterAll(async () => {
  await limparTudo(accounts, 'dm — limpeza');
});

/** Uma aba já dentro do app, com `@` reservado. */
async function signedIn(
  browser: Browser,
  label: string,
): Promise<{ context: BrowserContext; page: Page; account: TestAccount }> {
  const account = track(label);
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/');
  await signUpThroughUi(page, account);
  await resolveTokens(account);
  return { context, page, account };
}

/**
 * Vai para a tela inicial e para a aba Amigos, MESMO que um PV esteja aberto.
 *
 * "Tela inicial" (barra de grupos) só troca `view` — se um PV já estiver
 * aberto (mesma `view: 'home'`), ela sozinha não fecha nada. Quem fecha é o
 * item "Amigos" da coluna 2 (`home-column.ts`), por isso os dois cliques.
 */
async function openFriends(page: Page, tab: string): Promise<void> {
  await page.getByRole('button', { name: 'Privado', exact: true }).click();
  await page.getByRole('button', { name: 'Amigos', exact: true }).click();
  await expect(page.locator('.friends')).toBeVisible({ timeout: 15_000 });
  await page.locator(`.friends__tab[data-tab="${tab}"]`).click();
}

/** A manda pedido para B, B aceita — o caminho curto que `friends.spec.ts` já prova à parte. */
async function becomeFriends(
  a: { page: Page },
  b: { page: Page; account: TestAccount },
): Promise<void> {
  await openFriends(a.page, 'adicionar');
  await a.page.locator('.friends__input').fill(usernameFor(b.account));
  await a.page.locator('.friends__submit').click();
  await expect(a.page.locator('.friends__note')).toHaveText('Pedido enviado.', {
    timeout: 30_000,
  });
  await openFriends(b.page, 'pendentes');
  await b.page.getByRole('button', { name: 'Aceitar' }).click();
}

/** Clica na linha do amigo, na aba Amigos — o caminho de abrir PV que a spec pede. */
async function openDmWith(page: Page, friendName: string): Promise<void> {
  await openFriends(page, 'amigos');
  await page.locator('.friends__row--clickable', { hasText: friendName }).click();
  await expect(page.locator('.dm-chat__name')).toHaveText(friendName, { timeout: 15_000 });
}

/** O id do par, mesma derivação de `pairId` em `src/lib/friends.ts` — não importado, é regra do PRODUTO sendo conferida de fora. */
function pairIdFor(a: string, b: string): string {
  return a < b ? `${a}_${b}` : `${b}_${a}`;
}

/** `data-message-id` do balão com este texto — para os testes de REST cru. */
async function messageIdByText(page: Page, text: string): Promise<string> {
  const bubble = page.locator('.message', { hasText: text }).first();
  const id = await bubble.getAttribute('data-message-id');
  if (id === null) throw new Error(`mensagem "${text}" sem data-message-id`);
  return id;
}

test('mensagem no PV chega em tempo real, e a conversa não nasce só de abrir', async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const a = await signedIn(browser, 'dm-rt-a');
  const b = await signedIn(browser, 'dm-rt-b');
  await becomeFriends(a, b);

  await openDmWith(a.page, b.account.displayName);

  // Abrir NÃO cria a conversa — só a primeira mensagem cria (item 4 da etapa 18).
  const par = pairIdFor(a.account.uid ?? '', b.account.uid ?? '');
  const antes = await readDocViaRest(a.account, `dmThreads/${par}`);
  expect(antes.status, 'a conversa não pode existir só de clicar no amigo').toBe(404);

  // B já está com o PV aberto quando A manda — é isso que prova "tempo real".
  await openDmWith(b.page, a.account.displayName);

  await sendMessageThroughUi(a.page, 'oi, tudo bem?');
  await expect(a.page.getByText('oi, tudo bem?').first()).toBeVisible({ timeout: 15_000 });
  await expect(
    b.page.getByText('oi, tudo bem?').first(),
    'a mensagem tem que chegar na outra aba sem recarregar',
  ).toBeVisible({ timeout: 15_000 });

  const depois = await readDocViaRest(a.account, `dmThreads/${par}`);
  expect(depois.status, 'a primeira mensagem cria a conversa').toBe(200);

  await a.context.close();
  await b.context.close();
});

test('depois de falar no PV, a mensagem do GRUPO vai para o grupo (não para o PV)', async ({
  browser,
}) => {
  // Bug de 24/11/2026: o PV continuava "guardado" ao ir para um grupo, e
  // tudo o que se mandava no grupo (texto, áudio, foto, figurinha) caía no PV.
  test.setTimeout(120_000);
  const a = await signedIn(browser, 'dm-grupo-a');
  const b = await signedIn(browser, 'dm-grupo-b');
  await createGroupThroughUi(a.page, 'Grupo depois do PV');
  const grupo = await activeGroupId(a.page);
  await becomeFriends(a, b);

  await openDmWith(a.page, b.account.displayName);
  await sendMessageThroughUi(a.page, 'isso vai no pv');
  await expect(a.page.getByText('isso vai no pv').first()).toBeVisible({ timeout: 15_000 });

  await a.page.locator(`.group-bar__button[data-group-id="${grupo}"]`).click();
  await expect(a.page.locator('.channels__group-name')).toHaveText('Grupo depois do PV');
  await sendMessageThroughUi(a.page, 'isso vai no grupo');
  await expect(a.page.locator('.message', { hasText: 'isso vai no grupo' })).toBeVisible({ timeout: 15_000 });

  // No PV (dos dois lados) só a primeira.
  await openDmWith(a.page, b.account.displayName);
  await expect(a.page.getByText('isso vai no pv').first()).toBeVisible({ timeout: 15_000 });
  await expect(a.page.getByText('isso vai no grupo')).toHaveCount(0);
  await openDmWith(b.page, a.account.displayName);
  await expect(b.page.getByText('isso vai no pv').first()).toBeVisible({ timeout: 15_000 });
  await expect(b.page.getByText('isso vai no grupo')).toHaveCount(0);

  await a.context.close();
  await b.context.close();
});

test('a lista de conversas mostra os dois lados, com o trecho certo, e reordena sozinha', async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const a = await signedIn(browser, 'dm-list-a');
  const b = await signedIn(browser, 'dm-list-b');
  const c = await signedIn(browser, 'dm-list-c');
  await becomeFriends(a, b);
  await becomeFriends(a, c);

  await openDmWith(a.page, b.account.displayName);
  await sendMessageThroughUi(a.page, 'oi b');
  await expect(a.page.getByText('oi b').first()).toBeVisible({ timeout: 15_000 });

  await openDmWith(a.page, c.account.displayName);
  await sendMessageThroughUi(a.page, 'oi c');
  await expect(a.page.getByText('oi c').first()).toBeVisible({ timeout: 15_000 });

  /*
   * A coluna 2 (home-column) mostra a lista o tempo todo, mesmo com um PV
   * aberto na coluna 3 — não precisa fechar o PV para conferir.
   */
  const rows = a.page.locator('.home-column__dm');
  await expect(rows).toHaveCount(2, { timeout: 15_000 });
  await expect(rows.nth(0), 'a conversa mais recente (C) fica no topo').toContainText(
    c.account.displayName,
  );
  await expect(rows.nth(0)).toContainText('oi c');
  await expect(rows.nth(1)).toContainText(b.account.displayName);
  await expect(rows.nth(1)).toContainText('oi b');

  // Mensagem NOVA na conversa mais ANTIGA (B) reordena a lista sozinha.
  await openDmWith(a.page, b.account.displayName);
  await sendMessageThroughUi(a.page, 'de novo, b');

  await expect(
    rows.nth(0),
    'mensagem nova na conversa mais antiga sobe ela para o topo',
  ).toContainText(b.account.displayName, { timeout: 15_000 });
  await expect(rows.nth(0)).toContainText('de novo, b');

  // Do lado de B: a mesma conversa, com o trecho certo.
  await b.page.getByRole('button', { name: 'Privado', exact: true }).click();
  await expect(b.page.locator('.home-column__dm')).toHaveCount(1, { timeout: 15_000 });
  await expect(b.page.locator('.home-column__dm')).toContainText(a.account.displayName);
  await expect(b.page.locator('.home-column__dm')).toContainText('de novo, b');

  await a.context.close();
  await b.context.close();
  await c.context.close();
});

test('bloquear impede escrever no PV, e a conversa antiga continua legível', async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const a = await signedIn(browser, 'dm-blk-a');
  const b = await signedIn(browser, 'dm-blk-b');
  await becomeFriends(a, b);

  await openDmWith(a.page, b.account.displayName);
  await sendMessageThroughUi(a.page, 'oi antes de bloquear');
  await expect(a.page.getByText('oi antes de bloquear').first()).toBeVisible({
    timeout: 15_000,
  });

  // B já está de olho na conversa quando o bloqueio acontecer.
  await openDmWith(b.page, a.account.displayName);
  await expect(b.page.getByText('oi antes de bloquear').first()).toBeVisible({
    timeout: 15_000,
  });

  // A bloqueia B pela aba Amigos — bloquear também desfaz a amizade, então
  // a linha de B some de lá (ver `blockUser`); a conversa não some com ela.
  await openFriends(a.page, 'amigos');
  await a.page.getByRole('button', { name: 'Bloquear', exact: true }).click();
  // Bloquear pergunta antes (revisão 23/11/2026).
  await a.page.getByRole('dialog', { name: 'Bloquear' }).getByRole('button', { name: 'Bloquear' }).click();

  // De volta ao PV pela lista de conversas — não tem mais como chegar lá pela
  // aba Amigos, porque bloquear desfez o vínculo.
  await a.page.locator('.home-column__dm', { hasText: b.account.displayName }).click();
  await expect(a.page.locator('.dm-chat__name')).toHaveText(b.account.displayName, {
    timeout: 15_000,
  });

  // A conversa antiga continua LEGÍVEL.
  await expect(a.page.getByText('oi antes de bloquear').first()).toBeVisible();
  // E o composer virou aviso — sem round-trip nenhum, porque quem bloqueou já sabe.
  await expect(a.page.locator('.dm-chat__blocked')).toBeVisible();
  await expect(a.page.locator('.composer__input')).toHaveCount(0);

  /*
   * Do lado de B: NENHUM aviso especial (item 5 da etapa 18 — quem foi
   * bloqueado não é avisado). B só descobre tentando mandar, e o erro é o
   * mesmo texto neutro de qualquer falha de envio.
   */
  await sendMessageThroughUi(b.page, 'ainda tento falar');
  await expect(b.page.locator('.composer__error')).toBeVisible({ timeout: 15_000 });
  await expect(b.page.locator('.composer__error')).not.toHaveText('');

  await a.context.close();
  await b.context.close();
});

test('as REGRAS protegem o PV contra REST cru: leitura, autoria e bloqueio', async ({
  browser,
}) => {
  test.setTimeout(90_000);
  expect(USING_EMULATOR, 'este teste é do emulador').toBe(true);

  const a = await signedIn(browser, 'dm-reg-a');
  const b = await signedIn(browser, 'dm-reg-b');
  const c = await signedIn(browser, 'dm-reg-c');
  await becomeFriends(a, b);

  await openDmWith(a.page, b.account.displayName);
  await sendMessageThroughUi(a.page, 'mensagem de A');
  await expect(a.page.getByText('mensagem de A').first()).toBeVisible({ timeout: 15_000 });

  await openDmWith(b.page, a.account.displayName);
  await sendMessageThroughUi(b.page, 'mensagem de B');
  await expect(b.page.getByText('mensagem de B').first()).toBeVisible({ timeout: 15_000 });

  const uidA = a.account.uid ?? '';
  const uidB = b.account.uid ?? '';
  const par = pairIdFor(uidA, uidB);

  // C não é participante: nem a conversa, nem as mensagens dela.
  expect(
    (await readDocViaRest(c.account, `dmThreads/${par}`)).status,
    'terceiro não lê a conversa',
  ).toBe(403);

  // A precisa ter RECEBIDO a mensagem de B (tempo real) antes de ler o id dela no DOM.
  await expect(a.page.getByText('mensagem de B').first()).toBeVisible({ timeout: 15_000 });
  const idMsgDeB = await messageIdByText(a.page, 'mensagem de B');
  expect(
    (await readDocViaRest(c.account, `dmMessages/${idMsgDeB}`)).status,
    'terceiro não lê mensagem do PV',
  ).toBe(403);

  // A não manda mensagem se fazendo passar por B.
  expect(
    await putDocViaRest(a.account, `dmMessages/forjada-${Date.now()}`, {
      threadId: par,
      authorId: uidB,
      kind: 'text',
      body: 'finge ser B',
      sentAt: new Date().toISOString(),
    }),
    'ninguém escreve mensagem em nome de outro autor',
  ).toBe(403);

  // A não edita a mensagem que B escreveu.
  expect(
    await patchDocViaRest(a.account, `dmMessages/${idMsgDeB}`, { body: 'editado por A' }),
    'só o autor edita a própria mensagem',
  ).toBe(403);

  // A bloqueia B; B não consegue mais CRIAR mensagem nesta conversa.
  await openFriends(a.page, 'amigos');
  await a.page.getByRole('button', { name: 'Bloquear', exact: true }).click();
  // Bloquear pergunta antes (revisão 23/11/2026).
  await a.page.getByRole('dialog', { name: 'Bloquear' }).getByRole('button', { name: 'Bloquear' }).click();

  expect(
    await putDocViaRest(b.account, `dmMessages/pos-bloqueio-${Date.now()}`, {
      threadId: par,
      authorId: uidB,
      kind: 'text',
      body: 'depois do bloqueio',
      sentAt: new Date().toISOString(),
    }),
    'bloqueado não cria mensagem nova, mesmo direto pela REST',
  ).toBe(403);

  await a.context.close();
  await b.context.close();
  await c.context.close();
});
