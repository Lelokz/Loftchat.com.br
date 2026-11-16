import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import { createGroupThroughUi, limparTudo, newAccount, patchDocRawViaRest, readDocViaRest, resolveTokens, sendMessageThroughUi, signInThroughUi, signUpThroughUi } from './helpers';
import type { TestAccount } from './helpers';

/**
 * Proposta A, etapa 5a — aparência pessoal: tema, cor de destaque (pronta ou
 * livre), fonte do app e tamanho do texto. Prévia na hora, Desfazer volta,
 * Salvar guarda na conta e chega AO VIVO no outro aparelho.
 */

const accounts: TestAccount[] = [];

test.afterAll(async () => {
  await limparTudo(accounts, 'aparência — limpeza');
});

const tema = (page: Page) => page.evaluate(() => document.documentElement.dataset['tema'] ?? 'noite');
const varDaRaiz = (page: Page, nome: string) =>
  page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), nome);
const corDeFundo = (page: Page, seletor: string) =>
  page.locator(seletor).first().evaluate((n) => getComputedStyle(n).backgroundColor);

test('tema, cor, fonte e tamanho: prévia, desfazer, salvar e ao vivo no outro aparelho', async ({ browser }) => {
  test.setTimeout(180_000);
  const eu = newAccount('Aparencia');
  accounts.push(eu);
  const pc = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await pc.goto('/');
  await signUpThroughUi(pc, eu);
  await resolveTokens(eu);
  await createGroupThroughUi(pc, 'Cores');
  await sendMessageThroughUi(pc, 'mensagem para medir');
  const fundoDoChatAntes = await corDeFundo(pc, '.chat');

  // --- prévia e desfazer ---
  await pc.getByRole('button', { name: 'Configurações', exact: true }).click();
  const tela = pc.getByRole('dialog', { name: 'Configurações' });
  await tela.getByRole('button', { name: 'Aparência' }).click();
  const temas = tela.getByRole('radiogroup', { name: 'Tema' });
  await temas.getByRole('radio', { name: 'Claro' }).click();
  expect(await tema(pc)).toBe('claro');
  const barra = tela.getByRole('region', { name: 'Alterações não salvas' });
  await expect(barra).toBeVisible();
  await barra.getByRole('button', { name: 'Desfazer' }).click();
  expect(await tema(pc)).toBe('noite');
  await expect(barra).toBeHidden();

  // Fechar com prévia não salva: não fecha (a barra pisca), a prévia segue.
  await temas.getByRole('radio', { name: 'Oceano' }).click();
  await pc.keyboard.press('Escape');
  await expect(tela).toBeVisible();
  expect(await tema(pc)).toBe('oceano');

  // --- escolher tudo e salvar ---
  await temas.getByRole('radio', { name: 'Claro' }).click();
  await tela.getByRole('radiogroup', { name: 'Cor de destaque' }).getByRole('radio', { name: 'Verde' }).click();
  await tela.getByRole('radiogroup', { name: 'Fonte do app' }).getByRole('radio', { name: 'Leitura fácil' }).click();
  const regua = tela.getByRole('slider', { name: 'Tamanho do texto das mensagens' });
  await regua.focus();
  for (let i = 0; i < 3; i++) await pc.keyboard.press('ArrowRight'); // 14 → 15 → 16 → 18
  await expect(tela.locator('.aparencia-tamanho__valor')).toHaveText('18 px');
  // A prévia (classes reais do chat) já está no tamanho novo.
  await expect(tela.locator('.aparencia-previa .message__text').first()).toHaveCSS('font-size', '18px');
  await barra.getByRole('button', { name: 'Salvar' }).click();
  await expect(barra).toBeHidden();

  await expect
    .poll(async () => {
      const priv = await readDocViaRest(eu, `userPrivate/${eu.uid}`);
      const f = priv.fields?.['appearance']?.mapValue?.fields ?? {};
      return [f['theme']?.stringValue, f['accent']?.stringValue, f['font']?.stringValue, f['textSize']?.integerValue];
    })
    .toEqual(['claro', '#1a8562', 'leitura', '18']);

  await pc.keyboard.press('Escape');
  await expect(tela).toBeHidden();
  expect(await tema(pc)).toBe('claro');
  expect(await corDeFundo(pc, '.chat')).not.toBe(fundoDoChatAntes);
  await expect(pc.locator('.message__text').first()).toHaveCSS('font-size', '18px');
  expect(await pc.evaluate(() => getComputedStyle(document.body).fontFamily)).toContain('Atkinson');
  // O verde, já com o texto branco por cima (contraste garantido).
  expect(await varDaRaiz(pc, '--accent-on')).toBe('#ffffff');

  // --- o "celular": mesma conta, abre já no tema dela ---
  const cel = await (await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true })).newPage();
  await cel.goto('/');
  await signInThroughUi(cel, eu);
  await expect.poll(() => tema(cel)).toBe('claro');

  // Muda no PC → chega AO VIVO no celular, sem recarregar. Cor LIVRE amarela:
  // amarelo claro pede texto ESCURO por cima.
  await pc.getByRole('button', { name: 'Configurações', exact: true }).click();
  await tela.getByRole('button', { name: 'Aparência' }).click();
  await temas.getByRole('radio', { name: 'Floresta' }).click();
  await tela.getByLabel('Escolher outra cor').fill('#ffd400');
  await expect(tela.getByRole('radiogroup', { name: 'Cor de destaque' }).locator('[aria-checked="true"]')).toHaveClass(/aparencia-cores__livre/);
  await barra.getByRole('button', { name: 'Salvar' }).click();
  await expect(barra).toBeHidden();
  await expect.poll(() => tema(cel), { timeout: 15_000 }).toBe('floresta');
  await expect.poll(() => varDaRaiz(cel, '--accent-on')).toBe('#120d1f');
  expect(await varDaRaiz(cel, '--accent')).toBe('#ffd400');

  // Guardada no aparelho: recarregar já abre no tema (sem piscar o roxo).
  await pc.keyboard.press('Escape');
  await pc.reload();
  expect(await tema(pc)).toBe('floresta');

  // Sair da conta: a aparência dela não fica para a próxima pessoa.
  await pc.getByRole('button', { name: 'Configurações', exact: true }).click();
  await pc.getByRole('dialog', { name: 'Configurações' }).getByRole('button', { name: 'Sair da conta' }).click();
  await expect(pc.getByRole('button', { name: 'Entrar', exact: true })).toBeVisible({ timeout: 20_000 });
  expect(await tema(pc)).toBe('noite');
  expect(await varDaRaiz(pc, '--accent')).toBe('#7b3fe4');

  await pc.context().close();
  await cel.context().close();
});

test('mensagens: lista, minhas à esquerda e compacto (prévia e chat de verdade)', async ({ browser }) => {
  test.setTimeout(150_000);
  const eu = newAccount('Mensagens');
  accounts.push(eu);
  const pc = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await pc.goto('/');
  await signUpThroughUi(pc, eu);
  await resolveTokens(eu);
  await createGroupThroughUi(pc, 'Jeitos');
  await sendMessageThroughUi(pc, 'primeira minha');
  await sendMessageThroughUi(pc, 'segunda minha');

  const minha = pc.locator('.chat .message--mine').first();
  const balao = minha.locator('.message__bubble');
  // A coluna do chat (a lista de dentro é trocada quando uma mensagem é confirmada).
  const chat = pc.locator('main.chat');
  // A lista pode estar sendo redesenhada (mensagem recém-confirmada): mede de novo até achar.
  const xDoBalao = () => balao.boundingBox().then((b) => b?.x ?? -1);
  // Padrão: balão na cor de destaque, à direita, sem o meu avatar.
  await expect(minha.locator('.message__avatar--mine')).toBeHidden();
  const caixaChat = (await chat.boundingBox())!;
  await expect.poll(xDoBalao).toBeGreaterThan(caixaChat.x + caixaChat.width / 2);
  const ar = async () =>
    pc.locator('.chat .message--mine').nth(1).evaluate((n) => parseFloat(getComputedStyle(n).marginTop));
  const arConfortavel = await ar();

  await pc.getByRole('button', { name: 'Configurações', exact: true }).click();
  const tela = pc.getByRole('dialog', { name: 'Configurações' });
  await tela.getByRole('button', { name: 'Aparência' }).click();
  const lado = tela.getByRole('radiogroup', { name: 'Lado das suas mensagens' });

  // Balões, minhas à esquerda: meu avatar aparece e o balão vai para a esquerda.
  await lado.getByRole('radio', { name: 'À esquerda' }).click();
  expect(await pc.evaluate(() => document.documentElement.dataset['meuLado'])).toBe('esquerda');
  await expect(minha.locator('.message__avatar--mine')).toBeVisible();
  await expect.poll(xDoBalao).toBeGreaterThan(-1);
  await expect.poll(xDoBalao).toBeLessThan(caixaChat.x + 100);

  // Lista: sem caixa, o lado some (todas à esquerda).
  await tela.getByRole('radiogroup', { name: 'Jeito das mensagens' }).getByRole('radio', { name: /Lista/ }).click();
  await expect(lado).toBeHidden();
  expect(await pc.evaluate(() => document.documentElement.dataset['mensagens'])).toBe('lista');
  expect(await balao.evaluate((n) => getComputedStyle(n).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
  await expect(minha.locator('.message__avatar--mine')).toBeVisible();

  // Compacto: menos ar entre as mensagens do mesmo bloco.
  await tela.getByRole('radiogroup', { name: 'Espaçamento das mensagens' }).getByRole('radio', { name: 'Compacto' }).click();
  expect(await ar()).toBeLessThan(arConfortavel);

  await tela.getByRole('region', { name: 'Alterações não salvas' }).getByRole('button', { name: 'Salvar' }).click();
  await expect
    .poll(async () => {
      const priv = await readDocViaRest(eu, `userPrivate/${eu.uid}`);
      const f = priv.fields?.['appearance']?.mapValue?.fields ?? {};
      return [f['messageStyle']?.stringValue, f['mySide']?.stringValue, f['density']?.stringValue];
    })
    .toEqual(['lista', 'esquerda', 'compacto']);

  // Recarregar: continua em lista e compacto.
  await pc.keyboard.press('Escape');
  await pc.reload();
  await expect(pc.locator('.chat .message--mine').first()).toBeVisible({ timeout: 30_000 });
  expect(await pc.evaluate(() => [document.documentElement.dataset['mensagens'], document.documentElement.dataset['densidade']])).toEqual(['lista', 'compacto']);
  await pc.context().close();
});

async function imagemDeTeste(page: Page, cor: string): Promise<Buffer> {
  const base64 = await page.evaluate((c) => {
    const tela = document.createElement('canvas');
    tela.width = 1600;
    tela.height = 1000;
    const ctx = tela.getContext('2d')!;
    ctx.fillStyle = c;
    ctx.fillRect(0, 0, 1600, 1000);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(700, 400, 200, 200);
    return tela.toDataURL('image/png').split(',')[1]!;
  }, cor);
  return Buffer.from(base64, 'base64');
}

test('fundo do chat: geral, só de um canal (ganha do geral), escurecer, remover e a regra', async ({ browser }) => {
  test.setTimeout(150_000);
  const eu = newAccount('Fundo');
  accounts.push(eu);
  const pc = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await pc.goto('/');
  await signUpThroughUi(pc, eu);
  await resolveTokens(eu);
  await createGroupThroughUi(pc, 'Fundos');
  await sendMessageThroughUi(pc, 'olha o fundo');

  const tela = pc.getByRole('dialog', { name: 'Configurações' });
  const barra = tela.getByRole('region', { name: 'Alterações não salvas' });
  const fundoNaTela = () => pc.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--chat-fundo'));
  async function escolher(cor: string): Promise<void> {
    const escolha = pc.waitForEvent('filechooser');
    await tela.getByRole('button', { name: /^(Escolher|Trocar) fundo do chat$/ }).click();
    await (await escolha).setFiles({ name: 'fundo.png', mimeType: 'image/png', buffer: await imagemDeTeste(pc, cor) });
    const ajustador = pc.getByRole('dialog', { name: 'Ajustar fundo do chat' });
    await ajustador.getByRole('button', { name: 'Aplicar' }).click();
    await expect(ajustador).toBeHidden();
  }

  // --- geral ---
  await pc.getByRole('button', { name: 'Configurações', exact: true }).click();
  await tela.getByRole('button', { name: 'Aparência' }).click();
  await escolher('#1e3a8a');
  await expect(tela.locator('.aparencia-previa[data-fundo-chat]')).toHaveCount(1);
  const veu = tela.getByRole('slider', { name: 'Escurecer o fundo' });
  await veu.focus();
  await pc.keyboard.press('ArrowRight'); // 60 → 65
  await expect(tela.locator('output[for="aparencia-veu"]')).toHaveText('65%');
  await barra.getByRole('button', { name: 'Salvar' }).click();
  await expect(barra).toBeHidden();
  await expect
    .poll(async () => (await readDocViaRest(eu, `userPrivate/${eu.uid}/fundos/geral`)).fields?.['dim']?.integerValue)
    .toBe('65');
  await pc.keyboard.press('Escape');
  await expect.poll(fundoNaTela).toContain('data:image/');
  const geral = await fundoNaTela();
  expect(await pc.locator('.chat').evaluate((n) => getComputedStyle(n).backgroundImage)).toContain('url(');

  // --- só o #anúncios, pelo menu do canal ---
  await pc.locator('[data-channel-id]', { hasText: 'anúncios' }).click({ button: 'right' });
  await pc.locator('.context-menu').getByRole('menuitem', { name: 'Fundo deste canal' }).click();
  await expect(tela.getByRole('radiogroup', { name: 'Onde vale o fundo' }).getByRole('radio', { name: /Só #anúncios/ })).toHaveAttribute('aria-checked', 'true');
  await escolher('#b91c1c');
  await barra.getByRole('button', { name: 'Salvar' }).click();
  await expect(barra).toBeHidden();
  await pc.keyboard.press('Escape');

  await pc.locator('[data-channel-id]', { hasText: 'anúncios' }).click();
  await expect.poll(fundoNaTela).not.toBe(geral);
  await expect.poll(fundoNaTela).toContain('data:image/');
  await pc.locator('[data-channel-id]', { hasText: 'geral' }).click();
  await expect.poll(fundoNaTela).toBe(geral);
  // No Privado vale o geral.
  await pc.getByRole('button', { name: 'Privado' }).click();
  await expect.poll(fundoNaTela).toBe(geral);

  // --- a regra: imagem que não é imagem e véu acima de 90 são recusados ---
  expect(await patchDocRawViaRest(eu, `userPrivate/${eu.uid}/fundos/geral`, { image: { stringValue: 'javascript:alert(1)' }, dim: { integerValue: '50' } })).toBe(403);
  const img = (await readDocViaRest(eu, `userPrivate/${eu.uid}/fundos/geral`)).fields?.['image']?.stringValue ?? '';
  expect(await patchDocRawViaRest(eu, `userPrivate/${eu.uid}/fundos/geral`, { image: { stringValue: img }, dim: { integerValue: '95' } })).toBe(403);

  // --- remover o geral: some da tela (no Privado não sobra fundo) ---
  await pc.getByRole('button', { name: 'Configurações', exact: true }).click();
  await tela.getByRole('button', { name: 'Aparência' }).click();
  await expect(tela.getByRole('list', { name: 'Canais com fundo próprio' })).toContainText('#anúncios');
  await tela.getByRole('button', { name: 'Remover fundo do chat' }).click();
  await barra.getByRole('button', { name: 'Salvar' }).click();
  await expect(barra).toBeHidden();
  await pc.keyboard.press('Escape');
  await expect.poll(() => pc.evaluate(() => 'fundoChat' in document.documentElement.dataset)).toBe(false);
  await pc.context().close();
});

test('painel da direita: esconder pelo botão, quais abas e qual abre primeiro; no celular continua gaveta', async ({ browser }) => {
  test.setTimeout(150_000);
  const eu = newAccount('Painel');
  accounts.push(eu);
  const pc = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await pc.goto('/');
  await signUpThroughUi(pc, eu);
  await resolveTokens(eu);
  await createGroupThroughUi(pc, 'Painel');

  const painel = pc.locator('.app > .members');
  const abas = () => pc.locator('.group-panel__tab').allTextContents();
  await expect(painel).toBeVisible();
  expect(await abas()).toEqual(['Agora', 'Membros', 'Fixadas']);
  await expect(pc.locator('.group-panel__tab.is-active')).toHaveText('Membros');

  // Botão do cabeçalho: esconde na hora, o chat ocupa o espaço, e fica guardado.
  const botao = pc.getByRole('button', { name: 'Painel da direita' });
  await expect(botao).toHaveAttribute('aria-pressed', 'true');
  const larguraAntes = (await pc.locator('main.chat').boundingBox())!.width;
  await botao.click();
  await expect(painel).toBeHidden();
  await expect(botao).toHaveAttribute('aria-pressed', 'false');
  expect((await pc.locator('main.chat').boundingBox())!.width).toBeGreaterThan(larguraAntes + 200);
  await expect
    .poll(async () => (await readDocViaRest(eu, `userPrivate/${eu.uid}`)).fields?.['appearance']?.mapValue?.fields?.['panelHidden']?.booleanValue)
    .toBe(true);
  await botao.click();
  await expect(painel).toBeVisible();

  // Configurações: tira "Agora", abre em "Fixadas"; a última aba não desmarca.
  await pc.getByRole('button', { name: 'Configurações', exact: true }).click();
  const tela = pc.getByRole('dialog', { name: 'Configurações' });
  await tela.getByRole('button', { name: 'Aparência' }).click();
  const grupoDeAbas = tela.getByRole('group', { name: 'Abas do painel do grupo' });
  await grupoDeAbas.getByRole('checkbox', { name: 'Agora' }).click();
  await tela.getByRole('radiogroup', { name: 'Aba que abre primeiro' }).getByRole('radio', { name: 'Fixadas' }).click();
  await grupoDeAbas.getByRole('checkbox', { name: 'Membros' }).click();
  // A última que sobrou fica travada (marcada e desabilitada).
  await expect(grupoDeAbas.getByRole('checkbox', { name: 'Fixadas' })).toHaveAttribute('aria-checked', 'true');
  await expect(grupoDeAbas.getByRole('checkbox', { name: 'Fixadas' })).toHaveAttribute('aria-disabled', 'true');
  await grupoDeAbas.getByRole('checkbox', { name: 'Membros' }).click(); // volta
  await tela.getByRole('region', { name: 'Alterações não salvas' }).getByRole('button', { name: 'Salvar' }).click();
  await expect(tela.getByRole('region', { name: 'Alterações não salvas' })).toBeHidden();
  await pc.keyboard.press('Escape');
  await expect.poll(abas).toEqual(['Membros', 'Fixadas']);
  await expect(pc.locator('.group-panel__tab.is-active')).toHaveText('Fixadas');

  // Recarregar: abre direto em Fixadas, sem Agora.
  await pc.reload();
  await expect(painel).toBeVisible({ timeout: 30_000 });
  await expect.poll(abas).toEqual(['Membros', 'Fixadas']);
  await expect(pc.locator('.group-panel__tab.is-active')).toHaveText('Fixadas');

  // Celular: sem o botão de esconder; o painel abre pela gaveta, com as mesmas abas.
  const cel = await (await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true })).newPage();
  await cel.goto('/');
  await signInThroughUi(cel, eu);
  await expect(cel.getByRole('button', { name: 'Painel da direita' })).toBeHidden();
  await cel.getByRole('button', { name: 'Abrir membros' }).click();
  await expect.poll(() => cel.locator('.group-panel__tab').allTextContents()).toEqual(['Membros', 'Fixadas']);
  await pc.context().close();
  await cel.context().close();
});
