import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import {
  createGroupThroughUi,
  limparTudo,
  newAccount,
  sendMessageThroughUi,
  signUpThroughUi,
  usernameFor,
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

test('na tela inicial a coluna Início é gaveta, e a gaveta do PV empilha cartão e fixadas', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const ana = track('mob-pv-ana');
  const leo = track('mob-pv-leo');

  // Cadastro, amizade e fixada no desktop; o que se confere é o mobile, depois.
  const desktop = { viewport: { width: 1440, height: 900 } };
  const paginaAna = await (await browser.newContext(desktop)).newPage();
  await paginaAna.goto('/');
  await signUpThroughUi(paginaAna, ana);
  const paginaLeo = await (await browser.newContext(desktop)).newPage();
  await paginaLeo.goto('/');
  await signUpThroughUi(paginaLeo, leo);

  const abrirAmigos = async (page: Page, aba: string): Promise<void> => {
    await page.getByRole('button', { name: 'Tela inicial' }).click();
    await page.getByRole('button', { name: 'Amigos', exact: true }).click();
    await page.locator(`.friends__tab[data-tab="${aba}"]`).click();
  };
  await abrirAmigos(paginaAna, 'adicionar');
  await paginaAna.locator('.friends__input').fill(usernameFor(leo));
  await paginaAna.locator('.friends__submit').click();
  await expect(paginaAna.locator('.friends__note')).toHaveText('Pedido enviado.', { timeout: 30_000 });
  await abrirAmigos(paginaLeo, 'pendentes');
  await paginaLeo.getByRole('button', { name: 'Aceitar' }).click();

  await abrirAmigos(paginaLeo, 'amigos');
  await paginaLeo.locator('.friends__row--clickable', { hasText: ana.displayName }).click();
  await expect(paginaLeo.locator('.dm-chat__name')).toHaveText(ana.displayName, { timeout: 15_000 });
  await sendMessageThroughUi(paginaLeo, 'sábado a gente assiste');
  await paginaLeo.locator('.message', { hasText: 'sábado a gente assiste' }).click({ button: 'right' });
  await paginaLeo.locator('.context-menu').getByRole('menuitem', { name: 'Fixar mensagem' }).click();
  await expect(paginaLeo.locator('.pinned-item')).toHaveCount(1, { timeout: 15_000 });

  // Agora no celular.
  await paginaLeo.setViewportSize({ width: 390, height: 780 });
  const app = paginaLeo.locator('.app');
  const inicio = paginaLeo.locator('.home-column');

  // A coluna Início não fica empilhada em cima do PV: está escondida na gaveta.
  await expect(inicio).toBeHidden();
  const chatBox = (await paginaLeo.locator('.chat').boundingBox())!;
  expect(Math.round(chatBox.y)).toBe(0);
  expect(Math.round(chatBox.width)).toBe(390);

  // Abre pela gaveta da esquerda, junto com a barra de grupos.
  await paginaLeo.locator('.chat .chat__mobile-button--left').click();
  await expect(app).toHaveClass(/drawer-left/);
  await expect(inicio).toBeVisible();
  await expect(paginaLeo.locator('.group-bar')).toBeVisible();

  // Tocar dentro da gaveta não a fecha; escolher "Amigos" fecha.
  await paginaLeo.getByRole('button', { name: 'Amigos', exact: true }).click();
  await expect(app).not.toHaveClass(/drawer-left/);
  await expect(paginaLeo.locator('.friends')).toBeVisible();
  await expect(inicio).toBeHidden();

  // Da tela de Amigos também dá para abrir a gaveta, e toque fora fecha.
  // x=360 está à direita da gaveta (rail 64 + coluna 260 = 324px).
  await paginaLeo.getByRole('button', { name: 'Abrir menu' }).click();
  await expect(app).toHaveClass(/drawer-left/);
  await paginaLeo.mouse.click(360, 400);
  await expect(app).not.toHaveClass(/drawer-left/);

  // Escolher a conversa fecha a gaveta e abre o PV.
  await paginaLeo.getByRole('button', { name: 'Abrir menu' }).click();
  await paginaLeo.locator('.home-column__dm', { hasText: ana.displayName }).click();
  await expect(app).not.toHaveClass(/drawer-left/);
  await expect(paginaLeo.locator('.dm-chat__name')).toBeVisible();

  // Gaveta do perfil: cartão EM CIMA, fixadas EMBAIXO, as duas na largura toda.
  await paginaLeo.locator('.chat .chat__mobile-button--right').click();
  await expect(app).toHaveClass(/drawer-right/);
  const perfil = (await paginaLeo.locator('.members__profile').boundingBox())!;
  const fixadas = (await paginaLeo.locator('.members__pinned').boundingBox())!;
  expect(fixadas.y).toBeGreaterThanOrEqual(perfil.y + perfil.height - 1);
  expect(Math.round(fixadas.width)).toBe(Math.round(perfil.width));
  const bilhete = (await paginaLeo.locator('.members__pinned .pinned-item').boundingBox())!;
  expect(bilhete.width).toBeGreaterThan(fixadas.width / 2);

  await paginaAna.context().close();
  await paginaLeo.context().close();
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
