import './styles/fonts.css';
import './styles/tokens.css';
import './styles/reset.css';
import './styles/layout.css';
import './styles/motion.css';

import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth';
import type { User } from 'firebase/auth';

import { mountApp } from './app';
import type { AppHandle } from './app';
import { renderAuthScreen } from './components/auth/auth-screen';
import { renderChooseUsername } from './components/auth/choose-username';
import { renderVerifyEmail } from './components/auth/verify-email';
import { renderSplash } from './components/auth/splash';
import { closeGroupMenu } from './components/group-menu/group-menu';
import { renderInviteScreen } from './components/invite-screen/invite-screen';
import { USING_EMULATOR } from './lib/firebase';
import { authErrorMessage } from './lib/auth-errors';
import { auth } from './lib/firebase';
import { getInvite, isMemberOf, joinGroup, upsertUserProfile } from './lib/firestore';
import { claimUsername, publicProfile } from './lib/friends';
import { isWellFormedInviteCode } from './lib/invite-code';
import {
  currentRoute,
  navigate,
  onRouteChange,
  rememberPendingInvite,
  takePendingInvite,
} from './lib/router';
import type { Route } from './lib/router';

/**
 * Portão de sessão e roteador.
 *
 * Único lugar que fala com o Firebase Auth, e único que decide qual das telas
 * existe agora: carregando, login, convite ou app.
 */

const root = document.querySelector<HTMLDivElement>('#app');
if (root === null) throw new Error('Elemento #app não encontrado no index.html.');
const mount = root;

/** `undefined` = o Firebase ainda não respondeu quem é o usuário. */
let currentUser: User | null | undefined = undefined;
let route: Route = currentRoute();
let app: AppHandle | null = null;

/**
 * Segura o render durante o cadastro: `createUserWithEmailAndPassword` dispara
 * `onAuthStateChanged` ANTES de o `updateProfile` rodar, e sem esta trava o app
 * apareceria por um instante com o displayName vazio.
 */
let signingUp = false;

/**
 * O `@` desta sessão: `null` = ainda não sei, e é o que segura a entrada.
 *
 * Guardado aqui em vez de relido a cada `decide()` porque `decide()` roda a
 * cada mudança de rota — uma leitura do Firestore por navegação seria um
 * desperdício silencioso.
 */
let username: string | null = null;
let usernameLoading = false;

/** Descobre o `@` uma vez por sessão; sem ele, manda escolher. */
async function resolveUsername(user: User): Promise<void> {
  if (usernameLoading) return;
  usernameLoading = true;
  showScreen(renderSplash());
  try {
    const perfil = await publicProfile(user.uid);
    if (perfil?.username !== undefined && perfil.username !== '') {
      username = perfil.username;
      decide();
      return;
    }
    void showChooseUsername(user);
  } catch (error) {
    handleFatalError(error);
  } finally {
    usernameLoading = false;
  }
}

/** Uid de quem o app montado pertence — ver showApp. */
let appUserId: string | null = null;

function teardownApp(): void {
  closeGroupMenu();
  app?.destroy();
  app = null;
  appUserId = null;
}

function showScreen(view: HTMLElement): void {
  teardownApp();
  mount.className = 'screen';
  mount.replaceChildren(view);
}

function handleSignOut(): void {
  void signOut(auth);
}

/** Erro num listener do Firestore: registra e devolve a pessoa para uma tela sã. */
function handleFatalError(error: unknown): void {
  console.error('Falha ao ouvir o Firestore.', error);
}

/* -------------------------------------------------------------------------- */
/* Telas                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Mostra o app. IDEMPOTENTE de propósito.
 *
 * Já montado para o mesmo usuário, não desmonta nada. Sem esta guarda, qualquer
 * caminho que chamasse `decide()` de novo — botão de voltar, gaveta do mobile,
 * um evento futuro — arrastaria junto `teardownApp()` → `store.dispose()` →
 * SAIR DO CANAL DE VOZ. Uma remontagem invisível derrubando uma conversa em
 * andamento é o tipo de defeito que ninguém liga ao botão que o causou.
 */
function showApp(user: User): void {
  if (app !== null && appUserId === user.uid) {
    mount.className = '';
    return;
  }
  teardownApp();
  app = mountApp(user, handleFatalError, handleSignOut);
  appUserId = user.uid;
  mount.className = '';
  mount.replaceChildren(app.element);
}

/**
 * De quanto em quanto tempo a tela de confirmação pergunta ao Firebase se o
 * e-mail já foi confirmado.
 *
 * `reload()` não é barato nem grátis, mas 4s é o que separa "abri o link e o
 * app entrou sozinho" de "abri o link e tive que fazer login de novo" — que é
 * exatamente a fricção que faz alguém desistir no cadastro.
 */
const VERIFY_POLL_MS = 4000;

let verifyTimer = 0;

function stopVerifyPolling(): void {
  if (verifyTimer !== 0) {
    window.clearInterval(verifyTimer);
    verifyTimer = 0;
  }
  document.removeEventListener('visibilitychange', onVisibilityCheck);
}

/**
 * Garante um ID token com `email_verified` batendo com o registro, UMA VEZ
 * por conta.
 *
 * `reload()` atualiza o REGISTRO, não o token — e é o TOKEN que as regras leem
 * (`verified()` em firestore.rules). Sem isto a primeira escrita depois da
 * confirmação (reservar o `@`) é negada, `claimUsername` cai no caminho de
 * desambiguação e reporta recusa do servidor — um defeito medido em produção
 * na prática, não só em teste.
 *
 * ISTO NÃO É SÓ DO POLLING. Foi por isso que existir apenas dentro do
 * `setInterval` não bastava: o SDK às vezes entrega `emailVerified: true` já
 * atualizado direto pelo `onAuthStateChanged`, sem o polling nunca chegar a
 * rodar — e nesse caminho ninguém forçava o token novo. As DUAS entradas
 * passam por aqui agora. `getIdTokenResult()` sem forçar usa o cache se ainda
 * for válido — só busca um token novo de verdade quando o claim em cache
 * ainda não bateu, então quem já estava verificado antes desta sessão não
 * paga a viagem extra.
 */
let tokenRefreshedForUid: string | null = null;

async function ensureFreshToken(user: User): Promise<void> {
  if (!user.emailVerified || tokenRefreshedForUid === user.uid) return;
  const cached = await user.getIdTokenResult();
  if (cached.claims['email_verified'] !== true) {
    await user.getIdToken(true);
  }
  tokenRefreshedForUid = user.uid;
}

/** Confere agora — chamado pelo tick do intervalo e por `onVisibilityCheck`. */
function checkVerification(user: User): void {
  void user.reload().then(async () => {
    if (auth.currentUser?.emailVerified !== true) return;
    stopVerifyPolling();
    await ensureFreshToken(auth.currentUser);
    currentUser = auth.currentUser;
    decide();
  });
}

/**
 * Confere na hora quando a aba volta a ficar visível.
 *
 * Quem confirma o e-mail quase sempre volta para esta aba logo em seguida —
 * esperar o próximo tick do intervalo (até 4s) é olhar para uma tela parada
 * bem no momento em que a pessoa está de olho nela.
 */
function onVisibilityCheck(): void {
  if (document.visibilityState !== 'visible') return;
  const user = auth.currentUser;
  if (user !== null) checkVerification(user);
}

/**
 * O portão da confirmação de e-mail.
 *
 * Fica ENTRE o login e o app: enquanto `emailVerified` for falso a pessoa não
 * escolhe `@`, não manda pedido e não vê grupo. E as regras cobram o mesmo no
 * banco — verificar só aqui não protegeria nada contra quem contorna a tela.
 */
function showVerifyEmail(user: User): void {
  stopVerifyPolling();
  showScreen(
    renderVerifyEmail({
      email: user.email ?? '',
      onResend: async () => {
        try {
          await sendEmailVerification(user);
        } catch (error) {
          throw new Error(authErrorMessage(error));
        }
      },
      onSignOut: handleSignOut,
    }),
  );

  verifyTimer = window.setInterval(() => checkVerification(user), VERIFY_POLL_MS);
  document.addEventListener('visibilitychange', onVisibilityCheck);
}

/**
 * O portão do `@`, depois da confirmação.
 *
 * Quem já tinha conta antes da etapa 14 passa por aqui na primeira entrada, sem
 * poder pular: sem `@` a pessoa é inencontrável, e uma conta inencontrável no
 * meio de uma tela de amigos é só confusão.
 */
async function showChooseUsername(user: User): Promise<void> {
  showScreen(
    renderChooseUsername({
      onChoose: async (name) => {
        const perfil = await publicProfile(user.uid);
        await claimUsername(user.uid, name, null, perfil?.usernameChanges ?? 0);
        username = name;
        decide();
      },
      onSignOut: handleSignOut,
    }),
  );
}

function showAuth(): void {
  showScreen(
    renderAuthScreen({
      onSignIn: handleSignIn,
      onSignUp: handleSignUp,
      onResetPassword: handlePasswordReset,
    }),
  );
}

async function showInvite(user: User, code: string): Promise<void> {
  showScreen(renderSplash());

  if (!isWellFormedInviteCode(code)) {
    showScreen(
      renderInviteScreen({
        groupName: null,
        alreadyMember: false,
        onAccept: () => Promise.resolve(),
        onDecline: () => navigate('/'),
      }),
    );
    return;
  }

  let groupName: string | null = null;
  let groupId: string | null = null;
  let alreadyMember = false;

  try {
    const invite = await getInvite(code);
    if (invite !== null) {
      // O nome vem do CONVITE, não do grupo: as regras só deixam membros lerem
      // o documento do grupo, e quem está abrindo o convite ainda não é membro.
      groupId = invite.groupId;
      groupName = invite.groupName === '' ? 'um grupo' : invite.groupName;
      alreadyMember = await isMemberOf(invite.groupId, user.uid);
    }
  } catch (error) {
    console.error('Não foi possível carregar o convite.', error);
  }

  // Só mostra se a rota ainda é esta — a pessoa pode ter navegado enquanto isso.
  if (route.name !== 'invite' || route.code !== code) return;

  showScreen(
    renderInviteScreen({
      groupName,
      alreadyMember,
      onAccept: async () => {
        if (groupId === null) return;
        // O código vai junto: é a única forma de a regra saber que existe um
        // convite válido para este grupo.
        await joinGroup(groupId, user.uid, code);
        pendingGroupFocus = groupId;
        navigate('/');
      },
      onDecline: () => navigate('/'),
    }),
  );
}

/** Grupo a selecionar assim que o app montar, logo depois de aceitar um convite. */
let pendingGroupFocus: string | null = null;

/* -------------------------------------------------------------------------- */
/* Decisão de tela                                                             */
/* -------------------------------------------------------------------------- */

function decide(): void {
  if (signingUp) return;

  if (currentUser === undefined) {
    showScreen(renderSplash());
    return;
  }

  if (currentUser === null) {
    // Guarda o convite para retomar depois do login.
    if (route.name === 'invite') rememberPendingInvite(route.code);
    showAuth();
    return;
  }

  /*
   * A ORDEM IMPORTA: e-mail antes de `@`, `@` antes de tudo.
   *
   * Deixar escolher o `@` antes de confirmar o e-mail seria o buraco central
   * desta etapa — dá para cadastrar com e-mail alheio, tomar o nome, e ele fica
   * preso numa conta que ninguém controla.
   */
  if (!currentUser.emailVerified) {
    showVerifyEmail(currentUser);
    return;
  }
  stopVerifyPolling();

  if (username === null) {
    void resolveUsername(currentUser);
    return;
  }

  if (route.name === 'invite') {
    void showInvite(currentUser, route.code);
    return;
  }

  showApp(currentUser);

  if (pendingGroupFocus !== null && app !== null) {
    // O store ainda vai receber a membership nova pelo listener; focar aqui
    // garante que o grupo recém-aceito é o selecionado assim que ele chegar.
    const groupId = pendingGroupFocus;
    pendingGroupFocus = null;
    window.setTimeout(() => app?.focusGroup(groupId), 0);
  }
}

/* -------------------------------------------------------------------------- */
/* Auth                                                                        */
/* -------------------------------------------------------------------------- */

async function handleSignIn(email: string, password: string): Promise<void> {
  try {
    const credential = await signInWithEmailAndPassword(auth, email, password);
    await upsertUserProfile(
      credential.user.uid,
      credential.user.displayName ?? credential.user.email ?? 'Sem nome',
    );
  } catch (error) {
    throw new Error(authErrorMessage(error));
  }
}

/**
 * Manda o link de recuperação e NUNCA conta se o e-mail existe.
 *
 * O erro é engolido de propósito: `auth/user-not-found` propagado viraria uma
 * mensagem diferente na tela, e aí esta tela passaria a responder "essa pessoa
 * tem conta no Loft?" para qualquer um — que é como se monta lista para
 * phishing. Falha de rede também some junto; é o preço de não vazar nada.
 */
async function handlePasswordReset(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email).catch(() => {
    /* silêncio proposital — ver acima */
  });
}

async function handleSignUp(displayName: string, email: string, password: string): Promise<void> {
  signingUp = true;
  try {
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(credential.user, { displayName });
    await upsertUserProfile(credential.user.uid, displayName);
    // O link de confirmação sai JUNTO do cadastro: a tela seguinte já é a de
    // "confirme seu e-mail", e ela ficaria sem sentido se nada tivesse sido
    // enviado ainda.
    await sendEmailVerification(credential.user).catch(() => {
      /* o botão de reenviar cobre a falha; travar o cadastro aqui seria pior */
    });
  } catch (error) {
    signingUp = false;
    throw new Error(authErrorMessage(error));
  }
  signingUp = false;

  currentUser = auth.currentUser;
  /*
   * TERCEIRO lugar que precisa do token fresco antes de decidir — os outros
   * dois são `checkVerification` (polling/visibilitychange) e
   * `onAuthStateChanged`. Este aqui existe porque `onAuthStateChanged` pode
   * disparar DURANTE o cadastro (com `signingUp` ainda `true`, guarda que
   * evita a piscada de tela) e ser descartado — inclusive já com
   * `emailVerified: true`, se a confirmação (numa conta de teste, pela API de
   * admin do emulador) correr mais rápido que o próprio cadastro. Quando isso
   * acontece, é ESTA chamada que segue sozinha, e sem o refresh aqui ela
   * seguia com o token velho.
   */
  if (currentUser !== null && currentUser.emailVerified) {
    await ensureFreshToken(currentUser);
  }
  decide();
}

/* -------------------------------------------------------------------------- */
/* Início                                                                      */
/* -------------------------------------------------------------------------- */

showScreen(renderSplash());

onRouteChange((next) => {
  route = next;
  decide();
});

onAuthStateChanged(auth, (user) => {
  if (signingUp) return;
  currentUser = user;

  // Convite aberto antes do login: retoma agora que há sessão.
  if (user !== null) {
    const pending = takePendingInvite();
    if (pending !== null) {
      navigate(`/convite/${pending}`);
      route = currentRoute();
    }
  }

  /*
   * O SDK pode entregar `emailVerified: true` já atualizado bem aqui, sem
   * passar pelo polling de `showVerifyEmail` — é a mesma corrida descrita no
   * comentário de `ensureFreshToken`. Sem esperar por ela antes de decidir,
   * `decide()` seguiria com o token velho.
   */
  if (user !== null && user.emailVerified) {
    void ensureFreshToken(user).then(() => decide());
    return;
  }

  decide();
});

/*
 * Registra o service worker — o que torna o Loft instalável.
 *
 * Ele não guarda nada (ver public/sw.js). O `catch` silencioso é de propósito:
 * em `file://`, em navegador sem suporte ou com o registro bloqueado, o app tem
 * que continuar funcionando igual — instalável é um extra, não um requisito.
 */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

/*
 * A TARJA DO EMULADOR.
 *
 * Uma variável de ambiente não se vê, e testar contra o emulador achando que é
 * produção — ou o contrário — é o pior tipo de confusão: os dados somem, ou
 * aparecem onde não deviam, e nada na tela explica.
 *
 * Se esta tarja NÃO está na tela, você está no projeto real. É a única forma de
 * a diferença ser visível sem ir procurar.
 *
 * Não passa por componente nem por estado: ela precisa aparecer mesmo se o app
 * inteiro falhar em montar, que é justamente quando a dúvida aparece.
 */
if (USING_EMULATOR) {
  const tarja = document.createElement('div');
  tarja.className = 'emulator-badge';
  tarja.textContent = 'EMULADOR';
  tarja.title = 'Apontando para o Firebase Emulator Suite — nada aqui vai para o projeto real.';
  document.body.append(tarja);
}
