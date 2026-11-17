import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

/*
 * A VERSÃO DO LOFTCHAT mora num lugar só: `desktop/package.json`. Dela saem a
 * versão do programa (electron-builder), a do app Android (build.gradle) e a
 * que o chat mostra em Configurações → Sobre o Loftchat (`__VERSAO__`).
 */
const versao = (JSON.parse(readFileSync(new URL('./desktop/package.json', import.meta.url), 'utf8')) as { version: string }).version;

export default defineConfig({
  define: {
    __VERSAO__: JSON.stringify(versao),
  },
  server: {
    port: 5173,
    open: false,
  },
});
