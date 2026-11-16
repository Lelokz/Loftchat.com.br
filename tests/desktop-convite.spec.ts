import { _electron as electron, expect, test } from '@playwright/test';
import type { ElectronApplication } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';

import { createGroupThroughUi, limparTudo, newAccount, signUpFromInviteUi, signUpThroughUi } from './helpers';
import type { TestAccount } from './helpers';
import { MEDIA_ARGS } from '../playwright.config';

/**
 * Etapa 9b — o link de convite. O site (`/convite/CÓDIGO`) manda para
 * `loftchat://convite/CÓDIGO`; o sistema abre o programa com esse endereço
 * (ou entrega à janela aberta, pelo `second-instance`) e o programa vai
 * direto para a tela do convite.
 */

const RAIZ = join(import.meta.dirname, '..');
const PASTA = join(RAIZ, 'desktop');
const BINARIO = join(PASTA, 'node_modules', 'electron', 'dist', process.platform === 'win32' ? 'electron.exe' : 'electron');

const accounts: TestAccount[] = [];
const abertos: Array<{ app: ElectronApplication; dados: string }> = [];
let chatEmbutido = '';

test.use({ launchOptions: { args: MEDIA_ARGS } });

test.afterEach(async () => {
  for (const { app, dados } of abertos.splice(0)) {
    await app.close().catch(() => {});
    rmSync(dados, { recursive: true, force: true });
  }
});

test.afterAll(async () => {
  await limparTudo(accounts, 'convite do programa — limpeza');
  if (chatEmbutido !== '') rmSync(chatEmbutido, { recursive: true, force: true });
});

/** A página do site, servida da pasta `site/` com a mesma regra do firebase.json (/convite/** → /convite/index.html). */
async function servirSite(page: import('@playwright/test').Page): Promise<void> {
  const tipos: Record<string, string> = { '.html': 'text/html', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2', '.js': 'text/javascript' };
  await page.route('https://loftchat.com.br/**', async (rota) => {
    const caminho = new URL(rota.request().url()).pathname;
    const arquivo = caminho.startsWith('/convite/')
      ? join(RAIZ, 'site', 'convite', 'index.html')
      : join(RAIZ, 'site', caminho.endsWith('/') ? `${caminho}index.html` : caminho);
    if (!existsSync(arquivo)) return rota.fulfill({ status: 404, body: '' });
    await rota.fulfill({ body: readFileSync(arquivo), contentType: tipos[extname(arquivo)] ?? 'application/octet-stream' });
  });
}

test('site: a página do convite manda para o programa e mostra o código', async ({ page }) => {
  await servirSite(page);
  await page.goto('https://loftchat.com.br/convite/abcd2345');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Você foi chamado');
  await expect(page.getByRole('link', { name: 'Abrir no Loftchat' })).toHaveAttribute('href', 'loftchat://convite/ABCD2345');
  await expect(page.getByRole('link', { name: 'Baixar o Loftchat' })).toHaveAttribute('href', '/#baixar');
  await expect(page.locator('#codigo')).toHaveText('ABCD2345');

  // Código que não existe no alfabeto do convite (tem 0 e 1): avisa, sem botão de abrir.
  await page.goto('https://loftchat.com.br/convite/10000000');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('não parece certo');
  await expect(page.getByRole('link', { name: 'Abrir no Loftchat' })).toHaveCount(0);
});

test.describe('programa', () => {
  test.skip(!existsSync(BINARIO), 'Electron não instalado em desktop/');

  test.beforeAll(() => {
    chatEmbutido = mkdtempSync(join(process.env['LOFT_TMP'] ?? tmpdir(), 'loft-chat-'));
    execFileSync('npx', ['vite', 'build', '--outDir', chatEmbutido, '--emptyOutDir', '--logLevel', 'error'], {
      cwd: RAIZ,
      env: {
        ...process.env,
        VITE_USE_EMULATOR: `${process.env['FIREBASE_AUTH_EMULATOR_HOST']}|${process.env['FIRESTORE_EMULATOR_HOST']}`,
      },
      stdio: 'inherit',
    });
  });

  async function abrirPrograma(args: string[] = []): Promise<ElectronApplication> {
    const dados = mkdtempSync(join(process.env['LOFT_TMP'] ?? tmpdir(), 'loft-janela-'));
    const { ELECTRON_RUN_AS_NODE: _fora, ...ambiente } = process.env;
    const app = await electron.launch({
      executablePath: BINARIO,
      args: [PASTA, '--use-fake-device-for-media-stream', '--mute-audio', ...args],
      env: { ...ambiente, LOFT_PASTA: chatEmbutido, LOFT_DADOS: dados } as Record<string, string>,
    });
    abertos.push({ app, dados });
    await app.evaluate(({ app: eletron, webContents }) => {
      eletron.on('web-contents-created', (_e, c) => c.setAudioMuted(true));
      for (const c of webContents.getAllWebContents()) c.setAudioMuted(true);
    });
    return app;
  }

  test('aberto pelo link: cai no convite, cadastra e entra no grupo; com ele aberto, outro link troca sem recarregar', async ({
    browser,
  }) => {
    test.setTimeout(150_000);
    const dono = newAccount('Dono convite');
    const amigo = newAccount('Amigo programa');
    accounts.push(dono, amigo);

    // O dono cria o grupo e o convite (no navegador).
    const navegador = await (await browser.newContext()).newPage();
    await navegador.goto('/');
    await signUpThroughUi(navegador, dono);
    await createGroupThroughUi(navegador, 'Grupo do link');
    await navegador.getByRole('button', { name: 'Opções do grupo' }).click();
    await navegador.getByRole('menuitem', { name: 'Convidar pessoas' }).click();
    const link = navegador.locator('.modal__link');
    await expect(link).toBeVisible({ timeout: 30_000 });
    const codigo = new URL(await link.inputValue()).pathname.split('/').pop()!;

    // O sistema abre o programa com o link: tela do convite (sem conta: cadastrar por ela).
    const app = await abrirPrograma([`loftchat://convite/${codigo}`]);
    const janela = await app.firstWindow();
    await expect.poll(() => janela.url(), { timeout: 30_000 }).toBe(`app://loftchat/convite/${codigo}`);
    await signUpFromInviteUi(janela, amigo);
    await expect(janela.getByText('Grupo do link')).toBeVisible({ timeout: 30_000 });
    await janela.getByRole('button', { name: 'Entrar no grupo' }).click();
    await expect(janela.locator('.channels__group-name')).toHaveText('Grupo do link', { timeout: 30_000 });

    // Com o programa aberto, outro clique num link (o sistema chama a mesma
    // instância): abre o convite sem recarregar a página.
    await janela.evaluate(() => ((window as unknown as { __marca: number }).__marca = 42));
    await app.evaluate(({ app: eletron }, c) => {
      eletron.emit('second-instance', {}, ['loftchat', `loftchat://convite/${c}`], '/');
    }, codigo);
    await expect(janela.getByRole('button', { name: 'Abrir o grupo' })).toBeVisible({ timeout: 30_000 });
    expect(await janela.evaluate(() => (window as unknown as { __marca?: number }).__marca)).toBe(42);

    // Link torto não faz nada.
    await app.evaluate(({ app: eletron }) => {
      eletron.emit('second-instance', {}, ['loftchat', 'loftchat://convite/../../x'], '/');
    });
    await expect(janela.getByRole('button', { name: 'Abrir o grupo' })).toBeVisible();
    await navegador.context().close();
  });
});
