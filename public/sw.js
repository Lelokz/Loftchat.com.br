/*
 * Service worker DELIBERADAMENTE BURRO.
 *
 * Ele existe por um motivo só: sem service worker o navegador não considera o
 * app instalável. Não guarda NADA.
 *
 * Por que zero cache: cache mal feito serve versão velha do app depois de um
 * deploy, e o sintoma é alguém jurando que o bug continua enquanto já foi
 * corrigido. Depurar isso custa muito mais do que um carregamento offline vale
 * nesta altura do projeto.
 *
 * As três coisas que garantem que um deploy aparece na hora:
 *   1. o fetch abaixo só repassa — nunca há o que servir velho;
 *   2. skipWaiting + clients.claim fazem a versão nova assumir imediatamente,
 *      sem esperar todas as abas fecharem;
 *   3. firebase.json manda Cache-Control: no-cache para este arquivo, senão o
 *      Hosting o cachearia por uma hora e o passo 2 demoraria a acontecer.
 */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Repasse puro. Existe porque o navegador exige um handler de fetch para
// considerar o app instalável — não para interceptar coisa alguma.
self.addEventListener('fetch', () => {});
