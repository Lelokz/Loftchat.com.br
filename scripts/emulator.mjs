/**
 * Sobe o Firebase Emulator Suite e roda um comando dentro dele.
 *
 * O emulador do Firestore é um programa JAVA. Exige um `java` de sistema no
 * PATH (Linux Mint: `sudo apt install openjdk-21-jre-headless`) — checado
 * abaixo antes de tentar subir qualquer coisa, porque sem Java o erro do
 * próprio `emulators:exec` não deixa claro qual é a causa.
 *
 * O QUE ESTE SCRIPT NÃO PRECISA FAZER: propagar "estamos no emulador" adiante.
 * O próprio `firebase emulators:exec` define `FIRESTORE_EMULATOR_HOST` e
 * `FIREBASE_AUTH_EMULATOR_HOST` no ambiente do comando filho — é o mecanismo
 * oficial, e é dele que o playwright.config.ts, o app e os helpers de teste
 * tiram a decisão. Nenhuma variável inventada por nós.
 */

import { execFileSync, spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

try {
  execFileSync('java', ['-version'], { stdio: 'ignore' });
} catch {
  console.error(
    'Sem Java: o emulador do Firestore não sobe sem uma JVM.\n' +
      'Instale com: sudo apt install openjdk-21-jre-headless',
  );
  process.exit(1);
}

/*
 * Os argumentos passam DIRETO, sem re-aspas.
 *
 * Tentei citar argumentos com espaço para permitir `-g "um filtro"`, e não
 * funciona: `comando` entra dentro de outro par de aspas duplas logo abaixo
 * (para virar um argumento só de `emulators:exec`), e aspas de `comando`
 * fecham as de fora cedo demais. Para rodar um recorte dentro do emulador,
 * mire por ARQUIVO ou por LINHA, que não têm espaço:
 *
 *     node scripts/emulator.mjs playwright test tests/loft.spec.ts:2470
 *
 * O que NÃO fazer é chamar `npx playwright test` direto para filtrar: sem as
 * variáveis do emulador isso vai para o PROJETO REAL e gasta cota.
 */
const comando = process.argv.slice(2).join(' ');
if (comando === '') {
  console.error('Uso: node scripts/emulator.mjs "<comando a rodar dentro do emulador>"');
  process.exit(1);
}

/*
 * Linha ÚNICA, e não array de argumentos.
 *
 * `emulators:exec` recebe o script a executar como UM argumento só. Passando um
 * array com `shell: true`, o Node concatena os elementos e o shell reparte de
 * novo nos espaços — "playwright test" vira dois argumentos e o firebase
 * responde "Too many arguments". As aspas abaixo são o que mantém o comando
 * inteiro.
 */
const filho = spawn(
  `npx firebase emulators:exec --only auth,firestore "${comando}"`,
  { stdio: 'inherit', shell: true, cwd: root },
);

filho.on('exit', (code) => process.exit(code ?? 1));
