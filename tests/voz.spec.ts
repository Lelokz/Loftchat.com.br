import { expect, test } from '@playwright/test';

import { activeGroupId, createGroupThroughUi, limparTudo, newAccount, resolveTokens, signUpThroughUi } from './helpers';
import type { TestAccount } from './helpers';
import { comoDono, lerComoDono, ligarCarteiroLocal } from './carteiro-local';

/**
 * MENSAGEM DE VOZ (0.5.5): o Enviar vira microfone com o campo vazio; gravar
 * (microfone falso do Chromium, que bipa — o som sai mudo), jogar fora,
 * mandar, e o outro ouvir: ▶/⏸, tempo, velocidade, pular nas ondas, e o
 * áudio NÃO para quando chega mensagem nova.
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
  await limparTudo(accounts, 'voz — limpeza');
});

test('voz: gravar, jogar fora, mandar e o outro ouvir', async ({ browser }) => {
  test.setTimeout(240_000);
  const ana = newAccount('Ana voz');
  const beto = newAccount('Beto voz');
  accounts.push(ana, beto);

  const cAna = await browser.newContext({ permissions: ['microphone'] });
  const pAna = await cAna.newPage();
  await pAna.goto('/');
  await signUpThroughUi(pAna, ana);
  await createGroupThroughUi(pAna, 'Grupo da voz');
  const grupo = await activeGroupId(pAna);

  // Campo vazio: microfone. Com texto: Enviar.
  const input = pAna.getByPlaceholder(/Mensagem/);
  const mic = pAna.getByRole('button', { name: 'Gravar mensagem de voz' });
  await expect(mic).toBeVisible();
  await input.fill('oi');
  await expect(mic).toBeHidden();
  await expect(pAna.getByRole('button', { name: 'Enviar', exact: true })).toBeVisible();
  await input.fill('');
  await expect(mic).toBeVisible();

  // Gravar e jogar fora (Esc): nada é mandado.
  await mic.click();
  const barra = pAna.getByRole('status', { name: 'Gravando mensagem de voz' });
  await expect(barra).toBeVisible();
  await expect(barra.locator('.gravando-voz__tempo')).toHaveText('0:01', { timeout: 5000 });
  await expect(barra.locator('.gravando-voz__ondas i').first()).toBeAttached();
  await pAna.screenshot({ path: 'test-results/voz/gravando.png' });
  await pAna.keyboard.press('Escape');
  await expect(barra).toBeHidden();
  await expect(mic).toBeVisible();
  await expect(pAna.locator('.voz')).toHaveCount(0);

  // Curto demais: avisa e não manda.
  await mic.click();
  await expect(barra).toBeVisible();
  await pAna.getByRole('button', { name: 'Mandar mensagem de voz' }).click();
  await expect(pAna.getByText(/Áudio curto demais/)).toBeVisible();
  await expect(pAna.locator('.voz')).toHaveCount(0);

  // Gravar ~4 s e mandar pela lixeira… não: pelo ➤.
  await mic.click();
  await expect(barra.locator('.gravando-voz__tempo')).toHaveText('0:04', { timeout: 8000 });
  await pAna.getByRole('button', { name: 'Mandar mensagem de voz' }).click();
  const vozAna = pAna.locator('.message .voz');
  await expect(vozAna).toHaveCount(1, { timeout: 30_000 });
  await expect(vozAna.locator('.voz__tempo')).toHaveText(/^0:0[45]$/);
  await pAna.screenshot({ path: 'test-results/voz/mandada.png' });

  // No banco: tipo áudio, duração e as 48 ondas (com som de verdade, não zeradas).
  const id = await pAna.locator('.message:has(.voz)').getAttribute('data-message-id');
  await resolveTokens(ana);
  const doc = await lerComoDono(`messages/${id}`);
  expect(doc!['kind']!['stringValue']).toBe('audio');
  const anexo = (doc!['attachment']!['mapValue'] as { fields: Record<string, Record<string, unknown>> }).fields;
  expect(Number(anexo['durationMs']!['integerValue'])).toBeGreaterThan(3500);
  expect(String(anexo['mimeType']!['stringValue'])).toMatch(/^audio\//);
  const ondas = (anexo['ondas']!['arrayValue'] as { values: { integerValue: string }[] }).values.map((v) => Number(v.integerValue));
  expect(ondas).toHaveLength(48);
  expect(Math.max(...ondas)).toBeGreaterThan(0);

  // O Beto ouve.
  const cBeto = await browser.newContext();
  const pBeto = await cBeto.newPage();
  await pBeto.goto('/');
  await signUpThroughUi(pBeto, beto);
  await resolveTokens(beto);
  await comoDono(`memberships/${grupo}_${beto.uid}`, { groupId: grupo, memberId: beto.uid!, role: 'member' });
  await pBeto.reload();
  await pBeto.locator(`.group-bar__button[data-group-id="${grupo}"]`).click();
  const voz = pBeto.locator('.message .voz');
  await expect(voz).toBeVisible({ timeout: 30_000 });
  const vel = voz.locator('.voz__vel');
  await expect(vel).toBeHidden();
  await voz.getByRole('button', { name: 'Tocar mensagem de voz' }).click();
  await expect(voz.getByRole('button', { name: 'Pausar' })).toBeVisible();
  await expect(voz.locator('.voz__tempo')).toHaveText(/^0:0\d \/ 0:0[45]$/);
  await expect(vel).toBeVisible();
  await vel.click();
  await expect(vel).toHaveText('1,5x');
  await expect.poll(() => pBeto.evaluate(() => document.querySelectorAll('.voz__ondas i.ja').length)).toBeGreaterThan(0);
  await pBeto.screenshot({ path: 'test-results/voz/tocando.png' });

  // Chega mensagem nova enquanto toca: a lista é refeita, o áudio continua.
  await pAna.getByPlaceholder(/Mensagem/).fill('ouviu?');
  await pAna.getByPlaceholder(/Mensagem/).press('Enter');
  await expect(pBeto.getByText('ouviu?')).toBeVisible();
  await expect(voz.getByRole('button', { name: 'Pausar' })).toBeVisible();

  // Termina sozinho e volta ao ▶.
  await expect(voz.getByRole('button', { name: 'Tocar mensagem de voz' })).toBeVisible({ timeout: 15_000 });

  // Pular: clicar no fim das ondas começa de lá.
  const trilha = voz.locator('.voz__ondas');
  const caixa = (await trilha.boundingBox())!;
  await pBeto.mouse.click(caixa.x + caixa.width * 0.75, caixa.y + caixa.height / 2);
  await expect.poll(() => pBeto.evaluate(() => document.querySelectorAll('.voz__ondas i.ja').length)).toBeGreaterThanOrEqual(18);
  await expect(voz.getByRole('button', { name: 'Tocar mensagem de voz' })).toBeVisible({ timeout: 15_000 });

  await cAna.close();
  await cBeto.close();
});

test('voz no celular: gravação e balão cabem na tela', async ({ browser }) => {
  test.setTimeout(120_000);
  const conta = newAccount('Voz cel');
  accounts.push(conta);
  const ctx = await browser.newContext({
    viewport: { width: 360, height: 780 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    permissions: ['microphone'],
  });
  const page = await ctx.newPage();
  await page.goto('/');
  await signUpThroughUi(page, conta);
  await createGroupThroughUi(page, 'Grupo voz cel');
  await page.getByRole('button', { name: 'Gravar mensagem de voz' }).click();
  const barra = page.getByRole('status', { name: 'Gravando mensagem de voz' });
  await expect(barra.locator('.gravando-voz__tempo')).toHaveText('0:02', { timeout: 6000 });
  await expect(barra.locator('.gravando-voz__dica')).toBeHidden();
  const enviar = page.getByRole('button', { name: 'Mandar mensagem de voz' });
  await expect(enviar).toBeInViewport();
  await page.screenshot({ path: 'test-results/voz/celular-gravando.png' });
  await enviar.click();
  const voz = page.locator('.message .voz');
  await expect(voz).toBeVisible({ timeout: 30_000 });
  const c = (await voz.boundingBox())!;
  expect(c.x).toBeGreaterThanOrEqual(0);
  expect(c.x + c.width).toBeLessThanOrEqual(360);
  await page.screenshot({ path: 'test-results/voz/celular-mandada.png' });
  // Tocando (com a velocidade aparecendo): continua dentro do balão e da tela.
  await voz.getByRole('button', { name: 'Tocar mensagem de voz' }).click();
  await expect(voz.locator('.voz__vel')).toBeVisible();
  for (const parte of ['.voz__tempo', '.voz__vel']) {
    const p = (await voz.locator(parte).boundingBox())!;
    expect(p.x + p.width).toBeLessThanOrEqual(360);
  }
  await page.screenshot({ path: 'test-results/voz/celular-tocando.png' });
  await ctx.close();
});
