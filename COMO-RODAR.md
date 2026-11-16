# Como rodar o Loft num computador novo

> **Ao abrir um chat novo com o Claude Code, peça para ele ler o PROGRESSO.md e o histórico do git antes de começar.**

Este guia leva um computador zerado (Linux ou Windows) até o ponto de rodar o
app, a suíte de testes e o deploy. O diário completo do projeto — decisões,
bugs conhecidos, pendências — está em [PROGRESSO.md](PROGRESSO.md).

## 1. Programas necessários

| Programa | Versão usada no projeto | Para quê |
| --- | --- | --- |
| Git | 2.43 | clonar e versionar |
| Node.js | **24.x** (24.20.0) — mínimo `20.19` ou `22.12`, exigido pelo Vite 8 | app, build, testes |
| Java (JRE) | **21** (OpenJDK) | o emulador do Firestore é um programa Java |
| Firebase CLI (`firebase-tools`) | 15.x (15.28.2) | emulador, login, deploy |

### Linux (Ubuntu / Linux Mint)

```bash
sudo apt install git openjdk-21-jre-headless

# Node pelo nvm — o nodejs do apt (18.x) é velho demais para o Vite 8
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
# feche e reabra o terminal
nvm install 24

npm install -g firebase-tools
```

Cuidado com o nvm: o `firebase` instalado com `npm install -g` fica preso
àquela versão de Node. Se você trocar de versão com `nvm use`/`nvm install`,
rode `npm install -g firebase-tools` de novo.

### Windows

- Git: <https://git-scm.com/download/win>
- Node 24 LTS: <https://nodejs.org> (ou `winget install OpenJS.NodeJS.LTS`)
- Java 21: <https://adoptium.net> (Temurin 21 JRE), marcando a opção de
  adicionar ao `PATH`. Confira com `java -version` num terminal novo.
- Firebase CLI: `npm install -g firebase-tools`

> O projeto rodou no Windows até a etapa 15 e no Linux Mint a partir da etapa
> 16. Os scripts atuais (`scripts/emulator.mjs`, `scripts/real.mjs`) foram
> escritos para funcionar nos dois, mas desde a migração só foram exercitados
> no Linux.

## 2. Baixar o código e instalar dependências

```bash
git clone git@github.com:Lelokz/Loftchat.com.br.git Loft
cd Loft
npm install
npx playwright install chromium
```

Só no Linux, uma vez, para as bibliotecas de sistema do navegador de teste:

```bash
sudo env PATH=$PATH npx playwright install-deps chromium
```

(O `env PATH=$PATH` é necessário porque o `root` não enxerga o Node do nvm.)

Nunca copie a pasta `node_modules` de outra máquina: ela tem binários nativos
do sistema em que foi instalada. Sempre `npm install` do zero.

## 3. Criar o `.env`

```bash
cp .env.example .env        # Windows (cmd): copy .env.example .env
```

Preencha as variáveis (o `.env` está no `.gitignore` e nunca vai para o git):

| Variável | O que é | De onde tirar |
| --- | --- | --- |
| `VITE_TURN_USERNAME` | usuário do servidor TURN | painel do ExpressTURN (<https://www.expressturn.com>), na conta do projeto |
| `VITE_TURN_CREDENTIAL` | senha do servidor TURN | mesmo painel; se for regenerada lá, atualize aqui e faça deploy de novo |

Sem as duas, o app funciona do mesmo jeito, só que as chamadas de voz ficam
apenas com STUN. Quem está atrás de NAT restritivo pode não conseguir entrar
na sala, e o app avisa no console e no painel de diagnóstico (Ctrl+Alt+V
dentro da sala).

A configuração web do Firebase (`apiKey`, `projectId` etc., em
`src/lib/firebase.ts`) não vai no `.env`: ela é pública por natureza e já está
no código.

## 4. Login no Firebase

Rode no **seu** terminal, porque o comando abre o navegador:

```bash
firebase login
firebase projects:list      # loft-3d6c0f precisa aparecer na lista
firebase use                # deve responder: Active Project: default (loft-3d6c0f)
```

O projeto padrão vem do `.firebaserc` versionado, então não é preciso rodar
`firebase use --add`.

## 5. Desenvolvimento

```bash
npm run dev        # app em http://localhost:5173, falando com o PROJETO REAL
npm run dev:emu    # app dentro do emulador, sem gastar cota (tarja vermelha "EMULADOR" na tela)
npm run typecheck  # checagem de tipos
```

Se a tarja vermelha `EMULADOR` não aparece, você está em produção.

## 6. Testes

```bash
npm test           # suíte inteira no EMULADOR (sobe e derruba sozinho)
```

Para rodar só um arquivo ou só um teste, aponte por arquivo ou por linha (não
use `-g "filtro"`):

```bash
node scripts/emulator.mjs playwright test tests/dm.spec.ts
node scripts/emulator.mjs playwright test tests/loft.spec.ts:2555
```

**Nunca rode `npx playwright test` direto.** Ele é recusado de propósito,
porque fora do emulador iria para o projeto real.

Comandos que falam com o **projeto real** (criam contas de verdade e consomem
cota; use com consciência):

```bash
npm run check:indexes   # confere os índices compostos (precisa do .check-indexes.json, ver seção 8)
npm run test:turn       # testa o servidor TURN (precisa do .env preenchido)
npm run test:real       # escotilha: parte da suíte contra produção
```

## 7. Deploy

```bash
npm run deploy                                             # publica o SITE (pasta site/)
firebase deploy --only firestore:rules,firestore:indexes   # regras e índices (separado)
```

Desde 16/11/2026 o `loftchat.com.br` é o **site de apresentação** (`site/`),
não o chat. O chat (`npm run build` → `dist/`) não vai mais para o hosting:
ele vai dentro do programa e do app. O build embute os valores do `.env`:
sem TURN preenchido, o app fica sem TURN. Depois de mexer
em índices, espere ficarem READY no console do Firebase e rode
`npm run check:indexes`.

## 8. Recriar o `.check-indexes.json`

Este arquivo é local (está no `.gitignore`) e some em toda máquina nova. Sem
ele, `npm run check:indexes` não roda. Os passos estão em
[PROGRESSO.md](PROGRESSO.md), seção **"Pendências acumuladas"**, item sobre
`.check-indexes.json`. Resumindo:

1. `npm run dev` (projeto real).
2. Cadastrar pela tela uma conta com um e-mail de verdade que você consiga abrir.
3. Confirmar pelo link que chega nesse e-mail.
4. Criar `.check-indexes.json` na raiz com
   `{ "email": "...", "password": "...", "displayName": "Índices" }`.

Antes de rodar `scripts/limpar-projeto-real.mjs --manter=...`, inclua o e-mail
dessa conta em `--manter`, senão ela é apagada junto.

## 9. O que nunca vai para o git

`.env`, `.check-indexes.json`, `node_modules/`, `dist/`, `.firebase/`, dados
exportados do emulador, `playwright-report/`, `test-results/`, `screenshots/`,
logs e qualquer JSON de conta de serviço. Tudo isso já está no `.gitignore`.

## 10. Janela do Loft (app de computador)

O app fica em `desktop/` (Electron). O npm desta máquina não roda scripts de
instalação, então o binário do Electron é baixado à parte:

```bash
cd desktop
npm install
electron_config_cache=<pasta de cache> node node_modules/electron/install.js
cd ..
npm run janela      # monta o chat (npm run build:desktop → desktop/app) e abre o programa
```

Desde a etapa 9a o chat mora DENTRO do programa: `desktop/app/` (gerado, fora
do git) é servido em `app://loftchat/`, falando com o projeto real. Os testes
montam o seu próprio, apontado para o emulador, e abrem com `LOFT_PASTA`.
`LOFT_URL` (um servidor, ex.: o Vite) continua valendo para desenvolver.

No PC do Leo, `desktop/node_modules` NÃO fica no SSD: é um atalho para
`/mnt/cab1286d-6765-4c73-9c77-8d3119b4b644/Arquivo/Loft-desktop/instalar/node_modules`.
O `npm install` apaga o atalho e cria uma pasta de verdade — por isso a
instalação é feita em `Arquivo/Loft-desktop/instalar/` (cópia do
`package.json` e do `package-lock.json`) e o atalho é refeito depois:

```bash
ln -sfn /mnt/cab1286d-6765-4c73-9c77-8d3119b4b644/Arquivo/Loft-desktop/instalar/node_modules desktop/node_modules
```

Os testes da janela (`tests/desktop.spec.ts`) entram no `npm test` e pulam
sozinhos sem o Electron instalado. Para não abrir janela na tela, rode a
suíte numa tela invisível COM gerenciador de janelas (sem ele o seletor de
tela vem vazio):

```bash
scripts/tela-de-teste.sh npm test
```

A suíte é muda (`--mute-audio`): a tela invisível não esconde o som.
