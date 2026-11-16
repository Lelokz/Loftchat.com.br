import { expect, test } from '@playwright/test';

import {
  createGroupThroughUi,
  limparTudo,
  newAccount,
  sendMessageThroughUi,
  signUpFromInviteUi,
  signUpThroughUi,
  usernameFor,
} from './helpers';
import type { TestAccount } from './helpers';

/**
 * Proposta A, etapa 2c — clicar no nome ou na foto de alguém abre o cartão
 * dela, com o botão certo para o vínculo (eu, amigo, pedido, ninguém).
 */

const accounts: TestAccount[] = [];

test.afterAll(async () => {
  await limparTudo(accounts, 'cartão — limpeza');
});

test('o cartão abre pelos membros e pelas mensagens, sempre com o perfil mais novo, e leva ao pedido e ao PV', async ({
  browser,
}) => {
  test.setTimeout(150_000);
  const dono = newAccount('Dono cartao');
  const amigo = newAccount('Amigo cartao');
  accounts.push(dono, amigo);

  const pDono = await (await browser.newContext()).newPage();
  await pDono.goto('/');
  await signUpThroughUi(pDono, dono);
  await createGroupThroughUi(pDono, 'Grupo cartão');
  await pDono.getByRole('button', { name: 'Opções do grupo' }).click();
  await pDono.getByRole('menuitem', { name: 'Convidar pessoas' }).click();
  const link = pDono.locator('.modal__link');
  await expect(link).toBeVisible({ timeout: 30_000 });
  const convite = new URL(await link.inputValue()).pathname;
  await pDono.getByRole('button', { name: 'Fechar' }).first().click();

  const pAmigo = await (await browser.newContext()).newPage();
  await pAmigo.goto(convite);
  await signUpFromInviteUi(pAmigo, amigo);
  await pAmigo.getByRole('button', { name: 'Entrar no grupo' }).click({ timeout: 30_000 });
  await expect(pAmigo.locator('.channels__group-name')).toHaveText('Grupo cartão', { timeout: 30_000 });

  // O dono põe uma bio DEPOIS que o amigo já carregou o grupo.
  await pDono.getByRole('button', { name: 'Configurações', exact: true }).click();
  const conf = pDono.getByRole('dialog', { name: 'Configurações' });
  await expect(conf.getByLabel('Bio')).toBeVisible({ timeout: 15_000 });
  await conf.getByLabel('Bio').fill('dono do grupo');
  await conf.getByRole('button', { name: 'Salvar' }).click();
  await expect(conf.getByRole('region', { name: 'Alterações não salvas' })).toBeHidden({ timeout: 15_000 });
  await pDono.keyboard.press('Escape');
  await sendMessageThroughUi(pDono, 'oi do dono');

  // Pela lista de membros: o cartão abre com a bio nova e o @.
  await pAmigo.locator('.member', { hasText: dono.displayName }).click();
  const cartao = pAmigo.getByRole('dialog', { name: `Perfil de ${dono.displayName}` });
  await expect(cartao).toBeVisible();
  await expect(cartao.locator('.person-card__bio')).toHaveText('dono do grupo', { timeout: 15_000 });
  await expect(cartao.locator('.person-card__handle')).toHaveText(`@${usernameFor(dono)}`);

  // Esc fecha.
  await pAmigo.keyboard.press('Escape');
  await expect(cartao).toBeHidden();

  // Pelo nome na mensagem: mesmo cartão; "Adicionar amigo" manda o pedido.
  await pAmigo.locator('.message', { hasText: 'oi do dono' }).locator('.message__author').click();
  await expect(cartao).toBeVisible();
  await cartao.getByRole('button', { name: 'Adicionar amigo' }).click();
  await expect(cartao.getByText('Pedido enviado.')).toBeVisible({ timeout: 15_000 });

  // Clique fora fecha.
  await pAmigo.locator('.chat__header').click();
  await expect(cartao).toBeHidden();

  // No lado do dono: o amigo aparece como pedido pendente; o meu cartão é "Editar perfil".
  await pDono.locator('.member', { hasText: amigo.displayName }).click();
  const cartaoAmigo = pDono.getByRole('dialog', { name: `Perfil de ${amigo.displayName}` });
  await expect(cartaoAmigo.getByText('Pedido de amizade pendente.')).toBeVisible({ timeout: 15_000 });
  await pDono.keyboard.press('Escape');
  await pDono.locator('.member', { hasText: dono.displayName }).click();
  await pDono
    .getByRole('dialog', { name: `Perfil de ${dono.displayName}` })
    .getByRole('button', { name: 'Editar perfil' })
    .click();
  await expect(pDono.getByRole('dialog', { name: 'Configurações' })).toBeVisible();
  await pDono.keyboard.press('Escape');

  // Aceito o pedido, o cartão vira "Enviar mensagem" e leva ao PV.
  await pDono.getByRole('button', { name: 'Privado', exact: true }).click();
  await pDono.getByRole('button', { name: 'Amigos', exact: true }).click();
  await pDono.locator('.friends__tab[data-tab="pendentes"]').click();
  await pDono.getByRole('button', { name: 'Aceitar' }).click();
  await pDono.getByRole('button', { name: 'Grupo cartão' }).click();
  await pDono.locator('.member', { hasText: amigo.displayName }).click();
  await cartaoAmigo.getByRole('button', { name: 'Enviar mensagem' }).click();
  await expect(pDono.locator('.dm-chat__name')).toHaveText(amigo.displayName, { timeout: 15_000 });
});
