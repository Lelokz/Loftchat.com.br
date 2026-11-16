import { expect, test } from '@playwright/test';

import {
  createGroupThroughUi,
  limparTudo,
  newAccount,
  sendMessageThroughUi,
  signUpFromInviteUi,
  signUpThroughUi,
} from './helpers';
import type { TestAccount } from './helpers';

/**
 * Proposta A, etapa 1b — o painel da direita do grupo com abas Agora,
 * Membros e Fixadas.
 */

const accounts: TestAccount[] = [];

test.afterAll(async () => {
  await limparTudo(accounts, 'painel — limpeza');
});

test('o painel do grupo: Agora mostra quem está na voz e leva para a sala; Fixadas mostra o bilhete', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const dono = newAccount('Dono painel');
  const amigo = newAccount('Amigo painel');
  accounts.push(dono, amigo);

  const paginaDono = await (await browser.newContext()).newPage();
  await paginaDono.goto('/');
  await signUpThroughUi(paginaDono, dono);
  await createGroupThroughUi(paginaDono, 'Grupo painel');
  await paginaDono.getByRole('button', { name: 'Opções do grupo' }).click();
  await paginaDono.getByRole('menuitem', { name: 'Convidar pessoas' }).click();
  const link = paginaDono.locator('.modal__link');
  await expect(link).toBeVisible({ timeout: 30_000 });
  const convite = new URL(await link.inputValue()).pathname;
  await paginaDono.getByRole('button', { name: 'Fechar' }).first().click();

  const paginaAmigo = await (await browser.newContext()).newPage();
  await paginaAmigo.goto(convite);
  await signUpFromInviteUi(paginaAmigo, amigo);
  await paginaAmigo.getByRole('button', { name: 'Entrar no grupo' }).click({ timeout: 30_000 });
  await expect(paginaAmigo.locator('.channels__group-name')).toHaveText('Grupo painel', {
    timeout: 30_000,
  });

  // Começa em Membros, como a coluna era antes.
  const painel = paginaAmigo.locator('.group-panel');
  await expect(painel.getByRole('tab', { name: 'Membros' })).toHaveAttribute('aria-selected', 'true');
  await expect(painel.locator('.member')).toHaveCount(2, { timeout: 30_000 });

  // Ninguém na voz: a aba Agora diz isso.
  await painel.getByRole('tab', { name: 'Agora' }).click();
  await expect(painel.getByText('Ninguém em chamada agora.', { exact: false })).toBeVisible();

  // O dono entra na voz: aparece no Agora do amigo, em tempo real.
  await paginaDono.locator('.channels__body').getByRole('button', { name: 'Sala Principal' }).click();
  const sala = painel.locator('.group-panel__room', { hasText: 'Sala Principal' });
  await expect(sala).toBeVisible({ timeout: 30_000 });
  await expect(sala.locator('.group-panel__person-name')).toHaveText([dono.displayName]);

  // Entrar pelo painel leva o amigo para a sala; dentro dela, o botão some.
  await sala.getByRole('button', { name: 'Entrar na sala' }).click();
  await expect(paginaAmigo.locator('.room')).toBeVisible({ timeout: 30_000 });
  // Dentro da sala o painel vira o chat da sala (etapa 8b)…
  await expect(paginaAmigo.locator('.room-panel .group-panel__tab.is-active')).toHaveText('Chat da sala');
  // …e de volta ao #geral (ainda conectado) é o painel do grupo: os dois na sala, sem "Entrar".
  await paginaAmigo.locator('.channels__body').getByRole('button', { name: 'geral' }).click();
  await painel.getByRole('tab', { name: 'Agora' }).click();
  await expect(sala.locator('.group-panel__person')).toHaveCount(2, { timeout: 30_000 });
  await expect(sala.getByRole('button', { name: 'Entrar na sala' })).toHaveCount(0);

  // Fixadas: o dono fixa uma mensagem e ela aparece na aba do amigo.
  await paginaDono.locator('.channels__body').getByRole('button', { name: 'geral' }).click();
  await sendMessageThroughUi(paginaDono, 'coords da base: x 1204, z -380');
  await paginaDono.locator('.message', { hasText: 'coords da base' }).click({ button: 'right' });
  await paginaDono.locator('.context-menu').getByRole('menuitem', { name: 'Fixar mensagem' }).click();
  await painel.getByRole('tab', { name: 'Fixadas' }).click();
  await expect(painel.locator('.pinned-item', { hasText: 'coords da base' })).toBeVisible({
    timeout: 30_000,
  });
});
