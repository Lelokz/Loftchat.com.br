/*
 * Loft em janela — etapa 1.
 *
 * A janela abre o SITE do Loft, não uma cópia dele: o que muda no site vale
 * aqui na hora, e navegador e janela são o mesmo Loft conversando.
 */

import { app, BrowserWindow, Menu, session, shell } from 'electron';
import { join } from 'node:path';

const SITE = 'https://loft-3d6c0f.web.app';

// Fora do instalador (desenvolvimento e testes) dá para apontar para outro
// endereço e guardar os dados em outra pasta. No app instalado, nunca.
const endereco = (!app.isPackaged && process.env.LOFT_URL) || SITE;
if (!app.isPackaged && process.env.LOFT_DADOS) {
  app.setPath('userData', process.env.LOFT_DADOS);
}
const origem = new URL(endereco).origin;

const PERMITIDAS = new Set([
  'media',
  'notifications',
  'clipboard-sanitized-write',
  'fullscreen',
]);

function doLoft(url) {
  try {
    return new URL(url).origin === origem;
  } catch {
    return false;
  }
}

function abrirNoNavegador(url) {
  if (/^https?:\/\//.test(url)) shell.openExternal(url);
}

let janela = null;

function criarJanela() {
  janela = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 400,
    minHeight: 500,
    title: 'Loft',
    icon: join(import.meta.dirname, 'icone.png'),
    backgroundColor: '#140f26',
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  janela.once('ready-to-show', () => janela.show());

  // Link de fora do Loft abre no navegador, nunca dentro da janela.
  janela.webContents.setWindowOpenHandler(({ url }) => {
    abrirNoNavegador(url);
    return { action: 'deny' };
  });
  janela.webContents.on('will-navigate', (evento, url) => {
    if (!doLoft(url)) {
      evento.preventDefault();
      abrirNoNavegador(url);
    }
  });

  janela.loadURL(endereco);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  // Abrir o Loft de novo só traz a janela que já existe para frente.
  app.on('second-instance', () => {
    if (!janela) return;
    if (janela.isMinimized()) janela.restore();
    janela.focus();
  });

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);

    // Microfone, notificação etc. só para o próprio Loft.
    session.defaultSession.setPermissionRequestHandler((conteudo, permissao, responder) => {
      responder(PERMITIDAS.has(permissao) && doLoft(conteudo.getURL()));
    });
    session.defaultSession.setPermissionCheckHandler((_conteudo, permissao, origemPedido) => {
      return PERMITIDAS.has(permissao) && doLoft(origemPedido);
    });

    criarJanela();
  });

  app.on('window-all-closed', () => app.quit());
}
