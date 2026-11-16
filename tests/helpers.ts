import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * Apoio dos testes: contas descartáveis de verdade no projeto real, e a limpeza
 * que apaga tudo o que elas criarem.
 *
 * A apiKey é a mesma do cliente — pública por definição num app web.
 */

const API_KEY = "AIzaSyBJhEOubcXL4DAg6TXHu4K0n2gcwrDy0iw";
const PROJECT = "loft-3d6c0f";

/*
 * EMULADOR OU PROJETO REAL — as duas variáveis abaixo são definidas pelo próprio
 * `firebase emulators:exec`, não por nós. Ausentes, estas bases apontam para o
 * projeto REAL, que é o lado seguro do erro.
 *
 * O emulador de Auth serve os mesmos caminhos do `identitytoolkit` sob o host
 * dele, então só a base muda. E ele IGNORA a `API_KEY` — ela continua sendo
 * enviada porque não atrapalha, e tirá-la criaria um caso especial à toa.
 */
const AUTH_HOST = process.env["FIREBASE_AUTH_EMULATOR_HOST"];
const FS_HOST = process.env["FIRESTORE_EMULATOR_HOST"];

export const USING_EMULATOR = AUTH_HOST !== undefined && FS_HOST !== undefined;

const IDP =
  AUTH_HOST === undefined
    ? "https://identitytoolkit.googleapis.com/v1/accounts"
    : `http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts`;

const FS_ROOT =
  FS_HOST === undefined ? "https://firestore.googleapis.com/v1" : `http://${FS_HOST}/v1`;

const FS = `${FS_ROOT}/projects/${PROJECT}/databases/(default)/documents`;

export interface TestAccount {
  email: string;
  password: string;
  displayName: string;
  uid?: string;
  idToken?: string;
}

let counter = 0;

export function newAccount(label: string): TestAccount {
  counter += 1;
  const tag = `${Date.now().toString(36)}-${counter}`;
  return {
    email: `loft-e2e-${tag}@example.com`,
    password: "senha-de-teste-123",
    displayName: `Teste ${label}`,
  };
}

/* -------------------------------------------------------------------------- */
/* Fluxos pela UI                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Marca o e-mail da conta como confirmado, pela API de ADMIN do emulador.
 *
 * A partir da etapa 14 as REGRAS exigem `email_verified` para reservar `@`,
 * mandar pedido de amizade e criar grupo. Sem este passo, a suíte inteira para
 * na criação do primeiro grupo — não por defeito, mas porque nenhuma conta de
 * teste jamais confirmou e-mail.
 *
 * `Bearer owner` é o token de admin que o emulador aceita. Em produção não
 * existe equivalente, e é por isso que o `check:indexes` usa uma conta fixa já
 * verificada à mão — ver tests/indexes.spec.ts.
 */
export async function markEmailVerified(account: TestAccount): Promise<void> {
  if (!USING_EMULATOR) return;
  if (account.uid === undefined) await resolveTokens(account);
  if (account.uid === undefined) return;

  await fetch(
    `http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:update`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer owner",
      },
      body: JSON.stringify({ localId: account.uid, emailVerified: true }),
    },
  );

  /*
   * O TOKEN EM MÃOS AINDA DIZ `email_verified: false`.
   *
   * As regras leem o CLAIM do token, não o banco de contas — então marcar a
   * conta não basta: é preciso pegar um token novo. Reautenticar é o jeito mais
   * direto, e o `idToken` guardado é justamente o que os testes de REST usam.
   */
  await resolveTokens(account);
}

/**
 * Preenche o CADASTRO (desde 15/11/2026: nome de exibição, nome de usuário,
 * e-mail, senha e repetir senha) e envia. O `@` nasce aqui, junto.
 */
export async function fillSignUpForm(page: Page, account: TestAccount): Promise<void> {
  await page.getByRole("button", { name: "Criar conta" }).click();
  await page.getByLabel("Nome de exibição").fill(account.displayName);
  await page.getByLabel("Nome de usuário").fill(usernameFor(account));
  await page.getByLabel("E-mail").fill(account.email);
  await page.getByLabel("Senha", { exact: true }).fill(account.password);
  await page.getByLabel("Repetir senha").fill(account.password);
  await page.getByRole("button", { name: "Criar conta" }).click();
}

/*
 * A TELA DE ESCOLHER `@` NÃO PODE APARECER num cadastro normal: o `@` do
 * formulário é reservado sozinho quando o e-mail é confirmado. Ela só existe
 * para o caso raro de alguém pegar o nome nesse meio-tempo — se aparecer aqui,
 * a reserva automática falhou, e o teste diz isso em vez de seguir.
 */
async function expectUsernameReservedAutomatically(page: Page, account: TestAccount): Promise<void> {
  await expect(page.getByText("Confirme seu e-mail")).toBeHidden({ timeout: 30_000 });
  const telaDoArroba = page.getByRole("heading", { name: "Seu nome de usuário" });
  if (await telaDoArroba.isVisible().catch(() => false)) {
    throw new Error(
      `a reserva automática do @ "${usernameFor(account)}" falhou: ` +
        `${await page.locator(".username__error").textContent()}`,
    );
  }
}

/** Cria a conta pela própria tela de cadastro — exercita o formulário de verdade. */
export async function signUpThroughUi(
  page: Page,
  account: TestAccount,
): Promise<void> {
  await fillSignUpForm(page, account);

  /*
   * O CADASTRO PARA NA CONFIRMAÇÃO DE E-MAIL (etapa 14).
   *
   * A conta é marcada como confirmada pela API de admin do emulador, e a tela
   * entra sozinha no ciclo seguinte de `reload()` — que é exatamente o
   * comportamento que a pessoa real tem ao clicar no link.
   */
  await expect(page.getByText("Confirme seu e-mail")).toBeVisible({
    timeout: 30_000,
  });
  await markEmailVerified(account);
  await expectUsernameReservedAutomatically(page, account);

  // O estado vazio é a confirmação de que a pessoa entrou mesmo no app.
  await expect(
    page.getByRole("button", { name: "Criar meu primeiro grupo" }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Seu nome de usuário" })).toHaveCount(0);
}

/**
 * Cadastro INLINE, a partir da tela de convite.
 *
 * `decide()` (main.ts) manda por e-mail confirmado, DEPOIS `@` reservado, e só
 * DEPOIS a rota, convite incluso. Este caminho não termina no estado vazio
 * (termina no convite), por isso não reusa `signUpThroughUi` inteiro.
 */
export async function signUpFromInviteUi(
  page: Page,
  account: TestAccount,
): Promise<void> {
  await fillSignUpForm(page, account);
  // A conta precisa EXISTIR antes de marcar o e-mail: marcar cedo demais não
  // acha a conta e não faz nada, calado — e a tela fica presa na confirmação.
  await expect(page.getByText("Confirme seu e-mail")).toBeVisible({
    timeout: 30_000,
  });
  await markEmailVerified(account);
  await expectUsernameReservedAutomatically(page, account);
}

/**
 * Um `@` único e válido para a conta de teste.
 *
 * Sai do e-mail, que já é único por construção (`newAccount`), passado pelo
 * filtro do formato: minúsculas, números, ponto e underline, 3 a 20.
 */
export function usernameFor(account: TestAccount): string {
  return account.email
    .split("@")[0]!
    .toLowerCase()
    .replace(/[^a-z0-9._]/g, "")
    .slice(-20);
}

export async function signInThroughUi(
  page: Page,
  account: TestAccount,
): Promise<void> {
  await page.getByLabel("E-mail").fill(account.email);
  await page.getByLabel("Senha", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  // A engrenagem aparece no computador E no celular (o "sair" some no celular).
  await expect(page.getByRole("button", { name: "Configurações", exact: true })).toBeVisible(
    {
      timeout: 30_000,
    },
  );
}

/**
 * Abre o modal de criar grupo.
 *
 * Há dois gatilhos, e qual existe depende do estado: sem nenhum grupo a tela é
 * o estado vazio ("Criar meu primeiro grupo"); com grupos, é o "+" da barra da
 * esquerda ("Criar grupo").
 */
export async function openCreateGroupDialog(page: Page) {
  const fromEmptyState = page.getByRole("button", {
    name: "Criar meu primeiro grupo",
  });
  // O "+" ao lado dos grupos abre um menu: Criar grupo / Entrar num grupo (16/11/2026).
  const fromRail = page.getByRole("button", {
    name: "Criar ou entrar num grupo",
    exact: true,
  });

  if (await fromEmptyState.isVisible().catch(() => false))
    await fromEmptyState.click();
  else {
    await fromRail.first().click();
    await page.getByRole("menuitem", { name: "Criar grupo", exact: true }).click();
  }

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  return dialog;
}

export async function createGroupThroughUi(
  page: Page,
  name: string,
): Promise<void> {
  const dialog = await openCreateGroupDialog(page);
  await dialog.getByLabel("Nome do grupo").fill(name);
  await dialog.getByRole("button", { name: "Criar grupo" }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });
  await expect(page.locator(".channels__group-name")).toHaveText(name, {
    timeout: 30_000,
  });
}

/** Digita e envia com Enter. */
export async function sendMessageThroughUi(
  page: Page,
  body: string,
): Promise<void> {
  const input = page.locator(".composer__input");
  await input.click();
  await input.fill(body);
  await input.press("Enter");
}

/**
 * Espera a lista de mensagens estar utilizável, e falha DIZENDO POR QUÊ se não estiver.
 *
 * A área de mensagens começa em "Carregando mensagens…" e vira uma de três
 * coisas: a lista, "Nenhuma mensagem ainda", ou um erro. Espera qualquer uma das
 * três antes de julgar — julgar durante a carga seria julgar o estado errado.
 *
 * Não chame `textContent()` no locator do erro antes disso: ele ESPERA o
 * elemento aparecer, então no cenário saudável (sem erro nenhum) ele trava até o
 * timeout do teste em vez de passar. Foi exatamente o que aconteceu aqui.
 */
export async function expectMessagesUsable(page: Page): Promise<void> {
  const error = page.locator(".empty__error");
  const list = page.locator(".messages");
  const empty = page.getByText("Nenhuma mensagem ainda");

  await expect(list.or(empty).or(error).first()).toBeVisible({
    timeout: 30_000,
  });

  if (await error.isVisible()) {
    throw new Error(
      `a leitura das mensagens falhou na tela: ${await error.textContent()}`,
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Limpeza — roda mesmo se a suíte falhar no meio                              */
/* -------------------------------------------------------------------------- */

async function idpCall(
  endpoint: string,
  body: unknown,
): Promise<Record<string, unknown>> {
  const response = await fetch(`${IDP}:${endpoint}?key=${API_KEY}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await response.json()) as Record<string, unknown>;
}

/** Autentica por REST só para obter o idToken necessário ao delete. */
export async function resolveTokens(account: TestAccount): Promise<void> {
  const data = await idpCall("signInWithPassword", {
    email: account.email,
    password: account.password,
    returnSecureToken: true,
  });
  if (typeof data["idToken"] === "string") account.idToken = data["idToken"];
  if (typeof data["localId"] === "string") account.uid = data["localId"];
}

/** Cria a conta direto pela API, sem passar pela UI. */
export async function createAccountViaRest(
  account: TestAccount,
): Promise<void> {
  const data = await idpCall("signUp", {
    email: account.email,
    password: account.password,
    returnSecureToken: true,
  });
  if (typeof data["idToken"] === "string") account.idToken = data["idToken"];
  if (typeof data["localId"] === "string") account.uid = data["localId"];

  // Conta criada por REST também precisa de e-mail confirmado: as regras da
  // etapa 14 valem para ela igual, e ela nunca passa pela tela que confirmaria.
  await markEmailVerified(account);
}

/**
 * Consulta autenticada ao Firestore pela REST, usando o idToken da conta.
 *
 * É assim que os testes de REGRA precisam ser feitos: contornando a UI, do jeito
 * que um ataque real seria. Passar pela tela só provaria que a tela não oferece
 * o botão — não que o banco recusa.
 */
async function runQuery(
  idToken: string,
  collectionId: string,
  fieldPath: string,
  value: string,
  limit = 5,
): Promise<Response> {
  return fetch(`${FS}:runQuery?key=${API_KEY}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId }],
        where: {
          fieldFilter: {
            field: { fieldPath },
            op: "EQUAL",
            value: { stringValue: value },
          },
        },
        limit,
      },
    }),
  });
}

/* -------------------------------------------------------------------------- */
/* Sondas de REGRA — sempre por REST, nunca pela tela                          */
/*                                                                             */
/* Um teste de permissão que passa pela UI só prova que a tela não oferece o    */
/* botão. Estas funções fazem a escrita crua, do jeito que um ataque real       */
/* faria, e devolvem o status HTTP para o teste julgar.                        */
/* -------------------------------------------------------------------------- */

async function tokenOf(account: TestAccount): Promise<string | undefined> {
  if (account.idToken === undefined) await resolveTokens(account);
  return account.idToken;
}

/** Tenta CRIAR um canal direto pela REST. Devolve o status HTTP. */
export async function tryCreateChannelViaRest(
  account: TestAccount,
  groupId: string,
): Promise<number> {
  const idToken = await tokenOf(account);
  if (idToken === undefined) return 0;

  const response = await fetch(`${FS}/channels?key=${API_KEY}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      fields: {
        groupId: { stringValue: groupId },
        name: { stringValue: "canal-invadido" },
        kind: { stringValue: "text" },
        position: { integerValue: "99" },
        createdAt: { stringValue: new Date().toISOString() },
      },
    }),
  });
  return response.status;
}

/** Tenta APAGAR um documento direto pela REST. Devolve o status HTTP. */
export async function tryDeleteViaRest(
  account: TestAccount,
  collectionId: string,
  docId: string,
): Promise<number> {
  const idToken = await tokenOf(account);
  if (idToken === undefined) return 0;

  const response = await fetch(
    `${FS}/${collectionId}/${docId}?key=${API_KEY}`,
    {
      method: "DELETE",
      headers: { authorization: `Bearer ${idToken}` },
    },
  );
  return response.status;
}

/** Ids dos canais de um grupo, para o teste de apagar canal. */
export async function groupChannelIds(
  account: TestAccount,
  groupId: string,
): Promise<string[]> {
  const idToken = await tokenOf(account);
  if (idToken === undefined) return [];

  const response = await runQuery(idToken, "channels", "groupId", groupId, 20);
  if (!response.ok) return [];
  const rows = (await response.json()) as { document?: { name: string } }[];
  return rows
    .map((row) => row.document?.name.split("/").pop())
    .filter((id): id is string => id !== undefined);
}

/**
 * Entra num grupo pela REST, sem passar pela tela.
 *
 * Existe para encher uma sala de voz sem abrir cinco navegadores: o teste de
 * "sala cheia" precisa de gente ocupando lugar, não de gente clicando.
 */
export async function joinGroupViaRest(
  account: TestAccount,
  groupId: string,
  inviteCode: string,
): Promise<number> {
  const idToken = await tokenOf(account);
  if (idToken === undefined || account.uid === undefined) return 0;

  const id = `${groupId}_${account.uid}`;
  const response = await fetch(
    `${FS}/memberships?documentId=${id}&key=${API_KEY}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        fields: {
          groupId: { stringValue: groupId },
          memberId: { stringValue: account.uid },
          role: { stringValue: "member" },
          joinedAt: { stringValue: new Date().toISOString() },
          inviteCode: { stringValue: inviteCode },
        },
      }),
    },
  );
  return response.status;
}

/**
 * Lê um documento qualquer pela REST. Devolve status E conteúdo.
 *
 * O status é o que interessa nos testes de regra: 403 prova que o banco recusou
 * — e recusar é diferente de devolver vazio, que seria indistinguível de "não
 * existe".
 */
export async function readDocViaRest(
  account: TestAccount,
  path: string,
): Promise<{ status: number; fields?: Record<string, { stringValue?: string }> }> {
  const idToken = await tokenOf(account);
  if (idToken === undefined) return { status: 0 };

  const response = await fetch(`${FS}/${path}?key=${API_KEY}`, {
    headers: { authorization: `Bearer ${idToken}` },
  });
  if (!response.ok) return { status: response.status };
  const data = (await response.json()) as {
    fields?: Record<string, { stringValue?: string }>;
  };
  return { status: response.status, fields: data.fields };
}

/** Cria/sobrescreve um documento pela REST. É o "contornar a UI" dos testes. */
export async function putDocViaRest(
  account: TestAccount,
  path: string,
  fields: Record<string, string>,
): Promise<number> {
  const idToken = await tokenOf(account);
  if (idToken === undefined) return 0;

  /*
   * `documentId` num POST na COLEÇÃO, e não PATCH no documento.
   *
   * PATCH criaria o documento também, mas passaria pela regra de `update` —
   * e o que estes testes precisam provar é a regra de `create`.
   */
  const corte = path.lastIndexOf("/");
  const colecao = path.slice(0, corte);
  const id = path.slice(corte + 1);

  const response = await fetch(
    `${FS}/${colecao}?documentId=${encodeURIComponent(id)}&key=${API_KEY}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        fields: Object.fromEntries(
          Object.entries(fields).map(([name, value]) => [name, { stringValue: value }]),
        ),
      }),
    },
  );
  return response.status;
}

/** Altera campos de um documento qualquer, com máscara. Ver `patchMessageViaRest`. */
export async function patchDocViaRest(
  account: TestAccount,
  path: string,
  fields: Record<string, string>,
): Promise<number> {
  const idToken = await tokenOf(account);
  if (idToken === undefined) return 0;

  const mask = Object.keys(fields)
    .map((name) => `updateMask.fieldPaths=${name}`)
    .join("&");

  const response = await fetch(`${FS}/${path}?${mask}&key=${API_KEY}`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      fields: Object.fromEntries(
        Object.entries(fields).map(([name, value]) => [name, { stringValue: value }]),
      ),
    }),
  });
  return response.status;
}

/**
 * Altera campos de uma mensagem pela REST, contornando a tela.
 *
 * `updateMask` é o que torna isto um teste de REGRA de verdade: sem ela o
 * Firestore substituiria o documento inteiro, e o `hasOnly` recusaria por um
 * motivo diferente do que se quer provar. Com a máscara, o PATCH toca
 * EXATAMENTE os campos listados — que é o ataque real.
 */
export async function patchMessageViaRest(
  account: TestAccount,
  messageId: string,
  fields: Record<string, string>,
): Promise<number> {
  const idToken = await tokenOf(account);
  if (idToken === undefined) return 0;

  const mask = Object.keys(fields)
    .map((name) => `updateMask.fieldPaths=${name}`)
    .join("&");

  const response = await fetch(
    `${FS}/messages/${messageId}?${mask}&key=${API_KEY}`,
    {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        fields: Object.fromEntries(
          Object.entries(fields).map(([name, value]) => [name, { stringValue: value }]),
        ),
      }),
    },
  );
  return response.status;
}

/**
 * Roda uma consulta COMPOSTA pela REST e devolve o que o Firestore disse.
 *
 * Existe para `check:indexes` poder AFIRMAR que cada consulta do produto tem
 * índice, em vez de esperar que um erro apareça no console. A diferença
 * importa: um teste que só escuta pode passar porque nada foi dito, e aí ele
 * não prova nada.
 *
 * A conta precisa ser MEMBRO do grupo consultado. Medido na etapa 12: a regra
 * recusa antes de o Firestore avaliar o índice, então uma sonda de não-membro
 * leva 403 e nunca chega ao erro que interessa.
 */
export async function probeQuery(
  account: TestAccount,
  spec: {
    collection: string;
    equals: Record<string, string>;
    /**
     * Filtro `array-contains` — a forma de `subscribeDmThreads` (etapa 18),
     * que não é igualdade. Separado de `equals` porque o Firestore trata os
     * dois operadores como coisas diferentes na REST, e juntar os dois num
     * `Record<string,string>` só esconderia a distinção que importa aqui.
     */
    arrayContains?: { fieldPath: string; value: string };
    /**
     * Ausente quando a consulta REAL não ordena no servidor.
     *
     * Espelhar a forma exata importa: uma sonda que inventa um `orderBy` que o
     * produto não faz acusa índice faltando onde não falta. Aconteceu aqui com
     * `channels`, que ordena no CLIENTE (ver subscribeChannels).
     */
    orderBy?: string;
    direction?: "ASCENDING" | "DESCENDING";
  },
): Promise<{ status: number; message: string }> {
  const idToken = await tokenOf(account);
  if (idToken === undefined) return { status: 0, message: "sem token" };

  const filters = [
    ...Object.entries(spec.equals).map(([fieldPath, value]) => ({
      fieldFilter: { field: { fieldPath }, op: "EQUAL", value: { stringValue: value } },
    })),
    ...(spec.arrayContains === undefined
      ? []
      : [
          {
            fieldFilter: {
              field: { fieldPath: spec.arrayContains.fieldPath },
              op: "ARRAY_CONTAINS",
              value: { stringValue: spec.arrayContains.value },
            },
          },
        ]),
  ];

  const response = await fetch(`${FS}:runQuery?key=${API_KEY}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: spec.collection }],
        where:
          filters.length === 1
            ? filters[0]
            : { compositeFilter: { op: "AND", filters } },
        ...(spec.orderBy === undefined
          ? {}
          : {
              orderBy: [
                {
                  field: { fieldPath: spec.orderBy },
                  direction: spec.direction ?? "DESCENDING",
                },
              ],
            }),
        limit: 1,
      },
    }),
  });

  return {
    status: response.status,
    message: (await response.text()).replace(/\s+/g, " ").trim(),
  };
}

/**
 * A LIMPEZA INTEIRA, numa chamada só — e a conta do Auth sai mesmo se os
 * documentos não saírem.
 *
 * A ordem antiga era `cleanupFirestore` e DEPOIS o laço de `deleteAccount`, os
 * dois soltos no `afterAll`. Bastava a faxina de documentos estourar — rede,
 * cota, timeout do `afterAll` — para o laço nunca acontecer: as contas ficavam
 * no Auth, e com elas documentos que ninguém mais conseguia apagar, porque toda
 * regra deste projeto pede o dono autenticado. É a origem dos órfãos da etapa 4.
 *
 * Agora a remoção das contas é o passo que NÃO pode ser pulado, e o que ficou
 * para trás é dito em voz alta no fim, com nome e número. Uma limpeza que falha
 * calada é pior do que uma que não roda: ninguém vai atrás do que não sabe que
 * existe.
 */
export async function limparTudo(
  accounts: TestAccount[],
  rotulo = "limpeza",
): Promise<void> {
  let documentos = 0;
  const falhas: string[] = [];

  try {
    const resultado = await cleanupFirestore(accounts);
    documentos = resultado.removidos;
    falhas.push(...resultado.falhas);
  } catch (erro) {
    // A faxina inteira caiu. As contas continuam tendo que sair.
    falhas.push(`documentos: ${(erro as Error).message}`);
  }

  /*
   * DAQUI PARA BAIXO NADA PODE LANÇAR. `deleteAccount` já devolve booleano em
   * vez de estourar, e é isso que garante que a conta 50 seja tentada mesmo se a
   * conta 3 tiver falhado.
   */
  const restantes: string[] = [];
  for (const account of accounts) {
    if (!(await deleteAccount(account))) restantes.push(account.email);
  }

  console.log(relatoDaLimpeza(rotulo, documentos, accounts.length, restantes, falhas));
}

/**
 * O que a limpeza fez, dito com honestidade.
 *
 * No emulador ela não faz NADA — e dizer "2 contas removidas" quando nada foi
 * removido é a mesma classe de mentira que esta etapa foi consertar: log que
 * descreve um mundo diferente do real.
 */
export function relatoDaLimpeza(
  rotulo: string,
  documentos: number,
  contas: number,
  restantes: string[],
  falhas: string[],
): string {
  if (USING_EMULATOR) {
    return `${rotulo} dispensada: ${contas} contas ficaram no emulador, que some ao desligar`;
  }

  const linhas = [
    `${rotulo}: ${documentos} documentos e ${contas - restantes.length} de ${contas} contas removidos`,
  ];

  if (falhas.length > 0) {
    linhas.push(`  ${falhas.length} conta(s) com falha na faxina de documentos:`);
    for (const falha of falhas) linhas.push(`    - ${falha}`);
  }

  /*
   * O aviso é DELIBERADAMENTE barulhento. Conta que fica no projeto real é
   * cota que continua sendo gasta e documento que vira lixo permanente — não é
   * detalhe de rodapé.
   */
  if (restantes.length > 0) {
    linhas.push(`  !! ${restantes.length} CONTA(S) FICARAM NO PROJETO REAL:`);
    for (const email of restantes) linhas.push(`    - ${email}`);
    linhas.push("  Apague-as no console do Firebase ANTES dos documentos delas.");
  }

  return linhas.join("\n");
}

/**
 * Corta o acesso do app ao Firestore, no modo em que ele estiver.
 *
 * O padrão fixo do domínio de produção só acerta o projeto real — no
 * emulador o host é `127.0.0.1:8080` e o corte simplesmente não acontecia: o
 * grupo era criado com sucesso e o teste ficava esperando um erro que nunca
 * vinha. Manter a regra aqui, e não espalhada nos testes, é o que garante que
 * ela acompanhe o modo.
 */
export async function blockFirestore(page: Page): Promise<void> {
  const alvo =
    FS_HOST === undefined ? "**/firestore.googleapis.com/**" : `**/${FS_HOST}/**`;
  await page.route(alvo, (route) => void route.abort());
}

/**
 * O id do grupo ATIVO, lido do DOM.
 *
 * Substitui `myGroupIds` no caminho quente por um motivo medido: aquela é uma
 * consulta REST de UMA tentativa só, e a `memberships` recém-escrita nem sempre
 * já está no índice de consulta quando ela roda. Numa execução completa isso
 * derrubou 24 testes de uma vez com "não achei o grupo do convidado" — e o
 * grupo estava lá, só não tinha aparecido na query ainda.
 *
 * O DOM não tem esse atraso: se a coluna de canais já mostra o grupo, o cliente
 * já sabe o id. E `toHaveText` no nome do grupo, que sempre vem antes disto, já
 * garantiu que ele chegou.
 */
export async function activeGroupId(page: Page): Promise<string> {
  const id = await page
    .locator('.group-bar__button.is-active')
    .first()
    .getAttribute('data-group-id', { timeout: 15_000 })
    .catch(() => null);
  expect(id, 'o grupo ativo precisa ter data-group-id no DOM').not.toBeNull();
  return id ?? '';
}

/**
 * Escreve uma mensagem direto pela REST, com `sentAt` ESCOLHIDO.
 *
 * O app sempre carimba `sentAt` com o relógio da máquina, então pela interface
 * não há como produzir uma mensagem de ontem ou do ano passado. É o único jeito
 * de testar o separador de data sem mexer no relógio do sistema.
 */
export async function writeMessageAt(
  account: TestAccount,
  fields: { groupId: string; channelId: string; body: string; sentAt: string },
): Promise<number> {
  const idToken = await tokenOf(account);
  if (idToken === undefined || account.uid === undefined) return 0;

  const response = await fetch(`${FS}/messages?key=${API_KEY}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      fields: {
        groupId: { stringValue: fields.groupId },
        channelId: { stringValue: fields.channelId },
        authorId: { stringValue: account.uid },
        kind: { stringValue: "text" },
        body: { stringValue: fields.body },
        sentAt: { stringValue: fields.sentAt },
      },
    }),
  });
  return response.status;
}

/**
 * Escreve um participante de voz direto pela REST, com `lastSeen` escolhido.
 *
 * É o único jeito de testar a expiração do fantasma sem esperar 45 segundos de
 * verdade: injeto um documento já velho e confiro que ninguém o mostra.
 */
export async function writeVoiceParticipant(
  account: TestAccount,
  fields: {
    channelId: string;
    groupId: string;
    lastSeenMsAgo: number;
    sharingScreen?: boolean;
  },
): Promise<number> {
  const idToken = await tokenOf(account);
  if (idToken === undefined || account.uid === undefined) return 0;

  const now = Date.now();
  const body = {
    fields: {
      channelId: { stringValue: fields.channelId },
      groupId: { stringValue: fields.groupId },
      uid: { stringValue: account.uid },
      sessionId: { stringValue: "teste" },
      joinedAt: {
        stringValue: new Date(now - fields.lastSeenMsAgo).toISOString(),
      },
      muted: { booleanValue: false },
      sharingScreen: { booleanValue: fields.sharingScreen === true },
      lastSeen: {
        stringValue: new Date(now - fields.lastSeenMsAgo).toISOString(),
      },
    },
  };

  const id = `${fields.channelId}_${account.uid}`;
  const response = await fetch(
    `${FS}/voiceParticipants?documentId=${id}&key=${API_KEY}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify(body),
    },
  );
  return response.status;
}

/** Ids dos grupos em que a conta é membro. */
export async function myGroupIds(account: TestAccount): Promise<string[]> {
  if (account.idToken === undefined || account.uid === undefined)
    await resolveTokens(account);
  if (account.idToken === undefined || account.uid === undefined) return [];

  const response = await runQuery(
    account.idToken,
    "memberships",
    "memberId",
    account.uid,
  );
  if (!response.ok) return [];
  const rows = (await response.json()) as { document?: { fields?: any } }[];
  return rows
    .map(
      (row) => row.document?.fields?.groupId?.stringValue as string | undefined,
    )
    .filter((id): id is string => id !== undefined);
}

/**
 * A conta consegue ler as mensagens deste grupo?
 *
 * `true` significa que o banco entregou documentos. Com a regra de `messages`
 * valendo, um não-membro tem que receber 403.
 */
export async function canReadGroupMessages(
  account: TestAccount,
  groupId: string,
): Promise<{ readable: boolean; status: number }> {
  if (account.idToken === undefined) await resolveTokens(account);
  if (account.idToken === undefined) return { readable: false, status: 0 };

  const response = await runQuery(
    account.idToken,
    "messages",
    "groupId",
    groupId,
  );
  if (!response.ok) return { readable: false, status: response.status };

  const rows = (await response.json()) as { document?: unknown }[];
  return {
    readable: rows.some((row) => row.document !== undefined),
    status: response.status,
  };
}

/**
 * Apaga a CONTA do Auth. Devolve se ela saiu mesmo.
 *
 * Antes isto devolvia `void` e engolia a resposta do `idpCall`, então uma
 * remoção recusada era indistinguível de uma bem-sucedida — e a suíte anunciava
 * "contas removidas" para contas que continuavam lá. Quem chama precisa poder
 * contar as que ficaram.
 */
export async function deleteAccount(account: TestAccount): Promise<boolean> {
  // Mesma razão de `cleanupFirestore`: no emulador as contas somem com ele.
  if (USING_EMULATOR) return true;

  if (account.idToken === undefined) {
    try {
      await resolveTokens(account);
    } catch {
      /*
       * Não dá para autenticar. Pode ser que a conta já não exista — o caso bom
       * — ou que a rede tenha falhado. Como não há como distinguir daqui, o
       * relato é conservador: NÃO confirmo remoção.
       */
      return false;
    }
  }
  if (account.idToken === undefined) return false;

  try {
    const resposta = await idpCall("delete", { idToken: account.idToken });
    return resposta["error"] === undefined;
  } catch {
    return false;
  }
}

const docPath = (collectionId: string, id: string): string =>
  `projects/${PROJECT}/databases/(default)/documents/${collectionId}/${id}`;

/** Consulta autenticada por igualdade, paginando até o fim. */
async function queryDocs(
  idToken: string,
  collectionId: string,
  fieldPath: string,
  value: string,
): Promise<{ name: string; fields: any }[]> {
  const response = await runQuery(idToken, collectionId, fieldPath, value, 300);
  if (!response.ok) return [];
  const rows = (await response.json()) as {
    document?: { name: string; fields: any };
  }[];
  return rows
    .map((row) => row.document)
    .filter(
      (document): document is { name: string; fields: any } =>
        document !== undefined,
    );
}

/** Apaga um documento AUTENTICADO. Devolve se saiu mesmo. */
async function authedDelete(idToken: string, name: string): Promise<boolean> {
  const response = await fetch(
    // FS_ROOT, e não a URL de produção na mão: só a limpeza usa esta função e
    // ela nem roda no emulador, mas deixar um endereço fixo de produção aqui é
    // uma armadilha esperando a próxima pessoa reaproveitar a função.
    `${FS_ROOT}/${name}?key=${API_KEY}`,
    {
      method: "DELETE",
      headers: { authorization: `Bearer ${idToken}` },
    },
  );
  return response.ok;
}

/**
 * Apaga o que as contas de teste criaram, AUTENTICADO e conta por conta.
 *
 * Antes das regras isto varria as coleções inteiras sem credencial nenhuma e
 * filtrava no cliente. Com o banco fechado isso não é só proibido — é
 * impossível: `list` sem restrição é negado justamente porque as regras não
 * filtram, então cada consulta aqui precisa restringir o campo que a regra
 * examina. Cada conta apaga o que ela mesma tem permissão de apagar.
 *
 * ORDEM IMPORTA. Quase toda permissão depende de isMember/isOwner, ou seja, da
 * membership e do documento do grupo existirem. Se eu apagasse a membership
 * primeiro, o resto ficaria inalcançável para sempre — lixo permanente no
 * projeto de alguém. Por isso: mensagens e canais, depois convites, depois o
 * grupo, e só então a membership e o perfil.
 */
export async function cleanupFirestore(
  accounts: TestAccount[],
): Promise<{ removidos: number; falhas: string[] }> {
  /*
   * NO EMULADOR NÃO HÁ O QUE LIMPAR: os dados vivem em memória e morrem quando
   * o `emulators:exec` derruba tudo. Rodar a limpeza mesmo assim custava
   * minutos em requisições inúteis — e chegou a estourar o timeout de 60s do
   * `afterAll`, transformando uma faxina desnecessária em teste vermelho.
   */
  if (USING_EMULATOR) return { removidos: 0, falhas: [] };

  let removed = 0;
  const falhas: string[] = [];

  for (const account of accounts) {
    if (account.idToken === undefined || account.uid === undefined) {
      try {
        await resolveTokens(account);
      } catch {
        continue; // conta já pode ter sumido
      }
    }
    const token = account.idToken;
    const uid = account.uid;
    if (token === undefined || uid === undefined) continue;

    /*
     * UMA CONTA QUE FALHA NÃO PODE LEVAR AS OUTRAS JUNTO.
     *
     * Cada volta aqui são dezenas de requisições, e qualquer uma pode cair —
     * rede, cota estourada, regra que mudou. Sem este `catch`, a primeira
     * falha subia e interrompia o laço: as contas seguintes não eram
     * limpas, e o `afterAll` morria ANTES de apagar as contas do Auth. Foi
     * assim que nasceram os documentos órfãos da etapa 4.
     *
     * O que falhou é contado e relatado no fim, não escondido.
     */
    try {

      // A única consulta de memberships que as regras permitem: restringe
      // memberId ao meu uid, que é exatamente o que a regra examina.
      const memberships = await queryDocs(token, "memberships", "memberId", uid);
      const groupIds = memberships
        .map(
          (document) =>
            document.fields?.groupId?.stringValue as string | undefined,
        )
        .filter((id): id is string => id !== undefined);

      for (const groupId of groupIds) {
        // Mensagens, canais e convites. Os três exigem isOwner ou isMember, que
        // leem o documento do grupo — por isso o grupo é o último a sair.
        //
        // Convites passaram a ser DESCOBERTOS por consulta: a regra de `list`
        // deixa o dono listar os do próprio grupo. Antes havia um `trackInvite`
        // aqui, porque `list` era um `false` seco e a limpeza não tinha como saber
        // quais convites existiam. O remendo saiu junto com o motivo dele.
        for (const collectionId of [
          "messages",
          "voiceParticipants",
          "channels",
          "invites",
          "pinnedMessages",
        ] as const) {
          for (const document of await queryDocs(
            token,
            collectionId,
            "groupId",
            groupId,
          )) {
            if (await authedDelete(token, document.name)) removed += 1;
          }
        }

        if (await authedDelete(token, docPath("groups", groupId))) removed += 1;
      }

      for (const document of memberships) {
        if (await authedDelete(token, document.name)) removed += 1;
      }

      if (await authedDelete(token, docPath("users", uid))) removed += 1;
    } catch (erro) {
      falhas.push(`${account.email}: ${(erro as Error).message}`);
    }
  }

  return { removidos: removed, falhas };
}

/**
 * Como `patchDocViaRest`, mas com valores JÁ no formato da REST do Firestore
 * (`{ mapValue: ... }`, `{ arrayValue: ... }`, `{ integerValue: "1" }`) — para
 * testar a regra com mapas, listas e números.
 */
export async function patchDocRawViaRest(
  account: TestAccount,
  path: string,
  fields: Record<string, unknown>,
): Promise<number> {
  const idToken = await tokenOf(account);
  if (idToken === undefined) return 0;
  const mask = Object.keys(fields)
    .map((name) => `updateMask.fieldPaths=${name}`)
    .join("&");
  const response = await fetch(`${FS}/${path}?${mask}&key=${API_KEY}`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ fields }),
  });
  return response.status;
}
