import { expect, test } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';

import {
  createGroupThroughUi,
  limparTudo,
  markEmailVerified,
  newAccount,
  sendMessageThroughUi,
  signUpThroughUi,
  usernameFor,
} from './helpers';
import type { TestAccount } from './helpers';

/**
 * Etapa 20 — capturas das telas principais com a identidade nova, desktop e
 * mobile, em screenshots/identidade/ (pasta fora do git, como screenshots/).
 * Não confere nada visual: quem julga é o Leo olhando. Só garante que cada
 * tela chegou ao estado certo antes da foto.
 */

const accounts: TestAccount[] = [];
function track(label: string): TestAccount {
  const account = newAccount(label);
  accounts.push(account);
  return account;
}
test.afterAll(async () => {
  await limparTudo(accounts, 'capturas da identidade — limpeza');
});

const PASTA = 'screenshots/identidade';
const TAMANHOS = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
} as const;
type Tamanho = keyof typeof TAMANHOS;

/** Foto da página já assentada: fontes prontas e nenhuma animação no meio. */
async function foto(page: Page, nome: string): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('.view-ghost')).toHaveCount(0);
  await page.evaluate(() => document.getAnimations().forEach((a) => a.finish()));
  await page.screenshot({ path: `${PASTA}/${nome}.png` });
}

async function novaPagina(browser: Browser, tamanho: Tamanho): Promise<Page> {
  const contexto = await browser.newContext({ viewport: TAMANHOS[tamanho] });
  return contexto.newPage();
}

for (const tamanho of ['desktop', 'mobile'] as const) {
  test(`capturas — ${tamanho}`, async ({ browser }) => {
    test.setTimeout(240_000);
    const mobile = tamanho === 'mobile';
    const p = (nome: string): string => `${tamanho}-${nome}`;

    /* --- autenticação, na ordem em que a pessoa passa por ela ----------- */
    const conta = track(`foto-${tamanho}`);
    const page = await novaPagina(browser, tamanho);
    await page.goto('/');
    await expect(page.locator('.auth__submit')).toBeVisible();
    await foto(page, p('01-login'));

    await page.getByRole('button', { name: 'Esqueci minha senha' }).click();
    await foto(page, p('02-recuperar-senha'));
    await page.goto('/');

    await page.getByRole('button', { name: 'Criar conta' }).click();
    await page.getByLabel('Nome de exibição').fill(conta.displayName);
    await page.getByLabel('E-mail').fill(conta.email);
    await page.getByLabel('Senha').fill(conta.password);
    await foto(page, p('03-cadastro'));
    await page.getByRole('button', { name: 'Criar conta' }).click();

    await expect(page.getByText('Confirme seu e-mail')).toBeVisible({ timeout: 30_000 });
    await foto(page, p('04-confirmar-email'));
    await markEmailVerified(conta);

    await expect(page.getByText('Como te encontram no Loft')).toBeVisible({ timeout: 30_000 });
    await page.locator('.username__input').fill(usernameFor(conta));
    await foto(page, p('05-escolher-arroba'));
    await page.locator('.username__submit').click();

    /* --- sem grupo, depois um grupo com conversa ------------------------- */
    await expect(page.getByText('Nenhum grupo por aqui ainda')).toBeVisible({ timeout: 30_000 });
    await foto(page, p('06-sem-grupos'));

    await createGroupThroughUi(page, 'Os de sempre');
    if (mobile) await page.keyboard.press('Escape');
    for (const texto of ['alguém on hoje à noite?', 'eu! depois das 20h', 'bora, eu levo a pipoca']) {
      await sendMessageThroughUi(page, texto);
      await expect(page.getByText(texto, { exact: true })).toBeVisible();
    }
    await foto(page, p('07-chat-do-grupo'));

    // Menu de contexto de uma mensagem.
    await page.locator('.message', { hasText: 'eu! depois das 20h' }).click({ button: 'right' });
    await expect(page.locator('.context-menu')).toBeVisible();
    await foto(page, p('08-menu-de-contexto'));
    await page.keyboard.press('Escape');

    // Fixar e abrir o painel de fixadas (o bilhete).
    await page.locator('.message', { hasText: 'bora, eu levo a pipoca' }).click({ button: 'right' });
    await page.locator('.context-menu').getByRole('menuitem', { name: 'Fixar mensagem' }).click();
    await page.locator('.chat__pin-button').click();
    await expect(page.getByRole('dialog').locator('.pinned-item')).toHaveCount(1);
    await foto(page, p('09-fixadas-do-grupo'));
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // Um modal comum: convidar pessoas. No mobile o menu do grupo mora na gaveta.
    if (mobile) await page.locator('.chat .chat__mobile-button--left').click();
    await page.getByRole('button', { name: 'Opções do grupo' }).click();
    await page.getByRole('menuitem', { name: 'Convidar pessoas' }).click();
    await expect(page.locator('.modal__link')).toBeVisible({ timeout: 30_000 });
    await foto(page, p('10-modal-convite'));
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);

    if (mobile) {
      // Gaveta de canais aberta.
      await page.locator('.chat .chat__mobile-button--left').click();
      await expect(page.locator('.app.drawer-left')).toBeVisible();
      await foto(page, p('11-gaveta-canais'));
      await page.mouse.click(TAMANHOS.mobile.width - 10, TAMANHOS.mobile.height / 2);
      await expect(page.locator('.app.drawer-left')).toHaveCount(0);
    }

    /* --- sala de voz ----------------------------------------------------- */
    if (mobile) {
      await page.locator('.chat .chat__mobile-button--left').click();
    }
    await page.locator('.channel', { hasText: 'Sala Principal' }).click();
    await expect(page.locator('.room')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('.room__person')).toHaveCount(1, { timeout: 30_000 });
    await foto(page, p('12-sala-de-voz'));
    await page.keyboard.press('Control+Alt+v');
    await expect(page.locator('dialog.modal[open] .diag')).toBeVisible({ timeout: 15_000 });
    await foto(page, p('13-diagnostico'));
    await page.keyboard.press('Escape');

    /* --- tela inicial ---------------------------------------------------- */
    if (mobile) await page.locator('.room .chat__mobile-button--left').click();
    await page.getByRole('button', { name: 'Tela inicial' }).click();
    if (mobile) await page.mouse.click(TAMANHOS.mobile.width - 10, TAMANHOS.mobile.height / 2);
    await expect(page.locator('.friends')).toBeVisible({ timeout: 15_000 });
    for (const aba of ['amigos', 'pendentes', 'adicionar', 'bloqueados'] as const) {
      await page.locator(`.friends__tab[data-tab="${aba}"]`).click();
      await expect(page.locator(`.friends__tab[data-tab="${aba}"]`)).toHaveAttribute('aria-selected', 'true');
      await foto(page, p(`14-inicio-${aba}`));
    }

    await page.context().close();
  });
}

test('capturas — PV com cartão de perfil e fixada (desktop e mobile)', async ({ browser }) => {
  test.setTimeout(240_000);
  const ana = track('foto-ana');
  const leo = track('foto-leo');

  const paginaAna = await novaPagina(browser, 'desktop');
  await paginaAna.goto('/');
  await signUpThroughUi(paginaAna, ana);
  const paginaLeo = await novaPagina(browser, 'desktop');
  await paginaLeo.goto('/');
  await signUpThroughUi(paginaLeo, leo);

  // Amizade: Ana pede, Leo aceita.
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

  // PV: abre pela lista de amigos, conversa e fixa uma.
  await abrirAmigos(paginaLeo, 'amigos');
  await paginaLeo.locator('.friends__row--clickable', { hasText: ana.displayName }).click();
  await expect(paginaLeo.locator('.dm-chat__name')).toHaveText(ana.displayName, { timeout: 15_000 });
  for (const texto of ['oi! viu o trailer novo?', 'vi!! sábado a gente assiste']) {
    await sendMessageThroughUi(paginaLeo, texto);
    await expect(paginaLeo.locator('.message', { hasText: texto })).toBeVisible();
  }
  await paginaLeo.locator('.message', { hasText: 'vi!! sábado a gente assiste' }).click({ button: 'right' });
  await paginaLeo.locator('.context-menu').getByRole('menuitem', { name: 'Fixar mensagem' }).click();
  await expect(paginaLeo.locator('.pinned-item')).toHaveCount(1, { timeout: 15_000 });
  await foto(paginaLeo, 'desktop-15-pv-perfil-e-fixada');

  // A mesma tela no mobile, com a gaveta do perfil aberta.
  await paginaLeo.setViewportSize(TAMANHOS.mobile);
  await expect(paginaLeo.locator('.dm-chat__name')).toBeVisible();
  await foto(paginaLeo, 'mobile-15-pv');
  await paginaLeo.locator('.chat__mobile-button--right').first().click();
  await expect(paginaLeo.locator('.app.drawer-right')).toBeVisible();
  await foto(paginaLeo, 'mobile-16-pv-gaveta-perfil');

  await paginaAna.context().close();
  await paginaLeo.context().close();
});
