import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import { createGroupThroughUi, limparTudo, newAccount, readDocViaRest, resolveTokens, signUpThroughUi } from './helpers';
import type { TestAccount } from './helpers';

/**
 * Proposta A, etapa 4a — o jeito das abas (todas com nome, só ícones, só a
 * aberta com nome) e a ordem arrastando, guardados na conta.
 */

const accounts: TestAccount[] = [];

test.afterAll(async () => {
  await limparTudo(accounts, 'abas — limpeza');
});

const ordemNaBarra = (page: Page) =>
  page.locator('.group-bar__tabs > li[data-sort-id] .group-bar__tab').evaluateAll((ns) => ns.map((n) => n.getAttribute('aria-label')));

test('arrastar as abas muda a ordem (clique continua clique), fica guardada, e os 3 jeitos das abas', async ({ browser }) => {
  test.setTimeout(150_000);
  const eu = newAccount('Abas');
  accounts.push(eu);
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await page.goto('/');
  await signUpThroughUi(page, eu);
  await resolveTokens(eu);
  await createGroupThroughUi(page, 'Alfa');
  await createGroupThroughUi(page, 'Bravo');
  await createGroupThroughUi(page, 'Charlie');

  await expect.poll(() => ordemNaBarra(page)).toEqual(['Alfa', 'Bravo', 'Charlie']);
  const aberta = () => page.locator('.channels__group-name').textContent();
  expect(await aberta()).toBe('Charlie');

  // Um clique normal (mexendo 3px) continua abrindo o grupo.
  const alfa = page.getByRole('button', { name: 'Alfa', exact: true });
  const a = (await alfa.boundingBox())!;
  await page.mouse.move(a.x + 20, a.y + 10);
  await page.mouse.down();
  await page.mouse.move(a.x + 23, a.y + 10);
  await page.mouse.up();
  await expect(page.locator('.channels__group-name')).toHaveText('Alfa');

  // Arrastar "Charlie" para antes de "Alfa": muda a ordem e NÃO abre o Charlie.
  const charlie = (await page.getByRole('button', { name: 'Charlie', exact: true }).boundingBox())!;
  const alfa2 = (await alfa.boundingBox())!;
  await page.mouse.move(charlie.x + 20, charlie.y + 10);
  await page.mouse.down();
  await page.mouse.move(alfa2.x + 4, alfa2.y + 10, { steps: 12 });
  await page.mouse.up();
  await expect.poll(() => ordemNaBarra(page)).toEqual(['Charlie', 'Alfa', 'Bravo']);
  await expect(page.locator('.channels__group-name')).toHaveText('Alfa');

  // Guardada na conta: vale depois de recarregar.
  await expect
    .poll(async () => {
      const priv = await readDocViaRest(eu, `userPrivate/${eu.uid}`);
      return (priv.fields?.['groupOrder']?.arrayValue?.values ?? []).length;
    })
    .toBe(3);
  await page.reload();
  await expect.poll(() => ordemNaBarra(page), { timeout: 30_000 }).toEqual(['Charlie', 'Alfa', 'Bravo']);

  // --- Configurações → Grupos: só ícones ---
  await page.getByRole('button', { name: 'Configurações', exact: true }).click();
  const tela = page.getByRole('dialog', { name: 'Configurações' });
  await tela.getByRole('button', { name: 'Grupos' }).click();
  await tela.getByRole('radio', { name: /Só ícones/ }).click();
  // Teclado: "Charlie" desce uma posição pela alça.
  await tela.getByRole('button', { name: 'Mover Charlie' }).focus();
  await page.keyboard.press('ArrowDown');
  await expect(tela.getByRole('button', { name: 'Mover Charlie' })).toBeFocused();
  const barra = tela.getByRole('region', { name: 'Alterações não salvas' });
  await barra.getByRole('button', { name: 'Salvar' }).click();
  await expect(barra).toBeHidden({ timeout: 15_000 });
  await page.keyboard.press('Escape');

  await expect.poll(() => ordemNaBarra(page)).toEqual(['Alfa', 'Charlie', 'Bravo']);
  const abas = page.locator('.group-bar__tabs > li[data-sort-id] .group-bar__tab');
  await expect(abas.locator('.group-bar__name')).toHaveCount(0);
  await expect(page.locator('.group-bar__tab.is-active.group-bar__tab--icone')).toHaveCount(1);

  // --- só a aberta com nome ---
  await page.getByRole('button', { name: 'Configurações', exact: true }).click();
  await tela.getByRole('button', { name: 'Grupos' }).click();
  await tela.getByRole('radio', { name: /Só a aberta com nome/ }).click();
  await tela.getByRole('region', { name: 'Alterações não salvas' }).getByRole('button', { name: 'Salvar' }).click();
  await expect(tela.getByRole('region', { name: 'Alterações não salvas' })).toBeHidden({ timeout: 15_000 });
  await page.keyboard.press('Escape');
  await expect(abas.locator('.group-bar__name')).toHaveText(['Alfa']);
  await page.getByRole('button', { name: 'Bravo', exact: true }).click();
  await expect(abas.locator('.group-bar__name')).toHaveText(['Bravo']);

  await page.context().close();
});

test('pastas: criar, pôr grupos, abrir e fechar na barra, arrastar a pasta inteira, e apagar devolve os grupos', async ({
  browser,
}) => {
  test.setTimeout(150_000);
  const eu = newAccount('Pastas');
  accounts.push(eu);
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await page.goto('/');
  await signUpThroughUi(page, eu);
  await resolveTokens(eu);
  for (const nome of ['Alfa', 'Bravo', 'Charlie', 'Delta']) await createGroupThroughUi(page, nome);

  // Itens soltos da barra: grupos e pastas, na ordem.
  const itens = () =>
    page
      .locator('.group-bar__tabs > li[data-sort-id] > .group-bar__tab')
      .evaluateAll((ns) => ns.map((n) => n.getAttribute('aria-label')));

  await page.getByRole('button', { name: 'Configurações', exact: true }).click();
  const tela = page.getByRole('dialog', { name: 'Configurações' });
  await tela.getByRole('button', { name: 'Grupos' }).click();
  await tela.getByRole('button', { name: 'Nova pasta' }).click();
  await expect(tela.getByLabel('Nome da pasta')).toBeFocused();
  await tela.getByLabel('Nome da pasta').fill('Escola');
  await tela.getByRole('radiogroup', { name: /Cor da pasta/ }).getByRole('radio', { name: 'Verde' }).click();
  await tela.getByLabel('Pasta de Bravo').selectOption({ label: 'Escola' });
  await tela.getByLabel('Pasta de Charlie').selectOption({ label: 'Escola' });
  await tela.getByRole('region', { name: 'Alterações não salvas' }).getByRole('button', { name: 'Salvar' }).click();
  await expect(tela.getByRole('region', { name: 'Alterações não salvas' })).toBeHidden({ timeout: 15_000 });
  await page.keyboard.press('Escape');

  // A pasta fica no lugar do primeiro grupo dela; fechada, os grupos não aparecem.
  await expect.poll(itens).toEqual(['Alfa', 'Pasta Escola', 'Delta']);
  const pasta = page.getByRole('button', { name: 'Pasta Escola', exact: true });
  await expect(pasta).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('button', { name: 'Bravo', exact: true })).toHaveCount(0);

  // Abrir: os grupos aparecem dentro da moldura; dá para abrir um deles.
  await pasta.click();
  await expect(pasta).toHaveAttribute('aria-expanded', 'true');
  const dentro = page.getByRole('list', { name: 'Grupos da pasta Escola' });
  await expect
    .poll(() => dentro.getByRole('button').evaluateAll((ns) => ns.map((n) => n.getAttribute('aria-label'))))
    .toEqual(['Bravo', 'Charlie']);
  await dentro.getByRole('button', { name: 'Charlie', exact: true }).click();
  await expect(page.locator('.channels__group-name')).toHaveText('Charlie');

  // Fechar com o Charlie aberto: a pasta fica acesa.
  await pasta.click();
  await expect(pasta).toHaveAttribute('aria-expanded', 'false');
  await expect(pasta).toHaveClass(/is-active/);

  // Arrastar a pasta inteira para antes de "Alfa".
  const de = (await pasta.boundingBox())!;
  const para = (await page.getByRole('button', { name: 'Alfa', exact: true }).boundingBox())!;
  await page.mouse.move(de.x + 15, de.y + 10);
  await page.mouse.down();
  await page.mouse.move(para.x + 4, para.y + 10, { steps: 12 });
  await page.mouse.up();
  await expect.poll(itens).toEqual(['Pasta Escola', 'Alfa', 'Delta']);
  // O arrasto não abriu a pasta (o clique do soltar é engolido).
  await expect(pasta).toHaveAttribute('aria-expanded', 'false');

  // Recarregar: pasta e ordem continuam.
  await page.reload();
  await expect.poll(itens, { timeout: 30_000 }).toEqual(['Pasta Escola', 'Alfa', 'Delta']);

  // Apagar a pasta devolve os grupos soltos, no mesmo lugar.
  await page.getByRole('button', { name: 'Configurações', exact: true }).click();
  await tela.getByRole('button', { name: 'Grupos' }).click();
  await tela.getByRole('button', { name: 'Apagar a pasta Escola' }).click();
  await tela.getByRole('region', { name: 'Alterações não salvas' }).getByRole('button', { name: 'Salvar' }).click();
  await expect(tela.getByRole('region', { name: 'Alterações não salvas' })).toBeHidden({ timeout: 15_000 });
  await page.keyboard.press('Escape');
  await expect.poll(itens).toEqual(['Bravo', 'Charlie', 'Alfa', 'Delta']);

  await page.context().close();
});
