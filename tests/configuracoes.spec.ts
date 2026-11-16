import { expect, test } from '@playwright/test';
import type { Browser, BrowserContext, Page } from '@playwright/test';

import {
  limparTudo,
  newAccount,
  patchDocViaRest,
  readDocViaRest,
  resolveTokens,
  signUpThroughUi,
  usernameFor,
} from './helpers';
import type { TestAccount } from './helpers';

/**
 * Proposta A, etapa 2a — Configurações em tela inteira, seção Perfil:
 * nome, @, bio, cor do cartão e fonte do nome, com prévia e barra de salvar.
 */

const accounts: TestAccount[] = [];

test.afterAll(async () => {
  await limparTudo(accounts, 'configurações — limpeza');
});

async function entrar(
  browser: Browser,
  label: string,
  viewport?: { width: number; height: number },
): Promise<{ context: BrowserContext; page: Page; account: TestAccount }> {
  const account = newAccount(label);
  accounts.push(account);
  const context = await browser.newContext(viewport === undefined ? {} : { viewport });
  const page = await context.newPage();
  await page.goto('/');
  await signUpThroughUi(page, account);
  await resolveTokens(account);
  return { context, page, account };
}

async function abrirConfiguracoes(page: Page) {
  await page.getByRole('button', { name: 'Configurações' }).click();
  const tela = page.getByRole('dialog', { name: 'Configurações' });
  await expect(tela).toBeVisible();
  await expect(tela.getByLabel('Nome de exibição')).toBeVisible({ timeout: 15_000 });
  return tela;
}

test('mudar nome, bio, cor e fonte: a prévia acompanha, salvar grava e o amigo vê no cartão do PV', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const a = await entrar(browser, 'Perfil A');
  const b = await entrar(browser, 'Perfil B');

  // Ficam amigos (B adiciona A pelo @).
  await b.page.getByRole('button', { name: 'Privado', exact: true }).click();
  await b.page.getByRole('button', { name: 'Amigos', exact: true }).click();
  await b.page.locator('.friends__tab[data-tab="adicionar"]').click();
  await b.page.locator('.friends__input').fill(usernameFor(a.account));
  await b.page.locator('.friends__submit').click();
  await expect(b.page.locator('.friends__note')).toHaveText('Pedido enviado.', { timeout: 30_000 });
  await a.page.getByRole('button', { name: 'Privado', exact: true }).click();
  await a.page.getByRole('button', { name: 'Amigos', exact: true }).click();
  await a.page.locator('.friends__tab[data-tab="pendentes"]').click();
  await a.page.getByRole('button', { name: 'Aceitar' }).click();

  const tela = await abrirConfiguracoes(a.page);
  const previa = tela.locator('.settings__preview .person-card');
  await expect(previa.locator('.person-card__name')).toHaveText(a.account.displayName);
  await expect(previa.locator('.person-card__handle')).toHaveText(`@${usernameFor(a.account)}`);

  // Nada mudou: sem barra de salvar.
  await expect(tela.getByRole('region', { name: 'Alterações não salvas' })).toBeHidden();

  await tela.getByLabel('Nome de exibição').fill('Lelokz Teste');
  await tela.getByLabel('Bio').fill('editor de vídeo · canal no YouTube');
  await tela.getByRole('radio', { name: 'Rosa' }).click();
  await tela.getByRole('radio', { name: 'Pixelada' }).click();

  // A prévia acompanha sem salvar.
  await expect(previa.locator('.person-card__name')).toHaveText('Lelokz Teste');
  await expect(previa.locator('.person-card__bio')).toHaveText('editor de vídeo · canal no YouTube');
  await expect(previa.locator('.person-card__name')).toHaveCSS('font-family', /Silkscreen/);

  const barra = tela.getByRole('region', { name: 'Alterações não salvas' });
  await expect(barra).toBeVisible();

  // Esc com alteração pendente NÃO fecha (e não abre pergunta nenhuma).
  await a.page.keyboard.press('Escape');
  await expect(tela).toBeVisible();
  await expect(a.page.getByRole('dialog')).toHaveCount(1);

  await barra.getByRole('button', { name: 'Salvar' }).click();
  await expect(barra).toBeHidden({ timeout: 15_000 });
  await expect(a.page.locator('.toast')).toContainText('Perfil salvo.');

  // O meu cartão na barra de cima já mudou.
  await a.page.keyboard.press('Escape');
  await expect(tela).toBeHidden();
  await expect(a.page.locator('.session-footer__name').first()).toHaveText('Lelokz Teste');

  // No banco.
  const perfil = await readDocViaRest(a.account, `users/${a.account.uid}`);
  expect(perfil.fields?.['displayName']?.stringValue).toBe('Lelokz Teste');
  expect(perfil.fields?.['bio']?.stringValue).toBe('editor de vídeo · canal no YouTube');
  expect(perfil.fields?.['accentId']?.stringValue).toBe('rosa');
  expect(perfil.fields?.['fontId']?.stringValue).toBe('pixelada');

  // O amigo vê no cartão do PV: nome, bio, cor e fonte DE A.
  await b.page.reload();
  await b.page.getByRole('button', { name: 'Privado', exact: true }).click();
  await b.page.getByRole('button', { name: 'Amigos', exact: true }).click();
  await b.page.locator('.friends__tab[data-tab="amigos"]').click();
  await b.page.locator('.friends__row--clickable', { hasText: 'Lelokz Teste' }).click();
  const cartao = b.page.locator('.profile-card');
  await expect(cartao.locator('.person-card__name')).toHaveText('Lelokz Teste', { timeout: 15_000 });
  await expect(cartao.locator('.person-card__bio')).toHaveText('editor de vídeo · canal no YouTube');
  await expect(cartao.locator('.person-card__name')).toHaveCSS('font-family', /Silkscreen/);
  expect(await cartao.evaluate((n) => (n as HTMLElement).style.getPropertyValue('--card-cor'))).toBe('#c2467e');

  // Entrar de novo mantém o nome novo (o login não volta o antigo).
  await a.page.reload();
  await expect(a.page.locator('.session-footer__name').first()).toHaveText('Lelokz Teste', {
    timeout: 30_000,
  });

  await a.context.close();
  await b.context.close();
});

test('trocar o @: ocupado trava o Salvar; livre troca, libera o antigo e gasta uma troca', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const dona = await entrar(browser, 'Dona arroba');
  const a = await entrar(browser, 'Troca arroba');
  const antigo = usernameFor(a.account);

  const tela = await abrirConfiguracoes(a.page);
  const campo = tela.getByLabel('Nome de usuário');
  const aviso = tela.locator('#settings-arroba-aviso');
  await expect(aviso).toContainText('Você ainda pode trocar 2 vezes.');

  await campo.fill(usernameFor(dona.account));
  await expect(aviso).toHaveText(`@${usernameFor(dona.account)} já é de alguém. Escolha outro.`);
  await expect(tela.getByRole('button', { name: 'Salvar' })).toBeDisabled();

  await campo.fill('ab');
  await expect(aviso).toHaveAttribute('data-tom', 'erro');
  await expect(tela.getByRole('button', { name: 'Salvar' })).toBeDisabled();

  const novo = `${antigo.slice(0, 16)}_n`;
  await campo.fill(novo);
  await expect(aviso).toContainText(`@${novo} está livre.`);
  await tela.getByRole('button', { name: 'Salvar' }).click();
  await expect(tela.getByRole('region', { name: 'Alterações não salvas' })).toBeHidden({ timeout: 15_000 });
  await expect(aviso).toContainText('Você ainda pode trocar 1 vez.');

  const reserva = await readDocViaRest(a.account, `usernames/${novo}`);
  expect(reserva.fields?.['uid']?.stringValue).toBe(a.account.uid);
  expect((await readDocViaRest(a.account, `usernames/${antigo}`)).status).toBe(404);

  await a.page.keyboard.press('Escape');
  await expect(a.page.locator('.session-footer__handle').first()).toHaveText(`@${novo}`);

  await a.context.close();
  await dona.context.close();
});

test('Desfazer volta tudo como estava, e a REGRA recusa cor, fonte e bio fora da lista', async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const a = await entrar(browser, 'Desfazer');

  const tela = await abrirConfiguracoes(a.page);
  await tela.getByLabel('Bio').fill('isso vai sumir');
  await tela.getByRole('radio', { name: 'Verde' }).click();
  await tela.getByRole('button', { name: 'Desfazer' }).click();
  await expect(tela.getByLabel('Bio')).toHaveValue('');
  await expect(tela.getByRole('radio', { name: 'Roxo' })).toHaveAttribute('aria-checked', 'true');
  await expect(tela.getByRole('region', { name: 'Alterações não salvas' })).toBeHidden();
  await a.page.keyboard.press('Escape');
  await expect(tela).toBeHidden();

  // Contornando a tela: valores fora da lista fechada não entram.
  const caminho = `users/${a.account.uid}`;
  expect(await patchDocViaRest(a.account, caminho, { accentId: 'red; background:url(x)' })).toBe(403);
  expect(await patchDocViaRest(a.account, caminho, { fontId: 'Comic Sans' })).toBe(403);
  expect(await patchDocViaRest(a.account, caminho, { bio: 'x'.repeat(161) })).toBe(403);
  expect(await patchDocViaRest(a.account, caminho, { displayName: '' })).toBe(403);
  // Dentro da lista, passa.
  expect(await patchDocViaRest(a.account, caminho, { accentId: 'azul', bio: 'oi' })).toBe(200);

  await a.context.close();
});

test('no celular: a engrenagem abre a lista de seções, entra no Perfil, volta e sai da conta', async ({ browser }) => {
  test.setTimeout(90_000);
  const a = await entrar(browser, 'Celular conf', { width: 390, height: 844 });

  await a.page.getByRole('button', { name: 'Configurações' }).click();
  const tela = a.page.getByRole('dialog', { name: 'Configurações' });
  await expect(tela.getByRole('button', { name: 'Perfil' })).toBeVisible();
  await expect(tela.getByLabel('Nome de exibição')).toBeHidden();

  await tela.getByRole('button', { name: 'Perfil' }).click();
  await expect(tela.getByLabel('Nome de exibição')).toBeVisible({ timeout: 15_000 });
  const largura = await a.page.evaluate(() => document.documentElement.scrollWidth);
  expect(largura).toBeLessThanOrEqual(390);

  await tela.getByRole('button', { name: 'Voltar para as seções' }).click();
  await expect(tela.getByRole('button', { name: 'Conta e segurança' })).toBeVisible();

  // "Sair da conta" mora aqui no celular — e funciona.
  await tela.getByRole('button', { name: 'Sair da conta' }).click();
  await expect(a.page.getByLabel('E-mail')).toBeVisible({ timeout: 30_000 });
  await expect(tela).toBeHidden();

  await a.context.close();
});
