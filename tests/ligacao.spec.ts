import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import { createAccountViaRest, limparTudo, newAccount, resolveTokens, signUpThroughUi } from './helpers';
import type { TestAccount } from './helpers';
import { FS } from './carteiro-local';

/**
 * LIGAÇÃO NO PV (0.9.5, etapa 5): ligar com câmera, a outra pessoa recebe o
 * cartão, atende e vê a câmera; desligar deixa "Ligação" no chat; recusar
 * deixa "Chamada perdida"; quem não é amigo não liga nem espia a ligação.
 */

const contas: TestAccount[] = [];
test.afterAll(async () => {
  await limparTudo(contas, 'ligação — limpeza');
});

const par = (a: string, b: string): string => (a < b ? `${a}_${b}` : `${b}_${a}`);

async function abrirPv(page: Page, nome: string): Promise<void> {
  await page.getByRole('button', { name: 'Privado', exact: true }).click();
  await page.getByRole('button', { name: 'Amigos', exact: true }).click();
  await page.locator('.friends__tab[data-tab="amigos"]').click();
  await page.locator('.friends__row--clickable', { hasText: nome }).click();
  await expect(page.locator('.dm-chat__name')).toHaveText(nome, { timeout: 15_000 });
}

async function temImagem(page: Page, seletor: string): Promise<boolean> {
  return page.locator(seletor).evaluate((v) => (v as HTMLVideoElement).videoWidth > 0 && (v as HTMLVideoElement).readyState >= 2);
}

test('ligação no PV: com câmera, atender, desligar (registro), recusar (perdida) e quem é de fora', async ({ browser }) => {
  test.setTimeout(180_000);
  const a = newAccount('Lig A');
  const b = newAccount('Lig B');
  const c = newAccount('Lig C');
  contas.push(a, b, c);

  const ctxA = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const pA = await ctxA.newPage();
  await pA.goto('/');
  await signUpThroughUi(pA, a);
  await resolveTokens(a);
  const ctxB = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const pB = await ctxB.newPage();
  await pB.goto('/');
  await signUpThroughUi(pB, b);
  await resolveTokens(b);
  await createAccountViaRest(c);

  const amizade = await fetch(`${FS}/friendships/${par(a.uid!, b.uid!)}`, {
    method: 'PATCH',
    headers: { authorization: 'Bearer owner', 'content-type': 'application/json' },
    body: JSON.stringify({
      fields: {
        members: { arrayValue: { values: [{ stringValue: a.uid! }, { stringValue: b.uid! }] } },
        from: { stringValue: a.uid! },
        to: { stringValue: b.uid! },
        status: { stringValue: 'accepted' },
        createdAt: { stringValue: new Date().toISOString() },
      },
    }),
  });
  expect(amizade.ok).toBe(true);

  await abrirPv(pA, b.displayName);

  // 1) A liga COM CÂMERA: a sala da ligação aparece com "Chamando B…" e a câmera dele.
  await pA.locator('.chat__header').getByRole('button', { name: 'Ligar com câmera' }).click();
  await expect(pA.locator('.room__chamando')).toHaveText(`Chamando ${b.displayName}…`, { timeout: 30_000 });
  await expect(pA.locator(`.room__person[data-uid="${a.uid}"]`)).toHaveClass(/tem-camera/, { timeout: 30_000 });

  // 2) B recebe o cartão (sem ter aberto nada) e atende.
  const cartao = pB.getByRole('dialog', { name: `${a.displayName} está te ligando` });
  await expect(cartao).toBeVisible({ timeout: 30_000 });
  await expect(cartao).toContainText('com câmera');
  await pB.screenshot({ path: 'test-results/ligacao/1-recebendo.png' });
  await cartao.getByRole('button', { name: 'Atender', exact: true }).click();
  await expect(cartao).toBeHidden();

  // 3) Os dois na ligação; B vê a câmera de A de verdade; o "Chamando" some.
  await expect(pB.locator('.room__person')).toHaveCount(2, { timeout: 30_000 });
  await expect(pA.locator('.room__person')).toHaveCount(2, { timeout: 30_000 });
  await expect(pA.locator('.room__chamando')).toHaveCount(0, { timeout: 30_000 });
  await expect.poll(() => temImagem(pB, `.room__person[data-uid="${a.uid}"] video`), { timeout: 30_000 }).toBe(true);
  await pB.screenshot({ path: 'test-results/ligacao/2-na-ligacao.png' });

  // 4) A desliga: os dois saem, e o chat do PV ganha o registro "Ligação".
  await pA.locator('.room__controls').getByRole('button', { name: 'Sair da chamada' }).click();
  await expect(pA.locator('.room')).toHaveCount(0, { timeout: 30_000 });
  await expect(pB.locator('.room')).toHaveCount(0, { timeout: 30_000 });
  await expect(pA.locator('.message__chamada').last()).toContainText('Ligação', { timeout: 30_000 });
  await expect(pB.locator('.message__chamada').last()).toContainText('Ligação', { timeout: 30_000 });
  await expect(pB.locator('.message__chamada').last()).toContainText('com câmera');
  await pB.screenshot({ path: 'test-results/ligacao/3-registro.png' });

  // 5) A liga de novo (só voz) e B RECUSA: A sai e fica "Chamada perdida".
  // Os avisos (toasts) que aparecerem no A, todos — um novo apaga o anterior.
  await pA.evaluate(() => {
    const w = window as unknown as { avisos: string[] };
    w.avisos = [];
    new MutationObserver((ms) => {
      for (const m of ms) for (const n of m.addedNodes) if (n instanceof HTMLElement && n.classList.contains('toast')) w.avisos.push(n.textContent ?? '');
    }).observe(document.body, { childList: true });
  });
  await pA.locator('.chat__header').getByRole('button', { name: 'Ligar', exact: true }).click();
  const cartao2 = pB.getByRole('dialog', { name: `${a.displayName} está te ligando` });
  await expect(cartao2).toBeVisible({ timeout: 30_000 });
  await cartao2.getByRole('button', { name: 'Recusar' }).click();
  await expect
    .poll(() => pA.evaluate(() => (window as unknown as { avisos: string[] }).avisos), { timeout: 30_000 })
    .toContain(`${b.displayName} recusou a ligação.`);
  await expect(pA.locator('.room')).toHaveCount(0, { timeout: 30_000 });
  await expect(pA.locator('.message__chamada.is-perdida').last()).toContainText('Chamada perdida', { timeout: 30_000 });
  await expect(pB.locator('.message__chamada.is-perdida').last()).toContainText('Chamada perdida', { timeout: 30_000 });

  // 6) Quem é de fora (C, não amigo): não liga para A e não espia a ligação A-B.
  const ligarDeFora = await fetch(`${FS}/chamadas/${par(a.uid!, c.uid!)}`, {
    method: 'PATCH',
    headers: { authorization: `Bearer ${c.idToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      fields: {
        de: { stringValue: c.uid! },
        para: { stringValue: a.uid! },
        comCamera: { booleanValue: false },
        estado: { stringValue: 'tocando' },
        criadaEm: { stringValue: new Date().toISOString() },
      },
    }),
  });
  expect(ligarDeFora.status).toBe(403);
  const grupo = `pv_${par(a.uid!, b.uid!)}`;
  const entrarDeFora = await fetch(`${FS}/voiceParticipants/${grupo}_${c.uid}`, {
    method: 'PATCH',
    headers: { authorization: `Bearer ${c.idToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      fields: {
        groupId: { stringValue: grupo },
        channelId: { stringValue: grupo },
        uid: { stringValue: c.uid! },
        lastSeen: { stringValue: new Date().toISOString() },
      },
    }),
  });
  expect(entrarDeFora.status).toBe(403);
  const espiar = await fetch(`${FS}/chamadas/${par(a.uid!, b.uid!)}`, { headers: { authorization: `Bearer ${c.idToken}` } });
  expect(espiar.status).toBe(403);

  await ctxA.close();
  await ctxB.close();
});
