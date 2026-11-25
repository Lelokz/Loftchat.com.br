import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import { createAccountViaRest, limparTudo, newAccount, resolveTokens, signUpThroughUi } from './helpers';
import type { TestAccount } from './helpers';
import { CARTEIRO, FS, comoDono, lerComoDono, ligarCarteiroLocal } from './carteiro-local';

/**
 * TRANSCRIÇÃO DAS MENSAGENS DE VOZ (0.10.5).
 * Etapa 1 — o carteiro (com o Whisper de MENTIRA, `WHISPER_FALSO`): quem é
 * da conversa transcreve e o texto fica na mensagem; quem é de fora nem
 * descobre que existe; já transcrita não gasta de novo; o limite do dia vira
 * 429 "limite do dia"; ninguém escreve a transcrição pelo app.
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
  await limparTudo(contas, 'transcrição — limpeza');
});

const par = (a: string, b: string): string => (a < b ? `${a}_${b}` : `${b}_${a}`);

async function subirAudio(token: string, tamanho: number): Promise<{ chave: string; url: string }> {
  const r = await fetch(`${CARTEIRO}/arquivo?tipo=audio`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'audio/webm' },
    body: new Uint8Array(tamanho).map((_, i) => i % 251),
  });
  expect(r.status).toBe(200);
  return (await r.json()) as { chave: string; url: string };
}

function pedir(token: string, tipo: 'pv' | 'grupo', id: string): Promise<Response> {
  return fetch(`${CARTEIRO}/transcrever`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ tipo, id }),
  });
}

test('transcrição: o carteiro transcreve, guarda na mensagem e segura quem é de fora', async () => {
  test.setTimeout(120_000);
  const ana = newAccount('Ana transcrição');
  const beto = newAccount('Beto transcrição');
  const caio = newAccount('Caio transcrição');
  contas.push(ana, beto, caio);
  for (const c of contas) await createAccountViaRest(c);
  const fio = par(ana.uid!, beto.uid!);

  const voz = async (id: string, tamanho: number, nome = 'voz'): Promise<void> => {
    const a = await subirAudio(ana.idToken!, tamanho);
    await comoDono(`dmMessages/${id}`, {
      threadId: fio,
      authorId: ana.uid!,
      kind: 'audio',
      body: '',
      sentAt: new Date().toISOString(),
      attachment: { url: a.url, chave: a.chave, fileName: nome, mimeType: 'audio/webm', sizeBytes: tamanho, durationMs: 4000 },
    });
  };
  await voz('transcPv1', 3000);

  // Quem é de fora: 404 (nem sabe que existe). Sem login: 401.
  expect((await pedir(caio.idToken!, 'pv', 'transcPv1')).status).toBe(404);
  expect((await fetch(`${CARTEIRO}/transcrever`, { method: 'POST', body: '{}' })).status).toBe(401);

  // Beto (o outro do PV) pede: o texto volta e fica NA MENSAGEM.
  const r = await pedir(beto.idToken!, 'pv', 'transcPv1');
  expect(r.status).toBe(200);
  expect(await r.json()).toEqual({ texto: 'Transcrição de teste com 3000 bytes.', idioma: 'pt' });
  const msg = await lerComoDono('dmMessages/transcPv1');
  const t = (msg!['transcricao'] as { mapValue: { fields: Record<string, { stringValue?: string }> } }).mapValue.fields;
  expect(t['texto']!.stringValue).toBe('Transcrição de teste com 3000 bytes.');
  expect(t['idioma']!.stringValue).toBe('pt');

  // Pedir de novo (Ana): devolve o mesmo, sem transcrever outra vez.
  const outraVez = await pedir(ana.idToken!, 'pv', 'transcPv1');
  expect(await outraVez.json()).toEqual({ texto: 'Transcrição de teste com 3000 bytes.', idioma: 'pt' });

  // Ninguém escreve a transcrição pelo app (nem o autor).
  const falsa = await fetch(`${FS}/dmMessages/transcPv1?updateMask.fieldPaths=transcricao`, {
    method: 'PATCH',
    headers: { authorization: `Bearer ${ana.idToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ fields: { transcricao: { mapValue: { fields: { texto: { stringValue: 'texto falso' } } } } } }),
  });
  expect(falsa.status).toBe(403);

  // Áudio sem fala: texto vazio (o app mostra "Sem fala neste áudio").
  await voz('transcPv2', 40);
  expect(await (await pedir(beto.idToken!, 'pv', 'transcPv2')).json()).toEqual({ texto: '', idioma: 'pt' });

  // Limite do dia da Cloudflare: 429 "limite do dia".
  await voz('transcPv3', 3000, 'limite');
  const limite = await pedir(beto.idToken!, 'pv', 'transcPv3');
  expect(limite.status).toBe(429);
  expect(await limite.json()).toEqual({ erro: 'limite do dia' });

  // Mensagem que não é de voz: recusa.
  await comoDono('dmMessages/transcPv4', { threadId: fio, authorId: ana.uid!, kind: 'text', body: 'oi', sentAt: new Date().toISOString() });
  expect((await pedir(beto.idToken!, 'pv', 'transcPv4')).status).toBe(400);
});

async function abrirPv(page: Page, nome: string): Promise<void> {
  await page.getByRole('button', { name: /^Privado/ }).first().click();
  // No celular a tela de Amigos já abre sozinha.
  if (!(await page.locator('.friends__row--clickable', { hasText: nome }).isVisible())) {
    await page.getByRole('button', { name: 'Amigos', exact: true }).click();
    await page.locator('.friends__tab[data-tab="amigos"]').click();
  }
  await page.locator('.friends__row--clickable', { hasText: nome }).click();
  await expect(page.locator('.dm-chat__name')).toHaveText(nome, { timeout: 15_000 });
}

test('transcrição no app: botão, Transcrevendo…, texto para os dois, esconder só para mim e o aviso do limite', async ({ browser }) => {
  test.setTimeout(180_000);
  const eva = newAccount('Eva transcrição');
  const fabio = newAccount('Fabio transcrição');
  contas.push(eva, fabio);
  const ctxE = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const pe = await ctxE.newPage();
  await pe.goto('/');
  await signUpThroughUi(pe, eva);
  await resolveTokens(eva);
  const ctxF = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const pf = await ctxF.newPage();
  await pf.goto('/');
  await signUpThroughUi(pf, fabio);
  await resolveTokens(fabio);

  const fio = par(eva.uid!, fabio.uid!);
  const amizade = await fetch(`${FS}/friendships/${fio}`, {
    method: 'PATCH',
    headers: { authorization: 'Bearer owner', 'content-type': 'application/json' },
    body: JSON.stringify({
      fields: {
        members: { arrayValue: { values: [{ stringValue: eva.uid! }, { stringValue: fabio.uid! }] } },
        from: { stringValue: eva.uid! },
        to: { stringValue: fabio.uid! },
        status: { stringValue: 'accepted' },
        createdAt: { stringValue: new Date().toISOString() },
      },
    }),
  });
  expect(amizade.ok).toBe(true);
  // Duas mensagens de voz da Eva: uma normal e uma que bate no "limite do dia".
  for (const [id, tamanho, nome] of [['transcApp1', 5000, 'voz'], ['transcApp2', 5000, 'limite']] as const) {
    const a = await subirAudio(eva.idToken!, tamanho);
    await comoDono(`dmMessages/${id}`, {
      threadId: fio,
      authorId: eva.uid!,
      kind: 'audio',
      body: '',
      sentAt: new Date(Date.now() - (id === 'transcApp1' ? 60_000 : 0)).toISOString(),
      attachment: { url: a.url, chave: a.chave, fileName: nome, mimeType: 'audio/webm', sizeBytes: tamanho, durationMs: 4000 },
    });
  }
  await pe.reload();
  await pf.reload();
  await abrirPv(pe, fabio.displayName);
  await abrirPv(pf, eva.displayName);

  // Fabio (celular) transcreve a primeira.
  const vozF = pf.locator('.message').filter({ has: pf.locator('.voz') }).first();
  const botaoF = vozF.getByRole('button', { name: 'Transcrever' });
  await expect(botaoF).toBeVisible({ timeout: 30_000 });
  await botaoF.click();
  const texto = 'Transcrição de teste com 5000 bytes.';
  await expect(vozF.locator('.transcricao__texto')).toHaveText(texto, { timeout: 30_000 });
  await expect(vozF.getByRole('button', { name: 'Esconder texto' })).toBeVisible();
  await pf.screenshot({ path: 'test-results/transcricao/1-celular.png' });

  // Eva (que não pediu) também vê — fica na mensagem.
  const vozE = pe.locator('.message').filter({ has: pe.locator('.voz') }).first();
  await expect(vozE.locator('.transcricao__texto')).toHaveText(texto, { timeout: 30_000 });
  await pe.screenshot({ path: 'test-results/transcricao/2-pc.png' });

  // Eva esconde: só para ela.
  await vozE.getByRole('button', { name: 'Esconder texto' }).click();
  await expect(vozE.locator('.transcricao__texto')).toHaveCount(0);
  await expect(vozE.getByRole('button', { name: 'Mostrar texto' })).toBeVisible();
  await expect(vozF.locator('.transcricao__texto')).toHaveText(texto);
  await vozE.getByRole('button', { name: 'Mostrar texto' }).click();
  await expect(vozE.locator('.transcricao__texto')).toHaveText(texto);

  // A segunda bate no limite do dia: aviso claro, sem texto.
  const voz2 = pf.locator('.message').filter({ has: pf.locator('.voz') }).nth(1);
  await voz2.getByRole('button', { name: 'Transcrever' }).click();
  await expect(voz2.locator('.transcricao__erro')).toHaveText('O limite de transcrição de hoje acabou. Volta às 21h.', { timeout: 30_000 });
  await ctxE.close();
  await ctxF.close();
});
