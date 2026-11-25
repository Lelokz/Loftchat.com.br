import { expect, test } from '@playwright/test';

import {
  activeGroupId,
  createAccountViaRest,
  createGroupThroughUi,
  joinGroupViaRest,
  limparTudo,
  newAccount,
  patchDocRawViaRest,
  resolveTokens,
  signUpThroughUi,
  writeMessageAt,
} from './helpers';
import type { TestAccount } from './helpers';

/**
 * Proposta A, etapa 8b — o chat da sala: com a sala de voz na tela, o painel
 * da direita vira "Chat da sala / Membros / Fixadas". As mensagens são do
 * canal de voz (não vazam para o #geral), dá para responder e fixar, e o chat
 * da sala liga/desliga em Configurações → Aparência.
 */

const accounts: TestAccount[] = [];

test.afterAll(async () => {
  await limparTudo(accounts, 'chat da sala — limpeza');
});

test('chat da sala: abas, mandar, receber, responder, fixar, não vaza para o #geral, liga/desliga', async ({ browser }) => {
  test.setTimeout(180_000);
  const eu = newAccount('ChatSala');
  accounts.push(eu);
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await page.goto('/');
  await signUpThroughUi(page, eu);
  await resolveTokens(eu);
  await createGroupThroughUi(page, 'Sala');
  const groupId = await activeGroupId(page);

  await page.getByRole('button', { name: 'Opções do grupo' }).click();
  await page.getByRole('menuitem', { name: 'Convidar pessoas' }).click();
  const link = page.locator('.modal__link');
  await expect(link).toBeVisible({ timeout: 30_000 });
  const codigo = new URL(await link.inputValue()).pathname.split('/').pop() ?? '';
  await page.getByRole('button', { name: 'Fechar' }).first().click();

  const painel = page.locator('.app > .members');
  const abas = () => painel.locator('.group-panel__tab').allTextContents();

  // Entrar na sala: o painel abre no chat da sala, vazio.
  await page.getByRole('button', { name: 'Sala Principal' }).click();
  await expect(page.locator('.room__title')).toHaveText('Sala Principal');
  await expect.poll(abas, { timeout: 30_000 }).toEqual(['Chat da sala', 'Membros', 'Fixadas']);
  await expect(painel.locator('.group-panel__tab.is-active')).toHaveText('Chat da sala');
  await expect(painel.locator('.empty__title')).toHaveText('Nenhuma mensagem ainda', { timeout: 30_000 });

  // Mandar pela caixa do painel.
  const caixa = painel.locator('.composer__input');
  await expect(caixa).toHaveAttribute('placeholder', 'Mensagem na sala');
  await caixa.fill('link da partida: loft.gg/x');
  await caixa.press('Enter');
  await expect(painel.locator('.message__text')).toHaveText(['link da partida: loft.gg/x'], { timeout: 30_000 });

  // A Ana escreve na sala (sem estar no PC): chega no painel.
  const ana = newAccount('Ana');
  accounts.push(ana);
  await createAccountViaRest(ana);
  await patchDocRawViaRest(ana, `users/${ana.uid}`, { displayName: { stringValue: 'Ana Souza' } });
  expect(await joinGroupViaRest(ana, groupId, codigo)).toBe(200);
  const canal = await page.locator('.channel', { hasText: 'Sala Principal' }).first().getAttribute('data-channel-id');
  expect(
    await writeMessageAt(ana, { groupId, channelId: canal!, body: 'entrei, tô ouvindo', sentAt: new Date().toISOString() }),
  ).toBe(200);
  await expect(painel.locator('.message__text')).toHaveText(['link da partida: loft.gg/x', 'entrei, tô ouvindo'], {
    timeout: 30_000,
  });

  // Digitar e trocar de aba não apaga o rascunho.
  await caixa.fill('rascunho');
  await painel.getByRole('tab', { name: 'Membros' }).click();
  await expect(painel.locator('.members__section')).toContainText('membros — 2');
  await painel.getByRole('tab', { name: 'Chat da sala' }).click();
  await expect(caixa).toHaveValue('rascunho');
  await caixa.fill('');

  // Responder à Ana pelo menu da mensagem: a faixa aparece no painel.
  await painel.locator('.message', { hasText: 'entrei, tô ouvindo' }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Responder' }).click();
  await expect(painel.locator('.chat__reply-slot')).toContainText('Ana Souza');
  await expect(caixa).toBeFocused();
  await caixa.fill('beleza!');
  await caixa.press('Enter');
  await expect(painel.locator('.message', { hasText: 'beleza!' }).locator('.quote')).toContainText(
    'entrei, tô ouvindo',
    { timeout: 30_000 },
  );
  await expect(painel.locator('.chat__reply-slot')).toBeEmpty();

  // Fixar (sou o dono) → aparece em Fixadas; "Ir para a mensagem" volta ao chat.
  await painel.locator('.message', { hasText: 'link da partida' }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Fixar mensagem' }).click();
  await painel.getByRole('tab', { name: 'Fixadas' }).click();
  await expect(painel.locator('.pinned-item')).toHaveCount(1, { timeout: 30_000 });
  await expect(painel.locator('.pinned-item')).toContainText('link da partida');

  // Não vazou para o #geral: voltar ao canal de texto mostra o painel do grupo.
  await page.locator('.channel', { hasText: 'geral' }).first().click();
  await expect(page.locator('main.chat')).toBeVisible();
  await expect.poll(abas).toEqual(['Agora', 'Membros', 'Mídia', 'Fixadas']);
  await expect(page.locator('main.chat .empty__title')).toHaveText('Nenhuma mensagem ainda', { timeout: 30_000 });

  // Desligar o chat da sala em Configurações → Aparência.
  await page.getByRole('button', { name: 'Configurações', exact: true }).click();
  const tela = page.getByRole('dialog', { name: 'Configurações' });
  await tela.getByRole('button', { name: 'Aparência' }).click();
  await tela.getByRole('radiogroup', { name: 'Chat da sala de voz' }).getByRole('radio', { name: 'Desligado' }).click();
  await tela.getByRole('region', { name: 'Alterações não salvas' }).getByRole('button', { name: 'Salvar' }).click();
  await expect(tela.getByRole('region', { name: 'Alterações não salvas' })).toBeHidden();
  await page.keyboard.press('Escape');

  // De volta à sala (pelo canal; ainda estou conectado): painel do grupo de sempre, sem chat.
  await page.locator('.channel', { hasText: 'Sala Principal' }).first().click();
  await expect(page.locator('.room__title')).toHaveText('Sala Principal');
  await expect.poll(abas).toEqual(['Agora', 'Membros', 'Mídia', 'Fixadas']);
  await expect(painel.locator('.composer__input')).toHaveCount(0);

  // Religar: o chat volta com as mensagens.
  await page.getByRole('button', { name: 'Configurações', exact: true }).click();
  await tela.getByRole('button', { name: 'Aparência' }).click();
  await tela.getByRole('radiogroup', { name: 'Chat da sala de voz' }).getByRole('radio', { name: 'Ligado', exact: true }).click();
  await tela.getByRole('region', { name: 'Alterações não salvas' }).getByRole('button', { name: 'Salvar' }).click();
  await expect(tela.getByRole('region', { name: 'Alterações não salvas' })).toBeHidden();
  await page.keyboard.press('Escape');
  await expect.poll(abas).toEqual(['Chat da sala', 'Membros', 'Fixadas']);
  await expect(painel.locator('.message__text')).toHaveCount(3, { timeout: 30_000 });
  await page.context().close();
});
