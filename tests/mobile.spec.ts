import { expect, test } from '@playwright/test';

import {
  createGroupThroughUi,
  limparTudo,
  newAccount,
  sendMessageThroughUi,
  signUpThroughUi,
} from './helpers';
import type { TestAccount } from './helpers';

/**
 * Suíte do layout mobile.
 *
 * `test.use` no topo cria o contexto com viewport de celular e toque — MESMO
 * projeto do Playwright, não um segundo. Um segundo projeto rodaria a suíte
 * inteira duas vezes e dobraria a criação de contas, que já esbarra no limite
 * do Firebase Auth.
 */
test.use({
  viewport: { width: 390, height: 780 },
  hasTouch: true,
  isMobile: true,
});

const accounts: TestAccount[] = [];

function track(label: string): TestAccount {
  const account = newAccount(label);
  accounts.push(account);
  return account;
}

test.afterAll(async () => {
  await limparTudo(accounts, "mobile — limpeza");
});

/**
 * Toque longo sintético.
 *
 * O Playwright não tem "segurar o dedo": `touchscreen.tap` só toca e solta. Os
 * eventos abaixo são os mesmos que o handler escuta de verdade — `pointerType:
 * 'touch'` é o que o distingue do mouse.
 */
async function longPress(
  page: import('@playwright/test').Page,
  selector: string,
  options: { drift?: number } = {},
): Promise<void> {
  const box = (await page.locator(selector).first().boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;

  await page.locator(selector).first().dispatchEvent('pointerdown', {
    pointerType: 'touch',
    clientX: x,
    clientY: y,
    bubbles: true,
  });

  if (options.drift !== undefined) {
    await page.locator(selector).first().dispatchEvent('pointermove', {
      pointerType: 'touch',
      clientX: x + options.drift,
      clientY: y,
      bubbles: true,
    });
  }

  // Além dos 500ms do toque longo, com folga.
  await page.waitForTimeout(800);
}

test('as gavetas abrem por botão e fecham por toque fora; o chat ocupa a tela', async ({
  page,
}) => {
  const account = track('mob-gaveta');
  await page.goto('/');
  await signUpThroughUi(page, account);
  await createGroupThroughUi(page, 'Grupo Mobile');

  const app = page.locator('.app');
  const channels = page.locator('.channels');
  const members = page.locator('.members');

  // Uma coluna por vez: as outras três estão fora da tela.
  await expect(channels).toBeHidden();
  await expect(members).toBeHidden();
  await expect(page.locator('.chat')).toBeVisible();

  // O chat ocupa a largura toda, e o composer está DENTRO da tela — era o
  // sintoma central do celular quebrado.
  const chatBox = (await page.locator('.chat').boundingBox())!;
  expect(Math.round(chatBox.width)).toBe(390);
  const composer = (await page.locator('.composer').boundingBox())!;
  expect(Math.round(composer.y + composer.height)).toBeLessThanOrEqual(780);

  // Gaveta da esquerda: grupos + canais juntos.
  await page.getByRole('button', { name: 'Abrir canais' }).click();
  await expect(app).toHaveClass(/drawer-left/);
  await expect(channels).toBeVisible();
  await expect(page.locator('.group-bar')).toBeVisible();

  // Toque fora fecha. x=360 está à DIREITA da gaveta, que vai até 324px
  // (rail 64 + canais 260) — clicar em 195 seria dentro dela.
  await page.mouse.click(360, 400);
  await expect(app).not.toHaveClass(/drawer-left/);
  await expect(channels).toBeHidden();

  // Gaveta da direita: membros.
  await page.getByRole('button', { name: 'Abrir membros' }).click();
  await expect(app).toHaveClass(/drawer-right/);
  await expect(members).toBeVisible();

  // E o botão de voltar fecha a gaveta em vez de sair da tela.
  await page.goBack();
  await expect(app).not.toHaveClass(/drawer-right/);
  await expect(page.locator('.chat')).toBeVisible();
  expect(new URL(page.url()).pathname).toBe('/');
});

test('toque longo abre o menu na mensagem; arrastar cancela; no composer não abre', async ({
  page,
}) => {
  const account = track('mob-toque');
  await page.goto('/');
  await signUpThroughUi(page, account);
  await createGroupThroughUi(page, 'Grupo Toque');

  await sendMessageThroughUi(page, 'mensagem para segurar');
  await expect(page.locator('.message')).toHaveCount(1, { timeout: 30_000 });

  const menu = page.locator('.context-menu');

  // Arrastar durante os 500ms CANCELA — senão rolar a lista abriria menu sem
  // parar, que é o defeito mais irritante possível numa lista de mensagens.
  await longPress(page, '.message', { drift: 40 });
  await expect(menu, 'arrastar tem que cancelar o toque longo').toBeHidden();

  // Parado, abre.
  await longPress(page, '.message');
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Copiar texto' })).toBeVisible();

  // Alvo de toque grande o bastante para o dedo.
  const item = (await menu.getByRole('menuitem').first().boundingBox())!;
  expect(item.height, 'item de menu precisa caber um dedo').toBeGreaterThanOrEqual(44);

  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();

  /*
   * No CAMPO DE TEXTO o comportamento nativo continua: é assim que se seleciona
   * e se copia no celular, e roubar isso tiraria recortar, colar e o cursor.
   */
  await longPress(page, '.composer__input');
  await expect(menu, 'o composer tem que continuar nativo').toBeHidden();
});

test('a faixa de chamada fica acima do composer no mobile', async ({ page }) => {
  test.setTimeout(60_000);
  const account = track('mob-faixa');
  await page.goto('/');
  await signUpThroughUi(page, account);
  await createGroupThroughUi(page, 'Grupo Faixa');

  // Entra na voz pela gaveta.
  await page.getByRole('button', { name: 'Abrir canais' }).click();
  await page.locator('.channels__body').getByRole('button', { name: 'Sala Principal' }).click();
  await expect(page.locator('.room')).toBeVisible({ timeout: 30_000 });

  // Volta para o chat: a chamada continua, e a faixa precisa estar VISÍVEL —
  // no desktop ela mora na coluna de canais, que aqui é gaveta.
  await page.getByRole('button', { name: 'Abrir canais' }).click();
  await page.locator('.channels__body').getByRole('button', { name: 'geral' }).click();

  const callBar = page.locator('.callbar');
  await expect(callBar).toBeVisible({ timeout: 30_000 });
  await expect(callBar).toHaveClass(/callbar--mobile/);

  // Acima do composer, e não escondida atrás dele.
  const bar = (await callBar.boundingBox())!;
  const composer = (await page.locator('.composer').boundingBox())!;
  expect(bar.y + bar.height).toBeLessThanOrEqual(composer.y + 1);
});
