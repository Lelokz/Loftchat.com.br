import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import {
  activeGroupId,
  createGroupThroughUi,
  limparTudo,
  newAccount,
  openCreateGroupDialog,
  resolveTokens,
  sendMessageThroughUi,
  signUpThroughUi,
  writeMessageAt,
} from './helpers';
import type { TestAccount } from './helpers';

/**
 * Etapa 20 — identidade visual. O que é COMPORTAMENTO da identidade e dá para
 * medir sem olho humano: a transição entre telas existe e não deixa rastro, o
 * movimento reduzido desliga tudo, a mensagem nova chega animada e o
 * histórico não, e a fixada vira bilhete. Se ficou bonito, não é teste — é o
 * Leo olhando as capturas.
 */

const accounts: TestAccount[] = [];

function track(label: string): TestAccount {
  const account = newAccount(label);
  accounts.push(account);
  return account;
}

test.afterAll(async () => {
  await limparTudo(accounts, 'identidade — limpeza');
});

/**
 * Registra, a partir de agora, cada fantasma de transição que entra e sai do
 * <body> — com o instante, e com o que dá para ver dele de fora.
 */
async function vigiarFantasmas(page: Page): Promise<void> {
  // Começa do zero: um fantasma de antes (o modal que acabou de fechar) não
  // pode entrar na conta desta troca.
  await expect(page.locator('.view-ghost')).toHaveCount(0);
  await page.evaluate(() => {
    const w = window as unknown as { __fantasmas: Array<Record<string, unknown>> };
    w.__fantasmas = [];
    new MutationObserver((mudancas) => {
      for (const m of mudancas) {
        m.addedNodes.forEach((n) => {
          if (n instanceof HTMLElement && n.classList.contains('view-ghost')) {
            w.__fantasmas.push({
              ev: 'entrou',
              t: performance.now(),
              ariaHidden: n.getAttribute('aria-hidden'),
              inert: n.inert,
              // shadow root FECHADO: de fora, `shadowRoot` é null.
              shadowAberto: n.shadowRoot !== null,
            });
          }
        });
        m.removedNodes.forEach((n) => {
          if (n instanceof HTMLElement && n.classList.contains('view-ghost')) {
            w.__fantasmas.push({ ev: 'saiu', t: performance.now() });
          }
        });
      }
    }).observe(document.body, { childList: true });
  });
}

async function fantasmas(page: Page): Promise<Array<Record<string, unknown>>> {
  return page.evaluate(() => (window as unknown as { __fantasmas: Array<Record<string, unknown>> }).__fantasmas);
}

test('troca de visão: a tela velha esmaece por cima da nova e some; com movimento reduzido, troca seca', async ({
  page,
}) => {
  const conta = track('transicao');
  await page.goto('/');
  await signUpThroughUi(page, conta);
  await createGroupThroughUi(page, 'Grupo da transição');

  await vigiarFantasmas(page);
  await page.getByRole('button', { name: 'Privado', exact: true }).click();
  // A tela nova chega na hora — a transição não segura a troca.
  await expect(page.locator('.home-column')).toBeVisible();

  // O fantasma entra e sai sozinho, e some do DOM.
  await expect.poll(async () => (await fantasmas(page)).filter((f) => f.ev === 'saiu').length).toBeGreaterThan(0);
  await expect(page.locator('.view-ghost')).toHaveCount(0);
  const registro = await fantasmas(page);
  const entradas = registro.filter((f) => f.ev === 'entrou');
  expect(entradas.length).toBeGreaterThan(0);
  for (const f of entradas) {
    expect(f.ariaHidden).toBe('true');
    expect(f.inert).toBe(true);
    expect(f.shadowAberto).toBe(false);
  }
  // Vida do primeiro fantasma: os 200 ms da transição, com folga para a máquina.
  const vida = (registro.find((f) => f.ev === 'saiu')!.t as number) - (entradas[0]!.t as number);
  expect(vida).toBeGreaterThanOrEqual(150);
  expect(vida).toBeLessThan(2_000);

  // Movimento reduzido: nenhuma cópia, troca instantânea.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await vigiarFantasmas(page);
  await page.locator('.group-bar__button').first().click();
  await expect(page.locator('.channels__group-name')).toHaveText('Grupo da transição');
  await page.getByRole('button', { name: 'Privado', exact: true }).click();
  await expect(page.locator('.home-column')).toBeVisible();
  expect(await fantasmas(page)).toEqual([]);
});

test('modal entra esmaecendo; ao fechar sai do DOM na hora e quem esmaece é um fantasma', async ({ page }) => {
  const conta = track('modal');
  await page.goto('/');
  await signUpThroughUi(page, conta);

  const dialog = await openCreateGroupDialog(page);
  await expect(dialog).toHaveCSS('opacity', '1');
  expect(await dialog.evaluate((n) => getComputedStyle(n).transitionProperty)).toContain('opacity');

  await vigiarFantasmas(page);
  await dialog.getByRole('button', { name: 'Cancelar' }).click();
  // O <dialog> sai do DOM no instante em que fecha, como antes da etapa 20:
  // quem abre outro modal logo em seguida acha um só.
  await expect(page.locator('dialog')).toHaveCount(0);
  await expect.poll(async () => (await fantasmas(page)).map((f) => f.ev)).toEqual(['entrou', 'saiu']);
  const [entrou] = await fantasmas(page);
  expect(entrou!.shadowAberto).toBe(false);
  expect(entrou!.inert).toBe(true);
});

/**
 * Registra cada `.message` que recebe animação (a chegada 1 usa
 * `element.animate`), pelo texto dela — a partir de agora.
 */
async function vigiarChegadas(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __chegadas: string[]; __animateOriginal?: typeof Element.prototype.animate };
    w.__chegadas = [];
    if (w.__animateOriginal === undefined) {
      const original = Element.prototype.animate;
      w.__animateOriginal = original;
      Element.prototype.animate = function (this: Element, ...args: Parameters<typeof original>) {
        if (this.classList.contains('message')) {
          w.__chegadas.push(this.querySelector('.message__text')?.textContent ?? '?');
        }
        return original.apply(this, args);
      };
    }
  });
}

async function chegadas(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __chegadas: string[] }).__chegadas);
}

test('mensagem nova ao vivo chega animada; abrir canal e carregar o histórico não animam', async ({ page }) => {
  test.setTimeout(120_000);
  const conta = track('chegada');
  await page.goto('/');
  await signUpThroughUi(page, conta);
  await createGroupThroughUi(page, 'Grupo da chegada');
  await resolveTokens(conta);
  const groupId = await activeGroupId(page);
  const geral = page.locator('.channel.is-active');
  const geralId = (await geral.getAttribute('data-channel-id')) ?? '';
  const outro = page.locator('.channel[data-channel-id]:not(.is-active)').first();
  const outroId = (await outro.getAttribute('data-channel-id')) ?? '';
  expect(geralId).not.toBe('');
  expect(outroId).not.toBe('');

  // 55 mensagens antigas no OUTRO canal: mais que a janela de 50.
  const base = Date.now() - 60 * 60_000;
  for (let i = 0; i < 55; i += 1) {
    const status = await writeMessageAt(conta, {
      groupId,
      channelId: outroId,
      body: `antiga ${i}`,
      sentAt: new Date(base + i * 60_000).toISOString(),
    });
    expect(status).toBe(200);
  }

  await vigiarChegadas(page);

  // 1. Minha, pela tela.
  await sendMessageThroughUi(page, 'oi, cheguei');
  await expect(page.getByText('oi, cheguei', { exact: true })).toBeVisible();
  await expect.poll(() => chegadas(page)).toEqual(['oi, cheguei']);

  // 2. De fora, ao vivo (como se fosse outra pessoa noutra aba).
  expect(
    await writeMessageAt(conta, { groupId, channelId: geralId, body: 'vinda de fora', sentAt: new Date().toISOString() }),
  ).toBe(200);
  await expect(page.getByText('vinda de fora', { exact: true })).toBeVisible();
  await expect.poll(() => chegadas(page)).toEqual(['oi, cheguei', 'vinda de fora']);

  // 3. Abrir um canal: as 50 mais novas aparecem SEM animação.
  await vigiarChegadas(page);
  await outro.click();
  await expect(page.getByText('antiga 54', { exact: true })).toBeVisible();
  await expect(page.locator('.message')).toHaveCount(50);

  // 4. Histórico: rolar ao topo traz as 5 restantes, também sem animação.
  await page.locator('.messages').evaluate((node) => {
    node.scrollTop = 0;
  });
  await expect(page.locator('.message')).toHaveCount(55, { timeout: 30_000 });
  expect(await chegadas(page)).toEqual([]);

  // 5. Movimento reduzido: chega, mas sem animação.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await sendMessageThroughUi(page, 'sem movimento');
  await expect(page.getByText('sem movimento', { exact: true })).toBeVisible();
  expect(await chegadas(page)).toEqual([]);
});

test('fixada vira bilhete com fita, e o clique ainda leva até a mensagem', async ({ page }) => {
  const conta = track('bilhete');
  await page.goto('/');
  await signUpThroughUi(page, conta);
  await createGroupThroughUi(page, 'Grupo do bilhete');
  await sendMessageThroughUi(page, 'sábado 20h na casa da Carol');
  const mensagem = page.locator('.message', { hasText: 'sábado 20h na casa da Carol' });
  await expect(mensagem).toBeVisible();

  await mensagem.click({ button: 'right' });
  await page.locator('.context-menu').getByRole('menuitem', { name: 'Fixar mensagem' }).click();
  await page.locator('.chat__pin-button').click();
  const bilhete = page.getByRole('dialog').locator('.pinned-item');
  await expect(bilhete).toHaveCount(1);

  // O papel, a tinta e a inclinação do lab (-2°: cos 0.999391, sin -0.0348995).
  await expect(bilhete).toHaveCSS('background-color', 'rgb(255, 241, 168)');
  await expect(bilhete).toHaveCSS('color', 'rgb(74, 59, 18)');
  await expect(bilhete).toHaveCSS('transform', 'matrix(0.999391, -0.0348995, 0.0348995, 0.999391, 0, 0)');
  // A fita existe (pseudo-elemento, sem nó novo no DOM).
  const fita = await bilhete.evaluate((n) => {
    const s = getComputedStyle(n, '::before');
    return { content: s.content, largura: s.width, altura: s.height };
  });
  expect(fita).toEqual({ content: '""', largura: '52px', altura: '16px' });

  // Clicar no bilhete continua levando até a mensagem original.
  await bilhete.click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(mensagem).toHaveClass(/is-highlighted/);
});
