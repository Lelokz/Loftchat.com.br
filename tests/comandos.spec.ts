import { expect, test } from '@playwright/test';

import { activeGroupId, createAccountViaRest, createGroupThroughUi, limparTudo, newAccount, resolveTokens, signInThroughUi, signUpThroughUi } from './helpers';
import type { TestAccount } from './helpers';
import { comoDono, ligarCarteiroLocal } from './carteiro-local';

/**
 * COMANDOS COM "/" (0.8.5, etapas 5 e 6): a lista abre ao digitar "/",
 * os prontos fazem o que dizem (dado, moeda, escolher, spoiler, me, limpar,
 * castigo…), quem não tem permissão não vê/usa, e os comandos personalizados
 * do grupo são criados nas Configurações e usados no chat.
 */

const contas: TestAccount[] = [];
let desligar: (() => void) | undefined;
test.describe.configure({ mode: 'serial' });
test.skip(process.env['FIRESTORE_EMULATOR_HOST'] === undefined, 'só no emulador');
test.beforeAll(async () => {
  test.setTimeout(90_000);
  desligar = await ligarCarteiroLocal();
});
test.afterAll(async () => {
  desligar?.();
  await limparTudo(contas, 'comandos — limpeza');
});

test('comandos: lista do "/", prontos, permissão e personalizados', async ({ browser }) => {
  test.setTimeout(300_000);
  const dono = newAccount('Dono cmd');
  const ana = newAccount('Ana cmd');
  contas.push(dono, ana);
  await createAccountViaRest(ana);

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto('/');
  await signUpThroughUi(page, dono);
  await resolveTokens(dono);
  await createGroupThroughUi(page, 'Grupo dos comandos');
  const grupo = await activeGroupId(page);
  await comoDono(`users/${ana.uid}`, { uid: ana.uid!, displayName: 'Ana', initials: 'AN', username: `t${ana.uid!.slice(0, 10).toLowerCase()}` });
  await comoDono(`memberships/${grupo}_${ana.uid}`, { groupId: grupo, memberId: ana.uid!, role: 'member', joinedAt: new Date().toISOString() });

  const caixa = page.locator('main.chat .composer__input');
  const menu = page.locator('main.chat .cmd-menu');
  // "/" abre a lista; filtra enquanto digita; Enter completa.
  await caixa.fill('/');
  await expect(menu).toBeVisible();
  await expect(menu.locator('.cmd-menu__op', { hasText: '/dado' })).toBeVisible();
  await caixa.fill('/mo');
  await expect(menu.locator('.cmd-menu__op')).toHaveCount(1);
  await caixa.press('Enter');
  await expect(caixa).toHaveValue('/moeda');
  await caixa.press('Enter');
  const comando = (nome: string) => page.locator('.message__comando', { hasText: `/${nome}` });
  await expect(comando('moeda').locator('.message__comando-cartao')).toHaveText(/🪙 (Cara|Coroa)/, { timeout: 20_000 });

  const mandar = async (texto: string): Promise<void> => {
    await caixa.fill(texto);
    await page.keyboard.press('Escape');
    await caixa.press('Enter');
  };
  await mandar('/dado 20');
  await expect(comando('dado').locator('.message__comando-cartao')).toHaveText(/🎲 \d+ \(dado de 20\)/, { timeout: 20_000 });
  await mandar('/escolher pizza | sushi');
  await expect(comando('escolher').locator('.message__comando-cartao')).toHaveText(/👉 (pizza|sushi)/, { timeout: 20_000 });
  await mandar('/me foi pegar pipoca');
  await expect(page.locator('.message__text--acao', { hasText: 'foi pegar pipoca' })).toBeVisible({ timeout: 20_000 });
  await mandar('/spoiler o final é feliz');
  const spoiler = page.locator('.message__spoiler', { hasText: 'o final é feliz' });
  await expect(spoiler).toBeVisible({ timeout: 20_000 });
  await expect(spoiler).not.toHaveClass(/is-aberto/);
  await spoiler.click();
  await expect(spoiler).toHaveClass(/is-aberto/);
  // Erro de uso: a caixa mostra o motivo e não apaga o texto.
  await mandar('/escolher só-uma');
  await expect(page.locator('main.chat .composer__error')).toContainText('pelo menos duas opções');
  await expect(caixa).toHaveValue('/escolher só-uma');
  // "@" dentro do comando sugere as pessoas.
  await caixa.fill('/castigo @A');
  await expect(menu.locator('.cmd-menu__op', { hasText: '@Ana' })).toBeVisible();
  await caixa.press('Enter');
  await expect(caixa).toHaveValue('/castigo @Ana ');
  await caixa.fill('/castigo @Ana 10m bagunça');
  await page.keyboard.press('Escape');
  await caixa.press('Enter');
  await expect(page.getByText('Ana está de castigo.')).toBeVisible({ timeout: 20_000 });
  // /limpar 2: some as duas últimas.
  await mandar('/limpar 2');
  await expect(page.getByText(/2 mensagens apagadas/)).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.message__spoiler')).toHaveCount(0, { timeout: 20_000 });
  await expect(page.locator('.message__text--acao')).toHaveCount(0);

  // PERSONALIZADO: Configurações do grupo → Comandos → /regras.
  await page.getByRole('button', { name: 'Opções do grupo' }).click();
  await page.getByRole('menuitem', { name: 'Configurações do grupo' }).click();
  const tela = page.getByRole('dialog', { name: 'Configurações do grupo' });
  await tela.getByRole('button', { name: 'Comandos' }).click();
  await tela.getByRole('button', { name: '+ Criar comando' }).click();
  await tela.getByLabel('Nome (o que vem depois do /)').fill('regras');
  await tela.getByLabel('Descrição (aparece na lista do /)').fill('Mostra as regras');
  await tela.getByLabel('O que o comando responde').fill('1. Respeito com todo mundo.');
  await tela.getByRole('button', { name: 'Salvar comando' }).click();
  await expect(tela.locator('.rg-linha', { hasText: '/regras' })).toBeVisible({ timeout: 20_000 });
  // Nome de comando pronto é recusado.
  await tela.getByRole('button', { name: '+ Criar comando' }).click();
  await tela.getByLabel('Nome (o que vem depois do /)').fill('dado');
  await tela.getByLabel('O que o comando responde').fill('x');
  await tela.getByRole('button', { name: 'Salvar comando' }).click();
  await expect(page.getByText('/dado já é um comando pronto do Loftchat.')).toBeVisible({ timeout: 20_000 });
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await caixa.fill('/re');
  await expect(menu.locator('.cmd-menu__op', { hasText: '/regras' })).toContainText('Mostra as regras');
  await caixa.fill('/regras');
  await page.keyboard.press('Escape');
  await caixa.press('Enter');
  await expect(comando('regras').locator('.message__comando-cartao')).toHaveText('1. Respeito com todo mundo.', { timeout: 20_000 });
  await page.screenshot({ path: 'test-results/comandos/chat.png' });

  // A Ana (sem permissão de castigo) não vê /castigo na lista nem consegue usar.
  const cAna = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const pAna = await cAna.newPage();
  await pAna.goto('/');
  await signInThroughUi(pAna, ana);
  await pAna.locator(`.group-bar__button[data-group-id="${grupo}"]`).click();
  const caixaAna = pAna.locator('main.chat .composer__input');
  await expect(caixaAna).toBeVisible({ timeout: 30_000 });
  // (ela está de castigo: a caixa trava; o dono tira para o teste seguir)
  await page.locator('.app > .members').getByRole('tab', { name: 'Membros' }).click();
  // (o nome dela muda quando ela entra; ela é quem está no bloco "membros")
  await page.locator('.app > .members .members__section', { hasText: 'membros' }).locator('.member').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Tirar castigo' }).click();
  await expect(caixaAna).toBeEnabled({ timeout: 20_000 });
  await caixaAna.fill('/');
  const menuAna = pAna.locator('main.chat .cmd-menu');
  await expect(menuAna.locator('.cmd-menu__op', { hasText: '/dado' })).toBeVisible();
  await expect(menuAna.locator('.cmd-menu__op', { hasText: '/castigo' })).toHaveCount(0);
  await expect(menuAna.locator('.cmd-menu__op', { hasText: '/regras' })).toBeVisible();
  await caixaAna.fill(`/banir @${dono.displayName}`);
  await pAna.keyboard.press('Escape');
  await caixaAna.press('Enter');
  await expect(pAna.locator('main.chat .composer__error')).toContainText('Você não tem permissão para usar /banir.');
  await pAna.screenshot({ path: 'test-results/comandos/ana.png' });
  await ctx.close();
  await cAna.close();
});
