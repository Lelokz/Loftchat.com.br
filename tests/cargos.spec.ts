import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import {
  activeGroupId,
  createAccountViaRest,
  createGroupThroughUi,
  limparTudo,
  newAccount,
  patchDocRawViaRest,
  resolveTokens,
  signUpThroughUi,
  writeMessageAt,
} from './helpers';
import type { TestAccount } from './helpers';
import { canaisDoGrupo, comoDono } from './carteiro-local';

/**
 * CARGOS (0.8.5, etapa 1): o dono cria, edita (nome, cor, ícone, bloco,
 * permissões), ordena, dá e tira cargos; o nome do membro aparece com a cor
 * e o ícone do cargo, a lista de membros em blocos, e o perfil com as
 * etiquetas. Quem não é dono não consegue mexer (regras do banco).
 */

const contas: TestAccount[] = [];
test.describe.configure({ mode: 'serial' });
test.skip(process.env['FIRESTORE_EMULATOR_HOST'] === undefined, 'só no emulador');
test.afterAll(async () => {
  await limparTudo(contas, 'cargos — limpeza');
});

async function abrirCargos(page: Page): Promise<ReturnType<Page['getByRole']>> {
  await page.getByRole('button', { name: 'Opções do grupo' }).click();
  await page.getByRole('menuitem', { name: 'Configurações do grupo' }).click();
  const tela = page.getByRole('dialog', { name: 'Configurações do grupo' });
  await expect(tela).toBeVisible();
  await tela.getByRole('button', { name: 'Cargos', exact: true }).click();
  return tela;
}

test('cargos: criar, editar, ordenar, dar, aparecer no chat/lista/perfil, e só o dono mexe', async ({ browser }) => {
  test.setTimeout(240_000);
  const dono = newAccount('Dono cargos');
  const beto = newAccount('Beto cargos');
  contas.push(dono, beto);
  await createAccountViaRest(beto);

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto('/');
  await signUpThroughUi(page, dono);
  await resolveTokens(dono);
  await createGroupThroughUi(page, 'Grupo dos cargos');
  const grupo = await activeGroupId(page);
  await comoDono(`users/${beto.uid}`, { uid: beto.uid!, displayName: 'Beto', initials: 'BE' });
  await comoDono(`memberships/${grupo}_${beto.uid}`, { groupId: grupo, memberId: beto.uid!, role: 'member', joinedAt: new Date().toISOString() });
  const geral = (await canaisDoGrupo(grupo)).find((c) => c.nome === 'geral')!;
  expect(await writeMessageAt(beto, { groupId: grupo, channelId: geral.id, body: 'oi, sou o Beto', sentAt: new Date().toISOString() })).toBe(200);

  // A tela de Cargos: @todos, Dono fixo e o Administrador que já vem criado.
  const tela = await abrirCargos(page);
  await expect(tela.getByRole('button', { name: /@todos — o básico do grupo/ })).toBeVisible();
  const linhas = tela.locator('.cg-linha');
  await expect(linhas).toHaveCount(2, { timeout: 20_000 });
  await expect(linhas.nth(0)).toContainText('Dono');
  await expect(linhas.nth(1)).toContainText('Administrador');

  // Criar cargo: abre direto no editor (Aparência).
  await tela.getByRole('button', { name: '+ Criar cargo' }).click();
  await expect(tela.getByRole('tab', { name: 'Aparência' })).toHaveAttribute('aria-selected', 'true', { timeout: 20_000 });
  await tela.getByLabel('Nome do cargo').fill('Moderador');
  await tela.getByRole('radio', { name: 'Sólida' }).click();
  await tela.getByRole('radio', { name: '#3d6fd1' }).click();
  await tela.getByRole('button', { name: '🛡️' }).click();
  await tela.getByRole('switch', { name: 'Mostrar separado na lista de membros' }).click();
  // Prévia ao vivo: o bloco e o nome com o ícone.
  await expect(tela.locator('.cg-previa__bloco').first()).toHaveText('Moderador — 1');
  await page.screenshot({ path: 'test-results/cargos/pc-aparencia.png' });
  // Permissões: liga "Expulsar"; a busca acha.
  await tela.getByRole('tab', { name: 'Permissões' }).click();
  await tela.getByLabel('Procurar permissão').fill('expul');
  await expect(tela.locator('.cg-perm')).toHaveCount(1);
  await tela.getByRole('switch', { name: 'Expulsar' }).click();
  await expect(tela.getByRole('switch', { name: 'Expulsar' })).toHaveAttribute('aria-checked', 'true');
  // Salvar pela barra.
  const barra = tela.getByRole('region', { name: 'Alterações não salvas' });
  await barra.getByRole('button', { name: 'Salvar' }).click();
  await expect(barra).toBeHidden({ timeout: 20_000 });

  // Membros do cargo: dar para o Beto.
  await tela.getByRole('tab', { name: /Membros/ }).click();
  await tela.locator('.cg-membro', { hasText: 'Beto' }).getByRole('button', { name: 'Dar' }).click();
  await expect(tela.getByRole('tab', { name: 'Membros (1)' })).toBeVisible({ timeout: 20_000 });

  // De volta à lista: Moderador abaixo do Administrador; arrastar para cima.
  await tela.getByRole('button', { name: '‹ Voltar' }).click();
  await expect(linhas).toHaveCount(3);
  await expect(linhas.nth(2)).toContainText('Moderador');
  const pega = linhas.nth(2).locator('.cg-pega');
  const alvo = (await linhas.nth(1).boundingBox())!;
  const de = (await pega.boundingBox())!;
  await page.mouse.move(de.x + de.width / 2, de.y + de.height / 2);
  await page.mouse.down();
  await page.mouse.move(de.x + de.width / 2, alvo.y + 4, { steps: 8 });
  await page.mouse.up();
  await expect(linhas.nth(1)).toContainText('Moderador');
  await expect(linhas.nth(1)).toContainText('👤 1');

  // Seção Membros: o Beto com a etiqueta.
  await tela.getByRole('button', { name: 'Membros', exact: true }).click();
  await expect(tela.locator('.cg-mlinha', { hasText: 'Beto' }).locator('.cg-chip', { hasText: 'Moderador' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(tela).toHaveCount(0);

  // No chat: nome do Beto na cor do cargo, com o ícone.
  const autor = page.locator('.message__author', { hasText: 'Beto' });
  await expect(autor).toHaveClass(/nome-cargo/, { timeout: 20_000 });
  await expect(page.locator('.message__meta', { hasText: 'Beto' }).locator('.icone-cargo')).toHaveText('🛡️');
  // Lista de membros em blocos: Dono e Moderador.
  const painel = page.locator('.app > .members');
  await painel.getByRole('tab', { name: 'Membros' }).click();
  await expect(painel.locator('.section-title')).toHaveText(['dono — 1', 'moderador — 1']);
  await expect(painel.locator('.members__section', { hasText: 'moderador' }).locator('.icone-cargo')).toHaveText('🛡️');

  // Perfil do Beto: etiquetas; o + dá o Administrador; o × tira.
  await painel.locator('.member', { hasText: 'Beto' }).click();
  const perfil = page.getByRole('dialog', { name: 'Perfil de Beto' });
  await expect(perfil.locator('.cg-chip', { hasText: 'Moderador' })).toBeVisible();
  await perfil.getByRole('button', { name: 'Dar cargo' }).click();
  await page.getByRole('dialog', { name: 'Dar cargo' }).getByRole('checkbox', { name: /Administrador/ }).click();
  await expect(perfil.locator('.cg-chip', { hasText: 'Administrador' })).toBeVisible();
  await page.keyboard.press('Escape');
  await perfil.getByRole('button', { name: 'Tirar o cargo Administrador' }).click();
  await expect(perfil.locator('.cg-chip', { hasText: 'Administrador' })).toHaveCount(0);
  await page.keyboard.press('Escape');

  // Quem não é dono não mexe: nem no cargo, nem dar cargo para si.
  await resolveTokens(beto);
  expect(
    await patchDocRawViaRest(beto, `memberships/${grupo}_${beto.uid}`, {
      cargos: { arrayValue: { values: [{ stringValue: 'qualquer' }] } },
    }),
  ).toBe(403);
  expect(await patchDocRawViaRest(beto, `cargos/${grupo}_todos`, { nome: { stringValue: 'hackeado' } })).toBe(403);

  // Apagar um cargo pela lista (com confirmação na própria linha).
  const tela2 = await abrirCargos(page);
  const admin = tela2.locator('.cg-linha', { hasText: 'Administrador' });
  await admin.getByRole('button', { name: 'Apagar Administrador' }).click();
  await admin.getByRole('button', { name: 'Apagar', exact: true }).click();
  await expect(tela2.locator('.cg-linha', { hasText: 'Administrador' })).toHaveCount(0, { timeout: 20_000 });
  await page.screenshot({ path: 'test-results/cargos/pc-lista.png' });

  // Celular: o editor abre sem a coluna lateral, com "‹ Cargos" para voltar.
  await page.setViewportSize({ width: 390, height: 844 });
  await tela2.locator('.cg-linha', { hasText: 'Moderador' }).click();
  await expect(tela2.getByRole('button', { name: '‹ Cargos' })).toBeVisible();
  await expect(tela2.locator('.cg-lado')).toBeHidden();
  await tela2.getByRole('tab', { name: 'Permissões' }).click();
  await page.screenshot({ path: 'test-results/cargos/celular-permissoes.png' });
  await ctx.close();
});
