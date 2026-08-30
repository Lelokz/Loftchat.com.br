import { test } from '@playwright/test';

import {
  createGroupThroughUi,
  limparTudo,
  newAccount,
  signUpThroughUi,
} from './helpers';
import type { TestAccount } from './helpers';

/**
 * Captura as telas nos dois temas, para revisão visual humana.
 *
 * Não é asserção de nada — é material para alguém olhar. Roda separado da
 * suíte (`npx playwright test screenshots`) e limpa a conta que criar.
 */

const accounts: TestAccount[] = [];

test.afterAll(async () => {
  await limparTudo(accounts, "capturas — limpeza");
});

for (const theme of ['light', 'dark'] as const) {
  test(`capturas — tema ${theme}`, async ({ page }) => {
    const account = newAccount(`shot-${theme}`);
    accounts.push(account);

    await page.emulateMedia({ colorScheme: theme });
    await page.goto('/');

    // 1. tela de login
    await page.screenshot({ path: `screenshots/${theme}-1-login.png` });

    // 2. cadastro → estado vazio
    await signUpThroughUi(page, account);
    await page.screenshot({ path: `screenshots/${theme}-2-sem-grupos.png` });

    // 3. app com grupo e canais, lendo #geral, sem chamada
    await createGroupThroughUi(page, 'Amigos da Casa');
    await page.waitForTimeout(800);

    // Algumas mensagens reais, para a lista não sair vazia nas capturas.
    // Se o índice não estiver pronto, a captura mostra o aviso — que também é
    // informação útil.
    for (const texto of [
      'Bom dia! Subi o protótipo novo ontem à noite.',
      'A coluna de canais ficou bem mais respirada.',
      'Concordo. Vou levar o resto pra thread do #design.',
    ]) {
      await page.locator('.composer__input').fill(texto);
      await page.locator('.composer__input').press('Enter');
      await page.waitForTimeout(400);
    }
    await page.waitForTimeout(600);
    await page.screenshot({ path: `screenshots/${theme}-3-app.png` });

    // 4. a sala de voz ocupando a área central
    await page.locator('.channels__body').getByRole('button', { name: 'Sala Principal' }).click();
    await page.locator('.room').waitFor({ timeout: 15_000 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `screenshots/${theme}-4-sala-voz.png` });

    // 4b. transmitindo: o palco avisa e a miniatura confirma O QUE está indo
    await page.getByRole('button', { name: 'Compartilhar tela' }).click();
    await page.locator('.room__preview').waitFor({ timeout: 30_000 });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `screenshots/${theme}-4b-transmitindo.png` });
    await page.getByRole('button', { name: 'Parar de transmitir' }).click();
    await page.waitForTimeout(400);

    // 5. de volta ao chat, ainda conectado: a faixa no rodapé da coluna
    await page.getByRole('button', { name: 'anúncios' }).click();
    await page.locator('.callbar').waitFor({ timeout: 15_000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `screenshots/${theme}-5-faixa-conectado.png` });

    // 6. menu do grupo aberto
    await page.locator('.callbar').getByRole('button', { name: 'Desconectar' }).click();
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: 'Opções do grupo' }).click();
    await page.waitForTimeout(200);
    await page.screenshot({ path: `screenshots/${theme}-6-menu.png` });
    await page.keyboard.press('Escape');

    // 7. menu de contexto numa mensagem — precisa voltar para o canal que TEM
    //    mensagens; o roteiro parou em #anúncios, que está vazio.
    await page.getByRole('button', { name: 'geral' }).click();
    await page.locator('.message').last().waitFor({ timeout: 15_000 });
    await page.locator('.message').last().click({ button: 'right' });
    await page.locator('.context-menu').waitFor({ timeout: 15_000 });
    await page.waitForTimeout(200);
    await page.screenshot({ path: `screenshots/${theme}-7-menu-contexto.png` });
    await page.keyboard.press('Escape');

    // 8. modal de convite com o link pronto
    await page.getByRole('button', { name: 'Opções do grupo' }).click();
    await page.getByRole('menuitem', { name: 'Convidar pessoas' }).click();
    await page.locator('.modal__link').waitFor({ timeout: 30_000 });
    await page.screenshot({ path: `screenshots/${theme}-8-convite.png` });
  });
}
