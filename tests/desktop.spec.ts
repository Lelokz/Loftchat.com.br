import { _electron as electron, expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  createGroupThroughUi,
  limparTudo,
  newAccount,
  sendMessageThroughUi,
  signInThroughUi,
  signUpThroughUi,
} from './helpers';
import type { TestAccount } from './helpers';

/**
 * Janela do Loft (desktop/, Electron) — etapa 1 do app de computador.
 *
 * A janela é aberta de verdade, apontada para o Vite do teste (que já está
 * dentro do emulador), com uma pasta de dados descartável.
 */

const PASTA = join(import.meta.dirname, '..', 'desktop');
const BINARIO = join(
  PASTA,
  'node_modules',
  'electron',
  'dist',
  process.platform === 'win32' ? 'electron.exe' : 'electron',
);

test.skip(!existsSync(BINARIO), 'Electron não instalado em desktop/');

const accounts: TestAccount[] = [];
let app: ElectronApplication;
let janela: Page;
let dados: string;

test.beforeEach(async ({ baseURL }) => {
  dados = mkdtempSync(join(process.env['LOFT_TMP'] ?? tmpdir(), 'loft-janela-'));
  // O terminal do VS Code define ELECTRON_RUN_AS_NODE, que faz o Electron
  // rodar como Node em vez de abrir janela.
  const { ELECTRON_RUN_AS_NODE: _fora, ...ambiente } = process.env;
  app = await electron.launch({
    executablePath: BINARIO,
    args: [PASTA, '--use-fake-device-for-media-stream'],
    env: { ...ambiente, LOFT_URL: baseURL!, LOFT_DADOS: dados } as Record<string, string>,
  });
  janela = await app.firstWindow();
});

test.afterEach(async () => {
  await app.close();
  rmSync(dados, { recursive: true, force: true });
});

test.afterAll(async () => {
  await limparTudo(accounts, 'desktop — limpeza');
});

test('a janela abre o Loft', async () => {
  await expect(janela.getByRole('button', { name: 'Entrar', exact: true })).toBeVisible({
    timeout: 30_000,
  });
  expect(await janela.title()).toContain('Loft');
  // Sem barra de menu do Electron.
  expect(await app.evaluate(({ Menu }) => Menu.getApplicationMenu())).toBeNull();
});

test('janela e navegador conversam: a mesma conta troca mensagens nos dois sentidos', async ({
  browser,
}) => {
  const conta = newAccount('Janela');
  accounts.push(conta);

  await signUpThroughUi(janela, conta);
  await createGroupThroughUi(janela, 'Grupo da janela');
  await sendMessageThroughUi(janela, 'oi da janela');
  await expect(janela.getByText('oi da janela')).toBeVisible();

  const contexto = await browser.newContext();
  const navegador = await contexto.newPage();
  await navegador.goto('/');
  await signInThroughUi(navegador, conta);
  await expect(navegador.locator('.channels__group-name')).toHaveText('Grupo da janela', {
    timeout: 30_000,
  });
  await expect(navegador.getByText('oi da janela')).toBeVisible({ timeout: 15_000 });

  await sendMessageThroughUi(navegador, 'oi do navegador');
  await expect(janela.getByText('oi do navegador')).toBeVisible({ timeout: 15_000 });

  await contexto.close();
});

test('link de fora abre no navegador, e o microfone funciona dentro do Loft', async () => {
  await expect(janela.getByRole('button', { name: 'Entrar', exact: true })).toBeVisible({
    timeout: 30_000,
  });

  await app.evaluate(({ shell }) => {
    const abertos: string[] = [];
    (globalThis as unknown as { abertos: string[] }).abertos = abertos;
    shell.openExternal = async (url: string) => {
      abertos.push(url);
    };
  });

  await janela.evaluate(() => window.open('https://example.com/fora', '_blank'));
  await expect
    .poll(() => app.evaluate(() => (globalThis as unknown as { abertos: string[] }).abertos))
    .toEqual(['https://example.com/fora']);
  expect(app.windows()).toHaveLength(1);

  const temAudio = await janela.evaluate(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const ok = stream.getAudioTracks().length > 0;
    stream.getTracks().forEach((t) => t.stop());
    return ok;
  });
  expect(temAudio).toBe(true);
});
