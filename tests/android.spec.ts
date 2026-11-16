import { _android as android, expect, test } from '@playwright/test';
import type { AndroidDevice, Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

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
 * Etapa 10a — o app Android de verdade, num emulador de Android.
 *
 * Roda só quando pedido: `LOFT_ANDROID_APK` aponta para um APK de TESTE (o
 * `scripts/android.sh` com `VITE_USE_EMULATOR='127.0.0.1:9099|127.0.0.1:8088'`)
 * e um emulador de Android está ligado. O app chega ao Firebase de teste do
 * PC pelo `adb reverse`, e o teste mexe na tela do app pelo depurador da
 * WebView (só existe na versão de teste).
 */

const APK = process.env['LOFT_ANDROID_APK'] ?? '';
const ADB = '/mnt/cab1286d-6765-4c73-9c77-8d3119b4b644/Arquivo/Android-Ferramentas/sdk/platform-tools/adb';
const PACOTE = 'br.com.loftchat';

const adb = (...args: string[]): string => execFileSync(ADB, args, { encoding: 'utf8' });

const temAparelho = (): boolean => {
  if (APK === '' || !existsSync(APK) || !existsSync(ADB)) return false;
  try {
    return adb('devices').split('\n').some((l) => /\tdevice$/.test(l));
  } catch {
    return false;
  }
};

test.skip(!temAparelho(), 'sem APK de teste (LOFT_ANDROID_APK) ou sem emulador de Android ligado');

const accounts: TestAccount[] = [];
let aparelho: AndroidDevice | null = null;

test.afterAll(async () => {
  await aparelho?.close().catch(() => {});
  await limparTudo(accounts, 'android — limpeza');
});

/** Abre o app do zero e devolve a página da WebView, pelo depurador. */
async function abrirApp(): Promise<Page> {
  adb('reverse', 'tcp:9099', 'tcp:9099');
  adb('reverse', 'tcp:8088', 'tcp:8088');
  adb('install', '-r', APK);
  adb('shell', 'pm', 'clear', PACOTE);
  adb('shell', 'pm', 'grant', PACOTE, 'android.permission.RECORD_AUDIO');
  adb('shell', 'am', 'start', '-W', '-n', `${PACOTE}/.MainActivity`);
  const [primeiro] = await android.devices();
  expect(primeiro, 'o Playwright não achou o emulador de Android').toBeDefined();
  aparelho = primeiro!;
  const webview = await aparelho.webView({ pkg: PACOTE }, { timeout: 60_000 });
  const pagina = await webview.page();
  return pagina;
}

test('app Android: cadastra, cria grupo, troca mensagem com o navegador, voltar fecha a gaveta, entra na sala', async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const conta = newAccount('Celular');
  accounts.push(conta);

  const celular = await abrirApp();
  await expect(celular.getByRole('button', { name: 'Entrar', exact: true })).toBeVisible({ timeout: 60_000 });
  // Dentro do app: é o Capacitor, e o convite sai com o endereço do site.
  expect(await celular.evaluate(() => (window as unknown as { Capacitor?: { isNativePlatform(): boolean } }).Capacitor?.isNativePlatform())).toBe(true);

  await signUpThroughUi(celular, conta);
  await createGroupThroughUi(celular, 'Grupo do celular');
  await sendMessageThroughUi(celular, 'oi do celular');
  await expect(celular.getByText('oi do celular')).toBeVisible({ timeout: 30_000 });

  // A mesma conta no navegador do PC vê e responde.
  const navegador = await (await browser.newContext()).newPage();
  await navegador.goto('/');
  await signInThroughUi(navegador, conta);
  await expect(navegador.getByText('oi do celular')).toBeVisible({ timeout: 30_000 });
  await sendMessageThroughUi(navegador, 'oi do PC');
  await expect(celular.getByText('oi do PC')).toBeVisible({ timeout: 30_000 });

  // Link de convite do app: o do site, nunca o https://localhost do app.
  // No celular as opções do grupo ficam na gaveta dos canais.
  await celular.getByRole('button', { name: 'Abrir canais' }).first().click();
  await celular.getByRole('button', { name: 'Opções do grupo' }).click();
  await celular.getByRole('menuitem', { name: 'Convidar pessoas' }).click();
  await expect(celular.locator('.modal__link')).toHaveValue(/^https:\/\/loftchat\.com\.br\/convite\//, { timeout: 30_000 });
  // VOLTAR do Android com a janela aberta: fecha a janela, o app continua.
  adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');
  await expect(celular.locator('.modal__link')).toHaveCount(0);

  // Gaveta dos canais aberta + VOLTAR = fecha a gaveta (e o app continua aberto).
  if ((await celular.locator('.app.drawer-left').count()) === 0) {
    await celular.getByRole('button', { name: 'Abrir canais' }).first().click();
  }
  await expect(celular.locator('.app.drawer-left')).toHaveCount(1);
  adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');
  await expect(celular.locator('.app.drawer-left')).toHaveCount(0);
  expect(adb('shell', 'dumpsys', 'activity', 'activities')).toContain(`${PACOTE}/.MainActivity`);
  await expect(celular.getByText('oi do PC')).toBeVisible();

  // Sala de voz pela gaveta: entra, com microfone (sem o aviso de "sem microfone").
  await celular.getByRole('button', { name: 'Abrir canais' }).first().click();
  await celular.locator('.channel', { hasText: 'Sala Principal' }).first().click();
  await expect(celular.locator('.room__title')).toHaveText('Sala Principal', { timeout: 30_000 });
  await expect(celular.getByText('sem microfone', { exact: false })).toHaveCount(0);
  await expect(celular.locator('.room__count')).toHaveText('só você');

  await navegador.context().close();
});
