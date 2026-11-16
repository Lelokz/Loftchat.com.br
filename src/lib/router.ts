/**
 * Roteador mínimo sobre a History API. Sem biblioteca.
 *
 * Só duas rotas importam: "/" e "/convite/:codigo". O rewrite `**` →
 * /index.html do Firebase Hosting já garante que abrir o link direto no
 * navegador carrega o app em vez de dar 404.
 */

import { normalizeInviteCode } from './invite-code';

export type Route = { name: 'home' } | { name: 'invite'; code: string };

/** Chave do convite pendente enquanto o visitante ainda não autenticou. */
const PENDING_INVITE_KEY = 'loft:pending-invite';

export function parseRoute(pathname: string): Route {
  const parts = pathname.split('/').filter((part) => part !== '');
  if (parts.length === 2 && parts[0] === 'convite') {
    return { name: 'invite', code: normalizeInviteCode(decodeURIComponent(parts[1]!)) };
  }
  return { name: 'home' };
}

export function currentRoute(): Route {
  return parseRoute(window.location.pathname);
}

export function invitePath(code: string): string {
  return `/convite/${encodeURIComponent(code)}`;
}

/**
 * Tira o código de convite do que a pessoa colou.
 *
 * Aceita as três formas que aparecem na prática, porque quem recebe um convite
 * cola o que estiver na mão e não deveria precisar saber qual delas é a certa:
 *
 *   https://loft-3d6c0f.web.app/convite/ABCD2345   link inteiro
 *   loft-3d6c0f.web.app/convite/ABCD2345           sem protocolo (não vira URL)
 *   ABCD2345                                       só o código
 *
 * Só normaliza — NÃO diz se o código é válido. Quem chama decide isso com
 * isWellFormedInviteCode, que é a mesma checagem que o roteador já usa.
 */
export function extractInviteCode(raw: string): string {
  const text = raw.trim();
  if (text === '') return '';

  try {
    return parseRouteCode(new URL(text).pathname);
  } catch {
    // Não era URL absoluta. Se ainda assim tem o caminho do convite dentro,
    // aproveita; senão é o código solto.
    return text.includes('/convite/') ? parseRouteCode(text) : normalizeInviteCode(text);
  }
}

/** Último segmento depois de /convite/, normalizado. Vazio se não houver. */
function parseRouteCode(pathname: string): string {
  const at = pathname.indexOf('/convite/');
  if (at === -1) return '';
  const route = parseRoute(pathname.slice(at));
  return route.name === 'invite' ? route.code : '';
}

/**
 * O endereço PÚBLICO do site — o link de convite que se manda para alguém. No
 * programa (etapa 9a) a página mora em `app://loftchat`, que ninguém de fora
 * abre; o link vai sempre para o site, e o site leva ao programa (etapa 9b).
 */
export const SITE_PUBLICO = 'https://loftchat.com.br';

export function inviteUrl(code: string): string {
  return `${emSite() ? window.location.origin : SITE_PUBLICO}${invitePath(code)}`;
}

/**
 * Rodando num SITE de verdade? Fora dele: o programa (`app://loftchat`,
 * etapa 9a) e o app Android (Capacitor serve em `https://localhost`, etapa
 * 10a) — endereços que ninguém de fora abre.
 */
export function emSite(): boolean {
  if (!/^https?:$/.test(window.location.protocol)) return false;
  const capacitor = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return capacitor?.isNativePlatform?.() !== true;
}

type RouteListener = (route: Route) => void;

const listeners = new Set<RouteListener>();

/**
 * A última rota que os ouvintes viram.
 *
 * `popstate` no MESMO caminho não é navegação — é a gaveta do mobile
 * desempilhando o próprio estado, ou qualquer outro uso do histórico. Tratar
 * isso como troca de rota fazia o `main.ts` remontar o app inteiro, o que
 * derruba a chamada de voz junto (o `store.dispose()` sai do canal).
 *
 * Isso não era teórico: hoje, sem gaveta nenhuma, apertar o botão de voltar
 * durante uma chamada já a derrubava.
 */
let lastRouteKey: string | null = null;

const routeKey = (route: Route): string =>
  route.name === 'invite' ? `invite:${route.code}` : 'home';

function notify(): void {
  const route = currentRoute();
  const key = routeKey(route);
  if (key === lastRouteKey) return;
  lastRouteKey = key;
  for (const listener of listeners) listener(route);
}

export function onRouteChange(listener: RouteListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Navega sem recarregar a página. `popstate` não dispara em pushState, daí o notify manual. */
export function navigate(path: string): void {
  if (path === window.location.pathname) return;
  window.history.pushState({}, '', path);
  notify();
}

window.addEventListener('popstate', notify);

/* -------------------------------------------------------------------------- */
/* Convite pendente                                                            */
/*                                                                             */
/* sessionStorage e não localStorage: um convite aberto e abandonado não deve   */
/* perseguir a pessoa em outra aba nem no dia seguinte.                        */
/* -------------------------------------------------------------------------- */

export function rememberPendingInvite(code: string): void {
  try {
    sessionStorage.setItem(PENDING_INVITE_KEY, code);
  } catch {
    // Modo privado ou storage bloqueado: o convite só não sobrevive ao login.
  }
}

/** Lê e limpa num passo só — um convite pendente é consumido uma vez. */
export function takePendingInvite(): string | null {
  try {
    const code = sessionStorage.getItem(PENDING_INVITE_KEY);
    if (code !== null) sessionStorage.removeItem(PENDING_INVITE_KEY);
    return code;
  } catch {
    return null;
  }
}
