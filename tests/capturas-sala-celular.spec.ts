import { expect, test } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

import { createGroupThroughUi, limparTudo, newAccount, signUpThroughUi } from './helpers';
import type { TestAccount } from './helpers';

/**
 * Fotos da sala de voz no CELULAR com transmissão (assistindo, tela cheia,
 * deitado, transmitindo), para conferir o design. Não testa nada.
 *
 *     LOFT_CAPTURAS=1 scripts/tela-de-teste.sh node scripts/emulator.mjs playwright test tests/capturas-sala-celular.spec.ts
 */

test.skip(process.env['LOFT_CAPTURAS'] !== '1', 'só quando pedido (LOFT_CAPTURAS=1)');

const PASTA = process.env['LOFT_FOTOS'] ?? 'test-results/sala-celular';
const accounts: TestAccount[] = [];

test.afterAll(async () => {
  await limparTudo(accounts, 'fotos da sala no celular — limpeza');
});

async function pessoa(browser: Browser, nome: string, celular: boolean): Promise<Page> {
  const conta = newAccount(nome);
  conta.displayName = nome;
  accounts.push(conta);
  const contexto = await browser.newContext(
    celular
      ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
      : { viewport: { width: 1440, height: 900 } },
  );
  const page = await contexto.newPage();
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await signUpThroughUi(page, conta);
  await page.addStyleTag({ content: '.emulator-badge{display:none!important}' });
  return page;
}

async function entrarNaSala(page: Page, celular: boolean): Promise<void> {
  if (celular) await page.getByRole('button', { name: 'Abrir canais' }).first().click();
  await page.locator('.channel', { hasText: 'Sala Principal' }).first().click();
  await page.locator('.room').waitFor({ timeout: 30_000 });
}

test('fotos da sala no celular', async ({ browser }) => {
  test.setTimeout(300_000);
  mkdirSync(PASTA, { recursive: true });

  const leo = await pessoa(browser, 'Léo', false);
  await createGroupThroughUi(leo, 'Turma do Loft');
  await leo.getByRole('button', { name: 'Opções do grupo' }).click();
  await leo.getByRole('menuitem', { name: 'Convidar pessoas' }).click();
  const campo = leo.getByLabel('Código do grupo');
  await expect(campo).toHaveText(/^[A-Z0-9]{6}$/, { timeout: 30_000 });
  const codigo = (await campo.textContent())!;
  await leo.keyboard.press('Escape');

  const ana = await pessoa(browser, 'Ana', true);
  await ana.locator('#join-code').fill(codigo);
  await ana.locator('#join-code').press('Enter');
  await ana.getByRole('button', { name: 'Entrar no grupo' }).click();
  await expect(ana.locator('.channels__group-name')).toHaveText('Turma do Loft', { timeout: 30_000 });

  await entrarNaSala(leo, false);
  await entrarNaSala(ana, true);
  await expect(leo.locator('.room__count')).toContainText('2', { timeout: 60_000 });

  // 1. O Léo (PC) transmite; a Ana assiste no celular.
  await leo.getByRole('button', { name: 'Compartilhar tela' }).click();
  await ana.waitForTimeout(4000);
  await ana.screenshot({ path: `${PASTA}/1-assistindo.png` });

  // 2. Tela cheia (o botão do canto do palco).
  const maximizar = ana.getByRole('button', { name: 'Ver em tela cheia' });
  if ((await maximizar.count()) > 0) {
    await maximizar.click();
    await ana.waitForTimeout(800);
    await ana.screenshot({ path: `${PASTA}/2-tela-cheia.png` });
    const sair = ana.getByRole('button', { name: 'Sair da tela cheia' });
    if ((await sair.count()) > 0) await sair.click({ timeout: 5000 }).catch(() => {});
    await ana.waitForTimeout(500);
  }

  // 3. Deitado.
  await ana.setViewportSize({ width: 844, height: 390 });
  await ana.waitForTimeout(800);
  await ana.screenshot({ path: `${PASTA}/3-deitado.png` });
  await ana.setViewportSize({ width: 390, height: 844 });

  // 4. A Ana transmite do celular (o Léo para antes).
  await leo.getByRole('button', { name: 'Parar de transmitir' }).click();
  await ana.waitForTimeout(1500);
  const transmitir = ana.getByRole('button', { name: 'Compartilhar tela' });
  if ((await transmitir.count()) > 0) {
    await transmitir.click();
    await ana.waitForTimeout(3000);
    await ana.screenshot({ path: `${PASTA}/4-transmitindo.png` });
    await leo.waitForTimeout(1000);
    await leo.screenshot({ path: `${PASTA}/5-pc-assistindo-celular.png` });
  }

  await leo.context().close();
  await ana.context().close();
});
