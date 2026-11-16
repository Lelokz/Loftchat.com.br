import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import { createGroupThroughUi, limparTudo, newAccount, readDocViaRest, resolveTokens, sendMessageThroughUi, signInThroughUi, signUpThroughUi } from './helpers';
import type { TestAccount } from './helpers';

/**
 * Proposta A, etapa 5a — aparência pessoal: tema, cor de destaque (pronta ou
 * livre), fonte do app e tamanho do texto. Prévia na hora, Desfazer volta,
 * Salvar guarda na conta e chega AO VIVO no outro aparelho.
 */

const accounts: TestAccount[] = [];

test.afterAll(async () => {
  await limparTudo(accounts, 'aparência — limpeza');
});

const tema = (page: Page) => page.evaluate(() => document.documentElement.dataset['tema'] ?? 'noite');
const varDaRaiz = (page: Page, nome: string) =>
  page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), nome);
const corDeFundo = (page: Page, seletor: string) =>
  page.locator(seletor).first().evaluate((n) => getComputedStyle(n).backgroundColor);

test('tema, cor, fonte e tamanho: prévia, desfazer, salvar e ao vivo no outro aparelho', async ({ browser }) => {
  test.setTimeout(180_000);
  const eu = newAccount('Aparencia');
  accounts.push(eu);
  const pc = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await pc.goto('/');
  await signUpThroughUi(pc, eu);
  await resolveTokens(eu);
  await createGroupThroughUi(pc, 'Cores');
  await sendMessageThroughUi(pc, 'mensagem para medir');
  const fundoDoChatAntes = await corDeFundo(pc, '.chat');

  // --- prévia e desfazer ---
  await pc.getByRole('button', { name: 'Configurações', exact: true }).click();
  const tela = pc.getByRole('dialog', { name: 'Configurações' });
  await tela.getByRole('button', { name: 'Aparência' }).click();
  const temas = tela.getByRole('radiogroup', { name: 'Tema' });
  await temas.getByRole('radio', { name: 'Claro' }).click();
  expect(await tema(pc)).toBe('claro');
  const barra = tela.getByRole('region', { name: 'Alterações não salvas' });
  await expect(barra).toBeVisible();
  await barra.getByRole('button', { name: 'Desfazer' }).click();
  expect(await tema(pc)).toBe('noite');
  await expect(barra).toBeHidden();

  // Fechar com prévia não salva: não fecha (a barra pisca), a prévia segue.
  await temas.getByRole('radio', { name: 'Oceano' }).click();
  await pc.keyboard.press('Escape');
  await expect(tela).toBeVisible();
  expect(await tema(pc)).toBe('oceano');

  // --- escolher tudo e salvar ---
  await temas.getByRole('radio', { name: 'Claro' }).click();
  await tela.getByRole('radiogroup', { name: 'Cor de destaque' }).getByRole('radio', { name: 'Verde' }).click();
  await tela.getByRole('radiogroup', { name: 'Fonte do app' }).getByRole('radio', { name: 'Leitura fácil' }).click();
  const regua = tela.getByRole('slider', { name: 'Tamanho do texto das mensagens' });
  await regua.focus();
  for (let i = 0; i < 3; i++) await pc.keyboard.press('ArrowRight'); // 14 → 15 → 16 → 18
  await expect(tela.locator('.aparencia-tamanho__valor')).toHaveText('18 px');
  // A prévia (classes reais do chat) já está no tamanho novo.
  await expect(tela.locator('.aparencia-previa .message__text').first()).toHaveCSS('font-size', '18px');
  await barra.getByRole('button', { name: 'Salvar' }).click();
  await expect(barra).toBeHidden();

  await expect
    .poll(async () => {
      const priv = await readDocViaRest(eu, `userPrivate/${eu.uid}`);
      const f = priv.fields?.['appearance']?.mapValue?.fields ?? {};
      return [f['theme']?.stringValue, f['accent']?.stringValue, f['font']?.stringValue, f['textSize']?.integerValue];
    })
    .toEqual(['claro', '#1a8562', 'leitura', '18']);

  await pc.keyboard.press('Escape');
  await expect(tela).toBeHidden();
  expect(await tema(pc)).toBe('claro');
  expect(await corDeFundo(pc, '.chat')).not.toBe(fundoDoChatAntes);
  await expect(pc.locator('.message__text').first()).toHaveCSS('font-size', '18px');
  expect(await pc.evaluate(() => getComputedStyle(document.body).fontFamily)).toContain('Atkinson');
  // O verde, já com o texto branco por cima (contraste garantido).
  expect(await varDaRaiz(pc, '--accent-on')).toBe('#ffffff');

  // --- o "celular": mesma conta, abre já no tema dela ---
  const cel = await (await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true })).newPage();
  await cel.goto('/');
  await signInThroughUi(cel, eu);
  await expect.poll(() => tema(cel)).toBe('claro');

  // Muda no PC → chega AO VIVO no celular, sem recarregar. Cor LIVRE amarela:
  // amarelo claro pede texto ESCURO por cima.
  await pc.getByRole('button', { name: 'Configurações', exact: true }).click();
  await tela.getByRole('button', { name: 'Aparência' }).click();
  await temas.getByRole('radio', { name: 'Floresta' }).click();
  await tela.getByLabel('Escolher outra cor').fill('#ffd400');
  await expect(tela.getByRole('radiogroup', { name: 'Cor de destaque' }).locator('[aria-checked="true"]')).toHaveClass(/aparencia-cores__livre/);
  await barra.getByRole('button', { name: 'Salvar' }).click();
  await expect(barra).toBeHidden();
  await expect.poll(() => tema(cel), { timeout: 15_000 }).toBe('floresta');
  await expect.poll(() => varDaRaiz(cel, '--accent-on')).toBe('#120d1f');
  expect(await varDaRaiz(cel, '--accent')).toBe('#ffd400');

  // Guardada no aparelho: recarregar já abre no tema (sem piscar o roxo).
  await pc.keyboard.press('Escape');
  await pc.reload();
  expect(await tema(pc)).toBe('floresta');

  // Sair da conta: a aparência dela não fica para a próxima pessoa.
  await pc.getByRole('button', { name: 'Configurações', exact: true }).click();
  await pc.getByRole('dialog', { name: 'Configurações' }).getByRole('button', { name: 'Sair da conta' }).click();
  await expect(pc.getByRole('button', { name: 'Entrar', exact: true })).toBeVisible({ timeout: 20_000 });
  expect(await tema(pc)).toBe('noite');
  expect(await varDaRaiz(pc, '--accent')).toBe('#7b3fe4');

  await pc.context().close();
  await cel.context().close();
});
