import { expect, test } from '@playwright/test';

import { createAccountViaRest, limparTudo, newAccount } from './helpers';
import type { TestAccount } from './helpers';
import { CARTEIRO, ligarCarteiroLocal } from './carteiro-local';
import { limpar } from '../carteiro/src/arquivos';
import type { Balde } from '../carteiro/src/arquivos';

/**
 * ARQUIVOS NO CARTEIRO (0.5.0): o carteiro local, com um R2 de mentira.
 * Enviar, baixar (e baixar um pedaço, que é o que deixa o vídeo avançar),
 * as recusas, e a limpeza de 60 dias (30 passando de 8 GB).
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
  await limparTudo(accounts, 'arquivos — limpeza');
});

function mandar(token: string | null, tipo: string, formato: string, corpo: Uint8Array): Promise<Response> {
  return fetch(`${CARTEIRO}/arquivo?tipo=${tipo}`, {
    method: 'POST',
    headers: { 'content-type': formato, ...(token === null ? {} : { authorization: `Bearer ${token}` }) },
    body: corpo,
  });
}

test('arquivos: envia, baixa, baixa pedaço e recusa o que não pode', async () => {
  const conta = newAccount('Arquivos');
  accounts.push(conta);
  await createAccountViaRest(conta);
  const token = conta.idToken!;
  const bytes = new Uint8Array(5000).map((_, i) => i % 251);

  expect((await mandar(null, 'imagem', 'image/webp', bytes)).status).toBe(401);
  expect((await mandar(token, 'outro', 'image/webp', bytes)).status).toBe(400);
  expect((await mandar(token, 'imagem', 'text/html', bytes)).status).toBe(415);
  expect((await mandar(token, 'gif', 'image/png', bytes)).status).toBe(415);
  expect((await mandar(token, 'figurinha', 'image/webp', new Uint8Array(1024 * 1024 + 1))).status).toBe(413);

  const r = await mandar(token, 'imagem', 'image/webp', bytes);
  expect(r.status).toBe(200);
  const { chave, url, prazoDias } = (await r.json()) as { chave: string; url: string; prazoDias: number };
  expect(chave).toMatch(new RegExp(`^imagem/${conta.uid}/[a-z0-9]{20}$`));
  expect(url).toBe(`${CARTEIRO}/arquivo/${chave}`);
  expect(prazoDias).toBe(60);

  const baixado = await fetch(url);
  expect(baixado.status).toBe(200);
  expect(baixado.headers.get('content-type')).toBe('image/webp');
  expect(new Uint8Array(await baixado.arrayBuffer())).toEqual(bytes);

  const pedaco = await fetch(url, { headers: { range: 'bytes=100-199' } });
  expect(pedaco.status).toBe(206);
  expect(pedaco.headers.get('content-range')).toBe('bytes 100-199/5000');
  expect(new Uint8Array(await pedaco.arrayBuffer())).toEqual(bytes.slice(100, 200));

  // Chave inventada: não existe.
  expect((await fetch(`${CARTEIRO}/arquivo/imagem/${conta.uid}/aaaaaaaaaaaaaaaaaaaa`)).status).toBe(404);
  expect((await fetch(`${CARTEIRO}/arquivo/../segredo`)).status).toBe(404);

  // Figurinha não tem prazo.
  const fig = (await (await mandar(token, 'figurinha', 'image/webp', bytes)).json()) as { url: string; prazoDias: number };
  expect(fig.prazoDias).toBe(0);

  // Limpeza "daqui a 61 dias": a imagem some, a figurinha fica.
  const daqui61 = Date.now() + 61 * 24 * 60 * 60 * 1000;
  const resumo = (await (await fetch(`${CARTEIRO}/teste/limpar?agora=${daqui61}`, { method: 'POST' })).json()) as {
    apagados: number;
    prazoDias: number;
  };
  expect(resumo.prazoDias).toBe(60);
  expect(resumo.apagados).toBeGreaterThanOrEqual(1);
  expect((await fetch(url)).status).toBe(404);
  expect((await fetch(fig.url)).status).toBe(200);
});

test('limpeza: passando de 8 GB guardados, o prazo cai para 30 dias', async () => {
  const GB = 1024 ** 3;
  const dia = 24 * 60 * 60 * 1000;
  const agora = Date.UTC(2026, 10, 23);
  const objetos = [
    { key: 'video/a/x1', size: 5 * GB, uploaded: new Date(agora - 40 * dia), httpEtag: '' },
    { key: 'video/a/x2', size: 4 * GB, uploaded: new Date(agora - 10 * dia), httpEtag: '' },
    { key: 'figurinha/a/x3', size: 1000, uploaded: new Date(agora - 400 * dia), httpEtag: '' },
  ];
  const apagados: string[] = [];
  let gravado = '';
  const balde: Balde = {
    list: async () => ({ objects: objetos, truncated: false }),
    delete: async (chaves) => {
      apagados.push(...(Array.isArray(chaves) ? chaves : [chaves]));
    },
    put: async (_c, corpo) => {
      gravado = new TextDecoder().decode(corpo as ArrayBuffer);
      return null;
    },
    get: async () => null,
  };
  const resumo = await limpar(balde, agora);
  expect(resumo.prazoDias).toBe(30);
  // O vídeo de 40 dias sai (passou de 30); o de 10 fica; figurinha nunca sai.
  expect(apagados).toEqual(['video/a/x1']);
  expect(resumo.total).toBe(4 * GB + 1000);
  expect(JSON.parse(gravado).prazoDias).toBe(30);
});
