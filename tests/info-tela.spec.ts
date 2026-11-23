import { expect, test } from '@playwright/test';

import { limparTudo, newAccount, resolveTokens, signUpThroughUi } from './helpers';
import type { TestAccount } from './helpers';

/**
 * "MANDAR INFORMAÇÕES DA TELA" (Configurações → Sobre, 23/11/2026): um toque
 * grava o retrato do aparelho em `infoDeTela/`, e a regra não deixa ninguém
 * ler pelo app.
 */

const accounts: TestAccount[] = [];
test.afterAll(async () => {
  await limparTudo(accounts, 'info da tela — limpeza');
});

const FS = `http://${process.env['FIRESTORE_EMULATOR_HOST']}/v1/projects/loft-3d6c0f/databases/(default)/documents`;

test('Sobre: manda as informações da tela, e o app não consegue ler de volta', async ({ browser }) => {
  test.skip(process.env['FIRESTORE_EMULATOR_HOST'] === undefined, 'só no emulador');
  const conta = newAccount('Info tela');
  conta.displayName = 'Ana Tela';
  accounts.push(conta);
  const contexto = await browser.newContext({
    viewport: { width: 393, height: 851 },
    deviceScaleFactor: 2.75,
    isMobile: true,
    hasTouch: true,
  });
  const page = await contexto.newPage();
  await page.goto('/');
  await signUpThroughUi(page, conta);

  await page.getByRole('button', { name: 'Configurações', exact: true }).first().click();
  await page.getByRole('button', { name: 'Sobre o Loftchat' }).click();
  const botao = page.getByRole('button', { name: 'Mandar informações da tela' });
  await botao.scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/info-tela/sobre.png' });
  await botao.click();
  await expect(page.getByRole('button', { name: 'Informações mandadas' })).toBeDisabled({ timeout: 15_000 });
  await expect(page.getByText('Pronto! Obrigado')).toBeVisible();

  // O que chegou (lido como dono, que é como o Léo lê).
  const lista = await fetch(`${FS}/infoDeTela`, { headers: { authorization: 'Bearer owner' } }).then((r) => r.json());
  const docs = (lista.documents ?? []) as { fields: Record<string, Record<string, unknown>> }[];
  const meu = docs.find((d) => d.fields['nome']?.['stringValue'] === 'Ana Tela');
  expect(meu, 'o retrato do aparelho chegou').toBeDefined();
  expect(Number(meu!.fields['janelaW']?.['integerValue'] ?? meu!.fields['janelaW']?.['doubleValue'])).toBe(393);
  expect(Number(meu!.fields['densidade']?.['doubleValue'])).toBe(2.75);
  expect(meu!.fields['toque']?.['booleanValue']).toBe(true);

  // E a própria pessoa não lê de volta (nem ninguém pelo app).
  await resolveTokens(conta);
  const tentativa = await fetch(`${FS}/infoDeTela`, { headers: { authorization: `Bearer ${conta.idToken}` } });
  expect(tentativa.status).toBe(403);

  await contexto.close();
});
