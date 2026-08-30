import { defineConfig, devices } from "@playwright/test";

/*
 * `.env` DA RAIZ, CARREGADO AQUI — antes de qualquer spec ser importado.
 *
 * O Vite carrega `.env` sozinho para o app, mas os testes rodam pelo Node,
 * fora do bundle: quem precisa de uma credencial de `.env` no lado do teste
 * (hoje só `tests/turn.spec.ts`, para montar `iceServers` antes de entrar no
 * navegador) precisa dela em `process.env`. Silencioso se o arquivo não
 * existir — a suíte inteira não depende disto, só os três comandos que
 * passam por `scripts/real.mjs`.
 */
try {
  process.loadEnvFile();
} catch {
  /* sem `.env` na raiz: segue sem as variáveis que ele traria */
}

const PORT = 5199;

/**
 * Os dois emuladores, como `authHost|firestoreHost`, ou `null` fora do emulador.
 *
 * Uma variável só, com os dois endereços, porque o Vite precisa dela inteira no
 * cliente e duas variáveis seriam duas chances de uma chegar e a outra não —
 * metade do app no emulador e metade em produção é exatamente o estado que esta
 * etapa existe para tornar impossível.
 */
const EMULATOR_HOSTS =
  process.env['FIREBASE_AUTH_EMULATOR_HOST'] !== undefined &&
  process.env['FIRESTORE_EMULATOR_HOST'] !== undefined
    ? `${process.env['FIREBASE_AUTH_EMULATOR_HOST']}|${process.env['FIRESTORE_EMULATOR_HOST']}`
    : null;

/**
 * A TRAVA: contra o projeto REAL só com `LOFT_ALLOW_REAL` na mão.
 *
 * A etapa 12 fez "variável ausente = projeto real" e chamou isso de lado seguro
 * do erro. Não é. Ausência é o estado que um caminho QUEBRADO produz — um npm
 * script que morre antes de subir o emulador, um `npx playwright test` digitado
 * direto para filtrar um teste. Nesses casos a suíte não abortava: ela caía em
 * produção, criava conta de verdade a cada teste e queimava cota. Foi o que
 * aconteceu em 23/08/2026.
 *
 * Agora o padrão é RECUSAR. Para falar com o projeto real é preciso dizer isso
 * explicitamente, e quem diz são os três scripts que têm motivo — `test:turn`,
 * `check:indexes` e `test:real`, todos via `scripts/real.mjs`. Digitar
 * `npx playwright test` sem emulador passou a ser um erro alto e imediato, e
 * não uma fatura no fim do mês.
 */
if (EMULATOR_HOSTS === null && process.env['LOFT_ALLOW_REAL'] === undefined) {
  throw new Error(
    [
      '',
      'RECUSADO: esta execução apontaria para o PROJETO REAL (loft-3d6c0f).',
      '',
      'Nenhuma das duas variáveis do emulador está definida:',
      `  FIREBASE_AUTH_EMULATOR_HOST = ${process.env['FIREBASE_AUTH_EMULATOR_HOST'] ?? '(ausente)'}`,
      `  FIRESTORE_EMULATOR_HOST     = ${process.env['FIRESTORE_EMULATOR_HOST'] ?? '(ausente)'}`,
      '',
      'Quase sempre isto quer dizer que o emulador não subiu e o comando seguiu',
      'assim mesmo. Rode a suíte por dentro dele:',
      '',
      '    npm test',
      '',
      'Se a intenção era MESMO falar com produção, use a escotilha que já existe',
      '(npm run test:real, npm run test:turn, npm run check:indexes) — ela define',
      'LOFT_ALLOW_REAL por você e cobra o custo de forma consciente.',
      '',
    ].join('\n'),
  );
}

/**
 * Argumentos de mídia do Chromium.
 *
 * Exportados porque os testes de compartilhamento de tela sobem um navegador
 * PRÓPRIO e precisam exatamente destes mesmos — ver `freshBrowser` em
 * tests/loft.spec.ts.
 */
export const MEDIA_ARGS = [
  // Microfone falso: sem isto o teste dependeria de um microfone de
  // verdade na máquina, e o WebRTC não teria faixa nenhuma para
  // negociar.
  "--use-fake-device-for-media-stream",
  // E responde a caixa de permissão sozinho — ela não é clicável pelo
  // Playwright, por ser UI do navegador e não da página.
  "--use-fake-ui-for-media-stream",
  // Autoplay sem gesto: as duas abas do teste entram na sala por
  // script, e sem isto o play() do áudio remoto seria recusado.
  "--autoplay-policy=no-user-gesture-required",
  /*
   * Captura de tela sem seletor: o Playwright não clica em UI do navegador,
   * então sem isto getDisplayMedia ficaria esperando para sempre.
   *
   * A ABA vem antes do monitor de propósito. "Entire screen" captura o monitor
   * FÍSICO, e com a máquina ociosa a tela dorme: a captura existe e não entrega
   * quadro nenhum — o vídeo chega do outro lado com `videoWidth` zerado para
   * sempre, que foi exatamente a falha vista aqui. Uma aba está sempre
   * renderizando. O de monitor fica como reserva.
   *
   * E a aba capturada NAO e a do Loft, de proposito. Capturar a propria aba faz
   * efeito de tunel — a previa da transmissao aparece dentro da transmissao — e
   * a 1080p60 isso derruba o processo por falta de memoria. `freshBrowser` abre
   * uma aba de cenario com este titulo, barata de codificar.
   */
  "--auto-select-tab-capture-source-by-title=PalcoDeTeste",
  "--auto-select-desktop-capture-source=Entire screen",
];

export default defineConfig({
  testDir: "./tests",
  // Contas de teste reais + Firestore real: uma de cada vez evita corrida entre
  // specs que criam e apagam os mesmos dados.
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],

  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1440, height: 900 },
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: { args: MEDIA_ARGS },
      },
    },
  ],

  /*
   * O QUE NÃO PODE RODAR DENTRO DO EMULADOR.
   *
   * `@externo` fala com um servidor TURN de terceiro e precisa de internet;
   * `@indices` precisa do projeto REAL, porque índice composto é justamente o
   * que o emulador não valida. Estando no emulador, os dois saem — e fora dele
   * a exclusão some, para `--grep @externo` e `--grep @indices` funcionarem.
   *
   * Fica aqui, e não na linha de comando, por dois motivos: a regra é do
   * AMBIENTE e não de quem digita, e aspas aninhadas em script de npm no
   * Windows são uma fonte de erro que não vale a pena pagar.
   */
  grepInvert: EMULATOR_HOSTS === null ? undefined : /@externo|@indices/,

  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 60_000,
    /*
     * REPASSA O EMULADOR PARA O VITE.
     *
     * `FIRESTORE_EMULATOR_HOST` e `FIREBASE_AUTH_EMULATOR_HOST` são definidas
     * pelo próprio `firebase emulators:exec` no ambiente do comando filho — não
     * são invenção nossa. Se elas existem, estamos dentro do emulador e o app
     * servido pelo Vite tem que ir junto; se não existem, o app aponta para o
     * projeto REAL — e chegar aqui sem elas já exige `LOFT_ALLOW_REAL`, porque
     * a trava no topo deste arquivo recusa a execução antes de o Vite subir.
     */
    env: EMULATOR_HOSTS === null ? {} : { VITE_USE_EMULATOR: EMULATOR_HOSTS },
  },
});
