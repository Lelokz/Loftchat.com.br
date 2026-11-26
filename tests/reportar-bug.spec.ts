import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';

import { createAccountViaRest, limparTudo, newAccount, resolveTokens, signUpThroughUi } from './helpers';
import type { TestAccount } from './helpers';
import { CARTEIRO, CHAVE_REPORTES_DE_TESTE, FS, ligarCarteiroLocal, lerComoDono } from './carteiro-local';

/**
 * REPORTAR BUG 0.13.0: a aba nas Configurações (título, categoria, texto,
 * áudio, anexos), "Meus reportes" com Enviado → Visto → Consertado, o
 * Caçador de bugs por bug CONFIRMADO, o limite de 5 por dia, o lado do
 * criador (com a chave) e as regras.
 */

const PASTA = 'test-results/reportar-bug';
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
  await limparTudo(contas, 'reportar bug — limpeza');
});

// Um PNG de 1×1 de verdade.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

async function admin(rota: string, init: RequestInit = {}, chave = CHAVE_REPORTES_DE_TESTE): Promise<Response> {
  return fetch(`${CARTEIRO}${rota}`, { ...init, headers: { authorization: `Chave ${chave}`, 'content-type': 'application/json' } });
}
const marcar = async (acao: string, ids: string[], versao?: string): Promise<Record<string, unknown>> =>
  (await (await admin('/reportes/admin', { method: 'POST', body: JSON.stringify({ acao, ids, ...(versao ? { versao } : {}) }) })).json()) as Record<string, unknown>;

async function mandarPelaApi(conta: TestAccount, titulo: string): Promise<number> {
  await resolveTokens(conta);
  const r = await fetch(`${CARTEIRO}/reportes`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${conta.idToken}` },
    body: JSON.stringify({ titulo, categoria: 'outro', texto: 'teste de limite', anexos: [], aparelho: {} }),
  });
  return r.status;
}

test('reportar bug: mandar pela tela, acompanhar, Caçador de bugs, limite e regras', async ({ browser }) => {
  test.setTimeout(300_000);
  mkdirSync(PASTA, { recursive: true });
  const lucas = newAccount('Lucas');
  lucas.displayName = 'Lucas';
  const ana = newAccount('Ana');
  contas.push(lucas, ana);
  await createAccountViaRest(ana);

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(20_000);
  await page.goto('/');
  await signUpThroughUi(page, lucas);
  await resolveTokens(lucas);

  // Configurações → Reportar bug (na seção Loftchat).
  await page.getByRole('button', { name: 'Configurações' }).first().click();
  await page.locator('.settings__nav-item', { hasText: 'Reportar bug' }).click();
  const cfg = page.locator('.settings__content');
  await expect(cfg.getByRole('heading', { name: 'Reportar bug' })).toBeVisible();
  await expect(cfg.getByRole('tab', { name: 'Novo reporte' })).toHaveAttribute('aria-selected', 'true');
  await expect(cfg.locator('.rbg-cacador')).toContainText('Nenhum bug confirmado ainda');
  await expect(cfg.locator('.rbg-vai')).toContainText('Loftchat');
  await expect(cfg.locator('.rbg-fim__restam')).toContainText('Você ainda pode mandar 5 hoje.');
  // No navegador não tem "Tirar print agora" (só no programa do PC).
  await expect(cfg.getByRole('button', { name: 'Tirar print agora' })).toBeHidden();

  // Sem título: não manda.
  await cfg.getByRole('button', { name: 'Enviar reporte' }).click();
  await expect(cfg.getByRole('alert')).toHaveText('Escreva um título.');

  await cfg.getByLabel('Título').fill('O áudio corta quando alguém entra na sala');
  await expect(cfg.locator('.settings__count')).toHaveText('41/80');
  await cfg.getByRole('button', { name: 'Enviar reporte' }).click();
  await expect(cfg.getByRole('alert')).toHaveText('Escolha a categoria.');

  // A lista de categorias (13), com Escape fechando só ela.
  await cfg.locator('#rbg-categoria').click();
  const lista = page.getByRole('listbox', { name: 'Categoria' });
  await expect(lista.getByRole('option')).toHaveCount(13);
  await page.screenshot({ path: `${PASTA}/2-categorias.png` });
  await page.keyboard.press('Escape');
  await expect(lista).toHaveCount(0);
  await expect(page.locator('dialog.settings[open]')).toBeVisible();
  await cfg.locator('#rbg-categoria').click();
  await lista.getByRole('option', { name: 'Chamada de voz e vídeo' }).click();
  await expect(cfg.locator('#rbg-categoria')).toContainText('Chamada de voz e vídeo');

  await cfg.getByLabel('O que aconteceu').fill('Eu estava na Sala Principal. Quando a Bia entrou, o áudio cortou por uns 3 segundos.');

  // Áudio (microfone de mentira do Chromium).
  await cfg.getByRole('button', { name: 'Gravar áudio' }).click();
  await expect(cfg.locator('.rbg-audio--gravando')).toBeVisible();
  await page.waitForTimeout(1600);
  await cfg.getByRole('button', { name: 'Parar a gravação' }).click();
  await expect(cfg.getByRole('button', { name: 'Ouvir o áudio' })).toBeVisible();
  await expect(cfg.locator('.rbg-audio__tm')).toContainText('0:00 / 0:0');

  // Anexos: uma imagem e um arquivo.
  await page.locator('#rbg-arquivos').setInputFiles([
    { name: 'print.png', mimeType: 'image/png', buffer: PNG },
    { name: 'log.txt', mimeType: 'text/plain', buffer: Buffer.from('erro: áudio cortou') },
  ]);
  await expect(cfg.locator('.rbg-anx')).toHaveCount(2);
  await expect(cfg.locator('.rbg-rot .settings__help').last()).toHaveText('2 de 5');
  await page.screenshot({ path: `${PASTA}/1-novo-reporte.png` });
  await cfg.locator('.rbg-anexos').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${PASTA}/1b-novo-reporte-embaixo.png` });

  // Manda: pula para "Meus reportes".
  await cfg.getByRole('button', { name: 'Enviar reporte' }).click();
  await expect(cfg.getByRole('tab', { name: /Meus reportes/ })).toHaveAttribute('aria-selected', 'true');
  await expect(cfg.locator('.rbg-feito')).toHaveText('Reporte enviado. Valeu por ajudar!');
  const cartao = cfg.locator('.rbg-card').first();
  await expect(cartao).toContainText('O áudio corta quando alguém entra na sala');
  await expect(cartao).toHaveClass(/rbg-card--novo/);
  await expect(cartao.locator('.rbg-est')).toHaveText('Enviado');
  await expect(cartao).toContainText('2 anexos');
  await expect(cfg.locator('.rbg-aba__n')).toHaveText('1');
  await page.screenshot({ path: `${PASTA}/3-meus-reportes.png` });

  // No banco: tudo junto, e só o dono lê.
  const docs = (await (await fetch(`${FS}/reportes`, { headers: { authorization: 'Bearer owner' } })).json()) as { documents?: { name: string; fields: Record<string, Record<string, unknown>> }[] };
  const doc = docs.documents!.find((d) => (d.fields['uid'] as { stringValue: string }).stringValue === lucas.uid)!;
  const id = doc.name.split('/').at(-1)!;
  const salvo = JSON.stringify(doc.fields);
  expect(salvo).toContain('"categoria":{"stringValue":"chamada"}');
  expect(salvo).toContain('reporte/');
  expect(salvo).toContain('log.txt');
  expect(salvo).toContain('"tipo":{"stringValue":"navegador"}');
  const chaveDoPrint = /"chave":\{"stringValue":"(reporte\/[^"]+)"\},"tipo":\{"stringValue":"imagem"\}/.exec(salvo)?.[1] ?? /(reporte\/[A-Za-z0-9_-]+\/[a-z0-9]{20})/.exec(salvo)![1]!;

  await resolveTokens(ana);
  expect((await fetch(`${FS}/reportes/${id}`, { headers: { authorization: `Bearer ${ana.idToken}` } })).status).toBe(403);
  expect((await fetch(`${FS}/reportes/${id}`, { headers: { authorization: `Bearer ${lucas.idToken}` } })).status).toBe(200);
  const criar = await fetch(`${FS}/reportes?documentId=falso`, {
    method: 'POST',
    headers: { authorization: `Bearer ${lucas.idToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ fields: { uid: { stringValue: lucas.uid }, titulo: { stringValue: 'x' } } }),
  });
  expect(criar.status).toBe(403);
  // Os arquivos não saem pelo endereço público.
  expect((await fetch(`${CARTEIRO}/arquivo/${chaveDoPrint}`)).status).toBe(404);

  // O lado do criador: sem a chave, nada.
  expect((await admin('/reportes/admin/lista', {}, 'x'.repeat(CHAVE_REPORTES_DE_TESTE.length))).status).toBe(403);
  const listaAdmin = (await (await admin('/reportes/admin/lista')).json()) as { reportes: Array<Record<string, unknown>> };
  const meu = listaAdmin.reportes.find((r) => r['id'] === id)!;
  expect(meu['titulo']).toBe('O áudio corta quando alguém entra na sala');
  expect((meu['quem'] as { nome: string }).nome).toBe('Lucas');
  const baixado = await admin(`/reportes/admin/arquivo/${encodeURIComponent(chaveDoPrint)}`);
  expect(baixado.status).toBe(200);

  // Visto → Confirmado (conta para o Caçador) → Consertado.
  expect((await marcar('visto', [id]))['feito']).toEqual({ [id]: 'visto' });
  await expect(cartao.locator('.rbg-est')).toHaveText('Visto');
  const confirmou = (await marcar('confirmar', [id]))['feito'] as Record<string, string>;
  expect(confirmou[id]).toContain('confirmado');
  expect(confirmou[id]).toContain('bug1');
  expect((await marcar('confirmar', [id]))['feito']).toEqual({ [id]: 'nada a mudar' });
  await expect(cartao.locator('.rbg-ponto')).toContainText('Bug confirmado');
  await expect(cfg.locator('.rbg-cacador')).toContainText('Caçador de bugs I');
  await expect(cfg.locator('.rbg-cacador')).toContainText('1 bug confirmado · faltam 4 para o II');
  expect(await marcar('consertado', [id], 'x')).toEqual({ erro: 'versao (ex.: 0.13.5)' });
  await marcar('consertado', [id], '0.13.0');
  await expect(cartao.locator('.rbg-est')).toHaveText('Consertado na 0.13.0');
  await expect(cartao.locator('.rbg-passo--verde')).toHaveCount(3);
  const ins = await lerComoDono(`insignias/${lucas.uid}`);
  expect(JSON.stringify(ins)).toContain('"bugs":{"integerValue":"1"}');
  await page.screenshot({ path: `${PASTA}/4-consertado.png` });

  // Limite: 5 por dia (1 pela tela + 4 pela API; o 6º volta).
  for (let i = 0; i < 4; i += 1) expect(await mandarPelaApi(lucas, `Teste ${i}`)).toBe(200);
  expect(await mandarPelaApi(lucas, 'Sexto')).toBe(429);
  await expect(cfg.locator('.rbg-aba__n')).toHaveText('5');
  await cfg.getByRole('tab', { name: 'Novo reporte' }).click();
  await expect(cfg.locator('.rbg-fim__restam')).toHaveText('Você já mandou 5 hoje. Amanhã libera de novo.');
  await expect(cfg.getByRole('button', { name: 'Enviar reporte' })).toBeDisabled();

  // Celular: a lista de categorias vira a gaveta de baixo.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${PASTA}/c1-celular-novo.png` });
  await cfg.locator('#rbg-categoria').click();
  const gaveta = await page.getByRole('listbox', { name: 'Categoria' }).boundingBox();
  expect(Math.round(gaveta!.y + gaveta!.height)).toBeGreaterThanOrEqual(843);
  expect(Math.round(gaveta!.width)).toBeGreaterThanOrEqual(388);
  await page.screenshot({ path: `${PASTA}/c2-celular-categorias.png` });
  await page.keyboard.press('Escape');
  await cfg.getByRole('tab', { name: /Meus reportes/ }).click();
  await page.screenshot({ path: `${PASTA}/c3-celular-meus.png` });
  await ctx.close();
});
