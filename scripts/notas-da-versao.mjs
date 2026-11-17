// O texto de uma versão no GitHub (Releases), tirado do novidades.json.
//
//     node scripts/notas-da-versao.mjs 0.2.0 > notas.md
import { readFileSync } from 'node:fs';

const versao = process.argv[2]?.replace(/^v/, '');
const lista = JSON.parse(readFileSync(new URL('../novidades.json', import.meta.url), 'utf8'));
const essa = lista.find((v) => v.versao === versao);
if (essa === undefined) {
  console.error(`A versão ${versao} não está no novidades.json — escreva as novidades dela antes de publicar.`);
  process.exit(1);
}
console.log(`## Novidades da versão ${essa.versao}\n`);
for (const item of essa.itens) console.log(`- ${item}`);
console.log('\n**Baixar:** Windows → `Loftchat-Setup.exe` · Linux → `Loftchat.AppImage` · Android → `Loftchat-Android.apk`');
