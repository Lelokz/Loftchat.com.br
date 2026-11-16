/*
 * Loft em janela — etapa 1.
 *
 * A janela abre o SITE do Loft, não uma cópia dele: o que muda no site vale
 * aqui na hora, e navegador e janela são o mesmo Loft conversando.
 */

import { app, BrowserWindow, desktopCapturer, ipcMain, Menu, session, shell } from 'electron';
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
  'display-capture',
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

// A tela/janela que a pessoa escolheu no seletor do Loft. Vale para UM pedido
// de transmissão só: usada (ou recusada), volta a null.
let fonteEscolhida = null;

async function listarFontes(tamanho) {
  const fontes = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: tamanho,
    fetchWindowIcons: true,
  });
  // A própria janela do Loft fica de fora: transmitir ela mesma vira túnel.
  const minha = janela?.getMediaSourceId();
  return fontes.filter((fonte) => fonte.id !== minha);
}

function ligarCompartilhamentoDeTela() {
  ipcMain.handle('loft:fontes-de-tela', async (evento) => {
    if (!doLoft(evento.senderFrame?.url)) return [];
    const fontes = await listarFontes({ width: 320, height: 180 });
    return fontes.map((fonte) => ({
      id: fonte.id,
      nome: fonte.name,
      tipo: fonte.id.startsWith('screen:') ? 'tela' : 'janela',
      miniatura: fonte.thumbnail.isEmpty() ? null : fonte.thumbnail.toDataURL(),
      icone: fonte.appIcon && !fonte.appIcon.isEmpty() ? fonte.appIcon.toDataURL() : null,
    }));
  });

  ipcMain.handle('loft:escolher-fonte', (evento, id) => {
    if (doLoft(evento.senderFrame?.url)) fonteEscolhida = id;
  });

  // Chamado quando o site pede getDisplayMedia: entrega a fonte escolhida.
  session.defaultSession.setDisplayMediaRequestHandler(async (pedido, responder) => {
    const id = fonteEscolhida;
    fonteEscolhida = null;
    if (id === null || !doLoft(pedido.frame?.url)) return responder({});
    const fonte = (await listarFontes({ width: 0, height: 0 })).find((f) => f.id === id);
    if (fonte === undefined) return responder({});
    responder({ video: fonte });
  });
}

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
      preload: join(import.meta.dirname, 'preload.cjs'),
      // Programa de chamada: a voz dos outros toca sem precisar de clique.
      autoplayPolicy: 'no-user-gesture-required',
      // Com o Loft atrás do jogo, a página não pode "dormir" (atrasaria tudo).
      backgroundThrottling: false,
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

    ligarCompartilhamentoDeTela();
    criarJanela();
  });

  app.on('window-all-closed', () => app.quit());
}
