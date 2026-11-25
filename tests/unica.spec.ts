import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { activeGroupId, createAccountViaRest, createGroupThroughUi, limparTudo, newAccount, resolveTokens, signUpThroughUi } from './helpers';
import type { TestAccount } from './helpers';
import { CARTEIRO, FS, campos, comoDono, ligarCarteiroLocal } from './carteiro-local';

/**
 * VISUALIZAÇÃO ÚNICA (0.10.0).
 * Etapa 1 — o carteiro e as regras: o arquivo fechado não sai pelo endereço
 * público; só quem é do PV/canal abre, até o limite de vezes; quem mandou e
 * quem é de fora não abrem; ninguém mexe na contagem pelo app; no grupo,
 * cada um tem as suas vezes.
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
  await limparTudo(contas, 'visualização única — limpeza');
});

const par = (a: string, b: string): string => (a < b ? `${a}_${b}` : `${b}_${a}`);
const VIDEO = readFileSync(join(import.meta.dirname, 'arquivos-de-teste', 'video.webm'));
const BYTES = new Uint8Array(4000).map((_, i) => (i * 7) % 251);

async function subir(token: string): Promise<{ chave: string; url: string; prazoDias: number }> {
  const r = await fetch(`${CARTEIRO}/arquivo?tipo=unica`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'image/webp' },
    body: BYTES,
  });
  expect(r.status).toBe(200);
  return (await r.json()) as { chave: string; url: string; prazoDias: number };
}

function abrir(token: string, tipo: 'pv' | 'grupo', id: string): Promise<Response> {
  return fetch(`${CARTEIRO}/unica/abrir`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ tipo, id }),
  });
}

/** Cria a mensagem do PV COMO a pessoa (passa pelas regras). */
function mensagemDoPv(conta: TestAccount, outro: TestAccount, id: string, extra: Record<string, unknown>): Promise<Response> {
  return fetch(`${FS}/dmMessages/${id}`, {
    method: 'PATCH',
    headers: { authorization: `Bearer ${conta.idToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      fields: {
        ...campos({ threadId: par(conta.uid!, outro.uid!), authorId: conta.uid!, body: '', sentAt: new Date().toISOString() }),
        ...extra,
      },
    }),
  });
}

const anexo = (chave: string, url: string) => ({
  attachment: { mapValue: { fields: campos({ url, chave, fileName: 'foto.webp', mimeType: 'image/webp', sizeBytes: BYTES.length }) } },
});

test('visualização única: carteiro conta as vezes, fecha o arquivo e as regras seguram', async () => {
  test.setTimeout(120_000);
  const ana = newAccount('Ana única');
  const beto = newAccount('Beto única');
  const caio = newAccount('Caio única');
  contas.push(ana, beto, caio);
  for (const c of contas) await createAccountViaRest(c);

  // O arquivo sobe, mas o endereço público NÃO entrega.
  const { chave, url, prazoDias } = await subir(ana.idToken!);
  expect(chave).toMatch(new RegExp(`^unica/${ana.uid}/[a-z0-9]{20}$`));
  expect(prazoDias).toBe(14);
  expect((await fetch(url)).status).toBe(404);

  // Regras: vezes de 1 a 5, só foto/vídeo, e a pasta fechada só com `unica`.
  const kind = (k: string) => ({ kind: { stringValue: k } });
  const vezes = (n: number) => ({ unica: { mapValue: { fields: { vezes: { integerValue: String(n) } } } } });
  expect((await mensagemDoPv(ana, beto, 'unicaRuim1', { ...kind('image'), ...vezes(6), ...anexo(chave, url) })).status).toBe(403);
  expect((await mensagemDoPv(ana, beto, 'unicaRuim2', { ...kind('image'), ...vezes(0), ...anexo(chave, url) })).status).toBe(403);
  expect((await mensagemDoPv(ana, beto, 'unicaRuim3', { ...kind('gif'), ...vezes(1), ...anexo(chave, url) })).status).toBe(403);
  expect((await mensagemDoPv(ana, beto, 'unicaRuim4', { ...kind('image'), ...anexo(chave, url) })).status).toBe(403);
  expect((await mensagemDoPv(ana, beto, 'unicaRuim5', { ...kind('image'), ...vezes(1), ...anexo('imagem/x/y', url) })).status).toBe(403);
  expect((await mensagemDoPv(ana, beto, 'unicaPv1', { ...kind('image'), ...vezes(2), ...anexo(chave, url) })).status).toBe(200);

  // Quem mandou não abre; quem é de fora nem descobre que existe.
  expect((await abrir(ana.idToken!, 'pv', 'unicaPv1')).status).toBe(403);
  expect((await abrir(caio.idToken!, 'pv', 'unicaPv1')).status).toBe(404);
  expect((await abrir(beto.idToken!, 'grupo', 'unicaPv1')).status).toBe(404);

  // Beto abre 2 vezes (o arquivo inteiro, sem cache) e na 3ª acabou.
  for (const vez of [1, 2]) {
    const r = await abrir(beto.idToken!, 'pv', 'unicaPv1');
    expect(r.status).toBe(200);
    expect(r.headers.get('x-vez')).toBe(String(vez));
    expect(r.headers.get('x-vezes')).toBe('2');
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(new Uint8Array(await r.arrayBuffer())).toEqual(BYTES);
  }
  expect((await abrir(beto.idToken!, 'pv', 'unicaPv1')).status).toBe(403);

  // A contagem: Beto e Ana leem, Caio não, e ninguém escreve pelo app.
  const contagem = `${FS}/unicas/unicaPv1_${beto.uid}`;
  const lida = await fetch(contagem, { headers: { authorization: `Bearer ${beto.idToken}` } });
  expect(lida.status).toBe(200);
  expect(((await lida.json()) as { fields: { vistas: { integerValue: string } } }).fields.vistas.integerValue).toBe('2');
  expect((await fetch(contagem, { headers: { authorization: `Bearer ${ana.idToken}` } })).status).toBe(200);
  expect((await fetch(contagem, { headers: { authorization: `Bearer ${caio.idToken}` } })).status).toBe(403);
  const zerar = await fetch(contagem, {
    method: 'PATCH',
    headers: { authorization: `Bearer ${beto.idToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ fields: { vistas: { integerValue: '0' } } }),
  });
  expect(zerar.status).toBe(403);

  // GRUPO: Beto e Caio são membros; cada um tem a sua vez. Dani (fora) não abre.
  const grupo = `gUnica${Date.now()}`;
  const canal = `cUnica${Date.now()}`;
  await comoDono(`groups/${grupo}`, { name: 'Grupo da única', ownerId: ana.uid! });
  await comoDono(`channels/${canal}`, { groupId: grupo, name: 'geral', kind: 'text' });
  for (const c of [ana, beto, caio]) await comoDono(`memberships/${grupo}_${c.uid}`, { groupId: grupo, memberId: c.uid!, role: c === ana ? 'owner' : 'member' });
  const arq = await subir(ana.idToken!);
  await comoDono(`messages/unicaGr1`, {
    groupId: grupo,
    channelId: canal,
    authorId: ana.uid!,
    kind: 'image',
    body: '',
    sentAt: new Date().toISOString(),
    unica: { vezes: 1 },
    attachment: { url: arq.url, chave: arq.chave, fileName: 'f.webp', mimeType: 'image/webp', sizeBytes: BYTES.length },
  });
  expect((await abrir(beto.idToken!, 'grupo', 'unicaGr1')).status).toBe(200);
  expect((await abrir(beto.idToken!, 'grupo', 'unicaGr1')).status).toBe(403);
  expect((await abrir(caio.idToken!, 'grupo', 'unicaGr1')).status).toBe(200);
  const dani = newAccount('Dani única');
  contas.push(dani);
  await createAccountViaRest(dani);
  expect((await abrir(dani.idToken!, 'grupo', 'unicaGr1')).status).toBe(404);

  // Três aberturas AO MESMO TEMPO com limite 2: só 2 passam (a contagem é numa transação).
  await comoDono(`messages/unicaGr3`, {
    groupId: grupo,
    channelId: canal,
    authorId: ana.uid!,
    kind: 'image',
    body: '',
    sentAt: new Date().toISOString(),
    unica: { vezes: 2 },
    attachment: { url: arq.url, chave: arq.chave, fileName: 'f.webp', mimeType: 'image/webp', sizeBytes: BYTES.length },
  });
  const juntas = await Promise.all([1, 2, 3].map(() => abrir(caio.idToken!, 'grupo', 'unicaGr3')));
  expect(juntas.map((r) => r.status).sort()).toEqual([200, 200, 403]);

  // Velha demais (mais de 14 dias): expirou.
  await comoDono(`messages/unicaGr2`, {
    groupId: grupo,
    channelId: canal,
    authorId: ana.uid!,
    kind: 'image',
    body: '',
    sentAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
    unica: { vezes: 1 },
    attachment: { url: arq.url, chave: arq.chave, fileName: 'f.webp', mimeType: 'image/webp', sizeBytes: BYTES.length },
  });
  expect((await abrir(beto.idToken!, 'grupo', 'unicaGr2')).status).toBe(410);
});

/* ------------------------------------------------------------------------ */

async function abrirPv(page: Page, nome: string): Promise<void> {
  await page.getByRole('button', { name: /^Privado/ }).first().click();
  await page.getByRole('button', { name: 'Amigos', exact: true }).click();
  await page.locator('.friends__tab[data-tab="amigos"]').click();
  await page.locator('.friends__row--clickable', { hasText: nome }).click();
  await expect(page.locator('.dm-chat__name')).toHaveText(nome, { timeout: 15_000 });
}

async function ficarAmigos(a: TestAccount, b: TestAccount): Promise<void> {
  const r = await fetch(`${FS}/friendships/${par(a.uid!, b.uid!)}`, {
    method: 'PATCH',
    headers: { authorization: 'Bearer owner', 'content-type': 'application/json' },
    body: JSON.stringify({
      fields: {
        members: { arrayValue: { values: [{ stringValue: a.uid! }, { stringValue: b.uid! }] } },
        from: { stringValue: a.uid! },
        to: { stringValue: b.uid! },
        status: { stringValue: 'accepted' },
        createdAt: { stringValue: new Date().toISOString() },
      },
    }),
  });
  expect(r.ok).toBe(true);
}

/** As mensagens do PV, lidas como dono. */
async function mensagensDoPv(fio: string): Promise<{ id: string; f: Record<string, Record<string, unknown>> }[]> {
  const r = await fetch(`${FS}:runQuery`, {
    method: 'POST',
    headers: { authorization: 'Bearer owner', 'content-type': 'application/json' },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'dmMessages' }],
        where: { fieldFilter: { field: { fieldPath: 'threadId' }, op: 'EQUAL', value: { stringValue: fio } } },
      },
    }),
  });
  const linhas = (await r.json()) as { document?: { name: string; fields: Record<string, Record<string, unknown>> } }[];
  return linhas.filter((l) => l.document !== undefined).map((l) => ({ id: l.document!.name.split('/').pop()!, f: l.document!.fields }));
}

test('visualização única: mandar pelo + (menu, janela, 1 a 5 vezes)', async ({ browser }) => {
  test.setTimeout(240_000);
  const eva = newAccount('Eva única');
  const fabio = newAccount('Fabio única');
  contas.push(eva, fabio);
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto('/');
  await signUpThroughUi(page, eva);
  await resolveTokens(eva);
  const ctxF = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const pf = await ctxF.newPage();
  await pf.goto('/');
  await signUpThroughUi(pf, fabio);
  await resolveTokens(fabio);
  await ficarAmigos(eva, fabio);
  await page.reload();
  await abrirPv(page, fabio.displayName);

  // O + abre o menu com as duas opções.
  await page.getByRole('button', { name: 'Anexar' }).click();
  await expect(page.getByRole('menuitem', { name: /Foto, GIF ou vídeo/ })).toBeVisible();
  const escolha = page.waitForEvent('filechooser');
  await page.getByRole('menuitem', { name: /Visualização única/ }).click();
  const foto = await page.screenshot();
  await (await escolha).setFiles({ name: 'segredo.png', mimeType: 'image/png', buffer: foto });

  // A janela: prévia, legenda e as vezes (começa em 1).
  const janela = page.getByRole('dialog', { name: 'Visualização única' });
  await expect(janela).toBeVisible();
  await expect(janela).toContainText(`Para ${fabio.displayName}`);
  await expect(janela.getByRole('radio', { name: '1' })).toHaveAttribute('aria-checked', 'true');
  await janela.getByRole('radio', { name: '3' }).click();
  await expect(janela.getByRole('radio', { name: '3' })).toHaveAttribute('aria-checked', 'true');
  await janela.getByRole('textbox', { name: 'Legenda' }).fill('não conta pra ninguém');
  await page.screenshot({ path: 'test-results/unica/1-mandar.png' });
  await janela.getByRole('button', { name: 'Mandar' }).click();
  await expect(janela).toBeHidden();

  // A mensagem: `unica.vezes = 3`, arquivo na pasta fechada, sem capa.
  const fio = par(eva.uid!, fabio.uid!);
  await expect.poll(async () => (await mensagensDoPv(fio)).length, { timeout: 30_000 }).toBe(1);
  const [msg] = await mensagensDoPv(fio);
  const campos_ = msg!.f;
  expect((campos_['unica'] as { mapValue: { fields: { vezes: { integerValue: string } } } }).mapValue.fields.vezes.integerValue).toBe('3');
  const anexoF = (campos_['attachment'] as { mapValue: { fields: Record<string, { stringValue?: string }> } }).mapValue.fields;
  expect(anexoF['chave']!.stringValue).toMatch(/^unica\//);
  expect(anexoF['capaUrl']).toBeUndefined();
  expect((await fetch(anexoF['url']!.stringValue!)).status).toBe(404);

  // A lista de conversas não mostra a legenda, só o rótulo.
  const fioDoc = await fetch(`${FS}/dmThreads/${fio}`, { headers: { authorization: 'Bearer owner' } });
  const ultimo = ((await fioDoc.json()) as { fields: { lastMessage: { mapValue: { fields: { body: { stringValue: string } } } } } }).fields;
  expect(ultimo.lastMessage.mapValue.fields.body.stringValue).toBe('Foto de visualização única');

  // ETAPA 3: o balão. Eva (quem mandou): "ainda não abriu", e não abre.
  const balaoEva = page.locator('.unica-balao');
  await expect(balaoEva).toContainText('ainda não abriu', { timeout: 30_000 });
  await expect(balaoEva).not.toHaveAttribute('role', 'button');
  await expect(page.locator('.message__text', { hasText: 'não conta pra ninguém' })).toHaveCount(0);

  // Fabio: nada da foto nem da legenda no chat, só "toque para ver (3 vezes)".
  await abrirPv(pf, eva.displayName);
  const balaoF = pf.locator('.unica-balao');
  await expect(balaoF).toContainText('toque para ver (3 vezes)', { timeout: 30_000 });
  await expect(pf.locator('.message img.midia__img, .message video')).toHaveCount(0);
  await expect(pf.getByText('não conta pra ninguém')).toHaveCount(0);
  await pf.screenshot({ path: 'test-results/unica/2-conversa.png' });

  // ETAPA 4: abrir. Tela cheia com a foto de verdade, "1ª de 3 vezes", a legenda, "Sobram 2".
  await balaoF.click();
  const tela = pf.getByRole('dialog', { name: 'Foto de visualização única' });
  await expect(tela).toBeVisible();
  await expect(tela.locator('.unica-ver__selo')).toHaveText('1ª de 3 vezes', { timeout: 30_000 });
  await expect.poll(() => tela.locator('img.unica-ver__midia').evaluate((i) => (i as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await expect(tela).toContainText('não conta pra ninguém');
  await expect(tela).toContainText('Sobram 2.');
  await expect(tela.getByRole('link')).toHaveCount(0);
  await pf.screenshot({ path: 'test-results/unica/3-vendo.png' });
  await pf.keyboard.press('Escape');
  await expect(tela).toHaveCount(0);
  await expect(balaoF).toContainText('toque para ver (2 vezes)');

  // Eva vê que ele abriu.
  await expect(balaoEva).toContainText(`${fabio.displayName} abriu`, { timeout: 30_000 });

  // Mais duas vezes e acabou: "Aberta", não abre mais.
  for (const ultima of [false, true]) {
    await balaoF.click();
    await expect(tela.locator('.unica-ver__conta')).toContainText(ultima ? 'Esta é a última vez.' : 'Sobra 1.', { timeout: 30_000 });
    await tela.getByRole('button', { name: 'Fechar' }).click();
    await expect(tela).toHaveCount(0);
  }
  await expect(balaoF).toContainText('Aberta');
  await expect(balaoF).not.toHaveAttribute('role', 'button');
  await balaoF.click();
  await expect(tela).toHaveCount(0);

  // Celular: o balão e a tela de ver.
  await ctxF.close();
  await ctx.close();
});

test('visualização única: vídeo no grupo, aberto no celular, cada um com a sua vez', async ({ browser }) => {
  test.setTimeout(240_000);
  const gil = newAccount('Gil única');
  const hana = newAccount('Hana única');
  contas.push(gil, hana);
  const ctxG = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const pg = await ctxG.newPage();
  await pg.goto('/');
  await signUpThroughUi(pg, gil);
  await createGroupThroughUi(pg, 'Grupo da única');
  const grupo = await activeGroupId(pg);

  const ctxH = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const ph = await ctxH.newPage();
  await ph.goto('/');
  await signUpThroughUi(ph, hana);
  await resolveTokens(hana);
  await comoDono(`memberships/${grupo}_${hana.uid}`, { groupId: grupo, memberId: hana.uid!, role: 'member' });

  // Gil manda um VÍDEO para ver 1 vez.
  const escolha = pg.waitForEvent('filechooser');
  await pg.getByRole('button', { name: 'Anexar' }).click();
  await pg.getByRole('menuitem', { name: /Visualização única/ }).click();
  await (await escolha).setFiles({ name: 'clipe.webm', mimeType: 'video/webm', buffer: VIDEO });
  const janela = pg.getByRole('dialog', { name: 'Visualização única' });
  await expect(janela).toContainText('Para #');
  await janela.getByRole('button', { name: 'Mandar' }).click();
  const balaoG = pg.locator('.unica-balao');
  await expect(balaoG).toContainText('ninguém abriu ainda', { timeout: 30_000 });
  await expect(balaoG).toContainText('Vídeo');

  // Hana, no celular: abre, o vídeo toca, "última vez".
  await ph.reload();
  await ph.locator(`.group-bar__button[data-group-id="${grupo}"]`).click();
  const balaoH = ph.locator('.unica-balao');
  await expect(balaoH).toContainText('toque para ver (1 vez)', { timeout: 30_000 });
  await ph.screenshot({ path: 'test-results/unica/4-celular-conversa.png' });
  await balaoH.click();
  const tela = ph.getByRole('dialog', { name: 'Vídeo de visualização única' });
  await expect(tela.locator('.unica-ver__conta')).toContainText('Esta é a última vez.', { timeout: 30_000 });
  await expect.poll(() => tela.locator('video').evaluate((v) => (v as HTMLVideoElement).readyState), { timeout: 30_000 }).toBeGreaterThanOrEqual(2);
  await expect(tela.locator('video')).not.toHaveAttribute('loop', /.*/);
  await ph.screenshot({ path: 'test-results/unica/5-celular-vendo.png' });
  await tela.getByRole('button', { name: 'Fechar' }).click();
  await expect(balaoH).toContainText('Aberta');

  // Gil vê quem abriu.
  await expect(balaoG).toContainText(`vista por ${hana.displayName}`, { timeout: 30_000 });
  await pg.screenshot({ path: 'test-results/unica/6-grupo.png' });
  await ctxG.close();
  await ctxH.close();
});
