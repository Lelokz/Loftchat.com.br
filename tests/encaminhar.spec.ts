import { expect, test } from '@playwright/test';

import { activeGroupId, createGroupThroughUi, limparTudo, newAccount, resolveTokens, sendMessageThroughUi, signUpThroughUi } from './helpers';
import type { TestAccount } from './helpers';
import { FS } from './carteiro-local';

/**
 * ENCAMINHAR (0.11.0): pela barrinha do PC, escolher um PV e um canal de
 * outro grupo, com mensagem junto; chega marcada "Encaminhada" nos dois.
 */

const contas: TestAccount[] = [];
test.afterAll(async () => {
  await limparTudo(contas, 'encaminhar — limpeza');
});

const par = (a: string, b: string): string => (a < b ? `${a}_${b}` : `${b}_${a}`);

test('encaminhar: para um amigo e para um canal de outro grupo, com mensagem junto', async ({ browser }) => {
  test.setTimeout(180_000);
  const ana = newAccount('Ana encaminha');
  const beto = newAccount('Beto encaminha');
  contas.push(ana, beto);

  const ctxB = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const pb = await ctxB.newPage();
  await pb.goto('/');
  await signUpThroughUi(pb, beto);
  await resolveTokens(beto);

  const ctxA = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const pa = await ctxA.newPage();
  await pa.goto('/');
  await signUpThroughUi(pa, ana);
  await resolveTokens(ana);
  await createGroupThroughUi(pa, 'Grupo destino');
  await createGroupThroughUi(pa, 'Grupo origem');
  const origem = await activeGroupId(pa);

  // Ana e Beto amigos, com conversa no privado (aparece em "Conversas recentes").
  const fio = par(ana.uid!, beto.uid!);
  const membros = { arrayValue: { values: [{ stringValue: fio.split('_')[0]! }, { stringValue: fio.split('_')[1]! }] } };
  const agora = new Date().toISOString();
  for (const [col, extra] of [
    ['friendships', { from: { stringValue: ana.uid! }, to: { stringValue: beto.uid! }, status: { stringValue: 'accepted' }, createdAt: { stringValue: agora } }],
    ['dmThreads', { lastMessageAt: { stringValue: agora }, lastMessage: { mapValue: { fields: { body: { stringValue: 'oi' }, authorId: { stringValue: beto.uid! }, sentAt: { stringValue: agora } } } } }],
  ] as const) {
    const r = await fetch(`${FS}/${col}/${fio}`, {
      method: 'PATCH',
      headers: { authorization: 'Bearer owner', 'content-type': 'application/json' },
      body: JSON.stringify({ fields: { members: membros, ...extra } }),
    });
    expect(r.ok).toBe(true);
  }
  await pa.reload();
  await pa.locator(`.group-bar__button[data-group-id="${origem}"]`).click();

  await sendMessageThroughUi(pa, 'o IP do servidor é 10.0.0.7');
  const msg = pa.locator('.message', { hasText: 'o IP do servidor é 10.0.0.7' });
  await expect(msg).toBeVisible({ timeout: 30_000 });

  // Botão direito → Encaminhar.
  await msg.locator('.message__bubble').click({ button: 'right' });
  await pa.locator('.context-menu').getByRole('menuitem', { name: 'Encaminhar' }).click();
  const janela = pa.getByRole('dialog', { name: 'Encaminhar' });
  await expect(janela).toBeVisible();
  await expect(janela).toContainText('o IP do servidor é 10.0.0.7');
  const botao = janela.getByRole('button', { name: 'Encaminhar' });
  await expect(botao).toBeDisabled();

  // Busca filtra; escolhe o Beto e o #geral do OUTRO grupo.
  await janela.getByRole('searchbox', { name: 'Buscar pessoa ou canal' }).fill('beto');
  await janela.getByRole('checkbox', { name: /Beto encaminha/ }).click();
  await janela.getByRole('searchbox', { name: 'Buscar pessoa ou canal' }).fill('destino');
  await janela.getByRole('checkbox', { name: /#geral.*Grupo destino/ }).click();
  await janela.getByRole('searchbox', { name: 'Buscar pessoa ou canal' }).fill('');
  await expect(janela).toContainText('2 escolhidos · até 5');
  await janela.getByRole('textbox', { name: 'Mensagem junto' }).fill('guarda aí');
  await pa.screenshot({ path: 'test-results/encaminhar/1-janela.png' });
  await botao.click();
  await expect(janela).toBeHidden({ timeout: 30_000 });

  // Beto vê no privado: "Encaminhada" + a mensagem, e depois o comentário.
  await pb.reload();
  await pb.getByRole('button', { name: /^Privado/ }).first().click();
  await pb.getByRole('button', { name: 'Amigos', exact: true }).click();
  await pb.locator('.friends__tab[data-tab="amigos"]').click();
  await pb.locator('.friends__row--clickable', { hasText: ana.displayName }).click();
  const recebida = pb.locator('.message', { hasText: 'o IP do servidor é 10.0.0.7' });
  await expect(recebida.locator('.message__encaminhada')).toHaveText('Encaminhada', { timeout: 30_000 });
  await expect(pb.locator('.message', { hasText: 'guarda aí' })).toBeVisible();
  await pb.screenshot({ path: 'test-results/encaminhar/2-recebida.png' });

  // E no #geral do outro grupo.
  const destino = (await pa.locator('.group-bar__button').allTextContents()).length;
  expect(destino).toBeGreaterThan(1);
  await pa.locator('.group-bar__button', { hasText: 'Grupo destino' }).click();
  await pa.getByRole('button', { name: /geral/ }).first().click();
  await expect(pa.locator('.message', { hasText: 'o IP do servidor é 10.0.0.7' }).locator('.message__encaminhada')).toBeVisible({ timeout: 30_000 });
  await ctxA.close();
  await ctxB.close();
});
