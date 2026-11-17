import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

import { createGroupThroughUi, limparTudo, newAccount, sendMessageThroughUi, signUpThroughUi } from './helpers';
import type { TestAccount } from './helpers';

/**
 * As fotos do README (docs/imagens/). Não testa nada: monta um grupo de
 * exemplo com três pessoas, conversa e sala de voz, e fotografa.
 *
 *     LOFT_CAPTURAS=1 scripts/tela-de-teste.sh node scripts/emulator.mjs playwright test tests/capturas-readme.spec.ts
 */

test.skip(process.env['LOFT_CAPTURAS'] !== '1', 'só gera as fotos do README quando pedido (LOFT_CAPTURAS=1)');

const PASTA = 'docs/imagens';
const accounts: TestAccount[] = [];

test.afterAll(async () => {
  await limparTudo(accounts, 'fotos do README — limpeza');
});

/** Sem a tarja "EMULADOR" e sem cursor piscando nas fotos. */
async function limparTela(page: Page): Promise<void> {
  await page.addStyleTag({ content: '.emulator-badge{display:none!important} *{caret-color:transparent!important}' });
}

async function pessoa(browser: import('@playwright/test').Browser, nome: string, celular = false) {
  const conta = newAccount(nome);
  conta.displayName = nome;
  accounts.push(conta);
  const contexto = await browser.newContext(
    celular
      ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
      : { viewport: { width: 1440, height: 900 } },
  );
  await contexto.addInitScript(() => {
    // Tudo mudo: nada sai no alto-falante do PC.
    HTMLMediaElement.prototype.play = new Proxy(HTMLMediaElement.prototype.play, {
      apply(alvo, este: HTMLMediaElement, args) {
        este.muted = true;
        return Reflect.apply(alvo, este, args);
      },
    });
  });
  const page = await contexto.newPage();
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await signUpThroughUi(page, conta);
  await limparTela(page);
  return page;
}

async function entrarPeloCodigo(page: Page, codigo: string): Promise<void> {
  await page.locator('#join-code').fill(codigo);
  await page.locator('#join-code').press('Enter');
  await page.getByRole('button', { name: 'Entrar no grupo' }).click();
  await expect(page.locator('.channels__group-name')).toHaveText('Turma do Loft', { timeout: 30_000 });
}

test('fotos do README', async ({ browser }) => {
  test.setTimeout(300_000);
  mkdirSync(PASTA, { recursive: true });

  const leo = await pessoa(browser, 'Léo');
  await createGroupThroughUi(leo, 'Turma do Loft');
  await leo.getByRole('button', { name: 'Opções do grupo' }).click();
  await leo.getByRole('menuitem', { name: 'Convidar pessoas' }).click();
  const campoCodigo = leo.getByLabel('Código do grupo');
  await expect(campoCodigo).toHaveText(/^[A-Z0-9]{6}$/, { timeout: 30_000 });
  const codigo = (await campoCodigo.textContent())!;
  await leo.keyboard.press('Escape');

  const ana = await pessoa(browser, 'Ana', true);
  await entrarPeloCodigo(ana, codigo);
  const lucas = await pessoa(browser, 'Lucas');
  await entrarPeloCodigo(lucas, codigo);

  const conversa: Array<[Page, string]> = [
    [leo, 'Bora jogar hoje à noite?'],
    [lucas, 'Bora! Umas 21h?'],
    [ana, 'Fechado, eu levo o lanche 😄'],
    [leo, 'Abro a Sala Principal e transmito a tela'],
    [lucas, 'Perfeito, chego lá'],
  ];
  for (const [quem, texto] of conversa) {
    await sendMessageThroughUi(quem, texto);
    await quem.waitForTimeout(500);
  }
  await expect(leo.getByText('Perfeito, chego lá')).toBeVisible({ timeout: 30_000 });
  await expect(ana.getByText('Perfeito, chego lá')).toBeVisible({ timeout: 30_000 });
  await leo.waitForTimeout(800);
  await leo.screenshot({ path: `${PASTA}/chat.png` });
  await ana.screenshot({ path: `${PASTA}/celular.png` });

  // A sala de voz com os três.
  for (const quem of [leo, lucas]) {
    await quem.locator('.channels__body').getByRole('button', { name: 'Sala Principal' }).click();
    await quem.locator('.room').waitFor({ timeout: 30_000 });
  }
  await ana.getByRole('button', { name: 'Abrir canais' }).first().click();
  await ana.locator('.channel', { hasText: 'Sala Principal' }).first().click();
  await expect(leo.locator('.room__count')).toContainText('3', { timeout: 60_000 });
  await leo.waitForTimeout(3000);
  await leo.screenshot({ path: `${PASTA}/sala.png` });
  await ana.waitForTimeout(500);
  await ana.screenshot({ path: `${PASTA}/celular-sala.png` });

  for (const quem of [leo, ana, lucas]) await quem.context().close();
});
