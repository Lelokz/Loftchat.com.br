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
} from './helpers';
import type { TestAccount } from './helpers';
import { CARTEIRO, FS, avisar, canaisDoGrupo, comoDono, ligarCarteiroLocal, lerComoDono } from './carteiro-local';

/**
 * INSÍGNIAS 0.12.5: as especiais (só o criador dá; chega como presente no
 * privado; o nome brilha depois de abrir) e as insígnias do SERVIDOR (criar
 * pela tela, valer para quem já cumpre, frase secreta, dar à mão pelo "+",
 * a aba do grupo no perfil, o aviso com o nome do grupo e as regras).
 */

const PASTA = 'test-results/insignias-servidor';
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
  await limparTudo(contas, 'insígnias do servidor — limpeza');
});

const s = (v: string): Record<string, string> => ({ stringValue: v });

async function chamar(conta: TestAccount, rota: string, corpo: Record<string, unknown>): Promise<{ status: number; corpo: Record<string, unknown> }> {
  await resolveTokens(conta);
  const r = await fetch(`${CARTEIRO}${rota}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${conta.idToken}` },
    body: JSON.stringify(corpo),
  });
  return { status: r.status, corpo: (await r.json().catch(() => ({}))) as Record<string, unknown> };
}

/** Escreve como a pessoa (pelas regras), só os campos da máscara. */
async function patchComo(conta: TestAccount, caminho: string, campos: string[], fields: Record<string, unknown>): Promise<number> {
  await resolveTokens(conta);
  const mascara = campos.map((c) => `updateMask.fieldPaths=${encodeURIComponent(c)}`).join('&');
  const r = await fetch(`${FS}/${caminho}?${mascara}`, {
    method: 'PATCH',
    headers: { authorization: `Bearer ${conta.idToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
  return r.status;
}

async function lerComo(conta: TestAccount, caminho: string): Promise<number> {
  await resolveTokens(conta);
  return (await fetch(`${FS}/${caminho}`, { headers: { authorization: `Bearer ${conta.idToken}` } })).status;
}

/** Só alguns campos do documento (o resto fica). */
async function mudarComoDono(caminho: string, fields: Record<string, unknown>): Promise<void> {
  const mascara = Object.keys(fields).map((c) => `updateMask.fieldPaths=${encodeURIComponent(c)}`).join('&');
  const r = await fetch(`${FS}/${caminho}?${mascara}`, {
    method: 'PATCH',
    headers: { authorization: 'Bearer owner', 'content-type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
  expect(r.ok, `mudar ${caminho}`).toBe(true);
}

test('especiais: só o criador dá, o presente chega no privado e o nome brilha depois de abrir', async ({ browser }) => {
  test.setTimeout(300_000);
  const criador = newAccount('Criador');
  criador.displayName = 'Criador';
  const lucas = newAccount('Lucas');
  lucas.displayName = 'Lucas';
  contas.push(criador, lucas);
  await createAccountViaRest(lucas);
  await comoDono(`users/${lucas.uid}`, { uid: lucas.uid!, displayName: 'Lucas', initials: 'LU', username: 'lucasteste', createdAt: new Date().toISOString() });

  // O criador entra e vira "criadorteste" (o @ que o carteiro de teste reconhece).
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto('/');
  await signUpThroughUi(page, criador);
  await resolveTokens(criador);
  await mudarComoDono(`users/${criador.uid}`, { username: s('criadorteste') });
  // Amigos (o presente vai no privado dos dois).
  const par = [criador.uid!, lucas.uid!].sort().join('_');
  const [x, y] = par.split('_') as [string, string];
  const r = await fetch(`${FS}/friendships/${par}`, {
    method: 'PATCH',
    headers: { authorization: 'Bearer owner', 'content-type': 'application/json' },
    body: JSON.stringify({ fields: { members: { arrayValue: { values: [s(x), s(y)] } }, from: s(criador.uid!), to: s(lucas.uid!), status: s('accepted'), createdAt: s(new Date().toISOString()) } }),
  });
  expect(r.ok).toBe(true);

  // O "conferir" dá a dele (Criador do Loftchat) e o nome roxo.
  // (O app já conferiu ao entrar, antes do @ mudar; o carteiro ignora outro
  // conferir nos 10 s seguintes — então pede de novo até valer.)
  await expect
    .poll(
      async () => {
        expect((await chamar(criador, '/conquistas', { evento: 'conferir' })).status).toBe(200);
        return (await lerComoDono(`users/${criador.uid}`))?.['brilho']?.['stringValue'];
      },
      { timeout: 40_000, intervals: [3_000] },
    )
    .toBe('roxo');
  expect((await lerComoDono(`insignias/${criador.uid}`))?.['tem']).toBeDefined();

  // REGRAS: ninguém se dá brilho, nem cria presente, nem lê quem tem.
  expect(await patchComo(lucas, `users/${lucas.uid}`, ['brilho'], { brilho: s('roxo') })).toBe(403);
  expect(await patchComo(lucas, `dmMessages/falso${Date.now()}`, ['threadId', 'authorId', 'kind', 'body', 'sentAt', 'presente'], {
    threadId: s(par), authorId: s(lucas.uid!), kind: s('text'), body: s(''), sentAt: s(new Date().toISOString()),
    presente: { mapValue: { fields: { insignia: s('confidente'), aberto: { booleanValue: false } } } },
  })).toBe(403);
  expect(await lerComo(lucas, 'especiais/estado')).toBe(403);
  // E o carteiro: só o criador lista, dá e tira.
  expect((await chamar(lucas, '/especiais', { acao: 'listar' })).status).toBe(403);
  expect((await chamar(lucas, '/especiais', { acao: 'dar', insignia: 'confidente', uid: lucas.uid })).status).toBe(403);

  // CONFIGURAÇÕES → CRIADOR: dar Confidente para o Lucas pela tela.
  await page.reload();
  await page.getByRole('button', { name: 'Configurações' }).first().click();
  const cfg = page.locator('dialog.settings[open]');
  await cfg.getByRole('button', { name: 'Criador' }).click();
  await expect(cfg.locator('[data-especial="criador"]')).toContainText('Criador do Loftchat');
  await expect(cfg.locator('[data-especial="criador"]')).toContainText('Não dá para dar para ninguém');
  const conf = cfg.locator('[data-especial="confidente"]');
  await conf.getByRole('button', { name: '+ Dar para alguém' }).click();
  await conf.getByRole('searchbox', { name: 'Procurar pessoa' }).fill('Luc');
  await expect(conf.locator('.cri-busca__r', { hasText: 'Lucas' })).toBeVisible({ timeout: 15_000 });
  await page.screenshot({ path: `${PASTA}/1-painel-dar.png` });
  await conf.locator('.cri-busca__r', { hasText: 'Lucas' }).getByRole('button', { name: 'Dar' }).click();
  await expect(conf.locator('.cri__p', { hasText: 'Lucas' })).toContainText('presente ainda fechado', { timeout: 20_000 });
  await page.screenshot({ path: `${PASTA}/2-painel-do-criador.png` });
  // Não dá para dar duas vezes.
  expect((await chamar(criador, '/especiais', { acao: 'dar', insignia: 'confidente', uid: lucas.uid })).status).toBe(409);
  await page.keyboard.press('Escape');

  // O LUCAS: o presente no privado → abre → tela cheia → o nome brilha.
  const ctxL = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const pl = await ctxL.newPage();
  await pl.goto('/');
  await signInThroughUi(pl, lucas);
  await pl.getByRole('button', { name: 'Privado', exact: true }).click();
  await pl.getByRole('button', { name: 'Amigos', exact: true }).click();
  await pl.locator('.friends__row--clickable', { hasText: 'Criador' }).click();
  await expect(pl.locator('.dm-chat__name')).toHaveClass(/nome-brilho--roxo/, { timeout: 20_000 });
  const presente = pl.locator('.pr').first();
  await expect(presente).toBeVisible({ timeout: 20_000 });
  await expect(presente.getByRole('button', { name: 'Abrir presente' })).toBeVisible();
  await pl.screenshot({ path: `${PASTA}/3-presente-fechado.png` });
  await presente.getByRole('button', { name: 'Abrir presente' }).click();
  const tela = pl.getByRole('dialog', { name: 'Presente: Confidente' });
  await expect(tela).toBeVisible({ timeout: 20_000 });
  await expect(tela.locator('.nome-brilho--ouro')).toHaveText('Lucas');
  await pl.waitForTimeout(600);
  await pl.screenshot({ path: `${PASTA}/4-abrindo.png` });
  await tela.getByRole('button', { name: 'Fechar' }).click();
  await expect(pl.locator('.pr--aberto')).toBeVisible({ timeout: 20_000 });
  await expect(pl.locator('.session-footer__name')).toHaveClass(/nome-brilho--ouro/);
  expect((await lerComoDono(`users/${lucas.uid}`))?.['brilho']?.['stringValue']).toBe('ouro');
  await pl.screenshot({ path: `${PASTA}/5-presente-aberto.png` });
  // Abrir de novo não faz nada de mais; quem mandou não abre.
  const msgs = await chamar(criador, '/especiais', { acao: 'listar' });
  expect(((msgs.corpo['quem'] as Record<string, Array<{ aberto: boolean }>>)['confidente'] ?? [])[0]?.aberto).toBe(true);

  // TIRAR: some a insígnia e o brilho.
  expect((await chamar(criador, '/especiais', { acao: 'tirar', insignia: 'confidente', uid: lucas.uid })).status).toBe(200);
  await expect.poll(async () => (await lerComoDono(`users/${lucas.uid}`))?.['brilho']).toBeUndefined();
  const tem = (await lerComoDono(`insignias/${lucas.uid}`))?.['tem']?.['mapValue'] as { fields?: Record<string, unknown> } | undefined;
  expect(tem?.fields?.['confidente']).toBeUndefined();
  await ctxL.close();
  await ctx.close();
});

test('servidor: criar pela tela, vale para quem já cumpre, frase secreta, dar pelo +, perfil do grupo, aviso e regras', async ({ browser }) => {
  test.setTimeout(400_000);
  const dono = newAccount('Dono');
  dono.displayName = 'Dono ins';
  const ana = newAccount('Ana');
  ana.displayName = 'Ana';
  contas.push(dono, ana);
  await createAccountViaRest(ana);
  await comoDono(`users/${ana.uid}`, { uid: ana.uid!, displayName: 'Ana', initials: 'AN', username: `t${ana.uid!.slice(0, 10).toLowerCase()}`, createdAt: new Date().toISOString() });

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto('/');
  await signUpThroughUi(page, dono);
  await resolveTokens(dono);
  await createGroupThroughUi(page, 'Os de sempre');
  const grupo = await activeGroupId(page);
  await comoDono(`memberships/${grupo}_${ana.uid}`, { groupId: grupo, memberId: ana.uid!, role: 'member', joinedAt: new Date(Date.now() - 3 * 864e5).toISOString() });
  const canais = await canaisDoGrupo(grupo);
  const geral = canais.find((c) => c.nome === 'geral')!;
  // A Ana já tinha mandado 3 mensagens (antes de existir a insígnia).
  for (const i of [1, 2, 3]) {
    await comoDono(`messages/h${i}${grupo}`, { groupId: grupo, channelId: geral.id, authorId: ana.uid!, kind: 'text', body: `oi ${i}`, sentAt: new Date(Date.now() - (10 - i) * 60_000).toISOString() });
  }
  await chamar(dono, '/cargos', { grupo, acao: 'recalcular' });

  // CONFIGURAÇÕES DO GRUPO → INSÍGNIAS → Criar (pela tela).
  await page.getByRole('button', { name: 'Opções do grupo' }).click();
  await page.getByRole('menuitem', { name: 'Configurações do grupo' }).click();
  const cfg = page.getByRole('dialog', { name: 'Configurações do grupo' });
  await cfg.getByRole('button', { name: 'Insígnias' }).click();
  await expect(cfg.getByText('Nenhuma insígnia ainda')).toBeVisible({ timeout: 20_000 });
  await cfg.getByRole('button', { name: '+ Criar insígnia' }).click();
  const ed = page.getByRole('dialog', { name: 'Criar insígnia' });
  await expect(ed).toBeVisible();
  await ed.locator('#isv-nome').fill('Tagarela');
  await ed.locator('#isv-desc').fill('3 mensagens no #geral.');
  await ed.getByRole('radio', { name: 'fogo' }).click();
  await ed.getByRole('radio', { name: 'Épica' }).click();
  await ed.getByRole('combobox', { name: 'Em qual canal' }).selectOption(geral.id);
  await ed.getByRole('spinbutton', { name: 'Quantas mensagens' }).fill('3');
  await expect(ed.locator('.isv-ed__previa')).toContainText('Tagarela');
  await expect(ed.locator('.isv-ed__previa')).toContainText('Insígnia nova · Os de sempre');
  await page.screenshot({ path: `${PASTA}/6-criar.png` });
  // A lista do "como ganhar".
  await ed.locator('.isv-ed__como-bt').click();
  await expect(ed.getByRole('listbox', { name: 'Como ganhar' }).getByRole('option')).toHaveCount(12);
  await page.screenshot({ path: `${PASTA}/7-como-ganhar.png` });
  await ed.getByRole('option', { name: /Mandar mensagens/ }).click();
  await ed.getByRole('spinbutton', { name: 'Quantas mensagens' }).fill('3');
  await ed.getByRole('combobox', { name: 'Em qual canal' }).selectOption(geral.id);
  await ed.getByRole('button', { name: 'Criar insígnia', exact: true }).click();
  await expect(ed).toHaveCount(0, { timeout: 30_000 });
  const linha = cfg.locator('.isv-linha', { hasText: 'Tagarela' });
  await expect(linha).toContainText('3 mensagens em #geral');
  // Vale para quem já cumpre: a Ana tinha 3 mensagens.
  await expect(linha).toContainText('👤 1', { timeout: 30_000 });
  await page.screenshot({ path: `${PASTA}/8-lista.png` });
  const tagarela = (await linha.getAttribute('data-insignia'))!;

  // Pelo carteiro: uma dada à mão e uma de frase secreta.
  const guardiao = await chamar(dono, '/cargos', { grupo, acao: 'insignia-salvar', dados: { nome: 'Guardião', desc: 'Ajuda a moderar.', icone: 'escudo', raridade: 'epica', gatilho: { tipo: 'mao', alvo: 1 }, secreta: false, limite: 0, ate: '' } });
  expect(guardiao.status).toBe(200);
  const bolo = await chamar(dono, '/cargos', { grupo, acao: 'insignia-salvar', dados: { nome: 'Bolo', desc: 'Mandou a frase.', icone: 'bolo', raridade: 'rara', gatilho: { tipo: 'frase', alvo: 1 }, secreta: true, limite: 0, ate: '', frase: 'O bolo é uma mentira' } });
  expect(bolo.status).toBe(200);
  const idGuardiao = String(guardiao.corpo['id']);
  const idBolo = String(bolo.corpo['id']);
  // Ícone de fora da lista e quem não tem permissão: recusados.
  expect((await chamar(dono, '/cargos', { grupo, acao: 'insignia-salvar', dados: { nome: 'X', icone: 'hack', raridade: 'rara', gatilho: { tipo: 'mao', alvo: 1 } } })).status).toBe(400);
  expect((await chamar(ana, '/cargos', { grupo, acao: 'insignia-salvar', dados: { nome: 'Minha', icone: 'fogo', raridade: 'rara', gatilho: { tipo: 'mao', alvo: 1 } } })).status).toBe(403);
  expect((await chamar(ana, '/cargos', { grupo, acao: 'insignia-dar', insignia: idGuardiao, membro: ana.uid })).status).toBe(403);

  // REGRAS: a Ana lê, não escreve; a frase ninguém lê.
  expect(await lerComo(ana, `insigniasDoGrupo/${idBolo}`)).toBe(200);
  expect(await lerComo(ana, `insigniasDoGrupoInterno/${idBolo}`)).toBe(403);
  expect(await patchComo(ana, `insigniasDoGrupo/${idBolo}`, ['nome'], { nome: s('hack') })).toBe(403);
  expect(await patchComo(ana, `insigniasDoMembro/${grupo}_${ana.uid}`, ['tem.x'], { tem: { mapValue: { fields: { x: s('2026-01-01') } } } })).toBe(403);
  expect(await patchComo(ana, `insigniasDoMembro/${grupo}_${ana.uid}`, ['avisadoAte'], { avisadoAte: s('2026-01-01') })).toBe(200);
  await mudarComoDono(`insigniasDoMembro/${grupo}_${ana.uid}`, { avisadoAte: s('') });

  // A FRASE SECRETA: a Ana manda (sem acento, com maiúscula) e ganha.
  const id = `fr${Date.now()}`;
  await comoDono(`messages/${id}`, { groupId: grupo, channelId: geral.id, authorId: ana.uid!, kind: 'text', body: 'sabia que O BOLO E UMA MENTIRA?', sentAt: new Date().toISOString() });
  await resolveTokens(ana);
  expect((await avisar(ana.idToken!, { tipo: 'grupo', id })).status).toBe(202);
  await expect
    .poll(async () => Object.keys(((await lerComoDono(`insigniasDoMembro/${grupo}_${ana.uid}`))?.['tem']?.['mapValue'] as { fields?: object } | undefined)?.fields ?? {}), { timeout: 30_000 })
    .toContain(idBolo);
  await page.keyboard.press('Escape');

  // O CARTÃO DA ANA NO GRUPO: a fileira do grupo e o "+" (dar Guardião).
  await page.reload();
  const membros = page.locator('.app > .members');
  await membros.getByRole('tab', { name: 'Membros' }).click();
  await membros.locator('.member', { hasText: 'Ana' }).first().click();
  const pop = page.locator('.person-popover');
  await expect(pop.locator('.isv-perfil')).toContainText('Insígnias do grupo', { timeout: 20_000 });
  await expect(pop.locator(`[data-insignia="${tagarela}"]`)).toBeVisible();
  await pop.getByRole('button', { name: 'Dar ou tirar insígnia' }).click();
  const menu = page.getByRole('menu', { name: 'Dar ou tirar insígnia' });
  await menu.getByRole('menuitemcheckbox', { name: /Guardião/ }).click();
  await expect(menu.getByRole('menuitemcheckbox', { name: /Guardião/ })).toHaveAttribute('aria-checked', 'true', { timeout: 20_000 });
  await page.screenshot({ path: `${PASTA}/9-dar-pelo-mais.png` });
  await page.keyboard.press('Escape');
  await expect(pop.locator(`[data-insignia="${idGuardiao}"]`)).toBeVisible({ timeout: 20_000 });
  await page.screenshot({ path: `${PASTA}/10-cartao-no-grupo.png` });

  // O PERFIL COMPLETO aberto no grupo: a aba do grupo vem primeiro.
  await pop.getByRole('button', { name: 'Ver perfil completo' }).click();
  const perfil = page.locator('.pfc');
  await expect(perfil.getByRole('tab', { name: 'Os de sempre' })).toHaveAttribute('aria-selected', 'true');
  await expect(perfil.locator('.isv-pvs__topo')).toContainText('3', { timeout: 20_000 });
  await expect(perfil.locator('.isv-pv')).toHaveCount(3);
  await page.screenshot({ path: `${PASTA}/11-perfil-do-grupo.png` });
  await page.keyboard.press('Escape');

  // A ANA: o aviso diz o nome do grupo.
  const ctxA = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const pa = await ctxA.newPage();
  await pa.goto('/');
  await signInThroughUi(pa, ana);
  await expect(pa.locator('.ins-aviso', { hasText: 'Os de sempre' }).first()).toBeVisible({ timeout: 30_000 });
  await pa.screenshot({ path: `${PASTA}/12-aviso-do-grupo.png` });

  // APAGAR tira de todo mundo.
  expect((await chamar(dono, '/cargos', { grupo, acao: 'insignia-apagar', insignia: idBolo })).status).toBe(200);
  await expect
    .poll(async () => Object.keys(((await lerComoDono(`insigniasDoMembro/${grupo}_${ana.uid}`))?.['tem']?.['mapValue'] as { fields?: object } | undefined)?.fields ?? {}))
    .not.toContain(idBolo);

  // CELULAR: a tela de criar ocupa a tela toda.
  await page.getByRole('button', { name: 'Opções do grupo' }).click();
  await page.getByRole('menuitem', { name: 'Configurações do grupo' }).click();
  await cfg.getByRole('button', { name: 'Insígnias' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await cfg.getByRole('button', { name: '+ Criar insígnia' }).click();
  const edCel = page.getByRole('dialog', { name: 'Criar insígnia' });
  await expect(edCel).toHaveClass(/isv-ed--celular/);
  const caixa = await edCel.boundingBox();
  expect(caixa!.width).toBeGreaterThanOrEqual(388);
  await page.screenshot({ path: `${PASTA}/13-celular-criar.png` });
  await ctxA.close();
  await ctx.close();
});
