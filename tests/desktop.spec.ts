import { _electron as electron, expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { execFileSync, spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  createGroupThroughUi,
  limparTudo,
  newAccount,
  sendMessageThroughUi,
  signInThroughUi,
  signUpFromInviteUi,
  signUpThroughUi,
} from './helpers';
import type { TestAccount } from './helpers';
import { MEDIA_ARGS } from '../playwright.config';

/**
 * Janela do Loft (desktop/, Electron) — etapa 1 do app de computador.
 *
 * A janela é aberta de verdade, apontada para o Vite do teste (que já está
 * dentro do emulador), com uma pasta de dados descartável.
 */

const PASTA = join(import.meta.dirname, '..', 'desktop');
const BINARIO = join(
  PASTA,
  'node_modules',
  'electron',
  'dist',
  process.platform === 'win32' ? 'electron.exe' : 'electron',
);

test.skip(!existsSync(BINARIO), 'Electron não instalado em desktop/');

/*
 * MUDO, SEMPRE. O Xvfb esconde a tela, não o som: o microfone falso bipa, e
 * numa chamada entre a janela e o navegador o bipe sai no alto-falante de
 * verdade (aconteceu em 15/11/2026).
 */
test.use({ launchOptions: { args: MEDIA_ARGS } });

const accounts: TestAccount[] = [];
let app: ElectronApplication;
let janela: Page;
let dados: string;

test.beforeEach(async ({ baseURL }) => {
  dados = mkdtempSync(join(process.env['LOFT_TMP'] ?? tmpdir(), 'loft-janela-'));
  // O terminal do VS Code define ELECTRON_RUN_AS_NODE, que faz o Electron
  // rodar como Node em vez de abrir janela.
  const { ELECTRON_RUN_AS_NODE: _fora, ...ambiente } = process.env;
  /*
   * O microfone falso esconde TODOS os dispositivos de áudio, inclusive o
   * microfone virtual do venmic. O teste do som do PC abre sem ele, com o
   * microfone padrão apontado para o alto-falante de mentira (nunca o
   * microfone de verdade da máquina), e a saída também para lá. Esse teste
   * não tem ninguém na chamada: o Loft só toca o silêncio que o teste manda.
   */
  const semFalso = test.info().titlePath.includes('som do PC no Linux');
  app = await electron.launch({
    executablePath: BINARIO,
    args: semFalso ? [PASTA] : [PASTA, '--use-fake-device-for-media-stream', '--mute-audio'],
    env: {
      ...ambiente,
      LOFT_URL: baseURL!,
      LOFT_DADOS: dados,
      // O tom de teste toca num alto-falante de mentira, que não é o padrão.
      LOFT_AUDIO_TESTE: '1',
      ...(semFalso
        ? { PULSE_SOURCE: 'loft-teste-mudo.monitor', PULSE_SINK: 'loft-teste-mudo' }
        : {}),
    } as Record<string, string>,
  });
  janela = await app.firstWindow();
  if (!semFalso) {
    // Segunda trava de silêncio: toda página da janela nasce muda.
    const mudo = await app.evaluate(({ app: eletron, webContents }) => {
      eletron.on('web-contents-created', (_evento, conteudo) => conteudo.setAudioMuted(true));
      for (const conteudo of webContents.getAllWebContents()) conteudo.setAudioMuted(true);
      return eletron.commandLine.hasSwitch('mute-audio');
    });
    expect(mudo, 'a janela de teste precisa abrir muda').toBe(true);
  }
});

test.afterEach(async () => {
  await app.close();
  rmSync(dados, { recursive: true, force: true });
});

test.afterAll(async () => {
  await limparTudo(accounts, 'desktop — limpeza');
});

test('a janela abre o Loft', async () => {
  await expect(janela.getByRole('button', { name: 'Entrar', exact: true })).toBeVisible({
    timeout: 30_000,
  });
  expect(await janela.title()).toContain('Loft');
  // Sem barra de menu do Electron.
  expect(await app.evaluate(({ Menu }) => Menu.getApplicationMenu())).toBeNull();
});

test('janela e navegador conversam: a mesma conta troca mensagens nos dois sentidos', async ({
  browser,
}) => {
  const conta = newAccount('Janela');
  accounts.push(conta);

  await signUpThroughUi(janela, conta);
  await createGroupThroughUi(janela, 'Grupo da janela');
  await sendMessageThroughUi(janela, 'oi da janela');
  await expect(janela.getByText('oi da janela')).toBeVisible();

  const contexto = await browser.newContext();
  const navegador = await contexto.newPage();
  await navegador.goto('/');
  await signInThroughUi(navegador, conta);
  await expect(navegador.locator('.channels__group-name')).toHaveText('Grupo da janela', {
    timeout: 30_000,
  });
  await expect(navegador.getByText('oi da janela')).toBeVisible({ timeout: 15_000 });
  // A ponte da janela só existe na janela.
  expect(await navegador.evaluate(() => 'loftDesktop' in window)).toBe(false);
  expect(await janela.evaluate(() => 'loftDesktop' in window)).toBe(true);

  await sendMessageThroughUi(navegador, 'oi do navegador');
  await expect(janela.getByText('oi do navegador')).toBeVisible({ timeout: 15_000 });

  await contexto.close();
});

test('link de fora abre no navegador, e o microfone funciona dentro do Loft', async () => {
  await expect(janela.getByRole('button', { name: 'Entrar', exact: true })).toBeVisible({
    timeout: 30_000,
  });

  await app.evaluate(({ shell }) => {
    const abertos: string[] = [];
    (globalThis as unknown as { abertos: string[] }).abertos = abertos;
    shell.openExternal = async (url: string) => {
      abertos.push(url);
    };
  });

  await janela.evaluate(() => window.open('https://example.com/fora', '_blank'));
  await expect
    .poll(() => app.evaluate(() => (globalThis as unknown as { abertos: string[] }).abertos))
    .toEqual(['https://example.com/fora']);
  expect(app.windows()).toHaveLength(1);

  const temAudio = await janela.evaluate(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const ok = stream.getAudioTracks().length > 0;
    stream.getTracks().forEach((t) => t.stop());
    return ok;
  });
  expect(temAudio).toBe(true);
});

/* --- etapa 2: seletor de tela ------------------------------------------- */

/** Uma segunda janela, com cor chapada, para ter o que transmitir. */
async function abrirPalco(): Promise<void> {
  /*
   * Numa tela sem gerenciador de janelas (xvfb-run puro) o Electron não lista
   * NADA — o próprio Electron pula esse caso nos testes dele. Rode via
   * scripts/tela-de-teste.sh, que sobe o metacity junto.
   */
  const fontes = await app.evaluate(async ({ desktopCapturer }) =>
    (await desktopCapturer.getSources({ types: ['screen'] })).length,
  );
  test.skip(fontes === 0, 'tela sem gerenciador de janelas: use scripts/tela-de-teste.sh');

  await app.evaluate(({ BrowserWindow }) => {
    const palco = new BrowserWindow({ width: 640, height: 360, x: 0, y: 0 });
    void palco.loadURL(
      'data:text/html,<title>PalcoDeTeste</title><body style="margin:0;background:%2333aa77"></body>',
    );
  });
  await expect.poll(() => app.windows().length).toBe(2);
}

async function entrarNaSala(pagina: Page): Promise<void> {
  await pagina.locator('.channels__body').getByRole('button', { name: 'Sala Principal' }).click();
  await expect(pagina.locator('.room')).toBeVisible({ timeout: 30_000 });
}

test('seletor: mostra telas e janelas, esconde a própria janela do Loft, e desistir não transmite', async () => {
  const conta = newAccount('Seletor');
  accounts.push(conta);
  await signUpThroughUi(janela, conta);
  await createGroupThroughUi(janela, 'Grupo seletor');
  await abrirPalco();
  await entrarNaSala(janela);

  await janela.getByRole('button', { name: 'Compartilhar tela' }).click();
  const seletor = janela.getByRole('dialog');
  await expect(seletor.getByRole('heading', { name: 'Compartilhar tela' })).toBeVisible();
  await expect(seletor.locator('.screen-picker__heading', { hasText: 'Telas' })).toBeVisible({
    timeout: 15_000,
  });
  await expect(seletor.locator('.screen-picker__card', { hasText: 'PalcoDeTeste' })).toBeVisible();
  // A janela do Loft não aparece: transmitir ela mesma vira túnel.
  const titulo = await janela.title();
  await expect(seletor.locator('.screen-picker__card', { hasText: titulo })).toHaveCount(0);

  // Sem escolher, o botão fica travado.
  await expect(seletor.getByRole('button', { name: 'Transmitir' })).toBeDisabled();
  await seletor.locator('.screen-picker__card', { hasText: 'PalcoDeTeste' }).click();
  await expect(seletor.getByRole('button', { name: 'Transmitir' })).toBeEnabled();

  // Desistir fecha sem transmitir e sem mensagem de erro.
  await seletor.getByRole('button', { name: 'Cancelar' }).click();
  await expect(seletor).toBeHidden();
  await expect(janela.locator('.room__preview')).toHaveCount(0);
  await expect(janela.locator('.toast')).toHaveCount(0);

  // E depois de desistir, um getDisplayMedia por fora não pega tela nenhuma.
  const recusado = await janela.evaluate(() =>
    navigator.mediaDevices.getDisplayMedia({ video: true }).then(
      () => 'capturou',
      (erro: Error) => erro.name,
    ),
  );
  expect(recusado).not.toBe('capturou');
});

test.describe('seletor: transmitir pela janela', () => {
  // Mesmo defeito conhecido da etapa 9 (vídeo que às vezes não chega na
  // negociação inicial) — ver loft.spec.ts, "chegada da faixa de vídeo".
  test.describe.configure({ retries: 2 });

  test('a janela transmite outra janela pelo seletor e o amigo no navegador recebe o vídeo', async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const dono = newAccount('Dono janela');
    const amigo = newAccount('Amigo navegador');
    accounts.push(dono, amigo);

    await signUpThroughUi(janela, dono);
    await createGroupThroughUi(janela, 'Grupo tela');
    await janela.getByRole('button', { name: 'Opções do grupo' }).click();
    await janela.getByRole('menuitem', { name: 'Convidar pessoas' }).click();
    const link = janela.locator('.modal__link');
    await expect(link).toBeVisible({ timeout: 30_000 });
    const convite = new URL(await link.inputValue()).pathname;
    await janela.getByRole('button', { name: 'Fechar' }).first().click();

    const contexto = await browser.newContext();
    const navegador = await contexto.newPage();
    await navegador.goto(convite);
    await signUpFromInviteUi(navegador, amigo);
    await navegador.getByRole('button', { name: 'Entrar no grupo' }).click({ timeout: 30_000 });
    await expect(navegador.locator('.channels__group-name')).toHaveText('Grupo tela', {
      timeout: 30_000,
    });

    await abrirPalco();
    await entrarNaSala(janela);
    await entrarNaSala(navegador);
    await expect(janela.locator('#voice-audio audio')).toHaveCount(1, { timeout: 30_000 });
    await expect(navegador.locator('#voice-audio audio')).toHaveCount(1, { timeout: 30_000 });
    // Na janela, a voz dos outros toca sozinha: sem o aviso de áudio bloqueado.
    await expect(janela.getByText('bloqueou o áudio automático')).toHaveCount(0);

    await janela.getByRole('button', { name: 'Compartilhar tela' }).click();
    const seletor = janela.getByRole('dialog');
    await seletor.locator('.screen-picker__card', { hasText: 'PalcoDeTeste' }).click();
    await seletor.getByRole('button', { name: 'Transmitir' }).click();
    await expect(seletor).toBeHidden();

    // Quem transmite vê a miniatura, com o nome da janela escolhida.
    await expect(janela.locator('.room__preview')).toBeVisible({ timeout: 30_000 });
    await expect(janela.locator('.room__preview-label')).toContainText('PalcoDeTeste');

    // O amigo recebe pixel de verdade.
    await expect(navegador.locator('.room__video-slot video')).toBeVisible({ timeout: 60_000 });
    await expect
      .poll(
        () =>
          navegador.evaluate(
            () => document.querySelector<HTMLVideoElement>('.room__video-slot video')?.videoWidth ?? 0,
          ),
        { timeout: 60_000, message: 'o vídeo precisa ter dimensão real' },
      )
      .toBeGreaterThan(0);

    await janela.getByRole('button', { name: 'Parar de transmitir' }).click();
    await expect(janela.locator('.room__preview')).toHaveCount(0, { timeout: 15_000 });
    await contexto.close();
  });
});

/* --- etapa 3: som do PC no Linux (venmic) -------------------------------- */

/*
 * SEM SOM NENHUM SAIR. O tom de teste toca num alto-falante DE MENTIRA
 * (null sink do PipeWire), com ligação automática DESLIGADA: ele só é ligado,
 * à mão, a esse ralo. Antes de seguir, o teste confere que o tom não está
 * ligado a mais nada.
 */
const RALO = 'loft-teste-mudo';

interface NoPw {
  id: number;
  type: string;
  info?: {
    props?: Record<string, string | number>;
    'output-node-id'?: number;
    'input-node-id'?: number;
  };
}

function pwDump(): NoPw[] {
  return JSON.parse(execFileSync('pw-dump', { encoding: 'utf-8' })) as NoPw[];
}

function idsDoNo(nome: string): number[] {
  return pwDump()
    .filter((o) => o.type === 'PipeWire:Interface:Node' && o.info?.props?.['node.name'] === nome)
    .map((o) => o.id);
}

/** Quem está ligado em quem: pares [nó de saída, nó de entrada]. */
function ligacoes(): Array<[number, number]> {
  return pwDump()
    .filter((o) => o.type === 'PipeWire:Interface:Link')
    .map((o) => [o.info?.['output-node-id'] ?? -1, o.info?.['input-node-id'] ?? -1]);
}

function apagarRalo(): void {
  for (const id of idsDoNo(RALO)) execFileSync('pw-cli', ['destroy', String(id)]);
}

/** WAV de 60 s, 440 Hz, baixinho — para o analisador ter o que medir. */
function tomDeTeste(pasta: string): string {
  const taxa = 48000;
  const amostras = taxa * 60;
  const wav = Buffer.alloc(44 + amostras * 2);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(36 + amostras * 2, 4);
  wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(taxa, 24);
  wav.writeUInt32LE(taxa * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(amostras * 2, 40);
  for (let i = 0; i < amostras; i += 1) {
    wav.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / taxa) * 3000), 44 + i * 2);
  }
  const arquivo = join(pasta, 'tom.wav');
  writeFileSync(arquivo, wav);
  return arquivo;
}

function temPipeWire(): boolean {
  if (process.platform !== 'linux') return false;
  try {
    execFileSync('pw-cli', ['info', '0'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

test.describe('som do PC no Linux', () => {
  test.skip(!temPipeWire(), 'só no Linux com PipeWire');

  let tocador: ChildProcess | null = null;

  test.beforeEach(() => {
    apagarRalo();
    execFileSync('pw-cli', [
      'create-node',
      'adapter',
      `{ factory.name=support.null-audio-sink node.name=${RALO} media.class=Audio/Sink ` +
        'audio.position=[FL FR] object.linger=true priority.session=0 priority.driver=0 }',
    ]);
  });

  test.afterEach(() => {
    tocador?.kill();
    tocador = null;
    apagarRalo();
  });

  test('a janela manda o som do PC junto da tela, e o som do próprio Loft fica de fora', async () => {
    test.setTimeout(120_000);
    const conta = newAccount('Som');
    accounts.push(conta);
    await signUpThroughUi(janela, conta);
    await createGroupThroughUi(janela, 'Grupo som');
    await abrirPalco();
    await entrarNaSala(janela);

    // Trava: nenhum microfone DE VERDADE ligado em nada do teste.
    await janela.waitForTimeout(1000);
    const microfonesReais = new Set(
      pwDump()
        .filter((o) => String(o.info?.props?.['node.name'] ?? '').startsWith('alsa_input'))
        .map((o) => o.id),
    );
    const pidsDaJanela = new Set(
      (await app.evaluate(({ app: eletron }) => eletron.getAppMetrics().map((p) => p.pid))).map(String),
    );
    const nosDaJanela = new Set(
      pwDump()
        .filter((o) => pidsDaJanela.has(String(o.info?.props?.['application.process.id'])))
        .map((o) => o.id),
    );
    expect(
      ligacoes().some(([saida, entrada]) => microfonesReais.has(saida) && nosDaJanela.has(entrada)),
      'o teste não pode usar o microfone de verdade',
    ).toBe(false);

    // O tom nasce DESLIGADO de tudo e é ligado à mão, só no ralo.
    tocador = spawn('pw-play', ['-P', '{ node.autoconnect=false node.name=loft-teste-tom }', tomDeTeste(dados)], {
      stdio: 'ignore',
    });
    // A saída do tom aparece um instante depois do nó.
    await expect
      .poll(() => execFileSync('pw-link', ['-o'], { encoding: 'utf-8' }).includes('loft-teste-tom:'), {
        timeout: 10_000,
      })
      .toBe(true);
    for (const lado of ['FL', 'FR']) {
      execFileSync('pw-link', ['loft-teste-tom:output_MONO', `${RALO}:playback_${lado}`]);
    }
    const [tom] = idsDoNo('loft-teste-tom');
    const [ralo] = idsDoNo(RALO);
    expect(
      ligacoes().filter(([saida]) => saida === tom).every(([, entrada]) => entrada === ralo),
      'o tom de teste só pode estar ligado ao alto-falante de mentira',
    ).toBe(true);

    /*
     * O Loft precisa ter uma saída de som DE VERDADE para provar que ela fica
     * de fora: ele toca SILÊNCIO (volume zero), e no alto-falante de mentira.
     */
    await janela.evaluate(() => {
      const contexto = new AudioContext();
      const ganho = contexto.createGain();
      ganho.gain.value = 0;
      const oscilador = contexto.createOscillator();
      oscilador.connect(ganho).connect(contexto.destination);
      oscilador.start();
      (window as unknown as { silencio: AudioContext }).silencio = contexto;
    });
    const pidAudio = await app.evaluate(
      ({ app: eletron }) => eletron.getAppMetrics().find((p) => p.name === 'Audio Service')?.pid,
    );
    expect(pidAudio).toBeDefined();
    const saidaDoLoftAgora = () =>
      pwDump().find(
        (o) =>
          o.type === 'PipeWire:Interface:Node' &&
          String(o.info?.props?.['application.process.id']) === String(pidAudio) &&
          o.info?.props?.['media.class'] === 'Stream/Output/Audio',
      )?.id;
    await expect.poll(saidaDoLoftAgora, { timeout: 10_000 }).toBeDefined();
    const saidaDoLoft = saidaDoLoftAgora()!;
    await expect
      .poll(() => ligacoes().filter(([saida]) => saida === saidaDoLoft).map(([, entrada]) => entrada), {
        timeout: 10_000,
      })
      .toEqual(expect.arrayContaining([ralo]));
    expect(
      ligacoes().filter(([saida]) => saida === saidaDoLoft).every(([, entrada]) => entrada === ralo),
      'a saída do Loft no teste só pode ir para o alto-falante de mentira',
    ).toBe(true);

    await janela.getByRole('button', { name: 'Compartilhar tela' }).click();
    const seletor = janela.getByRole('dialog');
    await seletor.locator('.screen-picker__card', { hasText: 'PalcoDeTeste' }).click();
    await seletor.getByRole('button', { name: 'Transmitir' }).click();
    await expect(janela.locator('.room__preview')).toBeVisible({ timeout: 30_000 });

    // A transmissão leva uma faixa de áudio: o microfone virtual do venmic.
    const rotulo = await janela.evaluate(() => {
      const video = document.querySelector<HTMLVideoElement>('.room__preview video');
      const stream = video?.srcObject as MediaStream | null;
      return stream?.getAudioTracks()[0]?.label ?? null;
    });
    expect(rotulo).toBe('vencord-screen-share');

    // O tom chega no microfone virtual (som de verdade, não faixa vazia).
    const nivel = await janela.evaluate(async () => {
      const video = document.querySelector<HTMLVideoElement>('.room__preview video');
      const stream = new MediaStream((video!.srcObject as MediaStream).getAudioTracks());
      const contexto = new AudioContext();
      const analisador = contexto.createAnalyser();
      contexto.createMediaStreamSource(stream).connect(analisador);
      const dados = new Float32Array(analisador.fftSize);
      let maior = 0;
      for (let i = 0; i < 30; i += 1) {
        await new Promise((pronto) => setTimeout(pronto, 100));
        analisador.getFloatTimeDomainData(dados);
        for (const v of dados) maior = Math.max(maior, Math.abs(v));
      }
      await contexto.close();
      return maior;
    });
    expect(nivel, 'o som do PC precisa chegar na transmissão').toBeGreaterThan(0.01);

    // Entrou uma cópia do tom no microfone virtual...
    const copias = (no: number) =>
      pwDump().filter(
        (o) =>
          o.type === 'PipeWire:Interface:Node' &&
          String(o.info?.props?.['node.name'] ?? '').startsWith(`venmic-loopback-capture-${no}-`),
      );
    expect(copias(tom!).length, 'o tom precisa entrar').toBeGreaterThan(0);
    // ...e nenhuma da saída de som do próprio Loft.
    expect(copias(saidaDoLoft).length, 'o som do Loft não pode entrar').toBe(0);

    // Parar desliga o microfone virtual.
    await janela.getByRole('button', { name: 'Parar de transmitir' }).click();
    await expect.poll(() => idsDoNo('vencord-screen-share').length, { timeout: 10_000 }).toBe(0);
  });
});
