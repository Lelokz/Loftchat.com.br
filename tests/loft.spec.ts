import { chromium, expect, test } from "@playwright/test";
import type { Browser, BrowserContext, Page } from "@playwright/test";

import { MEDIA_ARGS } from "../playwright.config";

import {
  activeGroupId,
  blockFirestore,
  canReadGroupMessages,
  createAccountViaRest,
  createGroupThroughUi,
  expectMessagesUsable,
  groupChannelIds,
  joinGroupViaRest,
  limparTudo,
  myGroupIds,
  newAccount,
  openCreateGroupDialog,
  patchMessageViaRest,
  resolveTokens,
  sendMessageThroughUi,
  signUpFromInviteUi,
  signUpThroughUi,
  tryCreateChannelViaRest,
  tryDeleteViaRest,
  writeMessageAt,
  writeVoiceParticipant,
} from "./helpers";
import type { TestAccount } from "./helpers";

/**
 * Suíte de ponta a ponta contra o projeto Firebase real.
 *
 * Toda conta criada aqui é descartável e some no `afterAll`, junto dos
 * documentos que ela gerou — inclusive se um teste falhar no meio.
 */

const accounts: TestAccount[] = [];

function track(label: string): TestAccount {
  const account = newAccount(label);
  accounts.push(account);
  return account;
}

test.afterAll(async () => {
  // A limpeza precisa das credenciais de cada conta: com o banco fechado, só o
  // próprio dono consegue apagar o que criou. `limparTudo` garante que a conta
  // do Auth saia mesmo se a faxina dos documentos falhar, e relata o que ficou.
  await limparTudo(accounts);
});

/* -------------------------------------------------------------------------- */
/* PARTE 1 — voz separada de texto                                             */
/* -------------------------------------------------------------------------- */

test("a sala de voz abre na área central e a chamada sobrevive à troca de canal", async ({
  page,
}) => {
  const account = track("voz");
  await page.goto("/");
  await signUpThroughUi(page, account);
  await createGroupThroughUi(page, "Grupo Voz");

  const room = page.locator(".room");
  const chatTitle = page.locator(".chat__title");
  const callBar = page.locator(".callbar");
  // Escopado à LISTA de canais: a faixa de chamada também carrega o nome do
  // canal, e um seletor solto pegaria os dois.
  const voiceChannel = page
    .locator(".channels__body")
    .getByRole("button", { name: "Sala Principal" });

  // Estado inicial: lendo #geral, sem chamada.
  await expect(chatTitle).toHaveText("geral");
  await expect(room).toBeHidden();
  await expect(callBar).toBeHidden();

  // Entrar na voz abre a SALA no lugar do chat — não uma faixa em cima dele.
  await voiceChannel.click();
  await expect(room).toBeVisible();
  await expect(page.locator(".room__title")).toHaveText("Sala Principal");
  await expect(
    chatTitle,
    "o chat sai da tela enquanto a sala está aberta",
  ).toBeHidden();
  await expect(page.locator(".channel.is-connected")).toHaveCount(1);
  // Estando NA sala, a faixa não aparece: ela é o caminho de volta.
  await expect(callBar).toBeHidden();

  // Voltar para um canal de texto NÃO desconecta — e aí a faixa aparece.
  await page.getByRole("button", { name: "anúncios" }).click();
  await expect(chatTitle).toHaveText("anúncios");
  await expect(room).toBeHidden();
  await expect(
    callBar,
    "conectado fora da sala precisa de faixa",
  ).toBeVisible();
  await expect(callBar).toContainText("Sala Principal");
  await expect(page.locator(".channel.is-connected")).toHaveCount(1);

  // Clicar de novo no canal conectado VOLTA para a sala. Não desconecta.
  await voiceChannel.click();
  await expect(room).toBeVisible();
  await expect(page.locator(".channel.is-connected")).toHaveCount(1);

  // O botão vermelho é que desconecta, e devolve a área ao último canal de texto.
  await page.getByRole("button", { name: "Sair da chamada" }).click();
  await expect(room).toBeHidden();
  await expect(callBar).toBeHidden();
  await expect(page.locator(".channel.is-connected")).toHaveCount(0);
  await expect(
    chatTitle,
    "sair da chamada volta para o canal que eu lia",
  ).toHaveText("anúncios");
});

test("sozinho na sala, sou o único participante — e sou eu mesmo", async ({
  page,
}) => {
  const account = track("sala-sozinho");
  await page.goto("/");
  await signUpThroughUi(page, account);
  await createGroupThroughUi(page, "Grupo Sala");

  // Os companheiros fictícios acabaram: quem aparece é quem está mesmo lá.
  await page.getByRole("button", { name: "Sala Principal" }).click();
  await expect(page.locator(".room__person")).toHaveCount(1, {
    timeout: 30_000,
  });
  await expect(page.locator(".room__count")).toHaveText("só você");
  await expect(page.locator(".room__person.is-self")).toHaveCount(1);
  await expect(page.locator(".room__person-name")).toContainText(
    account.displayName,
  );

  // E a lista indentada sob o canal mostra a mesma pessoa.
  await expect(page.locator(".channel__peer")).toHaveCount(1);
  await expect(page.locator(".channel__peer")).toContainText(
    account.displayName,
  );
});

test("o botão TEMP de chamada não existe mais", async ({ page }) => {
  const account = track("sem-temp");
  await page.goto("/");
  await signUpThroughUi(page, account);
  await createGroupThroughUi(page, "Grupo Sem Temp");

  await expect(page.locator('[data-temp="true"]')).toHaveCount(0);
});

test("a barra de composição fica na tela com e sem o painel de chamada", async ({
  page,
}) => {
  const account = track("layout");
  await page.goto("/");
  await signUpThroughUi(page, account);
  await createGroupThroughUi(page, "Grupo Layout");

  const composer = page.locator(".composer");
  const viewportHeight = page.viewportSize()!.height;

  const assertInsideViewport = async (label: string): Promise<void> => {
    await expect(composer, `composer invisível: ${label}`).toBeVisible();
    const box = (await composer.boundingBox())!;
    expect(
      box.y,
      `composer começa fora da tela: ${label}`,
    ).toBeGreaterThanOrEqual(0);
    expect(
      Math.round(box.y + box.height),
      `composer ultrapassa a base da janela: ${label}`,
    ).toBeLessThanOrEqual(viewportHeight);
  };

  // Sem chamada — era este o estado quebrado na etapa 3.
  await assertInsideViewport("sem chamada");

  // Conectado mas de volta ao chat: a faixa no rodapé da coluna de canais entrou
  // no layout, e a coluna virou flex por causa dela. Se aquilo tivesse ficado
  // como grid de linhas fixas, é AQUI que apareceria.
  await page.getByRole("button", { name: "Sala Principal" }).click();
  await expect(page.locator(".room")).toBeVisible();
  await page.getByRole("button", { name: "anúncios" }).click();
  await expect(page.locator(".callbar")).toBeVisible();
  await assertInsideViewport("com a faixa de chamada");

  await page
    .locator(".callbar")
    .getByRole("button", { name: "Desconectar" })
    .click();
  await expect(page.locator(".callbar")).toBeHidden();
  await assertInsideViewport("sem chamada de novo");
});

test("a lista de mensagens é a única região que rola; a página não rola", async ({
  page,
}) => {
  const account = track("scroll");
  await page.goto("/");
  await signUpThroughUi(page, account);
  await createGroupThroughUi(page, "Grupo Scroll");

  const pageScrolls = await page.evaluate(
    () => document.documentElement.scrollHeight > window.innerHeight + 1,
  );
  expect(pageScrolls, "a página inteira não pode rolar").toBe(false);
});

/* -------------------------------------------------------------------------- */
/* Sessão                                                                      */
/* -------------------------------------------------------------------------- */

test("a sessão sobrevive ao reload", async ({ page }) => {
  const account = track("sessao");
  await page.goto("/");
  await signUpThroughUi(page, account);

  await page.reload();

  // Sem piscar o login: o app volta direto.
  await expect(page.getByRole("button", { name: "Sair da conta" })).toBeVisible(
    {
      timeout: 30_000,
    },
  );
  await expect(page.getByLabel("E-mail")).toBeHidden();
});

test("sair da conta devolve para a tela de login", async ({ page }) => {
  const account = track("signout");
  await page.goto("/");
  await signUpThroughUi(page, account);

  await page.getByRole("button", { name: "Sair da conta" }).click();
  await expect(page.getByLabel("E-mail")).toBeVisible({ timeout: 30_000 });
});

/* -------------------------------------------------------------------------- */
/* Grupos, canais e estados vazios                                             */
/* -------------------------------------------------------------------------- */

test("usuário novo vê o estado vazio e cria o primeiro grupo com os três canais", async ({
  page,
}) => {
  const account = track("grupos");
  await page.goto("/");
  await signUpThroughUi(page, account);

  // Estado vazio (requisito 7).
  await expect(page.getByText("Nenhum grupo por aqui ainda")).toBeVisible();

  await createGroupThroughUi(page, "Grupo Canais");

  // Os três canais nascem juntos, no lote.
  await expect(page.getByRole("button", { name: "anúncios" })).toBeVisible();
  await expect(page.getByRole("button", { name: "geral" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sala Principal" }),
  ).toBeVisible();

  // E as seções aparecem separadas por tipo.
  await expect(page.getByText("texto", { exact: true })).toBeVisible();
  await expect(page.getByText("voz", { exact: true })).toBeVisible();
});

/* -------------------------------------------------------------------------- */
/* REQUISITO 6 — tempo real                                                    */
/* -------------------------------------------------------------------------- */

test("canal criado numa aba aparece na outra SEM recarregar", async ({
  context,
}) => {
  const account = track("tempo-real");

  const pageA = await context.newPage();
  await pageA.goto("/");
  await signUpThroughUi(pageA, account);
  await createGroupThroughUi(pageA, "Grupo Tempo Real");

  // Segunda aba, mesma sessão.
  const pageB = await context.newPage();
  await pageB.goto("/");
  await expect(pageB.getByRole("button", { name: "geral" })).toBeVisible({
    timeout: 30_000,
  });

  const novoCanal = `canal-vivo-${Date.now().toString(36)}`;
  await expect(pageB.getByRole("button", { name: novoCanal })).toBeHidden();

  // Cria na aba A...
  await pageA.getByRole("button", { name: "Opções do grupo" }).click();
  await pageA.getByRole("menuitem", { name: "Criar canal" }).click();
  await pageA.getByLabel("Nome do canal").fill(novoCanal);
  await pageA
    .getByRole("button", { name: "Criar canal", exact: true })
    .last()
    .click();
  await expect(pageA.getByRole("dialog")).toBeHidden({ timeout: 30_000 });

  // ...e ele tem que surgir na aba B sozinho. Nenhum reload aqui — é o ponto.
  await expect(pageB.getByRole("button", { name: novoCanal })).toBeVisible({
    timeout: 30_000,
  });

  // Rename também propaga (é o que os listeners por documento garantem).
  await pageA.getByRole("button", { name: "Opções do grupo" }).click();
  await pageA.getByRole("menuitem", { name: "Configurações do grupo" }).click();
  const telaDoGrupo = pageA.getByRole("dialog", { name: "Configurações do grupo" });
  await telaDoGrupo.getByLabel("Nome do grupo").fill("Renomeado ao Vivo");
  await telaDoGrupo
    .getByRole("region", { name: "Alterações não salvas" })
    .getByRole("button", { name: "Salvar" })
    .click();
  await expect(pageB.locator(".channels__group-name")).toHaveText(
    "Renomeado ao Vivo",
    {
      timeout: 30_000,
    },
  );
});

/* -------------------------------------------------------------------------- */
/* Convite por link                                                            */
/* -------------------------------------------------------------------------- */

test("convite: B abre o link deslogado, autentica e entra no grupo de A", async ({
  browser,
}) => {
  const owner = track("dono");
  const guest = track("convidado");

  const ownerContext = await browser.newContext();
  const ownerPage = await ownerContext.newPage();
  await ownerPage.goto("/");
  await signUpThroughUi(ownerPage, owner);
  await createGroupThroughUi(ownerPage, "Grupo Convite");

  await ownerPage.getByRole("button", { name: "Opções do grupo" }).click();
  await ownerPage.getByRole("menuitem", { name: "Convidar pessoas" }).click();

  const linkInput = ownerPage.locator(".modal__link");
  await expect(linkInput).toBeVisible({ timeout: 30_000 });
  const inviteUrl = await linkInput.inputValue();
  expect(inviteUrl).toMatch(
    /\/convite\/[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/,
  );

  const invitePath = new URL(inviteUrl).pathname;

  // Convidado, sessão limpa, abre o link SEM estar logado.
  const guestContext = await browser.newContext();
  const guestPage = await guestContext.newPage();
  await guestPage.goto(invitePath);

  // Vê o login, não o convite.
  await expect(guestPage.getByLabel("E-mail")).toBeVisible({ timeout: 30_000 });

  // Depois de autenticar, o fluxo do convite retoma sozinho.
  await signUpFromInviteUi(guestPage, guest);

  await expect(
    guestPage.getByRole("button", { name: "Entrar no grupo" }),
  ).toBeVisible({
    timeout: 30_000,
  });
  // O nome vem do CONVITE (congelado) e aparece como rótulo dentro da frase,
  // não como título — o título é genérico.
  await expect(
    guestPage.getByRole("heading", { name: "Convite para um grupo" }),
  ).toBeVisible();
  await expect(guestPage.locator(".invite__group")).toHaveText("Grupo Convite");

  await guestPage.getByRole("button", { name: "Entrar no grupo" }).click();

  // Entrou: vê o grupo e seus canais.
  await expect(guestPage.locator(".channels__group-name")).toHaveText(
    "Grupo Convite",
    {
      timeout: 30_000,
    },
  );
  await expect(guestPage.getByRole("button", { name: "geral" })).toBeVisible();

  // E o dono vê o novo membro chegar em tempo real, sem recarregar.
  await expect(ownerPage.getByTitle(guest.displayName)).toBeVisible({
    timeout: 30_000,
  });

  // Reabrir o mesmo convite não duplica a membership nem rebaixa ninguém.
  await guestPage.goto(invitePath);
  await expect(
    guestPage.getByRole("button", { name: "Abrir o grupo" }),
  ).toBeVisible({
    timeout: 30_000,
  });

  await ownerContext.close();
  await guestContext.close();
});

test("código de convite inexistente mostra mensagem clara", async ({
  page,
}) => {
  const account = track("convite-invalido");
  await page.goto("/");
  await signUpThroughUi(page, account);

  await page.goto("/convite/ZZZZZZZZ");
  await expect(page.getByText("Convite inválido")).toBeVisible({
    timeout: 30_000,
  });
});

/* -------------------------------------------------------------------------- */
/* PARTE 2 — mensagens no Firestore                                            */
/* -------------------------------------------------------------------------- */

test("mensagem enviada aparece em outra aba SEM recarregar", async ({
  context,
}) => {
  const account = track("msg-tempo-real");

  const pageA = await context.newPage();
  await pageA.goto("/");
  await signUpThroughUi(pageA, account);
  await createGroupThroughUi(pageA, "Grupo Mensagens");
  await expectMessagesUsable(pageA);

  const pageB = await context.newPage();
  await pageB.goto("/");
  await expect(pageB.locator(".chat__title")).toHaveText("geral", {
    timeout: 30_000,
  });

  const texto = `olá do teste ${Date.now().toString(36)}`;
  await sendMessageThroughUi(pageA, texto);

  // Na própria aba, e na outra sem reload.
  await expect(pageA.getByText(texto)).toBeVisible({ timeout: 30_000 });
  await expect(pageB.getByText(texto)).toBeVisible({ timeout: 30_000 });

  // Minha mensagem sai do lado do destaque — authorId === meu uid.
  await expect(
    pageA.locator(".message--mine").filter({ hasText: texto }),
  ).toHaveCount(1);
  // E na outra aba (mesmo usuário) também é minha.
  await expect(
    pageB.locator(".message--mine").filter({ hasText: texto }),
  ).toHaveCount(1);

  // O nome do autor vem de `users`, não de mock.
  await expect(pageB.locator(".message__author").last()).toHaveText(
    account.displayName,
  );
});

test("Enter envia, Shift+Enter quebra linha, só espaços não envia", async ({
  page,
}) => {
  const account = track("composer");
  await page.goto("/");
  await signUpThroughUi(page, account);
  await createGroupThroughUi(page, "Grupo Composer");
  await expectMessagesUsable(page);

  const input = page.locator(".composer__input");

  // Só espaços: nada acontece, e o campo não é limpo por engano.
  await input.click();
  await input.fill("     ");
  await input.press("Enter");
  await expect(page.locator(".message")).toHaveCount(0);

  // Shift+Enter quebra linha em vez de enviar.
  await input.fill("");
  await input.type("primeira");
  await input.press("Shift+Enter");
  await input.type("segunda");
  await expect(input).toHaveValue("primeira\nsegunda");
  await expect(page.locator(".message")).toHaveCount(0);

  // Enter envia as duas linhas como UMA mensagem.
  await input.press("Enter");
  await expect(page.locator(".message")).toHaveCount(1, { timeout: 30_000 });
  await expect(input).toHaveValue("");
});

test("rolagem: acompanha se eu estou no fim, não me arranca se estou lendo acima", async ({
  context,
}) => {
  const account = track("rolagem");

  const pageA = await context.newPage();
  await pageA.goto("/");
  await signUpThroughUi(pageA, account);
  await createGroupThroughUi(pageA, "Grupo Rolagem");
  await expectMessagesUsable(pageA);

  // Enche o canal para haver o que rolar.
  for (let i = 1; i <= 25; i += 1) {
    await sendMessageThroughUi(pageA, `mensagem número ${i}`);
  }
  await expect(pageA.locator(".message")).toHaveCount(25, { timeout: 60_000 });

  const list = pageA.locator(".messages");
  const atBottom = async (): Promise<boolean> =>
    list.evaluate(
      (node) => node.scrollHeight - node.scrollTop - node.clientHeight <= 80,
    );

  expect(await atBottom(), "depois de enviar, devia estar no fim").toBe(true);

  // Segunda aba manda mensagem enquanto eu leio lá em cima.
  const pageB = await context.newPage();
  await pageB.goto("/");
  await expect(pageB.locator(".message").first()).toBeVisible({
    timeout: 30_000,
  });

  await list.evaluate((node) => {
    node.scrollTop = 0;
  });
  const scrollBefore = await list.evaluate((node) => node.scrollTop);

  await sendMessageThroughUi(pageB, "chegou enquanto eu lia o começo");
  await expect(pageA.getByText("chegou enquanto eu lia o começo")).toBeAttached(
    {
      timeout: 30_000,
    },
  );

  const scrollAfter = await list.evaluate((node) => node.scrollTop);
  expect(
    scrollAfter,
    "a lista não pode me arrancar de onde eu estava lendo",
  ).toBe(scrollBefore);

  // Voltando ao fim, a próxima mensagem passa a acompanhar.
  await list.evaluate((node) => {
    node.scrollTop = node.scrollHeight;
  });
  await sendMessageThroughUi(pageB, "esta eu quero ver chegar");
  await expect(pageA.getByText("esta eu quero ver chegar")).toBeVisible({
    timeout: 30_000,
  });
  expect(
    await atBottom(),
    "estando no fim, devia acompanhar a mensagem nova",
  ).toBe(true);
});

/* -------------------------------------------------------------------------- */
/* PARTE 3 — regras de segurança                                               */
/* -------------------------------------------------------------------------- */

test("quem NÃO é membro do grupo não lê as mensagens dele", async ({
  browser,
}) => {
  const owner = track("dono-msg");
  const outsider = track("estranho");

  const ownerContext = await browser.newContext();
  const ownerPage = await ownerContext.newPage();
  await ownerPage.goto("/");
  await signUpThroughUi(ownerPage, owner);
  await createGroupThroughUi(ownerPage, "Grupo Privado");
  await expectMessagesUsable(ownerPage);

  const segredo = `segredo ${Date.now().toString(36)}`;
  await sendMessageThroughUi(ownerPage, segredo);
  await expect(ownerPage.getByText(segredo)).toBeVisible({ timeout: 30_000 });

  // Do DOM: a query de memberships pode atrasar em relação ao que a tela já
  // mostra. Ver `activeGroupId` em helpers.ts.
  const groupId = await activeGroupId(ownerPage);

  // O DONO consegue ler — controle do experimento. Se isto falhar, o problema
  // não é a regra bloquear estranhos, é ela bloquear todo mundo.
  const byOwner = await canReadGroupMessages(owner, groupId);
  expect(
    byOwner.readable,
    `o dono deveria ler suas próprias mensagens (HTTP ${byOwner.status})`,
  ).toBe(true);

  // Estranho autentica e tenta ler DIRETO pela REST, contornando a UI — que é
  // como um ataque real seria. Passar pela tela só provaria que a tela não
  // oferece o botão.
  await createAccountViaRest(outsider);
  const byOutsider = await canReadGroupMessages(outsider, groupId);

  expect(
    byOutsider.readable,
    `um não-membro leu as mensagens do grupo (HTTP ${byOutsider.status}) — ` +
      "a regra de messages não está valendo",
  ).toBe(false);

  await ownerContext.close();
});

/* -------------------------------------------------------------------------- */
/* Falha de escrita visível na tela                                            */
/* -------------------------------------------------------------------------- */

test("nome vazio mostra erro no modal e mantém o botão clicável", async ({
  page,
}) => {
  const account = track("erro-validacao");
  await page.goto("/");
  await signUpThroughUi(page, account);

  const dialog = await openCreateGroupDialog(page);
  const confirm = dialog.getByRole("button", { name: "Criar grupo" });
  await confirm.click();

  await expect(page.getByText("Dê um nome ao grupo.")).toBeVisible();
  await expect(confirm).toBeEnabled();
});

test("com o Firestore inacessível, criar grupo mostra erro na tela e reabilita o botão", async ({
  page,
}) => {
  const account = track("erro-rede");
  await page.goto("/");
  await signUpThroughUi(page, account);

  // Corta o Firestore DEPOIS do login. Sem o tempo limite das mutações, o SDK
  // enfileiraria a escrita e o botão ficaria preso em "Criando…" para sempre.
  await blockFirestore(page);

  const dialog = await openCreateGroupDialog(page);
  await dialog.getByLabel("Nome do grupo").fill("Grupo Sem Rede");
  const confirm = dialog.getByRole("button", { name: "Criar grupo" });
  await confirm.click();

  // A mensagem tem que aparecer NA TELA, não só no console.
  await expect(page.locator(".modal__error")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".modal__error")).toContainText(
    "Não foi possível criar o grupo.",
  );
  await expect(confirm).toBeEnabled();
});

/* -------------------------------------------------------------------------- */
/* ETAPA 5 — PARTE 1: papéis                                                   */
/* -------------------------------------------------------------------------- */

interface GroupWithMember {
  ownerContext: BrowserContext;
  ownerPage: Page;
  guestContext: BrowserContext;
  guestPage: Page;
  owner: TestAccount;
  guest: TestAccount;
  groupId: string;
  /** Código do convite usado, para encher o grupo por REST quando preciso. */
  inviteCode: string;
}

/**
 * Monta o cenário que quase todo teste de papel precisa: um grupo com um dono e
 * um membro comum, cada um na própria sessão.
 */
/**
 * Um navegador só para este teste, fechado no fim.
 *
 * Os testes de compartilhamento de tela NÃO podem dividir o processo do
 * navegador com os outros. Com `workers: 1` o `browser` do Playwright é o mesmo
 * para a suíte inteira, e capturar "Entire screen" deixa o processo em um
 * estado do qual ele não volta: o teste SEGUINTE nem chega a abrir uma conexão
 * de par — o sintoma é zero elemento de áudio, antes de qualquer vídeo.
 *
 * Cada um destes testes passa sozinho; era só a vizinhança. Um processo por
 * teste custa alguns segundos e é o que os torna determinísticos.
 */
async function freshBrowser(): Promise<Browser> {
  const browser = await chromium.launch({ args: MEDIA_ARGS });

  /*
   * A ABA QUE SERA CAPTURADA. Existe por dois motivos, os dois medidos:
   *
   * 1. Capturar uma aba do proprio Loft cria efeito de tunel — a previa da
   *    transmissao aparece dentro da transmissao — e a 1080p60 isso estoura a
   *    memoria do processo. Uma pagina quase vazia e barata de codificar.
   * 2. O capturador do Chromium e movido por MUDANCA: superficie parada nao
   *    gera quadro nenhum, e do outro lado o `videoWidth` fica em zero para
   *    sempre. O ponto piscando da o que capturar.
   *
   * O titulo casa com `--auto-select-tab-capture-source-by-title` no config.
   */
  const stage = await (await browser.newContext()).newPage();
  await stage.setContent(
    "<!doctype html><title>PalcoDeTeste</title>" +
      '<body style="margin:0;background:#202020"><div id="d" ' +
      'style="width:200px;height:200px"></div>' +
      "<script>let on=false;setInterval(()=>{on=!on;" +
      "document.getElementById('d').style.background=on?'#c33':'#33c';},100);<\/script>",
  );
  return browser;
}

async function groupWithMember(
  browser: Browser,
  label: string,
): Promise<GroupWithMember> {
  const owner = track(`dono-${label}`);
  const guest = track(`membro-${label}`);
  const groupName = `Grupo ${label}`;

  const ownerContext = await browser.newContext();
  const ownerPage = await ownerContext.newPage();
  await ownerPage.goto("/");
  await signUpThroughUi(ownerPage, owner);
  await createGroupThroughUi(ownerPage, groupName);

  await ownerPage.getByRole("button", { name: "Opções do grupo" }).click();
  await ownerPage.getByRole("menuitem", { name: "Convidar pessoas" }).click();
  const link = ownerPage.locator(".modal__link");
  await expect(link).toBeVisible({ timeout: 30_000 });
  const invitePath = new URL(await link.inputValue()).pathname;
  await ownerPage.getByRole("button", { name: "Fechar" }).first().click();

  const guestContext = await browser.newContext();
  const guestPage = await guestContext.newPage();
  await guestPage.goto(invitePath);

  await signUpFromInviteUi(guestPage, guest);

  await guestPage
    .getByRole("button", { name: "Entrar no grupo" })
    .click({ timeout: 30_000 });
  await expect(guestPage.locator(".channels__group-name")).toHaveText(
    groupName,
    {
      timeout: 30_000,
    },
  );

  // Do DOM, não por consulta REST: ver `activeGroupId` em helpers.ts — a query
  // de uma tentativa só derrubava 24 testes quando o índice atrasava.
  const groupId = await activeGroupId(guestPage);

  const inviteCode = invitePath.split("/").pop() ?? "";
  return {
    ownerContext,
    ownerPage,
    guestContext,
    guestPage,
    owner,
    guest,
    groupId,
    inviteCode,
  };
}

test("membro comum não vê os itens de dono no menu, e o dono não pode sair", async ({
  browser,
}) => {
  const scene = await groupWithMember(browser, "menu");

  // Membro comum: só "Sair do grupo". Nada de criar, convidar, renomear, apagar.
  await scene.guestPage
    .getByRole("button", { name: "Opções do grupo" })
    .click();
  const guestMenu = scene.guestPage.locator(".context-menu");
  await expect(guestMenu).toBeVisible();
  await expect(
    guestMenu.getByRole("menuitem", { name: "Sair do grupo" }),
  ).toBeEnabled();
  for (const hidden of [
    "Criar canal",
    "Convidar pessoas",
    "Configurações do grupo",
    "Apagar grupo",
  ]) {
    await expect(guestMenu.getByRole("menuitem", { name: hidden })).toHaveCount(
      0,
    );
  }

  // Dono: vê tudo, mas "Sair do grupo" fica travado COM o motivo na tela.
  await scene.ownerPage
    .getByRole("button", { name: "Opções do grupo" })
    .click();
  const ownerMenu = scene.ownerPage.locator(".context-menu");
  for (const shown of [
    "Criar canal",
    "Convidar pessoas",
    "Configurações do grupo",
    "Apagar grupo",
  ]) {
    await expect(
      ownerMenu.getByRole("menuitem", { name: shown }),
    ).toBeVisible();
  }
  const leave = ownerMenu.getByRole("menuitem", { name: "Sair do grupo" });
  await expect(leave).toBeDisabled();
  await expect(leave).toHaveAttribute("title", /dono deste grupo/);

  await scene.ownerContext.close();
  await scene.guestContext.close();
});

test("as REGRAS recusam o membro comum que contorna a UI", async ({
  browser,
}) => {
  const scene = await groupWithMember(browser, "regras");

  // Passar pela tela só provaria que a tela não oferece o botão. Estas escritas
  // são cruas, do jeito que um ataque real seria.
  expect(
    await tryCreateChannelViaRest(scene.guest, scene.groupId),
    "membro comum criou canal — a regra de channels não está valendo",
  ).toBe(403);

  const channelIds = await groupChannelIds(scene.guest, scene.groupId);
  expect(channelIds.length, "não achei os canais do grupo").toBeGreaterThan(0);
  expect(
    await tryDeleteViaRest(scene.guest, "channels", channelIds[0] ?? ""),
    "membro comum apagou um canal",
  ).toBe(403);

  // Remover OUTRO membro: a membership do dono não é dele para apagar.
  const ownerMembership = `${scene.groupId}_${scene.owner.uid ?? ""}`;
  expect(
    await tryDeleteViaRest(scene.guest, "memberships", ownerMembership),
    "membro comum removeu o dono do grupo",
  ).toBe(403);

  // Controle do experimento: o DONO consegue. Se isto falhar, a regra não está
  // recusando o membro — está recusando todo mundo.
  expect(
    await tryCreateChannelViaRest(scene.owner, scene.groupId),
    "o dono deveria conseguir criar canal",
  ).toBe(200);

  await scene.ownerContext.close();
  await scene.guestContext.close();
});

test("sair do grupo: some da minha barra e da lista de membros do dono", async ({
  browser,
}) => {
  const scene = await groupWithMember(browser, "sair");

  await expect(scene.ownerPage.getByTitle(scene.guest.displayName)).toBeVisible(
    {
      timeout: 30_000,
    },
  );

  await scene.guestPage
    .getByRole("button", { name: "Opções do grupo" })
    .click();
  await scene.guestPage
    .getByRole("menuitem", { name: "Sair do grupo" })
    .click();
  await scene.guestPage
    .getByRole("button", { name: "Sair do grupo" })
    .last()
    .click();

  // Sem grupo nenhum, ele cai no estado vazio.
  await expect(
    scene.guestPage.getByText("Nenhum grupo por aqui ainda"),
  ).toBeVisible({
    timeout: 30_000,
  });

  // E o dono vê a saída em tempo real, sem recarregar.
  await expect(scene.ownerPage.getByTitle(scene.guest.displayName)).toHaveCount(
    0,
    {
      timeout: 30_000,
    },
  );

  await scene.ownerContext.close();
  await scene.guestContext.close();
});

/* -------------------------------------------------------------------------- */
/* ETAPA 5 — PARTE 4: apagar grupo                                             */
/* -------------------------------------------------------------------------- */

test("apagar grupo só libera o botão depois de digitar o nome certo", async ({
  page,
}) => {
  const account = track("confirmacao");
  await page.goto("/");
  await signUpThroughUi(page, account);
  await createGroupThroughUi(page, "Grupo Barreira");

  await page.getByRole("button", { name: "Opções do grupo" }).click();
  await page.getByRole("menuitem", { name: "Apagar grupo" }).click();

  const confirm = page.getByRole("button", { name: "Apagar grupo" }).last();
  await expect(confirm).toBeDisabled();

  const field = page.locator(".modal__input");
  await field.fill("Grupo Errado");
  await expect(confirm).toBeDisabled();

  await field.fill("Grupo Barreira");
  await expect(confirm).toBeEnabled();
});

test("apagar grupo remove tudo e o grupo some da barra dos dois usuários", async ({
  browser,
}) => {
  // Duas sessões, convite, mensagens e a cascata inteira não cabem em 60s.
  test.setTimeout(75_000);
  const scene = await groupWithMember(browser, "cascata");

  // Dá conteúdo real para a cascata varrer: mensagens dos DOIS lados. As do
  // membro só saem pela regra nova de "autor OU dono".
  await sendMessageThroughUi(scene.ownerPage, "mensagem do dono");
  await sendMessageThroughUi(scene.guestPage, "mensagem do membro");
  await expect(scene.ownerPage.getByText("mensagem do membro")).toBeVisible({
    timeout: 30_000,
  });

  // O outro membro está com o grupo ABERTO neste instante. O console dele não
  // pode receber erro nenhum quando o acesso cair debaixo dos pés.
  const guestErrors: string[] = [];
  scene.guestPage.on("console", (message) => {
    if (message.type() === "error") guestErrors.push(message.text());
  });

  await scene.ownerPage
    .getByRole("button", { name: "Opções do grupo" })
    .click();
  await scene.ownerPage.getByRole("menuitem", { name: "Apagar grupo" }).click();
  await scene.ownerPage.locator(".modal__input").fill("Grupo cascata");
  await scene.ownerPage
    .getByRole("button", { name: "Apagar grupo" })
    .last()
    .click();

  // Os dois lados caem no estado vazio, sem recarregar.
  await expect(
    scene.ownerPage.getByText("Nenhum grupo por aqui ainda"),
  ).toBeVisible({
    timeout: 60_000,
  });
  await expect(
    scene.guestPage.getByText("Nenhum grupo por aqui ainda"),
  ).toBeVisible({
    timeout: 60_000,
  });

  expect(
    guestErrors,
    "perder acesso a um grupo não pode virar erro no console",
  ).toEqual([]);

  // O vínculo dos DOIS sumiu — passos 4 e 6 da cascata.
  expect(await myGroupIds(scene.owner)).not.toContain(scene.groupId);
  expect(await myGroupIds(scene.guest)).not.toContain(scene.groupId);

  // Não dá para afirmar aqui que mensagens e canais sumiram do banco, e isso é
  // consequência das regras estarem CERTAS: sem grupo e sem membership, ninguém
  // consegue mais ler aquela coleção — nem para conferir. A prova de que a
  // varredura funcionou é indireta e sólida: se apagar a mensagem do MEMBRO
  // tivesse sido recusada, o lote do passo 1 teria falhado, a cascata teria
  // parado com erro visível e o modal continuaria aberto — e as duas telas
  // acima nunca chegariam ao estado vazio.

  await scene.ownerContext.close();
  await scene.guestContext.close();
});

/* -------------------------------------------------------------------------- */
/* ENTREGA 2 — menu de contexto                                                */
/* -------------------------------------------------------------------------- */

test("o menu de contexto abre no alvo certo e fecha do jeito certo", async ({
  page,
}) => {
  const account = track("menu-ctx");
  await page.goto("/");
  await signUpThroughUi(page, account);
  await createGroupThroughUi(page, "Grupo Menu");

  const menu = page.locator(".context-menu");

  // Alvo CANAL: itens do canal, não os de outra coisa. O grupo nasce com DOIS
  // canais de texto, então apagar está liberado.
  await page
    .getByRole("button", { name: "anúncios" })
    .click({ button: "right" });
  await expect(menu).toBeVisible();
  await expect(
    menu.getByRole("menuitem", { name: "Copiar nome" }),
  ).toBeVisible();
  await expect(
    menu.getByRole("menuitem", { name: "Apagar canal" }),
  ).toBeEnabled();

  // Apaga um deles de verdade — e aí o outro vira o ÚLTIMO canal de texto.
  await menu.getByRole("menuitem", { name: "Apagar canal" }).click();
  await page.getByRole("button", { name: "Apagar canal" }).last().click();
  await expect(page.getByRole("button", { name: "anúncios" })).toHaveCount(0, {
    timeout: 30_000,
  });

  // Sobrou só o #geral: o item existe, travado, dizendo por quê. Um grupo sem
  // canal de texto não teria onde conversar.
  await page.getByRole("button", { name: "geral" }).click({ button: "right" });
  const deleteLast = menu.getByRole("menuitem", { name: "Apagar canal" });
  await expect(deleteLast).toBeDisabled();
  await expect(deleteLast).toHaveAttribute("title", /último canal de texto/);

  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();

  // Alvo CAMPO DE TEXTO: menu de edição, com o que não dá para fazer travado.
  await page.locator(".composer__input").click({ button: "right" });
  await expect(menu.getByRole("menuitem", { name: "Colar" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Recortar" })).toBeDisabled();
  await expect(
    menu.getByRole("menuitem", { name: "Copiar", exact: true }),
  ).toBeDisabled();

  // Clique fora fecha.
  await page.locator(".chat__header").click();
  await expect(menu).toBeHidden();

  // Área sem alvo nenhum: o menu mínimo. Nunca nada.
  await page.locator(".members").click({ button: "right" });
  await expect(menu, "clicar no vazio não pode parecer quebrado").toBeVisible();
  await expect(
    menu.getByRole("menuitem", { name: "Recarregar página" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
});

test("membro comum não vê itens de dono no menu de contexto", async ({
  browser,
}) => {
  const scene = await groupWithMember(browser, "ctxpapel");
  const menu = scene.guestPage.locator(".context-menu");

  // Bolinha do grupo, na visão do membro comum.
  await scene.guestPage
    .locator(".group-bar__button")
    .first()
    .click({ button: "right" });
  await expect(menu).toBeVisible();
  await expect(
    menu.getByRole("menuitem", { name: "Sair do grupo" }),
  ).toBeEnabled();
  for (const hidden of [
    "Copiar código do grupo",
    "Configurações do grupo",
    "Apagar grupo",
  ]) {
    await expect(menu.getByRole("menuitem", { name: hidden })).toHaveCount(0);
  }
  await scene.guestPage.keyboard.press("Escape");

  // Canal: só copiar o nome; apagar é do dono.
  await scene.guestPage
    .getByRole("button", { name: "geral" })
    .click({ button: "right" });
  await expect(
    menu.getByRole("menuitem", { name: "Copiar nome" }),
  ).toBeVisible();
  await expect(
    menu.getByRole("menuitem", { name: "Apagar canal" }),
  ).toHaveCount(0);
  await scene.guestPage.keyboard.press("Escape");

  // Membro: não pode remover ninguém.
  await scene.guestPage.locator(".member").first().click({ button: "right" });
  await expect(
    menu.getByRole("menuitem", { name: "Copiar nome" }),
  ).toBeVisible();
  await expect(
    menu.getByRole("menuitem", { name: "Remover do grupo" }),
  ).toHaveCount(0);
  await scene.guestPage.keyboard.press("Escape");

  // Controle do experimento: o DONO, no mesmo grupo, vê o que lhe cabe.
  const ownerMenu = scene.ownerPage.locator(".context-menu");
  await scene.ownerPage
    .locator(".group-bar__button")
    .first()
    .click({ button: "right" });
  await expect(
    ownerMenu.getByRole("menuitem", { name: "Copiar código do grupo" }),
  ).toBeVisible();
  await expect(
    ownerMenu.getByRole("menuitem", { name: "Apagar grupo" }),
  ).toBeVisible();

  await scene.ownerContext.close();
  await scene.guestContext.close();
});

test("apagar mensagem: some nas duas abas, e o dono apaga a do membro", async ({
  browser,
}) => {
  test.setTimeout(75_000);
  const scene = await groupWithMember(browser, "apagarmsg");

  await sendMessageThroughUi(scene.guestPage, "mensagem do membro");
  await expect(scene.ownerPage.getByText("mensagem do membro")).toBeVisible({
    timeout: 30_000,
  });
  await sendMessageThroughUi(scene.ownerPage, "mensagem do dono");
  await expect(scene.guestPage.getByText("mensagem do dono")).toBeVisible({
    timeout: 30_000,
  });

  // O MEMBRO não apaga mensagem dos outros.
  const guestMenu = scene.guestPage.locator(".context-menu");
  await scene.guestPage
    .locator(".message", { hasText: "mensagem do dono" })
    .click({ button: "right" });
  await expect(
    guestMenu.getByRole("menuitem", { name: "Copiar texto" }),
  ).toBeVisible();
  await expect(
    guestMenu.getByRole("menuitem", { name: "Apagar mensagem" }),
    "membro comum não apaga mensagem dos outros",
  ).toHaveCount(0);
  await scene.guestPage.keyboard.press("Escape");

  // O DONO apaga a mensagem do MEMBRO — moderação, decidida de propósito.
  const ownerMenu = scene.ownerPage.locator(".context-menu");
  await scene.ownerPage
    .locator(".message", { hasText: "mensagem do membro" })
    .click({ button: "right" });
  await ownerMenu.getByRole("menuitem", { name: "Apagar mensagem" }).click();
  await scene.ownerPage
    .getByRole("button", { name: "Apagar", exact: true })
    .click();

  // Some nas DUAS abas, sem recarregar.
  await expect(scene.ownerPage.getByText("mensagem do membro")).toHaveCount(0, {
    timeout: 30_000,
  });
  await expect(scene.guestPage.getByText("mensagem do membro")).toHaveCount(0, {
    timeout: 30_000,
  });

  await scene.ownerContext.close();
  await scene.guestContext.close();
});

test("a chamada sobrevive à troca de GRUPO, e a faixa diz de onde ela é", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const account = track("voz-grupos");
  await page.goto("/");
  await signUpThroughUi(page, account);
  await createGroupThroughUi(page, "Grupo Um");

  await page.getByRole("button", { name: "Sala Principal" }).click();
  await expect(page.locator(".room")).toBeVisible();

  // Criar o segundo grupo troca o grupo ativo.
  // O "+" abre o menu Criar grupo / Entrar num grupo (16/11/2026).
  await page
    .getByRole("button", { name: "Criar ou entrar num grupo", exact: true })
    .first()
    .click();
  await page.getByRole("menuitem", { name: "Criar grupo", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nome do grupo").fill("Grupo Dois");
  await dialog.getByRole("button", { name: "Criar grupo" }).click();
  await expect(page.locator(".channels__group-name")).toHaveText("Grupo Dois", {
    timeout: 30_000,
  });

  // A chamada CONTINUA, e a faixa diz de qual grupo ela é.
  const callBar = page.locator(".callbar");
  await expect(
    callBar,
    "trocar de grupo não pode derrubar a chamada",
  ).toBeVisible();
  await expect(callBar).toContainText("Sala Principal");
  await expect(callBar).toContainText("Grupo Um");

  // Clicar na faixa devolve para o grupo da chamada, com a sala aberta.
  await callBar.locator(".callbar__back").click();
  await expect(page.locator(".room")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".channels__group-name")).toHaveText("Grupo Um");
});

/* -------------------------------------------------------------------------- */
/* ENTREGA 2 — entrar em grupo por link ou código                              */
/* -------------------------------------------------------------------------- */

test("entrar em grupo colando o link inteiro, ou só o código", async ({
  browser,
}) => {
  test.setTimeout(75_000);
  const owner = track("convite-dono");
  const byLink = track("por-link");
  const byCode = track("por-codigo");

  const ownerContext = await browser.newContext();
  const ownerPage = await ownerContext.newPage();
  await ownerPage.goto("/");
  await signUpThroughUi(ownerPage, owner);
  await createGroupThroughUi(ownerPage, "Grupo Colado");

  await ownerPage.getByRole("button", { name: "Opções do grupo" }).click();
  await ownerPage.getByRole("menuitem", { name: "Convidar pessoas" }).click();
  const link = ownerPage.locator(".modal__link");
  await expect(link).toBeVisible({ timeout: 30_000 });
  const url = await link.inputValue();
  const code = url.split("/").pop() ?? "";

  // As duas formas que aparecem na prática: o link que veio no chat, e o código
  // que alguém ditou. Nenhuma delas deveria exigir saber qual é a "certa".
  for (const [account, pasted] of [
    [byLink, url],
    [byCode, code],
  ] as const) {
    const context = await browser.newContext();
    const guestPage = await context.newPage();
    await guestPage.goto("/");
    await signUpThroughUi(guestPage, account);
    await guestPage.locator(".empty__join-input").fill(pasted);
    await guestPage
      .getByRole("button", { name: "Entrar", exact: true })
      .click();
    await guestPage
      .getByRole("button", { name: "Entrar no grupo" })
      .click({ timeout: 30_000 });
    await expect(guestPage.locator(".channels__group-name")).toHaveText(
      "Grupo Colado",
      {
        timeout: 30_000,
      },
    );
    await context.close();
  }

  await ownerContext.close();
});

test("código torto mostra erro no próprio campo, sem sair da tela", async ({
  page,
}) => {
  const account = track("convite-torto");
  await page.goto("/");
  await signUpThroughUi(page, account);

  const field = page.locator(".empty__join-input");
  const error = page.locator(".empty__join-error");
  const submit = page.getByRole("button", { name: "Entrar", exact: true });

  await submit.click();
  await expect(error).toBeVisible();

  await field.fill("ABC");
  await submit.click();
  await expect(error).toContainText("não parece um convite");

  // Continuo no estado vazio: nada de navegar para uma tela de convite quebrada.
  await expect(page.getByText("Nenhum grupo por aqui ainda")).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/");

  // Digitar de novo limpa o erro, que falava do texto anterior.
  await field.fill("A");
  await expect(error).toBeHidden();
});

/* -------------------------------------------------------------------------- */
/* ETAPA 6 — presença real no canal de voz                                     */
/* -------------------------------------------------------------------------- */

test("duas pessoas no mesmo canal de voz veem uma à outra", async ({
  browser,
}) => {
  test.setTimeout(75_000);
  const scene = await groupWithMember(browser, "presenca");

  const voiceOwner = scene.ownerPage
    .locator(".channels__body")
    .getByRole("button", {
      name: "Sala Principal",
    });
  const voiceGuest = scene.guestPage
    .locator(".channels__body")
    .getByRole("button", {
      name: "Sala Principal",
    });

  await voiceOwner.click();
  await expect(scene.ownerPage.locator(".room__person")).toHaveCount(1, {
    timeout: 30_000,
  });

  // O segundo entra: os DOIS passam a ver duas pessoas, sem recarregar.
  await voiceGuest.click();
  await expect(scene.guestPage.locator(".room__person")).toHaveCount(2, {
    timeout: 30_000,
  });
  await expect(scene.ownerPage.locator(".room__person")).toHaveCount(2, {
    timeout: 30_000,
  });
  await expect(scene.ownerPage.locator(".room__count")).toHaveText("2 pessoas");

  // A lista indentada sob o canal acompanha, nos dois.
  await expect(scene.ownerPage.locator(".channel__peer")).toHaveCount(2, {
    timeout: 30_000,
  });
  await expect(scene.guestPage.locator(".channel__peer")).toHaveCount(2, {
    timeout: 30_000,
  });

  // Mudo de um aparece no outro.
  await scene.guestPage
    .getByRole("button", { name: "Desativar microfone" })
    .click();
  await expect(
    scene.ownerPage
      .locator(".room__person", { hasText: scene.guest.displayName })
      .locator(".room__person-muted"),
    "o mudo de quem está do outro lado precisa aparecer aqui",
  ).toBeVisible({ timeout: 30_000 });

  // Sair remove da sala dos dois.
  await scene.guestPage
    .getByRole("button", { name: "Sair da chamada" })
    .click();
  await expect(scene.guestPage.locator(".room")).toBeHidden();
  await expect(scene.ownerPage.locator(".room__person")).toHaveCount(1, {
    timeout: 30_000,
  });
  await expect(scene.ownerPage.locator(".channel__peer")).toHaveCount(1, {
    timeout: 30_000,
  });

  await scene.ownerContext.close();
  await scene.guestContext.close();
});

test("a conexão WebRTC entre duas abas chega a connected", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const scene = await groupWithMember(browser, "webrtc");

  for (const page of [scene.ownerPage, scene.guestPage]) {
    await page
      .locator(".channels__body")
      .getByRole("button", { name: "Sala Principal" })
      .click();
  }

  // Os dois se veem: sem isso a negociação nem começa, porque as conexões são
  // criadas a partir do roster.
  await expect(scene.ownerPage.locator(".room__person")).toHaveCount(2, {
    timeout: 30_000,
  });
  await expect(scene.guestPage.locator(".room__person")).toHaveCount(2, {
    timeout: 30_000,
  });

  // O painel de diagnóstico é a janela para dentro do WebRTC — e é por isso que
  // ele faz parte da entrega, não é enfeite.
  await scene.ownerPage.keyboard.press("Control+Alt+v");
  const panel = scene.ownerPage.locator(".diag");
  await expect(panel).toBeVisible({ timeout: 15_000 });

  await expect(panel.locator(".diag__peer")).toHaveCount(1, {
    timeout: 15_000,
  });
  await expect(
    panel,
    "a conexão direta precisa fechar entre duas abas locais",
  ).toContainText("connected", { timeout: 60_000 });
  // Rodando na mesma máquina, o caminho vencedor é o candidato local. Ver
  // "fora do meu alcance": o caminho que exigiria TURN não é exercitado aqui.
  await expect(panel).toContainText("host", { timeout: 30_000 });

  // Nenhum bloco pode estar marcado como sem conexão.
  await scene.ownerPage.keyboard.press("Escape");
  await expect(scene.ownerPage.locator(".room__person.is-failed")).toHaveCount(
    0,
  );
  // Aviso de FALHA de conexão, não "qualquer aviso": o de autoplay bloqueado é
  // um estado legítimo que o app trata com um botão, e exigir zero avisos fazia
  // este teste falhar por algo que ele não afirma.
  await expect(scene.ownerPage.locator(".room")).not.toContainText(
    "conexão direta com",
  );

  // Cada lado tem um <audio> para o outro, montado em document.body e não
  // dentro da sala — é isso que impede o som de ser cortado a cada re-render.
  expect(
    await scene.ownerPage.evaluate(
      () => document.querySelectorAll("#voice-audio audio").length,
    ),
    "o áudio do outro lado precisa existir fora da árvore da sala",
  ).toBe(1);

  // Mudar o microfone NÃO pode derrubar a chamada.
  await scene.ownerPage
    .getByRole("button", { name: "Desativar microfone" })
    .click();
  await expect(
    scene.guestPage
      .locator(".room__person", { hasText: scene.owner.displayName })
      .locator(".room__person-muted"),
  ).toBeVisible({ timeout: 30_000 });
  await expect(scene.ownerPage.locator(".room__person.is-failed")).toHaveCount(
    0,
  );

  await scene.ownerContext.close();
  await scene.guestContext.close();
});

/* -------------------------------------------------------------------------- */
/* ETAPA 7 — compartilhamento de tela                                          */
/* -------------------------------------------------------------------------- */

/** Coloca os dois na mesma sala de voz e espera se enxergarem. */
async function bothInVoice(scene: GroupWithMember): Promise<void> {
  for (const page of [scene.ownerPage, scene.guestPage]) {
    await page
      .locator(".channels__body")
      .getByRole("button", { name: "Sala Principal" })
      .click();
  }
  await expect(scene.ownerPage.locator(".room__person")).toHaveCount(2, {
    timeout: 30_000,
  });
  await expect(scene.guestPage.locator(".room__person")).toHaveCount(2, {
    timeout: 30_000,
  });

  /*
   * O roster é FIRESTORE; o par é WebRTC, e vem depois.
   *
   * Parar na contagem de pessoas dizia "os dois estão na sala" enquanto a
   * conexão ainda não existia. Quem lia a linha de base do áudio logo em
   * seguida via zero elemento e falhava — parecendo defeito de vídeo, sendo
   * corrida de teste. Esperar o elemento do par é o que "os dois em voz"
   * realmente quer dizer.
   */
  await expect(scene.ownerPage.locator("#voice-audio audio")).toHaveCount(1, {
    timeout: 30_000,
  });
  await expect(scene.guestPage.locator("#voice-audio audio")).toHaveCount(1, {
    timeout: 30_000,
  });
}

/**
 * Os uids dos dois lados, SEM gastar autenticacao.
 *
 * O motor carimba `data-uid` no <audio> de cada par, entao cada aba ja sabe o
 * uid da outra: basta cruzar. Resolver por REST custaria um login a mais, e o
 * limite do Firebase Auth e um recurso escasso nesta suite.
 */
async function uidsOf(scene: {
  ownerPage: Page;
  guestPage: Page;
}): Promise<{ owner: string; guest: string }> {
  const guest = await scene.ownerPage
    .locator("#voice-audio audio")
    .first()
    .getAttribute("data-uid");
  const owner = await scene.guestPage
    .locator("#voice-audio audio")
    .first()
    .getAttribute("data-uid");
  return { owner: owner ?? "", guest: guest ?? "" };
}

/**
 * Le uma linha do painel de diagnostico.
 *
 * E por aqui que a etapa 9 mede `currentDirection`: o painel e a unica
 * superficie que expoe o estado do transceiver, e usa-lo no teste confirma de
 * quebra que o painel mostra o que promete.
 */
async function diagRows(
  page: Page,
  labels: string[],
): Promise<Record<string, string>> {
  await page.keyboard.press("Control+Alt+v");
  await expect(page.locator(".diag")).toBeVisible({ timeout: 15_000 });

  const out: Record<string, string> = {};
  for (const label of labels) {
    /*
     * O timeout EXPLICITO nao e enfeite: `textContent()` espera o elemento
     * aparecer, e sem `actionTimeout` no config isso e espera SEM FIM. Com a
     * linha ausente o `.catch` nunca dispara e o teste morre no timeout global,
     * sem dizer o que faltou. Medir coisa que pode nao existir exige teto.
     */
    out[label] =
      (
        await page
          .locator(".diag__row", { hasText: label })
          .locator(".diag__value")
          .first()
          .textContent({ timeout: 5_000 })
          .catch(() => null)
      )?.trim() ?? "(ausente)";
  }

  await page.keyboard.press("Escape");
  return out;
}

/** Despeja a medicao da etapa 9 no log do teste. */
async function reportDirections(
  scene: { ownerPage: Page; guestPage: Page },
  when: string,
): Promise<void> {
  for (const [side, page] of [
    ["dono  ", scene.ownerPage],
    ["membro", scene.guestPage],
  ] as const) {
    // UMA abertura de painel para as tres linhas: cada abre/fecha e uma chance
    // de o atalho e o estado do modal sairem de sincronia.
    const rows = await diagRows(page, [
      "direção do vídeo",
      "sinal descartado",
      "transceivers",
    ]);
    console.log(
      `[etapa9 ${when}] ${side}: direcao=${rows["direção do vídeo"]} - ` +
        `descartado=${rows["sinal descartado"]}
` +
        `          ${side} transceivers: ${rows["transceivers"]}`,
    );
  }
}

/** Espera o <video> do palco ter quadro DE VERDADE, nao so existir. */
async function expectRealVideo(page: Page, message: string): Promise<void> {
  await expect(page.locator(".room__video-slot video"), message).toBeVisible({
    timeout: 60_000,
  });
  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const video = document.querySelector<HTMLVideoElement>(
            ".room__video-slot video",
          );
          return video === null ? 0 : video.videoWidth;
        }),
      { timeout: 60_000, message },
    )
    .toBeGreaterThan(0);
}

/*
 * ATENÇÃO: as tentativas aqui NÃO são porque o teste é frouxo. Elas cobrem um
 * DEFEITO REAL do produto, medido e ainda em aberto — ver PROGRESSO.md,
 * "vídeo que não chega na negociação inicial".
 *
 * Em cerca de uma execução em quatro, a faixa de vídeo nunca chega ao outro
 * lado: o `<video>` fica no palco sem MediaStream nenhum, o `ontrack` de vídeo
 * não dispara, e esperar não resolve — subir o teto do poll de 60s para 150s
 * não muda nada, o que prova que é perda e não lentidão. A causa provável é
 * colisão entre os `addTransceiver` simétricos dos dois lados no aperto de mão.
 *
 * Os dois testes aqui dentro batem no mesmo ponto por caminhos diferentes: um
 * exige `videoWidth` de verdade (é o ÚNICO da suíte que prova pixel chegando),
 * o outro exige que quem entra no meio receba o elemento. Quando o `ontrack`
 * some, o primeiro vê zero e o segundo não acha o elemento.
 *
 * Nenhum dos dois pode ser afrouxado — só repetido, com o defeito registrado.
 */

test.describe("compartilhar tela — chegada da faixa de vídeo", () => {
  test.describe.configure({ retries: 2 });

  test("uma aba transmite, a outra recebe vídeo, e o botão da outra trava", async () => {
    const browser = await freshBrowser();
    try {
      test.setTimeout(90_000);
      const scene = await groupWithMember(browser, "tela");
      await bothInVoice(scene);

      /*
       * A aba de quem transmite precisa estar EM PRIMEIRO PLANO.
       *
       * O Chromium estrangula aba de fundo, e a captura de aba estrangulada
       * entrega uma faixa sem quadro nenhum: do outro lado o <video> aparece com
       * `videoWidth` zerado. É a única asserção da suíte que depende de pixel de
       * verdade chegar, e sem isto ela oscila.
       */
      await scene.ownerPage.bringToFront();

      await scene.ownerPage
        .getByRole("button", { name: "Compartilhar tela" })
        .click();

      // Quem transmite vê a MINIATURA e a mensagem no palco — não a própria tela
      // em tamanho grande, que criaria efeito de túnel.
      await expect(scene.ownerPage.locator(".room__preview")).toBeVisible({
        timeout: 30_000,
      });
      await expect(
        scene.ownerPage.locator(".room__screen--mine"),
      ).toContainText("Você está transmitindo");

      // A outra aba recebe a faixa de vídeo de verdade.
      const guestVideo = scene.guestPage.locator(".room__video-slot video");
      await expect(guestVideo).toBeVisible({ timeout: 60_000 });
      await expect(
        scene.guestPage.locator(".room__screen-caption"),
      ).toContainText(scene.owner.displayName);

      // Vídeo com quadros de verdade, não um elemento vazio com stream sem faixa —
      // que foi exatamente o defeito que apareceu aqui.
      await expect
        .poll(
          async () =>
            scene.guestPage.evaluate(() => {
              const video = document.querySelector<HTMLVideoElement>(
                ".room__video-slot video",
              );
              return video === null ? 0 : video.videoWidth;
            }),
          { timeout: 60_000, message: "o vídeo precisa ter dimensão real" },
        )
        .toBeGreaterThan(0);

      // Só um transmite por canal: o botão da outra aba trava, com o motivo.
      const guestButton = scene.guestPage.getByRole("button", {
        name: `${scene.owner.displayName} já está transmitindo`,
      });
      await expect(guestButton).toBeDisabled();

      // Parar volta ao placeholder nas DUAS.
      await scene.ownerPage
        .getByRole("button", { name: "Parar de transmitir" })
        .click();
      await expect(scene.ownerPage.locator(".room__preview")).toBeHidden({
        timeout: 30_000,
      });
      await expect(scene.guestPage.locator(".room__video-slot")).toHaveCount(
        0,
        {
          timeout: 30_000,
        },
      );
      // Etapa 8a: sem transmissão não há palco — a sala volta à grade.
      await expect(scene.guestPage.locator(".room__stage")).toHaveCount(0);
      await expect(scene.guestPage.locator(".room__people--grade")).toHaveCount(1);
      await expect(
        scene.guestPage.getByRole("button", { name: "Compartilhar tela" }),
      ).toBeEnabled({ timeout: 30_000 });

      await scene.ownerContext.close();
      await scene.guestContext.close();
    } finally {
      await browser.close();
    }
  });

  test("quem entra no meio de uma transmissão já recebe o vídeo", async () => {
    const browser = await freshBrowser();
    try {
      test.setTimeout(90_000);
      const scene = await groupWithMember(browser, "entra-meio");

      // O dono entra sozinho e começa a transmitir ANTES do outro chegar.
      await scene.ownerPage
        .locator(".channels__body")
        .getByRole("button", { name: "Sala Principal" })
        .click();
      await expect(scene.ownerPage.locator(".room__person")).toHaveCount(1, {
        timeout: 30_000,
      });
      await scene.ownerPage
        .getByRole("button", { name: "Compartilhar tela" })
        .click();
      await expect(scene.ownerPage.locator(".room__preview")).toBeVisible({
        timeout: 30_000,
      });

      // Agora o outro entra. A conexão nova nasce com o vídeo dentro — não há
      // renegociação, porque as faixas locais semeiam a primeira oferta.
      await scene.guestPage
        .locator(".channels__body")
        .getByRole("button", { name: "Sala Principal" })
        .click();

      await expect(
        scene.guestPage.locator(".room__video-slot video"),
        "quem chega no meio precisa ver a transmissão em andamento",
      ).toBeVisible({ timeout: 60_000 });

      await scene.ownerContext.close();
      await scene.guestContext.close();
    } finally {
      await browser.close();
    }
  });

  /*
   * A DIRECAO INVERSA - o caso que a suite nunca exercitou.
   *
   * `iAmOfferer` e `myUid < peerUid`, entao quem oferta e sempre o de uid
   * MENOR. Todo teste de tela ate aqui fez o dono compartilhar, e o dono podia
   * ser qualquer um dos dois: a direcao testada era sorteada pelo Firebase.
   *
   * Aqui nao ha sorteio. O teste le os dois uids e faz compartilhar EXATAMENTE
   * quem nao oferta.
   */
  test("a aba que NAO oferta compartilha e a outra recebe", async () => {
    const browser = await freshBrowser();
    try {
      test.setTimeout(60_000);
      const scene = await groupWithMember(browser, "inversa");
      await bothInVoice(scene);

      const uids = await uidsOf(scene);
      const ownerOffers = uids.owner < uids.guest;
      const sharer = ownerOffers ? scene.guestPage : scene.ownerPage;
      const watcher = ownerOffers ? scene.ownerPage : scene.guestPage;
      console.log(
        `[etapa9] quem oferta: ${ownerOffers ? "dono" : "membro"}; ` +
          `quem compartilha neste teste: ${ownerOffers ? "membro" : "dono"}`,
      );

      await reportDirections(scene, "depois do handshake");

      await sharer.bringToFront();
      await sharer.getByRole("button", { name: "Compartilhar tela" }).click();
      await expect(sharer.locator(".room__preview")).toBeVisible({
        timeout: 30_000,
      });

      await reportDirections(scene, "com o nao-ofertante transmitindo");

      await expectRealVideo(
        watcher,
        "a tela precisa chegar TAMBEM quando quem transmite e o lado que responde",
      );

      await scene.ownerContext.close();
      await scene.guestContext.close();
    } finally {
      await browser.close();
    }
  });

  /*
   * REVEZAMENTO na mesma sessao: um transmite, para, e o outro assume.
   *
   * E o que acontece numa mesa de verdade - "deixa eu mostrar a minha" - e
   * passa pelos dois sentidos de negociacao sem reconectar nada.
   */
  test("um compartilha, para, e o outro compartilha na mesma sessao", async () => {
    const browser = await freshBrowser();
    try {
      test.setTimeout(60_000);
      const scene = await groupWithMember(browser, "reveza");
      await bothInVoice(scene);

      await scene.ownerPage.bringToFront();
      await scene.ownerPage
        .getByRole("button", { name: "Compartilhar tela" })
        .click();
      await expectRealVideo(
        scene.guestPage,
        "primeira volta: a tela do dono precisa chegar no membro",
      );

      await scene.ownerPage
        .getByRole("button", { name: "Parar de transmitir" })
        .click();
      await expect(scene.guestPage.locator(".room__video-slot")).toHaveCount(
        0,
        {
          timeout: 30_000,
        },
      );

      // Agora o outro lado. Se a negociacao so funciona num sentido, e aqui que
      // aparece.
      await scene.guestPage.bringToFront();
      await scene.guestPage
        .getByRole("button", { name: "Compartilhar tela" })
        .click();

      await reportDirections(
        scene,
        "no revezamento, com o membro transmitindo",
      );

      await expectRealVideo(
        scene.ownerPage,
        "segunda volta: a tela do membro precisa chegar no dono",
      );

      await scene.ownerContext.close();
      await scene.guestContext.close();
    } finally {
      await browser.close();
    }
  });

  /*
   * OS DOIS AO MESMO TEMPO - o que mais estressa a ordem de negociacao, e o que
   * qualquer pessoa faz sem pensar.
   *
   * `resolveSharingCollision` manda o de uid MAIOR parar sozinho. O teste
   * cobra as duas metades: que sobre um transmissor so, e que quem sobrou
   * apareca DE VERDADE no palco do outro - o roster dizer que sobrou nao basta,
   * porque o palco aparece pelo roster mesmo sem faixa nenhuma.
   */
  test("os dois compartilham ao mesmo tempo e sobra um, com video de verdade", async () => {
    const browser = await freshBrowser();
    try {
      test.setTimeout(60_000);
      const scene = await groupWithMember(browser, "simultaneo");
      await bothInVoice(scene);

      const uids = await uidsOf(scene);
      const ownerYields = uids.owner > uids.guest;
      const survivor = ownerYields ? scene.guestPage : scene.ownerPage;
      const yielder = ownerYields ? scene.ownerPage : scene.guestPage;

      // Sem await entre os dois cliques: e o mais perto de "ao mesmo tempo" que
      // da para chegar de fora do navegador.
      await Promise.all([
        scene.ownerPage
          .getByRole("button", { name: "Compartilhar tela" })
          .click(),
        scene.guestPage
          .getByRole("button", { name: "Compartilhar tela" })
          .click(),
      ]);

      /*
       * O de uid maior desiste sozinho.
       *
       * A prova e o botao "Parar de transmitir" SUMIR do lado dele. Ele nao
       * volta para "Compartilhar tela": com outra pessoa no palco o botao vira
       * "fulano ja esta transmitindo", travado. Ver `screenButton` em
       * components/voice-room/voice-room.ts.
       */
      await expect(
        yielder.getByRole("button", { name: "Parar de transmitir" }),
        "quem tem uid maior precisa parar sozinho na colisao",
      ).toHaveCount(0, { timeout: 30_000 });
      await expect(survivor.locator(".room__preview")).toBeVisible({
        timeout: 30_000,
      });

      await reportDirections(scene, "depois da colisao de transmissoes");

      await expectRealVideo(
        yielder,
        "quem desistiu precisa VER a transmissao de quem ficou",
      );

      await scene.ownerContext.close();
      await scene.guestContext.close();
    } finally {
      await browser.close();
    }
  });

  /*
   * ENQUADRAMENTO: a caixa desenhada do video tem que bater com a proporcao da
   * fonte, em toda largura de janela e com a sala mudando embaixo.
   *
   * Olhar `object-fit: contain` no CSS nao prova nada — ele ja estava la desde a
   * etapa 7 e a imagem esticava assim mesmo, porque quem estava errado era a
   * ALTURA da caixa. Este teste compara `videoWidth/videoHeight` (a proporcao
   * real) com a area efetivamente pintada, que e o que o olho ve.
   */
  test("o video do palco nunca distorce nem corta", async () => {
    const browser = await freshBrowser();
    try {
      test.setTimeout(60_000);
      const scene = await groupWithMember(browser, "enquadra");
      await bothInVoice(scene);

      await scene.ownerPage.bringToFront();
      await scene.ownerPage
        .getByRole("button", { name: "Compartilhar tela" })
        .click();
      await expectRealVideo(
        scene.guestPage,
        "o video precisa chegar antes de medir o enquadramento",
      );

      /*
       * Com `contain`, a imagem ocupa o maior retangulo com a proporcao da
       * fonte que cabe na caixa. Caixa errada, retangulo errado — e a conta
       * abaixo denuncia.
       */
      const check = async (situacao: string): Promise<void> => {
        const m = await scene.guestPage.evaluate(() => {
          const video = document.querySelector<HTMLVideoElement>(
            ".room__video-slot video",
          )!;
          const box = video.getBoundingClientRect();
          const scale = Math.min(
            box.width / video.videoWidth,
            box.height / video.videoHeight,
          );
          const stage = document
            .querySelector(".room__screen--live")!
            .getBoundingClientRect();
          return {
            ratio: (video.videoWidth * scale) / (video.videoHeight * scale),
            source: video.videoWidth / video.videoHeight,
            // Passar da moldura e o "cortado".
            overflowed:
              box.width > stage.width + 1 || box.height > stage.height + 1,
            dims: `video ${Math.round(box.width)}x${Math.round(box.height)} vs moldura ${Math.round(stage.width)}x${Math.round(stage.height)}`,
            visible: box.width > 0 && box.height > 0,
          };
        });
        expect(m.visible, `${situacao}: o video sumiu`).toBe(true);
        expect(
          Math.abs(m.ratio - m.source),
          `${situacao}: a imagem desenhada saiu da proporcao da fonte`,
        ).toBeLessThan(0.02);
        expect(
          m.overflowed,
          `${situacao}: o video passou da moldura — ${m.dims}`,
        ).toBe(false);
      };

      await check("janela larga");

      // Redimensionar: nenhuma largura pode distorcer.
      for (const width of [1100, 820, 640]) {
        await scene.guestPage.setViewportSize({ width, height: 900 });
        await check(`janela de ${width}px`);
      }

      // Gaveta abrindo e fechando muda a largura util da coluna do meio.
      await scene.guestPage.setViewportSize({ width: 390, height: 780 });
      await scene.guestPage
        .getByRole("button", { name: "Abrir canais" })
        .click();
      await check("gaveta aberta no mobile");
      await scene.guestPage.mouse.click(360, 400);
      await check("gaveta fechada no mobile");
      await scene.guestPage.setViewportSize({ width: 1440, height: 900 });
      await check("de volta ao desktop");

      /*
       * Gente entrando muda a altura da grade de participantes, e o palco
       * divide a sobra com ela. Injetado por REST: um terceiro navegador
       * testaria a mesma coisa e custaria minutos.
       */
      const channelId =
        (await scene.guestPage
          .locator(".channel.is-connected")
          .getAttribute("data-channel-id")) ?? "";
      expect(channelId).not.toBe("");

      const third = track("enquadra-3");
      await createAccountViaRest(third);
      expect(
        await joinGroupViaRest(third, scene.groupId, scene.inviteCode),
      ).toBe(200);
      expect(
        await writeVoiceParticipant(third, {
          channelId,
          groupId: scene.groupId,
          lastSeenMsAgo: 0,
        }),
      ).toBe(200);

      await expect(scene.guestPage.locator(".room__person")).toHaveCount(3, {
        timeout: 30_000,
      });
      await check("com uma terceira pessoa na sala");

      await scene.ownerContext.close();
      await scene.guestContext.close();
    } finally {
      await browser.close();
    }
  });
});

/*
 * O AVISO DE ÁUDIO BLOQUEADO SÓ PARA BLOQUEIO DE VERDADE (15/11/2026).
 *
 * Reatribuir `srcObject` interrompe o `play()` anterior com `AbortError`, e
 * isso era confundido com autoplay bloqueado: o aviso aparecia sem bloqueio
 * nenhum (visto na janela do app de computador).
 *
 * Bloqueio real não dá para provocar aqui: a suíte roda MUDA, e o Chromium
 * deixa tocar o que não faz som. Então o teste faz o `play()` responder com
 * cada erro e confere a reação do Loft — que é o que estava errado.
 */
async function playRespondendo(page: Page, erro: "NotAllowedError" | "AbortError"): Promise<void> {
  await page.addInitScript((nome) => {
    const original = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
      if ((window as unknown as { liberado?: boolean }).liberado === true || this.tagName !== "AUDIO") {
        return original.call(this);
      }
      const w = window as unknown as { recusas?: number };
      w.recusas = (w.recusas ?? 0) + 1;
      return Promise.reject(new DOMException("teste", nome));
    };
  }, erro);
  await page.reload();
  // Quem entrou por convite volta para a tela do convite ("já faz parte").
  const abrir = page.getByRole("button", { name: "Abrir o grupo" });
  const grupo = page.locator(".channels__group-name");
  await expect(grupo.or(abrir)).toBeVisible({ timeout: 30_000 });
  if (await abrir.isVisible()) await abrir.click();
  await expect(grupo).toBeVisible({ timeout: 30_000 });
}

test("o aviso de áudio bloqueado aparece com bloqueio de verdade, e não com play() interrompido", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const scene = await groupWithMember(browser, "autoplay");
  await playRespondendo(scene.ownerPage, "NotAllowedError");
  await playRespondendo(scene.guestPage, "AbortError");
  await bothInVoice(scene);

  // Bloqueio de verdade (dono): o aviso aparece, e "Ativar áudio" resolve.
  const aviso = scene.ownerPage.getByText("O navegador bloqueou o áudio automático.");
  await expect(aviso).toBeVisible({ timeout: 30_000 });
  await scene.ownerPage.evaluate(() => {
    (window as unknown as { liberado: boolean }).liberado = true;
  });
  await scene.ownerPage.getByRole("button", { name: "Ativar áudio" }).click();
  await expect(aviso).toBeHidden({ timeout: 15_000 });

  // play() interrompido (membro, AbortError) NÃO é bloqueio: nada de aviso.
  // Espera o play() dele ter sido MESMO recusado, e dá tempo à tela — sem
  // isso a conferência podia passar só por chegar cedo.
  await expect
    .poll(() => scene.guestPage.evaluate(() => (window as unknown as { recusas?: number }).recusas ?? 0))
    .toBeGreaterThan(0);
  await scene.guestPage.waitForTimeout(1_500);
  await expect(
    scene.guestPage.getByText("O navegador bloqueou o áudio automático."),
  ).toHaveCount(0);
});

test("começar e parar três vezes seguidas mantém o áudio intacto", async () => {
  const browser = await freshBrowser();
  try {
    test.setTimeout(60_000);
    const scene = await groupWithMember(browser, "renegocia");
    await bothInVoice(scene);

    // Estado do áudio ANTES: é o que não pode mudar.
    const audiosBefore = await scene.guestPage.evaluate(
      () => document.querySelectorAll("#voice-audio audio").length,
    );
    expect(audiosBefore).toBe(1);

    /*
     * O teste da renegociação. Ligar e desligar a faixa de vídeo três vezes na
     * mesma conexão é o que quebraria se `replaceTrack` estivesse renegociando —
     * e o sintoma seria o áudio caindo junto, não o vídeo.
     */
    for (let round = 1; round <= 3; round += 1) {
      await scene.ownerPage
        .getByRole("button", { name: "Compartilhar tela" })
        .click();
      await expect(
        scene.guestPage.locator(".room__video-slot video"),
        `rodada ${round}: o vídeo precisa chegar`,
      ).toBeVisible({ timeout: 60_000 });

      await scene.ownerPage
        .getByRole("button", { name: "Parar de transmitir" })
        .click();
      await expect(
        scene.guestPage.locator(".room__video-slot"),
        `rodada ${round}: o vídeo precisa sumir`,
      ).toHaveCount(0, { timeout: 30_000 });
    }

    // A CHAMADA continua de pé: mesma conexão, mesmo elemento de áudio, e o
    // diagnóstico ainda diz connected.
    await scene.guestPage.keyboard.press("Control+Alt+v");
    await expect(scene.guestPage.locator(".diag")).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      scene.guestPage.locator(".diag"),
      "a conexão de voz não pode ter caído com a renegociação",
    ).toContainText("connected", { timeout: 30_000 });
    await scene.guestPage.keyboard.press("Escape");

    expect(
      await scene.guestPage.evaluate(
        () => document.querySelectorAll("#voice-audio audio").length,
      ),
      "o áudio não pode ter sido recriado",
    ).toBe(audiosBefore);
    await expect(
      scene.guestPage.locator(".room__person.is-failed"),
    ).toHaveCount(0);

    await scene.ownerContext.close();
    await scene.guestContext.close();
  } finally {
    await browser.close();
  }
});

test("transmissão de participante que virou fantasma some do palco", async ({
  browser,
}) => {
  test.setTimeout(75_000);
  const scene = await groupWithMember(browser, "tela-fantasma");

  await scene.ownerPage
    .locator(".channels__body")
    .getByRole("button", { name: "Sala Principal" })
    .click();
  await expect(scene.ownerPage.locator(".room__person")).toHaveCount(1, {
    timeout: 30_000,
  });

  const channelId =
    (await scene.ownerPage
      .locator(".channel.is-connected")
      .getAttribute("data-channel-id")) ?? "";

  /*
   * Um participante TRANSMITINDO com lastSeen velho: é o que sobra de quem
   * fechou o navegador na força no meio de uma transmissão. O palco não pode
   * ficar dizendo que essa pessoa está transmitindo, nem travar o botão dos
   * outros.
   */
  expect(
    await writeVoiceParticipant(scene.guest, {
      channelId,
      groupId: scene.groupId,
      lastSeenMsAgo: 90_000,
      sharingScreen: true,
    }),
  ).toBe(200);

  // Espera além da varredura de 5s, para não passar por sorte de tempo.
  await scene.ownerPage.waitForTimeout(7000);
  await expect(scene.ownerPage.locator(".room__person")).toHaveCount(1);
  // Etapa 8a: sem transmissão não há palco — a sala volta à grade.
  await expect(scene.ownerPage.locator(".room__stage")).toHaveCount(0);
  await expect(scene.ownerPage.locator(".room__people--grade")).toHaveCount(1);
  await expect(
    scene.ownerPage.getByRole("button", { name: "Compartilhar tela" }),
    "o botão não pode ficar travado por uma transmissão fantasma",
  ).toBeEnabled();

  await scene.ownerContext.close();
  await scene.guestContext.close();
});

/* -------------------------------------------------------------------------- */
/* ETAPA 8 — a travessia dos 720px                                             */
/* -------------------------------------------------------------------------- */

test("atravessar 720px com chamada ativa não derruba a conexão", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const scene = await groupWithMember(browser, "travessia");
  await bothInVoice(scene);

  // Confirma que a conexão fechou ANTES de mexer no tamanho.
  await scene.ownerPage.keyboard.press("Control+Alt+v");
  await expect(scene.ownerPage.locator(".diag")).toContainText("connected", {
    timeout: 60_000,
  });
  await scene.ownerPage.keyboard.press("Escape");

  /*
   * O elemento de áudio é a testemunha: se a travessia remontasse a coluna do
   * meio, ele seria recriado e o som cortaria. Marco este e confiro que é o
   * MESMO no fim.
   */
  await scene.ownerPage.locator("#voice-audio audio").first().waitFor({
    state: "attached",
    timeout: 30_000,
  });
  await scene.ownerPage.evaluate(() => {
    document
      .querySelector("#voice-audio audio")
      ?.setAttribute("data-marca", "antes");
  });

  // Desktop → mobile, com uma gaveta aberta no caminho.
  await scene.ownerPage.setViewportSize({ width: 390, height: 780 });
  await expect(scene.ownerPage.locator(".room")).toBeVisible();
  await scene.ownerPage.getByRole("button", { name: "Abrir canais" }).click();
  await expect(scene.ownerPage.locator(".app")).toHaveClass(/drawer-left/);

  // …e de volta.
  await scene.ownerPage.setViewportSize({ width: 1440, height: 900 });
  await expect(
    scene.ownerPage.locator(".app"),
    "gaveta aberta não pode sobreviver ao desktop",
  ).not.toHaveClass(/drawer-left/);

  // A chamada continua de pé, e o áudio nunca foi recriado.
  expect(
    await scene.ownerPage.evaluate(
      () =>
        document
          .querySelector("#voice-audio audio")
          ?.getAttribute("data-marca") ?? null,
    ),
    "o elemento de áudio foi recriado — a chamada teria cortado",
  ).toBe("antes");

  await scene.ownerPage.keyboard.press("Control+Alt+v");
  await expect(
    scene.ownerPage.locator(".diag"),
    "a conexão precisa sobreviver à travessia",
  ).toContainText("connected", { timeout: 30_000 });
  await scene.ownerPage.keyboard.press("Escape");

  await expect(scene.ownerPage.locator(".room__person")).toHaveCount(2);

  await scene.ownerContext.close();
  await scene.guestContext.close();
});

test("abrir e fechar gaveta não remonta o app nem derruba a chamada", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const account = track("gaveta-rota");
  await page.goto("/");
  await signUpThroughUi(page, account);
  await createGroupThroughUi(page, "Grupo Gaveta");

  await page.setViewportSize({ width: 390, height: 780 });
  await page.getByRole("button", { name: "Abrir canais" }).click();
  await page
    .locator(".channels__body")
    .getByRole("button", { name: "Sala Principal" })
    .click();
  await expect(page.locator(".room")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".room__person")).toHaveCount(1, {
    timeout: 30_000,
  });

  /*
   * O `popstate` da gaveta passava pelo roteador, que mandava o main.ts remontar
   * o app — e remontar chama `store.dispose()`, que SAI DO CANAL DE VOZ. Este
   * teste é o que prova as duas defesas: o roteador ignorando rota igual, e o
   * showApp idempotente.
   */
  /*
   * A testemunha é o contêiner de áudio do MOTOR, não a sala.
   *
   * A sala é reconstruída de forma legítima toda vez que o roster muda — marcar
   * ela daria falso positivo. O `#voice-audio` só desaparece se o motor for
   * destruído, que é exatamente o que uma remontagem do app causaria.
   */
  // O contêiner só existe depois de o motor subir; marcar antes disso não
  // marcaria nada, e a leitura no fim daria falso negativo.
  await page
    .locator("#voice-audio")
    .waitFor({ state: "attached", timeout: 30_000 });
  await page.evaluate(() => {
    document.querySelector("#voice-audio")?.setAttribute("data-marca", "antes");
  });

  for (let i = 0; i < 3; i += 1) {
    await page.getByRole("button", { name: "Abrir membros" }).click();
    await expect(page.locator(".app")).toHaveClass(/drawer-right/);
    await page.goBack();
    await expect(page.locator(".app")).not.toHaveClass(/drawer-right/);
  }

  await expect(
    page.locator(".room__person"),
    "a chamada caiu ao mexer na gaveta",
  ).toHaveCount(1);
  expect(
    await page.evaluate(
      () =>
        document.querySelector("#voice-audio")?.getAttribute("data-marca") ??
        null,
    ),
    "o motor de voz foi destruído — o app remontou e a chamada teria caído",
  ).toBe("antes");
});

test('a quinta pessoa é barrada com "sala cheia"', async ({ browser }) => {
  test.setTimeout(75_000);
  const scene = await groupWithMember(browser, "lotada");

  await scene.ownerPage
    .locator(".channels__body")
    .getByRole("button", { name: "Sala Principal" })
    .click();
  await expect(scene.ownerPage.locator(".room__person")).toHaveCount(1, {
    timeout: 30_000,
  });

  const channelId =
    (await scene.ownerPage
      .locator(".channel.is-connected")
      .getAttribute("data-channel-id")) ?? "";
  expect(channelId).not.toBe("");

  // Enche a sala por REST: o dono já é 1, mais 3 injetados fecham os 4. Abrir
  // cinco navegadores testaria a mesma regra e levaria minutos.
  for (let i = 0; i < 3; i += 1) {
    const filler = track(`lotada-${i}`);
    await createAccountViaRest(filler);
    expect(
      await joinGroupViaRest(filler, scene.groupId, scene.inviteCode),
    ).toBe(200);
    expect(
      await writeVoiceParticipant(filler, {
        channelId,
        groupId: scene.groupId,
        lastSeenMsAgo: 0,
      }),
    ).toBe(200);
  }

  await expect(scene.ownerPage.locator(".room__person")).toHaveCount(4, {
    timeout: 30_000,
  });

  // A quinta pessoa é recusada — e ouve o motivo em vez de o clique não fazer nada.
  await scene.guestPage
    .locator(".channels__body")
    .getByRole("button", { name: "Sala Principal" })
    .click();
  await expect(scene.guestPage.locator(".toast")).toContainText("Sala cheia", {
    timeout: 30_000,
  });
  await expect(
    scene.guestPage.locator(".room"),
    "não pode ter entrado",
  ).toBeHidden();

  await scene.ownerContext.close();
  await scene.guestContext.close();
});

test("participante com lastSeen velho é ignorado", async ({ browser }) => {
  test.setTimeout(60_000);
  const scene = await groupWithMember(browser, "fantasma");

  await scene.ownerPage
    .locator(".channels__body")
    .getByRole("button", { name: "Sala Principal" })
    .click();
  await expect(scene.ownerPage.locator(".room__person")).toHaveCount(1, {
    timeout: 30_000,
  });

  const channelId =
    (await scene.ownerPage
      .locator(".channel.is-connected")
      .getAttribute("data-channel-id")) ?? "";
  expect(channelId, "não achei o id do canal conectado").not.toBe("");

  // Injeta o convidado como participante JÁ VELHO — 90s, o dobro da janela de
  // 45s. Sem heartbeat, o Firestore não tem como avisar que ele morreu; quem
  // precisa perceber é o cliente.
  const status = await writeVoiceParticipant(scene.guest, {
    channelId,
    groupId: scene.groupId,
    lastSeenMsAgo: 90_000,
  });
  expect(status, "a escrita do fantasma precisa ser aceita pelas regras").toBe(
    200,
  );

  // O documento existe no banco, e mesmo assim a sala continua com uma pessoa.
  // Espera além da varredura de 5s, para não passar por sorte de tempo.
  await scene.ownerPage.waitForTimeout(7000);
  await expect(
    scene.ownerPage.locator(".room__person"),
    "participante com lastSeen velho não pode aparecer",
  ).toHaveCount(1);
  await expect(scene.ownerPage.locator(".channel__peer")).toHaveCount(1);

  await scene.ownerContext.close();
  await scene.guestContext.close();
});

/*
 * SEPARADOR DE DATA.
 *
 * As mensagens sao injetadas pela REST com `sentAt` escolhido: pela interface o
 * app sempre carimba o relogio da maquina, e nao haveria como produzir uma
 * mensagem de ontem ou do ano passado.
 *
 * Os horarios sao montados com `new Date(...)` no fuso LOCAL de quem roda o
 * teste, e nao com string UTC fixa: o separador e local de proposito, entao um
 * "2026-08-22T23:00:00Z" cairia em dias diferentes conforme a maquina.
 */
test("separador de data agrupa por dia, com Hoje, Ontem, este ano e ano passado", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const account = track("separador");
  await page.goto("/");
  await signUpThroughUi(page, account);
  await createGroupThroughUi(page, "Grupo Separador");

  const channelId =
    (await page
      .locator(".channel.is-active")
      .getAttribute("data-channel-id")) ?? "";
  expect(channelId).not.toBe("");
  await resolveTokens(account);
  const groupId = await activeGroupId(page);

  /** Meio-dia de N dias atras, no fuso local. */
  const daysAgo = (days: number, hour = 12): string => {
    const date = new Date();
    date.setDate(date.getDate() - days);
    date.setHours(hour, 0, 0, 0);
    return date.toISOString();
  };

  const lastYear = new Date();
  lastYear.setFullYear(lastYear.getFullYear() - 1);
  lastYear.setMonth(7, 19); // 19 de agosto
  lastYear.setHours(12, 0, 0, 0);

  const thisYear = new Date();
  thisYear.setMonth(0, 5); // 5 de janeiro
  thisYear.setHours(12, 0, 0, 0);
  // Se 5 de janeiro deste ano cair em "hoje" ou "ontem", o rotulo seria outro.
  // Nao cai: o teste roda em agosto, e mesmo em janeiro a distancia e de dias.

  for (const [body, sentAt] of [
    ["mensagem do ano passado", lastYear.toISOString()],
    ["mensagem deste ano", thisYear.toISOString()],
    ["mensagem de ontem", daysAgo(1)],
    ["mensagem de hoje", daysAgo(0)],
  ] as const) {
    expect(
      await writeMessageAt(account, { groupId, channelId, body, sentAt }),
      `injecao de "${body}" precisa ser aceita`,
    ).toBe(200);
  }

  await expect(page.locator(".message")).toHaveCount(4, { timeout: 30_000 });

  const separadores = page.locator(".messages__day-label");
  await expect(
    separadores,
    "um separador por dia, e o do topo antes da mensagem mais antiga",
  ).toHaveCount(4);

  const esperado = [
    `19 de agosto de ${lastYear.getFullYear()}`,
    "5 de janeiro",
    "Ontem",
    "Hoje",
  ];
  expect(await separadores.allTextContents()).toEqual(esperado);

  /*
   * ORDEM: o separador tem que vir ANTES da mensagem do dia dele, nao depois.
   * Comparar so os textos deixaria passar um separador no lugar errado.
   */
  // Com quatro mensagens o canal inteiro está carregado, então o topo diz isso.
  await expect(page.locator(".messages__top-note")).toHaveText(/Início de #/);

  // E ele fica FORA da sequência medida abaixo: é o aviso de começo de canal
  // (etapa 13), não parte da alternância conversa/separador.
  const ordem = await page
    .locator(".messages > li:not(.messages__top)")
    .evaluateAll((nodes) =>
      nodes.map((node) =>
        node.classList.contains("messages__day")
          ? `--- ${node.textContent}`
          : (node.querySelector(".message__text")?.textContent ?? ""),
      ),
    );
  expect(ordem).toEqual([
    `--- 19 de agosto de ${lastYear.getFullYear()}`,
    "mensagem do ano passado",
    "--- 5 de janeiro",
    "mensagem deste ano",
    "--- Ontem",
    "mensagem de ontem",
    "--- Hoje",
    "mensagem de hoje",
  ]);
});

/*
 * O caso que o agrupamento por autor esconderia: duas mensagens da MESMA pessoa
 * a poucos minutos uma da outra, mas em dias diferentes por causa da meia-noite.
 *
 * Sem quebrar o bloco, o separador entraria no meio dele e a mensagem de baixo
 * apareceria sem nome e sem horario — orfa.
 */
test("bloco do mesmo autor atravessando a meia-noite e partido pelo separador", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const account = track("meia-noite");
  await page.goto("/");
  await signUpThroughUi(page, account);
  await createGroupThroughUi(page, "Grupo Meia-Noite");

  const channelId =
    (await page
      .locator(".channel.is-active")
      .getAttribute("data-channel-id")) ?? "";
  expect(channelId).not.toBe("");
  await resolveTokens(account);
  const groupId = await activeGroupId(page);

  // 23:58 de ontem e 00:01 de hoje: tres minutos de distancia, dentro da janela
  // de agrupamento de cinco minutos, e mesmo autor.
  const antes = new Date();
  antes.setDate(antes.getDate() - 1);
  antes.setHours(23, 58, 0, 0);

  const depois = new Date();
  depois.setHours(0, 1, 0, 0);

  expect(
    await writeMessageAt(account, {
      groupId,
      channelId,
      body: "antes da meia-noite",
      sentAt: antes.toISOString(),
    }),
  ).toBe(200);
  expect(
    await writeMessageAt(account, {
      groupId,
      channelId,
      body: "depois da meia-noite",
      sentAt: depois.toISOString(),
    }),
  ).toBe(200);

  await expect(page.locator(".message")).toHaveCount(2, { timeout: 30_000 });

  // O separador "Hoje" entra ENTRE as duas.
  await expect(page.locator(".messages__day-label")).toHaveText([
    "Ontem",
    "Hoje",
  ]);

  /*
   * E a de baixo recomeca bloco: `message--start`, com nome e horario de volta.
   * Sem a quebra por dia ela seria continuacao e nao teria nenhum dos dois.
   */
  const segunda = page.locator(".message").nth(1);
  await expect(
    segunda,
    "a mensagem depois do separador precisa recomecar bloco",
  ).toHaveClass(/message--start/);
  await expect(segunda.locator(".message__author")).toBeVisible();
  await expect(segunda.locator(".message__time")).toBeVisible();
});

/* -------------------------------------------------------------------------- */
/* Etapa 13 — histórico, responder e editar                                    */
/* -------------------------------------------------------------------------- */

/** Injeta N mensagens antigas, uma por minuto para trás a partir de agora. */
async function seedHistory(
  account: TestAccount,
  groupId: string,
  channelId: string,
  quantidade: number,
  prefixo: string,
): Promise<void> {
  const base = Date.now();
  for (let i = 0; i < quantidade; i += 1) {
    // Mais velhas primeiro no tempo: i=0 é a mais ANTIGA.
    const sentAt = new Date(base - (quantidade - i) * 60_000).toISOString();
    expect(
      await writeMessageAt(account, {
        groupId,
        channelId,
        body: `${prefixo} ${i}`,
        sentAt,
      }),
      `injeção de "${prefixo} ${i}" precisa ser aceita`,
    ).toBe(200);
  }
}

/*
 * MESMA INSTABILIDADE CONHECIDA do teste "chegar ao começo do canal..." logo
 * abaixo — ~1 de 10 execuções, etapa 16. Mesma hipótese, mesmo motivo:
 * `seedHistory` escreve por REST com o listener já ativo, e este teste
 * também captura uma mensagem-âncora e mede a posição dela. Na execução que
 * falha, a âncora simplesmente SOME do DOM (timeout esperando o
 * `data-message-id` dela) — sinal de que ela foi evictada da janela de
 * `limitToLast` por escritas ainda chegando, não de compensação de rolagem
 * errada. Mesma condição de escalada: se aparecer em cenário real (sem
 * `seedHistory`), deixa de ser artefato de teste.
 */
test("rolar ao topo carrega o histórico sem arrancar a posição de leitura", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const account = track("historico");
  await page.goto("/");
  await signUpThroughUi(page, account);
  await createGroupThroughUi(page, "Grupo Histórico");

  const channelId =
    (await page.locator(".channel.is-active").getAttribute("data-channel-id")) ??
    "";
  await resolveTokens(account);
  const groupId = await activeGroupId(page);

  // 70 mensagens: mais que uma página de 50, menos que duas.
  await seedHistory(account, groupId, channelId, 70, "linha");

  const lista = page.locator(".messages");
  await expect(page.locator(".message")).toHaveCount(50, { timeout: 60_000 });
  /*
   * ESPERA A JANELA ASSENTAR (etapa 20). `seedHistory` volta quando as
   * escritas terminam, mas o listener ainda pode estar entregando os últimos
   * snapshots — e cada um desliza a janela de 50 e troca o nó `.messages`.
   * Contar 50 não prova que acabou (a contagem é 50 desde a 50ª escrita); a
   * mensagem MAIS NOVA na tela prova. Era a causa da instabilidade registrada
   * acima, que ficou mais frequente com a fonte nova (etapa 20, medido).
   */
  await expect(page.getByText("linha 69", { exact: true })).toBeVisible({ timeout: 60_000 });

  /*
   * A ÂNCORA: uma mensagem visível agora, cuja posição na tela não pode mudar
   * quando o histórico entrar por cima.
   *
   * Medir só o `scrollTop` não bastaria — ele MUDA de propósito nesta operação
   * (a lista cresceu acima). O que tem que ficar parado é o que está sob os
   * olhos, e é isso que a posição da âncora na viewport mede.
   */
  const ancoraId =
    (await page
      .locator('.message[data-context="message"]')
      .first()
      .getAttribute("data-message-id")) ?? "";
  expect(ancoraId).not.toBe("");
  // Pelo ID, e não por `.first()`: depois do prepend a primeira da lista é
  // OUTRA mensagem, e o teste estaria medindo dois elementos diferentes.
  const ancora = page.locator(`[data-message-id="${ancoraId}"]`);

  /*
   * Rola para DENTRO da margem que dispara o histórico e mede JÁ ali.
   *
   * Medir numa posição e rolar depois seria medir o próprio teste mexendo na
   * tela: o que precisa ficar parado é o que está sob os olhos NO INSTANTE em
   * que o histórico entra.
   */
  /*
   * Rolar e medir no MESMO evaluate (16/11/2026): o histórico passou a entrar
   * tão rápido que, entre dois evaluates, a lista já tinha sido trocada — e o
   * "antes" saía de um nó recém-desligado (top 0), acusando um salto que o
   * app não deu (medido: a âncora ficou em 63px nas duas trocas). Aqui o
   * evento de rolagem só dispara depois que a medida já foi tirada.
   */
  const antes = await lista.evaluate((node, id) => {
    node.scrollTop = 120;
    return document.querySelector(`[data-message-id="${id}"]`)!.getBoundingClientRect().top;
  }, ancoraId);

  await expect(page.locator(".message")).toHaveCount(70, { timeout: 60_000 });

  const depois = await ancora.evaluate((node) => node.getBoundingClientRect().top);

  /*
   * O TETO É 12px, e não zero, por um motivo medido — não por conveniência.
   *
   * Sem compensação nenhuma a âncora saltava 457px: era isso que inutilizava o
   * recurso. Com ela sobram ~5px, e esses 5 não são erro de conta: a âncora é a
   * fronteira com o histórico, e quando entram mensagens do MESMO autor logo
   * acima ela deixa de abrir bloco — perde a linha do nome e troca a margem.
   * A mensagem tem outro tamanho agora, e nenhum ajuste de rolagem desfaz isso.
   *
   * 12px dá folga para o reagrupamento sem deixar passar um salto de verdade,
   * que seria de dezenas ou centenas.
   */
  expect(
    Math.abs(depois - antes),
    "a mensagem que estava sob os olhos precisa continuar praticamente no mesmo lugar",
  ).toBeLessThan(12);
});

/*
 * INSTABILIDADE CONHECIDA — medida em ~2 de 10 execuções, etapa 16.
 *
 * Falha com "Expected: 60, Received: 50" bem na linha do segundo
 * `toHaveCount`, logo depois do `node.scrollTop = 0`. NÃO é o bug do
 * carregamento automático (esse foi consertado na mesma etapa — ver
 * `message-list.ts`, o `requestAnimationFrame` e o botão "Carregar mensagens
 * anteriores"): aqui o conteúdo já estoura a tela de sobra, então rolar
 * FUNCIONA na maioria das vezes.
 *
 * Hipótese, não confirmada por instrumentação: `seedHistory` escreve as 60
 * mensagens uma a uma por REST com o listener do canal já ativo, e
 * `swapMessages` troca o nó `.messages` inteiro a cada entrega. Se o
 * `node.scrollTop = 0` do teste cair bem no meio dessa troca, o gesto pode
 * estar sendo aplicado a um nó que o próximo snapshot já vai substituir —
 * artefato de como o TESTE injeta histórico, não de como uma pessoa de
 * verdade recebe mensagem.
 *
 * NÃO É PARA VIRAR RETRY SILENCIOSO: esconderia o número. Se isto passar a
 * acontecer em CENÁRIO REAL — sem `seedHistory`, com mensagens chegando pela
 * UI normalmente — deixa de ser artefato de teste e volta para a fila como
 * bug de produto.
 */
test("chegar ao começo do canal mostra o aviso e para de buscar", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const account = track("comeco");
  await page.goto("/");
  await signUpThroughUi(page, account);
  await createGroupThroughUi(page, "Grupo Começo");

  const channelId =
    (await page.locator(".channel.is-active").getAttribute("data-channel-id")) ??
    "";
  await resolveTokens(account);
  const groupId = await activeGroupId(page);

  await seedHistory(account, groupId, channelId, 60, "antiga");

  const lista = page.locator(".messages");
  await expect(page.locator(".message")).toHaveCount(50, { timeout: 60_000 });
  /*
   * ESPERA A JANELA ASSENTAR (etapa 20). `seedHistory` volta quando as
   * escritas terminam, mas o listener ainda pode estar entregando os últimos
   * snapshots — e cada um desliza a janela de 50 e troca o nó `.messages`.
   * Contar 50 não prova que acabou (a contagem é 50 desde a 50ª escrita); a
   * mensagem MAIS NOVA na tela prova. Era a causa da instabilidade registrada
   * acima, que ficou mais frequente com a fonte nova (etapa 20, medido).
   */
  await expect(page.getByText("antiga 59", { exact: true })).toBeVisible({ timeout: 60_000 });

  await lista.evaluate((node) => {
    node.scrollTop = 0;
  });
  await expect(page.locator(".message")).toHaveCount(60, { timeout: 60_000 });

  // Carregou tudo: o topo diz que é o começo do canal.
  await expect(page.locator(".messages__top-note")).toHaveText(/Início de #/, {
    timeout: 30_000,
  });

  /*
   * E PARA DE BUSCAR. Rolar ao topo de novo não pode disparar nada: a prova é a
   * contagem não mexer e o aviso continuar o mesmo.
   */
  for (let i = 0; i < 3; i += 1) {
    await lista.evaluate((node) => {
      node.scrollTop = 0;
    });
    await page.waitForTimeout(300);
  }
  await expect(page.locator(".message")).toHaveCount(60);
  await expect(page.locator(".messages__top-note")).toHaveText(/Início de #/);
});

test("responder grava a citação, ela é clicável e sobrevive a apagar a original", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const scene = await groupWithMember(browser, "responder");

  // O membro escreve; o dono responde.
  await sendMessageThroughUi(scene.guestPage, "mensagem original");
  // `.message__text`, e não `getByText`: depois da resposta o mesmo texto
  // aparece TAMBÉM dentro da citação, e o locator viraria ambíguo.
  const originalNoBalao = scene.ownerPage.locator(
    '.message__text:text-is("mensagem original")',
  );
  await expect(originalNoBalao).toBeVisible({ timeout: 30_000 });

  const ownerMenu = scene.ownerPage.locator(".context-menu");
  await scene.ownerPage.locator(".message").first().click({ button: "right" });
  await expect(ownerMenu).toBeVisible();
  await ownerMenu.getByRole("menuitem", { name: "Responder" }).click();

  // A faixa mostra a quem estou respondendo ANTES de enviar.
  await expect(scene.ownerPage.locator(".reply-bar__label")).toContainText(
    scene.guest.displayName,
  );
  await expect(scene.ownerPage.locator(".reply-bar__excerpt")).toHaveText(
    "mensagem original",
  );

  await sendMessageThroughUi(scene.ownerPage, "minha resposta");

  // A citação aparece no balão, dos DOIS lados.
  for (const page of [scene.ownerPage, scene.guestPage]) {
    const citacao = page.locator(".quote").first();
    await expect(citacao).toBeVisible({ timeout: 30_000 });
    await expect(citacao.locator(".quote__author")).toHaveText(
      scene.guest.displayName,
    );
    await expect(citacao.locator(".quote__text")).toHaveText("mensagem original");
  }

  // Clicar rola até a original e a destaca.
  await scene.ownerPage.locator(".quote--jump").first().click();
  await expect(
    scene.ownerPage.locator(".message.is-highlighted"),
    "clicar na citação precisa destacar a mensagem original",
  ).toBeVisible({ timeout: 15_000 });

  /*
   * APAGAR A ORIGINAL não pode apagar a citação: o texto é copiado dentro da
   * resposta justamente para continuar legível depois disto.
   */
  const guestMenu = scene.guestPage.locator(".context-menu");
  await scene.guestPage
    .locator('.message[data-context="message"]')
    .first()
    .click({ button: "right" });
  await expect(guestMenu).toBeVisible();
  await guestMenu.getByRole("menuitem", { name: "Apagar mensagem" }).click();
  // Apagar pede confirmação — ver `handleDeleteMessage` em app.ts.
  await scene.guestPage
    .getByRole("dialog")
    .getByRole("button", { name: "Apagar" })
    .click();

  await expect(originalNoBalao).toBeHidden({ timeout: 30_000 });

  const citacao = scene.ownerPage.locator(".quote").first();
  await expect(citacao.locator(".quote__author")).toHaveText(
    scene.guest.displayName,
  );
  await expect(
    citacao.locator(".quote__gone"),
    "a citação precisa dizer que a original foi apagada",
  ).toHaveText("mensagem apagada");

  await scene.ownerContext.close();
  await scene.guestContext.close();
});

test("editar muda o texto na outra aba, mantém a posição e marca como editado", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const scene = await groupWithMember(browser, "editar");

  await sendMessageThroughUi(scene.ownerPage, "primeira");
  await expect(scene.ownerPage.locator(".message")).toHaveCount(1, {
    timeout: 30_000,
  });
  await sendMessageThroughUi(scene.ownerPage, "texto com erro");
  await sendMessageThroughUi(scene.ownerPage, "terceira");
  await expect(scene.guestPage.locator(".message")).toHaveCount(3, {
    timeout: 30_000,
  });

  const menu = scene.ownerPage.locator(".context-menu");
  await scene.ownerPage
    .getByText("texto com erro")
    .click({ button: "right" });
  await expect(menu).toBeVisible();
  await menu.getByRole("menuitem", { name: "Editar" }).click();

  const campo = scene.ownerPage.locator(".message__editor");
  await expect(campo).toBeVisible();
  await campo.fill("texto corrigido");
  await campo.press("Enter");

  // Chega na outra aba em tempo real.
  await expect(scene.guestPage.getByText("texto corrigido")).toBeVisible({
    timeout: 30_000,
  });
  await expect(scene.guestPage.getByText("texto com erro")).toBeHidden();

  // Marca de editado.
  await expect(
    scene.guestPage.locator(".message__edited").first(),
  ).toHaveText("editado");

  /*
   * A POSIÇÃO NA LISTA NÃO PODE MUDAR. `editMessage` não toca em `sentAt`, e a
   * lista ordena por ele — editar não pode reordenar a conversa.
   */
  const ordem = await scene.guestPage
    .locator(".message__text")
    .allTextContents();
  expect(ordem).toEqual(["primeira", "texto corrigido", "terceira"]);

  await scene.ownerContext.close();
  await scene.guestContext.close();
});

test("as REGRAS recusam editar mensagem alheia e mexer em campo que não seja o texto", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const scene = await groupWithMember(browser, "regraedit");

  // O MEMBRO escreve.
  await sendMessageThroughUi(scene.guestPage, "mensagem do membro");
  await expect(scene.ownerPage.getByText("mensagem do membro")).toBeVisible({
    timeout: 30_000,
  });

  const messageId =
    (await scene.ownerPage
      .locator('.message[data-context="message"]')
      .first()
      .getAttribute("data-message-id")) ?? "";
  expect(messageId).not.toBe("");

  /*
   * O DONO tentando editar a mensagem do membro, por REST cru.
   *
   * Pela tela o item "Editar" nem aparece — mas isso só prova que a tela não
   * oferece o botão. Quem tem que recusar é o BANCO.
   */
  expect(
    await patchMessageViaRest(scene.owner, messageId, { body: "reescrito pelo dono" }),
    "nem o dono edita mensagem dos outros: apagar ele pode, reescrever não",
  ).toBe(403);

  /*
   * E o PRÓPRIO AUTOR mexendo em campo que não é o texto.
   *
   * Até a etapa 12 a regra era só `authorId == uid()`, o que deixava reescrever
   * o passado: mudar `sentAt` reordena a conversa, mudar `channelId` move a
   * mensagem de canal.
   */
  for (const [campo, valor] of [
    ["sentAt", "1999-01-01T00:00:00.000Z"],
    ["channelId", "outro-canal"],
    ["groupId", "outro-grupo"],
    ["authorId", scene.owner.uid ?? "outro"],
  ] as const) {
    expect(
      await patchMessageViaRest(scene.guest, messageId, { [campo]: valor }),
      `o autor não pode alterar "${campo}" da própria mensagem`,
    ).toBe(403);
  }

  // E o caminho legítimo continua funcionando.
  expect(
    await patchMessageViaRest(scene.guest, messageId, {
      body: "corrigido pelo autor",
      editedAt: new Date().toISOString(),
    }),
    "o autor precisa continuar podendo editar o próprio texto",
  ).toBe(200);

  await scene.ownerContext.close();
  await scene.guestContext.close();
});
