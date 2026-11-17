/*
 * Loftchat — o programa (Linux e Windows).
 *
 * Etapa 9a: o chat mora DENTRO do programa. A pasta `app/` (o `vite build`,
 * ver `npm run build:desktop`) é servida pelo endereço próprio
 * `app://loftchat/`, que só existe aqui dentro: abre sem internet para a
 * tela, e cada versão do programa leva o chat daquela versão.
 *
 * Fora do instalador (desenvolvimento e testes) dá para trocar a pasta
 * (`LOFT_PASTA`), apontar para um servidor (`LOFT_URL`, o Vite) e guardar os
 * dados em outra pasta (`LOFT_DADOS`). No programa instalado, nunca.
 */

import { app, BrowserWindow, desktopCapturer, ipcMain, Menu, net, protocol, session, shell } from 'electron';
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { createRequire } from 'node:module';
import { join, normalize, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);

const ESQUEMA = 'app';
const CASA = 'loftchat';
const PASTA_DO_CHAT = (!app.isPackaged && process.env.LOFT_PASTA) || join(import.meta.dirname, 'app');
const endereco = (!app.isPackaged && process.env.LOFT_URL) || `${ESQUEMA}://${CASA}/`;
if (!app.isPackaged && process.env.LOFT_DADOS) {
  app.setPath('userData', process.env.LOFT_DADOS);
}

// "Seguro" e "padrão": o chat se comporta como num site https (guarda a
// sessão, pede microfone, usa fetch). Tem que vir antes do app ficar pronto.
protocol.registerSchemesAsPrivileged([
  {
    scheme: ESQUEMA,
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true, codeCache: true },
  },
]);

/** `protocolo//casa` — o `URL.origin` do Node dá "null" para esquemas que ele não conhece. */
function origemDe(url) {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return '';
  }
}
const origem = origemDe(endereco);

/*
 * LINK DE CONVITE (etapa 9b): o site manda para `loftchat://convite/CÓDIGO`, o
 * sistema abre o programa com esse endereço nos argumentos (ou entrega à
 * janela que já está aberta, pelo `second-instance`). Só o código passa
 * adiante, conferido: 6 (ou 8, os antigos) letras do alfabeto do convite (src/lib/invite-code.ts).
 */
const LINK = 'loftchat';
const CODIGO = /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}(?:[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{2})?$/;

function conviteDosArgumentos(argv) {
  for (const arg of argv) {
    const achado = /^loftchat:\/\/convite\/([^/?#]+)/i.exec(String(arg));
    if (achado === null) continue;
    const codigo = decodeURIComponent(achado[1]).trim().toUpperCase();
    if (CODIGO.test(codigo)) return codigo;
  }
  return null;
}

/*
 * LINUX (AppImage, etapa 9c): o AppImage é um arquivo solto, sem instalador.
 * Na primeira vez (e sempre que o arquivo muda de lugar) o programa se
 * apresenta ao sistema como um instalador faria: entrada no menu de
 * aplicativos, ícone e o `loftchat://` dos convites. Só na pasta da PESSOA
 * (~/.local/share), nada do sistema.
 */
function integrarNoLinux() {
  const appimage = process.env.APPIMAGE;
  if (process.platform !== 'linux' || !app.isPackaged || !appimage) return;
  try {
    const base = process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share');
    const icones = join(base, 'icons', 'hicolor', '512x512', 'apps');
    const aplicativos = join(base, 'applications');
    mkdirSync(icones, { recursive: true });
    mkdirSync(aplicativos, { recursive: true });
    copyFileSync(join(import.meta.dirname, 'icone.png'), join(icones, 'loftchat.png'));
    const aspas = (texto) => `"${texto.replace(/(["\\$`])/g, '\\$1')}"`;
    const atalho = [
      '[Desktop Entry]',
      'Type=Application',
      'Name=Loftchat',
      'Comment=Chat, voz e tela com som para você e seus amigos',
      `Exec=${aspas(appimage)} %U`,
      'Icon=loftchat',
      'Terminal=false',
      'Categories=Network;Chat;',
      'MimeType=x-scheme-handler/loftchat;',
      'StartupWMClass=Loftchat',
      '',
    ].join('\n');
    const arquivo = join(aplicativos, 'loftchat.desktop');
    const antes = existsSync(arquivo) ? readFileSync(arquivo, 'utf8') : '';
    if (antes !== atalho) writeFileSync(arquivo, atalho);
  } catch (erro) {
    console.error('Não deu para pôr o Loftchat no menu do sistema.', erro);
  }
}

/*
 * ATUALIZAÇÃO AUTOMÁTICA (etapa 9d), pelas Releases do GitHub (o endereço
 * sai do `publish` do package.json, gravado no pacote pelo electron-builder).
 *
 * Ao abrir e a cada 4 horas: procura versão nova e baixa por trás. Pronta,
 * o chat mostra a faixa "Atualização pronta / Reiniciar" (sem pop-up). Se a
 * pessoa não reiniciar, ela entra sozinha quando o programa fechar.
 * Windows (NSIS por usuário) e Linux (AppImage) instalam sem pedir senha.
 */
const QUATRO_HORAS = 4 * 60 * 60 * 1000;
let atualizacaoPronta = null; // a versão baixada, ou null

function ligarAtualizacao() {
  // Fora do programa instalado não há o que atualizar — mas o chat pergunta
  // mesmo assim (Configurações → Sobre): responde "nada".
  if (!app.isPackaged) {
    ipcMain.handle('loft:atualizacao-estado', () => null);
    ipcMain.handle('loft:procurar-atualizacao', () => null);
    return;
  }
  const { autoUpdater } = require('electron-updater');
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  const avisar = (canal, valor) => janela?.webContents.send(canal, valor);
  // Achou uma versão nova: o chat já mostra "baixando" enquanto ela desce.
  autoUpdater.on('update-available', (info) => avisar('loft:atualizacao-disponivel', String(info.version)));
  autoUpdater.on('download-progress', (p) => avisar('loft:atualizacao-progresso', Math.round(p.percent)));
  autoUpdater.on('update-downloaded', (info) => {
    atualizacaoPronta = String(info.version);
    avisar('loft:atualizacao-pronta', atualizacaoPronta);
  });
  // Sem internet, GitHub fora do ar etc.: tenta de novo na próxima rodada.
  autoUpdater.on('error', (erro) => console.warn('[atualização]', erro?.message ?? erro));
  const procurar = () => autoUpdater.checkForUpdates().catch(() => null);
  void procurar();
  setInterval(() => void procurar(), QUATRO_HORAS);

  ipcMain.handle('loft:atualizacao-estado', () => atualizacaoPronta);
  // Botão "Procurar atualizações" (Configurações → Sobre): a versão achada,
  // se for mais nova que esta; null se já está na última.
  ipcMain.handle('loft:procurar-atualizacao', async (evento) => {
    if (!doLoft(evento.senderFrame?.url)) return null;
    const achado = await procurar();
    const versao = achado?.updateInfo?.version;
    return achado?.isUpdateAvailable && versao ? String(versao) : null;
  });
  ipcMain.handle('loft:atualizar-agora', (evento) => {
    if (!doLoft(evento.senderFrame?.url) || atualizacaoPronta === null) return;
    // Fecha a janela e reabre na versão nova.
    autoUpdater.quitAndInstall(false, true);
  });
}

/** Serve a pasta do chat. Caminho que não é arquivo cai no index.html (o chat tem rotas, como /convite/…). */
function servirChat() {
  const raiz = normalize(PASTA_DO_CHAT);
  protocol.handle(ESQUEMA, (pedido) => {
    const url = new URL(pedido.url);
    if (url.host !== CASA) return new Response('', { status: 404 });
    const arquivo = normalize(join(raiz, decodeURIComponent(url.pathname)));
    // Nada fora da pasta (../).
    if (arquivo !== raiz && !arquivo.startsWith(raiz + sep)) return new Response('', { status: 404 });
    const existe = existsSync(arquivo) && statSync(arquivo).isFile();
    return net.fetch(pathToFileURL(existe ? arquivo : join(raiz, 'index.html')).toString());
  });
}

const PERMITIDAS = new Set([
  'media',
  'display-capture',
  'notifications',
  'clipboard-sanitized-write',
  'fullscreen',
]);

function doLoft(url) {
  return typeof url === 'string' && origemDe(url) === origem;
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

/*
 * ÁUDIO DO PC NO LINUX (venmic, PipeWire).
 *
 * O navegador no Linux só manda som de ABA. O venmic cria um microfone virtual
 * ("vencord-screen-share") que recebe o som dos programas, MENOS o do próprio
 * Loft — senão os amigos ouviriam a própria voz de volta.
 */
let patchBay; // undefined = ainda não tentou; null = indisponível

function venmic() {
  if (patchBay !== undefined) return patchBay;
  patchBay = null;
  if (process.platform !== 'linux') return null;
  try {
    const { PatchBay } = require('@vencord/venmic');
    if (PatchBay.hasPipeWire()) patchBay = new PatchBay();
  } catch (erro) {
    console.error('venmic indisponível:', erro);
  }
  return patchBay;
}

// O som do Loft sai pelo processo "Audio Service" do Chromium.
function pidDoAudioDoLoft() {
  return app.getAppMetrics().find((processo) => processo.name === 'Audio Service')?.pid;
}

// Só em desenvolvimento: o teste toca o som num alto-falante de mentira, que
// não é o padrão — sem isto o venmic ignoraria esse som.
const AUDIO_DE_TESTE = !app.isPackaged && process.env.LOFT_AUDIO_TESTE === '1';

function ligarAudioDoPc() {
  const pb = venmic();
  const pid = pidDoAudioDoLoft();
  // Sem saber qual é o som do Loft, não dá para tirá-lo: melhor sem áudio
  // do que com eco.
  if (pb === null || pid === undefined) return false;
  return pb.link({
    include: [],
    exclude: [{ 'application.process.id': String(pid) }, { 'media.class': 'Stream/Input/Audio' }],
    mute: true,
    ...(AUDIO_DE_TESTE ? { only_speakers: false, only_default_speakers: false } : {}),
  });
}

function ligarCompartilhamentoDeTela() {
  ipcMain.handle('loft:audio-do-pc-ligar', (evento) =>
    doLoft(evento.senderFrame?.url) ? ligarAudioDoPc() : false,
  );
  ipcMain.handle('loft:audio-do-pc-soltar', (evento) => {
    if (doLoft(evento.senderFrame?.url)) patchBay?.unmute();
  });
  ipcMain.handle('loft:audio-do-pc-desligar', () => {
    patchBay?.unlink();
  });

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

  ipcMain.handle('loft:versao', () => app.getVersion());

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
    /*
     * WINDOWS: o som do PC vem pelo "loopback" (tudo que o PC toca). Faltava
     * isto, e a tela do Windows ia muda (16/11/2026). O som do próprio Loft
     * (a voz da turma) sai pelo `restrictOwnAudio` que a página pede no
     * getDisplayMedia. No Linux o som vem pelo venmic (ligarAudioDoPc).
     */
    responder(process.platform === 'win32' ? { video: fonte, audio: 'loopback' } : { video: fonte });
  });
}

function criarJanela() {
  janela = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 400,
    minHeight: 500,
    title: 'Loftchat',
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

  // Aberto por um link de convite: já entra na tela do convite.
  const convite = conviteDosArgumentos(process.argv);
  janela.loadURL(convite === null ? endereco : new URL(`/convite/${convite}`, endereco).toString());
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  // Abrir o Loft de novo só traz a janela que já existe para frente — e, se
  // veio de um link de convite, o chat abre a tela do convite sem recarregar
  // a página (o mesmo caminho de colar o link em "Entrar num grupo").
  app.on('second-instance', (_evento, argv) => {
    if (!janela) return;
    if (janela.isMinimized()) janela.restore();
    janela.focus();
    const convite = conviteDosArgumentos(argv);
    if (convite !== null) janela.webContents.send('loft:convite', convite);
  });

  // O sistema passa a abrir `loftchat://` com este programa. Só no programa
  // instalado: em desenvolvimento e nos testes isto mexeria no sistema.
  if (app.isPackaged) {
    integrarNoLinux();
    app.setAsDefaultProtocolClient(LINK);
  }

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    servirChat();

    // Microfone, notificação etc. só para o próprio Loft.
    session.defaultSession.setPermissionRequestHandler((conteudo, permissao, responder) => {
      responder(PERMITIDAS.has(permissao) && doLoft(conteudo.getURL()));
    });
    session.defaultSession.setPermissionCheckHandler((_conteudo, permissao, origemPedido) => {
      return PERMITIDAS.has(permissao) && doLoft(origemPedido);
    });

    ligarCompartilhamentoDeTela();
    criarJanela();
    ligarAtualizacao();
  });

  app.on('window-all-closed', () => app.quit());
  app.on('will-quit', () => patchBay?.unlink());
}
