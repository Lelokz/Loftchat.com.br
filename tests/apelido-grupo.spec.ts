import { expect, test } from '@playwright/test';

import {
  createGroupThroughUi,
  limparTudo,
  newAccount,
  readDocViaRest,
  resolveTokens,
  signInThroughUi,
  signUpThroughUi,
} from './helpers';
import type { TestAccount } from './helpers';

/**
 * Proposta A, etapa 3d — como EU chamo cada grupo na barra de cima: nome do
 * grupo, apelido ou sem nome (só o ícone). Privado e ao vivo entre aparelhos.
 */

const accounts: TestAccount[] = [];

test.afterAll(async () => {
  await limparTudo(accounts, 'apelido — limpeza');
});

test('apelido e "sem nome" na aba, pelo menu do grupo; aparece ao vivo no outro aparelho; desfazer volta o nome', async ({
  browser,
}) => {
  test.setTimeout(150_000);
  const eu = newAccount('Apelido');
  accounts.push(eu);

  const pc = await (await browser.newContext()).newPage();
  await pc.goto('/');
  await signUpThroughUi(pc, eu);
  await resolveTokens(eu);
  await createGroupThroughUi(pc, 'Grupo da escola');
  await createGroupThroughUi(pc, 'Turma do Loft');

  // A mesma conta no "celular".
  const cel = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  await cel.goto('/');
  await signInThroughUi(cel, eu);
  await expect(cel.locator('.group-bar__tab', { hasText: 'Turma do Loft' })).toBeVisible({ timeout: 30_000 });

  // Pelo menu do grupo aberto ("Turma do Loft"): abre as Configurações em "Grupos".
  await pc.getByRole('button', { name: 'Opções do grupo' }).click();
  await pc.getByRole('menuitem', { name: 'Apelido do grupo' }).click();
  const tela = pc.getByRole('dialog', { name: 'Configurações' });
  await expect(tela.getByRole('heading', { name: 'Grupos' })).toBeVisible();

  await tela.getByLabel('Como mostrar Turma do Loft na aba').selectOption('apelido');
  await expect(tela.getByLabel('Apelido de Turma do Loft')).toBeFocused();
  await tela.getByLabel('Apelido de Turma do Loft').fill('Os brabos');
  await tela.getByLabel('Como mostrar Grupo da escola na aba').selectOption('icone');

  const barra = tela.getByRole('region', { name: 'Alterações não salvas' });
  await barra.getByRole('button', { name: 'Salvar' }).click();
  await expect(barra).toBeHidden({ timeout: 15_000 });
  await pc.keyboard.press('Escape');

  // No PC: apelido na aba; a escola vira só o ícone, sem perder o nome acessível.
  const abaLoft = pc.locator('.group-bar__tab', { hasText: 'Os brabos' });
  await expect(abaLoft).toBeVisible();
  await expect(abaLoft).toHaveAttribute('title', 'Turma do Loft (seu apelido: Os brabos)');
  const abaEscola = pc.getByRole('button', { name: 'Grupo da escola', exact: true });
  await expect(abaEscola).toHaveClass(/group-bar__tab--icone/);
  await expect(abaEscola.locator('.group-bar__name')).toHaveCount(0);
  // O cabeçalho da coluna continua com o nome de verdade.
  await expect(pc.locator('.channels__group-name')).toHaveText('Turma do Loft');

  // No "celular", sem recarregar.
  await expect(cel.locator('.group-bar__tab', { hasText: 'Os brabos' })).toBeVisible({ timeout: 15_000 });
  await expect(cel.getByRole('button', { name: 'Grupo da escola', exact: true })).toHaveClass(/group-bar__tab--icone/);

  // Privado: guardado na parte da conta que só eu leio.
  const priv = await readDocViaRest(eu, `userPrivate/${eu.uid}`);
  const rotulos = priv.fields?.['groupLabels']?.mapValue?.fields ?? {};
  expect(Object.values(rotulos).map((v: { stringValue?: string }) => v.stringValue).sort()).toEqual(['', 'Os brabos']);

  // Voltar ao nome do grupo (pelo botão direito na aba).
  await abaEscola.click({ button: 'right' });
  await pc.getByRole('menuitem', { name: 'Apelido do grupo' }).click();
  await tela.getByLabel('Como mostrar Grupo da escola na aba').selectOption('nome');
  await tela.getByRole('region', { name: 'Alterações não salvas' }).getByRole('button', { name: 'Salvar' }).click();
  await expect(tela.getByRole('region', { name: 'Alterações não salvas' })).toBeHidden({ timeout: 15_000 });
  await pc.keyboard.press('Escape');
  await expect(pc.locator('.group-bar__tab', { hasText: 'Grupo da escola' })).toBeVisible();
  await expect(cel.locator('.group-bar__tab', { hasText: 'Grupo da escola' })).toBeVisible({ timeout: 15_000 });

  await pc.context().close();
  await cel.context().close();
});
