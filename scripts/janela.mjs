/**
 * Abre a janela do Loft (desktop/) a partir do código, sem instalador.
 *
 *     npm run janela
 *
 * Tira ELECTRON_RUN_AS_NODE do ambiente: o terminal do VS Code define essa
 * variável, e com ela o Electron roda como Node em vez de abrir a janela.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const pasta = join(dirname(fileURLToPath(import.meta.url)), '..', 'desktop');
const binario = join(
  pasta,
  'node_modules',
  'electron',
  'dist',
  process.platform === 'win32' ? 'electron.exe' : 'electron',
);

if (!existsSync(binario)) {
  console.error('Electron não está instalado em desktop/. Ver "Janela do Loft" em COMO-RODAR.md.');
  process.exit(1);
}

const { ELECTRON_RUN_AS_NODE: _fora, ...ambiente } = process.env;
const filho = spawn(binario, [pasta, ...process.argv.slice(2)], { stdio: 'inherit', env: ambiente });
filho.on('exit', (codigo) => process.exit(codigo ?? 0));
