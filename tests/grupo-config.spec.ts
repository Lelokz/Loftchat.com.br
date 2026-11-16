import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import {
  createGroupThroughUi,
  limparTudo,
  newAccount,
  patchDocViaRest,
  readDocViaRest,
  resolveTokens,
  signUpFromInviteUi,
  signUpThroughUi,
} from './helpers';
import type { TestAccount } from './helpers';

/**
 * Proposta A, etapa 3a — Configurações do grupo (só o dono): foto e banner
 * com o ajustador, nome obrigatório, descrição e cor; o cartão do grupo no
 * topo da aba "Agora".
 */

const accounts: TestAccount[] = [];

test.afterAll(async () => {
  await limparTudo(accounts, 'grupo — limpeza');
});

async function imagemDeTeste(page: Page, largura: number, altura: number): Promise<Buffer> {
  const base64 = await page.evaluate(
    ([w, h]) => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d')!;
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, '#22c55e');
      g.addColorStop(1, '#1e3a8a');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      return c.toDataURL('image/png').split(',')[1]!;
    },
    [largura, altura] as const,
  );
  return Buffer.from(base64, 'base64');
}

async function escolherEAplicar(page: Page, botao: string, titulo: string, largura: number, altura: number) {
  const tela = page.getByRole('dialog', { name: 'Configurações do grupo' });
  const escolha = page.waitForEvent('filechooser');
  await tela.getByRole('button', { name: botao }).click();
  await (await escolha).setFiles({ name: 'grupo.png', mimeType: 'image/png', buffer: await imagemDeTeste(page, largura, altura) });
  const ajustador = page.getByRole('dialog', { name: titulo });
  await expect(ajustador).toBeVisible();
  await ajustador.getByRole('button', { name: 'Aplicar' }).click();
  await expect(ajustador).toBeHidden();
}

test('o dono muda foto, banner, nome, descrição e cor; o membro vê na aba e no cartão do grupo', async ({ browser }) => {
  test.setTimeout(150_000);
  const dono = newAccount('Dono grupo');
  const membro = newAccount('Membro grupo');
  accounts.push(dono, membro);

  const pDono = await (await browser.newContext()).newPage();
  await pDono.goto('/');
  await signUpThroughUi(pDono, dono);
  await resolveTokens(dono);
  await createGroupThroughUi(pDono, 'Grupo velho');
  await pDono.getByRole('button', { name: 'Opções do grupo' }).click();
  await pDono.getByRole('menuitem', { name: 'Convidar pessoas' }).click();
  const link = pDono.locator('.modal__link');
  await expect(link).toBeVisible({ timeout: 30_000 });
  const convite = new URL(await link.inputValue()).pathname;
  await pDono.getByRole('button', { name: 'Fechar' }).first().click();

  const pMembro = await (await browser.newContext()).newPage();
  await pMembro.goto(convite);
  await signUpFromInviteUi(pMembro, membro);
  await resolveTokens(membro);
  await pMembro.getByRole('button', { name: 'Entrar no grupo' }).click({ timeout: 30_000 });
  await expect(pMembro.locator('.channels__group-name')).toHaveText('Grupo velho', { timeout: 30_000 });

  // O membro NÃO vê as configurações do grupo.
  await pMembro.getByRole('button', { name: 'Opções do grupo' }).click();
  await expect(pMembro.getByRole('menuitem', { name: 'Sair do grupo' })).toBeVisible();
  await expect(pMembro.getByRole('menuitem', { name: 'Configurações do grupo' })).toHaveCount(0);
  await pMembro.keyboard.press('Escape');

  // --- o dono abre ---
  await pDono.getByRole('button', { name: 'Opções do grupo' }).click();
  await pDono.getByRole('menuitem', { name: 'Configurações do grupo' }).click();
  const tela = pDono.getByRole('dialog', { name: 'Configurações do grupo' });
  await expect(tela.getByLabel('Nome do grupo')).toHaveValue('Grupo velho', { timeout: 15_000 });
  const previa = tela.locator('.settings__preview .group-card');
  await expect(previa.locator('.person-card__handle')).toHaveText('2 membros');

  // Nome obrigatório: vazio avisa e não salva.
  await tela.getByLabel('Nome do grupo').fill('   ');
  await expect(tela.locator('#grupo-nome-aviso')).toHaveText('O grupo precisa de um nome.');
  const barra = tela.getByRole('region', { name: 'Alterações não salvas' });
  await barra.getByRole('button', { name: 'Salvar' }).click();
  await expect(tela.locator('.settings__error')).toHaveText('O grupo precisa de um nome.');

  await tela.getByLabel('Nome do grupo').fill('Turma do Loft');
  await tela.getByLabel('Descrição').fill('Jogos toda sexta às 20h.');
  await tela.getByRole('radiogroup', { name: 'Cor do grupo' }).getByRole('radio', { name: 'Verde' }).click();
  await escolherEAplicar(pDono, 'Escolher foto do grupo', 'Ajustar foto do grupo', 800, 800);
  await escolherEAplicar(pDono, 'Escolher banner', 'Ajustar banner', 1600, 500);
  await expect(previa.locator('.person-card__avatar img')).toBeVisible();
  await expect(previa.locator('.person-card__name')).toHaveText('Turma do Loft');
  await expect(previa.locator('.person-card__bio')).toHaveText('Jogos toda sexta às 20h.');

  // Esc com alteração pendente: a barra pisca, a tela fica.
  await pDono.keyboard.press('Escape');
  await expect(tela).toBeVisible();

  await barra.getByRole('button', { name: 'Salvar' }).click();
  await expect(barra).toBeHidden({ timeout: 15_000 });
  await pDono.keyboard.press('Escape');
  await expect(tela).toBeHidden();

  // No banco.
  const grupoId = await pDono.locator('.group-bar__tab.is-active').getAttribute('data-group-id');
  const doc = await readDocViaRest(dono, `groups/${grupoId}`);
  expect(doc.fields?.['name']?.stringValue).toBe('Turma do Loft');
  expect(doc.fields?.['description']?.stringValue).toBe('Jogos toda sexta às 20h.');
  expect(doc.fields?.['accentId']?.stringValue).toBe('verde');
  expect(doc.fields?.['photo']?.stringValue).toMatch(/^data:image\/(webp|jpeg);base64,/);
  const arte = await readDocViaRest(membro, `groupArt/${grupoId}`);
  expect(arte.status).toBe(200);
  expect(arte.fields?.['banner']?.stringValue).toMatch(/^data:image\/(webp|jpeg);base64,/);

  // --- o membro vê ---
  const aba = pMembro.locator(`.group-bar__tab[data-group-id="${grupoId}"]`);
  await expect(aba).toContainText('Turma do Loft', { timeout: 15_000 });
  await expect(aba.locator('img.avatar__img')).toBeVisible();
  await pMembro.locator('.group-panel__tab', { hasText: 'Agora' }).click();
  const cartao = pMembro.locator('.group-panel .group-card');
  await expect(cartao.locator('.person-card__name')).toHaveText('Turma do Loft');
  await expect(cartao.locator('.person-card__bio')).toHaveText('Jogos toda sexta às 20h.');
  await expect(cartao.locator('.person-card__banner')).toHaveCSS('background-image', /data:image/, { timeout: 15_000 });

  // --- regra ---
  const caminho = `groups/${grupoId}`;
  expect(await patchDocViaRest(membro, caminho, { description: 'invadido' })).toBe(403);
  expect(await patchDocViaRest(membro, `groupArt/${grupoId}`, { banner: 'data:image/jpeg;base64,/9j/4A==' })).toBe(403);
  expect(await patchDocViaRest(dono, caminho, { name: '   ' })).toBe(403);
  expect(await patchDocViaRest(dono, caminho, { name: 'x'.repeat(61) })).toBe(403);
  expect(await patchDocViaRest(dono, caminho, { description: 'x'.repeat(301) })).toBe(403);
  expect(await patchDocViaRest(dono, caminho, { accentId: 'red' })).toBe(403);
  expect(await patchDocViaRest(dono, caminho, { photo: 'data:image/svg+xml;base64,PHN2Zz4=' })).toBe(403);
  expect(await patchDocViaRest(dono, caminho, { ownerId: membro.uid })).toBe(403);
  expect(await patchDocViaRest(dono, `groupArt/${grupoId}`, { outra: 'coisa' })).toBe(403);
  expect(await patchDocViaRest(dono, caminho, { description: 'ok' })).toBe(200);

  await pDono.context().close();
  await pMembro.context().close();
});
