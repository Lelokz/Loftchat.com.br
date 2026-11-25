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

import {
  app,
  BrowserWindow,
  desktopCapturer,
  ipcMain,
  Menu,
  nativeImage,
  nativeTheme,
  net,
  Notification,
  protocol,
  session,
  shell,
  Tray,
} from 'electron';
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
 * Ao abrir e a cada 5 minutos: procura versão nova e baixa por trás. Pronta,
 * o chat mostra a faixa "Atualização pronta / Reiniciar" (sem pop-up). Se a
 * pessoa não reiniciar, ela entra sozinha quando o programa fechar.
 * Windows (NSIS por usuário) e Linux (AppImage) instalam sem pedir senha.
 */
const CINCO_MINUTOS = 5 * 60 * 1000;
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
  setInterval(() => {
    // Já baixada e esperando reiniciar: não precisa ficar procurando.
    if (atualizacaoPronta === null) void procurar();
  }, CINCO_MINUTOS);

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

/*
 * NOTIFICAÇÕES E BANDEJA (0.4.0). Fechar a janela deixa o Loftchat no canto
 * da barra de tarefas, como o Discord, para continuar avisando. "Sair" (no
 * ícone da bandeja) fecha de verdade.
 */
let saindo = false;
let bandeja = null;
const ICONE = join(import.meta.dirname, 'icone.png');
/** Nos testes da janela: guarda os avisos em vez de mostrar no sistema. */
const AVISOS_DE_TESTE = !app.isPackaged && process.env.LOFT_AVISOS_TESTE === '1';
globalThis.avisosDeTeste = [];
const avisosAbertos = new Set();

function mostrarJanela() {
  if (!janela) return;
  if (janela.isMinimized()) janela.restore();
  janela.show();
  janela.focus();
}

/*
 * JANELA E BANDEJA (0.7.0) — escolhas DESTE computador (Configurações →
 * Janela e bandeja), num arquivo na pasta de dados do programa:
 *   barra:    'loftchat' (a barra de cima do próprio chat, com os botões da
 *             janela) | 'sistema' (a do Linux/Windows)
 *   cantos:   'redondos' | 'retos' (Linux; no Windows 11 o sistema já arredonda)
 *   bandeja:  'pb' (preto e branco) | 'cor' | 'esconder'
 *   aoFechar: 'bandeja' (continua avisando) | 'sair'
 * Barra e cantos só mudam ao reiniciar (a janela nasce com eles).
 */
const ESCOLHAS_VALIDAS = {
  barra: ['loftchat', 'sistema'],
  cantos: ['redondos', 'retos'],
  bandeja: ['pb', 'cor', 'esconder'],
  aoFechar: ['bandeja', 'sair'],
};
const ESCOLHAS_PADRAO = { barra: 'loftchat', cantos: 'redondos', bandeja: 'pb', aoFechar: 'bandeja' };
let escolhas = { ...ESCOLHAS_PADRAO };
/** Como a janela NASCEU (barra e cantos): mudar só vale depois de reiniciar. */
let janelaNasceu = { barra: 'loftchat', transparente: false };
const arquivoDasEscolhas = () => join(app.getPath('userData'), 'janela.json');

function lerEscolhas() {
  try {
    const lido = JSON.parse(readFileSync(arquivoDasEscolhas(), 'utf8'));
    for (const [chave, opcoes] of Object.entries(ESCOLHAS_VALIDAS)) {
      if (opcoes.includes(lido?.[chave])) escolhas[chave] = lido[chave];
    }
  } catch {
    // Primeira vez (ou arquivo estragado): fica o padrão.
  }
}

let temNaoLida = false;
const BANDEJA = join(import.meta.dirname, 'bandeja');

/** A imagem da bandeja: preto e branco (claro ou escuro, conforme a barra de tarefas) ou colorida; bolinha vermelha com mensagem nova. */
function imagemDaBandeja() {
  const tamanho = process.platform === 'win32' ? 16 : 24;
  // No Windows a barra de tarefas pode ser clara: aí a casinha é preta.
  const tom =
    process.platform === 'win32' && !nativeTheme.shouldUseDarkColorsForSystemIntegratedUI ? 'escuro' : 'claro';
  const nome = escolhas.bandeja === 'cor' ? 'cor' : `pb-${tom}`;
  const arquivo = join(BANDEJA, `${nome}${temNaoLida ? '-ponto' : ''}.png`);
  return nativeImage.createFromPath(arquivo).resize({ width: tamanho, height: tamanho, quality: 'best' });
}

function atualizarBandeja() {
  if (escolhas.bandeja === 'esconder') {
    bandeja?.destroy();
    bandeja = null;
    return;
  }
  if (bandeja === null) ligarBandeja();
  else bandeja.setImage(imagemDaBandeja());
}

function ligarBandeja() {
  if (escolhas.bandeja === 'esconder') return;
  bandeja = new Tray(imagemDaBandeja());
  bandeja.setToolTip('Loftchat');
  bandeja.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Abrir o Loftchat', click: mostrarJanela },
      { type: 'separator' },
      {
        label: 'Sair',
        click: () => {
          saindo = true;
          app.quit();
        },
      },
    ]),
  );
  bandeja.on('click', mostrarJanela);
}

/** Os pedidos do chat sobre a janela: botões, escolhas, bolinha da bandeja e redimensionar (Linux transparente). */
function ligarJanela() {
  const daJanela = (evento) => doLoft(evento.senderFrame?.url) && evento.sender === janela?.webContents;
  ipcMain.handle('loft:janela-escolhas', () => ({
    escolhas: { ...escolhas },
    nasceu: { ...janelaNasceu },
    plataforma: process.platform,
    maximizada: janela ? janela.isMaximized() || janela.isFullScreen() : false,
  }));
  ipcMain.handle('loft:janela-escolher', (evento, chave, valor) => {
    if (!daJanela(evento) || !Object.hasOwn(ESCOLHAS_VALIDAS, chave) || !ESCOLHAS_VALIDAS[chave].includes(valor)) {
      return null;
    }
    escolhas[chave] = valor;
    writeFileSync(arquivoDasEscolhas(), JSON.stringify(escolhas, null, 1));
    if (chave === 'bandeja') atualizarBandeja();
    return { ...escolhas };
  });
  ipcMain.handle('loft:janela-reiniciar', (evento) => {
    if (!daJanela(evento)) return;
    saindo = true;
    app.relaunch();
    app.quit();
  });
  ipcMain.on('loft:janela-acao', (evento, acao) => {
    if (!daJanela(evento) || !janela) return;
    if (acao === 'min') janela.minimize();
    else if (acao === 'max') {
      if (janela.isFullScreen()) janela.setFullScreen(false);
      else if (janela.isMaximized()) janela.unmaximize();
      else janela.maximize();
    } else if (acao === 'fechar') janela.close();
  });
  // 0.10.0: visualização única aberta — a janela sai preta em print, gravação
  // e transmissão (Windows e Mac; no Linux o Electron não tem como).
  ipcMain.on('loft:proteger-tela', (evento, ligar) => {
    if (!daJanela(evento) || !janela) return;
    janela.setContentProtection(Boolean(ligar));
  });
  ipcMain.on('loft:bandeja-ponto', (evento, tem) => {
    if (!daJanela(evento) || Boolean(tem) === temNaoLida) return;
    temNaoLida = Boolean(tem);
    if (bandeja !== null) bandeja.setImage(imagemDaBandeja());
  });

  /*
   * Redimensionar pelas bordas na janela transparente do Linux: o sistema
   * não dá borda para puxar, então o chat tem faixas invisíveis nas beiradas
   * e manda onde o mouse está (coordenadas da tela). O tamanho sai de onde
   * começou + quanto o mouse andou.
   */
  let puxando = null;
  ipcMain.on('loft:janela-puxar', (evento, borda, x, y) => {
    if (!daJanela(evento) || !janela || !janelaNasceu.transparente || janela.isMaximized()) return;
    if (typeof borda !== 'string' || !/^(n|s|l|o|nl|no|sl|so)$/.test(borda)) return;
    puxando = { borda, x: Number(x), y: Number(y), inicio: janela.getBounds() };
  });
  ipcMain.on('loft:janela-puxando', (evento, x, y) => {
    if (!daJanela(evento) || !janela || puxando === null) return;
    const dx = Math.round(Number(x) - puxando.x);
    const dy = Math.round(Number(y) - puxando.y);
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
    const [minL, minA] = janela.getMinimumSize();
    const b = { ...puxando.inicio };
    const { borda } = puxando;
    if (borda.includes('l')) b.width = Math.max(minL, puxando.inicio.width + dx);
    if (borda.includes('o')) {
      b.width = Math.max(minL, puxando.inicio.width - dx);
      b.x = puxando.inicio.x + puxando.inicio.width - b.width;
    }
    if (borda.startsWith('s')) b.height = Math.max(minA, puxando.inicio.height + dy);
    if (borda.startsWith('n')) {
      b.height = Math.max(minA, puxando.inicio.height - dy);
      b.y = puxando.inicio.y + puxando.inicio.height - b.height;
    }
    janela.setBounds(b);
  });
  ipcMain.on('loft:janela-soltar', () => {
    puxando = null;
  });
  // Windows: a barra de tarefas mudou de clara para escura (ou o contrário).
  nativeTheme.on('updated', () => bandeja?.setImage(imagemDaBandeja()));
}

/** A foto de quem mandou, só se vier do carteiro do Loftchat. */
async function fotoDoAviso(endereco) {
  if (!/^https:\/\/loftchat-carteiro\.[a-z0-9-]+\.workers\.dev\/foto\//.test(endereco)) return null;
  try {
    const resposta = await net.fetch(endereco);
    if (!resposta.ok) return null;
    const imagem = nativeImage.createFromBuffer(Buffer.from(await resposta.arrayBuffer()));
    return imagem.isEmpty() ? null : imagem;
  } catch {
    return null;
  }
}

function ligarAvisos() {
  ipcMain.handle('loft:aviso', async (evento, aviso) => {
    if (!doLoft(evento.senderFrame?.url)) return;
    const titulo = String(aviso?.titulo ?? '').slice(0, 100);
    const corpo = String(aviso?.corpo ?? '').slice(0, 400);
    const rota = String(aviso?.rota ?? '').slice(0, 200);
    const foto = await fotoDoAviso(String(aviso?.foto ?? ''));
    if (AVISOS_DE_TESTE) {
      globalThis.avisosDeTeste.push({ titulo, corpo, rota, comFoto: foto !== null });
      return;
    }
    if (!Notification.isSupported()) return;
    const notificacao = new Notification({ title: titulo, body: corpo, icon: foto ?? ICONE });
    // Guardada até fechar: sem isso o clique se perde (o Node recolhe o objeto).
    avisosAbertos.add(notificacao);
    notificacao.on('close', () => avisosAbertos.delete(notificacao));
    notificacao.on('click', () => {
      avisosAbertos.delete(notificacao);
      mostrarJanela();
      janela?.webContents.send('loft:abrir-aviso', rota);
    });
    notificacao.show();
  });
}

function criarJanela() {
  const propria = escolhas.barra === 'loftchat';
  // Cantos redondos no Linux = janela transparente com o chat arredondado
  // por CSS. No Windows 11 o próprio sistema arredonda a janela sem barra.
  const transparente = propria && process.platform === 'linux' && escolhas.cantos === 'redondos';
  janelaNasceu = { barra: escolhas.barra, transparente };
  janela = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 400,
    minHeight: 500,
    title: 'Loftchat',
    icon: join(import.meta.dirname, 'icone.png'),
    frame: !propria,
    transparent: transparente,
    hasShadow: !transparente,
    backgroundColor: transparente ? '#00000000' : '#140f26',
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

  // A barra de cima do chat precisa saber se a janela está maximizada (o
  // botão do meio muda, e os cantos somem encostados na borda).
  const contarEstado = () =>
    janela?.webContents.send('loft:janela-estado', { maximizada: janela.isMaximized() || janela.isFullScreen() });
  for (const ev of ['maximize', 'unmaximize', 'enter-full-screen', 'leave-full-screen']) janela.on(ev, contarEstado);
  janela.webContents.on('did-finish-load', contarEstado);

  // Fechar esconde (o Loftchat segue na bandeja); "Sair" fecha de verdade.
  janela.on('close', (evento) => {
    if (saindo || bandeja === null || escolhas.aoFechar === 'sair') {
      // Fechar de vez (ou sem bandeja para voltar): sai do programa.
      if (!saindo && process.platform !== 'darwin') {
        saindo = true;
        app.quit();
      }
      return;
    }
    evento.preventDefault();
    janela.hide();
  });

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
    mostrarJanela();
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
    // Windows: as notificações saem com o nome e o ícone do Loftchat (o mesmo id do instalador).
    if (process.platform === 'win32') app.setAppUserModelId('br.com.loftchat');
    servirChat();

    // Microfone, notificação etc. só para o próprio Loft.
    session.defaultSession.setPermissionRequestHandler((conteudo, permissao, responder) => {
      responder(PERMITIDAS.has(permissao) && doLoft(conteudo.getURL()));
    });
    session.defaultSession.setPermissionCheckHandler((_conteudo, permissao, origemPedido) => {
      return PERMITIDAS.has(permissao) && doLoft(origemPedido);
    });

    ligarCompartilhamentoDeTela();
    ligarAvisos();
    lerEscolhas();
    ligarJanela();
    criarJanela();
    ligarBandeja();
    ligarAtualizacao();
  });

  // Qualquer saída de verdade (Sair da bandeja, atualização, desligar o PC) passa daqui.
  app.on('before-quit', () => {
    saindo = true;
  });

  app.on('window-all-closed', () => app.quit());
  app.on('will-quit', () => patchBay?.unlink());
}
