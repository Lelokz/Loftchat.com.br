import { expect, test } from '@playwright/test';
import type { Browser, BrowserContext, Page } from '@playwright/test';

import {
  activeGroupId,
  createGroupThroughUi,
  limparTudo,
  newAccount,
  putDocViaRest,
  resolveTokens,
  sendMessageThroughUi,
  signUpFromInviteUi,
  signUpThroughUi,
  usernameFor,
  USING_EMULATOR,
} from './helpers';
import type { TestAccount } from './helpers';

/**
 * Etapa 19 — mensagens fixadas, no grupo e no PV, e o cartão de perfil do PV.
 *
 * Mesmo padrão de `dm.spec.ts`: contas descartáveis, helpers locais,
 * limpeza no `afterAll`.
 */

const accounts: TestAccount[] = [];

function track(label: string): TestAccount {
  const account = newAccount(label);
  accounts.push(account);
  return account;
}

test.afterAll(async () => {
  await limparTudo(accounts, 'fixadas — limpeza');
});

/* -------------------------------------------------------------------------- */
/* Cenário de grupo: dono + membro comum                                      */
/* -------------------------------------------------------------------------- */

interface GroupScene {
  ownerContext: BrowserContext;
  ownerPage: Page;
  guestContext: BrowserContext;
  guestPage: Page;
  owner: TestAccount;
  guest: TestAccount;
  groupId: string;
  channelId: string;
}

async function groupScene(browser: Browser, label: string): Promise<GroupScene> {
  const owner = track(`dono-${label}`);
  const guest = track(`membro-${label}`);
  const groupName = `Grupo ${label}`;

  const ownerContext = await browser.newContext();
  const ownerPage = await ownerContext.newPage();
  await ownerPage.goto('/');
  await signUpThroughUi(ownerPage, owner);
  await createGroupThroughUi(ownerPage, groupName);

  await ownerPage.getByRole('button', { name: 'Opções do grupo' }).click();
  await ownerPage.getByRole('menuitem', { name: 'Convidar pessoas' }).click();
  const link = ownerPage.locator('.modal__link');
  await expect(link).toBeVisible({ timeout: 30_000 });
  const invitePath = new URL(await link.inputValue()).pathname;
  await ownerPage.getByRole('button', { name: 'Fechar' }).first().click();

  const guestContext = await browser.newContext();
  const guestPage = await guestContext.newPage();
  await guestPage.goto(invitePath);
  await signUpFromInviteUi(guestPage, guest);
  await guestPage.getByRole('button', { name: 'Entrar no grupo' }).click({ timeout: 30_000 });
  await expect(guestPage.locator('.channels__group-name')).toHaveText(groupName, {
    timeout: 30_000,
  });

  await resolveTokens(owner);
  await resolveTokens(guest);
  const groupId = await activeGroupId(guestPage);
  const channelId =
    (await ownerPage.locator('.channel.is-active').getAttribute('data-channel-id')) ?? '';

  return { ownerContext, ownerPage, guestContext, guestPage, owner, guest, groupId, channelId };
}

async function pinThroughUi(page: Page, messageText: string): Promise<void> {
  await page.locator('.message', { hasText: messageText }).first().click({ button: 'right' });
  await page.locator('.context-menu').getByRole('menuitem', { name: 'Fixar mensagem' }).click();
}

/* -------------------------------------------------------------------------- */
/* Cenário de PV: dois amigos                                                 */
/* -------------------------------------------------------------------------- */

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

async function openFriends(page: Page, tab: string): Promise<void> {
  await page.getByRole('button', { name: 'Tela inicial' }).click();
  await page.getByRole('button', { name: 'Amigos', exact: true }).click();
  await expect(page.locator('.friends')).toBeVisible({ timeout: 15_000 });
  await page.locator(`.friends__tab[data-tab="${tab}"]`).click();
}

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

async function openDmWith(page: Page, friendName: string): Promise<void> {
  await openFriends(page, 'amigos');
  await page.locator('.friends__row--clickable', { hasText: friendName }).click();
  await expect(page.locator('.dm-chat__name')).toHaveText(friendName, { timeout: 15_000 });
}

async function pinDmThroughUi(page: Page, messageText: string): Promise<void> {
  await page.locator('.message', { hasText: messageText }).first().click({ button: 'right' });
  await page.locator('.context-menu').getByRole('menuitem', { name: 'Fixar mensagem' }).click();
}

/* -------------------------------------------------------------------------- */

test('fixar no grupo aparece em tempo real na outra aba, e um membro comum não fixa por REST', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const scene = await groupScene(browser, 'pin-grp');

  await sendMessageThroughUi(scene.ownerPage, 'mensagem para fixar');
  await expect(scene.ownerPage.getByText('mensagem para fixar').first()).toBeVisible({
    timeout: 15_000,
  });
  // O membro precisa ter RECEBIDO a mensagem (tempo real) antes do teste de REST.
  await expect(scene.guestPage.getByText('mensagem para fixar').first()).toBeVisible({
    timeout: 15_000,
  });

  await pinThroughUi(scene.ownerPage, 'mensagem para fixar');

  // Aparece no ícone do PRÓPRIO dono e, sem reload, no do membro também.
  await expect(scene.ownerPage.locator('.chat__pin-count')).toHaveText('1', { timeout: 15_000 });
  await expect(
    scene.guestPage.locator('.chat__pin-count'),
    'a outra aba vê a fixada sem recarregar',
  ).toHaveText('1', { timeout: 15_000 });

  // O membro comum ENXERGA a fixada (regra de leitura é isMember), mas o
  // menu dele não tem a opção — ela é só do dono.
  await scene.guestPage
    .locator('.message', { hasText: 'mensagem para fixar' })
    .first()
    .click({ button: 'right' });
  await expect(
    scene.guestPage.locator('.context-menu').getByRole('menuitem', { name: 'Fixar mensagem' }),
  ).toHaveCount(0);
  await expect(
    scene.guestPage.locator('.context-menu').getByRole('menuitem', { name: 'Desafixar' }),
  ).toHaveCount(0);

  // E por REST cru, direto — contornando a tela, a regra recusa igual.
  const messageId = await scene.ownerPage
    .locator('.message', { hasText: 'mensagem para fixar' })
    .first()
    .getAttribute('data-message-id');
  expect(
    await putDocViaRest(scene.guest, `pinnedMessages/forjada-${Date.now()}`, {
      groupId: scene.groupId,
      channelId: scene.channelId,
      messageId: messageId ?? '',
      authorId: scene.owner.uid ?? '',
      authorName: scene.owner.displayName,
      kind: 'text',
      excerpt: 'mensagem para fixar',
      sentAt: new Date().toISOString(),
      pinnedAt: new Date().toISOString(),
      pinnedBy: scene.guest.uid ?? '',
    }),
    'membro comum não fixa no grupo, nem contornando a tela',
  ).toBe(403);

  await scene.ownerContext.close();
  await scene.guestContext.close();
});

test('no PV os dois participantes fixam em tempo real, e desafixar remove dos dois lados', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const a = await signedIn(browser, 'pin-dm-a');
  const b = await signedIn(browser, 'pin-dm-b');
  await becomeFriends(a, b);

  await openDmWith(a.page, b.account.displayName);
  await openDmWith(b.page, a.account.displayName);

  await sendMessageThroughUi(a.page, 'mensagem do PV para fixar');
  await expect(a.page.getByText('mensagem do PV para fixar').first()).toBeVisible({
    timeout: 15_000,
  });
  await expect(b.page.getByText('mensagem do PV para fixar').first()).toBeVisible({
    timeout: 15_000,
  });

  // No PV o painel de fixadas já é SEMPRE VISÍVEL — sem precisar de clique.
  await pinDmThroughUi(a.page, 'mensagem do PV para fixar');
  await expect(a.page.locator('.pinned-item')).toHaveCount(1, { timeout: 15_000 });
  await expect(
    b.page.locator('.pinned-item'),
    'a outra aba vê a fixada sem recarregar',
  ).toHaveCount(1, { timeout: 15_000 });

  // B também pode desafixar — os dois participantes podem, no PV.
  // Desafixar vive no MENU DE CONTEXTO da fixada agora (ajuste pós-etapa-19).
  await b.page.locator('.pinned-item').click({ button: 'right' });
  await b.page.locator('.context-menu').getByRole('menuitem', { name: 'Desafixar' }).click();
  await expect(a.page.locator('.pinned-item')).toHaveCount(0, { timeout: 15_000 });
  await expect(b.page.locator('.pinned-item')).toHaveCount(0, { timeout: 15_000 });

  await a.context.close();
  await b.context.close();
});

test('apagar a mensagem original não quebra a lista de fixadas', async ({ browser }) => {
  test.setTimeout(90_000);
  const scene = await groupScene(browser, 'pin-del');

  await sendMessageThroughUi(scene.ownerPage, 'vou apagar depois de fixar');
  await expect(scene.ownerPage.getByText('vou apagar depois de fixar').first()).toBeVisible({
    timeout: 15_000,
  });
  await pinThroughUi(scene.ownerPage, 'vou apagar depois de fixar');
  await expect(scene.ownerPage.locator('.chat__pin-count')).toHaveText('1', { timeout: 15_000 });

  await scene.ownerPage
    .locator('.message', { hasText: 'vou apagar depois de fixar' })
    .first()
    .click({ button: 'right' });
  await scene.ownerPage
    .locator('.context-menu')
    .getByRole('menuitem', { name: 'Apagar mensagem' })
    .click();
  await scene.ownerPage.getByRole('button', { name: 'Apagar' }).click();
  await expect(scene.ownerPage.getByText('vou apagar depois de fixar')).toHaveCount(0, {
    timeout: 15_000,
  });

  // A fixada CONTINUA na lista (o denormalizado sobrevive), sem quebrar a tela.
  await scene.ownerPage.locator('.chat__pin-button').click();
  const dialog = scene.ownerPage.getByRole('dialog');
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  await expect(dialog.locator('.pinned-item')).toHaveCount(1);
  await expect(dialog.locator('.pinned-item__gone')).toHaveText('mensagem apagada');

  await scene.ownerContext.close();
  await scene.guestContext.close();
});

test('clicar numa fixada leva até a mensagem e destaca', async ({ browser }) => {
  test.setTimeout(90_000);
  const scene = await groupScene(browser, 'pin-jump');

  await sendMessageThroughUi(scene.ownerPage, 'mensagem alvo do pulo');
  await expect(scene.ownerPage.getByText('mensagem alvo do pulo').first()).toBeVisible({
    timeout: 15_000,
  });
  await pinThroughUi(scene.ownerPage, 'mensagem alvo do pulo');
  await expect(scene.ownerPage.locator('.chat__pin-count')).toHaveText('1', { timeout: 15_000 });

  await scene.ownerPage.locator('.chat__pin-button').click();
  const dialog = scene.ownerPage.getByRole('dialog');
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  await dialog.locator('.pinned-item--clickable').first().click();

  // Clicar fecha o painel (ver `onJumpTo` em app.ts) e destaca a mensagem original.
  await expect(dialog).toBeHidden({ timeout: 15_000 });
  await expect(
    scene.ownerPage.locator('.message.is-highlighted', { hasText: 'mensagem alvo do pulo' }),
  ).toBeVisible({ timeout: 15_000 });

  await scene.ownerContext.close();
  await scene.guestContext.close();
});

test('teto de 50 fixadas é respeitado, e com muitas a lista rola sem encolher item nenhum', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const scene = await groupScene(browser, 'pin-cap');

  // 50 fixadas semeadas por REST — rápido, e o conteúdo (mensagem inexistente)
  // não importa para este teste: é o TETO e a ROLAGEM que estão sendo provados.
  const seeds = Array.from({ length: 50 }, (_, i) =>
    putDocViaRest(scene.owner, `pinnedMessages/semente-${i}-${Date.now()}`, {
      groupId: scene.groupId,
      channelId: scene.channelId,
      messageId: `inexistente-${i}`,
      authorId: scene.owner.uid ?? '',
      authorName: scene.owner.displayName,
      kind: 'text',
      excerpt: `fixada número ${i}`,
      sentAt: new Date(Date.now() - i * 1000).toISOString(),
      pinnedAt: new Date(Date.now() - i * 1000).toISOString(),
      pinnedBy: scene.owner.uid ?? '',
    }),
  );
  for (const status of await Promise.all(seeds)) expect(status).toBe(200);

  await scene.ownerPage.reload();
  await expect(scene.ownerPage.locator('.chat__pin-count')).toHaveText('50', { timeout: 20_000 });

  // A 51ª: tentada pela TELA, e barrada — sem escrita nova no banco.
  await sendMessageThroughUi(scene.ownerPage, 'quinquagésima primeira');
  await expect(scene.ownerPage.getByText('quinquagésima primeira').first()).toBeVisible({
    timeout: 15_000,
  });
  await pinThroughUi(scene.ownerPage, 'quinquagésima primeira');
  await expect(scene.ownerPage.locator('.toast')).toBeVisible({ timeout: 10_000 });
  await expect(scene.ownerPage.locator('.chat__pin-count')).toHaveText('50');

  // A lista rola, e cada item mantém a própria altura — nenhum encolhe.
  await scene.ownerPage.locator('.chat__pin-button').click();
  const dialog = scene.ownerPage.getByRole('dialog');
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  const list = dialog.locator('.pinned-list');
  await expect(list.locator('.pinned-item')).toHaveCount(50);

  const heights = await list.locator('.pinned-item').evaluateAll((items) =>
    items.map((item) => item.getBoundingClientRect().height),
  );
  expect(heights.every((h) => h > 0)).toBe(true);
  // Encolhido seria uma altura muito menor que as vizinhas — todas próximas
  // da mediana é o sinal de "nenhum item minguou para caber".
  const media = heights.reduce((a, b) => a + b, 0) / heights.length;
  expect(heights.every((h) => h > media * 0.5)).toBe(true);

  const scrollable = await list.evaluate(
    (el) => el.scrollHeight > el.clientHeight,
  );
  expect(scrollable, 'com 50 itens a lista precisa rolar, não empurrar o painel inteiro').toBe(
    true,
  );

  await scene.ownerContext.close();
  await scene.guestContext.close();
});

test('o cartão de perfil do PV usa o tema padrão quando a pessoa não definiu nenhum (Entrega 3 ainda não existe)', async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const a = await signedIn(browser, 'pin-theme-a');
  const b = await signedIn(browser, 'pin-theme-b');
  await becomeFriends(a, b);

  await openDmWith(a.page, b.account.displayName);
  await expect(a.page.locator('.profile-card')).toBeVisible({ timeout: 15_000 });

  // Sem tema escolhido por B, o cartão não sobrescreve NADA: `--accent` nele
  // é IGUAL ao `--accent` do resto da tela (herda, não é um terceiro tema).
  const [cardAccent, rootAccent] = await a.page.evaluate(() => {
    const card = document.querySelector('.profile-card') as HTMLElement;
    return [
      getComputedStyle(card).getPropertyValue('--accent').trim(),
      getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
    ];
  });
  expect(cardAccent).toBe(rootAccent);

  await a.context.close();
  await b.context.close();
});
