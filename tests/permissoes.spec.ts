import { expect, test } from '@playwright/test';

import {
  activeGroupId,
  createAccountViaRest,
  createGroupThroughUi,
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
 * PERMISSÕES VALENDO (0.8.5, etapa 2): o carteiro confere permissão e
 * hierarquia antes de gravar; as regras do banco cobram o que o carteiro
 * calculou; o app esconde/trava o que a pessoa não pode; "ver como cargo".
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
  await limparTudo(contas, 'permissões — limpeza');
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

test('permissões: carteiro confere hierarquia, banco cobra, app esconde e trava, ver como cargo', async ({ browser }) => {
  test.setTimeout(300_000);
  const dono = newAccount('Dono perms');
  const beto = newAccount('Beto perms');
  const ana = newAccount('Ana perms');
  contas.push(dono, beto, ana);
  await createAccountViaRest(beto);
  await createAccountViaRest(ana);

  const cDono = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const pDono = await cDono.newPage();
  await pDono.goto('/');
  await signUpThroughUi(pDono, dono);
  await resolveTokens(dono);
  await createGroupThroughUi(pDono, 'Grupo das permissões');
  const grupo = await activeGroupId(pDono);
  for (const [p, nome] of [[beto, 'Beto'], [ana, 'Ana']] as const) {
    await comoDono(`users/${p.uid}`, { uid: p.uid!, displayName: nome, initials: nome.slice(0, 2).toUpperCase(), username: `t${p.uid!.slice(0, 10).toLowerCase()}` });
    await comoDono(`memberships/${grupo}_${p.uid}`, { groupId: grupo, memberId: p.uid!, role: 'member', joinedAt: new Date().toISOString() });
  }
  const geral = (await canaisDoGrupo(grupo)).find((c) => c.nome === 'geral')!;

  // O dono prepara: @todos + Administrador nascem; "Moderador" e "Novato".
  expect((await noCarteiro(dono, { grupo, acao: 'recalcular' })).status).toBe(200);
  const mod = String((await noCarteiro(dono, { grupo, acao: 'criar' })).corpo['id']);
  const nov = String((await noCarteiro(dono, { grupo, acao: 'criar' })).corpo['id']);
  const campos = (nome: string, permissoes: string[]) => ({ nome, cor: { a: '#3d6fd1' }, icone: '', imagem: '', separado: true, mencionavel: false, permissoes });
  expect((await noCarteiro(dono, { grupo, acao: 'salvar', cargo: mod, campos: campos('Moderador', ['gerenciar-cargos', 'dar-cargos', 'apagar-dos-outros', 'expulsar', 'fixar']) })).status).toBe(200);
  expect((await noCarteiro(dono, { grupo, acao: 'salvar', cargo: nov, campos: campos('Novato', []) })).status).toBe(200);
  expect((await noCarteiro(dono, { grupo, acao: 'dar', membro: beto.uid, cargo: mod, dar: true })).status).toBe(200);
  const cargos = await doGrupo('cargos', grupo);
  const admin = cargos.find((c) => c.d['nome'] === 'Administrador')!.id;
  // O carteiro calculou: o Beto tem as permissões do Moderador e a posição dele.
  const mBeto = (await doGrupo('memberships', grupo)).find((m) => m.d['memberId'] === beto.uid)!;
  expect(mBeto.d['perms']).toEqual(expect.arrayContaining(['expulsar', 'mandar-mensagens']));
  expect(typeof mBeto.d['topo']).toBe('number');

  // Hierarquia, conferida no carteiro.
  const recusa = async (corpo: Record<string, unknown>, trecho: RegExp): Promise<void> => {
    const r = await noCarteiro(beto, { grupo, ...corpo });
    expect(r.status, JSON.stringify(r.corpo)).toBe(403);
    expect(String(r.corpo['erro'])).toMatch(trecho);
  };
  await recusa({ acao: 'salvar', cargo: admin, campos: campos('Admin', ['administrador']) }, /acima|nível/);
  await recusa({ acao: 'salvar', cargo: nov, campos: campos('Novato', ['banir']) }, /não pode dar uma permissão/);
  await recusa({ acao: 'dar', membro: ana.uid, cargo: mod, dar: true }, /acima|nível/);
  await recusa({ acao: 'expulsar', membro: dono.uid }, /dono/);
  expect((await noCarteiro(beto, { grupo, acao: 'salvar', cargo: nov, campos: campos('Novato', ['fixar']) })).status).toBe(200);
  expect((await noCarteiro(beto, { grupo, acao: 'dar', membro: ana.uid, cargo: nov, dar: true })).status).toBe(200);
  // Ninguém escreve cargos nem memberships direto no banco.
  expect(
    (await fetch(`${CARTEIRO}/cargos`, { method: 'POST', body: '{}' })).status,
  ).toBe(401);

  // A Ana escreve; o Beto (Moderador) apaga pela tela.
  expect(await writeMessageAt(ana, { groupId: grupo, channelId: geral.id, body: 'mensagem da Ana', sentAt: new Date().toISOString() })).toBe(200);
  const cBeto = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const pBeto = await cBeto.newPage();
  await pBeto.goto('/');
  await signInThroughUi(pBeto, beto);
  await pBeto.locator(`.group-bar__button[data-group-id="${grupo}"]`).click();
  const msgAna = pBeto.locator('.message', { hasText: 'mensagem da Ana' });
  await expect(msgAna).toBeVisible({ timeout: 30_000 });
  await msgAna.locator('.message__bubble').click({ button: 'right' });
  await pBeto.getByRole('menuitem', { name: 'Apagar mensagem' }).click();
  await pBeto.getByRole('dialog').getByRole('button', { name: /Apagar/ }).click();
  await expect(msgAna).toHaveCount(0, { timeout: 20_000 });

  // Menu do grupo: Configurações sim; Criar canal e Convidar não.
  await pBeto.getByRole('button', { name: 'Opções do grupo' }).click();
  await expect(pBeto.getByRole('menuitem', { name: 'Configurações do grupo' })).toBeVisible();
  await expect(pBeto.getByRole('menuitem', { name: 'Criar canal' })).toHaveCount(0);
  await expect(pBeto.getByRole('menuitem', { name: 'Convidar pessoas' })).toHaveCount(0);
  await pBeto.getByRole('menuitem', { name: 'Configurações do grupo' }).click();
  const tela = pBeto.getByRole('dialog', { name: 'Configurações do grupo' });
  await expect(tela.getByRole('button', { name: 'Cargos', exact: true })).toBeVisible();
  await expect(tela.getByRole('button', { name: 'Visão geral' })).toBeHidden();
  await expect(tela.getByRole('button', { name: 'Canais' })).toBeHidden();
  await expect(tela.locator('.cg-linha', { hasText: 'Administrador' })).toContainText('acima do seu', { timeout: 20_000 });
  // No editor do Novato, "Banir" (que ele não tem) fica travado.
  await tela.locator('.cg-linha', { hasText: 'Novato' }).click();
  await tela.getByRole('tab', { name: 'Permissões' }).click();
  await expect(tela.getByRole('switch', { name: 'Banir', exact: true })).toBeDisabled();
  await expect(tela.getByRole('switch', { name: 'Fixar mensagens', exact: true })).toBeEnabled();
  await pBeto.keyboard.press('Escape');

  // O dono tira "Mandar mensagens" do @todos: a Ana não escreve mais (banco),
  // e a caixa do Beto (que só tinha pelo @todos) trava com o motivo.
  const todos = cargos.find((c) => c.d['todos'] === true)!;
  const semMandar = (todos.d['permissoes'] as string[]).filter((p) => p !== 'mandar-mensagens');
  expect((await noCarteiro(dono, { grupo, acao: 'salvar', cargo: todos.id, campos: { ...campos('@todos', semMandar) } })).status).toBe(200);
  expect(await writeMessageAt(ana, { groupId: grupo, channelId: geral.id, body: 'não pode', sentAt: new Date().toISOString() })).toBe(403);
  const caixa = pBeto.locator('main.chat .composer__input');
  await expect(caixa).toBeDisabled({ timeout: 20_000 });
  await expect(caixa).toHaveAttribute('placeholder', 'Você não tem permissão para escrever aqui.');

  // Ver o grupo como o Novato: faixa no topo, caixa travada; voltar ao normal.
  await pDono.getByRole('button', { name: 'Opções do grupo' }).click();
  await pDono.getByRole('menuitem', { name: 'Configurações do grupo' }).click();
  const telaDono = pDono.getByRole('dialog', { name: 'Configurações do grupo' });
  await telaDono.getByRole('button', { name: 'Cargos', exact: true }).click();
  await telaDono.locator('.cg-linha', { hasText: 'Novato' }).click();
  await telaDono.getByRole('button', { name: /Ver o grupo como este cargo/ }).click();
  const faixa = pDono.locator('.ver-como');
  await expect(faixa).toContainText('Novato');
  await expect(pDono.locator('main.chat .composer__input')).toBeDisabled();
  await pDono.screenshot({ path: 'test-results/permissoes/ver-como.png' });
  await faixa.getByRole('button', { name: 'Voltar ao normal' }).click();
  await expect(faixa).toBeHidden();
  await expect(pDono.locator('main.chat .composer__input')).toBeEnabled();

  // O Beto expulsa a Ana (abaixo dele) pelo menu do membro; fica no registro.
  const painel = pBeto.locator('.app > .members');
  await painel.getByRole('tab', { name: 'Membros' }).click();
  await painel.locator('.member', { hasText: 'Ana' }).click({ button: 'right' });
  await pBeto.getByRole('menuitem', { name: 'Remover do grupo' }).click();
  await pBeto.getByRole('dialog').getByRole('button', { name: 'Remover' }).click();
  await expect(painel.locator('.member', { hasText: 'Ana' })).toHaveCount(0, { timeout: 20_000 });
  const registro = await doGrupo('registro', grupo);
  expect(registro.some((r) => r.d['acao'] === 'expulsou' && r.d['alvo'] === ana.uid)).toBe(true);
  await pBeto.screenshot({ path: 'test-results/permissoes/beto-travado.png' });

  await cDono.close();
  await cBeto.close();
});
