/*
 * JOGANDO AGORA (0.12.0) — o programa do PC olha os programas abertos e
 * reconhece jogos de qualquer loja.
 *
 * Como cada loja é reconhecida (sem ler nada fora da pasta do jogo e dos
 * arquivos de instalação das lojas):
 *   - Steam: o jogo mora em `steamapps/common/<pasta>`; o `appmanifest_*.acf`
 *     da mesma biblioteca diz o nome. No Linux (Proton), o `SteamAppId` do
 *     ambiente do processo diz qual é.
 *   - Epic: os manifestos `.item` (Windows) e o `installed.json` do
 *     Legendary/Heroic (Linux) dizem a pasta e o nome.
 *   - GOG: todo jogo da GOG tem `goggame-<id>.info` (JSON com `name`) na pasta.
 *   - EA, Ubisoft e Xbox: a pasta do jogo dentro da pasta da loja tem o nome.
 *   - Battle.net, Riot, Minecraft, Roblox e outros: lista de executáveis.
 *   - Lutris (Linux): os `.yml` dos jogos dizem o executável.
 *   - Qualquer outro: a pessoa escolhe o programa aberto (fica guardado aqui).
 *
 * Olha a cada 15 s. No Windows usa o `tasklist` (rápido) e só pergunta o
 * caminho ao PowerShell dos processos NOVOS.
 */

import { execFile } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, readlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';

const INTERVALO = 15_000;
const WINDOWS = process.platform === 'win32';

/** Executáveis conhecidos (minúsculo, sem .exe) → [nome, loja]. */
const CONHECIDOS = {
  'minecraft.windows': ['Minecraft', 'Minecraft'],
  robloxplayerbeta: ['Roblox', 'Roblox'],
  'league of legends': ['League of Legends', 'Riot'],
  'valorant-win64-shipping': ['VALORANT', 'Riot'],
  lor: ['Legends of Runeterra', 'Riot'],
  overwatch: ['Overwatch 2', 'Battle.net'],
  wow: ['World of Warcraft', 'Battle.net'],
  wowclassic: ['World of Warcraft Classic', 'Battle.net'],
  'diablo iv': ['Diablo IV', 'Battle.net'],
  'diablo iii64': ['Diablo III', 'Battle.net'],
  hearthstone: ['Hearthstone', 'Battle.net'],
  sc2_x64: ['StarCraft II', 'Battle.net'],
  cod: ['Call of Duty', 'Battle.net'],
  'fortniteclient-win64-shipping': ['Fortnite', 'Epic'],
  gta5: ['Grand Theft Auto V', null],
  gta5_enhanced: ['Grand Theft Auto V', null],
  rdr2: ['Red Dead Redemption 2', null],
  'genshinimpact': ['Genshin Impact', null],
  'zenlesszonezero': ['Zenless Zone Zero', null],
  'starrail': ['Honkai: Star Rail', null],
  'osu!': ['osu!', null],
};

/** Programas que NUNCA são o jogo (lojas, ajudantes, antitrapaça…). */
const NUNCA = /^(steam|steamwebhelper|steamservice|gameoverlayui|epicgameslauncher|epicwebhelper|galaxyclient|galaxyclient helper|gog galaxy notifications renderer|battle\.net|agent|eadesktop|eabackgroundservice|origin|upc|ubisoftconnect|uplaywebcore|riotclientservices|riotclientux|riotclientuxrender|riotclientcrashhandler|unitycrashhandler(32|64)|crashreportclient|easyanticheat.*|beservice|vgc|vgtray|xboxpcapp|gamingservices|gamebar|java|javaw|wine.*|wineserver|explorer|reaper|pressure-vessel.*|srt-bwrap|steam-runtime.*|proton|python.*|bash|sh|heroic|legendary|gogdl|lutris|umu-run|.*launcher.*|.*setup.*|.*install.*|.*crash.*|.*update.*|redist.*|vc_redist.*|dxsetup|uninst.*)$/i;

/** Programas comuns que nunca são jogo (para a lista de "escolher o programa aberto"). */
const PROGRAMAS_COMUNS = /^(brave|brave-browser|chrome|chromium|google-chrome|firefox|librewolf|msedge|opera|vivaldi|discord|vesktop|code|codium|cursor|electron|slack|spotify|obs|obs64|obs32|telegram-desktop|telegram|whatsapp|loftchat|nautilus|dolphin|thunar|xwayland|pipewire|wireplumber|pulseaudio|gnome-.*|kde.*|plasma.*|systemd|dbus-.*|xdg-.*|at-spi.*|node|npm|ollama|claude|gemini|teams|zoom|notepad|notepad\+\+|explorer|onedrive|nvidia.*|amd.*|radeon.*|razer.*|logi.*|corsair.*|msiafterburner|rtss|searchapp|startmenuexperiencehost|shellexperiencehost|textinputhost|widgets|phoneexperiencehost)$/i;

/** Pastas de "jogos" que não são jogos (Steam). */
const NAO_SAO_JOGOS = /^(steamworks shared|steamlinuxruntime.*|proton.*|steam controller configs)$/i;

let pastaDosDados = '';
let escolhidos = {}; // caminho do executável (minúsculo) → nome
let atual = null; // { chave, nome, loja, steamId, desde }
let avisar = () => {};
let relogio = null;
const visto = new Map(); // pid → { caminho, linha, ambiente } (o que já foi lido)
const veredito = new Map(); // caminho|linha → jogo ou null
const lidos = new Map(); // arquivo → conteúdo (cache curto)

/* ------------------------------ utilidades ------------------------------ */

function lerTexto(arquivo) {
  const g = lidos.get(arquivo);
  if (g !== undefined && g.ate > Date.now()) return g.texto;
  let texto = null;
  try {
    texto = readFileSync(arquivo, 'utf8');
  } catch {
    texto = null;
  }
  if (lidos.size > 500) lidos.clear();
  lidos.set(arquivo, { texto, ate: Date.now() + 5 * 60_000 });
  return texto;
}

function listar(pasta) {
  try {
    return readdirSync(pasta);
  } catch {
    return [];
  }
}

/** Barras sempre "/" para comparar caminhos de Windows e Linux do mesmo jeito. */
const normal = (c) => String(c).replace(/\\/g, '/');

function semExe(nome) {
  return nome.replace(/\.exe$/i, '');
}

/* --------------------------------- lojas --------------------------------- */

/** Steam pelo caminho: .../steamapps/common/<pasta>/... */
function steamPeloCaminho(caminho) {
  const c = normal(caminho);
  const achado = /^(.*\/steamapps)\/common\/([^/]+)\//i.exec(c);
  if (achado === null) return null;
  const [, biblioteca, pasta] = achado;
  if (NAO_SAO_JOGOS.test(pasta)) return null;
  // No Windows a pasta veio com "C:/…": funciona igual no readdirSync.
  for (const arq of listar(biblioteca)) {
    if (!/^appmanifest_\d+\.acf$/i.test(arq)) continue;
    const texto = lerTexto(join(biblioteca, arq));
    if (texto === null) continue;
    const dir = /"installdir"\s+"([^"]*)"/i.exec(texto)?.[1];
    if (dir === undefined || dir.toLowerCase() !== pasta.toLowerCase()) continue;
    const nome = /"name"\s+"([^"]*)"/i.exec(texto)?.[1];
    const id = /"appid"\s+"(\d+)"/i.exec(texto)?.[1];
    return { nome: nome ?? pasta, loja: 'Steam', steamId: id ? Number(id) : undefined };
  }
  return { nome: pasta, loja: 'Steam' };
}

/** As bibliotecas da Steam no Linux (para achar o manifesto pelo AppId). */
function bibliotecasSteam() {
  const casa = homedir();
  const raizes = [join(casa, '.steam', 'steam'), join(casa, '.local', 'share', 'Steam'), join(casa, '.var', 'app', 'com.valvesoftware.Steam', '.local', 'share', 'Steam')];
  const libs = new Set();
  for (const r of raizes) {
    const vdf = lerTexto(join(r, 'steamapps', 'libraryfolders.vdf'));
    if (vdf === null) continue;
    libs.add(join(r, 'steamapps'));
    for (const m of vdf.matchAll(/"path"\s+"([^"]+)"/g)) libs.add(join(m[1].replace(/\\\\/g, '\\'), 'steamapps'));
  }
  return [...libs];
}

function steamPeloId(id) {
  if (!/^\d+$/.test(id) || id === '0' || id === '228980' || id === '769') return null;
  for (const lib of bibliotecasSteam()) {
    const texto = lerTexto(join(lib, `appmanifest_${id}.acf`));
    if (texto === null) continue;
    const nome = /"name"\s+"([^"]*)"/i.exec(texto)?.[1];
    if (nome === undefined || /^(proton|steam linux runtime)/i.test(nome)) return null;
    return { nome, loja: 'Steam', steamId: Number(id) };
  }
  return null;
}

/** GOG: sobe as pastas procurando o goggame-<id>.info. */
function gogPeloCaminho(caminho) {
  let pasta = dirname(caminho);
  for (let i = 0; i < 4 && pasta.length > 3; i += 1) {
    const info = listar(pasta).find((a) => /^goggame-\d+\.info$/i.test(a));
    if (info !== undefined) {
      try {
        const dados = JSON.parse(lerTexto(join(pasta, info)) ?? '{}');
        if (typeof dados.name === 'string' && dados.name !== '') return { nome: dados.name, loja: 'GOG' };
      } catch {
        // .info estragado: segue procurando pelas outras lojas.
      }
    }
    pasta = dirname(pasta);
  }
  return null;
}

/** Epic: [pasta de instalação (minúsculo, "/"), nome]. */
function instalacoesEpic() {
  const lista = [];
  if (WINDOWS) {
    const pasta = join(process.env.ProgramData || 'C:\\ProgramData', 'Epic', 'EpicGamesLauncher', 'Data', 'Manifests');
    for (const arq of listar(pasta)) {
      if (!arq.toLowerCase().endsWith('.item')) continue;
      try {
        const d = JSON.parse(lerTexto(join(pasta, arq)) ?? '{}');
        if (typeof d.InstallLocation === 'string' && typeof d.DisplayName === 'string') lista.push([normal(d.InstallLocation).toLowerCase(), d.DisplayName, 'Epic']);
      } catch {
        // manifesto estragado: ignora.
      }
    }
  } else {
    const casa = homedir();
    const arquivos = [
      join(casa, '.config', 'heroic', 'legendaryConfig', 'legendary', 'installed.json'),
      join(casa, '.var', 'app', 'com.heroicgameslauncher.hgl', 'config', 'heroic', 'legendaryConfig', 'legendary', 'installed.json'),
      join(casa, '.config', 'legendary', 'installed.json'),
    ];
    for (const arq of arquivos) {
      try {
        const d = JSON.parse(lerTexto(arq) ?? '{}');
        for (const jogo of Object.values(d)) {
          if (typeof jogo?.install_path === 'string' && typeof jogo?.title === 'string') lista.push([normal(jogo.install_path).toLowerCase(), jogo.title, 'Epic']);
        }
      } catch {
        // sem Heroic/Legendary.
      }
    }
  }
  return lista;
}

/** Lutris: os .yml dos jogos dizem o executável; o nome vem do arquivo. */
function instalacoesLutris() {
  if (WINDOWS) return [];
  const casa = homedir();
  const lista = [];
  for (const pasta of [join(casa, '.config', 'lutris', 'games'), join(casa, '.local', 'share', 'lutris', 'games')]) {
    for (const arq of listar(pasta)) {
      if (!arq.endsWith('.yml')) continue;
      const exe = /^\s*exe:\s*['"]?(.+?)['"]?\s*$/m.exec(lerTexto(join(pasta, arq)) ?? '')?.[1];
      if (exe === undefined || !exe.startsWith('/')) continue;
      const nome = arq
        .replace(/\.yml$/, '')
        .replace(/-\d{6,}$/, '')
        .split('-')
        .map((p) => (p === '' ? p : p[0].toUpperCase() + p.slice(1)))
        .join(' ');
      lista.push([normal(dirname(exe)).toLowerCase(), nome, 'Lutris']);
    }
  }
  return lista;
}

let instalacoes = { lista: [], ate: 0 };
function porInstalacao(caminho) {
  if (instalacoes.ate < Date.now()) instalacoes = { lista: [...instalacoesEpic(), ...instalacoesLutris()], ate: Date.now() + 5 * 60_000 };
  const c = normal(caminho).toLowerCase();
  for (const [pasta, nome, loja] of instalacoes.lista) {
    if (pasta !== '' && (c.startsWith(`${pasta}/`) || c === pasta)) return { nome, loja };
  }
  return null;
}

/** EA, Ubisoft, Xbox e Riot: o nome da pasta do jogo dentro da pasta da loja. */
function pelaPastaDaLoja(caminho) {
  const c = normal(caminho);
  const regras = [
    [/\/EA Games\/([^/]+)\//i, 'EA'],
    [/\/Origin Games\/([^/]+)\//i, 'EA'],
    [/\/Ubisoft Game Launcher\/games\/([^/]+)\//i, 'Ubisoft'],
    [/\/XboxGames\/([^/]+)\//i, 'Xbox'],
  ];
  for (const [re, loja] of regras) {
    const m = re.exec(c);
    if (m !== null) return { nome: m[1], loja };
  }
  return null;
}

/** O que este programa é: um jogo ({ nome, loja, steamId? }) ou null. */
function reconhecer({ caminho, linha, ambiente }) {
  const marcado = caminho !== '' ? escolhidos[normal(caminho).toLowerCase()] : undefined;
  if (marcado !== undefined) return { nome: marcado, loja: null };

  // Linux/Proton: o processo do Wine tem o caminho do .exe na linha de comando.
  const alvo = caminho !== '' && !/\/wine[^/]*$|preloader$/i.test(caminho) ? caminho : '';
  const exeDaLinha = /([A-Za-z]:)?[\\/][^"]*?\.exe/i.exec(linha)?.[0] ?? '';
  const candidatos = [alvo, normal(exeDaLinha).replace(/^[A-Za-z]:/, (d) => (WINDOWS ? d : ''))].filter((c) => c !== '');

  // Minecraft Java: o "java" com o jogo na linha de comando.
  if (/net\.minecraft\.|minecraft\.client|--gameDir\s+\S*minecraft/i.test(linha)) return { nome: 'Minecraft', loja: 'Minecraft' };

  const steamId = /(?:^|\0)SteamAppId=(\d+)/.exec(ambiente)?.[1] ?? /\bAppId=(\d+)/.exec(linha)?.[1];
  if (steamId !== undefined) {
    const s = steamPeloId(steamId);
    if (s !== null) return s;
  }

  for (const c of candidatos) {
    const exe = semExe(basename(normal(c))).toLowerCase();
    if (NUNCA.test(exe)) continue;
    const conhecido = CONHECIDOS[exe];
    if (conhecido !== undefined) return { nome: conhecido[0], loja: conhecido[1] };
    const achado = steamPeloCaminho(c) ?? porInstalacao(c) ?? gogPeloCaminho(c) ?? pelaPastaDaLoja(c);
    if (achado !== null) return achado;
  }
  return null;
}

/* ------------------------- os processos abertos ------------------------- */

/** Linux: pid → { caminho, linha, ambiente } dos processos desta pessoa. */
function processosLinux() {
  const saida = new Map();
  for (const pid of listar('/proc')) {
    if (!/^\d+$/.test(pid)) continue;
    const antes = visto.get(pid);
    if (antes !== undefined) {
      saida.set(pid, antes);
      continue;
    }
    let caminho = '';
    let linha = '';
    let ambiente = '';
    try {
      caminho = readlinkSync(`/proc/${pid}/exe`);
      linha = readFileSync(`/proc/${pid}/cmdline`, 'utf8').replace(/\0/g, ' ').slice(0, 4000);
      ambiente = readFileSync(`/proc/${pid}/environ`, 'utf8');
      const appId = /(?:^|\0)SteamAppId=\d+/.exec(ambiente)?.[0] ?? '';
      ambiente = appId; // só o que interessa; o resto do ambiente não fica guardado
    } catch {
      continue; // processo de outro usuário ou que já fechou
    }
    saida.set(pid, { caminho, linha, ambiente });
  }
  return saida;
}

function rodar(programa, argumentos) {
  return new Promise((pronto) => {
    execFile(programa, argumentos, { windowsHide: true, maxBuffer: 8 * 1024 * 1024, timeout: 20_000 }, (erro, saida) => pronto(erro ? '' : String(saida)));
  });
}

/** Windows: o tasklist dá os pids; o PowerShell, o caminho dos pids novos. */
async function processosWindows() {
  const lista = await rodar('tasklist', ['/fo', 'csv', '/nh']);
  const pids = new Map();
  for (const l of lista.split(/\r?\n/)) {
    const m = /^"([^"]*)","(\d+)"/.exec(l);
    if (m !== null) pids.set(m[2], m[1]);
  }
  const novos = [...pids.entries()].filter(([pid, nome]) => !visto.has(pid) && !NUNCA.test(semExe(nome)) && !/^(svchost|system|registry|smss|csrss|wininit|services|lsass|winlogon|dwm|fontdrvhost|conhost|runtimebroker|searchhost|sihost|taskhostw|ctfmon|dllhost|audiodg|spoolsv|msedge|chrome|firefox|opera|brave|discord|loftchat|code|powershell|cmd|tasklist|wmiprvse)\.exe$/i.test(nome));
  if (novos.length > 0) {
    const filtro = novos.slice(0, 200).map(([pid]) => `ProcessId=${pid}`).join(' OR ');
    const script = `Get-CimInstance Win32_Process -Filter "${filtro}" | ForEach-Object { "$($_.ProcessId)\`t$($_.ExecutablePath)\`t$($_.CommandLine)" }`;
    const texto = await rodar('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script]);
    const achados = new Map();
    for (const l of texto.split(/\r?\n/)) {
      const [pid, caminho = '', linha = ''] = l.split('\t');
      if (pid && /^\d+$/.test(pid)) achados.set(pid, { caminho, linha: linha.slice(0, 4000), ambiente: '' });
    }
    for (const [pid, nome] of novos) visto.set(pid, achados.get(pid) ?? { caminho: '', linha: nome, ambiente: '' });
  }
  const saida = new Map();
  for (const [pid, nome] of pids) saida.set(pid, visto.get(pid) ?? { caminho: '', linha: nome, ambiente: '' });
  return saida;
}

/* ------------------------------ a varredura ------------------------------ */

async function olhar() {
  const processos = WINDOWS ? await processosWindows() : processosLinux();
  // Esquece quem fechou.
  for (const pid of visto.keys()) if (!processos.has(pid)) visto.delete(pid);
  if (!WINDOWS) for (const [pid, p] of processos) visto.set(pid, p);

  let achado = null;
  for (const p of processos.values()) {
    const chave = `${p.caminho}|${p.linha}|${p.ambiente}`;
    let jogo = veredito.get(chave);
    if (jogo === undefined) {
      jogo = reconhecer(p);
      if (veredito.size > 3000) veredito.clear();
      veredito.set(chave, jogo);
    }
    if (jogo === null) continue;
    // O que já estava aberto continua sendo "o jogo" enquanto estiver aberto.
    if (atual !== null && jogo.nome === atual.nome) {
      achado = atual;
      break;
    }
    achado ??= jogo;
  }

  if (achado === null && atual !== null) {
    atual = null;
    avisar(null);
  } else if (achado !== null && achado !== atual && achado.nome !== atual?.nome) {
    atual = { ...achado, desde: Date.now() };
    avisar(atual);
  }
}

/* --------------------- "escolher o programa aberto" --------------------- */

/** Os programas abertos que podem ser um jogo (para a pessoa escolher). */
export async function programasAbertos() {
  const processos = WINDOWS ? await processosWindows() : processosLinux();
  const unicos = new Map();
  for (const p of processos.values()) {
    const caminho = p.caminho;
    // Linux: programa que foi atualizado/apagado com ele aberto ("… (deleted)").
    if (caminho === '' || caminho.endsWith(' (deleted)')) continue;
    const c = normal(caminho);
    if (/^[a-z]:\/windows\//i.test(c) || /^\/(usr|bin|sbin|lib|opt\/google|snap)\//.test(c) || c.includes('/Loftchat')) continue;
    const exe = semExe(basename(c));
    if (NUNCA.test(exe) || PROGRAMAS_COMUNS.test(exe)) continue;
    unicos.set(c.toLowerCase(), { caminho, nome: exe });
  }
  return [...unicos.values()].sort((a, b) => a.nome.localeCompare(b.nome)).slice(0, 80);
}

function guardarEscolhidos() {
  try {
    writeFileSync(join(pastaDosDados, 'jogos.json'), JSON.stringify({ escolhidos }, null, 1));
  } catch (erro) {
    console.error('Não deu para guardar os jogos escolhidos.', erro);
  }
}

export function marcarJogo(caminho, nome) {
  const c = normal(String(caminho)).toLowerCase();
  const n = String(nome).trim().slice(0, 80);
  if (c === '' || n === '') return;
  escolhidos[c] = n;
  veredito.clear();
  guardarEscolhidos();
  void olhar();
}

export function esquecerJogo(caminho) {
  delete escolhidos[normal(String(caminho)).toLowerCase()];
  veredito.clear();
  guardarEscolhidos();
  void olhar();
}

export function jogosEscolhidos() {
  return Object.entries(escolhidos).map(([caminho, nome]) => ({ caminho, nome }));
}

export function jogoAtual() {
  return atual;
}

/** Liga a varredura. `aoMudar(jogo | null)` a cada troca. */
export function ligarDeteccao(pasta, aoMudar) {
  pastaDosDados = pasta;
  avisar = aoMudar;
  const arquivo = join(pasta, 'jogos.json');
  if (existsSync(arquivo)) {
    try {
      escolhidos = JSON.parse(readFileSync(arquivo, 'utf8')).escolhidos ?? {};
    } catch {
      escolhidos = {};
    }
  }
  if (relogio !== null) return;
  const volta = () => {
    olhar()
      .catch((erro) => console.error('Jogando agora: falhou ao olhar os programas.', erro))
      .finally(() => {
        relogio = setTimeout(volta, INTERVALO);
      });
  };
  relogio = setTimeout(volta, 3000);
}

/** Para os testes: reconhecer um programa sem abrir nada. */
export const _reconhecer = reconhecer;
