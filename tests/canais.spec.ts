import { expect, test } from '@playwright/test';

import {
  createGroupThroughUi,
  limparTudo,
  newAccount,
  patchDocRawViaRest,
  readDocViaRest,
  resolveTokens,
  signUpFromInviteUi,
  signUpThroughUi,
} from './helpers';
import type { TestAccount } from './helpers';

/**
 * Proposta A, etapa 3b — Configurações do grupo → Canais: emoji, nome,
 * ordem (arrastando ou pelas setas) e categorias.
 */

const accounts: TestAccount[] = [];

test.afterAll(async () => {
  await limparTudo(accounts, 'canais — limpeza');
});

test('emoji, renomear, ordem pelo teclado e arrastando, categoria nova; o membro vê na coluna de canais', async ({
  browser,
}) => {
  test.setTimeout(150_000);
  const dono = newAccount('Dono canais');
  const membro = newAccount('Membro canais');
  accounts.push(dono, membro);

  const pDono = await (await browser.newContext()).newPage();
  await pDono.goto('/');
  await signUpThroughUi(pDono, dono);
  await resolveTokens(dono);
  await createGroupThroughUi(pDono, 'Grupo canais');
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
  await expect(pMembro.locator('.channels__group-name')).toHaveText('Grupo canais', { timeout: 30_000 });

  // --- o dono abre Configurações do grupo → Canais ---
  await pDono.getByRole('button', { name: 'Opções do grupo' }).click();
  await pDono.getByRole('menuitem', { name: 'Configurações do grupo' }).click();
  const tela = pDono.getByRole('dialog', { name: 'Configurações do grupo' });
  await expect(tela.getByLabel('Nome do grupo')).toBeVisible({ timeout: 15_000 });
  await tela.getByRole('button', { name: 'Canais' }).click();
  await expect(tela.getByRole('heading', { name: 'Canais' })).toBeVisible();

  // Emoji em "anúncios".
  await tela.getByRole('button', { name: 'Escolher emoji de anúncios' }).click();
  await tela.getByRole('group', { name: 'Emojis para anúncios' }).getByRole('button', { name: '📢' }).click();

  // Renomear "geral".
  await tela.getByLabel('Nome do canal geral').fill('papo');

  // Teclado: seta para baixo na alça de "papo" troca com "anúncios".
  const semCategoriaTexto = tela.locator('.gc-list[data-kind="text"][data-cat=""]');
  const valores = () => semCategoriaTexto.locator('.gc-name').evaluateAll((ns) => ns.map((n) => (n as HTMLInputElement).value));
  await expect.poll(valores).toEqual(['papo', 'anúncios']);
  await tela.getByRole('button', { name: 'Mover geral' }).focus();
  await pDono.keyboard.press('ArrowDown');
  await expect.poll(valores).toEqual(['anúncios', 'papo']);
  await expect(tela.getByRole('button', { name: 'Mover papo' })).toBeFocused();

  // Categoria nova; "anúncios" vai para ela pelo seletor.
  await tela.getByRole('button', { name: 'Nova categoria' }).click();
  const nomeCategoria = tela.getByLabel('Nome da categoria');
  await expect(nomeCategoria).toBeFocused();
  await nomeCategoria.fill('Jogos');
  await tela.getByLabel('Categoria de anúncios').selectOption({ label: 'Jogos' });

  // Arrastar com o mouse: "Sala Principal" para a voz da categoria Jogos.
  const alca = tela.getByRole('button', { name: 'Mover Sala Principal' });
  const destino = tela.locator('.gc-block', { has: pDono.getByLabel('Nome da categoria') }).locator('.gc-list[data-kind="voice"] .gc-empty');
  const de = (await alca.boundingBox())!;
  const para = (await destino.boundingBox())!;
  await pDono.mouse.move(de.x + de.width / 2, de.y + de.height / 2);
  await pDono.mouse.down();
  await pDono.mouse.move(para.x + para.width / 2, para.y + para.height / 2, { steps: 12 });
  await pDono.mouse.up();
  await expect(tela.getByLabel('Categoria de Sala Principal')).toHaveValue(/.+/);

  const barra = tela.getByRole('region', { name: 'Alterações não salvas' });
  await barra.getByRole('button', { name: 'Salvar' }).click();
  await expect(barra).toBeHidden({ timeout: 15_000 });
  await pDono.keyboard.press('Escape');
  await expect(tela).toBeHidden();

  // --- no banco ---
  const grupoId = await pDono.locator('.group-bar__tab.is-active').getAttribute('data-group-id');
  const grupo = await readDocViaRest(dono, `groups/${grupoId}`);
  const categorias = grupo.fields?.['categories']?.arrayValue?.values ?? [];
  expect(categorias).toHaveLength(1);
  expect(categorias[0]?.mapValue?.fields?.['name']?.stringValue).toBe('Jogos');

  // --- o membro vê ---
  const colunaMembro = pMembro.locator('.channels');
  const jogos = colunaMembro.locator('.channels__section--category');
  await expect(jogos.locator('.section-title')).toHaveText('Jogos', { timeout: 15_000 });
  await expect(jogos.locator('.channel__name')).toHaveText(['anúncios', 'Sala Principal']);
  await expect(jogos.locator('.channel__emoji')).toHaveText('📢');
  await expect(colunaMembro.locator('.channels__section').first().locator('.channel__name')).toHaveText(['papo']);
  await expect(colunaMembro.locator('.channels__section', { hasText: 'voz' })).toHaveCount(0);
  // Quem já estava no canal vê o título mudar sem trocar de canal.
  await expect(pMembro.locator('.chat__title')).toHaveText('papo');
  await expect(pMembro.locator('.composer__input')).toHaveAttribute('placeholder', 'Mensagem para #papo');

  // --- regra ---
  const algumCanal = await pMembro.locator('.channel', { hasText: 'papo' }).getAttribute('data-channel-id');
  const caminho = `channels/${algumCanal}`;
  const s = (v: string) => ({ stringValue: v });
  expect(await patchDocRawViaRest(membro, caminho, { name: s('invadido') })).toBe(403);
  expect(await patchDocRawViaRest(dono, caminho, { name: s('   ') })).toBe(403);
  expect(await patchDocRawViaRest(dono, caminho, { kind: s('voice') })).toBe(403);
  expect(await patchDocRawViaRest(dono, caminho, { position: s('primeiro') })).toBe(403);
  expect(await patchDocRawViaRest(dono, caminho, { emoji: s('x'.repeat(17)) })).toBe(403);
  expect(await patchDocRawViaRest(dono, caminho, { emoji: s('🎮'), position: { integerValue: '3' } })).toBe(200);
  const muitas = Array.from({ length: 21 }, (_, i) => ({
    mapValue: { fields: { id: s(`c${i}`), name: s(`Cat ${i}`) } },
  }));
  expect(await patchDocRawViaRest(dono, `groups/${grupoId}`, { categories: { arrayValue: { values: muitas } } })).toBe(403);

  await pDono.context().close();
  await pMembro.context().close();
});

test('no celular: a seção Canais abre pela lista e o arrastar com o dedo muda a ordem', async ({ browser }) => {
  test.setTimeout(120_000);
  const dono = newAccount('Celular canais');
  accounts.push(dono);
  const contexto = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await contexto.newPage();
  await page.goto('/');
  await signUpThroughUi(page, dono);
  await createGroupThroughUi(page, 'Grupo celular');

  await page.getByRole('button', { name: 'Abrir canais' }).click();
  await page.getByRole('button', { name: 'Opções do grupo' }).click();
  await page.getByRole('menuitem', { name: 'Configurações do grupo' }).click();
  const tela = page.getByRole('dialog', { name: 'Configurações do grupo' });
  await expect(tela.getByLabel('Nome do grupo')).toBeVisible({ timeout: 15_000 });
  await tela.getByRole('button', { name: 'Voltar para as seções' }).click();
  await tela.getByRole('button', { name: 'Canais' }).click();

  const lista = tela.locator('.gc-list[data-kind="text"][data-cat=""]');
  const nomes = () => lista.locator('.gc-name').evaluateAll((ns) => ns.map((n) => (n as HTMLInputElement).value));
  await expect.poll(nomes).toEqual(['geral', 'anúncios']);

  // Dedo: segura a alça de "anúncios" e sobe até em cima de "geral".
  const alca = tela.getByRole('button', { name: 'Mover anúncios' });
  const de = (await alca.boundingBox())!;
  const para = (await tela.getByRole('button', { name: 'Mover geral' }).boundingBox())!;
  const ponto = (x: number, y: number) => ({ pointerId: 7, pointerType: 'touch', isPrimary: true, button: 0, clientX: x, clientY: y, bubbles: true });
  await alca.dispatchEvent('pointerdown', ponto(de.x + 10, de.y + 10));
  for (let i = 1; i <= 6; i++) {
    const y = de.y + 10 + ((para.y + 2 - (de.y + 10)) * i) / 6;
    await page.evaluate((p) => document.dispatchEvent(new PointerEvent('pointermove', p)), ponto(de.x + 10, y));
  }
  await page.evaluate((p) => document.dispatchEvent(new PointerEvent('pointerup', p)), ponto(de.x + 10, para.y + 2));
  await expect.poll(nomes).toEqual(['anúncios', 'geral']);
  await expect(tela.getByRole('region', { name: 'Alterações não salvas' })).toBeVisible();

  await contexto.close();
});
