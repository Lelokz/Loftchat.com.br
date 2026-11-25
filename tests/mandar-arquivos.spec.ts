import { expect, test } from '@playwright/test';

import { activeGroupId, createGroupThroughUi, limparTudo, newAccount, resolveTokens, signUpThroughUi } from './helpers';
import type { TestAccount } from './helpers';
import { CARTEIRO, FS, comoDono, ligarCarteiroLocal } from './carteiro-local';
import { PERMISSOES_DO_TODOS } from '../src/lib/permissoes';

/**
 * MANDAR ARQUIVOS (0.11.0): pelo + → Arquivo; o cartão (tipo, nome,
 * tamanho, baixar); programa com o aviso; o download sai como download
 * (nunca abre como página, nem um .html); e o cargo "Mandar arquivos" vale.
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
  await limparTudo(contas, 'mandar arquivos — limpeza');
});

test('arquivos: mandar pelo +, cartão, aviso de programa, download seguro e cargo', async ({ browser }) => {
  test.setTimeout(180_000);
  const ana = newAccount('Ana arquivo');
  const beto = newAccount('Beto arquivo');
  contas.push(ana, beto);
  const ctxA = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const pa = await ctxA.newPage();
  await pa.goto('/');
  await signUpThroughUi(pa, ana);
  await resolveTokens(ana);
  await createGroupThroughUi(pa, 'Grupo dos arquivos');
  const grupo = await activeGroupId(pa);

  const ctxB = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const pb = await ctxB.newPage();
  await pb.goto('/');
  await signUpThroughUi(pb, beto);
  await resolveTokens(beto);
  await comoDono(`memberships/${grupo}_${beto.uid}`, { groupId: grupo, memberId: beto.uid!, role: 'member' });

  // + → Arquivo: um PDF e um .jar de uma vez, com legenda.
  const pdf = Buffer.from('%PDF-1.4\n% trabalho de história\n%%EOF\n');
  const jar = Buffer.alloc(3000, 7);
  await pa.locator('.composer__input').fill('o trabalho e o mod');
  const escolha = pa.waitForEvent('filechooser');
  await pa.getByRole('button', { name: 'Anexar' }).click();
  await pa.getByRole('menuitem', { name: /Arquivo/ }).click();
  await (await escolha).setFiles([
    { name: 'Trabalho de história.pdf', mimeType: 'application/pdf', buffer: pdf },
    { name: 'OptiFine_HD_U_J1.jar', mimeType: 'application/java-archive', buffer: jar },
  ]);
  const cartaoPdf = pa.locator('.arquivo', { hasText: 'Trabalho de história.pdf' });
  await expect(cartaoPdf).toBeVisible({ timeout: 30_000 });
  await expect(cartaoPdf.locator('.arquivo__tipo')).toHaveText('PDF');
  await expect(cartaoPdf).toContainText('PDF');
  await expect(cartaoPdf.locator('.arquivo__aviso')).toHaveCount(0);
  await expect(pa.locator('.message', { hasText: 'Trabalho de história.pdf' })).toContainText('o trabalho e o mod');
  const cartaoJar = pa.locator('.arquivo', { hasText: 'OptiFine_HD_U_J1.jar' });
  await expect(cartaoJar).toBeVisible({ timeout: 30_000 });
  await expect(cartaoJar.locator('.arquivo__aviso')).toContainText('só abra se você confia em quem mandou');
  await pa.screenshot({ path: 'test-results/mandar-arquivos/1-pc.png' });

  // Beto (celular) vê os dois.
  await pb.reload();
  await pb.locator(`.group-bar__button[data-group-id="${grupo}"]`).click();
  await expect(pb.locator('.arquivo')).toHaveCount(2, { timeout: 30_000 });
  await pb.screenshot({ path: 'test-results/mandar-arquivos/2-celular.png' });

  // O download: sai como download, com o nome, e os bytes certos.
  const href = (await cartaoPdf.locator('a.arquivo__baixar').getAttribute('href'))!;
  expect(href.startsWith(`${CARTEIRO}/arquivo/arquivo/`)).toBe(true);
  const baixado = await fetch(href);
  expect(baixado.status).toBe(200);
  expect(baixado.headers.get('content-type')).toBe('application/octet-stream');
  expect(baixado.headers.get('content-disposition')).toContain('attachment');
  expect(baixado.headers.get('content-disposition')).toContain(encodeURIComponent('Trabalho de história.pdf'));
  expect(Buffer.from(await baixado.arrayBuffer()).equals(pdf)).toBe(true);

  // Um .html mandado como arquivo NÃO vira página (nem roda script).
  const html = await fetch(`${CARTEIRO}/arquivo?tipo=arquivo&nome=${encodeURIComponent('ataque.html')}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${ana.idToken}`, 'content-type': 'text/html' },
    body: '<script>alert(1)</script>',
  });
  const { url } = (await html.json()) as { url: string };
  const servido = await fetch(url);
  expect(servido.headers.get('content-type')).toBe('application/octet-stream');
  expect(servido.headers.get('content-security-policy')).toContain('sandbox');

  // Sem "Mandar arquivos" no cargo: o banco recusa a mensagem de arquivo do Beto.
  const lista = (xs: string[]) => ({ arrayValue: { values: xs.map((x) => ({ stringValue: x })) } });
  const tirar = await fetch(`${FS}/memberships/${grupo}_${beto.uid}?updateMask.fieldPaths=perms`, {
    method: 'PATCH',
    headers: { authorization: 'Bearer owner', 'content-type': 'application/json' },
    body: JSON.stringify({ fields: { perms: lista(PERMISSOES_DO_TODOS.filter((p) => p !== 'mandar-arquivos')) } }),
  });
  expect(tirar.ok).toBe(true);
  const canal = (await pa.locator('.message', { hasText: 'Trabalho de história.pdf' }).first().getAttribute('data-canal'))!;
  const recusada = await fetch(`${FS}/messages/arqSemPerm${Date.now()}`, {
    method: 'PATCH',
    headers: { authorization: `Bearer ${beto.idToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      fields: {
        groupId: { stringValue: grupo },
        channelId: { stringValue: canal },
        authorId: { stringValue: beto.uid! },
        kind: { stringValue: 'file' },
        body: { stringValue: '' },
        sentAt: { stringValue: new Date().toISOString() },
        attachment: { mapValue: { fields: { url: { stringValue: href }, fileName: { stringValue: 'x.pdf' }, mimeType: { stringValue: 'application/pdf' }, sizeBytes: { integerValue: '10' } } } },
      },
    }),
  });
  expect(recusada.status).toBe(403);
  await ctxA.close();
  await ctxB.close();
});
