import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import { createGroupThroughUi, limparTudo, newAccount, openCreateGroupDialog, signUpThroughUi } from './helpers';
import type { TestAccount } from './helpers';

/**
 * Etapa 20 — identidade visual. O que é COMPORTAMENTO da identidade e dá para
 * medir sem olho humano: a transição entre telas existe e não deixa rastro, o
 * movimento reduzido desliga tudo, a mensagem nova chega animada e o
 * histórico não, e a fixada vira bilhete. Se ficou bonito, não é teste — é o
 * Leo olhando as capturas.
 */

const accounts: TestAccount[] = [];

function track(label: string): TestAccount {
  const account = newAccount(label);
  accounts.push(account);
  return account;
}

test.afterAll(async () => {
  await limparTudo(accounts, 'identidade — limpeza');
});

/**
 * Registra, a partir de agora, cada fantasma de transição que entra e sai do
 * <body> — com o instante, e com o que dá para ver dele de fora.
 */
async function vigiarFantasmas(page: Page): Promise<void> {
  // Começa do zero: um fantasma de antes (o modal que acabou de fechar) não
  // pode entrar na conta desta troca.
  await expect(page.locator('.view-ghost')).toHaveCount(0);
  await page.evaluate(() => {
    const w = window as unknown as { __fantasmas: Array<Record<string, unknown>> };
    w.__fantasmas = [];
    new MutationObserver((mudancas) => {
      for (const m of mudancas) {
        m.addedNodes.forEach((n) => {
          if (n instanceof HTMLElement && n.classList.contains('view-ghost')) {
            w.__fantasmas.push({
              ev: 'entrou',
              t: performance.now(),
              ariaHidden: n.getAttribute('aria-hidden'),
              inert: n.inert,
              // shadow root FECHADO: de fora, `shadowRoot` é null.
              shadowAberto: n.shadowRoot !== null,
            });
          }
        });
        m.removedNodes.forEach((n) => {
          if (n instanceof HTMLElement && n.classList.contains('view-ghost')) {
            w.__fantasmas.push({ ev: 'saiu', t: performance.now() });
          }
        });
      }
    }).observe(document.body, { childList: true });
  });
}

async function fantasmas(page: Page): Promise<Array<Record<string, unknown>>> {
  return page.evaluate(() => (window as unknown as { __fantasmas: Array<Record<string, unknown>> }).__fantasmas);
}

test('troca de visão: a tela velha esmaece por cima da nova e some; com movimento reduzido, troca seca', async ({
  page,
}) => {
  const conta = track('transicao');
  await page.goto('/');
  await signUpThroughUi(page, conta);
  await createGroupThroughUi(page, 'Grupo da transição');

  await vigiarFantasmas(page);
  await page.getByRole('button', { name: 'Tela inicial' }).click();
  // A tela nova chega na hora — a transição não segura a troca.
  await expect(page.locator('.home-column')).toBeVisible();

  // O fantasma entra e sai sozinho, e some do DOM.
  await expect.poll(async () => (await fantasmas(page)).filter((f) => f.ev === 'saiu').length).toBeGreaterThan(0);
  await expect(page.locator('.view-ghost')).toHaveCount(0);
  const registro = await fantasmas(page);
  const entradas = registro.filter((f) => f.ev === 'entrou');
  expect(entradas.length).toBeGreaterThan(0);
  for (const f of entradas) {
    expect(f.ariaHidden).toBe('true');
    expect(f.inert).toBe(true);
    expect(f.shadowAberto).toBe(false);
  }
  // Vida do primeiro fantasma: os 200 ms da transição, com folga para a máquina.
  const vida = (registro.find((f) => f.ev === 'saiu')!.t as number) - (entradas[0]!.t as number);
  expect(vida).toBeGreaterThanOrEqual(150);
  expect(vida).toBeLessThan(2_000);

  // Movimento reduzido: nenhuma cópia, troca instantânea.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await vigiarFantasmas(page);
  await page.locator('.group-bar__button').first().click();
  await expect(page.locator('.channels__group-name')).toHaveText('Grupo da transição');
  await page.getByRole('button', { name: 'Tela inicial' }).click();
  await expect(page.locator('.home-column')).toBeVisible();
  expect(await fantasmas(page)).toEqual([]);
});

test('modal entra esmaecendo; ao fechar sai do DOM na hora e quem esmaece é um fantasma', async ({ page }) => {
  const conta = track('modal');
  await page.goto('/');
  await signUpThroughUi(page, conta);

  const dialog = await openCreateGroupDialog(page);
  await expect(dialog).toHaveCSS('opacity', '1');
  expect(await dialog.evaluate((n) => getComputedStyle(n).transitionProperty)).toContain('opacity');

  await vigiarFantasmas(page);
  await dialog.getByRole('button', { name: 'Cancelar' }).click();
  // O <dialog> sai do DOM no instante em que fecha, como antes da etapa 20:
  // quem abre outro modal logo em seguida acha um só.
  await expect(page.locator('dialog')).toHaveCount(0);
  await expect.poll(async () => (await fantasmas(page)).map((f) => f.ev)).toEqual(['entrou', 'saiu']);
  const [entrou] = await fantasmas(page);
  expect(entrou!.shadowAberto).toBe(false);
  expect(entrou!.inert).toBe(true);
});
