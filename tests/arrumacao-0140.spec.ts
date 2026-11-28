import { expect, test } from '@playwright/test';

import { createAccountViaRest, createGroupThroughUi, limparTudo, newAccount, resolveTokens, signUpThroughUi } from './helpers';
import type { TestAccount } from './helpers';
import { FS, comoDono, ligarCarteiroLocal } from './carteiro-local';

/**
 * 0.14.0 — ARRUMAÇÃO:
 *   - o "Meu perfil" do canto de baixo não mostra cargos, "+" nem Membro desde
 *     (isso é só no cartão aberto de dentro do grupo);
 *   - o X do perfil completo fica fora da área de arrastar a janela;
 *   - ver a senha (olhinho) no login;
 *   - sair só pelas Configurações, com confirmação (o botão do canto sumiu);
 *   - barras de rolagem escondidas, com opção em Aparência;
 *   - Insígnias nas Configurações;
 *   - fixar conversas do privado.
 */

const PASTA = 'test-results/arrumacao-0140';
const contas: TestAccount[] = [];
test.skip(process.env['FIRESTORE_EMULATOR_HOST'] === undefined, 'só no emulador');
let desligar: (() => void) | undefined;
test.beforeAll(async () => {
  test.setTimeout(90_000);
  desligar = await ligarCarteiroLocal();
});
test.afterAll(async () => {
  desligar?.();
  await limparTudo(contas, 'arrumação 0.14.0 — limpeza');
});

const s = (v: string): Record<string, string> => ({ stringValue: v });

async function conversaCom(eu: TestAccount, outro: TestAccount, quando: string, texto: string): Promise<void> {
  const fio = [eu.uid!, outro.uid!].sort().join('_');
  const membros = { arrayValue: { values: fio.split('_').map((u) => s(u)) } };
  for (const [col, extra] of [
    ['friendships', { from: s(eu.uid!), to: s(outro.uid!), status: s('accepted'), createdAt: s(quando) }],
    ['dmThreads', { lastMessageAt: s(quando), lastMessage: { mapValue: { fields: { body: s(texto), authorId: s(outro.uid!), sentAt: s(quando) } } } }],
  ] as const) {
    const r = await fetch(`${FS}/${col}/${fio}`, {
      method: 'PATCH',
      headers: { authorization: 'Bearer owner', 'content-type': 'application/json' },
      body: JSON.stringify({ fields: { members: membros, ...extra } }),
    });
    expect(r.ok).toBe(true);
  }
}

test('0.14.0: meu perfil, olhinho, sair, barras, insígnias e fixar conversas', async ({ browser }) => {
  test.setTimeout(240_000);
  const ana = newAccount('Ana');
  ana.displayName = 'Ana';
  const beto = newAccount('Beto');
  const carla = newAccount('Carla');
  contas.push(ana, beto, carla);
  for (const [c, nome] of [[beto, 'Beto'], [carla, 'Carla']] as const) {
    await createAccountViaRest(c);
    await comoDono(`users/${c.uid}`, { uid: c.uid!, displayName: nome, initials: nome.slice(0, 2).toUpperCase(), username: `t${c.uid!.slice(0, 10).toLowerCase()}`, createdAt: new Date().toISOString() });
  }

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(20_000);
  await page.goto('/');

  // OLHINHO: mostra e esconde a senha, sem tirar o foco do campo.
  const senha = page.locator('#auth-current-password');
  await senha.fill('segredo123');
  await expect(senha).toHaveAttribute('type', 'password');
  await page.getByRole('button', { name: 'Mostrar a senha' }).first().click();
  await expect(senha).toHaveAttribute('type', 'text');
  await page.screenshot({ path: `${PASTA}/1-olhinho.png` });
  await page.getByRole('button', { name: 'Esconder a senha' }).first().click();
  await expect(senha).toHaveAttribute('type', 'password');
  await senha.fill('');

  await signUpThroughUi(page, ana);
  await resolveTokens(ana);

  // SAIR não fica mais no canto de baixo.
  await expect(page.locator('.session-footer').getByRole('button', { name: 'Sair da conta' })).toHaveCount(0);

  // BARRAS DE ROLAGEM: escondidas por padrão.
  const barra = async (): Promise<string> => page.evaluate(() => getComputedStyle(document.querySelector('.home-column__body, .channels__body, body')!).scrollbarWidth);
  expect(await barra()).toBe('none');

  // MEU PERFIL dentro de um grupo (com um cargo criado): sem cargos, sem "+", sem Membro desde.
  await createGroupThroughUi(page, 'Grupo da arrumação');
  await page.getByRole('button', { name: 'Opções do grupo' }).click();
  await page.getByRole('menuitem', { name: 'Configurações do grupo' }).click();
  const cfg = page.getByRole('dialog', { name: 'Configurações do grupo' });
  await cfg.getByRole('button', { name: 'Cargos' }).click();
  await cfg.getByRole('button', { name: '+ Criar cargo' }).click();
  await expect(cfg.getByRole('tab', { name: 'Aparência' })).toHaveAttribute('aria-selected', 'true', { timeout: 20_000 });
  await cfg.getByLabel('Nome do cargo').fill('Moderador');
  await cfg.getByRole('region', { name: 'Alterações não salvas' }).getByRole('button', { name: 'Salvar' }).click();
  await expect(cfg.getByRole('region', { name: 'Alterações não salvas' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(cfg).toHaveCount(0);

  await page.locator('.session-footer').getByRole('button', { name: 'Meu perfil' }).click();
  const pop = page.locator('.person-popover');
  await expect(pop).toBeVisible();
  await expect(pop.locator('.perfil-servidor')).toHaveCount(0);
  await expect(pop.getByRole('button', { name: 'Dar cargo' })).toHaveCount(0);
  await expect(pop).not.toContainText('Membro desde');
  await page.screenshot({ path: `${PASTA}/2-meu-perfil-do-canto.png` });
  await page.keyboard.press('Escape');
  await expect(pop).toHaveCount(0);

  // ...e pela lista de membros do grupo, o dono continua vendo tudo.
  const membros = page.locator('.app > .members');
  await membros.getByRole('tab', { name: 'Membros' }).click();
  await membros.locator('.member', { hasText: 'Ana' }).first().click();
  await expect(pop).toBeVisible();
  await expect(pop.getByRole('button', { name: 'Dar cargo' })).toBeVisible();
  await expect(pop.locator('.perfil-servidor__desde').last()).toContainText('criou o grupo');
  await page.keyboard.press('Escape');

  // O X do perfil completo: fora da área de arrastar (regra de estilo).
  const regiao = await page.evaluate(() => {
    document.documentElement.classList.add('janela-propria');
    const d = document.createElement('div');
    d.className = 'pfc';
    document.body.append(d);
    const v = getComputedStyle(d).getPropertyValue('-webkit-app-region') || getComputedStyle(d).getPropertyValue('app-region');
    d.remove();
    document.documentElement.classList.remove('janela-propria');
    return v;
  });
  expect(regiao).toBe('no-drag');

  // INSÍGNIAS nas Configurações.
  await page.getByRole('button', { name: 'Configurações', exact: true }).first().click();
  const tela = page.getByRole('dialog', { name: 'Configurações' });
  await tela.getByRole('button', { name: 'Insígnias', exact: true }).click();
  await expect(tela.getByRole('heading', { name: 'Insígnias' })).toBeVisible();
  await expect(tela.getByRole('button', { name: 'Escolher as do cartão' })).toBeVisible({ timeout: 20_000 });
  await expect(tela.locator('.ins-grade__item').first()).toBeVisible();
  await page.screenshot({ path: `${PASTA}/3-insignias-nas-configuracoes.png` });

  // BARRAS: ligar em Aparência → finas.
  await tela.getByRole('button', { name: 'Aparência' }).click();
  await tela.getByRole('radiogroup', { name: 'Barras de rolagem' }).getByRole('radio', { name: 'Mostrar' }).click();
  await expect.poll(barra).toBe('thin');
  await tela.getByRole('radiogroup', { name: 'Barras de rolagem' }).getByRole('radio', { name: 'Escondidas' }).click();
  await expect.poll(barra).toBe('none');

  // SAIR com confirmação: cancelar fica logado.
  await tela.getByRole('button', { name: 'Sair da conta' }).click();
  const confirmar = page.getByRole('dialog', { name: 'Sair da conta?' });
  await expect(confirmar).toBeVisible();
  await page.screenshot({ path: `${PASTA}/4-sair-confirmar.png` });
  await confirmar.getByRole('button', { name: 'Cancelar' }).click();
  await expect(confirmar).toHaveCount(0);
  await page.keyboard.press('Escape');

  // FIXAR CONVERSAS: a Carla é a mais recente; fixar o Beto põe ele no topo.
  await conversaCom(ana, beto, new Date(Date.now() - 60_000).toISOString(), 'oi, beto aqui');
  await conversaCom(ana, carla, new Date().toISOString(), 'oi, carla aqui');
  await page.getByRole('button', { name: /^Privado/ }).first().click();
  const linhas = page.locator('.home-column__dm');
  await expect(linhas).toHaveCount(2, { timeout: 30_000 });
  await expect(linhas.first()).toHaveAttribute('data-friend-uid', carla.uid!);
  const linhaBeto = page.locator(`.home-column__dm[data-friend-uid="${beto.uid}"]`);
  await linhaBeto.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Fixar conversa' }).click();
  await expect(linhas.first()).toHaveAttribute('data-friend-uid', beto.uid!);
  await expect(linhaBeto.locator('.home-column__fixada')).toBeVisible();
  await page.screenshot({ path: `${PASTA}/5-fixada.png` });
  // Fica na conta: recarregar mantém.
  await page.reload();
  await page.getByRole('button', { name: /^Privado/ }).first().click();
  await expect(linhas.first()).toHaveAttribute('data-friend-uid', beto.uid!, { timeout: 30_000 });
  // Desafixar volta à ordem normal.
  await linhaBeto.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Desafixar conversa' }).click();
  await expect(linhas.first()).toHaveAttribute('data-friend-uid', carla.uid!);
  await ctx.close();
});
