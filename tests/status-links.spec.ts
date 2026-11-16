import { expect, test } from '@playwright/test';

import {
  createGroupThroughUi,
  limparTudo,
  newAccount,
  patchDocRawViaRest,
  readDocViaRest,
  resolveTokens,
  sendMessageThroughUi,
  signUpFromInviteUi,
  signUpThroughUi,
} from './helpers';
import type { TestAccount } from './helpers';

/**
 * Proposta A, etapa 2d — status com emoji e prazo, links no perfil e cor do
 * nome nas mensagens.
 */

const accounts: TestAccount[] = [];

test.afterAll(async () => {
  await limparTudo(accounts, 'status e links — limpeza');
});

test('status com emoji e prazo, links e cor do nome: a prévia mostra, salva, e o outro vê', async ({ browser }) => {
  test.setTimeout(150_000);
  const dono = newAccount('Dono status');
  const amigo = newAccount('Amigo status');
  accounts.push(dono, amigo);

  const pDono = await (await browser.newContext()).newPage();
  await pDono.goto('/');
  await signUpThroughUi(pDono, dono);
  await resolveTokens(dono);
  await createGroupThroughUi(pDono, 'Grupo status');
  await pDono.getByRole('button', { name: 'Opções do grupo' }).click();
  await pDono.getByRole('menuitem', { name: 'Convidar pessoas' }).click();
  const link = pDono.locator('.modal__link');
  await expect(link).toBeVisible({ timeout: 30_000 });
  const convite = new URL(await link.inputValue()).pathname;
  await pDono.getByRole('button', { name: 'Fechar' }).first().click();

  const pAmigo = await (await browser.newContext()).newPage();
  await pAmigo.goto(convite);
  await signUpFromInviteUi(pAmigo, amigo);
  await pAmigo.getByRole('button', { name: 'Entrar no grupo' }).click({ timeout: 30_000 });
  await expect(pAmigo.locator('.channels__group-name')).toHaveText('Grupo status', { timeout: 30_000 });

  // --- Configurações do dono ---
  await pDono.getByRole('button', { name: 'Configurações', exact: true }).click();
  const conf = pDono.getByRole('dialog', { name: 'Configurações' });
  await expect(conf.getByLabel('Nome de exibição')).toBeVisible({ timeout: 15_000 });
  const previa = conf.locator('.settings__preview');

  // Status: emoji pela grade (abre embaixo, sem janela por cima), texto e prazo.
  await conf.getByRole('button', { name: 'Escolher emoji do status' }).click();
  await expect(pDono.getByRole('dialog')).toHaveCount(1);
  await conf.getByRole('button', { name: '🎮' }).click();
  await conf.getByLabel('Status', { exact: true }).fill('jogando Minecraft');
  await conf.getByLabel('Limpar o status depois de').selectOption('1h');
  await expect(previa.locator('.person-card__status')).toHaveText('🎮jogando Minecraft');

  // Links: sem https vira https; http vira https; texto que não é link avisa e trava o salvar.
  await conf.getByLabel('Link 1').fill('youtube.com/@lelokz');
  await conf.getByLabel('Link 2').fill('isso não é link');
  await conf.getByLabel('Link 3').fill('http://exemplo.com.br/loja');
  await conf.getByLabel('Link 2').blur();
  await expect(conf.locator('#settings-link-1-aviso')).toHaveText('Esse link não parece um endereço de site.');
  await expect(previa.locator('.person-card__link')).toHaveText(['youtube.com/@lelokz', 'exemplo.com.br/loja']);

  // Cor do nome: a mensagem de mentira da prévia já pinta.
  await conf.getByRole('radiogroup', { name: 'Cor do nome nas mensagens' }).getByRole('radio', { name: 'Verde' }).click();
  await expect(previa.locator('.settings__msg-name')).toHaveCSS('color', 'rgb(92, 214, 176)');

  const barra = conf.getByRole('region', { name: 'Alterações não salvas' });
  await barra.getByRole('button', { name: 'Salvar' }).click();
  await expect(conf.locator('.settings__error')).toHaveText('Esse link não parece um endereço de site.');
  await conf.getByLabel('Link 2').fill('');
  await barra.getByRole('button', { name: 'Salvar' }).click();
  await expect(barra).toBeHidden({ timeout: 15_000 });

  // Depois de salvo, o prazo vira "Manter (até HH:MM)".
  await expect(conf.getByLabel('Limpar o status depois de')).toHaveValue('manter');

  const perfil = await readDocViaRest(dono, `users/${dono.uid}`);
  const status = perfil.fields?.['customStatus']?.mapValue?.fields;
  expect(status?.['emoji']?.stringValue).toBe('🎮');
  expect(status?.['text']?.stringValue).toBe('jogando Minecraft');
  const ate = Number(status?.['until']?.integerValue);
  expect(Math.abs(ate - (Date.now() + 3_600_000))).toBeLessThan(5 * 60_000);
  expect(perfil.fields?.['links']?.arrayValue?.values?.map((v: { stringValue?: string }) => v.stringValue)).toEqual([
    'https://youtube.com/@lelokz',
    'https://exemplo.com.br/loja',
  ]);
  expect(perfil.fields?.['nameColor']?.stringValue).toBe('verde');

  await pDono.keyboard.press('Escape');
  await expect(conf).toBeHidden();
  await sendMessageThroughUi(pDono, 'oi com nome verde');

  // --- O amigo vê: status na lista de membros, nome verde, cartão com links ---
  const membro = pAmigo.locator('.member', { hasText: dono.displayName });
  await expect(membro.locator('.member__status')).toHaveText('🎮jogando Minecraft', { timeout: 15_000 });
  const autor = pAmigo.locator('.message', { hasText: 'oi com nome verde' }).locator('.message__author');
  await expect(autor).toHaveCSS('color', 'rgb(92, 214, 176)', { timeout: 15_000 });

  await autor.click();
  const cartao = pAmigo.getByRole('dialog', { name: `Perfil de ${dono.displayName}` });
  await expect(cartao.locator('.person-card__status')).toHaveText('🎮jogando Minecraft', { timeout: 15_000 });
  const links = cartao.locator('.person-card__link');
  await expect(links).toHaveCount(2);
  await expect(links.first()).toHaveAttribute('href', 'https://youtube.com/@lelokz');
  await expect(links.first()).toHaveAttribute('target', '_blank');
  await expect(links.first()).toHaveAttribute('rel', /noopener/);
  await pAmigo.keyboard.press('Escape');

  // --- Status vencido some sozinho (prazo no passado, gravado pela REST) ---
  expect(
    await patchDocRawViaRest(dono, `users/${dono.uid}`, {
      customStatus: {
        mapValue: {
          fields: {
            emoji: { stringValue: '😴' },
            text: { stringValue: 'dormindo' },
            until: { integerValue: String(Date.now() - 1000) },
          },
        },
      },
    }),
  ).toBe(200);
  await expect(membro.locator('.member__name')).toBeVisible();
  await expect(membro.locator('.member__status')).toHaveCount(0, { timeout: 15_000 });

  await pDono.context().close();
  await pAmigo.context().close();
});

test('a REGRA recusa status, links e cor do nome fora do formato', async ({ browser }) => {
  test.setTimeout(90_000);
  const a = newAccount('Regra status');
  accounts.push(a);
  const page = await (await browser.newContext()).newPage();
  await page.goto('/');
  await signUpThroughUi(page, a);
  await resolveTokens(a);
  const meu = `users/${a.uid}`;
  const s = (v: string) => ({ stringValue: v });
  const status = (fields: Record<string, unknown>) => ({ customStatus: { mapValue: { fields } } });
  const links = (...ls: string[]) => ({ links: { arrayValue: { values: ls.map(s) } } });

  // Cor do nome: só a lista fechada.
  expect(await patchDocRawViaRest(a, meu, { nameColor: s('#ff0000') })).toBe(403);
  expect(await patchDocRawViaRest(a, meu, { nameColor: s('azul') })).toBe(200);

  // Status: texto até 60, prazo inteiro, só as três chaves.
  expect(await patchDocRawViaRest(a, meu, status({ emoji: s('🎮'), text: s('x'.repeat(61)), until: { integerValue: '0' } }))).toBe(403);
  expect(await patchDocRawViaRest(a, meu, status({ emoji: s('🎮'), text: s('oi'), until: s('amanhã') }))).toBe(403);
  expect(await patchDocRawViaRest(a, meu, status({ emoji: s('🎮'), text: s('oi'), until: { integerValue: '0' }, cor: s('x') }))).toBe(403);
  expect(await patchDocRawViaRest(a, meu, status({ emoji: s('🎮'), text: s('oi'), until: { integerValue: '0' } }))).toBe(200);

  // Links: até 3, só https, sem espaço nem < > ".
  expect(await patchDocRawViaRest(a, meu, links('javascript:alert(1)'))).toBe(403);
  expect(await patchDocRawViaRest(a, meu, links('http://site.com'))).toBe(403);
  expect(await patchDocRawViaRest(a, meu, links('https://a.com/"><script>'))).toBe(403);
  expect(await patchDocRawViaRest(a, meu, links('https://a.com', 'https://b.com', 'https://c.com', 'https://d.com'))).toBe(403);
  expect(await patchDocRawViaRest(a, meu, links(`https://a.com/${'x'.repeat(200)}`))).toBe(403);
  expect(await patchDocRawViaRest(a, meu, links('https://a.com', 'https://b.com/@x'))).toBe(200);

  await page.context().close();
});
