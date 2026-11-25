import { expect, test } from '@playwright/test';

import {
  activeGroupId,
  createAccountViaRest,
  createGroupThroughUi,
  joinGroupViaRest,
  limparTudo,
  newAccount,
  resolveTokens,
  signInThroughUi,
  signUpThroughUi,
  writeMessageAt,
} from './helpers';
import type { TestAccount } from './helpers';
import { CARTEIRO, canaisDoGrupo, comoDono, doGrupo, ligarCarteiroLocal } from './carteiro-local';

/**
 * CANAIS PRIVADOS E MODERAÇÃO (0.8.5, etapas 3 e 4): canal privado some e
 * fica fechado no banco; castigo trava a caixa; banir impede de voltar;
 * desbanir; apelido; modo lento; registro e banidos nas Configurações.
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
  await limparTudo(contas, 'moderação — limpeza');
});

async function noCarteiro(conta: TestAccount, corpo: Record<string, unknown>): Promise<{ status: number; corpo: Record<string, unknown> }> {
  await resolveTokens(conta);
  const r = await fetch(`${CARTEIRO}/cargos`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${conta.idToken}` },
    body: JSON.stringify(corpo),
  });
  return { status: r.status, corpo: (await r.json()) as Record<string, unknown> };
}

test('canal privado, castigo, banir/desbanir, apelido, modo lento e registro', async ({ browser }) => {
  test.setTimeout(300_000);
  const dono = newAccount('Dono mod');
  const ana = newAccount('Ana mod');
  contas.push(dono, ana);
  await createAccountViaRest(ana);

  const cDono = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const pDono = await cDono.newPage();
  await pDono.goto('/');
  await signUpThroughUi(pDono, dono);
  await resolveTokens(dono);
  await createGroupThroughUi(pDono, 'Grupo da moderação');
  const grupo = await activeGroupId(pDono);
  await comoDono(`users/${ana.uid}`, { uid: ana.uid!, displayName: 'Ana', initials: 'AN', username: `t${ana.uid!.slice(0, 10).toLowerCase()}` });
  await comoDono(`memberships/${grupo}_${ana.uid}`, { groupId: grupo, memberId: ana.uid!, role: 'member', joinedAt: new Date().toISOString() });
  const canais = await canaisDoGrupo(grupo);
  const geral = canais.find((c) => c.nome === 'geral')!;
  const anuncios = canais.find((c) => c.nome !== 'geral' && c.nome !== 'Sala Principal')!;
  expect((await noCarteiro(dono, { grupo, acao: 'recalcular' })).status).toBe(200);
  await writeMessageAt(dono, { groupId: grupo, channelId: anuncios.id, body: 'segredo da staff', sentAt: new Date().toISOString() });

  // CANAL PRIVADO pela tela do dono: botão direito → Permissões do canal → Canal privado.
  await pDono.locator('.channel', { hasText: anuncios.nome }).first().click({ button: 'right' });
  await pDono.getByRole('menuitem', { name: 'Permissões do canal' }).click();
  const perms = pDono.getByRole('dialog', { name: /Permissões/ });
  await perms.getByRole('switch', { name: 'Canal privado' }).click();
  // A regra fica no @todos: "Ver canal" negado.
  await expect(perms.getByRole('radio', { name: 'Negar: Ver canal' })).toHaveAttribute('aria-checked', 'true');
  await perms.getByRole('region', { name: 'Alterações não salvas' }).getByRole('button', { name: 'Salvar' }).click();
  await expect(perms.getByRole('region', { name: 'Alterações não salvas' })).toBeHidden({ timeout: 20_000 });
  await pDono.screenshot({ path: 'test-results/moderacao/permissoes-canal.png' });
  await pDono.keyboard.press('Escape');

  // A Ana: o canal some da lista e o banco não deixa ler nem escrever nele.
  const cAna = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const pAna = await cAna.newPage();
  await pAna.goto('/');
  await signInThroughUi(pAna, ana);
  await pAna.locator(`.group-bar__button[data-group-id="${grupo}"]`).click();
  await expect(pAna.locator('.channel', { hasText: 'geral' }).first()).toBeVisible({ timeout: 30_000 });
  await expect(pAna.locator('.channel', { hasText: anuncios.nome })).toHaveCount(0, { timeout: 20_000 });
  expect(await writeMessageAt(ana, { groupId: grupo, channelId: anuncios.id, body: 'entrei?', sentAt: new Date().toISOString() })).toBe(403);
  expect(await writeMessageAt(ana, { groupId: grupo, channelId: geral.id, body: 'oi do geral', sentAt: new Date().toISOString() })).toBe(200);

  // APELIDO: o dono dá apelido à Ana; o nome muda no grupo.
  expect((await noCarteiro(dono, { grupo, acao: 'apelido', membro: ana.uid, apelido: 'Aninha' })).status).toBe(200);
  await expect(pDono.locator('.message__author', { hasText: 'Aninha' })).toBeVisible({ timeout: 20_000 });

  // CASTIGO pela tela: botão direito na Ana → Castigo… → 5 minutos.
  const painel = pDono.locator('.app > .members');
  await painel.getByRole('tab', { name: 'Membros' }).click();
  await painel.locator('.member', { hasText: 'Aninha' }).click({ button: 'right' });
  await pDono.getByRole('menuitem', { name: 'Castigo…' }).click();
  const janela = pDono.getByRole('dialog', { name: /Castigo para/ });
  await janela.getByRole('radio', { name: '5 minutos' }).click();
  await janela.getByRole('button', { name: 'Pôr de castigo' }).click();
  await expect(janela).toHaveCount(0, { timeout: 20_000 });
  await expect(painel.locator('.member', { hasText: 'Aninha' }).locator('.castigo-selo')).toBeVisible({ timeout: 20_000 });
  // A Ana: caixa travada com o motivo; o banco recusa.
  const caixaAna = pAna.locator('main.chat .composer__input');
  await expect(caixaAna).toBeDisabled({ timeout: 20_000 });
  await expect(caixaAna).toHaveAttribute('placeholder', /de castigo até/);
  expect(await writeMessageAt(ana, { groupId: grupo, channelId: geral.id, body: 'falei', sentAt: new Date().toISOString() })).toBe(403);
  // Tirar castigo: volta a escrever.
  await painel.locator('.member', { hasText: 'Aninha' }).click({ button: 'right' });
  await pDono.getByRole('menuitem', { name: 'Tirar castigo' }).click();
  await expect(caixaAna).toBeEnabled({ timeout: 20_000 });

  // MODO LENTO de 30 s no #geral: depois de mandar, a caixa da Ana conta o tempo; o banco barra a segunda.
  await pDono.locator('.channel', { hasText: 'geral' }).first().click({ button: 'right' });
  await pDono.getByRole('menuitem', { name: /Modo lento/ }).click();
  const lento = pDono.getByRole('dialog', { name: /Modo lento/ });
  await lento.getByRole('radio', { name: '30 s' }).click();
  await lento.getByRole('button', { name: 'Salvar' }).click();
  await expect(lento).toHaveCount(0, { timeout: 20_000 });
  await caixaAna.fill('primeira no lento');
  await caixaAna.press('Enter');
  await expect(pAna.locator('.message__text', { hasText: 'primeira no lento' })).toBeVisible({ timeout: 20_000 });
  await expect(caixaAna).toHaveAttribute('placeholder', /Modo lento: espere/, { timeout: 10_000 });
  // O dono escreve à vontade (ignora o modo lento).
  await pDono.locator('main.chat .composer__input').fill('dono no lento 1');
  await pDono.locator('main.chat .composer__input').press('Enter');
  await pDono.locator('main.chat .composer__input').fill('dono no lento 2');
  await pDono.locator('main.chat .composer__input').press('Enter');
  await expect(pDono.locator('.message__text', { hasText: 'dono no lento 2' })).toBeVisible({ timeout: 20_000 });

  // BANIR pela tela; a Ana não volta pelo convite; desbanir pela lista de Banidos.
  await painel.locator('.member', { hasText: 'Aninha' }).click({ button: 'right' });
  await pDono.getByRole('menuitem', { name: 'Banir…' }).click();
  const ban = pDono.getByRole('dialog', { name: /Banir/ });
  await ban.getByLabel(/Motivo/).fill('teste');
  await ban.getByRole('button', { name: 'Banir', exact: true }).click();
  await expect(painel.locator('.member', { hasText: 'Aninha' })).toHaveCount(0, { timeout: 20_000 });
  expect((await doGrupo('banidos', grupo)).some((b) => b.d['uid'] === ana.uid)).toBe(true);
  // Tentar entrar de novo (como no convite): o banco recusa.
  const convite = 'conviteteste' + Date.now().toString(36);
  await comoDono(`invites/${convite}`, { groupId: grupo, groupName: 'Grupo da moderação', createdBy: dono.uid!, createdAt: new Date().toISOString() });
  expect(await joinGroupViaRest(ana, grupo, convite)).toBe(403);

  // Configurações → Banidos: desbanir. → Registro: as ações aparecem.
  await pDono.getByRole('button', { name: 'Opções do grupo' }).click();
  await pDono.getByRole('menuitem', { name: 'Configurações do grupo' }).click();
  const tela = pDono.getByRole('dialog', { name: 'Configurações do grupo' });
  await tela.getByRole('button', { name: 'Banidos' }).click();
  const linhaBan = tela.locator('.rg-linha').first();
  await expect(linhaBan).toContainText('teste');
  await linhaBan.getByRole('button', { name: 'Desbanir' }).click();
  await expect(tela.getByText('Ninguém banido.')).toBeVisible({ timeout: 20_000 });
  await tela.getByRole('button', { name: 'Registro' }).click();
  const registro = tela.locator('.rg-linha');
  await expect(registro.filter({ hasText: / baniu / })).toHaveCount(1, { timeout: 20_000 });
  await expect(registro.filter({ hasText: 'pôs de castigo' })).toHaveCount(1);
  await expect(registro.filter({ hasText: 'desbaniu' })).toHaveCount(1);
  await expect(registro.filter({ hasText: 'mudou as permissões' })).toHaveCount(1);
  await pDono.screenshot({ path: 'test-results/moderacao/registro.png' });

  await cDono.close();
  await cAna.close();
});
