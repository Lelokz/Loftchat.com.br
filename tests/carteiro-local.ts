import { spawn } from 'node:child_process';
import { join } from 'node:path';

import { expect } from '@playwright/test';

/**
 * O CARTEIRO (carteiro/) rodando aqui, apontado para o emulador: em vez de
 * falar com o Google, ele anota cada envio em `testeCarteiro/`.
 */

const FS_HOST = process.env['FIRESTORE_EMULATOR_HOST'];
export const FS = `http://${FS_HOST}/v1/projects/loft-3d6c0f/databases/(default)/documents`;
const PORTA = 8799;
export const CARTEIRO = `http://127.0.0.1:${PORTA}`;
const HD = '/mnt/cab1286d-6765-4c73-9c77-8d3119b4b644/Arquivo/Loft-desktop/carteiro';

/** Liga o carteiro local e devolve como desligar. */
export async function ligarCarteiroLocal(): Promise<() => void> {
  const raiz = join(import.meta.dirname, '..');
  const processo = spawn(
    join(raiz, 'carteiro/node_modules/.bin/wrangler'),
    [
      'dev',
      '--ip', '127.0.0.1',
      '--port', String(PORTA),
      '--var', `EMULADOR:${FS_HOST}`,
      '--var', 'SEGREDO_FOTO:segredo-de-teste',
      // 0.10.5: transcrição de mentira — os testes não gastam o Whisper de verdade.
      '--var', 'WHISPER_FALSO:1',
      // 0.12.5: o criador nos testes (o @ que o teste dá para uma conta).
      '--var', 'CRIADOR:criadorteste',
      '--persist-to', `${HD}/estado-dev`,
      '--log-level', process.env['LOFT_CARTEIRO_LOG'] ? 'log' : 'warn',
    ],
    {
      cwd: join(raiz, 'carteiro'),
      env: { ...process.env, XDG_CONFIG_HOME: `${HD}/config`, WRANGLER_SEND_METRICS: 'false', WRANGLER_LOG_PATH: `${HD}/logs` },
      stdio: process.env['LOFT_CARTEIRO_LOG'] ? 'inherit' : 'ignore',
    },
  );
  for (let i = 0; i < 120; i += 1) {
    const ok = await fetch(`${CARTEIRO}/`).then((r) => r.ok).catch(() => false);
    if (ok) return () => processo.kill('SIGTERM');
    await new Promise((r) => setTimeout(r, 500));
  }
  processo.kill('SIGTERM');
  throw new Error('o carteiro local não ligou');
}

type Valor = string | number | Record<string, unknown>;

export function campos(dados: Record<string, Valor>): Record<string, unknown> {
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
export async function comoDono(caminho: string, dados: Record<string, Valor>): Promise<void> {
  const r = await fetch(`${FS}/${caminho}`, {
    method: 'PATCH',
    headers: { authorization: 'Bearer owner', 'content-type': 'application/json' },
    body: JSON.stringify({ fields: campos(dados) }),
  });
  expect(r.ok, `gravar ${caminho}`).toBe(true);
}

export async function lerComoDono(caminho: string): Promise<Record<string, Record<string, unknown>> | null> {
  const r = await fetch(`${FS}/${caminho}`, { headers: { authorization: 'Bearer owner' } });
  if (r.status === 404) return null;
  return ((await r.json()) as { fields?: Record<string, Record<string, unknown>> }).fields ?? {};
}

/** Pede ao carteiro local o aviso de uma mensagem, como o app de quem mandou faz. */
export async function avisar(idToken: string | null, corpo: unknown): Promise<Response> {
  return fetch(`${CARTEIRO}/avisar`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(idToken === null ? {} : { authorization: `Bearer ${idToken}` }),
    },
    body: JSON.stringify(corpo),
  });
}

/** Os canais de um grupo (id e nome), lidos como dono. */
export async function canaisDoGrupo(grupo: string): Promise<{ id: string; nome: string }[]> {
  const r = await fetch(`${FS}:runQuery`, {
    method: 'POST',
    headers: { authorization: 'Bearer owner', 'content-type': 'application/json' },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'channels' }],
        where: { fieldFilter: { field: { fieldPath: 'groupId' }, op: 'EQUAL', value: { stringValue: grupo } } },
      },
    }),
  });
  const linhas = (await r.json()) as { document?: { name: string; fields: { name?: { stringValue: string } } } }[];
  return linhas
    .filter((l) => l.document !== undefined)
    .map((l) => ({ id: l.document!.name.split('/').pop()!, nome: l.document!.fields.name?.stringValue ?? '' }));
}

/** Qualquer coleção de um grupo (id + campos já lidos), como dono do projeto. */
export async function doGrupo(colecao: string, grupo: string): Promise<{ id: string; d: Record<string, unknown> }[]> {
  const r = await fetch(`${FS}:runQuery`, {
    method: 'POST',
    headers: { authorization: 'Bearer owner', 'content-type': 'application/json' },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: colecao }],
        where: { fieldFilter: { field: { fieldPath: 'groupId' }, op: 'EQUAL', value: { stringValue: grupo } } },
      },
    }),
  });
  const ler = (v: Record<string, unknown>): unknown =>
    'stringValue' in v ? v['stringValue']
    : 'integerValue' in v ? Number(v['integerValue'])
    : 'booleanValue' in v ? v['booleanValue']
    : 'arrayValue' in v ? (((v['arrayValue'] as { values?: Record<string, unknown>[] }).values ?? []).map(ler))
    : 'mapValue' in v ? Object.fromEntries(Object.entries((v['mapValue'] as { fields?: Record<string, Record<string, unknown>> }).fields ?? {}).map(([k, x]) => [k, ler(x)]))
    : null;
  const linhas = (await r.json()) as { document?: { name: string; fields?: Record<string, Record<string, unknown>> } }[];
  return linhas
    .filter((l) => l.document !== undefined)
    .map((l) => ({ id: l.document!.name.split('/').pop()!, d: Object.fromEntries(Object.entries(l.document!.fields ?? {}).map(([k, v]) => [k, ler(v)])) }));
}
