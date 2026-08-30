import { expect, test } from '@playwright/test';
import type { Browser, BrowserContext, Page } from '@playwright/test';

import {
  createGroupThroughUi,
  limparTudo,
  newAccount,
  patchDocViaRest,
  putDocViaRest,
  readDocViaRest,
  resolveTokens,
  signUpThroughUi,
  usernameFor,
  USING_EMULATOR,
} from './helpers';
import type { TestAccount } from './helpers';

/**
 * Etapa 14, Entrega 1 — identidade, amizade e bloqueio.
 *
 * Tudo aqui depende de e-mail confirmado: as regras exigem `email_verified`
 * para reservar `@`, mandar pedido e criar grupo. `signUpThroughUi` já cuida
 * disso pela API de admin do emulador — ver `markEmailVerified` em helpers.
 */

const accounts: TestAccount[] = [];

function track(label: string): TestAccount {
  const account = newAccount(label);
  accounts.push(account);
  return account;
}

test.afterAll(async () => {
  await limparTudo(accounts, "friends — limpeza");
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

/** Abre a tela inicial e a aba pedida. */
async function openFriends(page: Page, tab: string): Promise<void> {
  await page.getByRole('button', { name: 'Tela inicial' }).click();
  await expect(page.locator('.friends')).toBeVisible({ timeout: 15_000 });
  await page.locator(`.friends__tab[data-tab="${tab}"]`).click();
}

test('dois usuários não conseguem tomar o mesmo @', async ({ browser }) => {
  test.setTimeout(90_000);
  const a = await signedIn(browser, 'nome-a');

  /*
   * O SEGUNDO tenta o `@` do primeiro pela REST, contornando a tela.
   *
   * A garantia não é do cliente: quem recusa é o SERVIDOR, no `create` de um
   * documento que já existe. Uma checagem de "já existe?" antes de escrever
   * sempre chega tarde numa corrida.
   */
  const b = track('nome-b');
  const contextB = await browser.newContext();
  const pageB = await contextB.newPage();
  await pageB.goto('/');
  await signUpThroughUi(pageB, b);
  await resolveTokens(b);

  const nomeDeA = usernameFor(a.account);

  /*
   * 409 (ALREADY_EXISTS), e não 403.
   *
   * `putDocViaRest` cria pela COLEÇÃO com `documentId`, que é create de
   * verdade. Para B a REGRA de create passaria — ele é verificado e o `uid` do
   * corpo é o dele —; quem recusa é a CHAVE PRIMÁRIA, porque o documento já
   * existe. É exatamente a garantia descrita acima: quem diz não é o servidor,
   * no create, e não uma checagem de "já existe?" que numa corrida chega tarde.
   *
   * Este teste já leu 403 aqui, mas por um motivo que não era este: a reserva
   * de A não estava acontecendo (o token do cliente ainda dizia
   * `email_verified: false`), o documento não existia, e o create de B era
   * simplesmente ACEITO — 200. Com a reserva funcionando, a resposta certa é a
   * colisão.
   */
  expect(
    await putDocViaRest(b, `usernames/${nomeDeA}`, { uid: b.uid ?? '' }),
    'o @ já reservado por outra pessoa não pode ser sobrescrito',
  ).toBe(409);

  // E a reserva continua apontando para o dono original.
  const reserva = await readDocViaRest(a.account, `usernames/${nomeDeA}`);
  expect(reserva.fields?.uid?.stringValue).toBe(a.account.uid);

  await a.context.close();
  await contextB.close();
});

test('pedido aparece em tempo real, aceitar cria a amizade dos dois lados', async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const a = await signedIn(browser, 'ped-a');
  const b = await signedIn(browser, 'ped-b');

  await openFriends(a.page, 'adicionar');
  await a.page.locator('.friends__input').fill(usernameFor(b.account));
  await a.page.locator('.friends__submit').click();
  await expect(a.page.locator('.friends__note')).toHaveText('Pedido enviado.', {
    timeout: 30_000,
  });

  // TEMPO REAL: sem recarregar, o outro lado vê o pedido chegar.
  await openFriends(b.page, 'pendentes');
  await expect(
    b.page.locator('.friends__group-title', { hasText: 'Recebidos' }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(b.page.getByText(`@${usernameFor(a.account)}`)).toBeVisible();

  /*
   * A NOTA DE A SOBREVIVE AO PRÓPRIO LISTENER.
   *
   * A não navegou para lugar nenhum desde o envio — ainda está na aba
   * "adicionar". Se o listener de amizades de A (que dispara quase na hora,
   * mais rápido que o de B: é a mesma escrita, no mesmo cliente) tivesse
   * remontado o formulário por baixo da resposta, `.friends__note` estaria
   * vazio bem antes deste ponto — e B já viu o pedido chegar, então o
   * listener de A com certeza já disparou.
   */
  await expect(a.page.locator('.friends__note')).toHaveText('Pedido enviado.');

  await b.page.getByRole('button', { name: 'Aceitar' }).click();

  // Amizade nos DOIS lados — é o mesmo documento, então não há como divergir.
  for (const lado of [a, b]) {
    await openFriends(lado.page, 'amigos');
    await expect(lado.page.locator('.friends__row')).toHaveCount(1, {
      timeout: 30_000,
    });
  }

  await a.context.close();
  await b.context.close();
});

test('pedidos cruzados viram amizade automática', async ({ browser }) => {
  test.setTimeout(90_000);
  const a = await signedIn(browser, 'cruz-a');
  const b = await signedIn(browser, 'cruz-b');

  await openFriends(a.page, 'adicionar');
  await a.page.locator('.friends__input').fill(usernameFor(b.account));
  await a.page.locator('.friends__submit').click();
  await expect(a.page.locator('.friends__note')).toHaveText('Pedido enviado.', {
    timeout: 30_000,
  });

  /*
   * B manda o pedido "de volta" sem saber do de A.
   *
   * Como a chave do documento é o PAR, os dois caem no mesmo lugar — e mandar
   * vira aceitar. Não é um caso especial no código: é consequência do formato
   * da chave.
   */
  await openFriends(b.page, 'adicionar');
  await b.page.locator('.friends__input').fill(usernameFor(a.account));
  await b.page.locator('.friends__submit').click();
  await expect(b.page.locator('.friends__note')).toHaveText(
    'Vocês agora são amigos.',
    { timeout: 30_000 },
  );

  await openFriends(a.page, 'amigos');
  await expect(a.page.locator('.friends__row')).toHaveCount(1, { timeout: 30_000 });

  await a.context.close();
  await b.context.close();
});

test('bloquear desfaz a amizade e impede pedido novo', async ({ browser }) => {
  test.setTimeout(90_000);
  const a = await signedIn(browser, 'blq-a');
  const b = await signedIn(browser, 'blq-b');

  // Vira amigos pelo caminho curto: A pede, B aceita.
  await openFriends(a.page, 'adicionar');
  await a.page.locator('.friends__input').fill(usernameFor(b.account));
  await a.page.locator('.friends__submit').click();
  await openFriends(b.page, 'pendentes');
  await b.page.getByRole('button', { name: 'Aceitar' }).click();

  await openFriends(a.page, 'amigos');
  await expect(a.page.locator('.friends__row')).toHaveCount(1, { timeout: 30_000 });

  // A bloqueia B.
  await a.page.getByRole('button', { name: 'Bloquear' }).click();
  await expect(a.page.locator('.friends__row')).toHaveCount(0, { timeout: 30_000 });

  await openFriends(a.page, 'bloqueados');
  await expect(a.page.locator('.friends__row')).toHaveCount(1, { timeout: 30_000 });

  // Do lado de B a amizade sumiu — e ele NÃO é avisado de nada.
  await openFriends(b.page, 'amigos');
  await expect(b.page.locator('.friends__row')).toHaveCount(0, { timeout: 30_000 });

  /*
   * E o pedido novo é recusado pelo BANCO, não pela tela: a regra de criar
   * consulta a lista de bloqueio, que o remetente não pode ler.
   */
  await openFriends(b.page, 'adicionar');
  await b.page.locator('.friends__input').fill(usernameFor(a.account));
  await b.page.locator('.friends__submit').click();
  await expect(b.page.locator('.friends__note--error')).toBeVisible({
    timeout: 30_000,
  });

  await a.context.close();
  await b.context.close();
});

test('a tela inicial não derruba a chamada de voz', async ({ browser }) => {
  test.setTimeout(90_000);
  const a = await signedIn(browser, 'home-voz');
  await createGroupThroughUi(a.page, 'Grupo Voz');

  await a.page
    .locator('.channels__body')
    .getByRole('button', { name: 'Sala Principal' })
    .click();
  await expect(a.page.locator('.room')).toBeVisible({ timeout: 30_000 });

  /*
   * A TESTEMUNHA é o contêiner de áudio do motor.
   *
   * `.room` é legitimamente reconstruída ao trocar de visão; o que não pode
   * acontecer é o MOTOR ser destruído — e ele vive fora da árvore de
   * componentes. Marcar o nó e conferir que é o mesmo depois é o que separa
   * "a tela mudou" de "a chamada caiu".
   */
  await a.page.locator('#voice-audio').waitFor({ state: 'attached', timeout: 30_000 });
  await a.page.evaluate(() => {
    document.querySelector('#voice-audio')?.setAttribute('data-marca', 'antes');
  });

  await a.page.getByRole('button', { name: 'Tela inicial' }).click();
  await expect(a.page.locator('.friends')).toBeVisible({ timeout: 15_000 });

  // A faixa de chamada continua visível na tela inicial — ponto de montagem 1.
  await expect(a.page.locator('.callbar')).toBeVisible({ timeout: 15_000 });

  const marca = await a.page.evaluate(
    () => document.querySelector('#voice-audio')?.getAttribute('data-marca') ?? null,
  );
  expect(marca, 'trocar de visão não pode destruir o motor de voz').toBe('antes');

  /*
   * Clicar na faixa, DA TELA INICIAL, tem que voltar para a sala — o mesmo
   * caminho que já funciona ao trocar de GRUPO (ver "a chamada sobrevive à
   * troca de GRUPO..." em loft.spec.ts). Provar só a faixa aparecer não basta:
   * uma faixa que aparece mas não volta a lugar nenhum é tão presa quanto uma
   * que nunca apareceu.
   */
  await a.page.locator('.callbar__back').click();
  await expect(a.page.locator('.room')).toBeVisible({ timeout: 15_000 });

  // De volta a um canal de TEXTO, ainda conectado: ponto de montagem 2, o
  // rodapé da coluna de canais no desktop.
  await a.page.locator('.channels__body').getByRole('button', { name: 'geral' }).click();
  await expect(a.page.locator('.callbar')).toBeVisible({ timeout: 15_000 });

  /*
   * Atravessar o breakpoint no meio da chamada não derruba nada (ver
   * lib/layout.ts) — só o CSS muda de ideia sobre onde a faixa mora. Ponto de
   * montagem 3: acima do composer, no mobile.
   */
  await a.page.setViewportSize({ width: 375, height: 800 });
  await expect(a.page.locator('.callbar')).toHaveClass(/callbar--mobile/);

  await a.context.close();
});

test('as REGRAS protegem amizade, bloqueio e @ contra REST cru', async ({
  browser,
}) => {
  test.setTimeout(90_000);
  expect(USING_EMULATOR, 'este teste é do emulador').toBe(true);

  const a = await signedIn(browser, 'reg-a');
  const b = await signedIn(browser, 'reg-b');
  const c = await signedIn(browser, 'reg-c');

  const uidA = a.account.uid ?? '';
  const uidB = b.account.uid ?? '';
  const par = uidA < uidB ? `${uidA}_${uidB}` : `${uidB}_${uidA}`;

  // A manda pedido para B, pela tela.
  await openFriends(a.page, 'adicionar');
  await a.page.locator('.friends__input').fill(usernameFor(b.account));
  await a.page.locator('.friends__submit').click();
  await expect(a.page.locator('.friends__note')).toHaveText('Pedido enviado.', {
    timeout: 30_000,
  });

  // C não lê o vínculo entre A e B.
  const leituraDeC = await readDocViaRest(c.account, `friendships/${par}`);
  expect(
    leituraDeC.status,
    'ninguém lê a lista de amigos de outra pessoa',
  ).toBe(403);

  // C não aceita um pedido endereçado a B.
  expect(
    await patchDocViaRest(c.account, `friendships/${par}`, { status: 'accepted' }),
    'só quem RECEBEU aceita o pedido',
  ).toBe(403);

  // Nem o próprio remetente aceita o que mandou.
  expect(
    await patchDocViaRest(a.account, `friendships/${par}`, { status: 'accepted' }),
    'quem enviou não pode aceitar o próprio pedido',
  ).toBe(403);

  // C não se adiciona como amigo de B forjando um vínculo aceito.
  const uidC = c.account.uid ?? '';
  const parCB = uidC < uidB ? `${uidC}_${uidB}` : `${uidB}_${uidC}`;
  expect(
    await putDocViaRest(c.account, `friendships/${parCB}`, {
      from: uidC,
      to: uidB,
      status: 'accepted',
    }),
    'ninguém se adiciona à lista de amigos de outro',
  ).toBe(403);

  await a.context.close();
  await b.context.close();
  await c.context.close();
});
