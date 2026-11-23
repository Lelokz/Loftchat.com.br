import { expect, test } from '@playwright/test';

import { createGroupThroughUi, limparTudo, newAccount, sendMessageThroughUi, signUpThroughUi } from './helpers';
import type { TestAccount } from './helpers';

/**
 * EMOJIS (0.5.0): o botão do adesivo abre Emojis | Figurinhas | GIFs; as
 * categorias, a busca em português, o tom de pele, os recentes e o emoji
 * entrando onde está o cursor.
 */

const accounts: TestAccount[] = [];
test.afterAll(async () => {
  await limparTudo(accounts, 'emojis — limpeza');
});

test('emojis: painel, categorias, busca, tom de pele e recentes', async ({ page }) => {
  const conta = newAccount('Emojis');
  accounts.push(conta);
  await page.goto('/');
  await signUpThroughUi(page, conta);
  await createGroupThroughUi(page, 'Grupo dos emojis');

  const campo = page.locator('.composer__input');
  const botao = page.getByRole('button', { name: 'Emojis e figurinhas' });
  const painel = page.getByRole('dialog', { name: 'Emojis e figurinhas' });

  await campo.fill('oi ');
  await botao.click();
  await expect(painel).toBeVisible();
  await expect(painel.getByRole('tab', { name: 'Emojis' })).toHaveAttribute('aria-selected', 'true');
  await expect(painel.getByRole('tab', { name: /GIFs/ })).toBeDisabled();
  // Todas as categorias na coluna do lado.
  for (const nome of ['Rostos e emoções', 'Pessoas e corpo', 'Animais e natureza', 'Comida e bebida', 'Bandeiras']) {
    await expect(painel.locator(`.painel__trilho button[title="${nome}"]`)).toBeVisible();
  }
  await expect(painel.locator('[data-secao="rostos"] .painel__emoji').first()).toBeVisible({ timeout: 15_000 });
  await page.screenshot({ path: 'test-results/emojis/pc.png' });

  // Clicar põe no campo, onde está o cursor.
  await painel.locator('[data-emoji="😀"]').first().click();
  await expect(campo).toHaveValue('oi 😀');

  // Categoria pela coluna do lado.
  await painel.locator('.painel__trilho button[title="Comida e bebida"]').click();
  await expect(painel.locator('.painel__trilho button[title="Comida e bebida"]')).toHaveClass(/is-active/);

  // Busca em português, sem acento.
  await painel.getByRole('searchbox', { name: 'Buscar emoji' }).fill('coracao');
  await expect(painel.locator('[data-secao="busca"] [data-emoji="❤️"]')).toBeVisible();
  await painel.getByRole('searchbox', { name: 'Buscar emoji' }).fill('');

  // Tom de pele: os emojis de mão mudam.
  await painel.getByRole('button', { name: 'Tom de pele' }).click();
  await painel.locator('.painel__tons button').nth(3).click();
  await expect(painel.locator('[data-emoji="👋🏽"]').first()).toBeVisible();

  // Recentes: o 😀 usado aparece no topo, e Esc fecha.
  await page.keyboard.press('Escape');
  await expect(painel).toBeHidden();
  await botao.click();
  await expect(painel.locator('[data-secao="recentes"] [data-emoji="😀"]')).toBeVisible();
  await page.keyboard.press('Escape');

  // Manda: o emoji vai na mensagem.
  await sendMessageThroughUi(page, 'oi 😀 tudo bem?');
  await expect(page.locator('.message__text', { hasText: 'oi 😀 tudo bem?' })).toBeVisible();
  // A fonte dos emojis é a Noto, embutida.
  expect(await page.evaluate(() => document.fonts.check('16px "Noto Color Emoji"', '😀'))).toBe(true);
});

test('emojis no celular: o painel sobe de baixo na largura toda', async ({ browser }) => {
  const conta = newAccount('Emojis cel');
  accounts.push(conta);
  const contexto = await browser.newContext({ viewport: { width: 393, height: 851 }, deviceScaleFactor: 2.75, isMobile: true, hasTouch: true });
  const page = await contexto.newPage();
  await page.goto('/');
  await signUpThroughUi(page, conta);
  await createGroupThroughUi(page, 'Grupo cel');
  await page.getByRole('button', { name: 'Emojis e figurinhas' }).click();
  const painel = page.getByRole('dialog', { name: 'Emojis e figurinhas' });
  await expect(painel.locator('[data-secao="rostos"] .painel__emoji').first()).toBeVisible({ timeout: 15_000 });
  const caixa = await painel.boundingBox();
  expect(caixa!.width).toBeGreaterThan(380);
  await page.screenshot({ path: 'test-results/emojis/celular.png' });
  await contexto.close();
});
