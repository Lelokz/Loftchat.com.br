// O Loft antigo registrava um service worker neste endereço. Esta versão
// existe só para se desinstalar sozinha em quem ainda tiver a antiga.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(self.registration.unregister());
});
