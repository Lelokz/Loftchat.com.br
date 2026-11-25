import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { activeGroupId, createGroupThroughUi, limparTudo, newAccount, resolveTokens, signUpThroughUi } from './helpers';
import type { TestAccount } from './helpers';
import { canaisDoGrupo, comoDono, ligarCarteiroLocal } from './carteiro-local';

/**
 * GALERIA DO GRUPO (0.8.0): a aba Mídia do painel da direita junta as fotos,
 * GIFs e vídeos de todos os canais; "Ver tudo" abre a galeria grande (janela
 * no PC, tela cheia no celular), com filtro por tipo e por canal. O que tem
 * mais de 60 dias não aparece.
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
  await limparTudo(accounts, 'galeria — limpeza');
});

const GIF = Buffer.from('R0lGODlhAgACAIAAAP8AAP///yH5BAAAAAAALAAAAAACAAIAAAICjF8AOw==', 'base64');
const VIDEO = readFileSync(join(import.meta.dirname, 'arquivos-de-teste', 'video.webm'));
const DIA = 24 * 60 * 60 * 1000;

test('galeria: aba Mídia junta os canais, filtra, Ver tudo abre a grande, e o velho não aparece', async ({ browser }) => {
  test.setTimeout(240_000);
  const ana = newAccount('Ana galeria');
  const beto = newAccount('Beto galeria');
  accounts.push(ana, beto);

  const cAna = await browser.newContext();
  const pAna = await cAna.newPage();
  await pAna.goto('/');
  await signUpThroughUi(pAna, ana);
  await createGroupThroughUi(pAna, 'Turma das fotos');
  const grupo = await activeGroupId(pAna);
  const foto = await pAna.screenshot();

  // Foto, GIF e vídeo pelo + no #geral.
  const mandar = async (name: string, mimeType: string, buffer: Buffer): Promise<void> => {
    const escolha = pAna.waitForEvent('filechooser');
    // O menu fecha se a lista rolar (mensagem chegando): tenta de novo.
    await expect(async () => {
      await pAna.getByRole('button', { name: 'Anexar' }).click();
      await pAna.getByRole('menuitem', { name: /Foto, GIF ou vídeo/ }).click({ timeout: 2_000 });
    }).toPass({ timeout: 20_000 });
    await (await escolha).setFiles({ name, mimeType, buffer });
  };
  await mandar('print.png', 'image/png', foto);
  await expect(pAna.locator('.midia--image img')).toBeVisible({ timeout: 30_000 });
  await mandar('risada.gif', 'image/gif', GIF);
  await expect(pAna.locator('.midia--gif')).toBeVisible({ timeout: 30_000 });
  await mandar('clipe.webm', 'video/webm', VIDEO);
  await expect(pAna.locator('.midia--video .midia__rotulo')).toContainText('0:02', { timeout: 30_000 });
  const url = (await pAna.locator('.midia--image img').getAttribute('src'))!;

  // Uma foto de 20 dias atrás em OUTRO canal, e uma de 70 dias (passou dos 60: fora).
  const canais = await canaisDoGrupo(grupo);
  const outro = canais.find((c) => c.nome !== 'geral' && c.nome !== 'Sala Principal') ?? canais.find((c) => c.nome !== 'geral')!;
  const antiga = (id: string, dias: number): Promise<void> =>
    comoDono(`messages/${id}`, {
      groupId: grupo,
      channelId: outro.id,
      authorId: ana.uid!,
      kind: 'image',
      body: '',
      sentAt: new Date(Date.now() - dias * DIA).toISOString(),
      attachment: { url, fileName: 'velha.webp', mimeType: 'image/webp', sizeBytes: 1000 },
    });
  await antiga(`gal20${Date.now()}`, 20);
  await antiga(`gal70${Date.now()}`, 70);

  // O Beto entra e abre a aba Mídia.
  const cBeto = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const pBeto = await cBeto.newPage();
  await pBeto.goto('/');
  await signUpThroughUi(pBeto, beto);
  await resolveTokens(beto);
  await comoDono(`memberships/${grupo}_${beto.uid}`, { groupId: grupo, memberId: beto.uid!, role: 'member' });
  await pBeto.reload();
  await pBeto.locator(`.group-bar__button[data-group-id="${grupo}"]`).click();
  const painel = pBeto.locator('.app > .members');
  await expect.poll(() => painel.locator('.group-panel__tab').allTextContents()).toEqual(['Agora', 'Membros', 'Mídia', 'Fixadas']);
  await painel.getByRole('tab', { name: 'Mídia' }).click();
  const itens = painel.locator('.galeria__item');
  await expect(itens).toHaveCount(4, { timeout: 30_000 });
  await expect(painel.getByRole('button', { name: 'Ver tudo (4)' })).toBeVisible();
  // As de agora em "Esta semana"; a de 20 dias no bloco do mês dela.
  await expect(painel.locator('.galeria__periodo').first()).toHaveText('Esta semana');
  await expect(painel.locator('.galeria__periodo')).toHaveCount(2);
  // Selos: vídeo com duração e play, GIF com etiqueta.
  await expect(painel.locator('.galeria__item[data-kind="video"] .galeria__selo')).toHaveText('0:02');
  await expect(painel.locator('.galeria__item[data-kind="gif"] .galeria__selo')).toHaveText('GIF');

  // Filtro da aba: Fotos = as 2 imagens; Vídeos = 1.
  await painel.getByRole('button', { name: 'Fotos', exact: true }).click();
  await expect(itens).toHaveCount(2);
  await painel.getByRole('button', { name: 'Vídeos', exact: true }).click();
  await expect(itens).toHaveCount(1);
  await painel.getByRole('button', { name: 'Tudo', exact: true }).click();
  await expect(itens).toHaveCount(4);

  // Nova foto aparece sozinha (tempo real).
  await mandar('outra.png', 'image/png', foto);
  await expect(itens).toHaveCount(5, { timeout: 30_000 });
  await expect(painel.getByRole('button', { name: 'Ver tudo (5)' })).toBeVisible();

  // Ver tudo: a galeria grande, no meio da tela (PC).
  await painel.getByRole('button', { name: 'Ver tudo (5)' }).click();
  const galeria = pBeto.getByRole('dialog', { name: 'Galeria' });
  await expect(galeria).toBeVisible();
  await expect(galeria.locator('.galeria__resumo')).toHaveText('Tudo que a turma mandou em Turma das fotos · 5 arquivos');
  await expect(galeria.locator('.galeria__item')).toHaveCount(5);
  // Na grande aparece quem mandou.
  await expect(galeria.locator('.galeria__quem').first()).toContainText('Ana galeria');
  const caixa = (await galeria.boundingBox())!;
  expect(caixa.width).toBeLessThan(1440);
  expect(caixa.x).toBeGreaterThan(0);
  // Filtro por canal: só o outro canal = a foto de 20 dias.
  await galeria.getByRole('combobox', { name: 'Canal' }).selectOption(outro.id);
  await expect(galeria.locator('.galeria__item')).toHaveCount(1);
  await galeria.getByRole('combobox', { name: 'Canal' }).selectOption('');
  await galeria.getByRole('button', { name: 'Vídeos', exact: true }).click();
  await expect(galeria.locator('.galeria__item')).toHaveCount(1);
  await pBeto.screenshot({ path: 'test-results/galeria/pc-ver-tudo.png' });

  // Clicar no vídeo abre o vídeo tocando; Esc fecha só ele.
  await galeria.locator('.galeria__item').first().click();
  const video = pBeto.getByRole('dialog', { name: 'Vídeo' });
  await expect(video.locator('video')).toHaveAttribute('src', /\/arquivo\/video\//);
  await pBeto.keyboard.press('Escape');
  await expect(video).toHaveCount(0);
  await expect(galeria).toBeVisible();
  // Foto abre em tela cheia.
  await galeria.getByRole('button', { name: 'Fotos', exact: true }).click();
  await galeria.locator('.galeria__item').first().click();
  await expect(pBeto.getByRole('dialog', { name: 'Imagem' })).toBeVisible();
  await pBeto.keyboard.press('Escape');
  // E o X fecha a galeria.
  await galeria.getByRole('button', { name: 'Fechar galeria' }).click();
  await expect(galeria).toHaveCount(0);

  // Celular: aba na gaveta da direita; Ver tudo em tela cheia, 3 por linha.
  await pBeto.setViewportSize({ width: 390, height: 844 });
  await pBeto.getByRole('button', { name: 'Abrir membros' }).click();
  const gaveta = pBeto.locator('.app > .members');
  await gaveta.getByRole('tab', { name: 'Mídia' }).click();
  // As 4 abas cabem sem cortar.
  for (const aba of await gaveta.locator('.group-panel__tab').all()) {
    expect(await aba.evaluate((b) => b.scrollWidth <= b.clientWidth)).toBe(true);
  }
  await expect(gaveta.locator('.galeria__item')).toHaveCount(5, { timeout: 30_000 });
  await pBeto.waitForTimeout(600); // a gaveta termina de abrir (só para a foto)
  await pBeto.screenshot({ path: 'test-results/galeria/celular-aba.png' });
  await gaveta.getByRole('button', { name: 'Ver tudo (5)' }).click();
  const cheia = (await galeria.boundingBox())!;
  expect(cheia.width).toBe(390);
  expect(cheia.height).toBe(844);
  const caixas = await galeria.locator('.galeria__item').evaluateAll((els) => els.slice(0, 3).map((e) => e.getBoundingClientRect().top));
  expect(new Set(caixas.map(Math.round)).size).toBe(1);
  await pBeto.screenshot({ path: 'test-results/galeria/celular-ver-tudo.png' });

  await cAna.close();
  await cBeto.close();
});
