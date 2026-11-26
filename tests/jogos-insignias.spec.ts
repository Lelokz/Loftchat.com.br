import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import { activeGroupId, createGroupThroughUi, limparTudo, newAccount, resolveTokens, sendMessageThroughUi, signInThroughUi, signUpThroughUi } from './helpers';
import type { TestAccount } from './helpers';
import { CARTEIRO, FS, canaisDoGrupo, comoDono, lerComoDono, ligarCarteiroLocal } from './carteiro-local';

/**
 * JOGOS E INSÍGNIAS (0.12.0): "Jogando…" (lista, aba Agora, cartão), os jogos
 * do perfil (Configurações → Jogos, com o catálogo de mentira do carteiro
 * local), o perfil completo (Jogos, Insígnias, Amigos em comum), as regras
 * do banco, o carteiro contando (mensagem, reação, chamada, jogo) sem contar
 * duas vezes, o aviso de insígnia nova e as 5 do cartão. E o celular.
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
  await limparTudo(contas, 'jogos e insígnias — limpeza');
});

const PASTA = 'test-results/jogos-insignias';
const par = (a: string, b: string): string => (a < b ? `${a}_${b}` : `${b}_${a}`);

/** Grava como a PRÓPRIA pessoa (passa pelas regras), com `visto` = hora do servidor. */
async function gravarJogando(conta: TestAccount, campos: Record<string, unknown>): Promise<number> {
  const r = await fetch(`${FS}:commit`, {
    method: 'POST',
    headers: { authorization: `Bearer ${conta.idToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      writes: [
        {
          update: { name: `projects/loft-3d6c0f/databases/(default)/documents/jogando/${conta.uid}`, fields: campos },
          updateTransforms: [{ fieldPath: 'visto', setToServerValue: 'REQUEST_TIME' }],
        },
      ],
    }),
  });
  return r.status;
}

async function patchComo(conta: TestAccount, caminho: string, mascara: string[], campos: Record<string, unknown>): Promise<number> {
  const q = mascara.map((m) => `updateMask.fieldPaths=${encodeURIComponent(m)}`).join('&');
  const r = await fetch(`${FS}/${caminho}?${q}`, {
    method: 'PATCH',
    headers: { authorization: `Bearer ${conta.idToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ fields: campos }),
  });
  return r.status;
}

async function conquista(conta: TestAccount, corpo: unknown): Promise<{ novas?: string[] }> {
  const r = await fetch(`${CARTEIRO}/conquistas`, {
    method: 'POST',
    headers: { authorization: `Bearer ${conta.idToken}`, 'content-type': 'application/json' },
    body: JSON.stringify(corpo),
  });
  expect(r.status, JSON.stringify(corpo)).toBe(200);
  return (await r.json()) as { novas?: string[] };
}

async function contadores(uid: string): Promise<Record<string, number>> {
  const d = await lerComoDono(`insignias/${uid}`);
  const n = (d?.['n'] as { mapValue?: { fields?: Record<string, { integerValue?: string }> } } | undefined)?.mapValue?.fields ?? {};
  return Object.fromEntries(Object.entries(n).map(([k, v]) => [k, Number(v.integerValue ?? 0)]));
}

async function ganhas(uid: string): Promise<string[]> {
  const d = await lerComoDono(`insignias/${uid}`);
  return Object.keys((d?.['tem'] as { mapValue?: { fields?: Record<string, unknown> } } | undefined)?.mapValue?.fields ?? {});
}

const s = (v: string): { stringValue: string } => ({ stringValue: v });
const i = (v: number): { integerValue: string } => ({ integerValue: String(v) });
const jogo = (nome: string, extra: Record<string, unknown> = {}): unknown => ({ mapValue: { fields: { nome: s(nome), ...extra } } });
const lista = (itens: unknown[]): unknown => ({ arrayValue: { values: itens } });
const CAPA = (id: number): { stringValue: string } => s(`https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/library_600x900.jpg`);

let ana: TestAccount;
let lucas: TestAccount;
let gabi: TestAccount;
let grupo = '';

async function cadastrar(page: Page, conta: TestAccount): Promise<void> {
  await page.goto('/');
  await signUpThroughUi(page, conta);
  await resolveTokens(conta);
}

test('jogando agora, jogos do perfil, cartão, perfil completo e Configurações → Jogos', async ({ browser }) => {
  test.setTimeout(300_000);
  ana = newAccount('Ana jogos');
  lucas = newAccount('Lucas jogos');
  gabi = newAccount('Gabi jogos');
  contas.push(ana, lucas, gabi);

  for (const c of [lucas, gabi]) {
    const ctx = await browser.newContext();
    await cadastrar(await ctx.newPage(), c);
    await ctx.close();
  }
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(20_000);
  await cadastrar(page, ana);
  await createGroupThroughUi(page, 'Os de sempre');
  grupo = await activeGroupId(page);
  for (const c of [lucas, gabi]) await comoDono(`memberships/${grupo}_${c.uid}`, { groupId: grupo, memberId: c.uid!, role: 'member' });
  // Ana–Lucas, Ana–Gabi e Lucas–Gabi amigos: a Gabi é amiga em comum de Ana e Lucas.
  for (const [a, b] of [[ana, lucas], [ana, gabi], [lucas, gabi]] as const) {
    const id = par(a.uid!, b.uid!);
    const [x, y] = id.split('_') as [string, string];
    const r = await fetch(`${FS}/friendships/${id}`, {
      method: 'PATCH',
      headers: { authorization: 'Bearer owner', 'content-type': 'application/json' },
      body: JSON.stringify({ fields: { members: lista([s(x), s(y)]), from: s(a.uid!), to: s(b.uid!), status: s('accepted'), createdAt: s(new Date().toISOString()) } }),
    });
    expect(r.ok).toBe(true);
  }

  // --- regras: jogando ---------------------------------------------------------
  expect(await gravarJogando(lucas, { nome: s('Lethal Company'), loja: s('Steam'), steamId: i(1966720), capa: CAPA(1966720), desde: i(Date.now() - 23 * 60_000) })).toBe(200);
  // Capa de outro site e campo a mais: recusados. E ninguém grava o "jogando" dos outros.
  expect(await gravarJogando(lucas, { nome: s('X'), loja: s('Steam'), capa: s('https://evil.example/x.jpg'), desde: i(1) })).toBe(403);
  expect(await gravarJogando(lucas, { nome: s('X'), loja: s('Steam'), desde: i(1), hack: s('sim') })).toBe(403);
  expect(await gravarJogando({ ...lucas, uid: ana.uid } as TestAccount, { nome: s('X'), loja: s('Steam'), desde: i(1) })).toBe(403);

  // --- regras: jogos do perfil -----------------------------------------------------
  const jogosDoLucas = {
    mapValue: {
      fields: {
        favorito: jogo('Terraria', { capa: CAPA(105600), nota: s('o melhor jogo de construir que existe') }),
        ultimamente: lista([
          jogo('Minecraft', { etiquetas: lista([s('Com amigos')]) }),
          jogo('Lethal Company', { capa: CAPA(1966720), etiquetas: lista([s('Casual')]) }),
          jogo('Hollow Knight', { capa: CAPA(367520), etiquetas: lista([s('Zerando')]) }),
        ]),
        quero: lista([jogo('Hollow Knight: Silksong', { capa: CAPA(1030300) })]),
      },
    },
  };
  expect(await patchComo(lucas, `users/${lucas.uid}`, ['jogos'], { jogos: jogosDoLucas })).toBe(200);
  const seis = lista(Array.from({ length: 6 }, (_, k) => jogo(`Jogo ${k}`)));
  expect(await patchComo(lucas, `users/${lucas.uid}`, ['jogos'], { jogos: { mapValue: { fields: { ultimamente: seis } } } })).toBe(403);
  expect(await patchComo(lucas, `users/${lucas.uid}`, ['jogos'], { jogos: { mapValue: { fields: { ultimamente: lista([jogo('A', { etiquetas: lista([s('Inventada')]) })]) } } } })).toBe(403);
  // Insígnia no cartão que não tem: recusado.
  expect(await patchComo(lucas, `users/${lucas.uid}`, ['insigniasNoCartao'], { insigniasNoCartao: lista([s('criador')]) })).toBe(403);

  // --- a lista de membros e a aba Agora -----------------------------------------------
  await page.reload();
  await page.locator(`.group-bar__button[data-group-id="${grupo}"]`).click();
  await page.getByRole('tab', { name: 'Membros' }).click();
  const linha = page.locator('.member', { hasText: 'Lucas jogos' });
  await expect(linha.locator('.jg-jogando')).toContainText('Jogando Lethal Company');
  await page.getByRole('tab', { name: 'Agora' }).click();
  await expect(page.locator('.jg-ag')).toContainText('Jogando agora — 1');
  await expect(page.locator('.jg-ag')).toContainText('Steam · há 23 min');
  await page.screenshot({ path: `${PASTA}/1-aba-agora.png` });

  // Parou de jogar: some.
  const apagar = await fetch(`${FS}/jogando/${lucas.uid}`, { method: 'DELETE', headers: { authorization: `Bearer ${lucas.idToken}` } });
  expect(apagar.ok).toBe(true);
  await expect(page.locator('.jg-ag')).toHaveCount(0);
  expect(await gravarJogando(lucas, { nome: s('Lethal Company'), loja: s('Steam'), steamId: i(1966720), capa: CAPA(1966720), desde: i(Date.now() - 23 * 60_000) })).toBe(200);
  await expect(page.locator('.jg-ag')).toBeVisible();

  // --- o cartão ----------------------------------------------------------------------
  await page.getByRole('tab', { name: 'Membros' }).click();
  await linha.click();
  const pop = page.locator('.person-popover');
  await expect(pop.locator('.jg-agora')).toContainText('Lethal Company');
  await expect(pop.locator('.jg-fav')).toContainText('o melhor jogo de construir que existe');
  await expect(pop.locator('.jg-fila .jg-capa')).toHaveCount(3);
  await page.screenshot({ path: `${PASTA}/2-cartao.png` });

  // --- o perfil completo ----------------------------------------------------------------
  await pop.getByRole('button', { name: 'Ver perfil completo' }).click();
  const perfil = page.locator('.pc');
  await expect(perfil.getByRole('tab', { name: 'Jogos' })).toHaveAttribute('aria-selected', 'true');
  await expect(perfil.locator('.jg-etq', { hasText: 'Zerando' })).toBeVisible();
  await expect(perfil).toContainText('Quero jogar · 1');
  await expect(perfil.getByRole('button', { name: 'Enviar mensagem' })).toBeVisible();
  await page.screenshot({ path: `${PASTA}/3-perfil-jogos.png` });
  await perfil.getByRole('tab', { name: 'Amigos em comum' }).click();
  await expect(perfil.locator('.pc__amigo')).toHaveCount(1);
  await expect(perfil.locator('.pc__amigo')).toContainText('Gabi jogos');
  await perfil.getByRole('tab', { name: 'Insígnias' }).click();
  await expect(perfil.locator('.ins-topo__conta')).toContainText('de 100');
  await page.keyboard.press('Escape');
  await expect(perfil).toHaveCount(0);

  // --- Configurações → Jogos ----------------------------------------------------------------
  await page.getByRole('button', { name: 'Configurações', exact: true }).click();
  await page.locator('.settings__nav-item', { hasText: 'Jogos' }).click();
  const cfg = page.locator('.settings__content');
  await expect(cfg.getByRole('heading', { name: 'Jogos' })).toBeVisible();
  // No navegador não tem como ver o jogo aberto: a chave fica desligada, com o aviso.
  await expect(cfg.getByRole('switch', { name: 'Mostrar o que estou jogando' })).toBeDisabled();
  await expect(cfg.locator('.jg-cfg__bloco--quero')).toBeVisible();

  // Favorito pelo catálogo.
  await cfg.getByPlaceholder('Procurar o seu jogo favorito').fill('terra');
  await cfg.locator('.jg-cfg__opcao', { hasText: 'Terraria' }).click();
  await cfg.getByLabel('Frase sobre o jogo favorito').fill('construir é vida');
  // Jogando ultimamente: um do catálogo e um digitado.
  await cfg.getByPlaceholder('Adicionar um jogo').fill('hollow');
  await expect(cfg.locator('.jg-cfg__opcao')).toHaveCount(3); // 2 jogos + "adicionar mesmo assim"
  await page.screenshot({ path: `${PASTA}/4-configuracoes-busca.png` });
  await cfg.locator('.jg-cfg__opcao', { hasText: 'Hollow Knight' }).first().click();
  await cfg.getByPlaceholder('Adicionar um jogo').fill('Jogo Inventado');
  await cfg.locator('.jg-cfg__outro').click();
  const hollow = cfg.locator('.jg-cfg__linha', { hasText: 'Hollow Knight' });
  await hollow.getByRole('button', { name: 'Zerando' }).click();
  await expect(hollow.getByRole('button', { name: 'Zerando' })).toHaveAttribute('aria-pressed', 'true');
  await expect(cfg.locator('.jg-cfg__titulo', { hasText: 'Jogando ultimamente' })).toContainText('2 de 5');
  // A prévia do cartão ao lado mostra o favorito.
  await expect(page.locator('.settings__preview .jg-fav')).toContainText('Terraria');

  await expect
    .poll(async () => JSON.stringify(await lerComoDono(`users/${ana.uid}`)), { timeout: 10_000 })
    .toContain('construir é vida');
  const salvo = JSON.stringify(await lerComoDono(`users/${ana.uid}`));
  expect(salvo).toContain('Jogo Inventado');
  expect(salvo).toContain('Zerando');
  expect(salvo).toContain('steam:367520');
  await page.screenshot({ path: `${PASTA}/5-configuracoes-jogos.png` });
  await ctx.close();
});

test('insígnias: o carteiro conta, não conta duas vezes, avisa no canto e as 5 do cartão', async ({ browser }) => {
  test.setTimeout(300_000);
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(20_000);
  await page.goto('/');
  await signInThroughUi(page, ana);
  await page.locator(`.group-bar__button[data-group-id="${grupo}"]`).click();

  // A conferida tem um intervalo mínimo de 10 s por pessoa: espera e abre o app de novo.
  await page.waitForTimeout(11_000);
  await page.reload();
  await page.locator(`.group-bar__button[data-group-id="${grupo}"]`).click();
  // Ao abrir, o carteiro confere (pioneiro, amigos, grupo criado…) e o aviso aparece no canto inferior direito.
  const aviso = page.locator('.ins-aviso').first();
  await expect(aviso).toBeVisible({ timeout: 20_000 });
  const caixa = await page.locator('.ins-avisos').boundingBox();
  expect(caixa!.x + caixa!.width).toBeGreaterThan(1400);
  expect(caixa!.y + caixa!.height).toBeGreaterThan(850);
  await expect.poll(() => ganhas(ana.uid!)).toEqual(expect.arrayContaining(['pioneiro', 'anfitriao', 'enturmado1']));
  await page.screenshot({ path: `${PASTA}/6-aviso.png` });

  // Mensagem: conta (o /avisar), e "Primeira mensagem" sai.
  await sendMessageThroughUi(page, 'kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk 🎮');
  await expect.poll(() => ganhas(ana.uid!), { timeout: 15_000 }).toEqual(expect.arrayContaining(['primeira', 'risada']));
  await expect(page.locator('.ins-aviso', { hasText: 'Primeira mensagem' }).or(page.locator('.ins-aviso', { hasText: 'Risada épica' })).first()).toBeVisible();
  expect((await contadores(ana.uid!))['mensagens']).toBe(1);

  // Regras: a Ana só mexe no avisadoAte; não se dá insígnia nem contador.
  expect(await patchComo(ana, `insignias/${ana.uid}`, ['tem.criador'], { tem: { mapValue: { fields: { criador: s('2026-01-01') } } } })).toBe(403);
  expect(await patchComo(ana, `insignias/${ana.uid}`, ['n.mensagens'], { n: { mapValue: { fields: { mensagens: i(99999) } } } })).toBe(403);
  expect(await patchComo(ana, `insignias/${ana.uid}`, ['avisadoAte'], { avisadoAte: s(new Date().toISOString()) })).toBe(200);
  expect((await fetch(`${FS}/insigniasInterno/${ana.uid}`, { headers: { authorization: `Bearer ${ana.idToken}` } })).status).toBe(403);

  // Reação do Lucas na mensagem da Ana: conta para os dois — e só uma vez.
  const geral = (await canaisDoGrupo(grupo)).find((c) => c.nome === 'geral')!;
  const msgs = await fetch(`${FS}:runQuery`, {
    method: 'POST',
    headers: { authorization: 'Bearer owner', 'content-type': 'application/json' },
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'messages' }], where: { fieldFilter: { field: { fieldPath: 'channelId' }, op: 'EQUAL', value: s(geral.id) } } } }),
  });
  const msgId = ((await msgs.json()) as { document?: { name: string } }[]).find((l) => l.document)!.document!.name.split('/').pop()!;
  expect(await patchComo(lucas, `messages/${msgId}`, [`reacoes.${lucas.uid}`], { reacoes: { mapValue: { fields: { [lucas.uid!]: lista([s('🔥')]) } } } })).toBe(200);
  await conquista(lucas, { evento: 'reagir', tipo: 'grupo', id: msgId, emoji: '🔥' });
  await conquista(lucas, { evento: 'reagir', tipo: 'grupo', id: msgId, emoji: '🔥' });
  // Reação que não existe não conta.
  await conquista(lucas, { evento: 'reagir', tipo: 'grupo', id: msgId, emoji: '😀' });
  expect((await contadores(lucas.uid!))['reacoesDadas']).toBe(1);
  expect((await contadores(ana.uid!))['reacoesRecebidas']).toBe(1);

  // Chamada: só conta quem está na sala de verdade.
  expect((await conquista(ana, { evento: 'voz' })).novas).toEqual([]);
  await comoDono(`voiceParticipants/salaX_${ana.uid}`, {
    channelId: 'salaX', groupId: grupo, uid: ana.uid!, sessionId: 't', joinedAt: new Date(Date.now() - 6 * 60_000).toISOString(), lastSeen: new Date().toISOString(),
  });
  const voz = await conquista(ana, { evento: 'voz' });
  expect(voz.novas).toContain('chamada');
  expect((await contadores(ana.uid!))['minutosVoz']).toBeGreaterThanOrEqual(5);

  // Jogo: conta o jogo do "jogando" (o PC do Lucas grava) e os jogos diferentes.
  await gravarJogando(lucas, { nome: s('Lethal Company'), loja: s('Steam'), desde: i(Date.now() - 30 * 60_000) });
  await conquista(lucas, { evento: 'jogo' });
  const nl = await contadores(lucas.uid!);
  expect(nl['jogosDiferentes']).toBe(1);
  expect(nl['lojas']).toBe(1);
  expect(nl['minutosJogo']).toBeGreaterThanOrEqual(6);
  expect(await ganhas(lucas.uid!)).toContain('jogador');

  // Amigos em comum: só pelo carteiro, e nunca a lista inteira dos amigos do outro.
  const comum = await fetch(`${CARTEIRO}/amigos-em-comum`, {
    method: 'POST',
    headers: { authorization: `Bearer ${ana.idToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ uid: lucas.uid }),
  });
  expect(((await comum.json()) as { amigos: { uid: string }[] }).amigos.map((a) => a.uid)).toEqual([gabi.uid]);

  // --- o meu perfil completo: aba Insígnias, a dica e as 5 do cartão ----------------------------
  await page.locator('.ins-aviso__fechar').first().click().catch(() => {});
  await page.getByRole('tab', { name: 'Membros' }).click();
  await page.locator('.member', { hasText: 'Ana jogos' }).click();
  await page.locator('.person-popover').getByRole('button', { name: 'Ver perfil completo' }).click();
  const perfil = page.locator('.pc');
  await perfil.getByRole('tab', { name: 'Insígnias' }).click();
  await expect(perfil.locator('.ins-topo__conta')).not.toContainText(/^0/);
  await perfil.locator('[data-insignia="tagarela1"]').hover();
  await expect(page.locator('.ins-dica')).toContainText('1 / 100');
  await page.screenshot({ path: `${PASTA}/7-perfil-insignias.png` });
  await perfil.getByRole('button', { name: 'Escolher as do cartão' }).click();
  await perfil.locator('[data-insignia="risada"]').click();
  await expect(perfil.locator('.pc__escolha')).toContainText(/de 5/);
  await perfil.getByRole('button', { name: 'Pronto' }).click();
  await expect.poll(async () => JSON.stringify(await lerComoDono(`users/${ana.uid}`))).toContain('insigniasNoCartao');
  await page.keyboard.press('Escape');

  // --- Notificações: mudar o canto --------------------------------------------------------------
  await page.getByRole('button', { name: 'Configurações', exact: true }).click();
  await page.locator('.settings__nav-item', { hasText: 'Notificações' }).click();
  await page.getByRole('radio', { name: 'Superior esquerdo' }).click();
  await page.getByRole('button', { name: 'Ver como fica' }).click();
  const canto = await page.locator('.ins-avisos').boundingBox();
  expect(canto!.x).toBeLessThan(40);
  expect(canto!.y).toBeLessThan(120);
  await page.screenshot({ path: `${PASTA}/8-canto.png` });
  await page.getByRole('radio', { name: 'Inferior direito' }).click();
  await page.keyboard.press('Escape');

  // --- celular: aviso na largura toda e o perfil em tela cheia ------------------------------------
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.evaluate(async () => {
    const m = await import('/src/components/insignias/insignias-ui.ts');
    const { POR_ID } = await import('/src/lib/insignias.ts');
    m.mostrarAvisoDeInsignia(POR_ID.get('tagarela5')!);
  });
  const cel = await page.locator('.ins-avisos').boundingBox();
  expect(cel!.width).toBeGreaterThan(360);
  await page.screenshot({ path: `${PASTA}/9-celular-aviso.png` });

  // Tocar no nome → cartão → perfil em tela cheia → Insígnias → tocar numa (abre a folha).
  await page.locator('.ins-aviso__fechar').first().click();
  await page.getByRole('button', { name: 'Abrir membros' }).click();
  await page.getByRole('tab', { name: 'Membros' }).click();
  await page.locator('.member', { hasText: 'Lucas jogos' }).click();
  await expect(page.locator('.person-popover .jg-agora')).toBeVisible();
  await page.screenshot({ path: `${PASTA}/10-celular-cartao.png` });
  await page.locator('.person-popover').getByRole('button', { name: 'Ver perfil completo' }).click();
  const tela = page.locator('.pc--celular');
  await expect(tela).toBeVisible();
  await expect(tela.getByRole('button', { name: 'Voltar' })).toBeVisible();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${PASTA}/11-celular-perfil-jogos.png` });
  await tela.getByRole('tab', { name: 'Insígnias' }).click();
  await page.screenshot({ path: `${PASTA}/12-celular-perfil-insignias.png` });
  await tela.locator('[data-insignia="tagarela2"]').click();
  await expect(page.locator('.ins-folha')).toContainText('0 / 1.000');
  await page.screenshot({ path: `${PASTA}/13-celular-folha.png` });
  await page.locator('.ins-folha').click();
  await tela.getByRole('button', { name: 'Voltar' }).click();
  await expect(tela).toHaveCount(0);
  await ctx.close();
});
