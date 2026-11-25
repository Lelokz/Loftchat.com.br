import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import {
  activeGroupId,
  createGroupThroughUi,
  limparTudo,
  newAccount,
  resolveTokens,
  signUpFromInviteUi,
  signUpThroughUi,
} from './helpers';
import type { TestAccount } from './helpers';
import { FS } from './carteiro-local';

/**
 * CÂMERA (0.9.5, etapas 1 e 2): ligar pela prévia, o vídeo chegar de verdade
 * na outra pessoa (câmera falsa do Chrome, sem som), foco, esconder quem está
 * sem câmera, desligar, e a permissão "Ligar câmera" valendo nas regras.
 */

const contas: TestAccount[] = [];
test.afterAll(async () => {
  await limparTudo(contas, 'câmera — limpeza');
});

/** O vídeo daquele bloco está mostrando imagem de verdade? */
async function temImagem(page: Page, seletor: string): Promise<boolean> {
  return page.locator(seletor).evaluate((v) => {
    const video = v as HTMLVideoElement;
    return video.videoWidth > 0 && video.readyState >= 2;
  });
}

test('câmera: prévia, vídeo chega no outro, foco, esconder, desligar e permissão', async ({ browser }) => {
  test.setTimeout(180_000);
  const dono = newAccount('Cam dono');
  const ana = newAccount('Cam Ana');
  contas.push(dono, ana);

  const ctxDono = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const pDono = await ctxDono.newPage();
  await pDono.goto('/');
  await signUpThroughUi(pDono, dono);
  await resolveTokens(dono);
  await createGroupThroughUi(pDono, 'Câmera');
  const grupo = await activeGroupId(pDono);
  await pDono.getByRole('button', { name: 'Opções do grupo' }).click();
  await pDono.getByRole('menuitem', { name: 'Convidar pessoas' }).click();
  const link = pDono.locator('.modal__link');
  await expect(link).toBeVisible({ timeout: 30_000 });
  const convite = new URL(await link.inputValue()).pathname;
  await pDono.getByRole('button', { name: 'Fechar' }).first().click();

  // A Ana "está no celular" (Android no navegador): ganha o botão de virar e
  // a pausa ao sair do app. Tela larga só para caber na foto.
  const ctxAna = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36',
  });
  const pAna = await ctxAna.newPage();
  await pAna.goto(convite);
  await signUpFromInviteUi(pAna, ana);
  await resolveTokens(ana);
  await pAna.getByRole('button', { name: 'Entrar no grupo' }).click({ timeout: 30_000 });
  await expect(pAna.locator('.channels__group-name')).toHaveText('Câmera', { timeout: 30_000 });

  for (const p of [pDono, pAna]) {
    await p.locator('.channels__body').getByRole('button', { name: 'Sala Principal' }).click();
    await expect(p.locator('.room__person')).toHaveCount(p === pDono ? 1 : 2, { timeout: 30_000 });
  }
  await expect(pDono.locator('.room__person')).toHaveCount(2, { timeout: 30_000 });

  // 1) A Ana liga a câmera: a prévia abre antes, e só liga ao confirmar.
  await pAna.locator('.room__controls').getByRole('button', { name: 'Ligar câmera' }).click();
  const previa = pAna.getByRole('dialog', { name: 'Ligar câmera' });
  await expect(previa).toBeVisible();
  await expect.poll(() => temImagem(pAna, '.cam-previa__video'), { timeout: 15_000 }).toBe(true);
  // Ninguém vê nada ainda.
  await expect(pDono.locator('.room__person.tem-camera')).toHaveCount(0);
  await pAna.screenshot({ path: 'test-results/camera/1-previa.png' });
  await previa.getByRole('button', { name: 'Ligar câmera' }).click();
  await expect(previa).toBeHidden({ timeout: 15_000 });

  // 2) O meu bloco mostra a minha câmera; o do dono recebe o vídeo DE VERDADE.
  const blocoAnaNaAna = pAna.locator(`.room__person[data-uid="${ana.uid}"]`);
  await expect(blocoAnaNaAna).toHaveClass(/tem-camera/);
  await expect.poll(() => temImagem(pAna, `.room__person[data-uid="${ana.uid}"] video`), { timeout: 15_000 }).toBe(true);
  await expect(pAna.locator('.room__controls').getByRole('button', { name: 'Desligar câmera' })).toBeVisible();

  const blocoAnaNoDono = pDono.locator(`.room__person[data-uid="${ana.uid}"]`);
  await expect(blocoAnaNoDono).toHaveClass(/tem-camera/, { timeout: 30_000 });
  await expect.poll(() => temImagem(pDono, `.room__person[data-uid="${ana.uid}"] video`), { timeout: 30_000 }).toBe(true);
  await pDono.screenshot({ path: 'test-results/camera/2-grade.png' });

  // 2b) Celular: virar a câmera continua ligado e mandando imagem.
  await pAna.locator('.room__controls').getByRole('button', { name: 'Virar a câmera' }).click();
  await expect.poll(() => temImagem(pDono, `.room__person[data-uid="${ana.uid}"] video`), { timeout: 30_000 }).toBe(true);

  // 2c) O app da Ana vai para trás: a câmera PAUSA (o dono vê o aviso) e volta.
  const mudarVisibilidade = (escondida: boolean) =>
    pAna.evaluate((e) => {
      Object.defineProperty(document, 'visibilityState', { value: e ? 'hidden' : 'visible', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    }, escondida);
  await mudarVisibilidade(true);
  await expect(blocoAnaNoDono.locator('.room__cam-pausada')).toBeVisible({ timeout: 30_000 });
  await pDono.screenshot({ path: 'test-results/camera/2c-pausada.png' });
  await mudarVisibilidade(false);
  await expect(blocoAnaNoDono.locator('.room__cam-pausada')).toHaveCount(0, { timeout: 30_000 });
  await expect.poll(() => temImagem(pDono, `.room__person[data-uid="${ana.uid}"] video`), { timeout: 30_000 }).toBe(true);

  // 3) Foco: clicar no bloco põe a câmera grande no palco; clicar de novo volta.
  await blocoAnaNoDono.click();
  await expect(pDono.locator('.room__foco')).toBeVisible();
  await expect.poll(() => temImagem(pDono, '.room__foco video'), { timeout: 15_000 }).toBe(true);
  await expect(pDono.locator('.room__people--fila .room__person')).toHaveCount(1);
  await pDono.screenshot({ path: 'test-results/camera/3-foco.png' });
  await pDono.locator('.room__foco').click();
  await expect(pDono.locator('.room__foco')).toHaveCount(0);

  // 4) Esconder quem está sem câmera (o dono está sem): sobra só a Ana.
  await pDono.getByRole('button', { name: 'Esconder quem está sem câmera' }).click();
  await expect(pDono.locator('.room__person')).toHaveCount(1);
  await pDono.getByRole('button', { name: 'Esconder quem está sem câmera' }).click();
  await expect(pDono.locator('.room__person')).toHaveCount(2);

  // 5) A Ana desliga: o bloco volta a ser a foto, nos dois.
  await pAna.locator('.room__controls').getByRole('button', { name: 'Desligar câmera' }).click();
  await expect(blocoAnaNaAna).not.toHaveClass(/tem-camera/);
  await expect(blocoAnaNoDono).not.toHaveClass(/tem-camera/, { timeout: 30_000 });

  // 6) Permissão: o @todos sem "Ligar câmera" → as regras recusam câmera ligada.
  const todos = await fetch(`${FS}/cargos/${grupo}_todos`, { headers: { authorization: 'Bearer owner' } }).then((r) => r.json()) as {
    fields?: { permissoes?: { arrayValue?: { values?: { stringValue: string }[] } } };
  };
  const atuais = (todos.fields?.permissoes?.arrayValue?.values ?? []).map((v) => v.stringValue);
  const semCamera = (atuais.length > 0 ? atuais : ['entrar', 'falar', 'ver-sala', 'ver-canal']).filter((p) => p !== 'camera');
  const r = await fetch(`${FS}/cargos/${grupo}_todos?updateMask.fieldPaths=permissoes&updateMask.fieldPaths=groupId`, {
    method: 'PATCH',
    headers: { authorization: 'Bearer owner', 'content-type': 'application/json' },
    body: JSON.stringify({ fields: { groupId: { stringValue: grupo }, permissoes: { arrayValue: { values: semCamera.map((p) => ({ stringValue: p })) } } } }),
  });
  expect(r.ok).toBe(true);
  const canal = await pAna.locator('.channel', { hasText: 'Sala Principal' }).first().getAttribute('data-channel-id');
  const tentar = (camera: boolean) =>
    fetch(`${FS}/voiceParticipants/${canal}_${ana.uid}?updateMask.fieldPaths=camera`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${ana.idToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ fields: { camera: { booleanValue: camera } } }),
    }).then((x) => x.status);
  expect(await tentar(true)).toBe(403);
  expect(await tentar(false)).toBe(200);

  await ctxDono.close();
  await ctxAna.close();
});
