import { expect, test } from '@playwright/test';

import { createAccountViaRest, limparTudo, newAccount } from './helpers';
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
