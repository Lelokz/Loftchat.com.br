import { expect, test } from '@playwright/test';

import { createGroupThroughUi, limparTudo, newAccount, resolveTokens, signUpThroughUi } from './helpers';
import type { TestAccount } from './helpers';

/**
 * Proposta A, etapa 8c — Configurações → Voz e áudio: escolher microfone e
 * saída, testar o microfone pela barra (sem tocar nada de volta), ligar e
 * desligar os filtros; com a chamada aberta, o motor pede o microfone de novo
 * com o aparelho e os filtros escolhidos, sem sair da sala.
 *
 * O navegador de teste usa microfone FALSO (um bipe) e som mudo — ver
 * playwright.config.ts.
 */

const accounts: TestAccount[] = [];

test.afterAll(async () => {
  await limparTudo(accounts, 'voz e áudio — limpeza');
});

test('voz e áudio: engrenagem da sala, aparelhos, barra do teste, filtros e troca ao vivo', async ({ browser }) => {
  test.setTimeout(150_000);
  const eu = newAccount('Voz');
  accounts.push(eu);
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  // Anota cada pedido de microfone: é como o teste vê o motor trocar o aparelho.
  await page.addInitScript(() => {
    const w = window as unknown as { __pedidos: unknown[] };
    w.__pedidos = [];
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = (c?: MediaStreamConstraints) => {
      w.__pedidos.push(JSON.parse(JSON.stringify(c ?? {})));
      return original(c);
    };
  });
  const pedidos = () => page.evaluate(() => (window as unknown as { __pedidos: Array<{ audio?: Record<string, unknown> }> }).__pedidos);

  await page.goto('/');
  await signUpThroughUi(page, eu);
  await resolveTokens(eu);
  await createGroupThroughUi(page, 'Voz');

  await page.getByRole('button', { name: 'Sala Principal' }).click();
  await expect(page.locator('.room__title')).toHaveText('Sala Principal');
  await expect.poll(async () => (await pedidos()).length, { timeout: 30_000 }).toBe(1);
  // Ao entrar: os filtros padrão (todos ligados).
  expect((await pedidos())[0]!.audio).toMatchObject({ noiseSuppression: true, echoCancellation: true, autoGainControl: true });

  // A engrenagem da sala abre direto em Voz e áudio.
  await page.locator('.room__header').getByRole('button', { name: 'Voz e vídeo' }).click();
  const tela = page.getByRole('dialog', { name: 'Configurações' });
  await expect(tela.getByRole('heading', { name: 'Voz e vídeo' })).toBeVisible();

  // Microfone: o padrão e os aparelhos (falsos) do navegador.
  const microfone = tela.getByRole('combobox', { name: 'Microfone' });
  await expect.poll(async () => (await microfone.locator('option').count()) > 1, { timeout: 10_000 }).toBe(true);
  await expect(microfone).toHaveValue('');

  // Testar: a barra mexe com o bipe; parar zera.
  const medidor = tela.getByRole('meter', { name: 'Nível do microfone' });
  await tela.getByRole('button', { name: 'Testar microfone' }).click();
  await expect.poll(async () => Number(await medidor.getAttribute('aria-valuenow')), { timeout: 10_000 }).toBeGreaterThan(0);
  await tela.getByRole('button', { name: 'Parar teste' }).click();
  await expect(medidor).toHaveAttribute('aria-valuenow', '0');

  // Trocar o microfone com a chamada aberta: o motor pede o escolhido.
  const antes = (await pedidos()).length;
  const segundo = await microfone.locator('option').nth(1).getAttribute('value');
  await microfone.selectOption(segundo!);
  await expect.poll(async () => (await pedidos()).length).toBe(antes + 1);
  expect((await pedidos()).at(-1)!.audio).toMatchObject({ deviceId: { ideal: segundo } });

  // Desligar a redução de ruído: pedido de novo, sem o filtro.
  await tela.getByRole('switch', { name: 'Redução de ruído' }).click();
  await expect(tela.getByRole('switch', { name: 'Redução de ruído' })).toHaveAttribute('aria-checked', 'false');
  await expect.poll(async () => (await pedidos()).length).toBe(antes + 2);
  expect((await pedidos()).at(-1)!.audio).toMatchObject({ noiseSuppression: false, echoCancellation: true });

  // Saída de som: o Chromium deixa escolher.
  await expect(tela.getByRole('combobox', { name: 'Saída de som' })).toBeVisible();

  // Fecha: continuo na sala (trocar não derrubou a chamada).
  await page.keyboard.press('Escape');
  await expect(tela).toBeHidden();
  await expect(page.locator('.room__title')).toHaveText('Sala Principal');

  // Vale neste aparelho: recarregar mantém o microfone e o filtro.
  await page.reload();
  await page.getByRole('button', { name: 'Configurações', exact: true }).click({ timeout: 30_000 });
  await tela.getByRole('button', { name: 'Voz e vídeo' }).click();
  await expect(tela.getByRole('combobox', { name: 'Microfone' })).toHaveValue(segundo!);
  await expect(tela.getByRole('switch', { name: 'Redução de ruído' })).toHaveAttribute('aria-checked', 'false');
  await expect(tela.getByRole('switch', { name: 'Cancelamento de eco' })).toHaveAttribute('aria-checked', 'true');

  // 0.9.5: a parte de vídeo — escolher a câmera, testar (a prévia mostra
  // imagem) e espelhar, que fica guardado.
  await expect(tela.getByRole('combobox', { name: 'Câmera' })).toBeVisible();
  await tela.getByRole('button', { name: 'Testar câmera' }).click();
  await expect
    .poll(() => tela.locator('.cam-previa__video').evaluate((v) => (v as HTMLVideoElement).videoWidth > 0), { timeout: 15_000 })
    .toBe(true);
  await expect(tela.locator('.cam-previa')).toHaveClass(/is-espelhada/);
  await tela.getByRole('switch', { name: 'Espelhar o meu vídeo' }).click();
  await expect(tela.locator('.cam-previa')).not.toHaveClass(/is-espelhada/);
  await tela.getByRole('button', { name: 'Parar teste' }).last().click();
  await expect(tela.locator('.cam-previa')).toBeHidden();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('loft.camera') ?? '{}').espelhar)).toBe(false);
  await page.context().close();
});
