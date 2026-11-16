import { expect, test } from '@playwright/test';

import { createGroupThroughUi, limparTudo, newAccount, resolveTokens, signUpThroughUi } from './helpers';
import type { TestAccount } from './helpers';

/**
 * Código do grupo (16/11/2026): cada grupo tem UM código de 6 letras e
 * números, fixo, que o dono vê em "Convidar pessoas". Quem tem o código entra
 * pelo "+" → "Entrar num grupo". O dono pode trocar o código (o antigo para
 * de valer).
 */

const accounts: TestAccount[] = [];

test.afterAll(async () => {
  await limparTudo(accounts, 'código do grupo — limpeza');
});

test('código do grupo: fixo, entrar pelo +, trocar invalida o antigo', async ({ browser }) => {
  test.setTimeout(180_000);
  const dono = newAccount('DonoCodigo');
  const amiga = newAccount('AmigaCodigo');
  const outro = newAccount('OutroCodigo');
  accounts.push(dono, amiga, outro);

  const pDono = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await pDono.goto('/');
  await signUpThroughUi(pDono, dono);
  await resolveTokens(dono);
  await createGroupThroughUi(pDono, 'Turma do Código');

  // Convidar: o código em destaque, 6 letras/números, e o link com ele.
  const abrirConvite = async (): Promise<string> => {
    await pDono.getByRole('button', { name: 'Opções do grupo' }).click();
    await pDono.getByRole('menuitem', { name: 'Convidar pessoas' }).click();
    const codigo = pDono.getByLabel('Código do grupo');
    await expect(codigo).toHaveText(/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/, { timeout: 30_000 });
    return (await codigo.textContent())!;
  };
  const codigo = await abrirConvite();
  await expect(pDono.locator('.modal__link')).toHaveValue(new RegExp(`/convite/${codigo}$`));
  await pDono.keyboard.press('Escape');

  // É FIXO: abrir de novo mostra o mesmo.
  expect(await abrirConvite()).toBe(codigo);
  await pDono.keyboard.press('Escape');

  // A amiga (já com um grupo dela) entra pelo "+" → "Entrar num grupo",
  // digitando em minúsculas e com espaço.
  const pAmiga = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await pAmiga.goto('/');
  await signUpThroughUi(pAmiga, amiga);
  await createGroupThroughUi(pAmiga, 'Grupo da Amiga');
  await pAmiga.getByRole('button', { name: 'Criar ou entrar num grupo' }).click();
  await expect(pAmiga.getByRole('menuitem', { name: 'Criar grupo', exact: true })).toBeVisible();
  await pAmiga.getByRole('menuitem', { name: 'Entrar num grupo' }).click();
  const campo = pAmiga.getByRole('dialog').getByLabel('Código do grupo');
  // Código torto: avisa no próprio campo.
  await campo.fill('xyz');
  await pAmiga.getByRole('dialog').getByRole('button', { name: 'Continuar' }).click();
  await expect(pAmiga.getByRole('dialog')).toContainText('não parece um convite');
  await campo.fill(`${codigo.slice(0, 3).toLowerCase()} ${codigo.slice(3).toLowerCase()}`);
  await pAmiga.getByRole('dialog').getByRole('button', { name: 'Continuar' }).click();
  await expect(pAmiga.getByText('Turma do Código')).toBeVisible({ timeout: 30_000 });
  await pAmiga.getByRole('button', { name: 'Entrar no grupo' }).click();
  await expect(pAmiga.locator('.channels__group-name')).toHaveText('Turma do Código', { timeout: 30_000 });

  // O dono troca o código: confirma no lugar, sai outro, e o antigo para de valer.
  await abrirConvite();
  const trocar = pDono.getByRole('button', { name: 'Trocar código' });
  await trocar.click();
  await pDono.getByRole('button', { name: /Trocar mesmo/ }).click();
  await expect(pDono.getByLabel('Código do grupo')).not.toHaveText(codigo, { timeout: 30_000 });
  const novo = (await pDono.getByLabel('Código do grupo').textContent())!;
  expect(novo).toMatch(/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/);
  await pDono.keyboard.press('Escape');

  const pOutro = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await pOutro.goto('/');
  await signUpThroughUi(pOutro, outro);
  await pOutro.locator('#join-code').fill(codigo);
  await pOutro.locator('#join-code').press('Enter');
  await expect(pOutro.getByText(/não existe|não encontr|inválid|expirou/i).first()).toBeVisible({ timeout: 30_000 });

  await pDono.context().close();
  await pAmiga.context().close();
  await pOutro.context().close();
});
