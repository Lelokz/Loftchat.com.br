import { expect, test } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';

import {
  createAccountViaRest,
  fillSignUpForm,
  limparTudo,
  markEmailVerified,
  newAccount,
  putDocViaRest,
  readDocViaRest,
  resolveTokens,
  signInThroughUi,
  signUpThroughUi,
  usernameFor,
} from './helpers';
import type { TestAccount } from './helpers';

/**
 * Cadastro novo (15/11/2026): nome de exibição e `@` JUNTOS no cadastro.
 *
 * O defeito que motivou: o `@` vinha numa tela separada depois do cadastro e
 * nunca mais aparecia em lugar nenhum. Quem esquecia o que tinha digitado não
 * tinha como saber o nome que os amigos precisavam para adicioná-lo.
 */

const accounts: TestAccount[] = [];

function track(label: string): TestAccount {
  const account = newAccount(label);
  accounts.push(account);
  return account;
}

test.afterAll(async () => {
  await limparTudo(accounts, 'cadastro — limpeza');
});

async function paginaNova(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await context.newPage();
  await page.goto('/');
  return page;
}

test('o cadastro avisa enquanto digita se o @ está livre, e @ ocupado não vira conta', async ({
  browser,
}) => {
  const dona = track('Dona do nome');
  const dono = await paginaNova(browser);
  await signUpThroughUi(dono, dona);

  const outra = track('Outra');
  const page = await paginaNova(browser);
  await page.getByRole('button', { name: 'Criar conta' }).click();
  const campo = page.getByLabel('Nome de usuário');
  const aviso = page.locator('#auth-username-status');

  await campo.fill('ab');
  await expect(aviso).toHaveAttribute('data-tom', 'erro');

  await campo.fill(usernameFor(outra));
  await expect(aviso).toHaveText(`@${usernameFor(outra)} está livre.`);

  await campo.fill(usernameFor(dona));
  await expect(aviso).toHaveText(`@${usernameFor(dona)} já é de alguém. Escolha outro.`);

  // Mesmo enviando assim, a conta NÃO é criada.
  await page.getByLabel('Nome de exibição').fill(outra.displayName);
  await page.getByLabel('E-mail').fill(outra.email);
  await page.getByLabel('Senha', { exact: true }).fill(outra.password);
  await page.getByLabel('Repetir senha').fill(outra.password);
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page.locator('.auth__error')).toHaveText(
    `@${usernameFor(dona)} já é de alguém. Escolha outro.`,
  );
  await expect(page.getByText('Confirme seu e-mail')).toHaveCount(0);
  await resolveTokens(outra);
  expect(outra.uid, 'a conta não pode ter sido criada').toBeUndefined();
});

test('senhas diferentes são recusadas antes de criar a conta', async ({ browser }) => {
  const conta = track('Senhas');
  const page = await paginaNova(browser);
  await expect(page.getByRole('button', { name: 'Esqueci minha senha' })).toBeVisible();
  await page.getByRole('button', { name: 'Criar conta' }).click();
  // "Esqueci minha senha" não existe no cadastro: a conta nem existe ainda.
  await expect(page.getByRole('button', { name: 'Esqueci minha senha' })).toBeHidden();
  await page.getByLabel('Nome de exibição').fill(conta.displayName);
  await page.getByLabel('Nome de usuário').fill(usernameFor(conta));
  await page.getByLabel('E-mail').fill(conta.email);
  await page.getByLabel('Senha', { exact: true }).fill(conta.password);
  await page.getByLabel('Repetir senha').fill(`${conta.password}x`);
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page.locator('.auth__error')).toHaveText('As duas senhas não são iguais.');
  await expect(page.getByText('Confirme seu e-mail')).toHaveCount(0);
});

test('o @ do cadastro é reservado sozinho e fica no cartão, com nome grande e @ embaixo; um clique copia', async ({
  browser,
}) => {
  const conta = track('Cartão');
  const page = await paginaNova(browser);
  await signUpThroughUi(page, conta);

  const cartao = page.locator('.session-footer__identity').first();
  await expect(cartao.locator('.session-footer__name')).toHaveText(conta.displayName);
  await expect(cartao.locator('.session-footer__handle')).toHaveText(`@${usernameFor(conta)}`);

  await cartao.click();
  await expect(page.locator('.toast')).toContainText(`@${usernameFor(conta)} copiado`);
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`@${usernameFor(conta)}`);

  // No banco: `@` reservado de verdade, e o "pendente" do cadastro limpo.
  await resolveTokens(conta);
  const perfil = await readDocViaRest(conta, `users/${conta.uid}`);
  expect(perfil.fields?.['username']?.stringValue).toBe(usernameFor(conta));
  expect(perfil.fields?.['pendingUsername']).toBeUndefined();
  const reserva = await readDocViaRest(conta, `usernames/${usernameFor(conta)}`);
  expect(reserva.fields?.['uid']?.stringValue).toBe(conta.uid);

  // Entrar de novo (outro aparelho) mantém tudo: o login não reescreve o perfil.
  const outra = await paginaNova(browser);
  await signInThroughUi(outra, conta);
  await expect(outra.locator('.session-footer__handle').first()).toHaveText(`@${usernameFor(conta)}`);
  const depois = await readDocViaRest(conta, `users/${conta.uid}`);
  expect(depois.fields?.['username']?.stringValue).toBe(usernameFor(conta));
});

test('se alguém pegar o @ antes da confirmação do e-mail, a tela explica e pede outro', async ({
  browser,
}) => {
  const conta = track('Atrasada');
  const page = await paginaNova(browser);
  await fillSignUpForm(page, conta);
  await expect(page.getByText('Confirme seu e-mail')).toBeVisible({ timeout: 30_000 });

  // Outra pessoa reserva o mesmo `@` enquanto a primeira não confirmou.
  const ladra = track('Ladra');
  await createAccountViaRest(ladra);
  expect(
    await putDocViaRest(ladra, `usernames/${usernameFor(conta)}`, { uid: ladra.uid! }),
  ).toBe(200);

  await markEmailVerified(conta);
  await expect(page.getByRole('heading', { name: 'Seu nome de usuário' })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.locator('.username__error')).toHaveText(
    `Alguém pegou @${usernameFor(conta)} enquanto você confirmava o e-mail. Escolha outro.`,
  );
  await expect(page.locator('.username__input')).toHaveValue(usernameFor(conta));

  const outroNome = `${usernameFor(conta).slice(0, 17)}_2`;
  await page.locator('.username__input').fill(outroNome);
  await page.locator('.username__submit').click();
  await expect(page.getByRole('button', { name: 'Criar meu primeiro grupo' })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.locator('.session-footer__handle').first()).toHaveText(`@${outroNome}`);
});
