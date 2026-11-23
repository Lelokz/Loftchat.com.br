import { spawn, type ChildProcess } from 'node:child_process';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

import { createAccountViaRest, limparTudo, newAccount } from './helpers';
import type { TestAccount } from './helpers';

/**
 * CARTEIRO DAS NOTIFICAÇÕES (0.4.0): o carteiro roda aqui (wrangler dev),
 * apontado para o emulador. Em vez de falar com o Google, ele anota cada
 * envio em `testeCarteiro/` — é isso que o teste confere.
 */

const FS_HOST = process.env['FIRESTORE_EMULATOR_HOST'];
const FS = `http://${FS_HOST}/v1/projects/loft-3d6c0f/databases/(default)/documents`;
const PORTA = 8799;
const CARTEIRO = `http://127.0.0.1:${PORTA}`;
const HD = '/mnt/cab1286d-6765-4c73-9c77-8d3119b4b644/Arquivo/Loft-desktop/carteiro';
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

const accounts: TestAccount[] = [];
let carteiro: ChildProcess | undefined;

test.describe.configure({ mode: 'serial' });
test.skip(FS_HOST === undefined, 'só no emulador');

type Valor = string | number | Record<string, unknown>;

function campos(dados: Record<string, Valor>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(dados).map(([k, v]) => [
      k,
      typeof v === 'string'
        ? { stringValue: v }
        : typeof v === 'number'
          ? { integerValue: String(v) }
          : { mapValue: { fields: campos(v as Record<string, Valor>) } },
    ]),
  );
}

/** Escreve como DONO do projeto (passa por cima das regras), como o carteiro faz. */
async function comoDono(caminho: string, dados: Record<string, Valor>): Promise<void> {
  const r = await fetch(`${FS}/${caminho}`, {
    method: 'PATCH',
    headers: { authorization: 'Bearer owner', 'content-type': 'application/json' },
    body: JSON.stringify({ fields: campos(dados) }),
  });
  expect(r.ok, `gravar ${caminho}`).toBe(true);
}

async function lerComoDono(caminho: string): Promise<Record<string, Record<string, unknown>> | null> {
  const r = await fetch(`${FS}/${caminho}`, { headers: { authorization: 'Bearer owner' } });
  if (r.status === 404) return null;
  return ((await r.json()) as { fields: Record<string, Record<string, unknown>> }).fields;
}

async function envios(): Promise<Record<string, string>[]> {
  const r = await fetch(`${FS}/testeCarteiro?pageSize=100`, { headers: { authorization: 'Bearer owner' } });
  const docs = ((await r.json()) as { documents?: { fields: Record<string, { stringValue: string }> }[] }).documents ?? [];
  return docs.map((d) => Object.fromEntries(Object.entries(d.fields).map(([k, v]) => [k, v.stringValue])));
}

async function avisar(conta: TestAccount | null, corpo: unknown): Promise<Response> {
  return fetch(`${CARTEIRO}/avisar`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(conta === null ? {} : { authorization: `Bearer ${conta.idToken}` }),
    },
    body: JSON.stringify(corpo),
  });
}

test.beforeAll(async () => {
  test.setTimeout(90_000);
  carteiro = spawn(
    join(process.cwd(), 'carteiro/node_modules/.bin/wrangler'),
    [
      'dev',
      '--ip', '127.0.0.1',
      '--port', String(PORTA),
      '--var', `EMULADOR:${FS_HOST}`,
      '--var', 'SEGREDO_FOTO:segredo-de-teste',
      '--persist-to', `${HD}/estado-dev`,
      '--log-level', 'warn',
    ],
    {
      cwd: join(process.cwd(), 'carteiro'),
      env: { ...process.env, XDG_CONFIG_HOME: `${HD}/config`, WRANGLER_SEND_METRICS: 'false', WRANGLER_LOG_PATH: `${HD}/logs` },
      stdio: 'ignore',
    },
  );
  for (let i = 0; i < 120; i += 1) {
    const ok = await fetch(`${CARTEIRO}/`).then((r) => r.ok).catch(() => false);
    if (ok) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('o carteiro local não ligou');
});

test.afterAll(async () => {
  carteiro?.kill('SIGTERM');
  await limparTudo(accounts, 'carteiro — limpeza');
});

test('carteiro: avisa quem é do grupo e do PV, com o texto cortado e a foto', async () => {
  const ana = newAccount('Ana carteiro');
  const beto = newAccount('Beto carteiro');
  const caio = newAccount('Caio carteiro');
  accounts.push(ana, beto, caio);
  await Promise.all([createAccountViaRest(ana), createAccountViaRest(beto), createAccountViaRest(caio)]);
  const [a, b, c] = [ana.uid!, beto.uid!, caio.uid!];

  const g = `g${Date.now()}`;
  const canal = `c${Date.now()}`;
  await comoDono(`users/${a}`, { uid: a, displayName: 'Ana', photo: `data:image/png;base64,${PNG}` });
  await comoDono(`groups/${g}`, { name: 'Turma', ownerId: a });
  await comoDono(`channels/${canal}`, { name: 'geral', groupId: g, kind: 'text' });
  await comoDono(`memberships/${g}_${a}`, { groupId: g, memberId: a, role: 'owner' });
  await comoDono(`memberships/${g}_${b}`, { groupId: g, memberId: b, role: 'member' });
  await comoDono(`aparelhos/${b}`, { lista: { aCel: { tipo: 'android', token: 'token-do-beto' }, aPc: { tipo: 'pc' } } });
  await comoDono(`aparelhos/${c}`, { lista: { aCel: { tipo: 'android', token: 'token-do-caio' } } });

  const agora = new Date().toISOString();
  const longo = 'palavra '.repeat(60);
  await comoDono(`messages/m1${g}`, { groupId: g, channelId: canal, authorId: a, kind: 'text', body: longo, sentAt: agora });

  // Sem login, com pedido torto e com a mensagem de outra pessoa: recusado.
  expect((await avisar(null, { tipo: 'grupo', id: `m1${g}` })).status).toBe(401);
  expect((await avisar(ana, { tipo: 'outro', id: `m1${g}` })).status).toBe(400);
  expect((await avisar(beto, { tipo: 'grupo', id: `m1${g}` })).status).toBe(403);
  expect((await avisar(ana, { tipo: 'grupo', id: 'naoExiste' })).status).toBe(404);

  // A Ana avisa: vai para o celular do Beto e para o PC dele; o Caio (fora do grupo) não recebe.
  expect((await avisar(ana, { tipo: 'grupo', id: `m1${g}` })).status).toBe(202);
  await expect.poll(async () => (await envios()).filter((e) => e['mensagem'] === `m1${g}`).length).toBe(1);
  const [envio] = (await envios()).filter((e) => e['mensagem'] === `m1${g}`);
  expect(envio!['para']).toBe(b);
  expect(envio!['token']).toBe('token-do-beto');
  expect(envio!['de']).toBe('Ana');
  expect(envio!['onde']).toBe('Turma · #geral');
  expect(envio!['conversa']).toBe(`canal:${canal}`);
  expect(envio!['abrir']).toBe(`grupo/${g}/${canal}`);
  expect(envio!['texto']!.length).toBeLessThanOrEqual(180);
  expect(envio!['texto']!.endsWith('…')).toBe(true);

  await expect.poll(async () => (await lerComoDono(`avisos/${b}`)) !== null).toBe(true);
  const aviso = await lerComoDono(`avisos/${b}`);
  const ultimo = (aviso!['ultimo']!['mapValue'] as { fields: Record<string, { stringValue: string }> }).fields;
  expect(ultimo['mensagem']!.stringValue).toBe(`m1${g}`);
  expect(await lerComoDono(`avisos/${a}`)).toBeNull();

  // A foto vem do carteiro, só com a assinatura certa.
  const foto = await fetch(envio!['foto']!);
  expect(foto.status).toBe(200);
  expect(foto.headers.get('content-type')).toBe('image/png');
  expect((await fetch(envio!['foto']!.replace(/a=[^&]+/, 'a=falsa'))).status).toBe(403);

  // Repetir o mesmo aviso não manda de novo.
  expect((await avisar(ana, { tipo: 'grupo', id: `m1${g}` })).status).toBe(200);

  // Mensagem velha (mais de 2 minutos): recusado.
  const velha = new Date(Date.now() - 10 * 60_000).toISOString();
  await comoDono(`messages/m2${g}`, { groupId: g, channelId: canal, authorId: a, kind: 'text', body: 'oi', sentAt: velha });
  expect((await avisar(ana, { tipo: 'grupo', id: `m2${g}` })).status).toBe(409);

  // PV: só o outro da dupla recebe, "no seu privado".
  const dupla = a < b ? `${a}_${b}` : `${b}_${a}`;
  await comoDono(`dmMessages/d1${g}`, { threadId: dupla, authorId: a, kind: 'text', body: 'oi Beto', sentAt: new Date().toISOString() });
  expect((await avisar(ana, { tipo: 'pv', id: `d1${g}` })).status).toBe(202);
  await expect.poll(async () => (await envios()).filter((e) => e['mensagem'] === `d1${g}`).length).toBe(1);
  const [pv] = (await envios()).filter((e) => e['mensagem'] === `d1${g}`);
  expect(pv!['para']).toBe(b);
  expect(pv!['onde']).toBe('no seu privado');
  expect(pv!['abrir']).toBe(`pv/${a}`);
  expect(pv!['texto']).toBe('oi Beto');

  // Nada foi para o Caio nem para a própria Ana.
  expect((await envios()).filter((e) => e['para'] === c || e['para'] === a)).toHaveLength(0);
});

test('regras: aparelhos só a própria pessoa; avisos só o carteiro escreve', async () => {
  const [ana, beto] = accounts;
  const url = (caminho: string) => `${FS}/${caminho}`;
  const como = (conta: TestAccount) => ({ authorization: `Bearer ${conta.idToken}`, 'content-type': 'application/json' });

  expect((await fetch(url(`aparelhos/${beto!.uid}`), { headers: como(beto!) })).status).toBe(200);
  expect((await fetch(url(`aparelhos/${beto!.uid}`), { headers: como(ana!) })).status).toBe(403);
  expect((await fetch(url(`avisos/${beto!.uid}`), { headers: como(beto!) })).status).toBe(200);
  expect((await fetch(url(`avisos/${beto!.uid}`), { headers: como(ana!) })).status).toBe(403);

  const escreverAviso = await fetch(url(`avisos/${beto!.uid}`), {
    method: 'PATCH',
    headers: como(beto!),
    body: JSON.stringify({ fields: campos({ ultimo: { de: 'falso' } }) }),
  });
  expect(escreverAviso.status).toBe(403);

  const muitos: Record<string, Valor> = {};
  for (let i = 0; i < 11; i += 1) muitos[`a${i}`] = { tipo: 'pc' };
  const demais = await fetch(url(`aparelhos/${ana!.uid}`), {
    method: 'PATCH',
    headers: como(ana!),
    body: JSON.stringify({ fields: campos({ lista: muitos }) }),
  });
  expect(demais.status).toBe(403);

  const umPc = await fetch(url(`aparelhos/${ana!.uid}`), {
    method: 'PATCH',
    headers: como(ana!),
    body: JSON.stringify({ fields: campos({ lista: { aPc: { tipo: 'pc' } } }) }),
  });
  expect(umPc.status).toBe(200);
});
