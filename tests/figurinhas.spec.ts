import { expect, test } from '@playwright/test';

import { activeGroupId, createGroupThroughUi, limparTudo, newAccount, resolveTokens, signUpThroughUi } from './helpers';
import type { TestAccount } from './helpers';
import { comoDono, FS, lerComoDono, ligarCarteiroLocal } from './carteiro-local';

/**
 * FIGURINHAS (0.5.0): criar pelo Loftchat (formatos + ajustador), Recentes
 * em cima e Favoritas embaixo com "+ Criar figurinha" SEMPRE primeiro,
 * mandar (pequena, sem balão), favoritar a de outra pessoa, tirar das
 * favoritas, e a regra do banco.
 */

const accounts: TestAccount[] = [];
let desligar: (() => void) | undefined;
test.describe.configure({ mode: 'serial' });
test.skip(process.env['FIRESTORE_EMULATOR_HOST'] === undefined, 'só no emulador');
test.beforeAll(async () => {
  test.setTimeout(90_000);
  desligar = await ligarCarteiroLocal();
});
test.afterAll(async () => {
  desligar?.();
  await limparTudo(accounts, 'figurinhas — limpeza');
});

test('figurinhas: criar, mandar, recentes, favoritar a de outro e tirar', async ({ browser }) => {
  test.setTimeout(240_000);
  const ana = newAccount('Ana fig');
  const beto = newAccount('Beto fig');
  accounts.push(ana, beto);

  const cAna = await browser.newContext();
  const pAna = await cAna.newPage();
  await pAna.goto('/');
  await signUpThroughUi(pAna, ana);
  await createGroupThroughUi(pAna, 'Grupo das figurinhas');
  const grupo = await activeGroupId(pAna);
  const foto = await pAna.screenshot();

  const painel = pAna.getByRole('dialog', { name: 'Emojis e figurinhas' });
  await pAna.getByRole('button', { name: 'Emojis e figurinhas' }).click();
  await painel.getByRole('tab', { name: 'Figurinhas' }).click();
  // Recentes em cima, Favoritas embaixo; o 1º das Favoritas é o Criar.
  const secoes = painel.locator('.painel__secao h3');
  await expect(secoes).toHaveText(['Recentes', 'Favoritas']);
  await expect(painel.getByText('As figurinhas que você mandar aparecem aqui.')).toBeVisible();
  const favoritas = painel.locator('[data-secao="favoritas"] .figurinhas__grade > *');
  await expect(favoritas.first()).toHaveText(/Criar figurinha/);

  // Criar: escolhe a imagem, formato círculo, salva.
  const escolha = pAna.waitForEvent('filechooser');
  await painel.getByRole('button', { name: /Criar figurinha/ }).click();
  await (await escolha).setFiles({ name: 'foto.png', mimeType: 'image/png', buffer: foto });
  const criador = pAna.getByRole('dialog', { name: 'Criar figurinha' });
  await expect(criador).toBeVisible();
  for (const forma of ['Quadrado', 'Retângulo', 'Círculo', 'Original']) {
    await expect(criador.getByRole('button', { name: forma, exact: true })).toBeVisible();
  }
  await criador.getByRole('button', { name: 'Círculo', exact: true }).click();
  await expect(criador.getByRole('button', { name: 'Círculo', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await pAna.screenshot({ path: 'test-results/figurinhas/criador.png' });
  await criador.getByRole('button', { name: 'Salvar figurinha' }).click();
  await expect(criador).toBeHidden({ timeout: 30_000 });
  await expect(favoritas).toHaveCount(2, { timeout: 15_000 });
  await expect(favoritas.first()).toHaveText(/Criar figurinha/);

  // Formato original: inteira, sem recorte (1280×720 → 512×288).
  const escolha2 = pAna.waitForEvent('filechooser');
  await painel.getByRole('button', { name: /Criar figurinha/ }).click();
  await (await escolha2).setFiles({ name: 'foto.png', mimeType: 'image/png', buffer: foto });
  await criador.getByRole('button', { name: 'Original', exact: true }).click();
  await criador.getByRole('button', { name: 'Salvar figurinha' }).click();
  await expect(criador).toBeHidden({ timeout: 30_000 });
  await expect(favoritas).toHaveCount(3, { timeout: 15_000 });
  await resolveTokens(ana);
  const docAna = await lerComoDono(`figurinhas/${ana.uid}`);
  const lista = (docAna!['favoritas']!['arrayValue'] as { values: { mapValue: { fields: Record<string, { integerValue?: string }> } }[] }).values;
  // A mais nova vem primeiro.
  expect(Number(lista[0]!.mapValue.fields['largura']!.integerValue)).toBe(512);
  expect(Number(lista[0]!.mapValue.fields['altura']!.integerValue)).toBe(288);
  await pAna.screenshot({ path: 'test-results/figurinhas/painel.png' });

  // Mandar a do círculo (a 2ª favorita): vai pequena, sem balão, e o painel fecha.
  await favoritas.nth(2).click();
  await expect(painel).toBeHidden();
  const figNoChat = pAna.locator('.message--figurinha img.figurinha');
  await expect(figNoChat).toBeVisible({ timeout: 30_000 });
  const caixa = await figNoChat.boundingBox();
  expect(caixa!.width).toBeLessThanOrEqual(160);
  await pAna.screenshot({ path: 'test-results/figurinhas/chat.png' });
  // Entrou nas recentes.
  await pAna.getByRole('button', { name: 'Emojis e figurinhas' }).click();
  await expect(painel.locator('[data-secao="recentes"] [data-figurinha]')).toHaveCount(1);
  await pAna.keyboard.press('Escape');

  // O Beto vê e favorita pelo botão direito.
  const cBeto = await browser.newContext();
  const pBeto = await cBeto.newPage();
  await pBeto.goto('/');
  await signUpThroughUi(pBeto, beto);
  await resolveTokens(beto);
  await comoDono(`memberships/${grupo}_${beto.uid}`, { groupId: grupo, memberId: beto.uid!, role: 'member' });
  await pBeto.reload();
  await pBeto.locator(`.group-bar__button[data-group-id="${grupo}"]`).click();
  const figBeto = pBeto.locator('.message--figurinha img.figurinha');
  await expect(figBeto).toBeVisible({ timeout: 30_000 });
  await figBeto.click({ button: 'right' });
  await pBeto.getByRole('menuitem', { name: 'Favoritar figurinha' }).click();
  await expect(pBeto.getByText('Figurinha nas favoritas.')).toBeVisible();
  await pBeto.getByRole('button', { name: 'Emojis e figurinhas' }).click();
  const painelBeto = pBeto.getByRole('dialog', { name: 'Emojis e figurinhas' });
  await painelBeto.getByRole('tab', { name: 'Figurinhas' }).click();
  const favBeto = painelBeto.locator('[data-secao="favoritas"] .figurinhas__grade > *');
  await expect(favBeto).toHaveCount(2);
  // Tirar: Editar → ✕.
  await painelBeto.getByRole('button', { name: 'Editar' }).click();
  await painelBeto.getByRole('button', { name: 'Tirar das favoritas' }).click();
  await expect(favBeto).toHaveCount(1);
  await expect(favBeto.first()).toHaveText(/Criar figurinha/);

  // Regra: ninguém lê as figurinhas de outra pessoa.
  const status = await fetch(`${FS}/figurinhas/${ana.uid}`, { headers: { authorization: `Bearer ${beto.idToken}` } }).then((r) => r.status);
  expect(status).toBe(403);

  await cAna.close();
  await cBeto.close();
});

test('figurinhas no celular: painel e criador cabem na tela', async ({ browser }) => {
  const conta = newAccount('Fig cel');
  accounts.push(conta);
  const ctx = await browser.newContext({ viewport: { width: 360, height: 780 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto('/');
  await signUpThroughUi(page, conta);
  await createGroupThroughUi(page, 'Grupo fig cel');
  const foto = await page.screenshot();
  await page.getByRole('button', { name: 'Emojis e figurinhas' }).click();
  const painel = page.getByRole('dialog', { name: 'Emojis e figurinhas' });
  await painel.getByRole('tab', { name: 'Figurinhas' }).click();
  await page.screenshot({ path: 'test-results/figurinhas/celular-painel.png' });
  const escolha = page.waitForEvent('filechooser');
  await painel.getByRole('button', { name: /Criar figurinha/ }).click();
  await (await escolha).setFiles({ name: 'foto.png', mimeType: 'image/png', buffer: foto });
  const criador = page.getByRole('dialog', { name: 'Criar figurinha' });
  await expect(criador).toBeVisible();
  const palco = await criador.locator('.criador__palco').boundingBox();
  expect(palco!.x).toBeGreaterThanOrEqual(0);
  expect(palco!.x + palco!.width).toBeLessThanOrEqual(360);
  await expect(criador.getByRole('button', { name: 'Salvar figurinha' })).toBeInViewport();
  await page.screenshot({ path: 'test-results/figurinhas/celular-criador.png' });
  await ctx.close();
});
