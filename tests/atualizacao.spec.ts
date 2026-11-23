import { expect, test } from '@playwright/test';

import { limparTudo, newAccount, signUpThroughUi } from './helpers';
import type { TestAccount } from './helpers';

/**
 * ATUALIZAÇÃO (17/11/2026): a faixa "Atualização disponível" e
 * Configurações → Sobre o Loftchat.
 *
 * O programa é de mentira (um `window.loftDesktop` que o teste comanda) e a
 * lista de novidades do GitHub também (`page.route`) — nada sai para a
 * internet.
 */

const accounts: TestAccount[] = [];

test.afterAll(async () => {
  await limparTudo(accounts, 'atualização — limpeza');
});

async function abrirSobre(page: import('@playwright/test').Page): Promise<void> {
  await page.getByRole('button', { name: 'Configurações', exact: true }).first().click();
  await page.getByRole('button', { name: 'Sobre o Loftchat' }).click();
  await expect(page.getByRole('heading', { name: 'Sobre o Loftchat' })).toBeVisible();
}

test('site: Sobre mostra a versão e as novidades, sem nada para atualizar', async ({ page }) => {
  const conta = newAccount('Sobre site');
  accounts.push(conta);
  await page.goto('/');
  await signUpThroughUi(page, conta);
  await abrirSobre(page);
  await expect(page.locator('.sobre__numero')).toContainText(/Versão \d+\.\d+\.\d+ \(beta\) · site/);
  await expect(page.getByText('No site você sempre usa a versão mais nova.')).toBeVisible();
  await expect(page.locator('.sobre__versao').first()).toContainText('Versão');
  await expect(page.locator('.update-bar')).toHaveCount(0);
});

test('programa: acha a versão nova, baixa, avisa; Depois some; Sobre instala', async ({ page }) => {
  const conta = newAccount('Sobre programa');
  accounts.push(conta);

  // As novidades vêm do novidades.json da etiqueta (0.5.5: não da API, que tem limite).
  await page.route('https://raw.githubusercontent.com/Lelokz/Loftchat.com.br/v9.9.0/novidades.json', (rota) =>
    rota.fulfill({
      json: [
        { versao: '9.9.0', data: '2099-01-01', itens: ['Coisa nova um', 'Coisa nova dois'] },
        { versao: '0.2.0', data: '2026-11-17', itens: ['Velha'] },
      ],
    }),
  );
  await page.addInitScript(() => {
    const ouvintes: Record<string, (v: unknown) => void> = {};
    (window as unknown as { __programa: unknown }).__programa = {
      disparar: (qual: string, valor: unknown) => ouvintes[qual]?.(valor),
      atualizou: 0,
    };
    (window as unknown as { loftDesktop: unknown }).loftDesktop = {
      fontesDeTela: async () => [],
      escolherFonte: async () => {},
      ligarAudioDoPc: async () => false,
      soltarAudioDoPc: async () => {},
      desligarAudioDoPc: async () => {},
      versao: async () => '0.2.0',
      atualizacaoPronta: async () => null,
      aoAtualizacaoPronta: (f: (v: unknown) => void) => (ouvintes['pronta'] = f),
      aoAtualizacaoDisponivel: (f: (v: unknown) => void) => (ouvintes['disponivel'] = f),
      aoProgressoDaAtualizacao: (f: (v: unknown) => void) => (ouvintes['progresso'] = f),
      procurarAtualizacao: async () => null,
      atualizarAgora: async () => {
        (window as unknown as { __programa: { atualizou: number } }).__programa.atualizou++;
      },
    };
  });
  const disparar = (qual: string, valor: unknown) =>
    page.evaluate(([q, v]) => (window as unknown as { __programa: { disparar: (q: unknown, v: unknown) => void } }).__programa.disparar(q, v), [qual, valor] as const);

  await page.goto('/');
  await signUpThroughUi(page, conta);

  // O programa acha a 9.9.0 e baixa: a faixa mostra quanto já veio.
  await disparar('disponivel', '9.9.0');
  await disparar('progresso', 40);
  const faixa = page.locator('.update-bar');
  await expect(faixa).toContainText('Baixando a atualização · versão 9.9.0 · 40%');
  await expect(faixa.getByRole('button', { name: 'Atualizar' })).toBeDisabled();

  // Baixou: "Atualização disponível" com o botão Atualizar.
  await disparar('pronta', '9.9.0');
  await expect(faixa).toContainText('Atualização disponível · versão 9.9.0');
  await expect(faixa.getByRole('button', { name: 'Atualizar' })).toBeEnabled();
  await page.screenshot({ path: 'test-results/atualizacao/faixa.png' });

  // Depois: a faixa some e o chat segue funcionando.
  await faixa.getByRole('button', { name: 'Depois' }).click();
  await expect(faixa).toHaveCount(0);
  await expect(page.locator('#join-code')).toBeEditable();

  // Em Configurações → Sobre: a versão nova, o que mudou nela e Instalar.
  await abrirSobre(page);
  await expect(page.locator('.sobre__numero')).toContainText('Versão 0.2.0 (beta) · programa do computador');
  await expect(page.getByText('Versão 9.9.0 disponível')).toBeVisible();
  await expect(page.locator('.sobre__versao').first()).toContainText('Coisa nova um');
  await expect(page.locator('.sobre__versao').first()).toContainText('ainda não instalada');
  await page.screenshot({ path: 'test-results/atualizacao/sobre.png' });
  await page.getByRole('button', { name: 'Instalar atualização' }).click();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __programa: { atualizou: number } }).__programa.atualizou))
    .toBe(1);
  await expect(page.getByRole('button', { name: 'Reiniciando…' })).toBeVisible();
});
