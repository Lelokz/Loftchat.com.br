import { expect, test } from '@playwright/test';
import { readFileSync, rmSync, truncateSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { activeGroupId, createGroupThroughUi, limparTudo, newAccount, resolveTokens, signInThroughUi, signUpThroughUi } from './helpers';
import type { TestAccount } from './helpers';
import { CARTEIRO, comoDono, ligarCarteiroLocal } from './carteiro-local';

/**
 * IMAGEM, GIF E VÍDEO (0.5.0), de ponta a ponta: o + do campo, colar,
 * legenda, a fila "Enviando…", o outro membro vendo, imagem em tela cheia,
 * GIF com etiqueta, vídeo que só carrega no play, limite de 50 MB e o
 * arquivo vencido que vira "expirou". Carteiro e R2 locais.
 */

const accounts: TestAccount[] = [];
let desligar: (() => void) | undefined;
test.describe.configure({ mode: 'serial' });
test.skip(process.env['FIRESTORE_EMULATOR_HOST'] === undefined, 'só no emulador');
test.beforeAll(async () => {
  test.setTimeout(90_000);
  desligar = await ligarCarteiroLocal();
});
test.afterAll(async () => {
  desligar?.();
  await limparTudo(accounts, 'mídia — limpeza');
});

const GIF = Buffer.from('R0lGODlhAgACAIAAAP8AAP///yH5BAAAAAAALAAAAAACAAIAAAICjF8AOw==', 'base64');
const VIDEO = readFileSync(join(import.meta.dirname, 'arquivos-de-teste', 'video.webm'));

test('mídia: imagem, GIF e vídeo pelo +, colando, com legenda, e o outro membro vê', async ({ browser }) => {
  test.setTimeout(240_000);
  const ana = newAccount('Ana mídia');
  const beto = newAccount('Beto mídia');
  accounts.push(ana, beto);

  const cAna = await browser.newContext();
  const pAna = await cAna.newPage();
  await pAna.goto('/');
  await signUpThroughUi(pAna, ana);
  await createGroupThroughUi(pAna, 'Grupo das fotos');
  const grupo = await activeGroupId(pAna);
  const foto = await pAna.screenshot(); // uma imagem de verdade, 1280×720

  const cBeto = await browser.newContext();
  const pBeto = await cBeto.newPage();
  await pBeto.goto('/');
  await signUpThroughUi(pBeto, beto);
  await resolveTokens(beto);
  await comoDono(`memberships/${grupo}_${beto.uid}`, { groupId: grupo, memberId: beto.uid!, role: 'member' });
  await pBeto.reload();
  await pBeto.locator(`.group-bar__button[data-group-id="${grupo}"]`).click();

  // Imagem pelo +, com legenda (o texto do campo).
  await pAna.locator('.composer__input').fill('olha o print');
  const escolha = pAna.waitForEvent('filechooser');
  await pAna.getByRole('button', { name: 'Mandar imagem, GIF ou vídeo' }).click();
  await (await escolha).setFiles({ name: 'print.png', mimeType: 'image/png', buffer: foto });
  const imagemAna = pAna.locator('.midia--image img');
  await expect(imagemAna).toBeVisible({ timeout: 30_000 });
  expect(await imagemAna.getAttribute('src')).toMatch(new RegExp(`^${CARTEIRO}/arquivo/imagem/`));
  await expect(pAna.locator('.message', { has: pAna.locator('.midia--image') }).locator('.message__text')).toHaveText('olha o print');
  await expect(pAna.locator('.composer__input')).toHaveValue('');
  // Foi encolhida e virou WebP.
  const tipo = await pAna.evaluate(async (src) => (await fetch(src)).headers.get('content-type'), (await imagemAna.getAttribute('src'))!);
  expect(tipo).toBe('image/webp');

  // O Beto vê.
  await expect(pBeto.locator('.midia--image img')).toBeVisible({ timeout: 30_000 });

  // Tela cheia ao clicar, Esc fecha.
  await pAna.locator('.midia--image').click();
  await expect(pAna.getByRole('dialog', { name: 'Imagem' })).toBeVisible();
  await pAna.keyboard.press('Escape');
  await expect(pAna.getByRole('dialog', { name: 'Imagem' })).toHaveCount(0);

  // GIF colando no campo (Ctrl+V).
  await pAna.locator('.composer__input').click();
  await pAna.evaluate((b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const dados = new DataTransfer();
    dados.items.add(new File([bytes], 'risada.gif', { type: 'image/gif' }));
    document.querySelector('.composer__input')!.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dados, bubbles: true, cancelable: true }));
  }, GIF.toString('base64'));
  await expect(pAna.locator('.midia--gif .midia__gif')).toHaveText('GIF', { timeout: 30_000 });
  // GIF não abre em tela cheia nem tem play: anima sozinho.
  await expect(pAna.locator('.midia--gif .midia__play')).toHaveCount(0);

  // Vídeo: capa, play, duração e tamanho; só carrega no play.
  const escolha2 = pAna.waitForEvent('filechooser');
  await pAna.getByRole('button', { name: 'Mandar imagem, GIF ou vídeo' }).click();
  await (await escolha2).setFiles({ name: 'clipe.webm', mimeType: 'video/webm', buffer: VIDEO });
  const video = pAna.locator('.midia--video');
  await expect(video.locator('.midia__rotulo')).toContainText('0:02', { timeout: 30_000 });
  await expect(video.locator('.midia__capa')).toBeVisible();
  await expect(video.locator('video')).toHaveCount(0);
  await pAna.screenshot({ path: 'test-results/midia/pc.png' });
  await video.getByRole('button', { name: 'Assistir o vídeo' }).click();
  await expect(video.locator('video')).toHaveAttribute('src', new RegExp(`^${CARTEIRO}/arquivo/video/`));

  // Vídeo de 51 MB: recusado com o motivo.
  const escolha3 = pAna.waitForEvent('filechooser');
  await pAna.getByRole('button', { name: 'Mandar imagem, GIF ou vídeo' }).click();
  const grande = join(process.env['TMPDIR'] ?? tmpdir(), `grande-${Date.now()}.mp4`);
  writeFileSync(grande, Buffer.alloc(0));
  truncateSync(grande, 51 * 1024 * 1024);
  await (await escolha3).setFiles(grande);
  rmSync(grande, { force: true });
  await expect(pAna.getByText(/O limite é 50 MB/)).toBeVisible({ timeout: 15_000 });

  // Depois de 61 dias a limpeza apaga: o lugar vira "expirou".
  await fetch(`${CARTEIRO}/teste/limpar?agora=${Date.now() + 61 * 24 * 60 * 60 * 1000}`, { method: 'POST' });
  // (Quem já tinha visto continua vendo, do próprio aparelho; um aparelho novo vê o aviso.)
  const cNovo = await browser.newContext();
  const pNovo = await cNovo.newPage();
  await pNovo.goto('/');
  await signInThroughUi(pNovo, beto);
  await pNovo.locator(`.group-bar__button[data-group-id="${grupo}"]`).click();
  await expect(pNovo.getByText('⏳ Esta imagem expirou (os arquivos ficam 60 dias).')).toBeVisible({ timeout: 30_000 });
  await expect(pNovo.getByText('⏳ Este GIF expirou (os arquivos ficam 60 dias).')).toBeVisible();
  await cNovo.close();

  await cAna.close();
  await cBeto.close();
});

test('mídia no celular: o + e a imagem cabem na tela', async ({ browser }) => {
  const conta = newAccount('Mídia cel');
  accounts.push(conta);
  const ctx = await browser.newContext({ viewport: { width: 393, height: 851 }, deviceScaleFactor: 2.75, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto('/');
  await signUpThroughUi(page, conta);
  await createGroupThroughUi(page, 'Grupo cel');
  const foto = await page.screenshot();
  const escolha = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Mandar imagem, GIF ou vídeo' }).click();
  await (await escolha).setFiles({ name: 'foto.png', mimeType: 'image/png', buffer: foto });
  const img = page.locator('.midia--image img');
  await expect(img).toBeVisible({ timeout: 30_000 });
  const caixa = await img.boundingBox();
  expect(caixa!.x + caixa!.width).toBeLessThanOrEqual(393);
  await page.screenshot({ path: 'test-results/midia/celular.png' });
  await ctx.close();
});
