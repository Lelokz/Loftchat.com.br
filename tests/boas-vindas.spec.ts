import { expect, test } from '@playwright/test';

import {
  createGroupThroughUi,
  limparTudo,
  newAccount,
  patchDocViaRest,
  readDocViaRest,
  resolveTokens,
  signUpFromInviteUi,
  signUpThroughUi,
} from './helpers';
import type { TestAccount } from './helpers';

/**
 * Proposta A, etapa 3c — boas-vindas: o dono escreve; quem entra vê o
 * cartão no topo do chat até "Entendi", e isso fica guardado na conta.
 */

const accounts: TestAccount[] = [];

test.afterAll(async () => {
  await limparTudo(accounts, 'boas-vindas — limpeza');
});

test('o dono escreve as boas-vindas; quem entra vê até "Entendi", e não volta depois de recarregar', async ({
  browser,
}) => {
  test.setTimeout(150_000);
  const dono = newAccount('Dono boas');
  const novato = newAccount('Novato boas');
  accounts.push(dono, novato);

  const pDono = await (await browser.newContext()).newPage();
  await pDono.goto('/');
  await signUpThroughUi(pDono, dono);
  await resolveTokens(dono);
  await createGroupThroughUi(pDono, 'Grupo boas');

  await pDono.getByRole('button', { name: 'Opções do grupo' }).click();
  await pDono.getByRole('menuitem', { name: 'Configurações do grupo' }).click();
  const tela = pDono.getByRole('dialog', { name: 'Configurações do grupo' });
  await expect(tela.getByLabel('Nome do grupo')).toBeVisible({ timeout: 15_000 });
  await tela.getByRole('button', { name: 'Boas-vindas' }).click();
  await tela.getByLabel('Texto de boas-vindas').fill('Leia o #anúncios.\nPartida toda sexta às 20h.');
  // A prévia mostra o cartão como quem entra vai ver.
  const previa = tela.locator('.settings__preview .welcome-card');
  await expect(previa.locator('.welcome-card__title')).toHaveText('Boas-vindas a Grupo boas!');
  await expect(previa.locator('.welcome-card__text')).toHaveText('Leia o #anúncios.\nPartida toda sexta às 20h.');
  await tela.getByRole('button', { name: 'Salvar' }).click();
  await expect(tela.getByRole('region', { name: 'Alterações não salvas' })).toBeHidden({ timeout: 15_000 });
  await pDono.keyboard.press('Escape');

  // O dono não vê o próprio cartão.
  await expect(pDono.locator('.chat .welcome-card')).toHaveCount(0);

  await pDono.getByRole('button', { name: 'Opções do grupo' }).click();
  await pDono.getByRole('menuitem', { name: 'Convidar pessoas' }).click();
  const link = pDono.locator('.modal__link');
  await expect(link).toBeVisible({ timeout: 30_000 });
  const convite = new URL(await link.inputValue()).pathname;
  await pDono.getByRole('button', { name: 'Fechar' }).first().click();

  // --- quem entra ---
  const pNovo = await (await browser.newContext()).newPage();
  await pNovo.goto(convite);
  await signUpFromInviteUi(pNovo, novato);
  await resolveTokens(novato);
  await pNovo.getByRole('button', { name: 'Entrar no grupo' }).click({ timeout: 30_000 });
  const cartao = pNovo.getByRole('region', { name: 'Boas-vindas a Grupo boas' });
  await expect(cartao).toBeVisible({ timeout: 30_000 });
  await expect(cartao.locator('.welcome-card__text')).toHaveText('Leia o #anúncios.\nPartida toda sexta às 20h.');
  // Não é pop-up: a caixa de mensagem continua usável.
  await expect(pNovo.getByRole('dialog')).toHaveCount(0);
  await expect(pNovo.locator('.composer__input')).toBeEditable();

  await cartao.getByRole('button', { name: 'Entendi' }).click();
  await expect(cartao).toBeHidden();
  await expect(pNovo.locator('.composer__input')).toBeFocused();

  // Guardado na conta: recarregar não traz de volta.
  await expect
    .poll(async () => (await readDocViaRest(novato, `userPrivate/${novato.uid}`)).fields?.['welcomeSeen']?.mapValue?.fields)
    .toBeTruthy();
  await pNovo.goto('/');
  await expect(pNovo.locator('.channels__group-name')).toHaveText('Grupo boas', { timeout: 30_000 });
  await expect(pNovo.locator('.chat .welcome-card')).toHaveCount(0);

  // --- regra ---
  const grupoId = await pDono.locator('.group-bar__tab.is-active').getAttribute('data-group-id');
  expect(await patchDocViaRest(dono, `groups/${grupoId}`, { welcome: 'x'.repeat(501) })).toBe(403);
  expect(await patchDocViaRest(novato, `groups/${grupoId}`, { welcome: 'invadido' })).toBe(403);
  // O "já vi" é privado: o dono não lê o do novato.
  expect((await readDocViaRest(dono, `userPrivate/${novato.uid}`)).status).toBe(403);

  await pDono.context().close();
  await pNovo.context().close();
});
