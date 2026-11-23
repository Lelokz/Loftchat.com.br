import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import {
  activeGroupId,
  createGroupThroughUi,
  limparTudo,
  newAccount,
  resolveTokens,
  sendMessageThroughUi,
  signInThroughUi,
  signUpThroughUi,
} from './helpers';
import type { TestAccount } from './helpers';
import { canaisDoGrupo, comoDono, FS } from './carteiro-local';

/**
 * NÃO LIDAS (0.4.5): bolinha com número nas abas, nos canais e no privado.
 * Some ao abrir a conversa, vale na conta (outro aparelho também vê lido),
 * para em "9+", e mensagem minha nunca conta.
 */

const accounts: TestAccount[] = [];
test.skip(process.env['FIRESTORE_EMULATOR_HOST'] === undefined, 'só no emulador');
test.afterAll(async () => {
  await limparTudo(accounts, 'não lidas — limpeza');
});

const s = (v: string) => ({ stringValue: v });

async function rest(conta: TestAccount, metodo: string, caminho: string, fields: Record<string, unknown>, mascara?: string[]): Promise<number> {
  const qs = mascara === undefined ? '' : `?${mascara.map((m) => `updateMask.fieldPaths=${m}`).join('&')}`;
  const r = await fetch(`${FS}/${caminho}${qs}`, {
    method: metodo,
    headers: { authorization: `Bearer ${conta.idToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
  return r.status;
}

function bolinhaDoCanal(page: Page, nome: string) {
  return page.locator('.channel', { hasText: nome }).locator('.bolinha');
}

test('não lidas: canal, aba do grupo, privado, 9+ e sumir ao abrir', async ({ browser }) => {
  test.setTimeout(240_000);
  const beto = newAccount('Beto lidas');
  const ana = newAccount('Ana lidas');
  accounts.push(beto, ana);

  const cBeto = await browser.newContext();
  const pBeto = await cBeto.newPage();
  await pBeto.goto('/');
  await signUpThroughUi(pBeto, beto);
  await createGroupThroughUi(pBeto, 'Turma lidas');
  const grupo = await activeGroupId(pBeto);
  await createGroupThroughUi(pBeto, 'Outro grupo');
  await resolveTokens(beto);
  const canais = await canaisDoGrupo(grupo);
  const anuncios = canais.find((c) => c.nome === 'anúncios')!;

  const cAna = await browser.newContext();
  const pAna = await cAna.newPage();
  await pAna.goto('/');
  await signUpThroughUi(pAna, ana);
  await resolveTokens(ana);
  await comoDono(`memberships/${grupo}_${ana.uid}`, { groupId: grupo, memberId: ana.uid!, role: 'member' });

  // Beto volta para a Turma, no #geral.
  await pBeto.locator(`.group-bar__button[data-group-id="${grupo}"]`).click();
  await expect(pBeto.locator('.channels__group-name')).toHaveText('Turma lidas');

  // Ana manda 2 no #anúncios pela tela.
  await pAna.reload();
  await pAna.locator(`.group-bar__button[data-group-id="${grupo}"]`).click();
  await pAna.locator('.channel', { hasText: 'anúncios' }).click();
  await sendMessageThroughUi(pAna, 'reunião amanhã');
  await sendMessageThroughUi(pAna, 'às 19h');

  // Beto (no #geral) vê 2 no #anúncios. A aba do grupo aberto não ganha bolinha.
  await expect(bolinhaDoCanal(pBeto, 'anúncios')).toHaveText(/^2/, { timeout: 20_000 });
  await expect(pBeto.locator('.channel', { hasText: 'anúncios' })).toHaveClass(/tem-nao-lidas/);
  await expect(pBeto.locator(`.group-bar__button[data-group-id="${grupo}"] .bolinha`)).toHaveCount(0);

  // Indo para outro grupo: a bolinha vai para a aba da Turma.
  await pBeto.locator('.group-bar__button', { hasText: 'Outro grupo' }).click();
  await expect(pBeto.locator(`.group-bar__button[data-group-id="${grupo}"] .bolinha`)).toHaveText(/^2/, {
    timeout: 20_000,
  });
  await pBeto.screenshot({ path: 'test-results/nao-lidas/aba.png' });

  // Volta e abre o #anúncios: some tudo.
  await pBeto.locator(`.group-bar__button[data-group-id="${grupo}"]`).click();
  await pBeto.locator('.channel', { hasText: 'anúncios' }).click();
  await expect(bolinhaDoCanal(pBeto, 'anúncios')).toHaveCount(0, { timeout: 20_000 });

  // Ficou lido NA CONTA: um outro aparelho do Beto já abre sem bolinha.
  const cBeto2 = await browser.newContext();
  const pBeto2 = await cBeto2.newPage();
  await pBeto2.goto('/');
  await signInThroughUi(pBeto2, beto);
  await pBeto2.locator(`.group-bar__button[data-group-id="${grupo}"]`).click();
  await expect(pBeto2.locator('.channel', { hasText: 'anúncios' })).toBeVisible({ timeout: 30_000 });
  await pBeto2.waitForTimeout(2000);
  await expect(bolinhaDoCanal(pBeto2, 'anúncios')).toHaveCount(0);
  await cBeto2.close();

  // Beto no #geral de novo; chegam 12 no #anúncios → "9+".
  await pBeto.locator('.channel', { hasText: 'geral' }).click();
  const base = Date.now();
  for (let i = 0; i < 12; i += 1) {
    const quando = new Date(base + i).toISOString();
    expect(
      await rest(ana, 'POST', 'messages', {
        groupId: s(grupo),
        channelId: s(anuncios.id),
        authorId: s(ana.uid!),
        kind: s('text'),
        body: s(`msg ${i}`),
        sentAt: s(quando),
      }),
    ).toBe(200);
  }
  // A Ana anota o canal (é o que o app dela faz), pela regra nova.
  expect(
    await rest(ana, 'PATCH', `channels/${anuncios.id}`, { ultimaEm: s(new Date(base + 11).toISOString()), ultimaDe: s(ana.uid!) }, [
      'ultimaEm',
      'ultimaDe',
    ]),
  ).toBe(200);
  await expect(bolinhaDoCanal(pBeto, 'anúncios')).toHaveText(/^9\+/, { timeout: 20_000 });

  // Mensagem MINHA não conta: o Beto abre, responde e sai.
  await pBeto.locator('.channel', { hasText: 'anúncios' }).click();
  await sendMessageThroughUi(pBeto, 'beleza');
  await pBeto.locator('.channel', { hasText: 'geral' }).click();
  await pBeto.waitForTimeout(2000);
  await expect(bolinhaDoCanal(pBeto, 'anúncios')).toHaveCount(0);

  // PRIVADO: amizade e uma mensagem da Ana para o Beto.
  const [a, b] = [ana.uid!, beto.uid!].sort();
  const par = `${a}_${b}`;
  const agora = new Date().toISOString();
  const membros = { arrayValue: { values: [s(a!), s(b!)] } };
  await fetch(`${FS}/friendships/${par}`, {
    method: 'PATCH',
    headers: { authorization: 'Bearer owner', 'content-type': 'application/json' },
    body: JSON.stringify({ fields: { members: membros, from: s(ana.uid!), to: s(beto.uid!), status: s('accepted'), createdAt: s(agora) } }),
  });
  await fetch(`${FS}/dmMessages/pv${base}`, {
    method: 'PATCH',
    headers: { authorization: 'Bearer owner', 'content-type': 'application/json' },
    body: JSON.stringify({ fields: { threadId: s(par), authorId: s(ana.uid!), kind: s('text'), body: s('oi Beto'), sentAt: s(agora) } }),
  });
  await fetch(`${FS}/dmThreads/${par}`, {
    method: 'PATCH',
    headers: { authorization: 'Bearer owner', 'content-type': 'application/json' },
    body: JSON.stringify({
      fields: {
        members: membros,
        lastMessage: { mapValue: { fields: { body: s('oi Beto'), authorId: s(ana.uid!), sentAt: s(agora) } } },
        lastMessageAt: s(agora),
      },
    }),
  });
  await expect(pBeto.locator('.group-bar__tab--home .bolinha')).toHaveText(/^1/, { timeout: 20_000 });
  await pBeto.locator('.group-bar__tab--home').click();
  const linha = pBeto.locator('.home-column__dm', { hasText: 'oi Beto' });
  await expect(linha.locator('.bolinha')).toHaveText(/^1/, { timeout: 20_000 });
  await expect(pBeto.locator('.group-bar__tab--home .bolinha')).toHaveCount(0);
  await pBeto.screenshot({ path: 'test-results/nao-lidas/privado.png' });
  await linha.click();
  await expect(linha.locator('.bolinha')).toHaveCount(0, { timeout: 20_000 });

  await cAna.close();
  await cBeto.close();
});

test('regras: só membro anota o canal (só a hora e o autor, para a frente); lidas é só da pessoa', async () => {
  const [beto, ana] = accounts;
  const intruso = newAccount('Intruso lidas');
  accounts.push(intruso);
  const { createAccountViaRest } = await import('./helpers');
  await createAccountViaRest(intruso);

  const r = await fetch(`${FS}:runQuery`, {
    method: 'POST',
    headers: { authorization: 'Bearer owner', 'content-type': 'application/json' },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'memberships' }],
        where: { fieldFilter: { field: { fieldPath: 'memberId' }, op: 'EQUAL', value: s(ana!.uid!) } },
      },
    }),
  });
  const grupo = ((await r.json()) as { document?: { fields: { groupId: { stringValue: string } } } }[]).find(
    (l) => l.document !== undefined,
  )!.document!.fields.groupId.stringValue;
  const canal = (await canaisDoGrupo(grupo)).find((c) => c.nome === 'geral')!.id;
  const futuro = (min: number) => new Date(Date.now() + min * 60_000).toISOString();

  // Fora do grupo: não.
  expect(await rest(intruso, 'PATCH', `channels/${canal}`, { ultimaEm: s(futuro(1)), ultimaDe: s(intruso.uid!) }, ['ultimaEm', 'ultimaDe'])).toBe(403);
  // Membro com o uid de outra pessoa: não.
  expect(await rest(ana!, 'PATCH', `channels/${canal}`, { ultimaEm: s(futuro(1)), ultimaDe: s(beto!.uid!) }, ['ultimaEm', 'ultimaDe'])).toBe(403);
  // Membro mexendo no nome junto: não.
  expect(
    await rest(ana!, 'PATCH', `channels/${canal}`, { ultimaEm: s(futuro(1)), ultimaDe: s(ana!.uid!), name: s('hackeado') }, [
      'ultimaEm',
      'ultimaDe',
      'name',
    ]),
  ).toBe(403);
  // Certo: sim. E voltar no tempo depois: não.
  expect(await rest(ana!, 'PATCH', `channels/${canal}`, { ultimaEm: s(futuro(5)), ultimaDe: s(ana!.uid!) }, ['ultimaEm', 'ultimaDe'])).toBe(200);
  expect(await rest(ana!, 'PATCH', `channels/${canal}`, { ultimaEm: s(futuro(2)), ultimaDe: s(ana!.uid!) }, ['ultimaEm', 'ultimaDe'])).toBe(403);

  // lidas/{uid}: só a pessoa lê.
  const lerLidas = (conta: TestAccount, de: TestAccount) =>
    fetch(`${FS}/lidas/${de.uid}`, { headers: { authorization: `Bearer ${conta.idToken}` } }).then((x) => x.status);
  expect(await lerLidas(beto!, beto!)).toBe(200);
  expect(await lerLidas(ana!, beto!)).toBe(403);
  expect(await rest(ana!, 'PATCH', `lidas/${beto!.uid}`, { desde: s(futuro(0)) })).toBe(403);
});
