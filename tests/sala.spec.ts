import { expect, test } from '@playwright/test';

import {
  activeGroupId,
  createAccountViaRest,
  createGroupThroughUi,
  joinGroupViaRest,
  limparTudo,
  newAccount,
  patchDocRawViaRest,
  resolveTokens,
  signUpThroughUi,
  writeVoiceParticipant,
} from './helpers';
import type { TestAccount } from './helpers';

/**
 * Proposta A, etapa 8a — o jeito da sala de voz: sem transmissão, as pessoas
 * em grade (nada de palco vazio); com transmissão, a tela no palco e a fila de
 * pessoas embaixo, ou tudo em grade; relógio da chamada no cabeçalho.
 */

const accounts: TestAccount[] = [];

test.afterAll(async () => {
  await limparTudo(accounts, 'sala — limpeza');
});

test('sala: grade sem transmissão, palco + fila com transmissão, trocar para grade, relógio', async ({ browser }) => {
  test.setTimeout(150_000);
  const eu = newAccount('Sala');
  accounts.push(eu);
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await page.goto('/');
  await signUpThroughUi(page, eu);
  await resolveTokens(eu);
  await createGroupThroughUi(page, 'Voz');
  const groupId = await activeGroupId(page);

  await page.getByRole('button', { name: 'Opções do grupo' }).click();
  await page.getByRole('menuitem', { name: 'Convidar pessoas' }).click();
  const link = page.locator('.modal__link');
  await expect(link).toBeVisible({ timeout: 30_000 });
  const codigo = new URL(await link.inputValue()).pathname.split('/').pop() ?? '';
  await page.getByRole('button', { name: 'Fechar' }).first().click();

  // Sozinho: grade com um bloco, sem palco, sem botão de câmera, com relógio.
  await page.getByRole('button', { name: 'Sala Principal' }).click();
  await expect(page.locator('.room__title')).toHaveText('Sala Principal');
  await expect(page.locator('.room__people--grade .room__person')).toHaveCount(1, { timeout: 30_000 });
  await expect(page.locator('.room__stage')).toHaveCount(0);
  await expect(page.locator('.room__count')).toHaveText('só você');
  await expect(page.locator('.room [title="Câmera ainda não implementada"]')).toHaveCount(0);
  await expect(page.locator('.room__clock')).toHaveText(/^· \d+:\d\d$/);
  const antes = await page.locator('.room__clock').textContent();
  await expect.poll(() => page.locator('.room__clock').textContent(), { timeout: 5_000 }).not.toBe(antes);
  // Sem transmissão não tem o botão de palco/grade.
  await expect(page.getByRole('button', { name: 'Ver todos em grade' })).toHaveCount(0);

  // A Ana entra transmitindo: palco grande + fila de pessoas embaixo.
  const ana = newAccount('Ana');
  accounts.push(ana);
  await createAccountViaRest(ana);
  await patchDocRawViaRest(ana, `users/${ana.uid}`, { displayName: { stringValue: 'Ana Souza' } });
  expect(await joinGroupViaRest(ana, groupId, codigo)).toBe(200);
  const canal = await page.locator('.channel', { hasText: 'Sala Principal' }).first().getAttribute('data-channel-id');
  expect(await writeVoiceParticipant(ana, { channelId: canal!, groupId, lastSeenMsAgo: 0, sharingScreen: true })).toBe(200);

  await expect(page.locator('.room__stage')).toHaveCount(1, { timeout: 30_000 });
  await expect(page.locator('.room__people--fila .room__person')).toHaveCount(2);
  await expect(page.locator('.room__count')).toHaveText('2 pessoas');
  const palco = (await page.locator('.room__stage').boundingBox())!;
  const bloco = (await page.locator('.room__people--fila .room__person').first().boundingBox())!;
  expect(palco.width).toBeGreaterThan(bloco.width * 3);

  // Trocar para grade: a tela vira um bloco do lado das pessoas.
  await page.getByRole('button', { name: 'Ver todos em grade' }).click();
  await expect(page.locator('.room__stage')).toHaveCount(0);
  await expect(page.locator('.room__people--grade .room__tile-tela')).toHaveCount(1);
  await expect(page.locator('.room__people--grade .room__person')).toHaveCount(2);
  await page.getByRole('button', { name: 'Ver a tela em destaque' }).click();
  await expect(page.locator('.room__stage')).toHaveCount(1);
  await page.context().close();
});
