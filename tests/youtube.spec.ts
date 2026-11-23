import { expect, test } from '@playwright/test';

import { createGroupThroughUi, limparTudo, newAccount, sendMessageThroughUi, signUpThroughUi } from './helpers';
import type { TestAccount } from './helpers';

/**
 * PRÉVIA DO YOUTUBE (0.5.0): link de vídeo vira cartão (thumb, título,
 * canal), sem play; clicar abre o vídeo fora. O YouTube é simulado aqui.
 */

const accounts: TestAccount[] = [];
test.afterAll(async () => {
  await limparTudo(accounts, 'youtube — limpeza');
});

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

test('youtube: cartão com thumb, título e canal, nos formatos de link do dia a dia', async ({ page }) => {
  await page.route('https://www.youtube.com/oembed**', (rota) => {
    const url = new URL(rota.request().url()).searchParams.get('url') ?? '';
    const id = /v=([\w-]{11})/.exec(url)?.[1];
    return rota.fulfill({
      json: { title: `Título do ${id}`, author_name: `Canal do ${id}` },
      headers: { 'access-control-allow-origin': '*' },
    });
  });
  await page.route('https://i.ytimg.com/**', (rota) => rota.fulfill({ body: PNG, contentType: 'image/png' }));

  const conta = newAccount('YouTube');
  accounts.push(conta);
  await page.goto('/');
  await signUpThroughUi(page, conta);
  await createGroupThroughUi(page, 'Grupo do YouTube');

  const casos: [string, string][] = [
    ['olha isso https://youtu.be/dQw4w9WgXcQ kkk', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/watch?v=aaaaaaaaaa1&t=42s', 'aaaaaaaaaa1'],
    ['short: https://youtube.com/shorts/bbbbbbbbbb2', 'bbbbbbbbbb2'],
    ['https://m.youtube.com/watch?feature=share&v=ccccccccc_3', 'ccccccccc_3'],
  ];
  for (const [texto, id] of casos) {
    await sendMessageThroughUi(page, texto);
    const cartao = page.locator(`.youtube[data-youtube="${id}"]`);
    await expect(cartao).toBeVisible({ timeout: 15_000 });
    await expect(cartao.locator('.youtube__titulo')).toHaveText(`Título do ${id}`);
    await expect(cartao.locator('.youtube__canal')).toHaveText(`Canal do ${id}`);
    await expect(cartao).toHaveAttribute('href', `https://www.youtube.com/watch?v=${id}`);
    await expect(cartao).toHaveAttribute('target', '_blank');
    // Sem play dentro: só a imagem, nada de vídeo nem iframe.
    await expect(cartao.locator('video, iframe')).toHaveCount(0);
  }
  // Link que não é de vídeo: sem cartão.
  await sendMessageThroughUi(page, 'https://www.youtube.com/@RickAstleyYT');
  await expect(page.locator('.message__text', { hasText: '@RickAstleyYT' })).toBeVisible();
  await expect(page.locator('.youtube')).toHaveCount(casos.length);
  await page.screenshot({ path: 'test-results/youtube/pc.png' });
});
