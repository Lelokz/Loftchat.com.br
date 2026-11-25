import { expect, test } from '@playwright/test';

import { activeGroupId, createGroupThroughUi, limparTudo, newAccount, resolveTokens, signInThroughUi, signUpThroughUi } from './helpers';
import type { TestAccount } from './helpers';
import { FS, avisar, canaisDoGrupo, comoDono, lerComoDono, ligarCarteiroLocal } from './carteiro-local';

/**
 * SILENCIAR (0.11.0): canal pelo menu (submenu das durações), o canal
 * apagado com o sino e a bolinha cinza, "Silenciado até…" no topo (clicar
 * reativa), o carteiro NÃO avisa o que está silenciado, conversa do privado
 * e grupo pela aba, e a folha do celular ("Silenciar #anúncios").
 */

const contas: TestAccount[] = [];
let desligar: (() => void) | undefined;
test.describe.configure({ mode: 'serial' });
test.skip(process.env['FIRESTORE_EMULATOR_HOST'] === undefined, 'só no emulador');
test.beforeAll(async () => {
  test.setTimeout(90_000);
  desligar = await ligarCarteiroLocal();
});
test.afterAll(async () => {
  desligar?.();
  await limparTudo(contas, 'silenciar — limpeza');
});

const par = (a: string, b: string): string => (a < b ? `${a}_${b}` : `${b}_${a}`);

async function envios(): Promise<Record<string, string>[]> {
  const r = await fetch(`${FS}/testeCarteiro?pageSize=300`, { headers: { authorization: 'Bearer owner' } });
  const docs = ((await r.json()) as { documents?: { fields: Record<string, { stringValue: string }> }[] }).documents ?? [];
  return docs.map((d) => Object.fromEntries(Object.entries(d.fields).map(([k, v]) => [k, v.stringValue])));
}

test('silenciar: canal, aviso no topo, carteiro calado, privado, grupo e celular', async ({ browser }) => {
  test.setTimeout(240_000);
  const ana = newAccount('Ana silencio');
  const beto = newAccount('Beto silencio');
  contas.push(ana, beto);
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto('/');
  await signUpThroughUi(page, ana);
  await resolveTokens(ana);
  await createGroupThroughUi(page, 'Grupo calado');
  await createGroupThroughUi(page, 'Grupo barulhento');
  const grupo = await activeGroupId(page);
  const anuncios = (await canaisDoGrupo(grupo)).find((c) => c.nome === 'anúncios')!;

  const bctx = await browser.newContext();
  const bp = await bctx.newPage();
  await bp.goto('/');
  await signUpThroughUi(bp, beto);
  await resolveTokens(beto);
  await bctx.close();
  await comoDono(`memberships/${grupo}_${beto.uid}`, { groupId: grupo, memberId: beto.uid!, role: 'member' });
  await comoDono(`aparelhos/${ana.uid}`, { lista: { celDaAna: { tipo: 'android', token: 'token-da-ana' } } });

  // Botão direito no #anúncios → Silenciar canal › Por 1 hora.
  const canal = page.locator(`.channel[data-channel-id="${anuncios.id}"]`);
  await canal.click({ button: 'right' });
  await page.getByRole('menuitem', { name: /Silenciar canal/ }).hover();
  await page.screenshot({ path: 'test-results/silenciar/1-menu.png' });
  await page.getByRole('menuitem', { name: 'Por 1 hora' }).click();
  await expect(canal).toHaveClass(/is-silenciado/);
  await expect(canal.locator('.silenciado-sino')).toBeVisible();
  await expect.poll(async () => JSON.stringify(await lerComoDono(`silencios/${ana.uid}`))).toContain(`c_${anuncios.id}`);

  // Beto escreve no #anúncios: a bolinha da Ana é CINZA, e o carteiro não avisa a Ana.
  const id = `msgSil${Date.now()}`;
  const escrita = await fetch(`${FS}/messages/${id}`, {
    method: 'PATCH',
    headers: { authorization: `Bearer ${beto.idToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      fields: {
        groupId: { stringValue: grupo },
        channelId: { stringValue: anuncios.id },
        authorId: { stringValue: beto.uid! },
        kind: { stringValue: 'text' },
        body: { stringValue: 'promoção relâmpago' },
        sentAt: { stringValue: new Date().toISOString() },
      },
    }),
  });
  expect(escrita.ok).toBe(true);
  await comoDono(`channels/${anuncios.id}`, { groupId: grupo, name: 'anúncios', kind: 'text', ultimaEm: new Date().toISOString(), ultimaDe: beto.uid! });
  await expect(canal.locator('.bolinha--silenciada')).toHaveText(/1/, { timeout: 30_000 });
  expect((await avisar(beto.idToken!, { tipo: 'grupo', id })).status).toBe(202);
  await page.waitForTimeout(2500);
  expect((await envios()).filter((e) => e['mensagem'] === id)).toHaveLength(0);

  // Abrindo o canal: "Silenciado até HH:MM" no topo; clicar reativa.
  await canal.click();
  const topo = page.locator('.silenciado-topo');
  await expect(topo).toContainText(/Silenciado até \d\d:\d\d/);
  await page.screenshot({ path: 'test-results/silenciar/2-topo.png' });
  await topo.click();
  await expect(canal).not.toHaveClass(/is-silenciado/);
  await expect(topo).toHaveCount(0);
  // Reativado: o próximo aviso vai.
  const id2 = `msgSil2${Date.now()}`;
  await comoDono(`messages/${id2}`, { groupId: grupo, channelId: anuncios.id, authorId: beto.uid!, kind: 'text', body: 'de novo', sentAt: new Date().toISOString() });
  expect((await avisar(beto.idToken!, { tipo: 'grupo', id: id2 })).status).toBe(202);
  await expect.poll(async () => (await envios()).filter((e) => e['mensagem'] === id2).length, { timeout: 15_000 }).toBe(1);

  // Grupo inteiro pela aba: "Silenciar grupo" › Até eu reativar.
  const aba = page.locator(`.group-bar__button[data-group-id="${grupo}"]`);
  await aba.click({ button: 'right' });
  await page.getByRole('menuitem', { name: /Silenciar grupo/ }).click();
  await page.getByRole('menuitem', { name: 'Até eu reativar' }).click();
  await expect(aba).toHaveClass(/is-silenciado/);
  await expect(page.locator('.silenciado-topo')).toContainText('Silenciado até você reativar');

  // Privado: botão direito na conversa → Silenciar conversa › Por 8 horas.
  const fio = par(ana.uid!, beto.uid!);
  const membros = { arrayValue: { values: fio.split('_').map((u) => ({ stringValue: u })) } };
  const agora = new Date().toISOString();
  for (const [col, extra] of [
    ['friendships', { from: { stringValue: ana.uid! }, to: { stringValue: beto.uid! }, status: { stringValue: 'accepted' }, createdAt: { stringValue: agora } }],
    ['dmThreads', { lastMessageAt: { stringValue: agora }, lastMessage: { mapValue: { fields: { body: { stringValue: 'oi' }, authorId: { stringValue: beto.uid! }, sentAt: { stringValue: agora } } } } }],
  ] as const) {
    const r = await fetch(`${FS}/${col}/${fio}`, { method: 'PATCH', headers: { authorization: 'Bearer owner', 'content-type': 'application/json' }, body: JSON.stringify({ fields: { members: membros, ...extra } }) });
    expect(r.ok).toBe(true);
  }
  await page.getByRole('button', { name: /^Privado/ }).first().click();
  const linha = page.locator(`.home-column__dm[data-friend-uid="${beto.uid}"]`);
  await expect(linha).toBeVisible({ timeout: 30_000 });
  await linha.click({ button: 'right' });
  await expect(page.locator('.context-menu__titulo')).toHaveText(beto.displayName);
  await page.getByRole('menuitem', { name: /Silenciar conversa/ }).click();
  await page.getByRole('menuitem', { name: 'Por 8 horas' }).click();
  await expect(linha).toHaveClass(/is-silenciado/);
  await page.screenshot({ path: 'test-results/silenciar/3-privado.png' });

  // Celular: toque longo no canal → Silenciar canal → folha "Silenciar #anúncios".
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(`.group-bar__button[data-group-id="${grupo}"]`).click();
  await page.getByRole('button', { name: /Abrir canais/ }).click();
  const canalCel = page.locator(`.channel[data-channel-id="${anuncios.id}"]`);
  await expect(canalCel).toBeVisible();
  await page.waitForTimeout(600);
  // O "toque longo" do app: pointerdown de toque e segurar (sem soltar).
  await canalCel.evaluate((alvo) => {
    const r = alvo.getBoundingClientRect();
    alvo.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch', bubbles: true, clientX: r.left + 30, clientY: r.top + 10 }));
  });
  await expect(page.getByRole('menuitem', { name: /Silenciar canal/ })).toBeVisible({ timeout: 3_000 });
  await page.evaluate(() => document.dispatchEvent(new PointerEvent('pointerup', { pointerType: 'touch', bubbles: true })));
  await page.getByRole('menuitem', { name: /Silenciar canal/ }).click();
  const folha = page.locator('.context-menu--folha');
  await expect(folha.locator('.context-menu__titulo')).toHaveText('Silenciar #anúncios');
  await page.screenshot({ path: 'test-results/silenciar/4-celular.png' });
  await page.waitForTimeout(400);
  await folha.getByRole('menuitem', { name: 'Por 15 minutos' }).click();
  // A gaveta de canais continua aberta (tocar no menu não é "tocar fora").
  await expect(canalCel).toHaveClass(/is-silenciado/);
  await expect(canalCel).toBeVisible();
  await ctx.close();
});
