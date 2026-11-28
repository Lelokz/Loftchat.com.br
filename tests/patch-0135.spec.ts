import { expect, test } from '@playwright/test';

import { createAccountViaRest, createGroupThroughUi, limparTudo, newAccount, resolveTokens, signUpThroughUi } from './helpers';
import type { TestAccount } from './helpers';
import { FS, comoDono, ligarCarteiroLocal } from './carteiro-local';

/**
 * PATCH 0.13.5 — os bugs reportados pelo Reportar bug:
 *   - a tela de Amigos (e a lista do privado) acompanha o perfil AO VIVO: o
 *     nome que passa a brilhar aparece sem reabrir o app;
 *   - o cartão no grupo não fecha quando só a ALTURA da tela muda (o teclado
 *     do celular abrindo na busca de cargos);
 *   - "Membro desde" do dono mostra a data;
 *   - a faixa "Vendo o grupo como" fica fora da área de arrastar a janela;
 *   - o "Quero jogar" quebra em linhas.
 */

const PASTA = 'test-results/patch-0135';
const contas: TestAccount[] = [];
test.skip(process.env['FIRESTORE_EMULATOR_HOST'] === undefined, 'só no emulador');
let desligar: (() => void) | undefined;
test.beforeAll(async () => {
  test.setTimeout(90_000);
  desligar = await ligarCarteiroLocal();
});
test.afterAll(async () => {
  desligar?.();
  await limparTudo(contas, 'patch 0.13.5 — limpeza');
});

const s = (v: string): Record<string, string> => ({ stringValue: v });

test('patch 0.13.5: amigos ao vivo, cartão com teclado, membro desde, ver como e quero jogar', async ({ browser }) => {
  test.setTimeout(240_000);
  const ana = newAccount('Ana');
  ana.displayName = 'Ana';
  const lucas = newAccount('Lucas');
  contas.push(ana, lucas);
  await createAccountViaRest(lucas);
  await comoDono(`users/${lucas.uid}`, { uid: lucas.uid!, displayName: 'Lucas', initials: 'LU', username: `t${lucas.uid!.slice(0, 10).toLowerCase()}`, createdAt: new Date().toISOString() });

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(20_000);
  await page.goto('/');
  await signUpThroughUi(page, ana);
  await resolveTokens(ana);

  // Amigos.
  const par = [ana.uid!, lucas.uid!].sort().join('_');
  const [x, y] = par.split('_') as [string, string];
  const r = await fetch(`${FS}/friendships/${par}`, {
    method: 'PATCH',
    headers: { authorization: 'Bearer owner', 'content-type': 'application/json' },
    body: JSON.stringify({ fields: { members: { arrayValue: { values: [s(x), s(y)] } }, from: s(ana.uid!), to: s(lucas.uid!), status: s('accepted'), createdAt: s(new Date().toISOString()) } }),
  });
  expect(r.ok).toBe(true);

  // AMIGOS AO VIVO: o Lucas aparece; o brilho dado depois aparece sem recarregar.
  await page.getByRole('button', { name: 'Privado', exact: true }).click();
  await page.getByRole('button', { name: 'Amigos', exact: true }).click();
  const nome = page.locator('.friends__name', { hasText: 'Lucas' });
  await expect(nome).toBeVisible();
  await expect(nome).not.toHaveClass(/nome-brilho/);
  const mudar = await fetch(`${FS}/users/${lucas.uid}?updateMask.fieldPaths=brilho&updateMask.fieldPaths=displayName`, {
    method: 'PATCH',
    headers: { authorization: 'Bearer owner', 'content-type': 'application/json' },
    body: JSON.stringify({ fields: { brilho: s('ouro'), displayName: s('Lucas Novo') } }),
  });
  expect(mudar.ok).toBe(true);
  const novo = page.locator('.friends__name', { hasText: 'Lucas Novo' });
  await expect(novo).toHaveClass(/nome-brilho--ouro/);
  await page.screenshot({ path: `${PASTA}/1-amigos-ao-vivo.png` });

  // Grupo: o cartão do dono (eu) no grupo.
  await createGroupThroughUi(page, 'Grupo do patch');
  // Um cargo para o "+" ter o que dar.
  await page.getByRole('button', { name: 'Opções do grupo' }).click();
  await page.getByRole('menuitem', { name: 'Configurações do grupo' }).click();
  const cfg = page.getByRole('dialog', { name: 'Configurações do grupo' });
  await cfg.getByRole('button', { name: 'Cargos' }).click();
  await cfg.getByRole('button', { name: '+ Criar cargo' }).click();
  await expect(cfg.getByRole('tab', { name: 'Aparência' })).toHaveAttribute('aria-selected', 'true', { timeout: 20_000 });
  await cfg.getByLabel('Nome do cargo').fill('Moderador');
  await cfg.getByRole('region', { name: 'Alterações não salvas' }).getByRole('button', { name: 'Salvar' }).click();
  await expect(cfg.getByRole('region', { name: 'Alterações não salvas' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(cfg).toHaveCount(0);
  const membros = page.locator('.app > .members');
  await membros.getByRole('tab', { name: 'Membros' }).click();
  await membros.locator('.member', { hasText: 'Ana' }).first().click();
  const pop = page.locator('.person-popover');
  await expect(pop).toBeVisible();
  // MEMBRO DESDE do dono: a data + "criou o grupo".
  const ano = String(new Date().getFullYear());
  await expect(pop.locator('.perfil-servidor__desde').last()).toContainText(ano);
  await expect(pop.locator('.perfil-servidor__desde').last()).toContainText('criou o grupo');
  // O "+" de cargos e a tela mudando SÓ de altura (o teclado do celular): o cartão fica.
  await pop.getByRole('button', { name: 'Dar cargo' }).click();
  await expect(page.getByRole('dialog', { name: 'Dar cargo' })).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 620 });
  await page.waitForTimeout(400);
  await expect(pop).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Dar cargo' })).toBeVisible();
  await page.screenshot({ path: `${PASTA}/2-cartao-com-teclado.png` });
  // Mudar a LARGURA ainda fecha (girar o celular, mudar a janela).
  await page.setViewportSize({ width: 1300, height: 620 });
  await expect(pop).toHaveCount(0);
  await page.setViewportSize({ width: 1440, height: 900 });

  // VER COMO e QUERO JOGAR: as regras de estilo novas.
  const estilos = await page.evaluate(() => {
    const faixa = document.createElement('div');
    faixa.className = 'ver-como';
    const fila = document.createElement('div');
    fila.className = 'jg-fila jg-fila--quero';
    document.body.append(faixa, fila);
    const regiao = getComputedStyle(faixa).getPropertyValue('-webkit-app-region') || getComputedStyle(faixa).getPropertyValue('app-region');
    const quebra = getComputedStyle(fila).flexWrap;
    faixa.remove();
    fila.remove();
    return { regiao, quebra };
  });
  expect(estilos.regiao).toBe('no-drag');
  expect(estilos.quebra).toBe('wrap');
  await ctx.close();
});
