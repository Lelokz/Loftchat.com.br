/**
 * Roda um comando do Playwright CONTRA O PROJETO REAL, de propósito.
 *
 * A trava do playwright.config.ts recusa qualquer execução fora do emulador que
 * não traga `LOFT_ALLOW_REAL`. Três comandos têm motivo legítimo para falar com
 * produção — `test:turn` (servidor TURN de terceiro), `check:indexes` (índice
 * composto, que o emulador não valida) e `test:real` (a escotilha) — e é este
 * script que assina por eles.
 *
 * POR QUE UM SCRIPT, e não `LOFT_ALLOW_REAL=1 playwright test` no package.json:
 * essa sintaxe é de `sh`. No cmd.exe, que é o que o npm usa no Windows desta
 * máquina, ela não define variável nenhuma — vira parte do comando e o erro que
 * aparece não fala de variável. Mesmo motivo do `scripts/emulator.mjs`.
 *
 * O aviso na saída é intencional: a diferença entre emulador e produção não se
 * vê, e quem digitou o comando merece ler que ESTA execução cria conta de
 * verdade e gasta cota.
 */

import { spawn } from 'node:child_process';

const comando = process.argv.slice(2).join(' ');
if (comando === '') {
  console.error('Uso: node scripts/real.mjs "<comando playwright>"');
  process.exit(1);
}

console.error(
  '\n  ⚠  PROJETO REAL (loft-3d6c0f): esta execução cria contas de verdade,\n' +
    '     escreve no Firestore de produção e consome cota.\n' +
    `     Comando: ${comando}\n`,
);

/*
 * A variável vai no ambiente do filho, e SÓ nele — nada é exportado para a
 * sessão de quem chamou. Uma trava que vaza para o resto do terminal seria uma
 * trava desarmada até fechar a janela.
 */
const filho = spawn(`npx ${comando}`, {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, LOFT_ALLOW_REAL: '1' },
});

filho.on('exit', (code) => process.exit(code ?? 1));
