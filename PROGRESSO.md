# Loft — progresso

Estado em 15/11/2026.

## Reportar bug (26/11/2026) — versão 0.13.0

Maquete aprovada (Arquivo/Loft-desktop/maquete-reportar-bug, PC e celular).

1. **A aba** (`components/reportar-bug/`, prefixo `rbg-`): Configurações →
   Reportar bug (seção Loftchat). "Novo reporte | Meus reportes · N";
   título, categoria (13, `lib/reportes-comum.ts`; no celular a lista vira
   gaveta), texto, áudio (o gravador do chat), até 5 anexos e "Tirar print
   agora" (só no PC novo: `loft:tirar-print` = `capturePage` da própria
   janela). "Vai junto": versão, aparelho, sistema e tela. Mandou → pula
   para a lista. Sem aviso de conserto: o estado fica só ali.
2. **O carteiro** (`carteiro/src/reportes.ts`): `POST /reportes` (5 por dia,
   dia de Brasília, em `reportesInterno/{uid}`); arquivos pelo
   `POST /arquivo?tipo=reporte` (pasta fechada). `reportes/{id}`: só o dono
   lê, só o carteiro grava.
3. **O lado do criador**: `/reportes/admin/lista`, `/reportes/admin/arquivo/<chave>`
   e `POST /reportes/admin` (visto / confirmar / consertado + versão), com a
   chave `CHAVE_REPORTES` (segredo do carteiro; cópia no HD em
   Arquivo/Loft-desktop/reportes/chave.txt). Ferramenta: Arquivo/Loft-desktop/reportes/olhar.mjs.
4. **Caçador de bugs** em série (`bug1/bug2/bug3`, 1/5/15, rara/épica/lendária),
   contador `n.bugs`: sobe ao confirmar (uma vez por reporte,
   `marcasDeConquista/bug_<id>`). A coleção passa a ser "de 100".
5. Teste: `tests/reportar-bug.spec.ts`.

## Insígnias do servidor e as especiais (26/11/2026) — versão 0.12.5

Maquete aprovada (Arquivo/Loft-desktop/maquete-insignias-servidor, PC e
celular; o jeito de dar as especiais refeito: Painel do Criador + presente).

1. **Raridades** (`lib/insignias.ts`): Exclusiva e Especial, cromadas
   (`CROMOS`: vários pontos de cor + película de arco-íris + brilho que
   passa). Épica lilás. Criador do Loftchat (Especial, roxo), Confidente e
   Linha de Frente (Exclusivas, ouro e prata; o id da última continua
   `testador`). As especiais não entram na conta da coleção ("de 98").
2. **O nome que brilha** (`lib/brilho.ts`, `users/{uid}.brilho`, só o
   carteiro grava): `corDoCargo` pinta o nome (mensagens, membros, sala,
   privado, amigos, cartão, perfil, meu canto); a foto do Criador ganha o
   aro (`avatar--criador`).
3. **Painel do Criador** (Configurações → Criador, só para o @ de
   `env.CRIADOR`, padrão lelokz) e **o presente** (`carteiro/src/especiais.ts`,
   `POST /especiais` listar/buscar/dar/tirar/abrir): dar = mensagem
   `presente` no privado (só o carteiro cria); abrir grava a insígnia e o
   brilho e mostra a tela cheia (`components/insignias/presente.ts`).
   Quem tem o quê em `especiais/estado` (fechado).
4. **Insígnias do servidor** (`lib/insignias-grupo.ts`, o mesmo no app e
   no carteiro; `carteiro/src/insignias-grupo.ts`): `insigniasDoGrupo`,
   `insigniasDoGrupoInterno` (a frase secreta) e
   `insigniasDoMembro/{grupo}_{uid}` (tem + contadores por grupo). As ações
   vêm pelo `POST /cargos` (insignia-salvar/apagar/dar/tirar/ler) com as
   permissões novas e a hierarquia. A contagem usa os mesmos ganchos das
   insígnias do Loft (avisar, reagir, voz, jogo, conferir) e só gasta em
   grupo que tem insígnia. Criar/editar conta o histórico de mensagens e
   mídia (índices novos groupId+authorId[+channelId|kind]).
5. **Telas** (`components/insignias-servidor`): aba Insígnias e a tela de
   criar (prévia ao vivo, 62 ícones, raridade, como ganhar, opções; tela
   cheia no celular), a fileira "Insígnias do grupo" no cartão com o "+"
   de dar/tirar, a aba do grupo no perfil completo e o aviso com o nome do
   grupo.
6. Teste: `tests/insignias-servidor.spec.ts`.

## Jogos, perfil completo e insígnias (26/11/2026) — versão 0.12.0

Maquetes aprovadas (Arquivo/Loft-desktop/maquete-jogos e maquete-insignias,
PC e celular).

1. **Jogando agora** (`desktop/jogos.mjs`): o programa do PC olha os
   processos a cada 15 s (Windows: `tasklist` + PowerShell só nos pids
   novos; Linux: `/proc`). Steam pelo `steamapps/common/<pasta>` +
   `appmanifest_*.acf` (no Linux/Proton pelo `SteamAppId` do ambiente),
   Epic pelos `.item` (Windows) e `installed.json` do Legendary/Heroic,
   GOG pelo `goggame-<id>.info`, EA/Ubisoft/Xbox pela pasta da loja,
   Battle.net/Riot/Minecraft/Roblox por lista, Lutris pelos `.yml`; e
   "escolher o programa aberto" (guardado em `userData/jogos.json`). O
   chat grava `jogando/{uid}` (`lib/jogando.ts`) com batida de 90 s e
   `visto` = hora do servidor; quem lê ignora o que passou de 4 min.
   Aparece na lista de membros, no cartão, na aba Agora e na prévia.
2. **Jogos do perfil** (`lib/jogos-perfil.ts`, `users/{uid}.jogos`):
   favorito + frase, até 5 "ultimamente" (até 2 etiquetas), até 20 "quero
   jogar". Regra `jogosOk` (capa só Steam/IGDB). Catálogo pelo carteiro
   (`carteiro/src/jogos.ts`, `GET /jogos/busca`): IGDB com a chave da
   Twitch (segredos IGDB_ID/IGDB_SEGREDO); sem a chave, a busca da Steam.
   Configurações → Jogos (`settings/jogos-section.ts`), salva na hora.
3. **Perfil completo** (`components/perfil-completo`): janela no PC, tela
   cheia no celular; abas Jogos, Insígnias e Amigos em comum (pelo
   carteiro, `POST /amigos-em-comum`).
4. **Insígnias** (`lib/insignias.ts`, o mesmo no app e no carteiro): 100,
   cada uma com `conta` + `alvo`. Quem conta é o carteiro
   (`carteiro/src/insignias.ts`): a mensagem no `/avisar`; reagir, editar,
   fixar, batida de chamada (5 min), batida de jogo (5 min) e "conferir"
   (amigos, grupos, convites, cargo, tempo de conta, perfil) no
   `POST /conquistas`, sempre conferindo no banco. `insignias/{uid}` (tem +
   contadores; a pessoa só mexe no `avisadoAte`), `insigniasInterno/{uid}`
   e `marcasDeConquista/{chave}` (contar uma vez só) fechados. Na primeira
   conferida conta o histórico de mensagens e mídia (índices novos
   authorId+kind). Especiais por @ no `wrangler.toml` (ESPECIAIS).
   Desenhos em `components/insignias/desenhos.ts`; aviso no canto (padrão
   inferior direito, Configurações → Notificações), largura toda no
   celular; até 5 no cartão (`users.insigniasNoCartao`, regra confere que
   tem).

Testes: `jogos-insignias.spec.ts` (2) e `desktop.spec.ts` → "jogando agora"
(LOFT_JOGO_TESTE finge o jogo). Publicar = regras + índices + carteiro +
versão.

## Reações só pelo botão direito (25/11/2026) — versão 0.11.5

O Léo pediu: a barrinha que aparecia ao passar o mouse na mensagem saiu
(`instalarBarraDeReacoes` apagada). Reação, Responder e Encaminhar ficam no
menu do botão direito / toque longo.

## Reações, encaminhar, arquivos e silenciar (25/11/2026) — versão 0.11.0

Maquetes aprovadas (Arquivo/Loft-desktop/maquete-reacoes e maquete-silenciar).

1. **Permissões que faltavam**: "Mandar visualização única" (menu do + e
   regras: `podeNoCanal` no carteiro e nas regras) e "Usar transcrição"
   (botão escondido sem permissão; carteiro recusa).
2. **Reações** (`components/reacoes`): campo `reacoes: {uid: string[]}` na
   mensagem; regra `soMinhaReacao()` (cada um só mexe na sua chave, até 6).
   Pílulas embaixo do balão, barrinha no hover do PC, fileira de emojis no
   menu, folha no toque longo do celular (engole o toque até soltar o dedo
   +250 ms, senão reagia sem querer). Teste `reacoes.spec.ts`.
3. **Encaminhar** (`components/encaminhar`): até 5 destinos (privado e
   canais de todos os grupos), anexo reaproveitado (não sobe de novo),
   `encaminhada: true`. Visualização única e registro de ligação não vão.
   Teste `encaminhar.spec.ts`.
4. **Arquivos** (`components/arquivo`): tipo `file`, carteiro tipo
   `arquivo` até 50 MB, servido SEMPRE como download (octet-stream,
   content-disposition, nosniff, CSP sandbox). Aviso em programa. Cargo
   "Mandar arquivos". Teste `mandar-arquivos.spec.ts`.
5. **Silenciar** (`lib/silencios.ts`): `silencios/{uid}.mapa` com
   `c_<canal>`, `g_<grupo>`, `p_<amigo>` → ISO ou "sempre". O carteiro lê
   junto com os aparelhos e pula quem silenciou (ligação ainda toca). Não
   lidas do silenciado ficam cinza e fora das contas. Submenu no menu de
   contexto (no toque vira folha com título); menu do privado (Marcar como
   lido, Silenciar conversa, Ver perfil); chip "Silenciado até…" no topo.
   Consertado junto: tocar num menu aberto da gaveta do celular fechava a
   gaveta. Teste `silenciar.spec.ts`.

## Transcrição das mensagens de voz (25/11/2026) — versão 0.10.5

Plano e maquete aprovados (Arquivo/Loft-desktop/maquete-transcricao).

1. **Carteiro** (`carteiro/src/transcricao.ts`, `POST /transcrever`): Whisper
   large-v3-turbo do Workers AI (binding `AI` no wrangler.toml). Grátis até
   10.000 neurons/dia (~214 min de áudio); passou, a Cloudflare dá erro (não
   cobra) e o app avisa "volta às 21h". Antes de construir, testado com o
   Whisper de verdade (pasta Arquivo/Loft-desktop/teste-whisper, worker só
   local): webm/opus, ogg/opus e m4a/aac funcionam (~2,5 s para 25 s de
   áudio); com `vad_filter` silêncio e ruído voltam vazios (sem frase
   inventada) — e ainda corta as frases fantasmas conhecidas. Confere quem
   pede (`podeVer`, o mesmo da visualização única), grava `transcricao`
   {texto, idioma, em} NA MENSAGEM (a regra do app só deixa mexer em
   body/editedAt, então só o carteiro escreve), já transcrita não gasta de
   novo, 30 por hora por pessoa. Nos testes, `WHISPER_FALSO` (nada vai para
   a Cloudflare; arquivo "limite" simula o limite do dia).
2. **App** (`components/voz/transcricao.ts`): botão de linhas dentro do
   balão de voz, "Transcrevendo…", texto embaixo das ondas para todos,
   esconder/mostrar só para mim, "Sem fala neste áudio", avisos de limite.
3. **Testes**: `transcricao.spec.ts` (carteiro + app no PC e no celular).

## Visualização única (25/11/2026) — versão 0.10.0

Plano e maquete aprovados (Arquivo/Loft-desktop/maquete-unica). Seis etapas:

1. **Carteiro + regras**: `tipo=unica` sobe em `unica/<uid>/…`, pasta que o
   GET público de /arquivo RECUSA (`FECHADAS`). Só sai por `POST /unica/abrir`
   (`carteiro/src/unica.ts`): confere a mensagem (`unica.vezes` 1–5, anexo na
   pasta fechada), quem pede (PV: o par; grupo: `quemVeOCanal`), que não é o
   autor e que tem menos de 14 dias; conta +1 em `unicas/{msg}_{uid}` numa
   TRANSAÇÃO (beginTransaction + batchGet + commit — o GET com `transaction`
   trava no emulador e o `currentDocument.updateTime` não funciona nele) e só
   então entrega o arquivo, sem cache. No PV a última vez apaga o arquivo; a
   limpeza diária apaga `unica/` com 14 dias. Regras: `unicaOk` nas duas
   coleções de mensagem (e mensagem sem `unica` não aponta para a pasta
   fechada); `unicas` só o carteiro escreve, leem quem abriu e quem mandou.
2. **Mandar**: o + virou menu (itens "ricos" no `context-menu`, com ícone e
   explicação); `components/unica/mandar.ts` com prévia, legenda e 1–5
   (começa em 1). Sem capa; aviso/lista de conversas/citação/fixada mostram
   só o rótulo, nunca a legenda.
3. **Balão** (`components/unica/balao.ts`): nada da foto; `lib/unicas.ts`
   escuta `unicas` (as que abri / quem abriu as minhas) e o balão se atualiza
   sozinho. Fora da galeria; fixada sem o arquivo; sem "Editar".
4. **Ver** (`components/unica/ver.ts`): tela cheia, sem baixar/copiar/
   arrastar/botão direito, "1ª de 3 vezes", legenda, quantas sobram; vídeo
   toca uma vez.
5. **Print**: `lib/protecao-de-tela.ts` — Android `FLAG_SECURE`
   (`PluginDaTela.proteger`), PC `setContentProtection` (Windows/Mac; Linux e
   navegador não têm como).
6. **Testes**: `unica.spec.ts` (carteiro/regras, aberturas simultâneas, PV de
   ponta a ponta, vídeo no grupo no celular); `midia`/`galeria` pelo menu.

## Câmera e ligação no privado (25/11/2026) — versão 0.9.5

Plano e maquete aprovados (Arquivo/Loft-desktop/maquete-camera). Seis etapas:

1. **Motor**: a câmera é a QUARTA linha de cada conexão (`addTransceiver`
   depois de microfone, som da tela e vídeo da tela), reservada desde o
   começo — ligar/desligar é `replaceTrack`, sem renegociar. Quem está numa
   versão velha adota as três dele e só não recebe a câmera. `ehCamera`
   reconhece a linha pela ordem (segunda de vídeo). Qualidade: 720p30
   pedido, orçamento de 3 Mbit/s dividido entre os pares (teto 1,2 por par,
   0,5 em relay) e resolução menor com a sala cheia (`qualidadeDaCamera`).
   Roster ganha `camera`/`cameraPausada`; regras cobram "Ligar câmera".
2. **Sala**: botão na sala e na barrinha, prévia (`components/camera/previa.ts`,
   escolher câmera e espelhar), vídeo no bloco (`camSlots`, o <video> é do
   motor e só é MOVIDO), foco no palco (clicar), tela cheia (duplo clique),
   esconder quem está sem câmera, limite de 8 (`MAX_CAMERAS`).
3. **Celular**: permissão CAMERA no manifesto (o Capacitor já pede), virar
   frente/trás, pausa ao esconder o app (`visibilitychange`) e volta pedindo
   a câmera de novo se o Android tiver cortado.
4. **Configurações → Voz e vídeo**: câmera, testar com prévia, espelhar
   (`lib/camera-settings.ts`, neste aparelho). Trocar com ela ligada troca na
   chamada.
5. **Ligação no PV**: a mesma voz dos grupos num "grupo" `pv_{a}_{b}` (regras:
   `ehDoPv`, só os dois, sem bloqueio). Toque em `chamadas/{a}_{b}` (tocando →
   atendida/recusada/perdida/cancelada/encerrada). Cartão no PC / tela cheia
   no celular com toque gerado na hora. 30 s sem resposta = perdida. Registro
   no chat (`chamada` na mensagem do PV). Achados: a lista da ligação que vem
   do CACHE trazia o outro da ligação anterior e encerrava a nova sozinha
   (agora o outro só conta depois de atender); sinalização velha limpa nos
   dois sentidos antes de ligar; sair da voz tolerante a escrita em voo.
6. **Aviso com o app fechado**: `avisar` do carteiro com `tipo: chamada`
   (confere quem ligou, tocando e recente); Android em canal "Chamadas" com
   o toque de chamada, some em 30 s; PC pelo `avisos/{uid}`.

Testes: `camera.spec.ts`, `ligacao.spec.ts`, `voz-audio.spec.ts` (vídeo),
`carteiro.spec.ts` (aviso de chamada).

## Fotos e vídeos da galeria no celular (25/11/2026) — versão 0.9.0

Bug: no Android 13+, `<input type=file accept="image/*,video/*">` cai no
seletor de fotos do sistema, que devolve `content://media/picker/...` com
data/tamanho que mudam entre consultas; o WebView recusa ler
(NotReadableError / ERR_UPLOAD_FILE_CHANGED, Chromium 40123366). Nenhuma
foto, GIF ou vídeo abria ("Não deu para abrir essa imagem").

- `SeletorDeMidia.java` (herda o BridgeWebChromeClient do Capacitor):
  pedido só de imagem/vídeo → seletor de fotos do sistema (PickVisualMedia /
  PickMultipleVisualMedia, até 20) → cada arquivo COPIADO para
  `cache/escolhidos/` e entregue por FileProvider (data e tamanho fixos).
  Acima de 60 MB vai o original (a página recusa pelo tamanho). Cópias de
  mais de 1 hora são apagadas. Câmera e outros tipos: seletor do Capacitor.

## Cargos, permissões, moderação e comandos (25/11/2026) — versão 0.8.5

Plano aprovado (modelo do Discord de verdade, lido em docs.discord.com:
cargo LIVRE, só Dono + Administrador pré-definidos, @todos = o básico).

- **Dados**: `cargos/{id}` (o @todos = `${groupId}_todos`), `memberships`
  ganha `cargos`, e o CARTEIRO grava `perms`, `topo`, `canais` (canal a
  canal, só onde há regra), `castigoAte` (timestamp) e `apelido`. Canal:
  `permissoes` (regras ✓/✗ por alvo: cargo, 'todos', 'u:<uid>') e `lento`.
  Categoria: `groups.permsCategorias[catId]` (canal sem regra própria =
  sincronizado com a categoria). `registro`, `banidos`, `comandos`, `lentos`.
- **Cálculo** (src/lib/permissoes.ts, o MESMO código no app e no carteiro):
  @todos + cargos somados; "administrador"/dono = tudo; no canal @todos →
  cargos (nega, depois permite) → pessoa; negar "ver" tira o resto.
- **Carteiro** `POST /cargos {grupo, acao}`: criar/salvar/apagar/ordenar/dar
  cargo, regras de canal/categoria, expulsar, castigo, banir/desbanir,
  apelido, passar o dono, /limpar, comandos do grupo — confere permissão e
  HIERARQUIA (ninguém mexe em quem/cargo do seu nível ou acima, nem dá o que
  não tem), grava como dono do projeto, recalcula todo mundo e anota no
  registro. Notificação de canal privado só vai para quem vê o canal.
- **Regras**: `pode()`, `podeNoCanal()`, `podeVer()` leem o que o carteiro
  calculou; sem cálculo vale o @todos; canal com regra e sem cálculo fica
  FECHADO. Mensagens/fixadas só de quem vê o canal (a galeria agora busca
  canal por canal — índice novo). Cargos/memberships/registro/banidos/
  comandos: cliente não escreve. Modo lento: mensagem + `lentos/{canal}_{uid}`
  no mesmo lote, conferido com getAfter.
- **App**: `pode()` (lib/permissions.ts) espelha as regras; menus, caixa de
  mensagem (trava com o motivo: sem permissão, castigo, modo lento), voz
  (entrar/falar/transmitir), lista de canais (esconde o que não vê),
  Configurações do grupo por seção, "Ver o grupo como este cargo".
- **Telas**: Cargos (lista com arrastar, editor Aparência/Permissões/Membros
  com prévia), Membros, Comandos, Registro, Banidos; Permissões do canal
  (✗ ／ ✓, canal privado, sincronizar); castigo/banir/apelido/passar o
  grupo/modo lento; "/" com a lista, dicas e "@" sugerindo pessoas;
  mensagens "usou /x", /me em itálico, spoiler.
- Testes: cargos, permissoes, moderacao, comandos (todos com o carteiro local).
- Lição: NÃO mexer em firestore.rules com testes rodando (o emulador recarrega
  as regras no meio e os testes falham por regra pela metade).

## Galeria do grupo (24/11/2026) — versão 0.8.0

O Leo: a galeria é DO GRUPO. Botão no cabeçalho do chat "não faz sentido";
linha na coluna dos canais "horrível". Aprovado: aba **Mídia** no painel da
direita (Agora | Membros | Mídia | Fixadas) + "Ver tudo".

- `subscribeGaleria` (firestore.ts): groupId ==, kind in [image, gif, video],
  sentAt >= 60 dias, orderBy sentAt desc, limit 300 — índice novo
  groupId + kind + sentAt(desc), publicado.
- `lib/galeria.ts`: UMA escuta por grupo, dividida entre a aba e o "Ver tudo"
  (o painel é remontado toda hora); `porPeriodo` = "Esta semana" + mês.
- `components/galeria`: aba (12 miniaturas, filtros) e o `<dialog>` grande
  (janela no PC ≥721px, tela cheia no celular, filtro por canal). Vídeo abre
  no visualizador (`abrirVisualizador(url, desc, true)`).
- Aba nova em `PANEL_TABS`; quem salvou as abas antes ganha a Mídia ligada
  (marca `panelTabsV: 2` ao guardar). 4 abas cabem em 240px (largura pelo nome).
- Sem "Arquivos": o app não manda arquivo (só foto/GIF/vídeo/áudio).

## Visual no nível do site (24/11/2026) — versão 0.7.5

O Leo: o app era bem inferior às imagens do site. Maquete aprovada por foto
("ficou bom"), aplicada no código:

- tokens.css: `--fundo-app` (brilho da cor de destaque sobre `--surface-sunken`),
  `--vidro`, `--vidro-claro`, `--vidro-traco`, `--meu-balao`, `--meu-brilho` —
  calculados das cores de CADA tema (vale no Claro também).
- `.app` com o fundo; chat, sala e amigos transparentes; colunas de vidro
  (opacas no celular, onde viram gaveta por cima do chat).
- Mensagens: `.message__corpo` segura nome/hora (FORA do balão) + o balão (só
  o conteúdo); minhas só com a hora em cima, em degradê. Modo lista e balão à
  esquerda ajustados.
- `avatarEl(..., semente)` + `corDaPessoa` (dom.ts): iniciais sobre uma cor
  fixa por conta/grupo.
- Botões da janela renomeados ("Minimizar janela", "Fechar janela") — o
  "Fechar" das janelinhas era confundido com eles.
- Lição: um `sed` de linha inteira pegou as regras das gavetas do celular e
  quebrou 20 testes; trocar só trechos únicos e olhar o diff antes.

## Cartão embaixo, janela própria e atualização em 5 minutos (24/11/2026) — versão 0.7.0

- Cartão (foto, nome, @, engrenagem, sair) no PÉ da coluna da esquerda no PC
  (`peDaColuna` em app.ts), com a faixa da chamada em cima — como no
  Discord; no topo ele ficava entre o chat e o painel da direita (o Leo
  achou horrível). No celular continua na barra de cima.
- Janela própria (desktop/main.mjs, src/lib/janela.ts): `frame: false`, os
  botões no fim da `.group-bar` (`-webkit-app-region: drag`, dois cliques
  maximiza); nas telas sem barra (entrar, convite) uma faixa solta no topo.
  Linux com cantos redondos = janela transparente + `#app` com raio 12px,
  e faixas invisíveis nas bordas para redimensionar (o programa muda o
  tamanho pelas coordenadas da tela). Windows: sem transparência (o 11
  arredonda sozinho e redimensiona normal).
- Bandeja: casinha preta e branca (preta se a barra do Windows for clara),
  bolinha vermelha com não lida (`avisarBandeja`). Imagens em
  desktop/bandeja/ — TROCAR quando o ícone novo existir (adiado a pedido).
- Configurações → Janela e bandeja (só no PC): barra, cantos (Linux),
  bandeja (P&B/cor/esconder), ao fechar (bandeja/sair). Guardado em
  `janela.json` na pasta de dados do programa; barra e cantos pedem reiniciar.
- Atualização: procura a cada 5 minutos (PC e celular) e, no celular,
  também ao voltar para o app (o Android congela o relógio em segundo plano).
- Teste novo no desktop.spec.ts (botões, maximizar, puxar a borda, seção).

## Grupo depois do Privado + Configurações em janela (24/11/2026) — versão 0.6.5

O Leo: depois de falar com alguém no PV, ir para um grupo e escrever, a
mensagem (qualquer tipo) ia para o PV; só fechando o Loftchat e falando
primeiro no grupo funcionava. E as Configurações em tela cheia deixavam a
metade direita vazia, com a barra de rolagem no meio da tela.

- Causa do PV: `activeDmUid` continua guardado quando a `view` vira
  `group` (de propósito, para o PV voltar igual), e TODAS as ações
  (enviar, arquivos, voz, figurinha, responder, fixar, apagar) decidiam só
  por ele. Agora decidem por `pvAberto(state)` = PV só se `view === 'home'`.
  Teste novo em `dm.spec.ts` (falhava no código antigo).
- Configurações: a rolagem tinha `max-width: 760px`. Agora ocupa a área
  toda e o conteúdo fica no meio. No PC (≥1100×640) viram uma JANELA por
  cima do app (1180×820 no máximo, cantos 18px, fundo escurecido e
  desfocado), ideia do Leo vinda do Discord; aprovada por foto. Celular
  igual.
- A revisão por fotos (`zz-revisao.spec.ts`) ganhou o tamanho `pc-1920`
  (o monitor do Leo): a revisão geral só ia até 1440 e por isso não pegou.

## Atualização do celular consertada (23/11/2026) — versão 0.6.0

O Leo: nos celulares dos amigos a faixa de atualização não aparecia (só no
dele). Causa: o Android perguntava a versão à API do GitHub
(`/releases/latest`), que só responde 60 vezes por hora por endereço de
internet; no 4G (e em muita internet de casa) a operadora põe muita gente
no mesmo endereço, o limite vive estourado, a resposta vinha 403 e o app
ficava QUIETO (nem faixa, nem erro).

- `PluginDoAtualizador.procurar`: HEAD em
  `github.com/<repo>/releases/latest/download/Loftchat-Android.apk` sem
  seguir o redirecionamento; o `Location`
  (`.../releases/download/vX.Y.Z/Loftchat-Android.apk`) dá a versão e o APK.
  Não é API (sem o limite de 60) e é nativo (sem CORS). Conferido em Java
  contra o GitHub de verdade: achou a 0.5.5.
- Novidades: do `novidades.json` da etiqueta, no raw.githubusercontent
  (CORS liberado, sem limite) — PC e celular.
- Falhou a procura → mensagem de erro (antes: silêncio).
- **Quem tem versão antiga continua com o jeito antigo**: precisa instalar a
  0.6.0 na mão UMA vez (o link da Release); depois atualiza sozinho.

## Mensagem de voz (23/11/2026) — versão 0.5.5

Foto aprovada ("pode, ficou legal"): campo vazio → o Enviar vira microfone;
toque para gravar (não segurar, igual no PC e no celular).

- **Gravador** (`src/lib/gravador.ts`): MediaRecorder em Opus 32 kbps
  (WebM no Chromium; Ogg/MP4 se for o que o aparelho grava), volume medido
  10×/s para as ondas ao vivo, resumo de 48 ondas (0–100) que vai NA
  mensagem (`attachment.ondas`) — o balão desenha sem baixar o áudio.
  Limite 5 min (para sozinho e espera mandar); menos de 0,7 s não vai.
- **Composer**: `aoVoz`; gravando, a linha vira 🗑 + barra (ponto, tempo,
  ondas, dica Esc/Enter só com teclado) + ➤. Sair da conversa no meio joga
  fora; o VOLTAR do Android também.
- **Balão** (`src/components/voz/`): UM tocador para o app inteiro, fora da
  lista (a lista é refeita a cada mensagem — o áudio não pode parar por
  isso). ▶/⏸, 28 barras (14 no celular), clicar/arrastar pula, setas ±5 s,
  1x/1,5x/2x, tocar outro para o anterior, arquivo vencido vira aviso.
  A duração vem da mensagem (o WebM do MediaRecorder não traz duração).
- **Carteiro**: tipo `audio` (até 5 MB, audio/webm|ogg|mp4|aac|mpeg); a
  entrega agora aceita qualquer tipo de `TIPOS` (antes uma lista escrita à
  mão — o áudio dava 404). Notificação "🎤 Mensagem de voz".
- Regras do Firebase: nada muda (o tipo da mensagem não é conferido lá).
- Teste `tests/voz.spec.ts` (microfone falso, mudo): gravar, jogar fora,
  curto demais, mandar, banco (audio, duração, 48 ondas), o outro ouvir,
  velocidade, mensagem nova sem parar o áudio, pular, celular cabendo.

## Mídia, figurinhas, emojis e YouTube (23/11/2026) — versão 0.5.0

Fotos aprovadas ("mete bala"; painel com Recentes em cima e Favoritas
embaixo, "+ Criar figurinha" SEMPRE o 1º das Favoritas; emojis Noto, não
Twemoji). R2 ligado por último, com ele no PC.

- **Arquivos no R2 pelo carteiro** (`carteiro/src/arquivos.ts`, binding
  `ARQUIVOS`, balde `loftchat-arquivos`): `POST /arquivo?tipo=` com login
  (imagem/GIF até 20 MB, vídeo 50 MB, capa e figurinha 1 MB, 120 envios por
  hora por pessoa), `GET /arquivo/<chave>` público com Range (vídeo avança).
  Limpeza diária (cron 06:17 UTC): some o que tem mais de 60 dias; passando
  de 8 GB, 30 dias; com 9,5 GB o envio para (507). Figurinha nunca some.
- **App** (`src/lib/midia.ts`, `src/lib/envios.ts`): imagem encolhida (2048 px,
  WebP 0,85); GIF e vídeo como estão; vídeo ganha capa (WebP 720 px). Mensagem
  `kind` image/gif/video/sticker com `attachment` (url do carteiro — url de
  fora vira texto, `arquivoDoLoft`). Fila "Enviando… %" no campo. Imagem em
  tela cheia (`<dialog>`), GIF com etiqueta, vídeo só carrega no play,
  arquivo vencido vira aviso (o `onerror`). Quem já viu continua vendo pelo
  cache do aparelho. Notificação de mídia sem legenda: "📷 Foto" etc.
- **Emojis** (`src/lib/emojis.ts`, `src/components/painel-midia/`): Noto Color
  Emoji embutida (arquivo ÚNICO de 5,8 MB — os pedaços por faixa não desenham
  no Chromium; testado), na pilha de todas as fontes; dados emojibase-data
  pt; categorias na coluna, busca sem acento, tom de pele, 24 recentes.
- **Figurinhas** (`src/lib/figurinhas.ts`, `src/components/figurinhas/`):
  `figurinhas/{uid}` (favoritas ≤ 300, recentes 10; regra nova). Criador com
  formas e o mesmo jeito do ajustador; sai até 512 px com borda branca
  (menos no original). Favoritar pelo botão direito da mensagem.
- **YouTube** (`src/lib/youtube.ts`): cartão com thumb (i.ytimg.com) e título
  pelo oEmbed (o YouTube libera direto). Android já abria link fora pelo
  Capacitor (ACTION_VIEW → app do YouTube ou navegador).
- **Testes**: emojis, youtube, arquivos (carteiro + R2 local; a regra dos
  8 GB numa lista falsa), midia, figurinhas.

## Não lidas (23/11/2026) — versão 0.4.5

Foto e plano aprovados ("mete bala"). Bolinha vermelha com número
(`src/components/bolinha/`) no canto de baixo do ícone das abas (grupo,
pasta fechada, Privado — nunca na aba aberta), na ponta do canal de texto e da
conversa do privado (nome em destaque), "9+" a partir de 10.

- `lidas/{uid}`: `marcas` (`c_<canal>` / `p_<amigo>` → até onde leu) e
  `desde` (quando a conta começou a contar; conversa nunca aberta conta dali).
  Vale na conta: leu no PC, some no celular.
- Canal ganhou `ultimaEm`/`ultimaDe`, anotados por quem manda (depois do
  envio, sem travar o envio). Regra nova: qualquer membro, só esses dois
  campos, só para a frente, `ultimaDe` = o próprio uid. PV usa o
  `lastMessageAt` que já existia.
- `src/lib/nao-lidas.ts`: um ouvinte de canais por grupo; só CONTA
  (`getCountFromServer` com limit 10 = 1 leitura) quando a última mensagem é
  mais nova que a marca e não é minha. Conversa aberta e janela visível →
  marca lida até a última.
- Índices novos (sentAt crescente) para as duas contagens.
- Teste: `tests/nao-lidas.spec.ts` (canal, aba, outro aparelho já lido, 9+,
  mensagem minha não conta, privado, e as regras).

## Notificações de mensagem (23/11/2026) — versão 0.4.0

Plano aprovado: opção A (carteiro na Cloudflare, grátis, sem cartão) + FCM no
Android + bandeja no PC + Configurações → Notificações.

- **Carteiro** (`carteiro/`, Cloudflare Worker `loftchat-carteiro`, conta
  Cloudflare bevonesileonardo). Quem manda a mensagem chama `POST /avisar`
  com o token do Firebase. O carteiro confere o token (chaves do Google),
  confere que a mensagem existe, é dessa pessoa e tem menos de 2 minutos, e
  avisa os outros membros (grupo) ou o outro da dupla (PV). Celular: FCM
  (dados, prioridade alta). PC: escreve `avisos/{uid}`. A foto vai por
  `GET /foto/{uid}` assinada (HMAC). Segredos só na Cloudflare:
  `CHAVE_GOOGLE` (conta de serviço firebase-adminsdk, criada por IAM, nunca em
  arquivo) e `SEGREDO_FOTO`. Como publicar: `carteiro/LEIA.md`.
- **Regras novas**: `aparelhos/{uid}` (só o dono, mapa `lista` com até 10
  aparelhos) e `avisos/{uid}` (dono lê/apaga, só o carteiro escreve).
- **Android**: `ServicoDosAvisos` (FirebaseMessagingService) monta a
  notificação: foto redonda, nome, onde ("no seu privado" / "Grupo · #canal"),
  hora e texto (cortado em 180 com "…"). Uma notificação por conversa. Não
  avisa a conversa aberta com o app na frente. Tocar abre a conversa
  (`PluginDosAvisos`, evento `abrir`). Pede a permissão do Android 13+ ao
  entrar. Sem permissão, o aparelho não se anota.
- **PC**: fechar a janela esconde (fica na bandeja: Abrir / Sair). O chat
  escuta `avisos/{uid}` e pede ao programa a notificação do sistema (foto
  baixada só do carteiro). Clique abre a conversa. Aviso com mais de 2
  minutos (PC estava fechado) não aparece.
- **Configurações → Notificações**: liga/desliga neste aparelho (tira ou põe
  o aparelho na lista na hora). Sair da conta também tira.
- **Testes**: `tests/carteiro.spec.ts` (carteiro local via `wrangler dev`
  apontado para o emulador: grupo, PV, texto cortado, foto assinada,
  recusas, regras, e o caminho pela tela) e dois testes novos em
  `tests/desktop.spec.ts` (bandeja + aviso + clique; o interruptor). A tela
  de teste ganhou D-Bus próprio (`dbus-run-session`), para a bandeja e as
  notificações dos testes não aparecerem na barra de verdade.
- Prova no carteiro de verdade: com uma conta temporária (apagada depois),
  ele recusou login falso e leu o banco com a chave (404 para mensagem
  inexistente). O envio real pelo Google só se confirma no celular.

## Super plano dos celulares + "Mandar informações da tela" (23/11/2026) — versão 0.3.5

Ferramenta (fora do git): `Arquivo/Loft-desktop/scripts-de-teste/zz-celulares.spec.ts`
— o passeio da revisão com PERFIS de aparelho (tamanho, densidade, letra do
sistema, barra de 3 botões, escuro forçado) e detector de "botão por cima de
texto" e texto cortado. Perfis de yesviz.com/viewport (Galaxy A 412@2.625, J7
Prime2 412x732, Redmi Note 393x851@2.75, Moto G8 360x780@2, LG K20 320x640@1.5);
os HD+ baratos (A06, Redmi 9A/14C, Moto E) são ESTIMATIVA 360x800@2 — o botão
novo traz o número real.

Achados e consertos (foto aprovada):
- Em 360 px ou menos a fileira de cima não cabia: o "+" cobria o nome do grupo
  e em 320 o "Privado" virava "ivado". No celular saem o logo e a foto do
  cartão, e o Privado fica só com o ícone (nome continua para leitor de tela).
- A engrenagem parecia um sol: agora é engrenagem (contorno da Lucide, ISC).
- Alvos de toque de 28 px → 44 px no celular (ícones, abas, "voltar").
- Letra do sistema aumentada (o WebView do Android multiplica TODO tamanho de
  letra, inclusive px): o painel de membros saía da tela. Coluna do grid presa
  (`minmax(0, 1fr)`) e abas que encolhem com reticências.
- Escuro forçado (Xiaomi e outros): `setForceDarkAllowed(false)` na janela e
  no WebView + `setAlgorithmicDarkeningAllowed(false)` (androidx.webkit).
- Navegador interno antigo: o Loftchat usa `:has` (105), `dvh` (108) e
  `color-mix` (111). A altura do app ganhou `100vh` antes do `dvh`; `color-mix`
  só no véu do fundo do chat (sem ele, só não aparece o fundo).

**Configurações → Sobre → "Mandar informações da tela"** (`lib/info-da-tela.ts`):
grava em `infoDeTela/` nome de exibição, modelo/Android/WebView (userAgent),
tela, janela, densidade, letra do sistema (medida), escuro, toque, margens do
sistema e se tem `color-mix`/`:has`/`dvh`. A regra só deixa CRIAR, com formato
fechado; ninguém lê pelo app — eu leio como dono do projeto.

## Revisão geral + site com os 3 botões (23/11/2026)

**Site:** os três cartões de baixar levam a `releases/latest/download/...`
(Windows, Linux, Android), com a versão atual lida do GitHub, o cartão do
sistema da pessoa destacado e uma dica curta por sistema. Publicado.

**Revisão geral** — passeio automático por todas as telas em 5 tamanhos (PC
1440, notebook 1280, celular 390 e 360, celular deitado), procurando botão
repetido, vazamento lateral, texto em inglês e erro no console. A ferramenta
ficou FORA do repositório (`Arquivo/Loft-desktop/scripts-de-teste/zz-revisao.spec.ts`).
Consertado:

1. Desfazer amizade e Bloquear perguntam antes. No celular o @ do amigo
   passava por baixo dos botões e o toque para abrir a conversa caía em
   "Desfazer amizade" — desfazia na hora, sem volta.
2. Erro do servidor nunca mais em inglês: `textoDoErro()` em
   `lib/firestore-errors.ts`, usado nas 8 telas que mostravam `error.message` cru.
3. Janela só informativa (sem `onConfirm`) tem UM botão: convite, fixadas e
   diagnóstico mostravam "Fechar" duas vezes.
4. "Diagnóstico da conexão" saiu do menu da sala (só o atalho Ctrl+Alt+V,
   para depurar); o aviso de conexão que falhou não manda mais apertar atalho.
5. "Renomear grupo" saiu dos menus (repetia Configurações do grupo).
6. Clipe e microfone do campo de mensagem saíram: não faziam nada.
7. Link `http(s)://` na mensagem vira clicável (abre fora).
8. Código do convite diminui em celular estreito.
9. Apagar grupo limpa `voiceParticipants` e os sinais dos canais de voz
   (pendência antiga). A regra nova deixa o DONO apagar sinal — enquanto ela
   não estiver publicada, essa parte falha calada e o resto da exclusão segue.
10. Firebase 12.19 + re2js 2.10. Sobra o aviso do `@grpc/grpc-js`: nem o
    Firebase mais novo traz a versão corrigida, e ele só roda em Node (não vai
    no pacote do app). No programa, `venmic → cmake-js → tar` é só de montar.

Visual aprovado por foto (23/11): a aba Privado ganhou ícone próprio (dois balões
de conversa — antes era a casinha, igual ao logo do lado) e, no PV, o botão do
painel foi para o canto direito, como nos grupos.

Testes do que mudou: 75 passaram (amigos, PV, celular, grupo, fixadas, canais,
chat da sala, suíte principal).

## MUDANÇA DE RUMO (15/11/2026) — o Loft vira programa e app

Decisão do Leo: o chat do Loft passa a existir **só como programa (Linux e
Windows) e app Android**. O site vira uma página de apresentação com os
botões de download, baseada no site da NOVA (`~/Projetos/Jarvis/site`). A
meta é "profissional de verdade, melhor que o Discord e diferente dele":
refazer o que for remendo, seletor de tela próprio e distribuição das telas
repaginada (o tema da etapa 20 fica).

Consequências combinadas:

- O programa leva o código do Loft DENTRO dele (hoje abre o site) e ganha
  atualização automática, hospedada de graça no Firebase.
- iPhone fica de fora: exige conta paga da Apple (99 dólares/ano) e Mac.
- Instalador do Windows sem certificado pago mostra o aviso do SmartScreen
  ("Executar assim mesmo"); não há jeito grátis de tirar.
- O chat só sai do navegador quando programa e app estiverem prontos (o
  amigo que usa pelo celular perderia o acesso).

**Marca e acabamento profissional (pedido do Leo, 15/11/2026 — entra no
redesenho):** o nome é **Loftchat**, tudo junto, não "Loft". Hoje aparece
"Loft" em: tela de entrar/cadastrar (`auth-screen.ts`), título da guia
(`index.html`), `manifest.webmanifest` (name e short_name), topo da coluna sem
grupo (`channel-list.ts`), avisos ("convite do Loft", "Use o Loft no
computador"), `productName` do app de computador (`desktop/package.json`) e o
remetente do e-mail de confirmação. O site ganha rodapé com "todos os
direitos reservados", termos de uso e privacidade (como o site da NOVA).

**Layout escolhido (16/11/2026): proposta A, "abas em cima"** —
`design/layouts/` (HTML + PNG de cada tela: proposta-a, a-privado, a-sala,
a-perfil, a-configuracoes, a-ajustar-foto, a-ajustar-banner). Ranking do Leo:
A > C > B (B "parece WhatsApp demais").

**Princípio: muito personalizável, e de graça** (no Discord até o banner é
pago). Pedidos já combinados:

- Perfil com 3 imagens — foto (círculo), banner (faixa) e fundo do cartão —,
  cada uma com AJUSTADOR (arrastar, zoom por barra/rodinha/dois dedos, no
  formato final). Salva só o recorte reduzido, no Firestore (o Storage exige
  o plano pago Blaze desde 2026). Bio, cor do cartão, fonte do nome.
- Grupo: o dono escolhe a foto do grupo com o mesmo ajustador; nome do grupo
  obrigatório. Cada membro pode dar um APELIDO pessoal ao grupo (só ele vê)
  ou deixar sem nome (só o ícone).
- Abas dos grupos, escolha de cada pessoa: todos com nome; só ícone (com
  marcação no selecionado); ou só o selecionado com nome.

**PLANO DA PROPOSTA A — APROVADO pelo Leo em 16/11/2026 ("ficou perfeito,
pode seguir certinho").** Regra geral: tudo de graça e sem gambiarra;
imagens recortadas e pequenas; contraste checado; preferências pessoais
salvas na conta (valem no PC e no celular).

1. Estrutura: barra de cima (marca, abas Privado + grupos com não lidas e
   ponto ao vivo, "+", busca Ctrl+K, sino, cartão nome+@ com menu); esquerda
   (canais com quem está na voz + "Em chamada"; no Privado: Amigos +
   conversas); centro (chat, sala de voz com palco/fila/controles, Amigos);
   direita recolhível (grupo: Agora/Membros/Fixadas; sala: Chat da
   sala/Membros/Fixadas; privado: perfil + fixadas). Celular: abas em faixa,
   esquerda vira gaveta, direita sobe de baixo.
2. Perfil: 3 imagens com ajustador, nome, @, bio, cor do cartão, fonte do
   nome, cor do nome nas mensagens, status com emoji e prazo, links,
   atividade "jogando" (programa) com opção de esconder.
3. Grupos — dono: foto e banner com ajustador, nome obrigatório, descrição,
   cor do grupo, canais com emoji, ordem arrastando, categorias próprias,
   boas-vindas. Membro: apelido do grupo ou "sem nome", notificações por
   grupo/canal.
4. Abas: 3 modos (todos com nome / só ícones / só o aberto com nome), ordem
   arrastando, pastas de grupos.
5. Aparência pessoal: temas prontos ou cor de destaque livre, fundo do chat
   com imagem (ajustador + escurecimento; geral ou por canal), mensagens em
   balão ou lista, lado das minhas, compacto/confortável, tamanho do texto,
   fonte do app, o que aparece no painel da direita.
6. Pessoas: apelido pessoal por pessoa, volume por pessoa na chamada.
7. Sons (notificação, entrar/sair da chamada, mudo) e atalhos editáveis.
8. Sala de voz: palco grande + fila ou grade; chat da sala liga/desliga.
9. Configurações em tela inteira: Perfil, Conta e segurança, Privacidade,
   Voz e áudio, Transmissão, Notificações, Aparência, Atalhos, Novidades.

**Decisão do Leo (16/11/2026): os EXTRAS ficam para depois da publicação**
— busca Ctrl+K, notificações por grupo/canal e não lidas, apelido e volume
por pessoa, sons, atalhos editáveis e "jogando agora". "Extra é extra, não é
prioridade." Primeiro o que falta para publicar.

**ORDEM ATÉ PUBLICAR (Leo, 16/11/2026):** (1) sala de voz (palco + fila ou
grade, chat da sala; junto: Configurações → Voz e áudio); (2) programa
independente (chat dentro do programa, instaladores Linux/Windows,
atualização automática); (3) caça às gambiarras; (4) pendências — que são o
teste real do Leo com o Lucas (som do PC no Windows, vídeo que às vezes não
chega); (5) publicar.

Ordem de construção: (1) estrutura da A com o que existe + marca Loftchat;
(2) configurações e perfil; (3) grupos; (4) aparência pessoal; (5) extras
(busca, notificações por grupo, atividade, volume por pessoa, atalhos).

Fases, nesta ordem:

1. **Tela com áudio**: seletor próprio (etapa 2), áudio no Linux (etapa 3) e
   no Windows (etapa 4), e o defeito do vídeo que às vezes não chega.
2. **Programa independente**: código dentro do programa, instaladores,
   atualização automática.
3. **Caça às gambiarras**: revisão do Loft inteiro, lista para o Leo escolher.
4. **Repaginar o layout**: 2–3 propostas em imagem, diferentes do Discord.
5. **Página do site** no estilo da NOVA.
6. **App Android** com compartilhamento de tela de verdade.

## PLANO ÚNICO ATÉ PUBLICAR — Linux, Windows e Android (16/11/2026)

O chat saiu do navegador: o Loftchat existe como programa (Linux e Windows)
e app Android. Repositório `Lelokz/Loftchat.com.br` PÚBLICO desde 16/11 (o
Leo abriu; histórico varrido, sem segredos) — no futuro ele quer integrar
com a NOVA, que também é pública. Instaladores e atualizações nas RELEASES
do GitHub: o Firebase grátis só deixa baixar 360 MB/dia.

**Etapa 9 — programa do PC (Linux e Windows)**
- 9a: o chat DENTRO do programa (hoje ele abre o site, que saiu do ar).
- 9b: link de convite abre o programa no convite; sem programa, a página
  do site com o botão de baixar.
- 9c: instaladores — Windows `Loftchat-Setup.exe` (instala sozinho, sem
  perguntas e sem administrador; o aviso do SmartScreen fica, só some com
  certificado pago); Linux `Loftchat.AppImage` (e `.deb` se o Ubuntu novo
  barrar o AppImage). Windows montado aqui sem Wine se der; senão GitHub
  Actions.
- 9d: atualização automática pelas Releases: baixa por trás e mostra a
  faixa "Atualização pronta / Reiniciar" (sem pop-up).

**Etapa 10 — app Android (como o Discord: tela do Loftchat + chamada nativa)**
- 10a: o app com o chat (o mesmo Loftchat em Capacitor; ferramentas de
  Android já estão no HD, `Arquivo/Android-Ferramentas`, as dos apps da NOVA).
- 10b: chamada NATIVA em Kotlin (biblioteca WebRTC mantida, LiveKit/Stream)
  com a notificação fixa "Em chamada" — não cai com a tela apagada; fala
  com o PC na mesma sala.
- 10c: transmitir a tela do celular (autorização do Android + notificação
  "Transmitindo", serviço do tipo mediaProjection), aparecendo no palco do PC.
- 10d: convites abrindo o app.
- 10e: atualização pelo próprio app (baixa o APK das Releases e o Android
  pergunta "Atualizar?", como o app do Painel do Canal).
- Regra do Google: APK de site ainda não é afetado no Brasil; em 2027 vale
  para todos → conta de distribuição limitada (grátis, sem documento, até
  20 aparelhos) ou completa (US$ 25 uma vez).
- Notificação com o app fechado precisa de servidor pago do Firebase: fica
  com os extras, depois de publicar (pesquisar saída grátis).

**Depois:** caça às gambiarras → teste com o Lucas (PC e celular; som do
PC no Windows, vídeo que às vezes não chega) → publicar (o site ganha os
botões Windows, Linux e Android).

## Atualização sozinha nos três + Sobre o Loftchat (17/11/2026) — versão 0.2.0

Pedido do Leo: nada de APK pelo WhatsApp; o próprio Loft sabe que tem versão
nova, avisa e atualiza (Windows, Linux e Android). "Depois" = segue
funcionando igual, sem as novidades; a atualização fica nas Configurações.

- **Versão num lugar só**: `desktop/package.json` → programa, app Android
  (`versionName`/`versionCode` no build.gradle: 0.2.0 → 200) e chat
  (`__VERSAO__` no vite.config.ts).
- **Novidades** em `novidades.json` (português de quem usa): aparecem em
  Sobre e viram o texto da versão no GitHub (`scripts/notas-da-versao.mjs`).
  **Toda versão nova precisa da sua entrada lá antes da etiqueta.**
- `src/lib/atualizacao.ts`: um estado só. PC = electron-updater (achou →
  baixando % → pronta → Atualizar reinicia); Android = pergunta às Releases
  (`/releases/latest`), Atualizar baixa o APK (`PluginDoAtualizador.java`) e
  abre a tela de instalar do Android (o toque em Instalar é da pessoa; na 1ª
  vez pede "permitir desta fonte"). Site: sempre a mais nova.
- Faixa "Atualização disponível · versão X" (Depois / Atualizar), em cima no
  celular; Configurações → **Sobre o Loftchat** (versão, Procurar
  atualizações / Instalar atualização, novidades de cada versão).
- **Assinatura do Android**: chave própria em
  `Arquivo/Android-Ferramentas/chave-loftchat/` (fora do repositório); no
  GitHub pelos segredos `LOFT_CHAVE_BASE64` e `LOFT_CHAVE_SENHA`. Quem tem o
  APK de teste (chave de teste) desinstala uma vez.
- **Publicar uma versão**: subir `desktop/package.json` + entrada no
  `novidades.json`, commit, etiqueta `vX.Y.Z` → o GitHub monta Windows,
  Linux e Android e publica nas Releases com as novidades.
- **Cuidado com versões velhas**: quem não atualiza continua usando. Regra
  do Firestore nova não pode quebrar o básico (mensagem, chamada) de quem
  ficou numa versão anterior.
- Testes: `atualizacao.spec.ts` (site; programa de mentira: baixando %,
  pronta, Depois, Sobre, Instalar). Regressão: 24 passaram.

## Sala no celular (desenho a-sala), tela cheia no app e som da tela do celular (16/11/2026, ~23h55)

Teste do Leo (celular com celular): a transmissão funcionou, mas a sala no
celular estava no jeito antigo; tela cheia na amiga apagou tudo e travou os
botões; e a tela do celular ia sem som ("tem que vir com som").

- **Desenho a-sala** no palco: "Fulano está transmitindo" + "● AO VIVO" em
  cima, botão de tela cheia com setinhas (sai com as setinhas para dentro),
  microfone aberto em roxo cheio.
- **Celular**: título numa linha e "2 pessoas · 0:05" embaixo (antes quebrava
  em colunas); palco 16:9 do tamanho do vídeo (sem faixa preta enorme);
  fila de pessoas que rola de lado; blocos 4:3 (o nome não passa mais por
  cima das iniciais); controles no pé da tela; o "+" das abas sempre à
  vista. As regras do celular ganharam `.app` na frente (perdiam para as do
  PC pela ordem dos arquivos).
- **Celular deitado** passa a usar o layout do celular (antes caía no do PC,
  três colunas espremidas): `(max-height: 500px) and (pointer: coarse)`;
  deitado, o palco divide a altura com os controles e a fila some.
- **Tela cheia no app Android**: a da página não funciona dentro do app (o
  Capacitor recusa o `onShowCustomView` → página vazia, botões mortos). Agora
  o plugin "Tela" (`telaCheia`) esconde as barras do sistema e deita a
  tela; VOLTAR sai da tela cheia.
- **Som da tela do celular** (Android 10+): `AudioPlaybackCapture` com o som
  de mídia/jogo dos outros apps, o Loftchat de fora (`excludeUid`), PCM
  48 kHz estéreo em pedaços de 20 ms por um segundo canal → AudioWorklet →
  faixa de som junto da tela. Android 9 ou sem permissão: só imagem, com
  aviso.
- Testes: `android-tela.spec.ts` ganhou o som (tom de 440 Hz chega na
  faixa); `capturas-sala-celular.spec.ts` (fotos: assistindo, tela cheia,
  deitado, transmitindo). Regressão: sala, celular, chat da sala, painel,
  tela do celular, compartilhar tela (16 passaram; 1 do vídeo que às vezes
  não chega passou na 2ª tentativa).

## Etapa 10c — transmitir a tela do celular (16/11/2026, ~20h50)

Decisão do Leo: **B** — a chamada continua na página do app (como hoje) +
"Em chamada"; só a captura da tela do celular é nativa.

- **Android** (`PluginDaTransmissao.java` + `ServicoDaTransmissao.java`):
  autorização do próprio Android → serviço em primeiro plano do tipo
  "projeção de mídia" com a notificação "Transmitindo a tela" + Parar. A
  tela vai para uma tela virtual de até 1280 px no lado maior (acompanha o
  celular girando), e cada imagem sai em JPEG pelo canal de mensagens da
  WebView (`androidx.webkit`). Ritmo: até ~15 por segundo, a próxima só
  depois do "ok" da página (celular lento não acumula fila); tela parada
  reenvia a última a cada segundo (quem entra depois vê a imagem).
- **Página** (`src/lib/android-tela.ts`): JPEG → `MediaStreamTrackGenerator`
  (continua andando com o app atrás); sem ele, um <canvas>. O motor da
  chamada ganhou `FonteDeTela` (outra origem no lugar do getDisplayMedia) e
  manda a faixa pelo mesmo caminho da tela do PC.
- Sem som do celular (aviso próprio: "vai só a imagem").
- A página do app tem prioridade alta mesmo com o app atrás
  (`setRendererPriorityPolicy`).
- Testes: `android-tela.spec.ts` (Android de mentira, os dois caminhos:
  gerador e canvas; girar; parar pelos dois lados) — pegou um defeito real
  (o canal chegava e era descartado). Regressão: sala, celular, voz,
  código do grupo, compartilhar tela no navegador e no programa (20/20).
- **Só montado** (sem emulador): falta o teste do Leo no celular. Riscos
  conhecidos: WebView sem o gerador → canvas, que pode parar de atualizar
  com o app atrás; desempenho em celular fraco.

## Código do grupo, botões travados e barra de cima (16/11/2026, ~19h45)

- **Código do grupo** (pedido do Leo: a página do convite não existe no ar):
  cada grupo tem UM código de 6 letras/números (sem 0/O/1/I), fixo, que só o
  dono vê em Opções do grupo → Convidar pessoas (código grande + link).
  "Trocar código" (confirma no lugar) apaga os convites do grupo e cria
  outro: o antigo para de valer. O "+" da barra virou menu Criar grupo /
  Entrar num grupo; digitar aceita minúsculas, espaço e hífen. Códigos
  antigos de 8 continuam valendo (programa e página do site também).
- **Botão travado diz o motivo:** na sala, tocar num botão sem uso (ex.:
  transmitir a tela no app Android, que é a 10c) mostra o motivo num aviso,
  em vez de não fazer nada.
- **Barra de cima do celular:** o app pede para esconder; o plugin "Tela"
  (`PluginDaTela.java`) confere se o celular escondeu mesmo. Escondeu = o
  Loftchat ocupa a tela toda (classe `barra-escondida`); não escondeu = os
  botões ficam abaixo da barra, como antes.
- Firebase de teste na porta **8088** (a 8080 é da ponte do WhatsApp).
- Testes: `codigo-grupo.spec.ts` novo; loft.spec atualizado; sala, celular e
  tela passaram. APK mandado ao Leo pelo WhatsApp (falta o teste dele).

## Regras do banco publicadas (16/11/2026, ~18h50)

As regras do Firestore mudaram 7 vezes na proposta A (perfil, grupos,
canais, boas-vindas, fundo do chat) e nunca tinham sido publicadas — o
`npm run deploy` publica só o site. No app Android (Firebase de verdade)
salvar o perfil dava "Missing or insufficient permissions". Publicadas
regras e índices com o OK do Leo (`firebase deploy --only
firestore:rules,firestore:indexes`). **Regra mudou = publicar junto (com OK).**

## Etapa 10b (parte comum) — "Em chamada" no Android (16/11/2026)

- Serviço em primeiro plano do tipo MICROFONE (`ServicoDaChamada.java`) com
  a notificação fixa "Em chamada · <sala>": tocar abre o app, "Sair" sai da
  sala pelo chat. Sem ele o Android corta o microfone com o app atrás ou a
  tela apagada (Android 11+). Pede a permissão de notificação (Android 13+);
  recusada, a voz continua igual.
- Ponte `PluginDaChamada.java` (plugin "Chamada") ↔ `src/lib/android.ts`
  (`acompanharChamadaNoAndroid`): liga ao entrar numa sala, desliga ao sair
  e ao sair da conta.
- Só MONTADO (sem emulador, pedido do Leo): APK em
  `Arquivo/Loft-desktop/dist/Loftchat-Android-teste.apk`. Falta o teste dele.
- **DECISÃO PENDENTE com o Leo:** a chamada NATIVA (como o Discord) também
  exige vídeo nativo — assistir a tela do PC no celular viraria um vídeo
  desenhado por cima da página, no lugar do palco. Alternativa: a chamada
  segue na página do app (como hoje) + este "Em chamada", e só a captura da
  tela do celular (10c) vai para o nativo.

## Etapa 10a — o app Android com o chat (16/11/2026)

- Capacitor 8.6.2 (`capacitor.config.ts`, pasta `android/`): o MESMO chat,
  `br.com.loftchat`. `scripts/android.sh` monta o chat e o APK com as
  ferramentas de Android do HD (as dos apps da NOVA; o Android 36 que o
  Capacitor 8 pede foi instalado lá), Gradle SEM ficar na memória depois.
- Dentro do app o chat sabe que é app (`emSite()` em router.ts): convite com
  o endereço do site, sem service worker.
- Marca: ícone adaptável com a casinha (vetor do `logoIcon`) no roxo
  #7B3FE4 + PNGs para Android 7; abertura com a casinha no fundo escuro;
  barras do sistema escuras com ícones claros (MainActivity).
- Botão VOLTAR (`@capacitor/app`, `src/lib/android.ts`): fecha a janela
  aberta (como o Esc), senão volta no histórico (fecha a gaveta), senão
  MINIMIZA (nunca fecha — a chamada continua).
- Permissão de microfone no manifesto (voz pela WebView até a 10b).
- Testado num emulador de Android (`tests/android.spec.ts`, só roda com
  `LOFT_ANDROID_APK` e um emulador ligado; a versão de teste fala com o
  Firebase de teste do PC por `adb reverse`, liberado só no debug):
  cadastro, grupo, mensagem nos dois sentidos com o navegador do PC, convite
  com o link do site, VOLTAR fecha janela e gaveta, sala de voz com microfone.
- **O EMULADOR DERRUBOU O PC DO LEO (16/11, ~17h20).** Ele pediu: nada de
  emulador; o app Android eu só MONTO, quem testa é ele no celular. O último
  ajuste (ícones claros na barra de cima) foi montado mas não visto.

## Etapa 9d — atualização automática (16/11/2026) — fim da etapa 9 (falta subir)

- `electron-updater` 6.8.11 no programa instalado: ao abrir e a cada 4 h
  procura versão nova nas Releases do GitHub (o `publish` do package.json) e
  baixa por trás. Pronta: a FAIXA embaixo, no meio — "Atualização pronta ·
  versão X" com Depois e Reiniciar (não é pop-up, não rouba o foco). Sem
  reiniciar, entra sozinha quando o programa fechar.
- **Testado de ponta a ponta no Linux** (tela invisível, pasta pessoal
  falsa, servidor local no lugar do GitHub): uma 0.1.0 de verdade abriu,
  achou e baixou a 0.1.1, mostrou a faixa; Reiniciar fechou a 0.1.0, trocou
  o arquivo do AppImage pelo da 0.1.1 e reabriu sozinho. O Windows (NSIS)
  usa o mesmo caminho; conferir no teste com o Lucas.
- A versão aparece nas Configurações, embaixo do menu ("Loftchat 0.1.0
  (beta)") — ajuda no teste com o Lucas.
- `.exe` do Windows com o ícone do átomo (o Actions roda num Windows de
  verdade, então o `signAndEditExecutable` voltou ao padrão).
- Achado no caminho: a barra do teste do microfone (8c) às vezes ficava em
  zero — o AudioContext nascia pausado depois de esperar a permissão.
  `resume()`; 3/3 depois.
- Regressão: desktop, convite, configurações, voz e áudio (14 + a corrigida).
- **Para valer de verdade falta:** push (com o OK do Leo), os 2 segredos do
  TURN no GitHub, e a primeira etiqueta de versão (`v0.1.0`) — o Actions
  monta os dois instaladores e publica nas Releases.

## Etapa 9c — instaladores (16/11/2026)

- electron-builder 26.18.0 (configuração em `desktop/package.json` → `build`)
  e `scripts/instaladores.sh` (monta no HD: `Arquivo/Loft-desktop/dist`,
  caches no HD; não publica nada).
- **Linux: `Loftchat.AppImage` (128 MB) FEITO e testado** numa tela
  invisível com uma pasta pessoal falsa: abre e roda (o bloqueio do Ubuntu
  novo a AppImage do Electron NÃO aconteceu aqui — o `.deb` não foi preciso).
  Como o AppImage não tem instalador, o programa se apresenta ao sistema na
  primeira vez (e se o arquivo mudar de lugar): `~/.local/share/applications/
  loftchat.desktop` (menu de aplicativos, `loftchat://` dos convites) e o
  ícone em `~/.local/share/icons`. Conferido que o sistema de verdade do Leo
  NÃO foi tocado nos testes.
- **Windows: `Loftchat-Setup.exe`** (NSIS em um clique, sem administrador,
  atalho na área de trabalho e no Menu Iniciar, abre ao terminar). Montar no
  Linux NÃO dá sem Wine: o último passo (o desinstalador) roda um programa
  do Windows. Saída: `.github/workflows/instaladores.yml` — o GitHub Actions
  monta o Windows num Windows de verdade (e o Linux num Linux); à mão =
  só "Artifacts"; etiqueta `v*` = publica nas Releases. Mesmo repositório,
  então basta o `GITHUB_TOKEN` (sem chave extra). **Falta: push (só com o
  OK do Leo) e os dois segredos do TURN no GitHub** (`VITE_TURN_USERNAME`,
  `VITE_TURN_CREDENTIAL` — vão no bundle como em qualquer cliente).
- venmic (som do PC, só Linux) virou dependência OPCIONAL: no Windows o
  `npm ci` recusaria um pacote só de Linux. Fica fora do pacote do Windows.
- Para a caça às gambiarras: o `npm audit` aponta 3 vulnerabilidades no
  `tar`/`cmake-js`, que o venmic só usa para se montar — não rodam no
  Loftchat, mas vão junto no pacote.
- O exe do Windows sai com o ícone padrão do Electron por dentro
  (`signAndEditExecutable: false`); no Actions (Windows de verdade) dá para
  ligar e pôr o átomo — conferir na primeira montagem.

## Etapa 9b — link de convite (16/11/2026)

- O link de convite é `https://loftchat.com.br/convite/CÓDIGO`. A página
  nova do site (`site/convite/index.html`, regra `/convite/**` no
  firebase.json) mostra "Abrir no Loftchat" (`loftchat://convite/CÓDIGO`),
  "Baixar o Loftchat" e o código com Copiar (para colar em "Entrar num
  grupo"). Código fora do alfabeto do convite: "não parece certo".
  **NÃO publicada** — vai junto com o resto, quando o Leo mandar.
- O programa aceita `loftchat://convite/CÓDIGO`: aberto pelo link, já entra
  na tela do convite; com a janela aberta (`second-instance`), manda o
  código ao chat (`loft:convite` → `navigate`), sem recarregar a página. Só
  passa código conferido (8 letras do alfabeto).
- O sistema só passa a abrir `loftchat://` com o programa INSTALADO
  (`setAsDefaultProtocolClient` só com `app.isPackaged`); o registro no
  Linux/Windows sai do instalador (9c).
- Testes: `tests/desktop-convite.spec.ts` (a página do site servida da pasta
  `site/` com a mesma regra; programa aberto pelo link → cadastro pelo
  convite → entra no grupo; outro link com ele aberto troca sem recarregar;
  link torto não faz nada).

## Etapa 9a — o chat dentro do programa (16/11/2026)

- O programa não abre mais o site: leva o chat dentro (`desktop/app/`, o
  `vite build`; `npm run build:desktop`, fora do git) e serve pelo endereço
  próprio `app://loftchat/` (`protocol.handle`, esquema "seguro" e "padrão"
  registrado antes do app ficar pronto: sessão guardada, microfone, fetch).
  Caminho que não é arquivo cai no `index.html` (rotas como /convite/…);
  nada fora da pasta é servido.
- `doLoft` compara `protocolo//casa` (o `URL.origin` do Node dá "null" para
  esquema desconhecido); permissões e ponte só para o próprio chat.
- Link de convite gerado no programa = `https://loftchat.com.br/convite/…`
  (o `app://` ninguém de fora abre); no navegador continua a origem dele.
- Sem service worker no programa (não existe em `app://`).
- Firebase real conferido numa tela invisível: o programa abre e responde
  "E-mail ou senha incorretos" para uma conta que não existe. A chave do
  Firebase não tem restrição de origem (conferido pela REST).
- `npm run janela` monta o chat e abre o programa. `LOFT_URL` segue para
  desenvolver; os testes montam um chat apontado para o emulador
  (`LOFT_PASTA`).
- Testes: `tests/desktop.spec.ts` agora roda no chat embutido (6/6), com
  rota interna, nada vaza da pasta, e convite com o link do site.
- ACHADO: as regressões anteriores rodaram o teste do programa SEM a tela
  invisível (janelas mudas apareceram na tela do Leo). Sempre
  `scripts/tela-de-teste.sh`.

## Proposta A, etapa 8c — Configurações → Voz e áudio (16/11/2026) — fim da etapa 8

- Seção nova **Voz e áudio** nas Configurações (e a ENGRENAGEM no cabeçalho
  da sala abre direto nela): microfone, teste do microfone, saída de som e
  três filtros (redução de ruído, cancelamento de eco, volume automático).
- **Vale neste aparelho** (localStorage `loft.voz`, `lib/voice-settings.ts`),
  não na conta: o microfone do PC não existe no celular e os ids dos
  aparelhos mudam de navegador para navegador. Sem armazenamento, vale o
  padrão (o mesmo de antes).
- **Muda na hora, sem barra de salvar.** Com a chamada aberta o motor
  acompanha: microfone/filtros novos = pede o microfone de novo e troca a
  faixa em cada conexão (`replaceTrack`, sem renegociar e sem sair da sala;
  o mudo continua); saída nova = `setSinkId` nos `<audio>` de cada pessoa.
  O aparelho é pedido como `ideal`: fone desplugado cai no padrão em vez de
  recusar a sala. Quem entrou sem microfone só ganha o novo na próxima
  entrada (ligar um microfone que não existia exige renegociar).
- **Teste do microfone**: só a BARRA de nível (`role=meter`) — não toca a
  voz de volta (eco e barulho no PC). Para ao trocar de seção e ao fechar.
  Os nomes dos aparelhos aparecem depois da primeira permissão.
- Navegador sem escolha de saída (Safari, Firefox antigo): a tela diz isso.
- Testes: `tests/voz-audio.spec.ts` (engrenagem, lista, barra mexe com o
  microfone falso, trocar o microfone e desligar o ruído com a chamada
  aberta = o motor pede de novo com o aparelho/filtro novos, continua na
  sala, recarregar mantém).

## Proposta A, etapa 8b — o chat da sala (16/11/2026)

- Com a sala de voz na tela, o painel da direita vira **Chat da sala /
  Membros / Fixadas** (Membros e Fixadas seguem as abas escolhidas em
  Aparência; o chat aparece sempre). Abre no chat.
- As mensagens são do PRÓPRIO canal de voz: mesma coleção `messages`, com o
  id do canal de voz — a regra já aceitava (não olha o tipo do canal), nada
  mudou nas regras. Não vazam para o #geral. Fatia própria no store
  (`roomMessages`, `roomPinnedMessages`), paginada igual ao chat, e só
  carrega enquanto estou conectado e com o chat da sala ligado.
- Mandar, responder (faixa no próprio painel), editar, fixar (dono) e
  apagar pelo mesmo menu das mensagens (`data-context="room-message"`).
  "Ir para a mensagem" numa fixada volta para a aba do chat.
- A casca do painel é montada uma vez por sala: trocar de aba e chegar
  mensagem não apagam o que se está digitando.
- Na sala a coluna da direita fica com 340px (240 não dava para escrever);
  caixa com a dica curta "Mensagem na sala".
- **Liga/desliga**: Configurações → Aparência → "Chat da sala de voz"
  (Ligado/Desligado, guardado na conta). Desligado, a sala mostra o painel
  do grupo de sempre e o chat da sala nem carrega.
- O botão de mostrar/esconder o painel também está no cabeçalho da sala.
- Testes: `tests/sala-chat.spec.ts` (abas, mandar, receber da Ana, rascunho
  sobrevive à troca de aba, responder, fixar, não vaza para o #geral,
  desligar e religar).

## Proposta A, etapa 8a — o jeito da sala de voz (16/11/2026)

A sala de voz (item 8 do plano) dividida em **8a** (jeito da sala), **8b**
(chat da sala no painel da direita, liga/desliga) e **8c** (Configurações →
Voz e áudio, aberta pela engrenagem da sala).

- **Sem transmissão não há palco**: sumiu a caixa vazia "a tela compartilhada
  aparece aqui"; as pessoas ocupam a sala numa GRADE 16:9 que se ajusta ao
  número de blocos (1 sozinho no meio, 2 lado a lado, 3–4 em 2×2, 5–9 em 3
  colunas).
- **Com transmissão**: a tela no PALCO grande e a FILA de pessoas em blocos
  pequenos embaixo (como o desenho a-sala). Um botão no cabeçalho troca para
  GRADE (a tela vira um bloco do lado das pessoas) e de volta — escolha da
  sessão.
- **Cabeçalho**: ícone de alto-falante (era o de monitor), "N pessoas" e o
  RELÓGIO da chamada ("· 12:04", desde que eu entrei; zera ao sair). O
  relógio é um intervalo só, fora da sala, porque a sala é redesenhada a cada
  mudança.
- **Saiu o botão de câmera** que vivia travado com "ainda não implementada"
  — não estava no desenho e botão que não faz nada não fica.
- O "AO VIVO" na lista de canais e o anel de quem fala já existiam.
- Testes: `tests/sala.spec.ts` (sozinho em grade sem palco e sem câmera,
  relógio andando, a Ana entra transmitindo → palco + fila, trocar para grade
  e voltar).

## Proposta A, etapa 5d — o painel da direita do meu jeito (16/11/2026) — fim da etapa 5

Configurações → Aparência → **Painel da direita** (mesmo `appearance`,
campos `panelHidden`, `panelTabs`, `panelFirst`).

- **Mostrar ou esconder** no computador. Também tem um botão no cabeçalho
  do chat (grupo e Privado), ao lado do alfinete: esconde/mostra na hora e
  guarda na conta. Escondido, a coluna 4 some e o chat ocupa o espaço
  (`data-painel` no `<html>`, regra no layout.css). No celular nada muda: o
  painel continua sendo a gaveta do botão de pessoas, e o botão de esconder
  nem aparece.
- **Quais abas** do painel do grupo aparecem (Agora, Membros, Fixadas) —
  pelo menos uma; a última fica travada. Vale no celular também.
- **Qual abre primeiro** (antes era sempre Membros). Trocar essa escolha já
  abre nela; tirar a aba que estava aberta pula para a primeira.
- O botão do alfinete no topo do chat continua abrindo as fixadas mesmo com
  a aba "Fixadas" escondida (é um painel próprio).
- Testes: `tests/aparencia.spec.ts` (4º teste: botão, salvo na conta,
  abas, abre primeiro, recarregar, celular).

## Proposta A, etapa 5c — fundo do chat com imagem (16/11/2026)

Configurações → Aparência → **Fundo do chat**, só na MINHA tela.

- Imagem escolhida pelo mesmo ajustador das outras, em 16:9 (1600×900, até
  ~290 KB) e na tela cobrindo a coluna do chat. **Escurecer** de 0 a 90%
  (padrão 60%): a cor do chat do próprio tema por cima, então o texto lê bem
  em qualquer imagem e em qualquer tema (no Claro o véu é claro).
- **Geral ou por canal**: "Todos os chats" vale em tudo (inclusive no
  Privado); o fundo de um canal ganha do geral. Para um canal: botão direito
  no canal (no celular, segurar) → **Fundo deste canal**, que abre a
  Aparência já apontando para ele. Os canais com fundo próprio aparecem numa
  lista com "Tirar".
- Mora em `userPrivate/{uid}/fundos/{geral | id do canal}` — um documento
  por fundo, porque a imagem é grande e o `userPrivate` é escutado o tempo
  todo. A regra: só o dono, só `image`/`dim`/`label`, imagem no mesmo
  formato das outras (WebP/JPEG em base64, até 400 mil caracteres) e véu
  inteiro de 0 a 90.
- O app escuta o geral sempre e o do canal aberto enquanto ele estiver
  aberto (`lib/chat-background.ts`), e põe as variáveis no `<html>`; o CSS
  fica em layout.css. A prévia das Configurações usa o mesmo CSS.
- Testes: `tests/aparencia.spec.ts` (3º teste: geral, escurecer, canal pelo
  menu ganhando do geral, Privado com o geral, regra recusando imagem falsa e
  véu 95, remover).

## Proposta A, etapa 5b — jeito das mensagens: balões ou lista, lado das minhas, compacto (16/11/2026)

Em Configurações → Aparência, bloco **Mensagens** (mesmo `appearance` da 5a,
campos `messageStyle`, `mySide`, `density`). Vale em todo chat que usa a
lista de mensagens (grupos e privado).

- **Balões** (o de sempre) ou **Lista** (sem caixa, tudo à esquerda, nome em
  cima, fundo leve ao passar o mouse; o meu nome na cor de destaque). Cada
  opção tem uma miniatura.
- **Suas mensagens à direita ou à esquerda** — só nos balões (na lista a
  escolha some: todas já ficam à esquerda). À esquerda, o meu balão continua
  na cor de destaque e ganha o meu avatar.
- **Confortável ou compacto**: menos ar entre e dentro das mensagens e linhas
  mais juntas.
- Como funciona: `lib/appearance.ts` põe `data-mensagens`, `data-meu-lado` e
  `data-densidade` no `<html>` (sem atributo = o padrão), e as regras ficam no
  fim de message-list.css. As MINHAS mensagens agora também têm a calha do
  avatar no DOM, escondida no jeito padrão — nada muda para quem não mexer.
- A prévia das Configurações ganhou uma mensagem de continuação para o
  espaçamento aparecer.
- Testes: `tests/aparencia.spec.ts` (2º teste: esquerda, lista, compacto,
  salvo e depois de recarregar).

## Proposta A, etapa 5a — aparência: tema, cor de destaque, fonte e tamanho do texto (16/11/2026)

A etapa 5 (aparência pessoal) foi dividida em **5a** (cores e letras),
**5b** (mensagens: balão/lista, lado das minhas, compacto/confortável),
**5c** (fundo do chat com imagem) e **5d** (o que aparece no painel da
direita). A 5a é Configurações → **Aparência**, guardada em
`userPrivate/{uid}.appearance` (ao vivo entre aparelhos, como as abas).

- **5 temas**: Noite (o de sempre), Breu (quase preto), Oceano, Floresta e
  Claro. São só blocos `:root[data-tema=...]` em tokens.css que trocam as
  cores — o resto do CSS já usava só tokens, então nada mais mudou. Todo
  texto mede >= 4.5:1 em todas as superfícies de cada tema (o Claro também
  escurece os nomes coloridos e o vermelho de perigo, e a tarja atrás do
  vídeo continua escura). Cada cartão de tema tem uma miniatura nas cores
  DELE: os mesmos seletores também valem para `.tema-amostra[data-tema=...]`.
- **Cor de destaque**: a do tema, 6 prontas ou **livre** (seletor de cor do
  sistema). A livre só entra como `#rrggbb`, e `lib/appearance.ts` calcula as
  variantes com contraste garantido: o texto por cima vira branco ou escuro (o
  que ler melhor), o hover anda para o lado que aumenta o contraste, e o
  "texto em destaque" é clareado (ou escurecido, no Claro) até ler bem sobre
  o fundo do chat.
- **Fonte do app**: Nunito (padrão), Leitura fácil (Atkinson Hyperlegible
  Next, embutida, OFL — feita para baixa visão), Do sistema e Clássica (Lora).
  O nome no cartão continua na fonte que a PESSOA escolheu: a Nunito ganhou
  um token próprio (`--font-nunito`).
- **Tamanho do texto das mensagens**: 12 a 20 px (`--font-size-msg`).
- **Prévia na hora no app inteiro**, sem salvar; Desfazer volta; fechar sem
  salvar não deixa (a barra pisca, como no resto). Se a da conta mudar em
  outro aparelho no meio, a prévia continua até salvar ou desfazer.
- Uma cópia fica no aparelho (localStorage) só para o app já abrir no tema
  certo, sem piscar o roxo. Sair da conta volta ao padrão.
- Testes: `tests/aparencia.spec.ts` (prévia, desfazer, salvar, ao vivo no
  "celular", cor livre amarela com texto escuro, recarregar, sair da conta).

## Proposta A, etapa 4 — abas: 3 jeitos, ordem arrastando e pastas (16/11/2026)

Dividida em **4a** (jeitos e ordem) e **4b** (pastas). Tudo é preferência
pessoal em `userPrivate/{uid}` (ao vivo entre aparelhos, como os apelidos da
3d), escolhido em Configurações → Grupos.

- **Jeito das abas** (`tabMode`): "Todas com nome", "Só ícones" (a aberta
  ganha uma marquinha embaixo, além do fundo) ou "Só a aberta com nome".
  Cada opção tem uma miniatura. O "sem nome" da 3d vale em qualquer jeito.
- **Ordem** (`groupOrder`): no computador, arrastando as próprias abas lá em
  cima — só mouse e só depois de andar 8px, então clique continua clique, e
  o clique do soltar é engolido (arrastar não abre o grupo). No celular a
  faixa de abas rola com o dedo, então lá a ordem muda em Configurações →
  Grupos, pela alça ⠿ (dedo) ou pelas setas na alça (teclado). Grupo novo
  vai para o fim.
- `lib/drag-sort.ts`: arrastar-para-ordenar reaproveitado na barra, na
  pasta aberta e na lista das Configurações. Cada lista só cuida dos próprios
  itens (com a pasta aberta há uma lista dentro da outra).
- **Pastas** (`groupFolders`, até 20): nome, cor e quais grupos; um grupo
  fica em uma pasta só. Criar/renomear/cor/apagar em Configurações → Grupos,
  e cada grupo escolhe a pasta. Na barra a pasta é uma aba com miniaturas
  2×2 dos grupos sobre a cor dela, no lugar do primeiro grupo dela (a ordem
  dentro da pasta é a mesma `groupOrder` — uma lista só, nada para
  desencontrar). Clicar abre/fecha; aberta, os grupos ficam ao lado numa
  moldura da cor da pasta e dá para arrastá-los ali dentro; fechada com o
  grupo aberto lá dentro, a pasta fica acesa. Arrastar a pasta leva os
  grupos dela juntos. Apagar a pasta devolve os grupos soltos, no mesmo
  lugar. Aberta/fechada é conforto do aparelho (localStorage), não da conta.
- Testes: `tests/abas.spec.ts`.

## Proposta A, etapa 3d — apelido do grupo / sem nome (16/11/2026) — fim da etapa 3

- Configurações (pessoais) ganhou a seção **Grupos**: para cada grupo,
  "Nome do grupo", "Meu apelido" (até 32) ou "Sem nome (só o ícone)". Só
  muda a MINHA barra de cima; o cabeçalho da coluna continua com o nome de
  verdade, e o nome de verdade fica no `title` e no nome acessível da aba
  (leitor de tela nunca fica sem nome). Apelido vazio vira "sem nome".
- Atalho: **"Apelido do grupo"** no menu do grupo (cabeçalho e botão direito
  na aba), para qualquer membro — abre as Configurações direto em Grupos
  (também no celular, sem passar pela lista de seções).
- Mora em `userPrivate/{uid}.groupLabels.{groupId}`. A parte privada da
  conta agora é **escutada ao vivo** (`lib/private-prefs.ts`): mudar no PC
  aparece no celular sem recarregar. As boas-vindas da 3c passaram a usar a
  mesma escuta (antes era uma leitura só).
- O Salvar das Configurações salva o que mudou: só os apelidos, só o perfil,
  ou os dois.
- **Notificações por grupo/canal** ficaram para a **etapa 5**: o app ainda
  não tem notificação nenhuma (nem contador de não lidas — ver "Mensagens
  não lidas" mais abaixo), e no plano aprovado as notificações estão nos
  extras da etapa 5. Botão que não faz nada não entra.
- Testes: `tests/apelido-grupo.spec.ts` (mesma conta no PC e no celular).
- **Defeito antigo corrigido**: as iniciais contavam símbolo como palavra
  ("Escola - 3º ano B" virava "E-"). Agora só palavra que começa com letra
  ou número conta ("E3"); vale para grupos criados/renomeados daqui em diante.

## Proposta A, etapa 3c — boas-vindas do grupo (16/11/2026)

- Configurações do grupo ganhou a seção **Boas-vindas**: texto até 500
  (`groups/{id}.welcome`), com a prévia do cartão à direita.
- Quem entra (não o dono) vê um **cartão no topo do chat** — foto/cor e nome
  do grupo, o texto e "Entendi". NÃO é pop-up: não cobre nada, não rouba o
  foco, a caixa de mensagem continua usável; ocupa no máximo 45% da altura.
  "Entendi" devolve o foco para a caixa de mensagem.
- O "já vi" mora em `userPrivate/{uid}.welcomeSeen.{groupId}` — primeiro uso
  do `userPrivate`: vale no PC e no celular e ninguém mais lê. Até a lista
  chegar, o cartão não aparece (sem piscar).
- **Defeito antigo achado e corrigido**: quem se cadastrava por um link de
  convite via de novo "Convite para um grupo — você já faz parte" toda vez
  que abria o app na mesma aba — o convite guardado "para depois do login"
  nunca era apagado durante o cadastro. Agora é apagado quando o convite é
  tratado (`main.ts`).
- **Regra**: `welcome` <= 500, só o dono.
- Testes: `tests/boas-vindas.spec.ts`. Rodados com teto de memória
  (`systemd-run --scope -p MemoryMax=2400M`, `nice 19`): a NOVA estava
  ligada e o PC tinha só 1 GB livre; o Leo desligou a voz da Friday.

## Proposta A, etapa 3b — canais com emoji, ordem arrastando e categorias (16/11/2026)

- Configurações do grupo ganhou a seção **Canais** (dono). Para cada canal:
  alça ⠿ para arrastar, emoji (grade de 24, sem janela por cima), nome
  (renomear canal não existia até agora) e o seletor "Categoria de…".
- **Arrastar** pela alça, com mouse ou dedo (a alça tem `touch-action:
  none`; o resto da página continua rolando). Os movimentos são ouvidos no
  documento: o primeiro jeito, ouvir só na alça, travava — mover a linha de
  lugar no DOM solta a captura do ponteiro (o teste pegou). Perto da borda a
  lista rola sozinha. **Teclado**: setas na alça sobem e descem.
- **Categorias** do próprio grupo: "Nova categoria", renomear, Subir/Descer,
  Apagar (os canais voltam para "Sem categoria"). Até 20. Moram em
  `groups/{id}.categories` (lista na ordem da tela); o canal aponta com
  `categoryId`. Na coluna de canais: o bloco sem categoria em cima
  ("texto"/"voz", como sempre), depois cada categoria com texto e voz
  juntos. Categoria vazia não aparece na coluna.
- Tudo vai pelo mesmo Salvar das Configurações do grupo, num lote só
  (`saveChannelLayout`): ou a ordem nova entra inteira, ou nada muda. Só os
  canais que mudaram de verdade são gravados; as posições são renumeradas
  0, 1, 2... por lista, então arrastar e devolver não conta como mudança.
- O grupo abre no primeiro canal de texto NA ORDEM DA TELA
  (`firstTextChannel`, em `lib/channel-layout.ts`).
- O emoji aparece na coluna e no título do chat.
- **Defeito achado e corrigido**: renomear uma categoria não atualizava o
  nome dela nos seletores das linhas (mostrava "Nova categoria").
- **Defeito achado e corrigido**: o título do chat (e a dica "Mensagem para
  #…") ficava com o nome/emoji velho para quem já estava no canal — a casca
  do chat só é remontada ao TROCAR de canal, para não apagar o que está sendo
  digitado. Agora `ChatParts.setTitle` atualiza só o título e a dica.
- Abrir as configurações pelo botão direito na aba de OUTRO grupo lê os
  canais dele uma vez (`loadChannels`).
- **Regra**: canal — só o dono, sem trocar grupo nem tipo; nome 1–60 (não
  só espaço), emoji <= 16, `categoryId` <= 40, posição inteira 0–999.
  Grupo — `categories` lista de até 20.
- Testes: `tests/canais.spec.ts` (computador com mouse e teclado; celular
  com dedo).

## Proposta A, etapa 3a — Configurações do grupo: foto, banner, nome, descrição, cor (16/11/2026)

A etapa 3 (grupos) foi dividida: **3a** o "perfil" do grupo (esta); **3b**
canais com emoji, ordem arrastando e categorias; **3c** boas-vindas; **3d**
lado do membro (apelido do grupo ou "sem nome", notificações por
grupo/canal).

- Menu do grupo do dono (cabeçalho e botão direito na aba) ganhou
  **"Configurações do grupo"**: tela inteira com a mesma casca das
  Configurações pessoais (prévia à direita, barra de salvar, Esc que pisca
  em vez de pop-up). Membro não vê o item.
- **Foto do grupo** (256×256, QUADRADA de cantos redondos — pessoa é
  círculo, grupo é quadrado) em `groups/{id}.photo`; **banner** (960×280) em
  `groupArt/{id}`. As duas pelo ajustador. O bloco de imagem virou peça
  comum (`components/settings/image-field.ts`), usada no perfil e no grupo.
- **Nome obrigatório** (até 60, o teto que já existia), **descrição** (até
  300) e **cor** (a mesma lista da cor do cartão).
- Onde aparece: a **aba do grupo** mostra a foto, ou as iniciais sobre o tom
  escuro da cor do grupo; o **cartão do grupo** (faixa/banner, foto, nome,
  "N membros", descrição) fica no topo da aba **Agora**.
- O banner do grupo ABERTO é escutado ao vivo (uma escuta só): o primeiro
  jeito, ler uma vez, deixava o banner velho para quem já estava dentro —
  o teste pegou.
- **Regra**: criar grupo exige nome; editar só o dono, sem trocar o
  `ownerId`, e só o que mudou é cobrado (nome 1–60 sem ser só espaço,
  descrição <= 300, cor da lista, foto `imageOk`). `groupArt`: membros
  leem, só o dono escreve, só `banner`. Apagar o grupo apaga o banner.
- Testes: `tests/grupo-config.spec.ts`.

## Proposta A, etapa 2d — status, links e cor do nome (16/11/2026)

- **Status** (Configurações → Perfil): emoji de uma grade própria (32
  emojis, abre embaixo do campo, sem janela por cima), texto até 60 e prazo
  — Não limpar, 30 min, 1 h, 4 h, Hoje (até meia-noite), 7 dias. Depois de
  salvo, o prazo vira "Manter (até 14:30)". "Limpar status" apaga. Grava
  `users/{uid}.customStatus = {emoji, text, until}` (`until` em ms, 0 = sem
  prazo). O vencido SOME sozinho na tela (`activeStatus`), mesmo ainda no
  banco. Aparece no cartão (pílula embaixo do `@`) e na lista de membros
  (linha pequena embaixo do nome, ao vivo).
- **Links**: até 3. "youtube.com/@x" vira `https://youtube.com/@x`, `http://`
  vira `https://`; o que não parece site avisa ao sair do campo e trava o
  salvar. No cartão viram pílulas (`↗ youtube.com/@x`) que abrem em outra
  aba com `rel="noopener noreferrer nofollow"`.
- **Cor do nome nas mensagens**: Padrão + 7 cores (roxo, rosa, vermelho,
  laranja, amarelo, verde, azul), tons claros em `tokens.css` (`--nome-*`),
  todos >= 7:1 sobre o balão. Pinta o nome nas mensagens dos OUTROS (no meu
  balão roxo o nome continua branco, por contraste). A prévia das
  Configurações ganhou "Nas mensagens", uma mensagem de mentira com a cor.
  Vai por `data-name-color` + CSS, nunca estilo escrito à mão.
- **Regra**: `nameColor` só da lista; `customStatus` só com as 3 chaves,
  texto <= 60, `until` inteiro >= 0; `links` lista de 1 a 3, cada um
  `https://` sem espaço/aspas/`< >` e <= 200. Código em
  `lib/profile-extras.ts` (status, prazos, links).
- Limite que continua: no cartão do PV e na lista de amigos o perfil do
  amigo é lido uma vez por sessão (status novo aparece ao recarregar). Nos
  grupos (membros, mensagens) e no cartão flutuante é sempre o mais novo.
- Testes: `tests/status-links.spec.ts` (ponta a ponta com 2 contas + regra).
  Os testes antigos de cor do cartão agora escolhem pelo grupo ("Rosa" e
  "Verde" existem nas duas listas). Fotos: `design/etapa2d-*`.

## Proposta A, etapa 2c — cartão ao clicar em alguém (16/11/2026)

- Clicar no nome ou na foto de alguém — lista de membros, nome/foto na
  mensagem, pessoa no painel "Agora", lista de quem está na sala — abre o
  **cartão flutuante** (`components/person-card/person-popover.ts`): faixa,
  foto, fundo, nome na fonte da pessoa, `@` e bio. Um ouvinte só na raiz do
  app; os componentes só marcam `data-profile-uid`. Enter/espaço também abre.
- Abre NA HORA com o que já se sabe (nome, iniciais, foto) e completa com o
  perfil e as imagens lidos de novo — mostra sempre a versão mais nova (isso
  resolve, no cartão, o "perfil de amigo lido uma vez por sessão" da 2b).
- Botão conforme o vínculo: eu → "Editar perfil" (abre Configurações);
  amigo → "Enviar mensagem" (abre o PV); pedido pendente → aviso; bloqueado
  → aviso; ninguém → "Adicionar amigo" (manda o pedido ali mesmo).
- Fecha com Esc, clique fora, rolagem ou mudança de tamanho da janela.
- **Esc das Configurações**: o Chrome agrupa os "fechar com Esc" de diálogos
  abertos sem clique (o ajustador abre depois da escolha do arquivo) e,
  depois de alguns, engolia o Esc seguinte — medido nos testes, o `cancel`
  nem disparava. Agora as Configurações tratam o Esc elas mesmas (só quando
  são o diálogo de cima).
- **Teste "rolar ao topo" instável desde a etapa 1** (antes 3 de 3, depois
  1 de 3): o APP estava certo (âncora parada a 63px nas duas trocas, medido
  com logs); o teste é que media o "antes" num nó já trocado, porque o
  histórico passou a entrar mais rápido. Agora rola e mede no mesmo evaluate.
  5 de 5.
- Testes: `tests/cartao.spec.ts` (membros, mensagem, bio nova, pedido,
  "Editar perfil", "Enviar mensagem" → PV).

## Proposta A, etapa 2b — as 3 imagens do perfil com ajustador (16/11/2026)

- **Ajustador** (`components/image-adjuster/`): arrastar para mover, zoom
  pela barra, rodinha do mouse ou dois dedos (e setas/+/− no teclado), no
  formato final — círculo da foto, faixa do banner, retrato do fundo. A foto
  mostra miniaturas "no cartão / nas mensagens / na chamada" e o tamanho
  final ("Sai como 256×256, uns N KB"). Tudo no aparelho: só o recorte sai.
- **Onde moram** (`lib/images.ts`): foto 256×256 em `users/{uid}.photo`
  (vem junto com o perfil que já é lido, então aparece em mensagens,
  membros, painel, chamada, amigos, PV e no meu cartão); banner 960×280 e
  fundo do cartão 540×720 em `profileArt/{uid}`, lidos só para mostrar o
  cartão. WebP (JPEG se o aparelho não gerar WebP), qualidade baixando até
  caber no teto (foto 90 mil caracteres, banner/fundo 300 mil).
- **Regra**: `imageOk()` — só `data:image/webp|jpeg;base64,…` e dentro do
  teto; `profileArt` só com `banner`/`cardBg`, só o dono escreve, qualquer
  logado lê. No cliente, `safeImage()` confere de novo antes de pôr na tela.
- Configurações → Perfil ganhou "Imagens do perfil" (Escolher/Trocar,
  Ajustar, Remover). "Ajustar" usa o arquivo original enquanto a tela está
  aberta; depois, ajusta o recorte salvo.
- Cartão de pessoa: banner como imagem da faixa; fundo do cartão com véu
  escuro por cima (texto legível sobre qualquer imagem).
- Modais agora têm nome acessível (título ligado por `aria-labelledby`).
- **Defeito achado e corrigido**: criar grupo pelo "+" estando no Privado
  criava o grupo mas a tela ficava no Privado. Agora abre o grupo novo.
- Testes novos em `configuracoes.spec.ts`: imagens de ponta a ponta (com
  arrastar e zoom) e regras das imagens. Fotos: `design/etapa2-ajustar-*`,
  `etapa2-config-imagens`, `etapa2-pv-cartao-imagens`, `etapa2-grupo-com-foto`.
- Limite conhecido: o perfil dos AMIGOS (cartão do PV, lista de amigos) é
  lido uma vez por sessão; foto nova de um amigo aparece ali depois de
  recarregar. Nos grupos (membros, mensagens) é ao vivo. Fica para a 2c.

## Proposta A, etapa 2a — Configurações em tela inteira + Perfil (16/11/2026)

O Leo mandou seguir direto pelas etapas (o programa independente fica para
depois: de madrugada ninguém ia usar mesmo). A etapa 2 foi dividida em:
**2a** tela de configurações + perfil sem imagens (esta); **2b** ajustador e
as 3 imagens (foto, banner, fundo do cartão); **2c** cartão que abre ao
clicar em alguém; **2d** status com emoji e prazo, cor do nome nas
mensagens, links. A atividade "jogando" depende do programa (fase 2).

- A engrenagem do meu cartão (barra de cima) abre **Configurações em tela
  inteira** (`components/settings/`), um `<dialog>` por cima do app: a
  chamada e a transmissão continuam por baixo. Menu: Você → Perfil, Conta e
  segurança; "Sair da conta" no pé. Seções que ainda não fazem nada NÃO
  aparecem (entram nas próximas etapas).
- **Perfil**: nome de exibição (até 32), `@` (troca com aviso ao vivo de
  livre/ocupado e quantas trocas sobram), bio (até 160, com contador), cor
  do cartão (6: roxo, rosa, verde, azul, laranja, claro) e fonte do nome
  (Nunito, Clássica = Lora, Pixelada = Silkscreen, FORTE = Nunito 900).
  Prévia do cartão ao vivo à direita. Barra "alterações não salvas" com
  Desfazer/Salvar; Esc com alteração pendente faz a barra tremer, sem
  pop-up. Salvar grava `users/{uid}` E o nome na conta do Auth (senão o
  login voltava o nome antigo).
- **Conta e segurança**: e-mail (confirmado ou não) e "Mandar link para
  trocar a senha".
- **Cartão de pessoa** (`components/person-card/`): faixa na cor da pessoa,
  avatar por cima, nome na fonte dela, `@` e bio. O mesmo na prévia e no PV
  (o cartão do PV agora mostra a bio — antes `publicProfile` nem lia bio,
  cor e fonte). O painel do PV deixou de ser 1/3 fixo: o cartão ocupa o que
  precisa (até 65%).
- `person-theme.ts` reescrito: as listas antigas eram do tema claro, que
  não existe mais, e mexiam no `--accent` do cartão. Agora a cor mora em
  `--card-cor`/`--card-cor-fim`, só dentro do cartão.
- **Regra**: `users/{uid}` só aceita nome 1–32, bio ≤ 160, cor e fonte das
  listas fechadas — cobrado só no campo que MUDOU (contas antigas com nome
  comprido continuam entrando).
- Fontes novas embutidas (OFL, `src/assets/fontes/OFL-lora.txt` e
  `OFL-silkscreen.txt`), subconjunto latino.
- **Celular**: a barra de cima mostra a engrenagem no lugar do "sair"; as
  configurações abrem na lista de seções, com seta de voltar.
- Testes: `tests/configuracoes.spec.ts` (4), mais mobile/pins/helpers
  ajustados. Rodados: configuracoes, mobile, cadastro, pins, dm, identidade,
  friends — tudo verde. Fotos: `design/etapa2-*.png`.
- A falha do "seletor … recebe o vídeo" da última rodada completa: sozinho
  passou 5 de 5; é o defeito conhecido do vídeo sob carga (etapa 9). Olhar
  de novo na próxima rodada completa antes de publicar.

## Proposta A, etapa 1c — acabamento da coluna da esquerda (16/11/2026)

- Cabeçalho do grupo: nome maior e "N membros" embaixo (`memberCount`; a
  coluna de canais agora também redesenha quando os membros mudam).
- Títulos de seção dos canais em caixa alta.
- Canal de voz com alguém transmitindo ganha o selo **AO VIVO**
  (`VoicePresenceView.sharingScreen`).
- A faixa de chamada do desktop virou o cartão **"Em chamada"**: onde estou
  (clique volta para a sala) e, embaixo, microfone, **transmitir tela** (só no
  computador — navegador de celular não transmite) e sair.
- `--header-h: 56px`: todos os cabeçalhos de coluna (canais, chat, privado,
  amigos, abas do painel) na mesma altura, com as bordas alinhadas.
- Testes: o da janela confere o AO VIVO aparecendo e sumindo para o amigo;
  rodados desktop, painel, mobile e os de voz/faixa do loft.spec.

## Proposta A, etapa 1b — painel da direita com abas (16/11/2026)

- `components/group-panel/`: a coluna 4 do grupo (ainda a `.members`, ainda
  a gaveta da direita no celular) ganhou as abas **Agora**, **Membros** e
  **Fixadas**. Começa em Membros (o que a coluna mostrava antes).
- **Agora**: cada sala de voz com alguém dentro — quem está, quem está mudo,
  "AO VIVO" e "Fulano está transmitindo" — com botão "Entrar na sala" /
  "Assistir" (some se eu já estou nela). Sem ninguém: aviso. Bolinha vermelha
  na aba quando alguém transmite.
- **Fixadas**: a mesma `renderPinnedList` do painel flutuante (que continua
  existindo pelo botão de alfinete).
- `member-list` exporta `memberListContent` para o painel reaproveitar.
- `membersChanged` (app.ts) agora também olha voz, canais, fixadas e — só
  com a aba Fixadas aberta — as mensagens (de onde vem o "alcançável").
- Pegadinha: `.group-panel { grid-template-rows }` perdia para a regra de
  `.members` (mesmo peso, CSS carregado depois) — virou `.members.group-panel`.
- Teste: `tests/painel.spec.ts` (duas pessoas: Agora em tempo real, entrar
  pelo painel, fixada aparecendo para o outro).

## Proposta A, etapa 1a — a barra de cima (16/11/2026)

- `group-bar` deixou de ser a coluna vertical: é a BARRA DE CIMA (linha 1 do
  grid, `grid-column: 1 / -1`), com a marca **Loftchat**, a aba **Privado**
  (antes a casinha "Tela inicial"), uma aba por grupo (foto + nome; rola para
  o lado quando não cabe), o "+" e o MEU CARTÃO (o `session-footer`, que saiu
  do pé de `channel-list` e `home-column`).
- `--rail-w` virou `--topbar-h: 60px`. Grid: 2 linhas × 3 colunas (canais,
  centro, painel).
- Celular: a barra fica fixa em cima (as abas rolam; o cartão mostra só a
  foto e o sair); a gaveta da esquerda tem só os canais e começa abaixo da
  barra; o véu também.
- A coluna da tela inicial agora se chama "Privado".
- Marca Loftchat: tela de login, título da guia, manifest, avisos ("convite
  do Loftchat", "Use o Loftchat no computador"), `productName` e título da
  janela do programa.
- Testes: "Tela inicial" → aba "Privado" (`exact`); no celular o chat começa
  em y=60 e "Sair da conta"/"Privado" ficam à mão sem gaveta. Rodados os
  arquivos afetados (cadastro, dm, friends, identidade, mobile, pins e o de
  sair da conta): 31/31.

## O chat saiu do ar; `loftchat.com.br` virou o SITE (16/11/2026)

Pedido do Leo, aproveitando que as contas tinham acabado de ser apagadas: o
chat no navegador sai do ar e só volta como programa (Linux/Windows) e app
(Android). No lugar, o site de apresentação desenhado no estilo do site da
NOVA (aprovado: "muito foda esse design").

- `site/`: `index.html` (abertura com o app e cartões flutuando, recursos com
  painel que troca ao clicar, "Do seu jeito", transmissão, baixar com o
  sistema de quem abriu marcado), `termos/`, `privacidade/`, `404.html`,
  `estilo.css` compartilhado, fonte Nunito e imagens em `img/`.
- Baixar: os três sistemas dizem **"Em breve"** — ainda não há instalador.
- `site/sw.js` se DESINSTALA (o Loft antigo registrava um service worker
  neste endereço; ele não guardava nada, mas não fica resto).
- `firebase.json`: hosting serve `site/`, sem o rewrite de SPA (endereço
  inexistente, como um convite antigo, cai no 404 do site).
- `npm run deploy` publica SÓ o site. O app (`npm run build` → `dist/`) não
  vai mais para o hosting: vai dentro do programa (fase 2).
- Conferido no ar: `/`, `/termos/`, `/privacidade/`, css, imagens e fonte dão
  200; `/convite/…` dá 404 com a página do site.
- **Atenção:** `desktop/main.mjs` ainda abre `https://loft-3d6c0f.web.app`,
  que agora é o SITE. Para testar a janela com o chat, usar `LOFT_URL` com o
  Vite (`npm run dev`) até a fase 2 pôr o código dentro do programa.
- Para desfazer: o console do Firebase guarda as versões do hosting.
- **Defeito achado pelo Leo:** no Chrome do celular onde ele tinha aberto o
  Loft antigo, o chat velho continuou aparecendo (até recarregando), e num
  navegador novo aparecia o site. Causa: o Firebase Hosting manda
  `Cache-Control: max-age=3600` por padrão — o navegador guarda cada página
  1 h sem perguntar. Eu tinha conferido só o service worker (que não guarda
  nada) e não o cache HTTP. Corrigido: `firebase.json` manda `no-cache` em
  TUDO (`"source": "**"`). Conferido no ar.


## Publicação de 16/11/2026 (madrugada)

- `firebase deploy --only firestore:rules` e `npm run deploy` — conferido no
  ar: o site tem "Repetir senha"; `get` de um `@` sem login dá 404 (liberado,
  não existe) e `list` sem login dá 403 (bloqueado).
- A pedido do Leo, TODAS as 11 contas apagadas (`limpar-projeto-real.mjs
  --manter=ninguem@exemplo.invalid --apagar`), com 160 documentos (7 grupos,
  54 mensagens, 32 mensagens privadas…). Não havia conta automática: a
  "Índices" do `check:indexes` já tinha sumido antes. Conferido depois: 0
  contas, 0 documentos, 0 órfãos. Todo mundo recria a conta pelo cadastro
  novo.
- Falta: e-mail de confirmação saindo de `noreply@loftchat.com.br` (console
  do Firebase → Templates → domínio próprio + registros no Registro.br,
  feito pelo Leo comigo), remetente "Loftchat" e texto em português.

## Correção urgente — o `@` some depois do cadastro (15/11/2026)

**O defeito, contado pelo Leo:** ele mandou para um amigo o `@` que tinha
digitado na tela que aparecia DEPOIS do cadastro, errou um caractere e nunca
mais conseguiu descobrir o nome certo. Causa no código: cada conta tinha dois
nomes — "nome de exibição" (cadastro) e `@` (tela "Como te encontram no
Loft", depois da confirmação do e-mail) — e **o próprio `@` não aparecia em
lugar nenhum depois**: o rodapé só mostrava o nome de exibição.

**O conserto (desenho do Leo):**

- Cadastro com tudo junto: nome de exibição, nome de usuário (`@`), e-mail,
  senha e **repetir senha**. Enquanto digita, o Loft avisa se o `@` está livre
  (`usernameFree`). `@` ocupado é recusado ANTES de criar a conta.
- As regras só deixam reservar `@` com e-mail confirmado (anti-spam, etapa
  14) — isso continua. O `@` do cadastro fica em `users/{uid}.pendingUsername`
  e `resolveUsername` (main.ts) reserva sozinho quando o e-mail é confirmado;
  `claimUsername` apaga o pendente na mesma batch.
- A tela de escolher `@` virou só o caso raro (alguém pegou o nome nesse
  meio-tempo), com título "Seu nome de usuário", o motivo escrito e o nome já
  no campo.
- Cartão do rodapé: nome de exibição grande, `@` pequeno embaixo; um clique
  copia o `@` (aviso "copiado. Mande para quem vai te adicionar.").
- `firestore.rules`: `usernames/{name}` ganhou `allow get: if true` (um nome
  só, até sem login — o aviso de "livre" do cadastro); `list` segue exigindo
  login. **Precisa de `firebase deploy --only firestore:rules`.**
- "Esqueci minha senha" sumiu do modo criar conta (o comentário do código já
  dizia que era só do modo entrar, mas aparecia nos dois).

**Dois defeitos da sala de voz achados pela suíte (anteriores a hoje):**

- O aviso "O navegador bloqueou o áudio automático" aparecia SEM bloqueio:
  reatribuir `srcObject` (quando chega o som da tela) interrompe o `play()`
  anterior com `AbortError`, e o motor tratava qualquer erro como bloqueio.
  Agora só `NotAllowedError` conta.
- O aviso só aparecia/sumia quando OUTRA coisa mudava na sala:
  `voiceAudioBlocked` e `voiceMicDenied` não estavam na lista de redesenho
  (`voiceChanged` em app.ts). "Ativar áudio" resolvia o som e o aviso ficava.
- Teste: `play()` respondendo `NotAllowedError` (aviso aparece e "Ativar
  áudio" tira) e `AbortError` (nada de aviso). Bloqueio REAL não dá para
  provocar com a suíte muda (o Chromium deixa tocar o que não faz som).
  Contraprova feita: sem a correção, o teste falha.

**Jeito de testar combinado com o Leo (15/11/2026):** suíte inteira só antes
de PUBLICAR; nos commits do dia a dia, só os testes do que mudou.

**Defeito achado no caminho:** `upsertUserProfile` rodava a cada login com
`setDoc` SEM merge — reescrevia o perfil inteiro sem `username` e a regra
(certa) recusava, calada (o login seguia porque a tela já tinha trocado).
Agora é `merge: true`.

Testes: `tests/cadastro.spec.ts` (aviso livre/ocupado e `@` ocupado não vira
conta; senhas diferentes; `@` reservado sozinho + cartão + copiar + banco
limpo + entrar de novo mantém; alguém pega o `@` antes da confirmação → tela
explica e pede outro). `signUpThroughUi`/`signUpFromInviteUi` usam o
formulário novo e FALHAM se a tela de escolher `@` aparecer.

## App de computador — etapa 3: som do PC na transmissão (Linux)

No Mint o navegador só manda som de ABA. Na janela, o som do PC inteiro vai
junto da tela — **menos o som do próprio Loft** (senão os amigos ouviriam a
própria voz de volta).

- `@vencord/venmic` 7.2.5 (MPL-2.0, já vem compilado para Linux x64/arm64,
  sem compilar nada): cria no PipeWire um microfone virtual
  `vencord-screen-share` que recebe uma cópia do som de cada programa.
- `desktop/main.mjs`: `ligarAudioDoPc` liga o venmic excluindo o processo
  "Audio Service" do Loft (é por ele que sai a voz da chamada) e as gravações
  (`Stream/Input/Audio`). **Sem achar esse processo, não liga** — melhor sem
  áudio do que com eco. Nasce mudo e só solta depois que a faixa existe (como
  o Vesktop). `will-quit` desliga.
- Site: `capturarAudioDoPc` (`lib/desktop.ts`) pega o microfone virtual com
  eco/ruído/ganho automático DESLIGADOS e estéreo 48 kHz (é jogo e música, não
  voz). O motor ganhou `startScreenShare(audioExtra?)`: a faixa entra antes de
  a tela ir para as conexões, e `stopSharing` (o único lugar que para) desliga
  o venmic junto.

**Teste sem som nenhum** (`som do PC no Linux`, em desktop.spec.ts):

- Um alto-falante DE MENTIRA (null sink `loft-teste-mudo`, prioridade 0 — o
  padrão da máquina não muda) é criado e apagado pelo teste. Apagar é pelo id
  achado no `pw-dump` pelo NOME (o id que o `pw-cli create-node` mostra não é
  o do nó).
- O tom de teste nasce com `node.autoconnect=false` e é ligado à mão, só no
  ralo; o teste confere que ele não está ligado a mais nada.
- A janela abre SEM o microfone falso (ele esconde todos os dispositivos,
  inclusive o virtual), com `PULSE_SOURCE`/`PULSE_SINK` no ralo, e uma trava
  confere que nenhum microfone de verdade (`alsa_input*`) está ligado nela.
- Para provar a exclusão, o Loft toca SILÊNCIO (ganho 0) no ralo — sem
  ninguém na chamada não existe outra coisa para ele tocar. Confere: tem
  cópia do tom no microfone virtual, nenhuma da saída do Loft. Conferido que
  o teste FALHA quando a exclusão sai do código.
- `LOFT_AUDIO_TESTE=1` (só fora do instalador) desliga o "só alto-falante
  padrão" do venmic, porque o tom toca no ralo.

## App de computador — etapa 2: seletor de tela próprio

Na janela não existe o seletor do navegador. Agora o Loft mostra o dele:
miniaturas de cada tela e de cada janela, separadas em "Telas" e "Janelas",
com o "Transmitir" travado até escolher.

- `desktop/preload.cjs` põe `window.loftDesktop` na página (só isso: nada de
  Node). `fontesDeTela()` lista com miniatura e ícone; `escolherFonte(id)`
  avisa a janela qual fonte o próximo `getDisplayMedia` recebe.
- `desktop/main.mjs`: `setDisplayMediaRequestHandler` entrega SÓ a fonte
  escolhida, uma vez; sem escolha, recusa. A própria janela do Loft fica fora
  da lista (transmitir ela mesma vira túnel).
- Site: `src/lib/desktop.ts` (detecta a janela), `components/screen-picker/`
  (o seletor, sobre a casca de modal, que ganhou `wide` e `onClose`) e
  `store.toggleScreenShare(escolherFonte?)` — o seletor roda depois das
  checagens ("alguém já transmite") e antes de capturar. No navegador nada
  muda.
- Janela: `autoplayPolicy: 'no-user-gesture-required'` (a voz dos outros toca
  sem clique; antes aparecia "O navegador bloqueou o áudio automático") e
  `backgroundThrottling: false` (com o Loft atrás do jogo a página não dorme).

**Defeito achado e corrigido no caminho:** a lista de permissões da etapa 1
não tinha `display-capture`, e a janela recusava a captura com
`NotAllowedError` — que o Loft trata como "desistiu", então falhava CALADO.

**Testes** (`tests/desktop.spec.ts`, 5 no total): seletor lista tela e
janelas, esconde a janela do Loft, trava sem escolha, desistir não transmite
nem deixa capturar por fora; a janela transmite outra janela e o amigo no
navegador recebe vídeo com dimensão real.

**Pegadinhas de teste**

- **Xvfb esconde a tela, não o SOM.** Em 15/11 o microfone falso bipou no
  alto-falante do Leo durante uma chamada de teste. Agora `--mute-audio` está
  em `MEDIA_ARGS` (suíte inteira) e a janela de teste abre muda e confere isso.
- Sem gerenciador de janelas o Electron não lista NADA (o próprio Electron
  pula esse caso nos testes dele). `scripts/tela-de-teste.sh` sobe Xvfb +
  metacity. Sem ele, os testes do seletor pulam com o motivo.

## App de computador (janela) — etapa 1: a janela abre o Loft

Plano combinado em 15/11/2026: o Loft ganha uma JANELA para Linux e Windows
(fora do navegador) e depois um app de celular. Os dois pontos que precisam
ser perfeitos: **compartilhar tela com áudio** e **baixa latência**.

O motivo da janela, nas palavras do Leo: no Linux Mint, compartilhar a tela
inteira (ou uma janela) pelo navegador sai SEM áudio — só a aba do navegador
manda som. No Windows o navegador manda o som do sistema. A janela resolve o
Linux pegando o som direto do PipeWire.

Etapas do plano:

1. Janela Electron abrindo o Loft (login, chat, voz) — **esta**.
2. Seletor próprio de tela/janela + compartilhar só a imagem.
3. Áudio no Linux: venmic (PipeWire), som do PC inteiro MENOS o do Loft (sem
   isso os amigos ouvem a própria voz de volta).
4. Áudio no Windows: captura do Windows que exclui um processo (Windows 10
   2004+), peça em C++ compilada no GitHub Actions. Quem testa: o Lucas.
5. Medidor (tempo da mensagem de um PC ao outro; chamada direta ou via TURN)
   e ajustes de velocidade.
6. Instalador (.exe e Linux), ícone, atualização automática, notificações.

Regra do Leo para ferramentas: pode usar qualquer coisa do GitHub/npm, desde
que seja **totalmente grátis e não seja gambiarra**.

Latência das mensagens, já conferida: o Firestore do projeto está em
`southamerica-east1` (São Paulo) e as mensagens chegam por escuta em tempo
real. A janela não muda esse caminho.

**O que foi feito**

- `desktop/` — o app Electron (45.3.2). `main.mjs` abre o **site publicado**
  (`https://loft-3d6c0f.web.app`), não uma cópia: o que muda no site vale na
  janela sem reinstalar, e janela e navegador são o mesmo Loft. Sem barra de
  menu, uma instância só (abrir de novo traz a janela pra frente), link de
  fora abre no navegador do sistema, microfone/notificação só liberados para
  o próprio Loft.
- Fora do instalador, `LOFT_URL` troca o endereço e `LOFT_DADOS` a pasta de
  dados — é assim que o teste aponta a janela para o Vite do emulador.
- `npm run janela` (`scripts/janela.mjs`) abre a janela pelo código.
- `tests/desktop.spec.ts` (3 testes, entram no `npm test`; pulam sozinhos se o
  Electron não estiver instalado): a janela abre o Loft; **a mesma conta na
  janela e no navegador troca mensagens nos dois sentidos**; link de fora vai
  para o navegador e o microfone funciona.

**Pegadinhas**

- O terminal do VS Code define `ELECTRON_RUN_AS_NODE=1`: com ela o Electron
  roda como Node e não abre janela. `scripts/janela.mjs` e o teste tiram a
  variável.
- O npm desta máquina não roda os scripts de instalação dos pacotes: o
  binário do Electron não vem com `npm install`. Rodar o instalador do
  próprio pacote (`node node_modules/electron/install.js`), com
  `electron_config_cache` apontando para o HD (o `ELECTRON_CACHE` antigo é
  ignorado e o zip de 119 MB ia para `~/.cache/electron`).
- Neste PC, `desktop/node_modules` é um atalho para o HD
  (`Arquivo/Loft-desktop/instalar/node_modules`) — ver COMO-RODAR.md.

Ainda NÃO compartilhava tela (resolvido na etapa 2). Nada publicado; o site não mudou nesta etapa.

## Ajustes mobile pós-etapa 20 (19/10/2026, commits `ec26661` e `2dac443`)

- A coluna Início (tela inicial) virou gaveta no celular, e a gaveta do PV
  empilha cartão e fixadas em vez de pôr lado a lado.
- Sem grupo nenhum, a tela ganhou o botão de gaveta (antes não havia como
  chegar em Amigos nem em "Sair da conta" no celular).
- Testes novos em `tests/mobile.spec.ts`. **Ainda não publicado** (falta
  `npm run deploy`).

## Etapa 20 — Identidade visual

O Loft deixou de ser "cinza-escuro + roxo, jeitão padrão de chat" e ganhou a
identidade escolhida pelo Leo no laboratório (`lab.html`, só em
desenvolvimento — ver o commit `121f02b`). Etapa só visual: nada de
funcionalidade, layout das colunas, texto, Firestore, regra, WebRTC ou
sinalização mudou.

**Publicada no Hosting em 08/10/2026 às 23:54 (horário de Brasília)** —
versão `2475da8ab0ade9b0`. Só o Hosting (`npm run deploy`); regras e índices
não foram tocados.

### As escolhas

| Item | Escolha | Onde mora |
| --- | --- | --- |
| Paleta | A, "Noite no sótão" (roxo-noite) | `src/styles/tokens.css` |
| Botão | 1, chapado, raio 14px | tokens + `motion.css` |
| Clique | 1, encolhe para 92% em 150 ms e volta | `src/styles/motion.css` |
| Transição | 1, cruzada, 200 ms | `src/lib/transition.ts` + `motion.css` |
| Cantos | 2: cartão/balão/modal 16px, botão 14px | `--radius-lg` / `--radius-md` |
| Chegada | 1, sobe 12px enquanto aparece, 200 ms | `animarChegada` (transition.ts) |
| Detalhe | só o 7.4, fixada vira bilhete com fita | `pinned-list.css` + `--note-*` |
| Fonte | Nunito, embutida (self-host) | `src/assets/fontes/` + `src/styles/fonts.css` |

Curva de tudo: `cubic-bezier(0.2, 0.8, 0.2, 1)`, a mesma do lab. Com
`prefers-reduced-motion`, toda transição e animação vira troca seca.

### Decisões tomadas com o Leo durante a etapa

- **As variáveis CSS continuam.** A regra do lab era "hex e px direto, sem
  variável". O app inteiro é construído em cima de variáveis (866 usos em 29
  arquivos), e três coisas dependem delas de verdade: `--app-height` (teclado
  do celular, layout.ts), `--layout` (o corte dos 720px, layout.ts) e o tema
  por pessoa do cartão de perfil (person-theme.ts, preparo da Entrega 3).
  Converter tudo seria grande e quebraria isso. Os VALORES novos estão
  escritos em hex/px literais no tokens.css, que continua sendo o único
  arquivo com cor.
- **O Loft agora é só escuro.** Saíram o tema claro e os blocos de
  `prefers-color-scheme`/`data-theme` (index.html atualizado). Tema escolhido
  pela pessoa volta na Entrega 3.
- **Botão roxo, não laranja.** O botão 1 do lab era laranja (#e8833a); no
  app ele usa o roxo da paleta A.
- **Sem o ciano.** A paleta A do lab tinha um segundo destaque (#22d3ee); o
  app ficou só com o roxo.
- **Gradiente só na casinha.** A minha mensagem é roxo sólido.
- **Transição cruzada de verdade**, como no lab (a velha esmaece enquanto a
  nova entra) — ver "Como a transição funciona" abaixo.
- **Bilhete na largura da lista**, não nos 220px fixos do lab.

### Contraste (WCAG, mínimo 4.5:1 para texto)

Medido para todos os pares de texto principais. Os que ficaram abaixo e o
ajuste aprovado:

| Par | Lab | Ajuste aprovado |
| --- | --- | --- |
| branco sobre o hover do botão (#9361f0) | 4.03 | hover ESCURECE para #6a30cc (7.22) |
| roxo #7b3fe4 usado como cor de TEXTO | 3.26 | `--accent-text` #a98bf5 (6.84); fundo segue `--accent` |
| texto apagado (derivado, #8577b8) dentro do balão / sobre hover | 4.12 / 4.15 | #8e81c1 (4.69 / 4.72) |
| autor/data do bilhete (#8a7434 sobre #fff1a8) | 3.98 | #7a6428 (5.00) |

Os valores que o lab não definia (texto apagado, perigo #f2557a, hover
#221a3d, borda forte #3d2f70, fundo fundo/tarja de vídeo #0b0816, véu do
modal #0e0a1a99) foram derivados da paleta A, aprovados e medidos. Texto
principal sobre o chat: 15.00:1.

### Como a transição funciona (e por que assim)

O app troca de visão SUBSTITUINDO o nó — a coluna velha deixa de existir na
hora, e isso não mudou: dados e listeners seguem exatamente o mesmo caminho,
sem esperar animação nenhuma. `trocarComTransicao` fotografa a coluna velha
antes da troca e põe por cima um FANTASMA (cópia + posições de rolagem) que
esmaece em 200 ms enquanto a nova aparece.

O fantasma mora num **shadow root fechado**, `inert` e `aria-hidden`: nem o
Playwright nem leitor de tela enxergam a cópia, então nunca existem dois de
cada botão na página. O CSS do app entra nele por `adoptedStyleSheets`.

Onde: casinha ↔ grupo, troca de grupo, troca de canal, abrir PV (colunas 2,
3 e 4 só quando a VISÃO muda — dado novo na mesma visão não pisca), abas da
tela inicial, modal e gavetas do mobile. **A sala de voz fica de fora**
(troca seca): vídeo de chamada e tela compartilhada não animam, e um
`<video>` copiado nem teria o stream.

**Modal: o `<dialog>` continua saindo do DOM no instante em que fecha.** Uma
primeira versão o segurava 200 ms no DOM para esmaecer e quebrou 3 testes
(dois `.diag`, dois `dialog` ao reabrir em seguida) — era mudança real de
comportamento, então o conserto foi no app: a saída também é um fantasma,
fotografado ANTES de fechar (todo fechamento passa por `fechar()` em
modal.ts; o Escape fotografa no `cancel`). A entrada é `@starting-style`.

**Gavetas:** a transição ficou dentro da media query que já existia em
layout.css (o 720 continua num lugar só, decisão da etapa 8). O véu passou a
existir sempre no mobile, transparente e sem receber toque, para poder
esmaecer também ao fechar.

### Chegada de mensagem

`swapMessages` anima só o que NÃO estava na lista anterior e vem DEPOIS da
mais nova que já estava. Abrir canal/PV e a lista ainda carregando não
animam (o render passa `animarNovas = false`); o histórico ("carregar
anteriores", rolar ao topo) entra acima e nunca se encaixa na regra. O teste
foi conferido contra a regra quebrada de propósito (animando tudo) e acusou
54 animações a mais — o detector detecta.

### Bilhete com fita

Valores do lab no `.pinned-item`; a fita é `::before` (nenhum nó novo). Medida
MINHA, não do lab (o lab tinha um bilhete só): folga entre bilhetes para a
fita e nas bordas da lista para os cantos inclinados não serem cortados. O
clique 1 no bilhete compõe a escala com a inclinação. **A animação de "colar"
do lab não entrou** (pendência abaixo).

### Testes

- `tests/identidade.spec.ts` (novo): fantasma existe, vive ~200 ms, é
  fechado/inert/aria-hidden e some; movimento reduzido não cria nenhum; modal
  sai do DOM na hora; chegada só ao vivo; bilhete medido (papel, tinta,
  inclinação, fita) e o clique ainda leva à mensagem.
- `tests/identidade-capturas.spec.ts` (novo): capturas desktop e mobile em
  `screenshots/identidade/` (fora do git).
- **Os dois testes de histórico instáveis desde a etapa 16** ("rolar ao
  topo…" e "chegar ao começo…") ficaram MAIS instáveis com a fonte nova
  (medido isolado: 1 de 6 antes da etapa 20, 3 de 6 depois). A hipótese
  registrada neles estava certa: `seedHistory` volta com o listener ainda
  entregando snapshots. Agora os dois esperam a mensagem MAIS NOVA na tela
  antes de rolar — 16 de 16 depois. Nenhuma conferência afrouxada.
- Suíte no emulador depois de cada parte: 1) 68 + 2 intermitentes (passaram
  10/10 isolados); 2) 70/70; 3) 70/70; 4) 72/72 (depois do conserto do modal
  e dos testes de histórico); 5) 73/73; 6) 74/74.

### Commits

`5fd3e59` fonte · `ce1e384` paleta e cantos · `50db332` botões e clique ·
`5543890` testes de histórico · `6f391b9` transições · `892aced` chegada ·
`518d0b3` bilhete · `07ae3aa` capturas.

### Como voltar à versão anterior do site

A versão que estava no ar antes (`5396863991613df7`, de 01/09) foi copiada
para o canal de pré-visualização **`antes-etapa-20`** antes do deploy
(expira em 07/11/2026): https://loft-3d6c0f--antes-etapa-20-04z46d63.web.app

- Comando: `firebase hosting:clone loft-3d6c0f:antes-etapa-20 loft-3d6c0f:live`
- Ou no console: Hosting → aba do site → "Histórico de versões" → na versão
  de 01/09/2026 → menu ⋮ → "Reverter" ("Rollback" no console em inglês).

### Pendências e achados

- **Ícones do PWA** (`public/icon-192.png`, `icon-512.png`) continuam no roxo
  ANTIGO (#5b5bd6): são imagens e precisam ser geradas de novo. Favicon,
  `theme-color` e manifest já estão com as cores novas.
- **Cores por autor** (ciano/rosa/verde nos nomes, como no mini Loft do lab)
  não entraram: o app não tem cor por pessoa hoje.
- **Animação de "colar" o bilhete** (7.4 do lab) não entrou — só a
  aparência.
- **`person-theme.ts`** ainda tem os temas antigos (claro/escuro e as cinco
  cores de destaque). Só vale quando alguém escolher tema (Entrega 3), e o
  `--accent-text` novo não é sobrescrito por ele — revisar junto com a
  Entrega 3.
- **BUG ACHADO, anterior à etapa 20 (conferido no commit `946979f`):** no
  mobile, a tela inicial e o PV mostram a coluna "Início" (Amigos, mensagens
  diretas, rodapé) EMPILHADA acima do conteúdo, em vez de escondida na gaveta
  — as regras de gaveta de layout.css miram `.app > .channels`, e a coluna da
  tela inicial é `nav.home-column`. E a gaveta do perfil no PV põe o cartão e
  as fixadas LADO A LADO, espremidos (o bilhete fica com ~70px). Não foi
  corrigido aqui porque mexe no layout das colunas, fora do escopo de uma
  etapa só visual. Capturas `mobile-14-*`, `mobile-15-pv`,
  `mobile-16-pv-gaveta-perfil`.
- **Intermitência nova observada:** na suíte da parte 1, "participante com
  lastSeen velho é ignorado" ficou preso em "Confirme seu e-mail" (o
  cadastro do convidado não percebeu a confirmação em 30 s). Passou 5 de 5
  isolado e não voltou a aparecer nas cinco suítes seguintes.

## Ajustes na etapa 19 — 11 itens achados usando o app com um amigo de verdade

Onze problemas, achados no primeiro uso real do PV/fixadas — dois eram
bugs de navegação anteriores à etapa 19 (rodapé sumindo fora do grupo,
dois ícones "ativos" na barra da esquerda ao mesmo tempo), o resto é
polimento do que a etapa 19 construiu.

**Rodapé (avatar, nome, engrenagem, sair) sumia na tela inicial e no PV** —
vivia hardcoded só dentro de `channel-list.ts`, então só existia quando
`state.view !== 'home'`. Sem ele, ninguém sem grupo nenhum tinha como sair
da conta. Extraído para `components/session-footer/` (compartilhado por
`channel-list.ts` e `home-column.ts` — a mesma coluna 2 que já cobre tela
inicial E PV, sem precisar tocar em `dm-chat.ts`). **Achado de passagem,
registrado por pedido explícito:** o botão de engrenagem ("Configurações")
não tem `onClick` nenhum — é inerte desde que foi criado, não é regressão
desta extração. Vira a tela de configurações só na Entrega 3.

**Dois ícones ativos ao mesmo tempo na barra da esquerda** — `group-bar.ts`
já era mutuamente exclusivo por construção; o bug era `app.ts` só
reconstruir a barra quando `groupsChanged`, condição que não incluía
mudança de `state.view`. Trocar para a tela inicial (ou voltar) deixava o
DOM da barra desatualizado — achado usando o app, não lendo o código.
Conserto de uma linha: `if (groupsChanged || viewChanged)`.

**Mensagens coladas no topo com poucas mensagens** — igual Discord/
WhatsApp, quando sobra espaço o conjunto deveria grudar no fim, perto do
composer. A solução óbvia quebrou a suíte, duas vezes, por dois motivos
diferentes — **achado RODANDO os testes, não lendo o código**:
1. `justify-content: flex-end` em `.messages` quebrava DETERMINISTICAMENTE
   o teste "rolar ao topo carrega o histórico sem arrancar a posição de
   leitura" — a suposição de que isso seria um no-op com a lista já
   rolando (validada por um agente antes de implementar) estava ERRADA: o
   navegador muda como calcula a região de overflow rolável mesmo com
   conteúdo de sobra, e isso derruba a matemática de pixel que
   `swapMessages` (`app.ts`) usa para preservar a posição de leitura ao
   carregar histórico.
2. Trocado por `margin-top: auto` em `.messages > :first-child` (a técnica
   mais idiomática, já que margem automática não pode ficar negativa — em
   teoria resolve para 0 sozinha sem espaço sobrando). Passou isolado, mas
   sob `--repeat-each=3` falhou 2 de 3 vezes, com 21px de deriva contra o
   teto de 12px do teste — intermitente, não ruído.

**Fix final:** a régua condicionada a uma classe, `.messages--short`, que
`swapMessages` liga/desliga a cada troca de DOM medindo o overflow de
VERDADE (`scrollHeight <= clientHeight`) do nó recém-inserido — nunca uma
regra incondicional em `.messages`. Como a classe só pode existir quando a
lista NÃO rola, e "carregar anteriores" só existe quando a lista JÁ rola, os
dois casos nunca se tocam — zero acoplamento, em vez de confiar em CSS
resolver sozinho para 0 no caso frágil. Verificado com `--repeat-each=5` e
depois a suíte inteira, 100% verde.

**Fixada sem cartão visível, e desafixar virou item de menu** — `.pinned-
item` ganhou fundo (`--surface-raised`), borda e cantos arredondados, de
borda a borda no painel (a lista perdeu o padding lateral). O botão
"Desafixar" saiu de dentro do item — agora é "Desafixar" (junto com "Ir
para a mensagem") no MENU DE CONTEXTO da própria fixada
(`pinnedItemItems`, `context-menus.ts`, alvo novo `data-context="pinned-
item"`), não mais um botão competindo por espaço com o conteúdo. Esse menu
NÃO substitui o "Fixar/Desafixar" que já existe no menu da mensagem
original — aquele só alcança mensagem carregada na tela; este cobre
também fixada "apagada"/"fora-da-janela". O clique direto no item para
saltar até a mensagem continua igual (citação clicável de sempre).

**Cartão de perfil sem parecer cartão** — ganhou fundo/borda próprios
(tokens `--surface-raised`/`--border`, não hex fixo — `person-theme.ts` já
sobrescreve esses tokens quando a Entrega 3 gravar um tema escuro para a
pessoa, então o cartão herda isso de graça). Avatar do cartão passou de
`lg` (40px) para uma categoria NOVA, `xl` (64px) — reutilizável em
`lib/dom.ts`/`avatarEl`, não um ajuste isolado.

**Avatar do cabeçalho do PV parecia "parte da conversa"** — não havia
regra nenhuma o pintando de destaque; a sensação vinha de `--surface-
sunken` (fundo do avatar) e `--surface-bubble` (balão da outra pessoa)
serem tons quase idênticos no claro. Ganhou `background-color: var(--
surface-side)` (o mesmo tom da lateral) via uma classe extra, mesma
técnica que `.group-bar__avatar` já usa.

**Coluna 4 reservada, vazia, na aba Amigos sem PV aberto.** Antes ela
simplesmente não existia ali, e a tela parecia cortada — inclusive
explicava por que a borda abaixo das abas (Amigos/Pendentes/Adicionar/
Bloqueados) não ia até o fim, do mesmo jeito que a borda do cabeçalho não
ia antes do conserto da etapa 19. Agora `showAside` (`app.ts`) mostra a
coluna 4 em QUALQUER estado da tela inicial, não só com PV aberto; a aba
Amigos sem PV ganha um `<aside class="members">` genuinamente vazio — sem
cabeçalho, sem texto de estado vazio, só o espaço. **ISTO É PROPOSITAL —
espaço reservado para uma feature futura, não bug e não sobra: não
remover achando que é lixo.**

**"online — N" mentia sobre presença.** Presença de verdade nunca foi
implementada (heartbeat/onDisconnect, cancelado etapas atrás) — todo
membro sempre chega com `status:'online'`, então a seção "offline" nunca
tinha nada de verdade para mostrar, e "online" para todo mundo é
informação ERRADA, não só incompleta (um amigo apareceu online estando na
escola). `member-list.ts` colapsou para uma lista só, rótulo "membros — N",
sem a bolinha de status. **`Member.status`/`PresenceStatus` continuam
existindo em `types/models.ts`** — só a exibição mudou; o rótulo volta a
diferenciar online/offline no dia em que presença de verdade existir.

Sem mudança de regra, índice ou modelagem nesta rodada — só onde/como as
coisas já construídas aparecem. `tests/pins.spec.ts` foi atualizado (dois
locators que apontavam para o botão de desafixar dentro do item, agora
menu de contexto).

## Etapa 19 — painel do perfil no PV e mensagens fixadas

Traz a coluna 4 de volta na tela inicial (só existia no grupo até aqui),
dividida em cartão de perfil + fixadas no PV, e cria mensagens fixadas para
grupo e PV ao mesmo tempo, com um componente de lista reaproveitado pelos
dois.

### Antes de tudo: o índice de `dmMessages` que faltava

A etapa 18 apostou errado: "um campo de igualdade mais `orderBy` não
precisa de índice composto" não é universal, e `dmMessages` (threadId +
sentAt + `limitToLast`) precisava sim. Ficou sem cobertura porque a etapa
18 fechou sem `.check-indexes.json` — sem a conta fixa, não dava para
rodar `check:indexes` de verdade, só o deploy de regras/índices. O usuário
achou direto no console do Firebase: só `dmThreads` e `messages` existiam;
`dmMessages` nunca foi publicado, e o histórico do PV falhava com "o
índice ainda está sendo construído" — mensagem enganosa, porque não tinha
índice construindo, tinha índice FALTANDO. Corrigido nesta etapa, publicado
sozinho e primeiro, antes de qualquer coisa das fixadas: `threadId`
ASCENDING + `sentAt` DESCENDING (mesma direção do índice de `messages`,
mesmo motivo — `limitToLast` inverte a ordem enviada ao servidor). Detalhe
completo da correção do próprio `firestore.indexes.json`.

### Modelagem — decisão

Uma coleção só, `pinnedMessages`, com o escopo por PRESENÇA de campo
(`groupId`+`channelId` OU `threadId`, nunca os dois — mesmo padrão de
`messages` vs. `dmMessages`) em vez de duas coleções separadas: o
DOCUMENTO em si é pequeno e igual nos dois casos (autor, trecho, data,
id da original), só o vínculo muda, e a regra já sabia decidir "qual
metade vale" olhando o campo presente, do jeito que `dmMessages` já fazia
para não precisar de `get()` num documento que talvez não exista (a lição
da etapa 16, verificada de novo aqui — ver a seção de regras).

ids são AUTOGERADOS, não determinísticos: um id tipo
`${escopo}_${messageId}` esbarraria no `threadId` já ter `_` no meio
(`${uidA}_${uidB}`), tornando ambíguo separar escopo de mensagem de volta.
Sem id determinístico, "já está fixada?" é responsabilidade do CLIENTE
(olhando a lista já carregada), não da regra — e isso tem uma consequência
real, achada por raciocínio antes de implementar (não por teste): no PV os
DOIS participantes podem fixar, e os dois podem clicar em fixar a MESMA
mensagem ao mesmo tempo, cada um vendo a lista local ainda dizer "não
fixada". Sem transação, isso produz DUAS fixadas para a mesma mensagem.
Resolvido sem custo nenhum: a LISTA DE EXIBIÇÃO agrupa por `messageId` e
mostra uma só (a mais recente); desafixar apaga TODOS os ids do grupo de
uma vez. Rule fica simples, exibição absorve a corrida.

**Nenhum índice composto — as duas consultas são só igualdade, sem
`orderBy`.** Grupo: `groupId`+`channelId` (dois iguais, mesma forma que
`signals` já usa em produção sem índice — `voice-signaling.ts`). PV: só
`threadId` (um igual, sem risco nenhum). A lista ordena por `pinnedAt` no
CLIENTE — de propósito, para não repetir a aposta que acabou de sair
errada com `dmMessages`. As duas ganharam sonda em `indexes.spec.ts` mesmo
assim: medir, não deduzir, era exatamente a lição do parágrafo anterior.

**Teto de 50 — cobrado só no CLIENTE, LIMITAÇÃO CONHECIDA E ACEITA, não
descoberta depois.** Mesmo padrão já aceito para o teto de 4 da sala de
voz ("regra não conta documentos" — Firestore não tem `COUNT` em regra sem
um contador denormalizado à parte). Quem contornar a UI (REST cru) fixa
quantas quiser — não é falha de segurança (a regra ainda restringe QUEM
fixa: dono no grupo, os dois no PV), é possibilidade de bagunça visual.
Registrado aqui por pedido explícito, para não ser achado como surpresa.

**Excerpt congelado no momento de fixar, não sincronizado com edição
posterior — decisão consciente, não bug.** Se a mensagem original for
editada depois de fixada, a fixada continua mostrando o texto de QUANDO
foi fixada. Manter sincronizado custaria uma leitura extra por item toda
vez que a lista de fixadas for exibida, só para cobrir uma edição que pode
nunca acontecer — o mesmo cálculo de custo que já vale para `ReplyTo`.

### Regras — o cuidado com "documento que ainda não existe" (etapa 16)

Verificado ativamente, não só lembrado: a pegadinha da etapa 16 era
`resource.data` derrubar a regra inteira quando o documento ainda não
existe (a friendship antes do primeiro pedido). Para `pinnedMessages` ela
não se aplica, e por design, não por sorte — não há NENHUM ponto onde a
regra ou o cliente façam `getDoc`/`get()` numa fixada especificamente para
checar "ela já existe?": criar nunca depende disso (o cliente evita
duplicar olhando a lista já carregada, e mesmo falhando nessa checagem uma
fixada repetida só duplica visualmente, tratado na exibição — ver acima);
apagar sempre mira um id que já está na lista carregada, nunca um chute.
`isOwner`/`isMember` fazem `get()` no GRUPO, não na fixada, e o grupo de
um canal real sempre existe. Sem checagem de bloqueio no PV: fixar não é
mandar mensagem, é arrumar uma conversa que já existe — bloqueio trava
escrita NOVA, não gestão do que já foi dito.

### O mesmo componente serve o grupo e o PV

`components/pinned/pinned-list.ts` — puramente apresentacional, sem saber
se está num modal ou num painel fixo. Dois pontos de montagem:

- **Grupo**: ícone no cabeçalho (com contador ao vivo, `ChatParts.
  setPinnedCount` — a casca do chat nasce uma vez por canal, mas quantas
  fixadas existem muda sem trocar de canal nenhuma) abre um painel
  FLUTUANTE. Reaproveita `modal.ts`, não `context-menu.ts`: o menu de
  contexto só sabe `{label, onSelect}`, sem slot de conteúdo rico —
  encaixar uma lista rolável ali seria reescrever a peça. Dois ajustes
  GERAIS em `modal.ts`, que beneficiam todo modal do app, não um jeitinho
  para este: (1) clique fora fecha, que o `<dialog>` nativo não faz
  sozinho; (2) teto de altura (`max-height`) + `overflow` correto na
  cadeia flex — achado RODANDO o teste de "muitas fixadas rolam", não
  lendo código (ver a seção de bugs abaixo).
- **PV**: sempre visível, nos dois terços de baixo da coluna 4
  (`components/chat/dm-side-panel.ts`), sem clique nenhum.

`reachabilityOf` (carregada/apagada/fora-da-janela) reaproveita
`citationState`, que só ganhou `export` — nenhuma linha de lógica nova:
`PinnedMessage` tem os mesmos campos que `ReplyTo` (`messageId`,
`authorId`, `authorName`, `excerpt`, `sentAt`) com os mesmos nomes e
tipos, e a tipagem estrutural do TypeScript aceita passar uma fixada onde
a função espera uma citação, sem cast.

### O cartão de perfil e o tema da pessoa (preparo para a Entrega 3)

`lib/person-theme.ts`, função isolada e pura: lê `theme`/`accentId`/
`fontId` (opcionais, ninguém grava ainda) do perfil PÚBLICO da pessoa e
devolve variáveis CSS para aplicar via `style.setProperty` no elemento
raiz do cartão — que é a CONTENÇÃO inteira: variável CSS cascateia só para
dentro da própria subárvore, então nada vaza para o resto da tela sem
nenhuma técnica extra. Ausente = `cssVars` vazio = o cartão HERDA o tema
de quem está vendo (não um terceiro tema fixo). `accentId`/`fontId`/
`theme` vêm de `Record`s FECHADOS dentro do arquivo — um valor desconhecido
cai fora do mapa e o `??` volta para "sem escolha"; `fontFamily` nunca é
o texto cru do banco, sempre um dos 4 valores fixos que o arquivo já
define. É o que fecha o caminho de injeção.

`'pixelada'` está na lista de `FontId` (a pessoa que pediu esta etapa deu
esse exato exemplo), mas mapeia para uma pilha monoespaçada comum do
sistema, SEM `@font-face` nenhum — nenhuma fonte bitmap de verdade sendo
baixada. A pendência já registrada mais abaixo ("Personalização de fonte
para a Entrega 3") sobre pixelada ser cansativa em texto corrido continua
em aberto: esta etapa só reserva o NOME na lista fechada, quem escolher
uma fonte pixelada de verdade ainda precisa decidir aquilo.

Botões "Bloquear"/"Desfazer amizade" do cartão são os MESMOS de
`friends-screen.ts` (`action()`, que só ganhou `export`) — zero
reimplementação.

### A borda do cabeçalho

`.chat__header`/`.friends__header` só cobriam a largura da coluna 3
(`minmax(0,1fr)`); a coluna 4 é uma faixa de `240px` SEMPRE RESERVADA no
grid (`grid-template-columns`, `layout.css`), escondida ou não —
`[hidden]` não colapsa a faixa. Com o painel de membros visível, a borda
ESQUERDA dele fechava o desenho bem onde a de baixo do cabeçalho parava, e
por isso "parecia" ir até o fim; sem painel nenhum (tela de amigos sem PV
aberto), essa borda vertical também sumia e sobrava a faixa sem linha por
cima nenhuma. Conserto único e genérico, não um jeitinho só para o PV:
`.app.no-member-column` estica o cabeçalho por cima da faixa reservada
sempre que a coluna 4 está de fato vazia — cobre os dois casos (tela de
amigos sem PV, e qualquer estado futuro do PV sem painel).

### Bug achado RODANDO o teste, não lendo o código

**O painel flutuante crescia além da tela em vez de rolar por dentro.**
`modal.ts`/`modal.css` nunca precisaram de teto de altura: toda tela
existente (convite, renomear, apagar, criar canal) é curta. Com 50
fixadas, o `<dialog>` inteiro crescia para acomodar tudo — o teste "com
muitas fixadas a lista rola" falhou com `scrollHeight === clientHeight`
na `.pinned-list`, porque quem estava "rolando" (ou tentando) era o modal
inteiro, sem limite nenhum, não a lista por dentro dele. Conserto no
PRIMITIVO, não um caso especial: `.modal` ganhou `max-height` + virou
coluna flex; `.modal__form` ganhou `min-height:0`+`overflow:hidden`; e o
corpo específico das fixadas (`.pinned-panel-body`) ganhou `flex:1 1
auto; min-height:0` para ser ele a esticar até o teto e deixar
`.pinned-list` (já `column-scroll`) rolar de verdade. Nenhum modal
existente tinha conteúdo alto o bastante para este bug aparecer antes.

### Testes (`tests/pins.spec.ts`, novo arquivo)

Seis testes, emulador: fixar no grupo aparece em tempo real na outra aba +
membro comum não fixa por REST cru (403); no PV os dois participantes
fixam em tempo real e qualquer um dos dois desafixa, removendo dos dois
lados; apagar a mensagem original não quebra a lista (fica "mensagem
apagada", sem lançar); clicar numa fixada fecha o painel, rola até a
mensagem e destaca; teto de 50 barrado NA TELA (toast) + com 50 fixadas a
lista rola e nenhum item encolhe (alturas medidas, todas acima de metade
da mediana); cartão de perfil sem tema definido herda `--accent` da
própria página (comparado via `getComputedStyle`, não suposto).

`tests/indexes.spec.ts` ganhou duas sondas novas (fixadas do canal: dois
iguais sem orderBy; fixadas do PV: um igual sem orderBy) e o
`.check-indexes.json` já resolve `groupId`/`channelId` que a sonda de
`dmMessages` também precisava. `tests/helpers.ts`'s `cleanupFirestore`
ganhou `pinnedMessages` na lista de coleções varridas por `groupId`
(mesmo padrão de `messages`/`voiceParticipants`/`channels`/`invites`) —
sem isso, cada rodada de `check:indexes` deixaria fixadas de sonda
acumulando no projeto real.

### Fora de escopo desta etapa

- **Anexos em mensagem fixada** — o app não tem anexo ainda (depende do
  Storage). O modelo (`PinnedKind`) já nasce pronto para as seis
  categorias, e `pinned-list.ts` já sabe renderizar cada uma — só `'text'`
  é alcançável hoje.
- **Escrita de `bio`/`theme`/`accentId`/`fontId`** — ninguém grava esses
  campos ainda; esta etapa só lê, com padrão seguro. É a Entrega 3.

### Pendências novas

- **`upsertUserProfile` (`lib/firestore.ts`) sobrescreve o documento
  INTEIRO com `setDoc` sem `merge:true`.** Hoje inofensivo — nenhum campo
  novo (`bio`/`theme`/`accentId`/`fontId`) é escrito por ninguém, então não
  há nada para perder. Mas assim que a Entrega 3 nascer e alguém gravar um
  tema, o PRÓXIMO login (que chama `upsertUserProfile` de novo) apagaria
  esse tema junto, porque o objeto montado ali não inclui os campos novos.
  Registrado agora para a Entrega 3 não tropeçar nisso: `upsertUserProfile`
  precisa virar `merge:true` (ou ler e preservar os campos extra) antes ou
  junto da escrita desses campos.
- **`deleteGroupCascade` também não apaga `pinnedMessages`** — junta-se a
  `voiceParticipants`/`signals`, já registrados como órfãos por grupo
  apagado (etapa 17). Mesma causa, mesmo efeito: `pinnedMessages` do canal
  fica no banco, ilegível e inapagável por qualquer pessoa assim que o
  grupo some. Cobrir isso é parte do mesmo conserto já pendente, não uma
  entrada nova e separada.
- **Ficar sem commitar entre etapas é risco, não só desorganização.** As
  etapas 17, 18 e 19 inteiras ficaram no disco, sem commit, por dois dias —
  nenhum histórico para voltar atrás, e nenhuma cópia fora desta máquina
  (o primeiro commit da etapa 17 cobre só até a etapa 16). Reconstruir o
  histórico depois do fato, separando o que era de cada etapa dentro de
  arquivos que as três mexeram junto, deu trabalho que um commit ao FIM DE
  CADA ETAPA teria evitado por completo. Prática daqui para frente: commitar
  ao fechar cada etapa, não deixar acumular.

## Etapa 18 — conversas privadas (Entrega 2 de 3 da etapa 14)

A Entrega 1 (etapa 14) deixou o espaço reservado, vazio de propósito: tela
inicial, `@` único, verificação de e-mail, amizade e bloqueio, e uma seção
"Mensagens diretas" na coluna 2 dizendo "suas conversas privadas aparecem
aqui". Esta entrega implementa o PV de verdade.

### Modelagem — decisão

Duas coleções PRÓPRIAS, `dmThreads/{pairId}` e `dmMessages/{id}` — não
reaproveita `messages`. A regra de `messages` só enxerga `groupId`
(`isMember(resource.data.groupId)`); `channelId` está no documento mas
NUNCA entra numa condição de regra, é filtro de aplicação, invisível para a
segurança. Encaixar PV nessa coleção exigiria fingir um grupo de 2 pessoas
por par de amigos — dono, membership, `Group`/`Channel` inteiros só para
existir —, e o pedido é explícito: "não existe dono, não existe canal" no
PV. `pairId` (id do par, ordenado, de `friends.ts`) foi reaproveitado direto
para o id da thread — mesma conversa, venha de que lado vier, mesmo
mecanismo que a amizade já usa.

Lista de conversas sem pagar uma leitura por mensagem: `dmThreads` carrega
`lastMessage`/`lastMessageAt` DENORMALIZADOS, escritos no mesmo
`writeBatch` de cada mensagem nova. A coluna 2 assina só essa coleção — uma
leitura por CONVERSA, nunca por mensagem — com
`where('members','array-contains',uid) + orderBy('lastMessageAt','desc')`,
e o Firestore reordena sozinho quando qualquer conversa recebe mensagem
nova.

Bloqueio é a ÚNICA coisa cobrada na regra para criar conversa/mensagem —
amizade continua sendo só o caminho que a TELA oferece (decisão confirmada
antes de implementar: é o mesmo padrão do resto do app).

### Dois bugs achados RODANDO o teste, não lendo o código

1. **`members: [me, other]` não sobrevivia à segunda pessoa respondendo.**
   Cada envio reescreve `dmThreads.lastMessage`/`lastMessageAt` num
   `merge:true`, e a regra de `update` só aceita mexer nesses dois campos
   (`hasOnly`). O array `members` ia junto em toda escrita, na crença de que
   reenviar o MESMO valor não conta como campo tocado — verdade para
   conteúdo, falsa para ORDEM: `[A,B]` (quando A manda) e `[B,A]` (quando B
   manda) são o MESMO PAR, mas arrays DIFERENTES para o Firestore, que
   compara por posição. Resultado: assim que a segunda pessoa respondia,
   `members` entrava em `diff().affectedKeys()`, `hasOnly` recusava, e a
   mensagem morria com `permission-denied` — **toda conversa privada
   quebrava na segunda mensagem, sempre, em produção real, não só em
   teste.** Achado pelo teste de REST cru (mandar de A, depois de B, editar
   e reler) — os testes de fluxo simples nunca mandavam mensagem dos dois
   lados na mesma conversa e passavam verdes por cima do bug. Conserto:
   `members` sai sempre na mesma ordem (`me < other`), igual ao `pairId` já
   ordena o id — o valor fica idêntico venha de quem vier, e `diff()` para
   de ver `members` como alterado.
2. **`watchMessages` (store.ts) matava `subscribeFriendships`/
   `subscribeBlocks` a cada troca de canal, e nunca religava.** Achado lendo
   o código ao redor de onde o PV precisava se conectar (o `blockedUids`
   ao vivo, para o aviso "você bloqueou" no composer sem round-trip) — duas
   linhas soltas, sem comentário nenhum explicando por quê, chamando as
   funções de encerrar as DUAS assinaturas dentro da função que troca de
   canal de TEXTO. Consequência real: `friendships`/`blockedUids` paravam
   de atualizar em tempo real assim que a pessoa abria qualquer canal — a
   primeira coisa que quase todo mundo faz ao entrar. Pedido de amizade
   novo, aceito, ou bloqueio feito por você em outra aba só apareceriam
   depois de um F5. E como as duas funções nunca eram chamadas de novo em
   lugar nenhum (nem em `dispose()`), a falta delas ali também virava um
   vazamento — as assinaturas nunca fechavam, nem ao sair da conta.
   Conserto: as duas linhas saíram de `watchMessages` (não tinham nada a
   ver com trocar de canal) e entraram em `dispose()` (onde já deveriam
   estar).

### Componentes reaproveitados sem mudar comportamento

`message-list.ts` e `composer.ts` não sabiam de grupo nem de canal desde
sempre — só ganharam duas props OPCIONAIS (`startLabel`, `dataContext` no
primeiro; `hashPrefix` no segundo), aditivas, sem tocar o caminho de grupo.
A separação REAL entre "grupo" e "PV" está em `context-menus.ts`
(`dmMessageItems`, sem a metade `isOwner` — PV não tem dono) e numa casca
nova, `dm-chat.ts`, irmã de `chat.ts` — não uma condição a mais dentro
dela. `swapMessages`/`jumpToMessage` (app.ts) são puramente por seletor
CSS, reaproveitados sem mudar uma linha.

### Fora de escopo desta entrega (registrado, não esquecido)

- **Chamada de voz no PV** — só chamada de GRUPO existe; o PV não liga nem
  recebe chamada. A faixa de uma chamada de GRUPO em andamento continua
  visível enquanto um PV está aberto (mesmo princípio da etapa 16/17
  aplicado ao PV), mas iniciar uma chamada DENTRO do PV não foi feito.
- **Anexos no PV** — mesma pendência que já existe no chat de grupo desde a
  etapa 5, agora também no PV.
- **Notificações do PV** — mensagem privada nova não notifica; mesma
  pendência de notificações push já registrada para o resto do app.

### Índices e regras

`dmThreads` (members array-contains + lastMessageAt) precisa de índice
composto — certeza, sem precisar medir: array-contains junto de `orderBy`
em outro campo sempre exige. Publicado em `firestore.indexes.json`.
`dmMessages` (threadId + sentAt) foi implementado SEM índice composto
declarado — só um campo de igualdade mais `orderBy`, o padrão que o resto
do app já não precisa de índice — e `tests/indexes.spec.ts` ganhou as duas
sondas para PROVAR isso, não supor.

**Não consegui rodar `npm run check:indexes` sozinho**: `.check-indexes.json`
não existe nesta máquina (confirmado na etapa 17 — nenhuma conta no
projeto real tem `displayName == "Índices"`). Regras e índices FORAM
publicados no projeto real (`firebase deploy --only
firestore:rules,firestore:indexes`); falta a conferência de
`check:indexes` assim que a conta fixa existir.

**CORREÇÃO (achada na etapa 19) — a previsão acima estava ERRADA.**
`dmMessages` (threadId + sentAt) PRECISA de índice composto sim. Sem
`.check-indexes.json`, a etapa 18 fechou sem rodar `check:indexes` de
verdade — só o deploy de regras/índices, sem a sonda que teria pego isso
antes de ir para produção. Ficou sem cobertura até o usuário achar direto
no console do Firebase (Firestore → Índices): só `dmThreads` e `messages`
existiam, `dmMessages` nunca foi publicado — e o histórico do PV falhava
com "o índice das mensagens ainda está sendo construído", uma mensagem
enganosa (não tinha índice construindo, tinha índice FALTANDO). A regra
geral usada até aqui — "um campo de igualdade mais `orderBy` não exige
índice composto" — não é universal; aqui ela falhou, e a diferença de
`voiceParticipants`/`channels` (que de fato não precisam) não ficou clara
antes de medir. Índice publicado na etapa 19
(`threadId` ASCENDING + `sentAt` DESCENDING — mesma direção do índice de
`messages`, pela mesma razão: `limitToLast` inverte a ordem enviada ao
servidor). Lição aplicada daqui para frente: nenhuma consulta nova entra em
produção só por dedução — ou passa pela sonda de `check:indexes`, ou (como
`pinnedMessages` na etapa 19) é desenhada para não precisar de `orderBy`
nenhum, e mesmo assim ganha sonda.

### Testes (`tests/dm.spec.ts`, novo arquivo)

Quatro testes, emulador: tempo real + conversa não nasce só de abrir; lista
com o trecho certo dos dois lados + reordenação automática; bloqueio
impede escrever e preserva o histórico; REST cru (terceiro não lê, ninguém
escreve como outro autor, bloqueado não cria mensagem). O de REST cru foi o
que expôs o bug do `members` — os três primeiros, sozinhos, teriam passado
verdes com o bug ainda lá.

## Etapa 17 — controle de versão, e um segredo saindo do código antes do primeiro commit

Dezesseis etapas de trabalho viviam num disco só, sem git. Risco alto: nada
disto sobrevive a um disco morto. `git init` dentro de `~/Projetos/Loft` (o
repositório era outro, solto em `/home/lelokz` sem nenhum commit — não é
deste projeto, removido à parte). Branch `main`.

**Antes do primeiro commit, uma varredura por segredo.** Achado real:
`src/lib/ice-servers.ts` tinha usuário e credencial do TURN (ExpressTURN)
em texto puro. Não são segredo como senha — o navegador precisa delas em
claro para falar com o servidor, então quem abre o painel de rede do
navegador já vê as duas —, mas commitadas ficariam no HISTÓRICO do git para
sempre, sobrevivendo até a uma regeneração de credencial. Decisão: saem
para `.env` (Vite, `VITE_TURN_USERNAME`/`VITE_TURN_CREDENTIAL`), `.env` no
`.gitignore`, `.env.example` versionado com os nomes e vazio, explicando de
onde vêm. Sem as duas variáveis o app não quebra: `ICE_SERVERS` cai para só
STUN, com aviso no console E no painel de diagnóstico (`TURN_CONFIGURED`,
lido também por `voice-diagnostics.ts` — o mesmo aviso que já existe para
relay em uso ganhou um par para "relay ausente").

(Segunda credencial encontrada na mesma varredura, `scripts/limpar-projeto-
real.mjs` — o `client_id`/`client_secret` do OAuth: não é segredo de
verdade. É o client id/secret PÚBLICO do próprio `firebase-tools`,
publicado no repositório open source da ferramenta — toda instalação usa o
mesmo par. Confirmado, nada a fazer.)

**O conserto quebrou a suíte inteira antes de eu rodar ela — pego a tempo.**
`tests/turn.spec.ts` importa `ICE_SERVERS` de `ice-servers.ts` PELO NODE
(para montar a lista antes de entrar no navegador via `page.evaluate`), fora
de qualquer bundle do Vite. `import.meta.env` só existe dentro do bundle;
fora dele é `undefined`, e o módulo lê `import.meta.env['VITE_TURN_USERNAME']`
no escopo de nível superior — que roda ao IMPORTAR o arquivo, não só ao
usar o valor. Resultado: `playwright test` inteiro morria ao tentar
CATALOGAR os testes (`Cannot read properties of undefined`), mesmo com
`turn.spec.ts` marcado `@externo` e fora da execução padrão — porque
catalogar exige importar o arquivo, e importar já era o bastante para
quebrar.

Reproduzido (suíte cheia: 0 passou, erro de import) antes de qualquer
suposição sobre a causa. Conserto: a lista virou pura, em arquivo próprio
sem leitura de ambiente nenhuma (`src/lib/ice-servers-core.ts`,
`buildIceServers(usuario, credencial)`); `ice-servers.ts` fica só com a
parte que lê `import.meta.env` e chama a função pura. `turn.spec.ts` importa
`ice-servers-core` direto — nunca toca no módulo que lê `import.meta.env` —,
e pega a credencial de `process.env`, carregado de `.env` por
`playwright.config.ts` (`process.loadEnvFile()`, silencioso se o arquivo não
existir). Suíte cheia depois do conserto: **60 passou, 0 falhou, 8,7min** —
duas vezes, a segunda depois do build de produção confirmado embutindo os
valores certos (`grep` no bundle final).

Primeiro commit: `977af7e`, 97 arquivos.

**Subido para o GitHub em 08/10/2026.** Remoto
`git@github.com:Lelokz/Loftchat.com.br.git`, repositório **privado**; último
commit enviado na primeira subida: `8ff4a9c`. Antes do push, nova varredura de
segredos no código atual E em todo o histórico (valores reais do TURN,
`private_key`, conta de serviço, `client_email`, tokens, senhas): **nada
encontrado**. O `.gitignore` foi reforçado no mesmo dia (commit `bb71156`):
variantes do `.env`, dados exportados do emulador, JSON de conta de serviço e
`.claude/settings.local.json`.

## Etapa 16 — migração para Linux Mint, e o que a suíte revelou

O projeto foi restaurado do Windows para um Linux Mint 22.3 (Cinnamon, X11)
limpo: sem `node_modules`, sem nada instalado globalmente, sem credenciais.
Esta etapa põe o ambiente de pé e usa a suíte inteira para tirar uma linha de
base — e ela acabou puxando dois defeitos que não têm nada a ver com o SO.

### O ambiente

- `.tools/jre` (JRE portátil do Windows) removido. Java agora é
  `openjdk-21-jre-headless` via apt, um `java` de sistema normal.
  `scripts/emulator.mjs` perdeu toda a lógica do JRE portátil e da busca de
  chave `PATH`/`Path` — no Linux a variável é sempre `PATH`, e o script agora
  só confere se `java` resolve.
- Node vem do **nvm** (`v24.20.0`), não do apt: o candidato do apt para
  `nodejs` no Ubuntu Noble é `18.19.1`, e o `vite@^8` exige
  `^20.19.0 || >=22.12.0`.
- `node_modules` estava contaminado por binários nativos do Windows
  (`lightningcss-win32-x64-msvc`, `@rolldown/binding-win32-x64-msvc`,
  `@typescript/typescript-win32-x64`) — apagado e reinstalado do zero.
  `package-lock.json` foi mantido; o `npm install` sozinho já resolveu os
  pacotes certos por plataforma.
- **`sudo npx <comando>` falha neste ambiente** porque o `root` não enxerga o
  Node do nvm (que vive em `~/.nvm`, fora do PATH do root). O jeito que
  funcionou foi `sudo env PATH=$PATH npx playwright install-deps` — herda o
  PATH de quem chamou o sudo, incluindo o Node do nvm.
- **`firebase-tools` foi instalado com `npm install -g` usando o npm do
  nvm.** Isso prende o binário `firebase` àquela versão de Node: se a versão
  ativa do nvm mudar depois (`nvm install`/`nvm use` outra versão),
  `firebase` some do PATH até rodar `npm install -g firebase-tools` de novo
  na versão nova. Não é o comando quebrando — é a instalação global sendo
  por-versão.
- **`firebase login` precisa ser feito pela pessoa, no terminal dela.** Este
  ambiente não tem terminal interativo para senha de sudo nem para o fluxo de
  navegador do login; o link manual que o comando imprime como alternativa
  expira rápido (chegou a dar "Unable to verify client" numa tentativa).
  Quem for reproduzir isto numa máquina nova: rode `firebase login` você
  mesmo, direto no seu terminal.
- Sessão gráfica é X11 (Cinnamon) — os testes de `getDisplayMedia` rodam sem
  o problema de Wayland que se cogitava.
- Chromium do Playwright usa o build de fallback (`ubuntu24.04-x64`), porque
  o Playwright ainda não lista o Linux Mint como suportado oficialmente. Sem
  efeito prático observado.

### A linha de base: 31 passaram, 29 falharam, 33,2 min

`npm test` completo, primeira vez nesta máquina. As falhas quase todas têm
causa raiz identificada, e **nenhuma delas parece ser do ambiente Linux** —
`mobile.spec.ts` e `screenshots.spec.ts` passaram 100%, e todo teste de UMA
aba só passou. O problema está concentrado em fluxos de DUAS contas.

**23 falhas — bug do HELPER de teste `groupWithMember`
(tests/loft.spec.ts:702), não do produto.** Desde a etapa 14 as regras exigem
`email_verified` para entrar num grupo por convite. `signUpThroughUi`
(tests/helpers.ts) cuida disso chamando `markEmailVerified` + reautenticando.
Mas `groupWithMember` cadastra o CONVIDADO por um formulário inline própio
(comentário no código explica por quê: quem vem de convite cai na tela do
convite, não no app, então não dá para usar `signUpThroughUi`) — e esse
caminho **nunca chama `markEmailVerified`**. O convidado fica preso para
sempre na tela "Confirme seu e-mail", o botão "Entrar no grupo" nunca chega a
existir no DOM, e o teste estoura os 30s esperando por ele. Isso afeta todo
teste que usa `groupWithMember` — convite, membros, editar/apagar mensagem,
sala de voz, compartilhar tela. **Este bug é anterior à migração**: existe
desde que a etapa 14 acrescentou a exigência de e-mail confirmado, e teria
falhado do mesmo jeito no Windows. Conserto: `groupWithMember` precisa
chamar `markEmailVerified(guest)` (+ o reload de token que ela já faz)
depois do cadastro inline do convidado, do mesmo jeito que `signUpThroughUi`
faz para quem cadastra pela tela normal.

**4 falhas — bug de PRODUTO, confirmado: "Tela inicial" não existe com zero
grupos.** `signUpThroughUi` só declara sucesso ao ver "Criar meu primeiro
grupo" — exatamente o estado de zero grupos. Mas o botão "Tela inicial" só
existe dentro do `group-bar` (src/components/group-bar/group-bar.ts), e
`src/app.ts:940` substitui a tela INTEIRA por `renderNoGroups` quando
`groups.length === 0`, sem montar o `group-bar`. Resultado real: quem acabou
de criar conta não tem como chegar na tela de amigos — o único jeito de
conseguir alguma coisa sem grupo nenhum. Direção do conserto (decidida,
ainda não implementada): o estado vazio deixa de substituir a tela inteira e
vira o CONTEÚDO da coluna central, com `group-bar`, coluna e rodapé montados
normalmente — o mesmo padrão que a tela de amigos já usa dentro da visão
"home". Arquivos: `src/app.ts` (tirar o `return` antecipado de
`render()` em ~linha 940), `src/components/empty-state/empty-state.ts` (o
conteúdo de criar/entrar por código muda de tela cheia para conteúdo de
coluna).

**1 falha — mistério ainda aberto: `.callbar` some ao trocar para a tela
inicial** (`friends.spec.ts:217`, "a tela inicial não derruba a chamada de
voz"). Pela leitura do código, `buildHomeColumn` (src/app.ts:552) deveria
montar a faixa de chamada sempre que `state.voice !== null`, e `enterVoice`
(src/state/store.ts:772) marca `state.voice` de forma síncrona bem antes de
qualquer negociação WebRTC — não parece ser um problema de timing. O
snapshot de acessibilidade capturado no momento da falha
(test-results/.../error-context.md) mostra a coluna "Tela inicial" montada
normalmente (heading "Início", botão "Amigos"...) mas **sem nenhum rastro de
chamada de voz** — nem faixa, nem botão de desconectar, nada. Ou seja:
`state.voice` parece ter voltado a `null`, e não simplesmente demorado.
Hipótese não confirmada: algo no listener de presença (`onDisplaced` em
`enterVoice`) disparando por engano, possivelmente ligado ao fato de os
dados do emulador se ACUMULAREM ao longo da suíte inteira (a limpeza é
dispensada no emulador — ver etapa 12). Precisa de depuração ao vivo
(console/trace), não só leitura de código.

**1 falha — ainda não investigada:** `chegar ao começo do canal mostra o
aviso e para de buscar` (tests/loft.spec.ts:2623) esperava 60 `.message` e
achou 50. Pode ser tempo de carregamento das páginas de histórico (etapa 13)
sendo insuficiente nesta máquina, ou outra coisa — não olhei ainda.

### Depois da linha de base: oito consertos, em cadeia

Cada conserto revelou o próximo — a suíte nunca tinha chegado fundo o
bastante para expor nenhum deles.

1. **`groupWithMember` e o teste de convite avulso unificados** num só
   helper, `signUpFromInviteUi` (tests/helpers.ts): os dois faziam o cadastro
   do convidado na mão e nenhum chamava `markEmailVerified`, então o
   convidado ficava preso em "Confirme seu e-mail" e "Entrar no grupo" nunca
   existia no DOM. Bug de teste, anterior à migração — já estava quebrado
   desde a etapa 14, no Windows também.
2. **"Tela inicial" virou conteúdo da coluna central** (`src/app.ts`,
   `src/components/empty-state/empty-state.ts`): o `return` antecipado que
   substituía as quatro colunas por uma tela cheia quando `groups.length ===
   0` saiu; agora `group-bar`, coluna e rodapé continuam montados, e o
   convite para criar/entrar vira o conteúdo da coluna central. Bug de
   PRODUTO: sem ele, quem acabava de criar conta não tinha como chegar na
   tela de amigos.
3. **`friendships`: `get` e `list` precisam de regras diferentes**
   (`firestore.rules`). A regra original (`resource.data.members`) recusava
   `get` de um par sem documento — todo PRIMEIRO pedido de amizade —, porque
   `resource` é `null` e o Firestore trata erro de avaliação como recusa.
   Trocar para `pairId.split('_').hasAny([uid()])` resolveu o `get`, mas
   quebrou o `list` (o `subscribeFriendships` do app): `pairId` só existe de
   verdade quando o Firestore resolve UM documento, e numa consulta ele chega
   `null` — medido no emulador como "Null value error. for 'list'". A regra
   final separa os dois: `get` pelo `pairId`, `list` como estava
   (`resource.data.members`, seguro porque uma consulta nunca "casa" com
   documento inexistente). Bug de PRODUTO: ninguém jamais mandava o primeiro
   pedido de amizade com sucesso.
4. **`claimUsername` teve companhia**: `sendFriendRequest`
   (`src/lib/friends.ts`) também traduzia TODO `permission-denied` para uma
   mensagem de negócio única ("pessoa indisponível" = bloqueio), escondendo
   qualquer outra causa. Agora só o `create` (onde o bloqueio de fato é
   checado) carrega essa suposição; a leitura que só verifica se o par já
   existe tem seu próprio erro, e o original sempre vai para o console antes
   de virar mensagem de tela. Varredura feita no resto do código
   (`store.ts`, `lib/firestore.ts`, `lib/voice-engine.ts`) achou o mesmo
   formato em 4 listeners — mas todos sobre um mecanismo real e documentado
   (perder acesso a um grupo por cascata de exclusão), não suposição cega;
   não foram tocados.
5. **`friends-screen.ts` se remontava com a própria escrita** — o mesmo
   problema que o `chat.ts` já resolveu na etapa 13 para o composer, só que
   ninguém tinha percebido aqui porque o pedido de amizade nunca tinha
   chegado a funcionar (item 3) para expor. Mandar um pedido dispara o MEU
   PRÓPRIO listener de amizades quase na hora — apareço em `members` — e
   isso remontava a tela de amigos inteira, arrancando o formulário de
   "adicionar" com a resposta ainda a caminho: a nota ficava vazia para
   sempre, nem sucesso nem erro. Agora a casca (cabeçalho, abas, corpo) é
   montada uma vez e só um `update()` decide o que repintar — nunca o corpo
   da aba "adicionar" enquanto ela continua sendo a aba ativa. Varredura no
   resto do app: as abas "pendentes"/"bloqueados" usam o mesmo gatilho mas
   não têm estado local para perder (ações disparam e mostram toast global);
   os modais (criar grupo, criar canal, convite) montam direto em
   `document.body`, fora do `render()` do app.ts — estruturalmente imunes.
   Prova do conserto: revertido, rodado, falhou (nota vazia); restaurado,
   rodado, passou — `tests/friends.spec.ts` ganhou uma asserção nova que
   confere a nota **depois** de o outro lado já ter recebido o pedido em
   tempo real (prova de que o listener já disparou).
6. **`signUpFromInviteUi` ainda faltava um passo**: mesmo com o e-mail
   confirmado, `decide()` (main.ts) exige `@` escolhido ANTES de qualquer
   rota — convite incluso ("@ antes de tudo"). O comentário original deste
   helper afirmava que o cadastro pelo convite ia direto para a tela do
   convite; estava errado, e foi assim que o passo do `@` ficou faltando por
   uma volta inteira: o convidado ficava preso na tela de escolher nome,
   esperando um botão de convite que só existe depois dela. Corrigido para
   também reservar o `@`, como `signUpThroughUi` já fazia.
7. **Token velho — três lugares decidiam depois de `emailVerified` virar
   `true`, e só UM atualizava o token.** Isto ATINGE GENTE DE VERDADE, não só
   teste: quem confirma o e-mail rápido — a caixa de entrada já aberta, o
   clique saindo na hora — corre o risco de cair no caminho que não
   atualizava nada, e ao escolher o `@` recebe "O servidor recusou a reserva
   desse nome. Se você acabou de confirmar o e-mail, recarregue a página e
   tente de novo." Era loteria: dependia de qual dos três chegasse primeiro.
   Medido com instrumentação (10 execuções da mesma ação, tempo de cada elo
   separado — cadastro, confirmação por REST, espera de detecção, `reload()`,
   `getIdToken(true)`, reserva do `@`, aparição da tela seguinte), comparando
   uma execução que passou com uma que falhou:
   - **`showVerifyEmail` (o polling de 4s)** já chamava `getIdToken(true)`
     depois de detectar a confirmação — este sempre esteve certo.
   - **`onAuthStateChanged`** podia receber `emailVerified: true` direto do
     SDK, SEM passar pelo polling — e não atualizava o token. Corrigido.
   - **O fim do `handleSignUp`** (depois do `try/catch` do cadastro) também
     chama `decide()` direto, e é o que corre quando a confirmação (rápida,
     pela API de admin do emulador num teste — ou uma pessoa muito rápida no
     link, em produção) termina ANTES do próprio cadastro no cliente. Este
     era o que faltava: só corrigir os dois primeiros não bastou, a suíte
     continuou falhando ~40% das vezes até este ser achado e fechado.
   - Consertado com um helper único, `ensureFreshToken`, chamado pelos três —
     com trava por uid para não pagar a viagem de rede à toa em quem já
     estava verificado há sessões.
   - **Bônus pedido junto:** a aba agora confere a confirmação IMEDIATAMENTE
     ao ganhar foco (`visibilitychange`), em vez de esperar até 4s do próximo
     tick do intervalo — quem confirma e volta para a aba não fica olhando
     tela parada.
   - **O que a hipótese de "acúmulo no emulador" não explicava, e este achado
     explica:** duas execuções vizinhas com o MESMO helper, uma falhando e a
     seguinte passando em 12s, sem gradiente por posição na suíte — é uma
     corrida entre três origens de evento, não desgaste por tempo de execução
     ou volume de dados acumulado.

**Pendência nova, NÃO reproduzida — registrada mesmo assim:**
`showInvite` (main.ts) se protege de terminar DEPOIS de a rota já ter mudado
(`if (route.name !== 'invite' || route.code !== code) return;` — sem isso,
uma resposta tardia pintaria uma tela de convite obsoleta por cima do que a
pessoa já estava vendo). `resolveUsername`, `showChooseUsername` e `showApp`
tomam a mesma decisão assíncrona (buscam dado, depois `showScreen(...)`) e
NENHUM tem o equivalente. É a MESMA classe do conserto 5 (`friends-screen.ts`
se remontando com a própria escrita — um nó recebendo uma resposta tarde
demais, depois que a tela já seguiu em frente) — só que aqui ninguém mediu
uma falha de verdade ainda. Vale o registro pelo padrão desta etapa inteira:
cinco dos sete consertos só apareceram porque o de trás escondia o da
frente; não ter reproduzido não é o mesmo que não existir.

### Oitavo conserto — paginação: sem overflow, sem rolagem, sem histórico

A pendência da paginação (60 esperadas, 50 achadas) era PRIORITÁRIA: etapa
13 está PUBLICADA, e se fosse bug de produto já estaria atingindo quem usa
o app agora. Era.

**Reproduzido com números concretos**, exatamente como previsto antes de
investigar: janela de 2600px de altura, 55 mensagens curtas num canal.
```
scrollHeight: 2483, clientHeight: 2483, overflows: false
```
As 50 primeiras mensagens cabem INTEIRAS na área visível. Sem sobra para
rolar, `scrollTop` nunca sai de `0` — nem `node.scrollTop = 0` nem a roda do
mouse mudam nada, porque não há nada para rolar. Sem um evento de `scroll`
de verdade, o listener que decide "carregar mais histórico" nunca dispara.
**A pessoa fica sem NENHUMA forma de ver as outras 5 mensagens** — não existe
botão, o único caminho seria rolar, e não dá.

Conserto em duas partes, as duas em `message-list.ts`:

1. **Carregamento automático.** Depois de cada página renderizada, um
   `requestAnimationFrame` mede `scrollHeight` contra `clientHeight` (só
   depois do layout de verdade — no mesmo turno síncrono o nó ainda nem está
   no documento). Se não estourou e ainda há histórico, carrega mais uma
   página sozinho. Cada página nova passa pela mesma checagem, então o
   efeito é encher a tela até estourar ou até o histórico acabar — a trava
   de `MAX_MESSAGE_PAGES` (10) do store vale igual aqui.
2. **Botão "Carregar mensagens anteriores".** Aparece no topo sempre que há
   mais histórico e nada está em voo — a GARANTIA que não depende de
   overflow, de mouse, de toque nem de nenhuma medida de layout. O
   automático cobre o caso comum; o botão cobre todos.

Prova do conserto: a sonda (janela alta, 55 mensagens) confirmada — 0
falhas em 10 execuções depois do conserto, contra travado-para-sempre antes
dele.

**O botão, do jeito que nasceu, quebrou um teste que já passava.** A
primeira versão prendia o botão como ITEM da lista, no mesmo lugar dos
avisos de "Carregando…"/"Início de #canal". Isso derrubou
`"rolar ao topo carrega o histórico sem arrancar a posição de leitura"` — de
sempre verde para ~metade das execuções saltando a âncora bem além do teto
de 12px (chegou a 45px). Isolado por eliminação, não por dedução:
- Descartei o carregamento automático primeiro — nenhuma das execuções que
  falharam tinha ele disparando (`isConnected=true` nunca apareceu nos
  registros da checagem).
- Descartei o número de temporizadores agendados — cortar quantos eram
  agendados não mudou a taxa de falha.
- Isolei o botão por eliminação direta: desligado, o teste voltou para a
  taxa de fundo (~1 falha em 10, mesmo artefato de sempre); ligado, ~metade
  falhava.

**Conserto: o botão virou sobreposição (`position: absolute`), não item de
lista.** Preso como item, ele entra e sai do FLUXO da lista a cada
`loadingOlder`/`atStart` mudando — e isso mexe no `offsetTop` de toda
mensagem abaixo dele, interferindo direto na compensação de rolagem que
`swapMessages` (app.ts) calcula medindo a mensagem-âncora antes e depois.
Flutuando por cima da primeira mensagem em vez de empurrá-la, ele nunca
muda a altura de nada — e a taxa de falha voltou ao normal (confirmado:
10 execuções, mesma taxa de fundo do teste antes de qualquer coisa desta
etapa).

**Achado à parte, NÃO consertado — instabilidade de teste, não de produto,
em DOIS testes agora:** sobra uma falha intermitente (~1 em 10) tanto em
`"chegar ao começo do canal..."` quanto em `"rolar ao topo carrega o
histórico..."` — os dois usam `seedHistory` (REST, mensagem por mensagem,
listener já ativo) e os dois capturam uma mensagem-âncora para medir contra
ela. Na falha do segundo teste a âncora chega a SUMIR do DOM (timeout
esperando o `data-message-id` dela) — sinal mais direto ainda de que ela foi
evictada da janela de `limitToLast` por escritas ainda chegando em segundo
plano, não de conta de rolagem errada. Hipótese registrada nos dois testes
(comentário acima de cada um, não virou retry — retry esconderia o número).
**Se isto aparecer em cenário real (sem `seedHistory`, mensagens chegando
pela UI normalmente), deixa de ser artefato e volta para a fila como bug.**

### Nono conserto — `.callbar`: três defeitos empilhados, nenhum dos dois
### que o registro anterior suspeitava

O registro anterior ("Pendência antiga") suspeitava de `onDisplaced` (o
listener de presença de `voice-presence.ts`) disparando por engano, talvez
ligado ao acúmulo de dados do emulador entre execuções. **As duas hipóteses
caem: reproduzido 8 de 8 vezes isolado, do zero, sem suíte nenhuma por
perto — não é corrida, não é acúmulo.**

Instrumentado direto em `buildCallBar` (app.ts) antes de qualquer conserto,
o log tirado no instante exato da falha:
```
{"view":"home","centerView":"voice","voiceNull":false,"voiceGroup":"...","activeGroupId":"..."}
```
`state.voice` nunca fica `null` — `voiceNull: false` o tempo todo. A
chamada em si nunca cai; o que falha é só a VISIBILIDADE. Três defeitos
independentes, cada um escondendo o próximo até o anterior estar resolvido:

1. **`buildCallBar` (app.ts) usava `state.centerView === 'voice'` sozinho
   como "estou olhando a sala".** É verdade na visão de grupo, mas
   `centerView` não é resetado ao entrar em `view: 'home'` — de propósito
   (ver item 3). Sem saber disso, `buildCallBar` concluía "já estou vendo a
   sala" bem quando a sala não está em lugar nenhum da tela (é
   `state.view === 'home'` quem impede a sala de aparecer, num retorno
   antecipado de `render()` que `buildCallBar` não conhecia). Corrigido
   centralizando a pergunta "a sala está mesmo na tela?" numa função só,
   `isViewingRoom(state)` — `view` e `centerView` pareados —, usada tanto por
   `buildCallBar` quanto pelo `showRoom` de `render()`. Escolhi esta forma em
   vez de resetar `centerView` ao entrar em `home`: resetar quebraria o
   comportamento do item 3 (reabrir o MESMO grupo da chamada cai direto na
   sala), que já tem teste cobrindo (`loft.spec.ts` "a chamada sobrevive à
   troca de GRUPO...").
2. **Consertado o item 1, a faixa continuava invisível — CSS, não estado.**
   `buildHomeColumn` sempre montava a faixa com a variante `'mobile'`
   (`renderCallBar(bar, 'mobile')`), e `.callbar--mobile` só fica visível
   dentro de `@media (max-width: 720px)` (call-bar.css / layout.css) — no
   desktop ela nasce com `display: none`. Diferente do chat (dois pontos de
   montagem, um por layout, CSS decide qual mostrar), a tela inicial só tem
   UM ponto — não devia estar preso a uma variante fixa. Corrigido: a
   variante segue `isMobileLayout()`, igual ao padrão já usado nos outros
   dois pontos.
3. **Consertados os dois, a faixa aparecia mas `.callbar__back` não
   funcionava DA TELA INICIAL** — clicar nela não trazia a sala de volta,
   ficava preso na tela de amigos com `centerView: 'voice'` por baixo e nada
   na tela mudando. `openVoiceRoom` (store.ts) nunca resetava `view` para
   `'group'` — não precisava até agora, porque a faixa nunca tinha aparecido
   na tela inicial para alguém clicar. Corrigido: `openVoiceRoom` agora
   também `patch({ view: 'group', ... })`.

Os três, em `buildCallBar`/`isViewingRoom`/`buildHomeColumn` (app.ts) e
`openVoiceRoom` (store.ts), foram achados NA ORDEM em que apareceram —
cada conserto revelando o próximo ao rodar o teste de novo, nunca por
suposição. Prova final: `tests/friends.spec.ts` "a tela inicial não derruba
a chamada de voz" estendido para cobrir os TRÊS pontos de montagem da faixa
na mesma sessão (coluna da tela inicial, rodapé da lista de canais no
desktop, acima do composer no mobile — este último forçando o breakpoint
com `page.setViewportSize` no meio do teste) e o botão de voltar clicado DA
tela inicial. 8 de 8 em `--repeat-each=8`, isolado. As duas coberturas
antigas do mesmo `buildCallBar` (`loft.spec.ts` "a barra de composição fica
na tela...", "a chamada sobrevive à troca de GRUPO...", e `mobile.spec.ts`
"a faixa de chamada fica acima do composer no mobile") continuam verdes —
nenhuma delas passava por `view: 'home'`, por isso nenhuma tinha capturado
o defeito antes.

## Etapa 15 — a investigação das 198 contas, e a trava que faltava

### O VEREDITO: a suíte de 133 minutos NÃO rodou contra o projeto real

A hipótese era que a execução de 133 minutos da noite de 23/08 tinha caído em
produção e criado as contas `loft-e2e-` vistas no console. **Ela não criou.** As
contas são reais e o problema que elas denunciam é real — mas são de OUTRO
momento, e a execução de 133 minutos não deixou nenhum rastro em produção.

A evidência, colhida do projeto real (`loft-3d6c0f`) em 24/08:

| medida | resultado |
| --- | --- |
| contas no Auth | **199** no total — **175** com prefixo `loft-e2e-`, 24 sem |
| janela de criação das 175 | **22/08 20:46:37 → 23/08 03:34:09** |
| contas criadas depois disso | **nenhuma** até 24/08 13:59 (um cadastro manual seu) |
| documentos criados na janela dos 133 min | **zero, em todas as coleções** |

Não são 198 contas, são **175**. As outras 24 são as suas, as dos seus amigos e
algumas sondas antigas (`loft-probe-`, `probe-`, `loft-quota-`).

**Como sei a hora exata de cada conta, e não por dedução:** `newAccount` monta o
e-mail como `loft-e2e-${Date.now().toString(36)}-${contador}`. O timestamp está
DENTRO do e-mail. Decodificando os 175 e comparando com o `createdAt` do Auth, a
diferença mediana é de 1,7 s — os dois relógios contam a mesma história.

Agrupando por contador reiniciado (processo novo) e por intervalo, as 175 contas
se separam em **seis execuções**, todas na madrugada de 22→23:

```
1.  22/08 20:46:37                        1 conta
2.  22/08 22:10:00 → 22:12:30   (2,5 min) 15 contas
3.  23/08 00:16:52 → 00:32:32  (15,7 min) 71 contas   <- suíte inteira contra o real
4.  23/08 01:51:29 → 01:56:26   (5,0 min) 19 contas
5.  23/08 02:23:42 → 02:33:14   (9,5 min) 36 contas
6.  23/08 03:24:48 → 03:34:09   (9,3 min) 33 contas
```

A execução 3 leva 15,7 minutos — bate com os "~18 minutos contra o projeto real"
registrados na etapa 12. **Estas seis execuções são a causa do estouro de cota
que a própria etapa 12 documenta**, e são anteriores à migração para o emulador.
A etapa 12 foi a resposta a elas; as contas são o resíduo que ninguém apagou.

### Três provas independentes de que os 133 minutos não tocaram produção

1. **Nenhuma conta** no Auth real entre 23/08 03:34 e 24/08 13:59. A primeira
   coisa que `signUpThroughUi` faz é criar a conta, antes de qualquer trava de
   e-mail — se a suíte tivesse rodado ali, haveria dezenas.
2. **Nenhum documento** com `createTime` naquela janela, em nenhuma das oito
   coleções. Nem em `signals` (494 documentos, o último de 23/08 03:33:20).
3. **As coleções da etapa 14 não existem em produção.** A entrega 1 escreve em
   `usernames`, `userPrivate`, `friendships` e `blocks`. O banco real tem
   `channels, groups, invites, memberships, messages, users, voiceChannels,
   voiceParticipants` — e mais nada. Uma suíte da etapa 14 contra produção teria
   criado as quatro. É a prova mais direta: aquele código nunca falou com o real.

### Então o que foram os 133 minutos

A suíte rodou **no emulador**, e demorou porque estava quebrada, não porque
estava em produção. O que já se sabia — `emailVerified` chegando `true`, o
`putDocViaRest` devolvendo 200 onde se esperava 403 — eram sintomas do defeito
descrito abaixo, que fazia cada teste da etapa 14 esperar o tempo inteiro do
limite antes de desistir. Com limites de 120 a 240 s por teste, 60 testes e
falhas em cascata, 133 minutos é o resultado aritmético.

O registro do npm confirma o horário: às 23/08 19:11:46 há um
`npm exec vite --port 5199 --strictPort` — o `webServer` do próprio Playwright —
**sem código de saída**, ou seja, morto por interrupção e não terminado. As
capturas `dark-1-login.png` e `dark-2-sem-grupos.png` são de 23/08 21:51, já
perto do fim daquela execução.

### O PATH/Path: por que `npm test` morria (corrigido)

`scripts/emulator.mjs` fazia `env['PATH'] = ...` sobre `{ ...process.env }`. No
Windows a variável se chama **`Path`**. O `process.env` do Node disfarça isso na
leitura, mas o objeto espalhado não disfarça nada: escrever `PATH` ali não
substitui `Path`, **cria uma segunda**. O filho recebe as duas, o `cmd.exe` pega
a original — sem o JRE e sem o diretório do npm — e responde `'npx' não é
reconhecido`. O emulador nunca subia.

Agora a chave é PROCURADA, não assumida:

```js
const chaveDeCaminho =
  Object.keys(env).find((nome) => nome.toUpperCase() === "PATH") ?? "PATH";
```

Verificado: `npm test` sobe o emulador e roda a suíte nesta máquina.

**Correção importante à hipótese de trabalho:** este defeito **abortava**, não
vazava. `emulator.mjs` sai com código 1 e nada roda. Ele não derrubou nada em
produção sozinho — o que ele fez foi empurrar para o hábito de rodar
`npx playwright test` direto, e ESSE caminho ia para o real sem avisar.

### A trava LOFT_ALLOW_REAL — não existia; agora existe

Procurei em todo o repositório: **nenhuma ocorrência**. Ela foi pedida na etapa
13 e nunca chegou ao código. O que existia era o oposto — a etapa 12 escreveu,
como decisão de projeto, que "variável ausente = projeto REAL" era "o lado
seguro do erro".

Não é o lado seguro. Ausência é justamente o estado que um caminho quebrado
produz. O `playwright.config.ts` agora **RECUSA** rodar fora do emulador sem
`LOFT_ALLOW_REAL`, com erro alto que diz o que fazer. Verificado: `npx playwright
test` direto morre com código 1 antes de subir o Vite.

As três escotilhas legítimas continuam funcionando por `scripts/real.mjs`, que
define a variável só no ambiente do filho e imprime um aviso:

```
npm test               → EMULADOR (padrão)
npm run test:real      → PROJETO REAL, consciente
npm run test:turn      → PROJETO REAL, consciente
npm run check:indexes  → PROJETO REAL, consciente
npx playwright test    → RECUSADO
```

### O @ que nunca era reservado — um defeito do PRODUTO, não do teste

O `putDocViaRest` devolvendo 200 no lugar de 403 **não era divergência entre o
`@` que a UI grava e o que `usernameFor()` deriva**. Os dois sempre coincidiram
(`loft-e2e-mt7ikjpa-1@example.com` → `lofte2emt7ikjpa1` dos dois lados). Medido
com uma sonda dentro do emulador:

```
>>> usernameFor()        : "lofte2emt7ikjpa1"
>>> users/<uid>.username : undefined
>>> usernames/<derivado> : null
>>> erro na tela         : "Esse nome já está em uso."
```

A reserva **nunca acontecia**, e a cadeia é esta:

1. `user.reload()` em `main.ts` atualiza o REGISTRO do usuário, então
   `emailVerified` vira `true` e a tela avança para o `@`.
2. Mas `reload()` **não emite token novo**. O ID token em cache continua com
   `email_verified: false` — e é o TOKEN que as regras leem (`verified()`).
3. A batch de `claimUsername` é negada com `permission-denied`.
4. `claimUsername` traduz TODO `permission-denied` para `UsernameTakenError`, e
   a tela diz **"Esse nome já está em uso."** — para um nome que ninguém tomou.
5. `usernames/<@ de A>` não existia, então o create de B era simplesmente
   ACEITO: 200.

**Isto atinge qualquer pessoa real**, não só os testes: quem confirma o e-mail e
escolhe um `@` livre leva "Esse nome já está em uso" na primeira tentativa.

Correção em `main.ts`: `await auth.currentUser.getIdToken(true)` depois de
detectar a confirmação, antes de `decide()`.

Com a reserva funcionando, o teste passou a receber **409 (ALREADY_EXISTS)**, que
é a resposta CERTA: `putDocViaRest` cria pela coleção com `documentId`, a regra
de `create` passaria para B, e quem recusa é a chave primária — exatamente a
garantia que o comentário do teste descreve. O `403` esperado estava errado para
aquele endpoint. Ajustado para 409.

### Por que ninguém viu: o signUpThroughUi dava cadastro por concluído cedo

O helper esperava o botão **"Sair da conta"** para dizer "conta pronta". Esse
botão existe em QUATRO telas — `verify-email`, `choose-username`, `empty-state` e
`channel-list`. Ele aparecia na própria tela do `@`, com a reserva recusada e o
erro escrito na tela, e o teste seguia como se tudo tivesse dado certo.

Agora o helper falha DIZENDO o motivo se `.username__error` tiver texto, exige a
tela do `@` sumir e só então confirma a entrada no app pelo estado vazio.

### A limpeza agora garante a conta, e conta o que ficou

Era assim, nos cinco `afterAll`:

```ts
await cleanupFirestore(accounts);                              // se isto estourar…
for (const account of accounts) await deleteAccount(account);  // …isto nunca roda
```

Qualquer falha na faxina de documentos — rede, cota, timeout do `afterAll` —
matava o laço que apaga as contas. Conta viva com documentos que só ela pode
apagar é exatamente a órfã da etapa 4.

Agora existe `limparTudo(accounts, rotulo)`, e os cinco `afterAll` chamam só ela:

- a faxina de documentos roda dentro de `try/catch`, e cada conta tem o seu
  próprio `catch` — uma que falha não leva as outras junto;
- **a remoção das contas do Auth acontece sempre**, depois, aconteça o que
  acontecer com os documentos;
- `deleteAccount` devolve `boolean` (antes engolia a resposta do `idpCall` e
  "removidas" era sempre otimista);
- o relatório final nomeia o que ficou:

```
limpeza: 132 documentos e 12 de 14 contas removidos
  1 conta(s) com falha na faxina de documentos:
    - loft-e2e-xxxx-3@example.com: fetch failed
  !! 2 CONTA(S) FICARAM NO PROJETO REAL:
    - loft-e2e-xxxx-3@example.com
    - loft-e2e-xxxx-9@example.com
  Apague-as no console do Firebase ANTES dos documentos delas.
```

### O que as 175 contas deixaram no Firestore real

**686 documentos**, em 7 coleções. Apague os documentos ANTES das contas — com a
conta apagada, as regras não deixam mais ninguém alcançá-los.

| coleção | de contas e2e | total na coleção |
| --- | --- | --- |
| channels | 224 | 603 |
| memberships | 138 | 320 |
| voiceParticipants | 88 | 106 |
| groups | 74 | 201 |
| users | 60 | 102 |
| invites | 51 | 128 |
| messages | 51 | 1200 |
| **total** | **686** | **2660** |

São 75 grupos ligados a contas de teste, e 546 dos 686 documentos são filhos
desses grupos (canais, mensagens, convites, presenças, memberships).

Além disso, o banco real **já tem 529 documentos órfãos** de contas apagadas
antes desta investigação — `groups` 117, `memberships` 159, `messages` 144,
`invites` 69, `users` 23, `voiceParticipants` 17 —, mais **494 documentos em
`signals`** (subcoleção de `voiceChannels`, cujos documentos-pai não existem).
Esses não são alcançáveis por nenhuma conta: só saem por console ou por um
script com credencial de dono.

### A faxina do projeto real — feita em 24/08

`scripts/limpar-projeto-real.mjs` limpou o `loft-3d6c0f` com credencial de dono:

```
1707 documentos apagados   (749 das contas de teste + 958 órfãos)
 175 contas apagadas       (todas com prefixo loft-e2e-)
  23 contas preservadas
```

Releitura depois da faxina: **0 contas `loft-e2e-`, 0 documentos de teste, 0
órfãos**. O projeto está limpo.

O script continua no repositório porque a suíte contra o real (`test:real`,
`test:turn`, `check:indexes`) volta a sujar, e porque a limpeza da própria suíte
só alcança o que as contas dela conseguem apagar — órfão de conta já removida,
por definição, ela não alcança.

**Como ele evita apagar o que não deve:**

1. **Conta só sai com o prefixo `loft-e2e-`**, e a checagem é refeita contra o
   Auth VIVO no instante de apagar, não contra a lista lida no começo. As sondas
   antigas (`loft-probe-`, `probe-`, `loft-quota-`) NÃO têm o prefixo e foram
   preservadas de propósito — ampliar a regra é decisão de quem manda, não do
   script.
2. **Grupo só conta como "de teste" se uma conta `loft-e2e-` o CRIOU.** Uma conta
   de teste que apenas ENTROU num grupo de gente de verdade deixa só a
   `membership` dela para trás; o grupo, os canais e as mensagens ficam. Sem esta
   distinção a faxina apagaria conversa alheia por tabela.
3. **Órfão é quem perdeu o DONO, não quem perdeu o pai.** A primeira versão jogou
   todos os 494 `signals` no balde de órfãos, porque os `voiceChannels` pai não
   existem. Mas parte deles é de contas vivas: 68 eram das contas de teste, 426
   não tinham ninguém vivo nos dois lados (`from`/`to`), e o resto ficou.
4. **Documentos primeiro, contas depois.** Ao contrário, os documentos ficam
   inalcançáveis para sempre — foi assim que os 958 órfãos apareceram.
5. **Padrão é só LISTAR.** Apagar exige `--apagar` e digitar o total exato; se o
   total mudou entre planejar e confirmar, o script cancela em vez de adivinhar.
6. **Reexecutável.** Cada execução relê o estado; se cair no meio, rodar de novo
   acha menos coisa. Não há arquivo de estado para dessincronizar.
7. **O relatório final é uma LEITURA NOVA**, não a soma do que o script achou que
   fez. Número calculado a partir das próprias intenções não prova nada.

### `permission-denied` deixou de significar uma coisa só

O conserto do token (`getIdToken(true)`) tirou a CAUSA da recusa, mas a tradução
que ESCONDEU o defeito continuava lá: `claimUsername` mandava todo
`permission-denied` virar "Esse nome já está em uso". A próxima recusa por regra
se disfarçaria exatamente do mesmo jeito.

Agora são dois erros distintos, e a separação é feita perguntando ao banco:

```ts
const dono = await uidOfUsername(name).catch(() => null);
if (dono !== null && dono !== uid) throw new UsernameTakenError();
throw new UsernameRefusedError();
```

Pelo SDK, escrever sobre um `usernames/` existente cai na regra de `update`
(`if false`) e volta como permissão negada — não como "já existe" —, então a
colisão REALMENTE chega aqui como `permission-denied` e a tradução antiga não era
absurda. O que ela não podia era ser a ÚNICA leitura possível: `verified()` falso,
o `update` em `users/` e o `delete` do nome anterior produzem o mesmo código com
o nome LIVRE. A leitura de `usernames/` é aberta a qualquer pessoa autenticada
(ver `firestore.rules`), então dá para descobrir de quem é o nome de verdade.

`UsernameTakenError` manda escolher outro nome. `UsernameRefusedError` manda
recarregar a página — que é o conselho certo para um token velho.


### RETRATAÇÃO: o `\` nas linhas 140 e 146 do firestore.rules nunca existiu

Uma sessão anterior relatou uma barra invertida no lugar de `//` nas linhas 140
e 146 do `firestore.rules`. **Esse achado está retratado.**

Verificado byte a byte (`grep` por `\` e `cat -A` no trecho): **não há uma única
barra invertida em todo o arquivo**. As linhas 140 e 146 são comentários `//`
corretos, dentro de `match /usernames/{name}`.

O relato anterior estava errado — não houve conserto entre uma leitura e outra,
o arquivo não mudou. Registrado aqui para ninguém gastar tempo caçando isso de
novo.

### Limites de tempo reduzidos

Cortados pela metade, já que o emulador não tem latência de rede:
240→120 s, 180→90 s, 150→75 s, 120→60 s.

---

## Etapa 7 — compartilhamento de tela

### Conserto mínimo de celular (não é a versão mobile)

**A suspeita da meta tag estava errada:** ela já existia em `index.html` desde a
etapa 1. A causa real é aritmética — as colunas fixas somam **564px**
(64 + 260 + 240) e o `overflow: hidden` do `reset.css` cortava tudo sem deixar
alcançar o resto. Num celular de 390px isso dá os três sintomas de uma vez:
cortado, estático e sem resposta ao toque.

Correção: abaixo de 720px o body rola na horizontal e o `.app` ganha
`min-width`. O `viewport-fit=cover` entrou junto, mas ele é para telas com
entalhe — não era o conserto.

**RESOLVIDO na etapa 8** — gavetas, chat em tela cheia, toque longo e alvos de
44px. O remendo descrito acima foi removido.

**PENDÊNCIA relacionada — navegador de celular não tem `getDisplayMedia`.**
Compartilhar tela é exclusivo de desktop. O botão já se esconde… melhor: fica
travado com o motivo (`screenShareSupported()` em `state/store.ts`), porque
sumir sem explicação faria parecer defeito.

### O que entrou

- Captura por `getDisplayMedia`, com `SCREEN_QUALITY` (1280×720@30) e
  `SCREEN_MAX_BITRATE` (800 kbps por conexão) em constantes comentadas.
- Som do sistema pedido junto; sem ele, aviso na sala.
- Três caminhos de parar, um só lugar: botão, botão nativo do navegador
  (evento `ended`) e sair do canal.
- Um transmissor por canal, com desempate por uid quando dois começam juntos.
- Palco com o vídeo, legenda de quem transmite, e **miniatura da própria
  transmissão** para conferir que foi a janela certa.
- Maximizar por sobreposição + fullscreen na raiz do app; controles somem com o
  mouse parado.
- Diagnóstico ganhou resolução, fps, bitrate, quadros descartados,
  `qualityLimitationReason` (cpu/bandwidth) e a **soma do upload de vídeo**.
- Regras: **nada mudou e nada foi republicado** — a regra de `voiceParticipants`
  da etapa 6 já cobre gravar `sharingScreen` no próprio documento.

### Quatro defeitos reais encontrados implementando

1. **`sameRoster` não comparava `sharingScreen`.** Começar a transmitir não
   aparecia para ninguém: a comparação dizia "nada mudou" e o estado nunca era
   atualizado. Ao acrescentar campo ao participante, acrescente à comparação.
2. **O botão de tela ficava clicável antes de o motor subir**, e o clique não
   fazia nada — sem erro, sem explicação. Agora existe `voiceReady` e o botão
   fica travado dizendo "Conectando à sala…".
3. **Montar a sala tem efeito colateral** (move o `<video>` do motor para o
   palco). Ela era montada em todo render e descartada quando nada mudava,
   arrancando o vídeo da sala visível.
4. **Corrida na limpeza da sinalização.** A limpeza rodava DEPOIS de anunciar
   presença; quem já estava na sala ofertava na hora, e o recém-chegado apagava
   a oferta que acabara de receber. Agora limpa antes de existir para os outros.
5. **A tela não era ligada quando a oferta chegava antes do roster.** Um par
   nasce por dois caminhos — pelo roster ou porque a oferta do outro chegou
   primeiro. `syncPeers` pulava o par já existente, e naquele caminho
   `attachScreen` nunca rodava: o vídeo não saía. Semear a conexão com as faixas
   locais passou a ser responsabilidade de `createPeer`, que é por onde os dois
   caminhos passam.

## Etapa 8 — versão mobile de verdade

### O corte: o CSS decide, o JS lê

O número 720 existe em **um** lugar: a media query. O CSS publica
`--layout: mobile|desktop` no `:root` e `lib/layout.ts` lê com
`getComputedStyle`. O JS nunca sabe qual é o número — só em que modo está.

**Consequência que importa:** o DOM é o MESMO nos dois modos. Nada desmonta ao
cruzar os 720px, então as `RTCPeerConnection`, os `<audio>` e os `<video>` do
motor sobrevivem à travessia. Se o corte fosse por árvore de componentes em JS,
redimensionar a janela derrubaria a chamada.

### O que entrou

- Gavetas: esquerda (barra de grupos + canais), direita (membros). Fecham por
  toque fora, por arrasto de volta e pelo botão de voltar do Android.
- Cabeçalho mobile no chat **e na sala de voz** — sem ele a sala prendia a
  pessoa, sem caminho de volta para os canais.
- `components/call-bar/` extraído da lista de canais. Uma implementação,
  **um ponto de montagem por vez** escolhido pelo modo: no rodapé da coluna
  (desktop) ou acima do composer (mobile).
- Teclado por `visualViewport` publicando `--app-height`; só a media query
  mobile usa a variável, o desktop segue em `100dvh`.
- `safe-area-inset` no cabeçalho, no composer e na faixa de chamada.
- Toque longo (500ms) nos mesmos alvos do botão direito, com vibração, âncora no
  ponto do toque, itens de 44px e **arrastar cancela**.
- Sala de voz: grade de 2 colunas ocupando a tela, controles de 48px sempre
  visíveis (esconder-com-mouse-parado só liga com mouse), vídeo em `contain` e
  maximizar que tenta girar para paisagem.
- PWA: manifest, ícones 192/512 **rasterizados do logo que já existia** (nenhuma
  imagem externa, nenhuma dependência nova) e service worker deliberadamente
  burro — `skipWaiting`, `clients.claim`, `fetch` que só repassa, **zero cache**.
- `firebase.json` ganhou `Cache-Control: no-cache` para `/sw.js` e o manifest.
- Saiu o remendo da etapa 7 (rolagem horizontal + `min-width: 720px`).

### Um bug de produção que já existia, achado aqui

Apertar o **botão de voltar do navegador durante uma chamada** derrubava a
chamada e remontava o app inteiro: `popstate` → roteador → `decide()` →
`showApp()` → `teardownApp()` → `store.dispose()` → sai do canal de voz.

Não era da etapa 8 — a gaveta só tornaria isso frequente. Dois consertos:

1. o roteador **para de avisar quando a rota não mudou** (`popstate` no mesmo
   caminho não é navegação);
2. `showApp` virou **idempotente**: já montado para o mesmo usuário, não
   desmonta nada.

A gaveta ainda empilha estado **nomeado** (`{ loftDrawer: true }`) para o
roteador distinguir gaveta de navegação de verdade. Em `/convite/CODIGO` com a
gaveta aberta, voltar fecha a gaveta e mantém a tela de convite.

### Outros defeitos encontrados implementando

1. **Especificidade de CSS.** O CSS de componente é importado do `.ts` dele e
   entra DEPOIS de `layout.css`; com a mesma especificidade, `display: flex`
   vencia o `display: none` da media query. Os seletores mobile precisaram do
   pai (`.app > .channels`).
2. **Duas faixas de chamada no DOM quebraram 7 testes de desktop** (violação de
   modo estrito em `.callbar`). O consertado foi o produto — montar em um lugar
   só —, **não os testes**: a restrição era que nada do desktop mudasse.
3. **A gaveta ficava aberta ao escolher um canal.** No desktop não existe
   gaveta e o defeito não aparecia.
4. **O palco dependia da ORDEM de chegada.** `screenVideoElement` procurava pelo
   `sharingScreen` do roster; quando a faixa chegava depois do documento, ficava
   a legenda "fulano está transmitindo" e vídeo nenhum. Agora pergunta ao motor
   quem está de fato mandando faixa.
5. **`arm()` reenviava uma oferta obsoleta.** `setLocalDescription` já captura as
   faixas daquele momento, então o "pendente" acumulado durante o aperto de mão
   já estava dentro dela; reenviar mandava uma segunda oferta em cima da
   primeira ainda em voo, e quem entrava no meio de uma transmissão não recebia
   o vídeo — de forma intermitente.

### Pendência registrada desta etapa

- **Notificações push** — ficaram de fora por decisão, como combinado.

## Etapa 14, Entrega 1 — tela inicial, identidade e amizade

Entrega 1 de 3. Conversa privada é a Entrega 2; configurações e perfil, a 3.

### Amizade: UM documento por PAR

```
friendships/{menorUid}_{maiorUid}
  { members: [a, b], from, to, status: 'pending' | 'accepted', createdAt }
```

O id sai dos dois uids ORDENADOS, então o mesmo par cai sempre no mesmo
documento. **Não são duas listas, uma em cada pessoa** — com duas, aceitar teria
de escrever nos dois lugares, e falhar no meio deixaria A amigo de B sem B ser
amigo de A, sem ninguém para consertar. Aqui esse estado nem existe.

**Pedidos cruzados viram amizade de graça:** o pedido de B para A cai no MESMO
documento do de A para B, então mandar vira aceitar. Não é caso especial no
código — é consequência do formato da chave.

**`recusado` e `cancelado` APAGAM o documento** em vez de virarem status. Um
"recusado" guardado ocuparia o id do par e bloquearia qualquer pedido futuro
para sempre, e ainda contaria ao remetente que a pessoa recusou — em vez de
apenas não ter respondido, que é socialmente muito diferente.

### O `@`: único porque o id do documento É o nome

`usernames/{nome} → { uid }`, escrito numa `writeBatch` junto com o perfil. O
Firestore não tem restrição de unicidade; quem recusa o segundo a chegar é o
SERVIDOR, no `create` de um documento que já existe. Checar "já existe?" antes
de escrever sempre chega tarde numa corrida — a checagem que existe no código é
conveniência para dar mensagem boa, e está comentada como tal.

Trocar de `@` é uma batch de três operações (apaga a antiga, cria a nova,
atualiza o perfil). **Limite de 3 trocas, cobrado NA REGRA**: `usernameChanges`
só sobe de um em um e nunca passa do teto, e mexer em `username` sem mexer no
contador é recusado.

### Público × privado

| coleção | quem lê |
|---|---|
| `users/{uid}` | qualquer autenticado — é a vitrine da busca por `@` |
| `userPrivate/{uid}` | só o dono (criada já para a Entrega 3 não migrar nada) |
| `blocks/{meu}_{outro}` | só o dono |
| `friendships/{par}` | só quem está em `members` |

`users` contém EXATAMENTE `username`, `displayName`, `initials` e
`usernameChanges`. **Nunca e-mail** — e e-mail não é usado para busca, de
propósito: buscar por e-mail transformaria a lista de contatos de qualquer
pessoa num diretório do Loft inteiro.

**O bloqueio é cobrado no servidor sem expor a lista:** a regra de criar pedido
faz `!exists(/blocks/$(to + '_' + uid()))` — regra lê o que o cliente não pode.
Quem foi bloqueado não é avisado; a escrita falha e a tela mostra erro neutro.
**Custo honesto:** quem insistir consegue inferir pelo erro. Não dá para evitar
sem fingir sucesso, e mentir é pior.

### Verificação de e-mail — e o que ela NÃO resolve

Sem `emailVerified` a pessoa não passa da tela de confirmação: não escolhe `@`,
não manda pedido, não vê grupo. E as regras exigem `email_verified` para
reservar `@`, criar pedido e criar grupo — **verificar só na tela não protegeria
nada** contra quem contorna a UI.

**ISSO NÃO PROTEGE CONTRA SENHA VAZADA.** Confirmar e-mail garante que o
endereço é de quem cadastrou; não impede que alguém com a senha certa entre na
conta. Para esse caso a saída é **autenticação em dois fatores**, que fica como
pendência.

Recuperação de senha com mensagem **neutra**, idêntica exista ou não o e-mail:
uma resposta diferente transformaria a tela de login num verificador de quem tem
conta no Loft, que é como se monta lista para phishing.

### A tela inicial não derruba chamada de voz

Trocar entre a casinha e um grupo é troca de VISÃO: muda o conteúdo das colunas
e nada mais. Nada é desmontado, `dispose()` não é chamado, e o motor de voz vive
fora da árvore de componentes — a mesma razão pela qual atravessar os 720px na
etapa 8 não derrubava nada. A faixa de chamada ganhou um terceiro ponto de
montagem, na coluna da tela inicial.

O espaço das conversas privadas fica **reservado e vazio** na coluna: uma seção
que aparece do nada na entrega seguinte muda a coluna de forma debaixo de quem
já se acostumou com ela.

### O efeito colateral em cadeia nos testes

Exigir `email_verified` para criar grupo quebraria **a suíte inteira** — nenhuma
conta de teste jamais confirmou e-mail. `signUpThroughUi` e
`createAccountViaRest` passaram a marcar a conta como confirmada pela API de
admin do emulador (`Bearer owner`), e **a reautenticar em seguida**: as regras
leem o CLAIM do token, não o banco de contas, então marcar a conta não basta —
o token em mãos continuaria dizendo `email_verified: false`.

E o `check:indexes`, que roda contra o projeto REAL, não tem essa saída: lá não
existe API para confirmar e-mail. Ele passou a usar uma **conta fixa já
confirmada à mão**, lida de `.check-indexes.json` (no `.gitignore`), com
instruções na falha se o arquivo não existir.

**Conta fixa acumula lixo**, então a faxina roda DUAS vezes — e a primeira é a
que costuma faltar: `cleanupFirestore` ANTES de criar, para varrer o grupo que
uma execução interrompida deixou para trás. Sem ela, o projeto real iria juntando
um grupo por falha, com canais e mensagens pendurados.

## Etapa 13 — histórico, responder e editar

### Histórico: a janela do listener CRESCE, com teto

Paginar é reabrir o mesmo `onSnapshot` com `limitToLast` maior. Uma fonte só, um
array só — **nada de mesclar e nada de deduplicar**. A alternativa óbvia (um
`getDocs` com cursor por cima do listener vivo) tem dois furos que só apareceriam
em produção:

1. **Lacuna.** O cursor da página antiga fica fixo; a janela viva desliza para a
   frente. Chegando mais de 50 mensagens novas, o trecho entre o começo antigo e
   o novo não está em nenhum dos dois conjuntos — some do meio da conversa.
2. **Apagar vira ambiguidade.** No `docChanges`, `removed` significa tanto "foi
   apagada" quanto "saiu da janela". Com uma janela só, quem sumiu sumiu.

**Chegou ao começo** = o snapshot devolveu menos documentos do que o limite. Sem
consulta extra, sem contador.

**O TETO, e por que ele existe.** Cada página relê a janela inteira, então o
acumulado até a página N é `50 · N(N+1)/2` — cresce ao QUADRADO:

| até a página | mensagens | leituras acumuladas |
|---|---|---|
| 3 | 150 | 300 |
| 5 | 250 | 750 |
| **10** | **500** | **2.750** ← o teto |
| 20 | 1.000 | 10.500 |

2.750 leituras de UMA pessoa rolando UMA conversa, com 50 mil por dia — e a cota
estourou em 23/08. `MAX_MESSAGE_PAGES = 10`, e no teto o topo DIZ que parou
("use a busca"). Limite silencioso seria pior: a pessoa acharia que chegou ao
começo da conversa quando não chegou.

**A saída definitiva**, quando existir busca de mensagem ou a conversa ficar
longa de verdade: **cursor + merge com um mapa acumulado**, encarando de
propósito os dois furos acima — a lacuna se resolve mantendo o mapa em vez de
substituir o array, e o `removed` ambíguo se resolve comparando com a janela
conhecida. É mais código e mais casos, e por isso não foi feito agora.

**Índice:** nenhum novo. A forma da consulta não mudou, só o limite —
`npm run check:indexes` confirmou contra o projeto real.

### A rolagem que não pode pular: UMA regra, não três

A primeira versão tinha dois ramos (mensagem embaixo → mantém posição; histórico
em cima → soma o crescimento). Ela quebrou o teste "não me arranca de onde eu
estava lendo" e **deixou 52px de resíduo** quando o indicador "Carregando…"
aparecia — porque ele também empurra a lista, e não era nenhum dos dois ramos.

A regra final é uma só: **mede quanto conteúdo entrou acima de uma mensagem que
existe nas duas listas, e soma isso ao `scrollTop`.** Isso cobre de uma vez o
histórico, o indicador aparecendo e um separador de data novo abrindo acima. E
mensagem chegando embaixo cai na mesma regra sozinha: nada mudou acima da
âncora, o delta dá zero.

Erro medido: **457px sem compensação → 5px com ela.**

**O resíduo de 5px é conhecido e não é erro de conta.** A âncora é a fronteira
com o histórico; quando entram mensagens do MESMO autor logo acima, ela deixa de
abrir bloco — perde a linha do nome e troca a margem. A mensagem tem outro
tamanho agora, e nenhum ajuste de rolagem desfaz isso. Ancorar na ÚLTIMA em vez
da primeira foi medido e é **pior**: 16px, porque aí a fronteira flutua livre.

### Responder

`replyTo` é denormalizado dentro da resposta — mesmo motivo do `groupId` na etapa
4: evita uma leitura por citação, e a original pode nem existir mais.

**O `sentAt` da citação não é enfeite.** Com ele dá para distinguir três estados
sem adivinhar: carregada (rola até ela), apagada, ou antiga demais. E a prova de
"apagada" tem DUAS formas, sendo que a segunda só apareceu quebrando: ou temos
mensagens mais antigas que a citada, ou **o canal inteiro está carregado**. Sem
a segunda, apagar a mensagem mais antiga do canal caía em "antiga demais" —
justamente o caso em que a certeza é maior.

Não pagino automaticamente atrás da original: sem saber quantas páginas faltam,
seria um laço de leituras sem teto.

### Editar

Só o AUTOR — nem o dono. Apagar ele pode (moderação); editar seria falar pela
boca de alguém. `editedAt` novo, `sentAt` intocado: a lista ordena por `sentAt`,
então editar não reordena a conversa.

### A regra de `update` estava frouxa desde a etapa 4

```
allow update: if signedIn() && resource.data.authorId == uid();
```

O autor podia mudar **qualquer campo**: reescrever `sentAt` para reordenar a
conversa, ou mover a própria mensagem de canal/grupo trocando `channelId` /
`groupId`. Agora:

```
&& request.resource.data.diff(resource.data).affectedKeys().hasOnly(['body','editedAt'])
```

O teste cobra os dois lados por REST cru: o dono não edita mensagem alheia (403),
e o próprio autor não altera `sentAt`/`channelId`/`groupId`/`authorId` (403),
mas continua editando o próprio texto (200).

### Uma armadilha de ferramenta que quase passou batido

Rodar `npx playwright test -g "filtro"` para depurar um recorte vai para o
**PROJETO REAL** — sem as variáveis do emulador, e gastando cota. Tentei permitir
`-g` através do `scripts/emulator.mjs` e não dá: entre o Node, o cmd e o
`emulators:exec` são três camadas de parsing, e `\"` não é escape no cmd. Para
rodar um recorte dentro do emulador, mire por ARQUIVO ou por LINHA:

```
node scripts/emulator.mjs playwright test tests/loft.spec.ts:2555
```

## Etapa 12 — a suíte roda no Firebase Emulator Suite

A cota diária gratuita do Firestore estourou em 23/08/2026 por causa das
execuções repetidas da suíte contra o projeto real — **e derrubou o app em
produção junto**. A suíte só cresce, então isso voltaria a acontecer.

Resultado: a suíte inteira roda em ~**3,5 minutos** contra o emulador, contra
~18 minutos no projeto real. Sem rede, sem cota, sem faxina.

### COMO SE APONTA PARA CADA UM

```
npm test          → EMULADOR      a suíte inteira, sem tocar em produção
npm run dev:emu   → EMULADOR      o app, para mexer sem gastar cota
npm run dev       → PROJETO REAL
npm run deploy    → PROJETO REAL, sempre

npm run test:turn      → projeto real não; internet SIM (servidor TURN)
npm run check:indexes  → PROJETO REAL de propósito (ver abaixo)
npm run test:real      → escotilha: a suíte do Firebase contra produção
```

**E dá para VER em qual você está:** apontando para o emulador, o app mostra uma
tarja vermelha fixa no canto escrito `EMULADOR`. Se ela não está lá, é produção.
Variável de ambiente não se vê, e confundir os dois é o pior tipo de erro — os
dados somem, ou aparecem onde não deviam, e nada na tela explica.

### Quem decide o corte

Não inventamos variável nenhuma. O próprio `firebase emulators:exec` define
`FIRESTORE_EMULATOR_HOST` e `FIREBASE_AUTH_EMULATOR_HOST` no ambiente do comando
filho, e é dessas duas que tudo se orienta:

```
firebase emulators:exec  →  define as duas variáveis
   └─ playwright.config  →  lê e repassa VITE_USE_EMULATOR ao webServer
        ├─ app (Vite)    →  connectAuthEmulator + connectFirestoreEmulator
        └─ tests/helpers →  troca as bases REST
```

**Erra para o lado seguro:** variável ausente = projeto REAL. Para cair no
emulador é preciso estar dentro do `emulators:exec` — não acontece por acidente,
e um `build` comum nunca embute isso.

> **REVISTO NA ETAPA 15.** Este parágrafo estava errado, e o erro custou caro.
> "Variável ausente" não é um estado raro e deliberado: é o estado que TODO
> caminho quebrado produz. As 175 contas de teste no projeto real vieram por
> aqui. Desde a etapa 15 o `playwright.config.ts` RECUSA rodar fora do emulador
> sem `LOFT_ALLOW_REAL`, e as escotilhas passam por `scripts/real.mjs`.

### Três armadilhas que só apareceram implementando

1. **Uma escrita do produto vazava para produção.** O `fetch(keepalive)` que
   apaga a presença no `pagehide` (lib/voice-presence.ts) monta a URL na mão,
   fora do SDK. Sem mudança, ela continuaria escrevendo no projeto REAL com todo
   o resto no emulador — e ninguém notaria: some uma linha de presença num banco
   que o teste nem olha. Agora usa `FIRESTORE_REST_BASE` do lib/firebase.ts.
2. **O teste de "Firestore inacessível" parou de cortar nada.** Ele bloqueava
   `firestore.googleapis.com`; no emulador o host é outro, o grupo era criado
   com sucesso e o teste esperava um erro que nunca vinha. Virou o helper
   `blockFirestore`, que monta o padrão do modo em que está.
3. **A limpeza estourava o `afterAll`.** No emulador não há o que limpar — os
   dados morrem com ele —, e rodar a faxina mesmo assim gastava minutos em
   requisições inúteis. `cleanupFirestore` e `deleteAccount` saem cedo, e o log
   passou a dizer a verdade ("limpeza dispensada") em vez de anunciar remoções
   que não aconteceram.

### O JRE — nada foi instalado na máquina

> **SUPERADO na etapa 16:** o projeto passou a usar o Java do sistema; não é
> mais preciso baixar o JRE portátil. O texto abaixo fica como histórico.

O emulador de Firestore é um programa **Java** (o de Auth é Node e não precisa).
Não havia JVM aqui. O `winget --scope user` **não existe** para o Temurin — o MSI
é só de máquina, o que seria mais invasivo do que o combinado —, então o projeto
usa um **JRE portátil** em `.tools/jre` (no `.gitignore`), e `scripts/emulator.mjs`
aponta `JAVA_HOME` para ele só enquanto o emulador roda.

**Quem clonar o repositório precisa baixar o JRE.** O script falha dizendo
exatamente isso, com o link do Adoptium e o caminho esperado.

## O QUE O EMULADOR NÃO COBRE — e o comando que repõe

**Ele não valida índices compostos.** Responde qualquer consulta, com ou sem
índice publicado. A classe de erro que derrubou quatro testes na etapa 4 — índice
publicado com a DIREÇÃO errada — deixou de ser pega pela suíte. É uma perda real
de cobertura, trocada por não estourar a cota.

A reposição é `npm run check:indexes` (`tests/indexes.spec.ts`, tag `@indices`,
fora do `npm test`): cria uma conta e um grupo **no projeto real** e exercita
pela interface as consultas compostas do produto — mensagens do canal, canais do
grupo, memberships nos dois sentidos, participantes de voz e sinalização —
escutando o console do navegador. Custo: uma conta e ~10 gravações, ~18s.

**RODE DEPOIS DE MEXER EM QUALQUER CONSULTA** com `where` + `orderBy`, ou ao
acrescentar um `where` a uma consulta existente.

**Detalhe que não pode ser "simplificado" depois:** o teste PRECISA rodar como
membro do próprio grupo. Medido aqui: uma consulta de não-membro é recusada pela
REGRA (403 PERMISSION_DENIED) **antes** de o Firestore avaliar o índice — então
sondar com uma conta qualquer nunca veria erro de índice, e o comando passaria
sempre, sem significar nada. Ele também falha de propósito se for rodado dentro
do emulador, pelo mesmo motivo.

### O caminho de falha, PROVADO — e como você vai reconhecê-lo

Não bastava passar com os índices no lugar: um detector que nunca detectou não
vale nada. Acrescentei uma sonda deliberadamente sem índice (`messages` com
`groupId` + `authorId` + `orderBy sentAt`, combinação que o produto nunca usa),
confirmei o vermelho, e removi. **É esta a mensagem que aparece:**

```
A consulta "<nome>" ESTÁ SEM ÍNDICE no projeto real.
Resposta do Firestore (HTTP 400):
[{ "error": { "code": 400,
   "message": "The query requires an index. You can create it here:
                https://console.firebase.google.com/v1/r/project/loft-3d6c0f/
                firestore/indexes?create_composite=Ckxwcm9qZWN0cy9sb2Z0...",
   "status": "FAILED_PRECONDITION" } }]
```

O link vem do próprio Firestore e cria o índice certo. Depois de criar,
acrescente a `firestore.indexes.json` e publique com
`firebase deploy --only firestore:indexes` — e **espere ficar READY** antes de
confiar no resultado (a etapa 4 perdeu tempo exatamente aí).

### Um falso positivo, e a lição que ficou

A primeira versão da sonda acusou `channels` sem índice. **Era erro meu:**
inventei um `orderBy position` que o produto não faz — `subscribeChannels`
consulta só por `groupId` e ordena no CLIENTE. A sonda tem que espelhar a forma
EXATA da consulta real; se inventar um `orderBy`, acusa índice faltando onde não
falta. Está comentado em `probeQuery`.

Hoje as quatro consultas sondadas — mensagens do canal, canais do grupo, meus
grupos e membros do grupo — passam contra o projeto real.

## Etapa 11 — TURN

Antes só havia STUN público. Em rede doméstica resolve; atrás de NAT simétrico
(escola, empresa, algumas operadoras) a conexão direta não fecha e a chamada não
acontece.

### Onde ficam as credenciais

`src/lib/ice-servers.ts`, arquivo próprio. Elas são regeneráveis no painel do
ExpressTURN, e quando isso acontecer o conserto tem que ser trocar duas linhas
ali — não caçar constantes espalhadas pelo motor de voz.

### LIMITAÇÃO CONHECIDA — só a porta 3478, sem TLS na 443

O plano gratuito do ExpressTURN não oferece TLS na 443, e é justamente a 443 que
atravessa firewall corporativo muito restritivo, porque parece tráfego HTTPS
comum. **Rede que bloqueie a 3478 nas duas variantes continua sem conectar, e
não há o que fazer daqui.**

O pedido original mandava incluir "a variante TCP na porta 443". Ela **não
existe** neste plano — as credenciais fornecidas só têm 3478. Acrescentar uma
URL de 443 que ninguém atende seria pior do que não ter: somaria espera na
coleta de candidatos e daria falsa sensação de cobertura. Ficaram as duas URLs
reais (UDP e TCP na 3478).

### O que acontece se o TURN cair ou a cota acabar

**A chamada de quem não precisa de relay continua igual, e isso não depende de
sorte.** Um servidor ICE inalcançável só deixa de ACRESCENTAR candidatos: os
`host` e `srflx` continuam sendo coletados e publicados, e como a sinalização é
trickle, a conexão fecha pelo primeiro par que funcionar. O único efeito é o
`iceGatheringState` demorar mais para chegar a `complete` — e ninguém no app
espera por esse estado.

Daí a regra que guiou o resto: **falha de TURN não é falha de chamada e não vira
erro na tela.** Ela vai para o diagnóstico e para o console. O que vira aviso é a
conexão terminar em `failed`.

### Não gastar relay à toa

- Nada de `iceTransportPolicy: 'relay'` no produto — só no teste. Forçar relay
  gastaria o plano em chamadas que fechariam sozinhas de graça.
- A ordem em `ICE_SERVERS` é preferência de custo: STUN antes, TURN depois.
- **Teto separado de 1,5 Mbps por par em relay** (`RELAY_MAX_BITRATE`), no lugar
  da fatia do orçamento de 8 Mbps. O gargalo ali não é o meu upload, é o
  servidor de terceiro no meio. Com `maintain-framerate` (etapa 9) isso derruba
  a resolução e mantém o movimento — a troca certa para jogo. O tipo de
  candidato só se conhece depois de a conexão fechar, então o teto é reavaliado
  quando o par chega a `connected` e a cada leitura do painel (um par pode
  MIGRAR para relay no meio da chamada).
- Painel: aviso em vermelho no topo quando qualquer par está em relay, a linha
  do candidato destacada, o teto valendo por par, e o **tráfego relayado
  acumulado — aproximado e rotulado como tal**. Ele sai da diferença de
  `bytesSent + bytesReceived` do par vencedor, acumulada só enquanto ele é
  relay: não conta overhead de ICE e pode subcontar se o par trocar. É medição
  com margem declarada, não estimativa inventada.

### Falha clara

O aviso de conexão que não fechou dizia *"Sem servidor TURN, algumas redes
bloqueiam esse caminho"*. Com TURN no ar essa frase virou mentira — e mentira
que aponta para o lado errado, mandando procurar na configuração o que já foi
tentado. Agora ele diz que a pessoa **está na sala** e que não fechou **nem
direta nem por relay**, e manda abrir o diagnóstico.

O motivo fica guardado por par: `icecandidateerror` passou a ser escutado e
traduzido (`iceErrorMeaning`). 401/403 é credencial recusada — que é a diferença
entre "está quebrado do nosso lado" e "a rede dessa pessoa não deixa".

### O teste — `tests/turn.spec.ts`, tag `@externo`

**SE ESTE ARQUIVO FALHAR E O RESTO DA SUÍTE PASSAR, O PROBLEMA É O EXPRESSTURN,
NÃO O CÓDIGO.** Rodar sem ele:

    npx playwright test --grep-invert @externo

É o único teste que depende de serviço de terceiro. Ele existe porque duas abas
na mesma máquina fecham por candidato `host` e nunca encostam no TURN — a suíte
de voz inteira passa com a credencial errada, expirada ou em branco.

**Descoberta ao construí-lo:** forçar relay nos DOIS lados não fecha neste plano
gratuito. Os dois lados **alocam `relay/udp` normalmente** — o que já prova que a
credencial vale e o servidor responde —, mas a checagem de conectividade entre
duas alocações do mesmo servidor nunca passa. Forçando **um lado só**, fecha em
menos de 10 segundos. E um lado só é o cenário REAL: alguém preso atrás de NAT
simétrico falando com alguém que conecta direto. O teste ficou assim.

A falha diz o motivo em vez de expirar em silêncio: lista os candidatos
coletados dos dois lados e os códigos de `icecandidateerror`, e separa
"credencial recusada" de "servidor inalcançável".

**Fora do alcance:** NAT simétrico de verdade. Tudo roda numa máquina só; o
teste prova que o relay ATENDE e RELAIA, não que ele salva uma rede específica.
Isso só dá para confirmar na rede real, com o painel aberto.

## Etapa 10 — separador de data

O pedido tinha quatro itens; **três foram cancelados pelo autor antes de
qualquer implementação** e estão registrados como pendências mais abaixo. Nada
de coleção `presence`, nada de `readState`, nada de heartbeat, nenhuma mudança
nas regras do Firestore.

### O que entrou

Separador entre blocos de dias diferentes: linha fina, rótulo, linha fina. As
linhas são `::before`/`::after` **como filhos flex** — cada uma toma a sobra com
`flex: 1`, então o rótulo fica centrado sozinho em qualquer largura, sem conta
nenhuma e sem `position: absolute`.

Rótulos por `Intl.DateTimeFormat` em pt-BR, sem biblioteca de data: "Hoje",
"Ontem", "5 de janeiro" dentro do ano corrente, "19 de agosto de 2025" fora
dele.

**Duas decisões que valem a pena registrar:**

1. **A comparação é por CHAVE DE DIA local, não por diferença de
   milissegundos.** Subtrair 24h erra no horário de verão e na virada do mês.
   `localDayKey` monta `ano-mês-dia` com os getters locais, então "ontem" é
   ontem de QUEM LÊ — duas pessoas em fusos diferentes veem o separador em
   posições diferentes na mesma conversa, e está certo assim.
2. **Dia novo quebra o bloco de mesmo autor**, mesmo dentro da janela de
   agrupamento de cinco minutos. Sem isso, um bloco atravessando a meia-noite
   ficaria com o separador no meio dele e a mensagem logo abaixo apareceria sem
   nome e sem horário — órfã. Como `isBlockEnd` sai da mesma função, o balão de
   bico acerta sozinho nos dois lados.

O separador do topo não tem caminho próprio: a primeira mensagem carregada abre
dia por definição, e cai no mesmo ramo.

**Relógio errado:** `sentAt` é ISO do cliente (etapa 4). Data inválida devolve a
sentinela `'?'` — e como duas inválidas seguidas dão a mesma chave, elas não
geram separador nenhum em vez de gerarem "Invalid Date" na tela. Data válida mas
errada gera um separador estranho de propósito; corrigir relógio não era desta
etapa.

**Teste:** as mensagens são injetadas pela REST com `sentAt` escolhido
(`writeMessageAt` em tests/helpers.ts) — pela interface o app sempre carimba o
relógio da máquina, e não haveria como produzir uma mensagem do ano passado. O
teste confere a ORDEM, não só os textos: um separador no lugar errado passaria
por uma verificação que só olhasse os rótulos.

## Pendências vindas da etapa 10 (canceladas antes de implementar)

### 1. Presença real — e a conta de cota que a derrubou

Hoje todo mundo aparece como `online` fixo (`lib/firestore.ts`, no mapeamento de
membro). É a informação mais visível do app sendo falsa.

O desenho seria o mesmo do canal de voz — heartbeat + expiração + varredura
local. **Mas a conta de cota mostrou que o gargalo não é a escrita, é a
LEITURA**, e ela cresce ao QUADRADO do número de pessoas: cada heartbeat é um
documento que muda, e todo cliente que escuta paga uma leitura por mudança.

Com N pessoas no grupo, todas com a aba aberta, e heartbeat a cada I segundos:

    leituras/hora = N² × 3600 / I

| intervalo | 10 pessoas ativas | as 50 mil leituras/dia acabam em |
|---|---|---|
| 30s | 12.000 leituras/h | ~4 horas |
| 45s | 8.000 leituras/h | ~6 horas |
| 60s | 6.000 leituras/h | ~8 horas |

A escrita é folgada em qualquer um deles: 10 pessoas × 6h a cada 30s dá 7.200
das 20 mil gravações diárias.

**Se voltarmos a isso, o desenho que eu recomendaria:** 45s com a aba à frente
(janela de 150s) e 5 min com ela escondida, gravando `status: 'ausente'` com uma
janela de expiração maior (12 min) — assim a aba minimizada não some para
offline. E **desligar o listener de presença enquanto a aba está escondida**:
quem não está olhando não precisa de presença ao vivo, e é isso que corta o
multiplicador. Na mistura realista (3 de 10 à frente) dá ~970 leituras/h, e as
50 mil duram 50 horas.

**Avaliar o Realtime Database antes de implementar.** Ele tem `onDisconnect()`
nativo — o servidor marca offline quando a conexão cai, sem heartbeat nenhum. É
exatamente o buraco que o Firestore não cobre e o motivo de toda a aritmética
acima existir. Custa um segundo banco no projeto e um espelhamento para o
Firestore se a presença precisar aparecer em query, mas troca um custo que
cresce ao quadrado por um que não cresce.

### 2. Estado de envio da mensagem

Hoje, se a escrita falhar, ninguém fica sabendo. Faltam: estado "enviando"
discreto com o texto já visível, estado de erro com "tocar para tentar de novo"
e opção de descartar, e a garantia de que a falha **não apaga o que foi
escrito**. Envio otimista — o texto sai do campo na hora.

Vale notar que a limpeza otimista do campo já existe no composer (etapa 4, o
conserto da trava `busy`), então metade do caminho está andada: o que falta é a
mensagem aparecer na lista antes da confirmação e ter para onde voltar se
falhar.

### 3. Mensagens não lidas

Sem indicador de mensagem nova em canal que não estou olhando. O desenho seria
`readState` com id `{uid}_{channelId}`, destaque no canal, ponto na bolinha do
grupo e linha de "novas mensagens" na posição em que parei — **sem contagem**,
porque contar exige ler as mensagens e isso pesa na cota.

**O detalhe que precisa ser resolvido primeiro:** para saber que um canal tem
coisa nova sem ler mensagens, é preciso o horário da última mensagem de cada
canal. A regra de `channels` hoje só deixa o DONO escrever, então isso exige ou
uma regra estreita (membro pode atualizar apenas `lastMessageAt`, com
`affectedKeys().hasOnly`), ou uma coleção `channelActivity` separada, ou um
listener `limit(1)` por canal. Nenhuma das três é óbvia, e a escolha muda o
custo.

## Etapa 9, Entrega 2 — as correções

Feitas na ordem pedida: **direção primeiro, provada, e só depois o contador** —
para não ficar sem saber qual conserto faltou se algo continuasse quebrado.

### 1. Direção: quem responde ADOTA, não pré-cria

Duas saídas estavam na mesa. A (a) — quem responde não pré-cria nada — venceu
**por medição, não por dedução**: a (b) (pré-criar dos dois lados e forçar
`direction` depois) não tinha como funcionar, porque os pré-criados de quem
responde não participam da sessão. O mapa de transceivers mostrou isso direto.

`createPeer` passou a criar as três linhas `m=` **só em quem oferta**. Quem
responde chama `adoptTransceivers` entre o `setRemoteDescription` da oferta e o
`setLocalDescription` da resposta — a única janela em que a direção adotada ainda
sai no SDP —, põe `sendrecv` nas três e move a faixa do microfone para o sender
que de fato está na sessão.

Antes e depois, medido:

| | antes | depois |
|---|---|---|
| quem oferta | `sendonly` | `sendrecv` |
| quem responde | `null` (nunca negociada) | `sendrecv` |
| transceivers de quem responde | 6, sendo 3 soltos | 3, todos com `mid` |

**O microfone ia junto no defeito.** A faixa do microfone de quem responde estava
num transceiver solto — ou seja, quem respondia não mandava nem tela nem VOZ. A
suíte não pegava porque provava que o `<audio>` existia, não que áudio saía.

### 2. Contador de negociação

A resposta passou a levar **o contador local**, não o eco do id da oferta. Cada
documento de sinalização tem um escritor só; ecoar misturava dois espaços de
numeração no mesmo documento, o `appliedNegotiation` de quem oferta empatava com
o contador do outro, e a partir dali toda renegociação vinda dele era descartada
em silêncio.

O `setRemoteDescription ... Called in wrong state: stable` **não voltou a
aparecer** depois disto. Fica como observação, não como certeza: era
intermitente.

### 3. Enquadramento

O `object-fit: contain` já estava certo desde a etapa 7 — **quem estava errado
era a caixa**, e o defeito tinha duas camadas:

1. `height: 100%` encadeado a partir de um item flex sem altura explícita.
   Porcentagem contra `auto` não resolve, então o `<video>` caía no tamanho
   intrínseco e o `overflow: hidden` cortava. O palco virou grid de uma célula.
2. Mesmo com o palco certo, o slot ainda tinha altura indefinida e o vídeo
   dimensionava pela proporção a partir da largura: **666px de largura viravam
   375px de altura numa moldura de 372px**, e os 3px de sobra eram cortados. O
   slot passou a `place-items: stretch`, o que dá altura definida e tira a
   porcentagem do caminho.

A tarja das bordas tem token próprio, `--video-letterbox`, **escuro nos dois
temas**: é moldura de imagem, não superfície de interface.

O teste novo não olha o CSS — compara `videoWidth/videoHeight` com a área
efetivamente pintada, em quatro larguras de janela, com gaveta aberta e fechada
no mobile, e com uma terceira pessoa entrando na sala.

### 4. Qualidade

- `SCREEN_QUALITY` subiu para **1920×1080@60**, tudo em `ideal`: é pedido, não
  exigência — máquina que não dá conta entrega o que der em vez de falhar.
- `degradationPreference: 'maintain-framerate'`, porque para jogo movimento
  suave vale mais que nitidez parada. Ele vence o `maintain-resolution` que o
  `contentHint = 'detail'` induz; os dois convivem e o explícito manda.
- **O teto de banda por conexão virou orçamento total dividido pelos pares.**
  `SCREEN_UPLOAD_BUDGET` = 8 Mbps somando todos: 1 par leva 8, 3 pares levam
  ~2,6 cada. O pico de upload para de crescer junto com a sala. Redividido
  quando alguém entra ou sai — sem isso, a terceira pessoa triplicaria o upload
  e o sintoma seria a voz de todo mundo piorando de uma vez.

### 5. Diagnóstico

Já tinha resolução, fps e kbps nas duas direções, soma do upload e
`qualityLimitationReason`. Ganhou a **direção efetiva por par** (vermelha quando
diverge da pedida), a **contagem de sinal descartado** (sempre visível, mesmo em
zero) e o **mapa dos transceivers** — a linha que resolveu esta etapa.

### Três defeitos de ambiente de teste consertados no caminho

1. **A suíte estourava a memória do Node.** Causa: a 1080p60, o teste capturava
   uma aba do próprio Loft e a prévia da transmissão aparecia dentro da
   transmissão — efeito de túnel. Agora o navegador de teste abre uma aba de
   cenário (`PalcoDeTeste`), barata de codificar, e a captura aponta para ela.
2. **`Ctrl+Alt+V` não reabria o painel.** O guarda olhava a presença do `.diag`
   no documento, e o nó continua lá depois de fechado. Passou a olhar
   `dialog.modal[open]`.
3. **Corrida no `setParameters`.** O rebalanceamento de banda e o anexo da tela
   mexem no mesmo sender; a segunda chamada invalidava o objeto da primeira e o
   navegador recusava. As duas passaram pela fila do par.

## Etapa 9, Entrega 1 — o diagnóstico do compartilhamento de tela

Teste em rede real mostrou que a tela **só funciona num sentido**: em alguns
pares quem recebe não vê nada e nem é avisado. Esta entrega foi **medir**, não
corrigir.

### O que foi medido

Com os dois lados conectados, lendo `currentDirection` do transceiver de vídeo
pelo painel de diagnóstico, o resultado se repetiu em todas as execuções:

| lado | `currentDirection` | pedido |
|---|---|---|
| quem OFERTA (uid menor) | `sendonly` | `sendrecv` |
| quem RESPONDE (uid maior) | **`null`** — nunca negociada | `sendrecv` |

Isso explica o sintoma inteiro:

- quem oferta fica `sendonly`: **manda** vídeo e **não consegue receber**;
- quem responde fica com o transceiver de vídeo **nunca associado a linha `m=`
  nenhuma**. O `replaceTrack` dele devolve sucesso e não sai faixa alguma —
  falha silenciosa, do pior tipo.

**A causa:** o `setRemoteDescription` de quem responde **não casa** os três
transceivers pré-criados com as linhas `m=` da oferta. Ele cria transceivers
implícitos, que nascem sem faixa e por isso respondem `recvonly` — e é esse
`recvonly` que aparece espelhado como `sendonly` do outro lado. **Os
transceivers fixos da etapa 7 não fazem o que o relatório daquela etapa disse
que faziam.**

### Correção de rumo sobre a minha própria leitura

Antes de medir, achei por leitura de código que a trava do `negotiationId`
descartava toda renegociação vinda do lado de uid maior — dois lados usando o
mesmo espaço de contador contra um `appliedNegotiation` só. **A trava existe e o
raciocínio está certo**, mas o painel mostra `sinal descartado = 0` em todos os
cenários: quem responde nem chega a tentar renegociar, porque o transceiver dele
não existe na sessão. **Era bomba armada, não a explosão desta vez** — e foi
desarmada na Entrega 2.

### Um detalhe que enganava a suíte

O teste dos dois compartilhando ao mesmo tempo **passa**, e o motivo é acidental:
`resolveSharingCollision` manda o de uid MAIOR parar, e o de uid maior é
justamente quem responde. Quem sobra é sempre o ofertante — ou seja, a colisão
sempre termina na única direção que funciona. A suíte inteira até aqui testava
essa direção sem saber.

### O que entrou (instrumentação, não correção)

- `PeerDiagnostic` ganhou `videoDirection` (`current` + `desired`) e `ignored`
  (`stale`/`glare`). O painel mostra a direção efetiva por par, em vermelho
  quando diverge da pedida.
- **Sinal descartado agora é NÚMERO no painel, sempre visível — inclusive em
  zero.** Escondido, "está zerado" e "não medi" ficavam iguais na tela.
  `obsoleto` é defeito; `colisão` é o perfect negotiation funcionando, e ficam
  separados para não serem confundidos. Descartar em silêncio foi o que fez esta
  etapa existir.
- Três testes novos: **direção inversa** (lê os dois uids e faz compartilhar
  exatamente quem NÃO oferta — a direção nunca mais é sorteada pelo Firebase),
  **revezamento** (um transmite, para, o outro assume) e **os dois ao mesmo
  tempo**.
- Dois defeitos consertados por atrapalharem a própria medição: `Ctrl+Alt+V`
  **empilhava painéis** (dois modais, dois cronômetros lendo `getStats`) e agora
  alterna, com o DOM decidindo se já está aberto — sinalizador sozinho ficava
  preso em painel que não existia mais; e o `textContent()` sem teto no helper de
  teste, que espera SEM FIM quando a linha não existe (mesma armadilha da etapa
  4).

### Erro no log que ainda não tem explicação

`setRemoteDescription ... Failed to set remote answer sdp: Called in wrong
state: stable` — uma resposta chegando com a conexão já estável. Aparece de vez
em quando nos testes de tela. Fica registrado para a Entrega 2.

### Estado dos testes

Os testes de **direção inversa** e **revezamento** falhavam de forma
determinística nesta entrega — era o esperado, eles existem para provar o
defeito. Ficaram verdes na Entrega 2.

## Defeito conhecido em aberto — vídeo que não chega na negociação inicial

**Medido, não resolvido.** Quem recebe uma transmissão de tela fica com o
`<video>` no palco e **nenhum MediaStream**: o `ontrack` de vídeo nunca dispara
daquele lado.

Frequência medida: rodando o teste sozinho, cerca de **uma vez em quatro**. Sob
a **suíte completa** é pior — na última rodada limpa (sem o limite do Auth
atrapalhar) o teste de pixel falhou nas **três** tentativas seguidas, e o de
quem-entra-no-meio falhou duas e passou na terceira. Ou seja: as tentativas
seguram o de entrar no meio, mas NÃO seguram o de pixel. **A suíte fecha com
esse um vermelho.**

O que a medição mostrou:

- não é lentidão — subir o teto de espera de 60s para **150s** não muda nada,
  então a faixa não está atrasada, ela nunca chega;
- não é a captura — o lado que transmite tem a faixa viva e o painel mostra
  `1280×720 a 20 fps` saindo;
- não é contaminação entre testes — cada teste de tela agora sobe um navegador
  próprio, e ainda acontece.

**Causa provável:** os dois lados criam os três transceivers com
`addTransceiver` (`sendrecv`) na construção, e ambos ficam com "negotiation
needed" ao mesmo tempo. Quando as duas ofertas se cruzam, as linhas `m=` saem
embaralhadas e a de vídeo não fica valendo. O `negotiationArmed` da etapa 6 já
existe para evitar isso e não fecha o caso todo.

**Caminho provável do conserto:** tornar a criação de transceivers assimétrica —
só o lado impolite (que oferta primeiro) cria; o polite reaproveita os que vêm
na oferta, resolvendo os `sender` depois do `setRemoteDescription`. É mexida no
formato do `Peer` e merece etapa própria.

**Onde isso aparece:** o teste `uma aba transmite, a outra recebe vídeo…` está
num `describe` com `retries: 2`, e o comentário lá diz que a repetição é por
causa deste defeito, não por teste frouxo. **É o único teste da suíte que prova
pixel chegando** — os outros dois de tela provam só que o elemento aparece, e
ele aparece pelo roster mesmo sem faixa.

### O que melhorou junto (e ficou)

`maybeNegotiate` passou a ser o único ponto que decide renegociar, com duas
condições que vieram de dois defeitos opostos: reenviar sem olhar o estado
colidia com uma oferta em voo; descartar o pendente perdia a renegociação. Agora
o pendente que não pode sair **fica**, e `onsignalingstatechange` o solta quando
a linha estabiliza.

## Pendências acumuladas

- ~~TURN~~ — **feito na etapa 11.** Restou a limitação da porta 3478 sem TLS na
  443, descrita lá: firewall corporativo muito restritivo continua sem conectar.
- **Câmera.** Botão presente e travado.
- **SFU.** A malha é O(n²); com teto de 4 são no máximo 3 conexões por pessoa.
- **Notificações push** — o PWA instala, mas não notifica.
- **Menu de contexto para link e imagem em mensagem** — dívida da etapa 5, com
  gatilho: quem implementar link clicável ou anexo implementa o menu na mesma
  etapa.
- **Transferir posse de grupo** — dívida da etapa 5.
- **Corrida do teto de 4 na sala de voz** — regra não conta documentos.
- **`.check-indexes.json` é LOCAL, fora do repositório (`.gitignore`), e
  some em qualquer máquina nova ou reinstalação do sistema — e já bloqueou
  `npm run check:indexes` DUAS vezes por isso: na migração para Linux Mint
  (etapa 16/17) e de novo na etapa 18. Não é um arquivo de configuração
  qualquer — sem ele, a única verificação que confirma índice composto
  contra o projeto REAL fica impossível de rodar, e o emulador não avisa
  (ele aceita qualquer consulta, com ou sem índice). Passos para recriar:
  1. `npm run dev` (aponta para o projeto REAL, não o emulador).
  2. Cadastrar uma conta nova pela tela, com um e-mail de verdade que você
     consiga abrir.
  3. Abrir o link de confirmação que chega nesse e-mail — não existe API
     em produção para confirmar por fora, só o link de verdade.
  4. Escrever `.check-indexes.json` na raiz do repositório:
     ```json
     { "email": "...", "password": "...", "displayName": "Índices" }
     ```
  Fica reescrito aqui porque o arquivo em si nunca vai para o git — este
  registro é o único lugar onde o formato sobrevive a uma máquina nova.

  **Cuidado ao rodar `scripts/limpar-projeto-real.mjs --manter=...` de
  novo** (etapa 17): essa conta é uma conta REAL, sem prefixo `loft-e2e-`,
  e o modo `--manter` apaga QUALQUER conta fora da lista de exceção — a
  conta Índices some junto se o e-mail dela não estiver em `--manter` na
  hora de apagar. Foi assim (ou pela varredura mais antiga da etapa 15,
  não dá para saber qual ao certo) que ela sumiu desta vez.
- **`deleteGroupCascade` não apaga `voiceParticipants` nem
  `voiceChannels/{channelId}/signals` — bug de PRODUTO, não só do script de
  limpeza.** Achado na etapa 17, investigando a cascata para adaptar o
  script de limpeza (`scripts/limpar-projeto-real.mjs`) à limpeza por lista
  de exceção. A cascata real (`src/lib/firestore.ts:827`) apaga, em ordem,
  `messages` → `channels` → `invites` → `memberships` → o doc do grupo — e
  para por aí. `voiceParticipants` e `signals` nunca entram. Consequência
  real, não teórica: **toda vez que qualquer dono apaga um grupo pela
  interface normal do app, esses dois tipos de documento ficam para trás,
  e ficam PERMANENTEMENTE inalcançáveis** — as regras de leitura exigem
  `isMember`/`isOwner`, que dependem do grupo e das memberships que
  acabaram de sumir na própria cascata; nem o dono que apagou o grupo
  consegue mais ler ou apagar o que sobrou depois. É assim que os 357
  documentos de `channels` órfãos (groupId de um grupo que já não existe)
  encontrados no projeto real na etapa 17 se acumularam, e o mesmo vai
  continuar acontecendo a cada grupo apagado no futuro, um pouco por vez —
  `messages` órfã da mesma forma quase não sobrevive sozinha para ser vista
  porque quase sempre tem outro motivo próprio para ser apagada (o autor),
  mas `channels` não tem dono nenhum gravado, só o `groupId` que sumiu, e é
  isso que a deixa acumulando sem que nada mais capture. O teste
  `cleanupFirestore` (`tests/helpers.ts`,
  que se autodenomina "a cascata da etapa 5") já cobre `voiceParticipants`
  mas também não cobre `signals` — nem ele é a especificação completa.
  Conserto: acrescentar as duas coleções a `deleteGroupCascade`, na mesma
  ordem-antes-do-grupo que as outras quatro já seguem (mesma razão:
  `voiceParticipants` lê `groupId`/`uid`, e sem membership vira ilegível
  para sempre). O script de limpeza cobrir isso numa faxina manual esconde
  o sintoma daquela vez; não é o conserto do produto.

- **Personalização de FONTE, para a Entrega 3 (configurações)** — hoje a
  Entrega 3 cobre tema e cor; fonte fica de fora, registrado agora como
  opção em aberto, ainda sem escolha feita. Duas abordagens possíveis, com
  o mesmo trade-off dos dois lados:
  - **Lista vinda das fontes já instaladas no sistema** — grátis (nada para
    baixar), mas cada pessoa vê uma lista diferente da de quem programou, e
    o preview de uma fonte específica não é confiável entre máquinas: quem
    escolhe uma fonte que só existe no PRÓPRIO computador manda essa
    escolha para outra pessoa ver com uma fonte diferente (ou a fonte
    padrão), sem aviso.
  - **Embutir 2–3 fontes no próprio site** (`@font-face` ou import) — todo
    mundo vê exatamente igual, mas custa download: peso extra no bundle ou
    no carregamento, e mais um arquivo por variante escolhida.
  - **Fonte pixelada (bitmap/8-bit) é ruim em texto CORRIDO** — legível em
    título ou botão, cansativa num bloco de várias mensagens seguidas.
    Consequência a considerar: talvez a fonte da INTERFACE (botões,
    cabeçalhos, menus) precise ser uma escolha SEPARADA da fonte das
    MENSAGENS, com limites diferentes em cada uma (ex.: pixelada permitida
    na interface, não nas mensagens).

## Fora do alcance dos testes

A qualidade da imagem em uso real e o comportamento com jogo pesado rodando. Os
testes capturam uma tela estática, numa máquina só, sem TURN — nada disso
exercita o caso que interessa, que é jogar e transmitir ao mesmo tempo.

**Também fora do alcance dos testes (etapa 8):** o comportamento em aparelho de
verdade. O Playwright emula viewport e toque, mas não emula teclado de celular,
`safe-area-inset` real, iOS Safari, nem o prompt de instalação do PWA. O toque
longo nos testes é sintético — os eventos são os mesmos que o handler escuta,
mas quem segura o dedo é o teste, não um dedo.

**Isolamento dos testes de tela:** cada um sobe um navegador PRÓPRIO. Com
`workers: 1` o navegador é o mesmo para a suíte inteira, e capturar tela deixava
o processo num estado do qual ele não voltava — o teste seguinte nem abria
conexão de par, e o sintoma era zero elemento de áudio, antes de qualquer vídeo.
A captura também passou a ser de ABA e não do monitor físico, que dorme com a
máquina ociosa e entrega faixa sem quadro nenhum.

**Limite de ambiente — A SUÍTE CONSUMIA A COTA DIÁRIA DO FIRESTORE.**

**RESOLVIDO na etapa 12:** `npm test` roda no emulador e não toca em
produção. O que está descrito abaixo vale para `npm run test:real` e
`npm run check:indexes`, que ainda falam com o projeto de verdade.

Cada execução completa cria ~20 contas e uma centena de documentos, e lê muito
mais do que isso. O plano gratuito dá 50 mil leituras e 20 mil gravações POR
DIA, e rodar a suíte muitas vezes no mesmo dia esgota — foi o que aconteceu em
23/08/2026, depois de umas dez execuções.

O sintoma NÃO é óbvio: os testes falham com mensagens de produto
("o dono deveria ler suas próprias mensagens", "não achei os canais do grupo") e
o `afterAll` da limpeza estoura o tempo. A sonda que resolve a dúvida em dez
segundos:

```
LEITURA (runQuery): 429 {"code":429,"status":"RESOURCE_EXHAUSTED"}
```

Um `429 RESOURCE_EXHAUSTED` numa chamada REST qualquer significa cota, não
código. **E ela reseta à meia-noite do Pacífico, não em minutos** — esperar meia
hora não adianta, ao contrário do throttle do Auth.

**Limite de ambiente:** o Firebase Auth passa a recusar criação de conta pelo
navegador (`auth/too-many-requests`) depois de muitas execuções seguidas da
suíte. Quando isso acontece, os testes falham no cadastro, antes de qualquer
código do produto. Espere alguns minutos e rode de novo.
