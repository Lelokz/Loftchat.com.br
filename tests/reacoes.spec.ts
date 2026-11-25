import { expect, test } from '@playwright/test';

import { activeGroupId, createGroupThroughUi, limparTudo, newAccount, resolveTokens, sendMessageThroughUi, signUpThroughUi } from './helpers';
import type { TestAccount } from './helpers';
import { FS, comoDono } from './carteiro-local';
import { PERMISSOES_DO_TODOS } from '../src/lib/permissoes';

/**
 * REAÇÕES (0.11.0): a barrinha do PC, as pílulas (a minha roxa, clicar
 * tira/põe, quem reagiu), o toque longo do celular (folha com os emojis),
 * e as regras: cada um só mexe na sua, e sem "Reagir" o banco recusa.
 */

const contas: TestAccount[] = [];
test.afterAll(async () => {
  await limparTudo(contas, 'reações — limpeza');
});

test('reações: barrinha, pílulas, celular e regras', async ({ browser }) => {
  test.setTimeout(240_000);
  const ana = newAccount('Ana reação');
  const beto = newAccount('Beto reação');
  contas.push(ana, beto);

  const ctxA = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const pa = await ctxA.newPage();
  await pa.goto('/');
  await signUpThroughUi(pa, ana);
  await resolveTokens(ana);
  await createGroupThroughUi(pa, 'Grupo das reações');
  const grupo = await activeGroupId(pa);

  const ctxB = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const pb = await ctxB.newPage();
  await pb.goto('/');
  await signUpThroughUi(pb, beto);
  await resolveTokens(beto);
  await comoDono(`memberships/${grupo}_${beto.uid}`, { groupId: grupo, memberId: beto.uid!, role: 'member' });

  await sendMessageThroughUi(pa, 'sábado tem churrasco');
  const msgA = pa.locator('.message', { hasText: 'sábado tem churrasco' });
  await expect(msgA).toBeVisible({ timeout: 30_000 });
  const id = (await msgA.getAttribute('data-message-id'))!;

  // PC: passar o mouse mostra a barrinha; 🔥 reage.
  await msgA.locator('.message__bubble').hover();
  const barra = pa.getByRole('toolbar', { name: 'Ações da mensagem' });
  await expect(barra).toBeVisible();
  await pa.screenshot({ path: 'test-results/reacoes/1-barrinha.png' });
  await barra.getByRole('button', { name: 'Reagir com 🔥' }).click();
  const fogoA = msgA.locator('.reacao', { hasText: '🔥' });
  await expect(fogoA).toHaveText('🔥1', { timeout: 30_000 });
  await expect(fogoA).toHaveAttribute('aria-pressed', 'true');

  // Celular (Beto): toque longo → folha com os emojis em cima; 🔥 também.
  await pb.reload();
  await pb.locator(`.group-bar__button[data-group-id="${grupo}"]`).click();
  const msgB = pb.locator('.message', { hasText: 'sábado tem churrasco' });
  await expect(msgB).toBeVisible({ timeout: 30_000 });
  // Toque longo de verdade (segura o dedo). Se a lista ainda estiver rolando, o menu fecha: tenta de novo.
  const cdp = await ctxB.newCDPSession(pb);
  const folha = pb.locator('.context-menu--folha');
  await expect(async () => {
    const caixa = (await msgB.locator('.message__bubble').boundingBox())!;
    const ponto = { x: caixa.x + 20, y: caixa.y + 15 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [ponto] });
    await pb.waitForTimeout(800);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(folha).toBeVisible({ timeout: 1_500 });
  }).toPass({ timeout: 20_000 });
  await expect(folha.locator('.context-menu__emojis button')).toHaveCount(7);
  await pb.screenshot({ path: 'test-results/reacoes/2-celular-folha.png' });
  // Uma pessoa leva um instante entre soltar o dedo e tocar de novo (a folha ignora o "soltar").
  await pb.waitForTimeout(400);
  await folha.getByRole('button', { name: 'Reagir com 🔥' }).click();
  await expect(fogoA).toHaveText('🔥2', { timeout: 30_000 });
  await expect(fogoA).toHaveAttribute('data-dica', /Teste Beto reação e você reagiram com 🔥/);

  // Ana clica na própria pílula: tira a dela.
  await fogoA.click();
  await expect(fogoA).toHaveText('🔥1', { timeout: 30_000 });
  await expect(fogoA).toHaveAttribute('aria-pressed', 'false');
  await pb.screenshot({ path: 'test-results/reacoes/3-celular-pilula.png' });

  // Regras: Ana não mexe na reação do Beto; nem muda outra coisa junto.
  const mexer = (token: string, campos: Record<string, unknown>, mascara: string[]) =>
    fetch(`${FS}/messages/${id}?${mascara.map((m) => `updateMask.fieldPaths=${encodeURIComponent(m)}`).join('&')}`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ fields: campos }),
    });
  const lista = (xs: string[]) => ({ arrayValue: { values: xs.map((x) => ({ stringValue: x })) } });
  expect((await mexer(ana.idToken!, { reacoes: { mapValue: { fields: { [beto.uid!]: lista([]) } } } }, [`reacoes.\`${beto.uid}\``])).status).toBe(403);
  expect((await mexer(ana.idToken!, { reacoes: { mapValue: { fields: { [ana.uid!]: lista(['👍']) } } }, body: { stringValue: 'outro texto' } }, [`reacoes.\`${ana.uid}\``, 'body'])).status).toBe(403);
  expect((await mexer(beto.idToken!, { reacoes: { mapValue: { fields: { [beto.uid!]: lista(['1', '2', '3', '4', '5', '6', '7']) } } } }, [`reacoes.\`${beto.uid}\``])).status).toBe(403);

  // Sem "Reagir" no cargo: o banco recusa a reação do Beto.
  const perms = PERMISSOES_DO_TODOS.filter((p) => p !== 'reagir');
  const tirar = await fetch(`${FS}/memberships/${grupo}_${beto.uid}?updateMask.fieldPaths=perms`, {
    method: 'PATCH',
    headers: { authorization: 'Bearer owner', 'content-type': 'application/json' },
    body: JSON.stringify({ fields: { perms: lista(perms) } }),
  });
  expect(tirar.ok).toBe(true);
  expect((await mexer(beto.idToken!, { reacoes: { mapValue: { fields: { [beto.uid!]: lista(['😂']) } } } }, [`reacoes.\`${beto.uid}\``])).status).toBe(403);

  await ctxA.close();
  await ctxB.close();
});
