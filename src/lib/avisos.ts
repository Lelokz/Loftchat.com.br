import { Capacitor, registerPlugin } from '@capacitor/core';
import { deleteField, doc, setDoc, updateDoc } from 'firebase/firestore';

import { auth, db, USING_EMULATOR } from './firebase';

/**
 * NOTIFICAÇÕES DE MENSAGEM (0.4.0).
 *
 * Quem manda uma mensagem chama o CARTEIRO (carteiro/, na Cloudflare), que
 * avisa os outros: no celular pelo Google (FCM), no PC pelo `avisos/{uid}`.
 * Cada aparelho se anota em `aparelhos/{uid}` para receber.
 */

/** No teste, o carteiro roda aqui (tests/carteiro.spec.ts); fora dele, o de verdade. */
export const CARTEIRO = USING_EMULATOR
  ? 'http://127.0.0.1:8799'
  : 'https://loftchat-carteiro.bevonesileonardo.workers.dev';

const CHAVE_APARELHO = 'loft:aparelho';
const CHAVE_LIGADO = 'loft:avisos';

function guardado(chave: string): string | null {
  try {
    return localStorage.getItem(chave);
  } catch {
    return null;
  }
}

function guardar(chave: string, valor: string): void {
  try {
    localStorage.setItem(chave, valor);
  } catch {
    // Sem armazenamento: segue sem lembrar.
  }
}

/** Um nome fixo para este aparelho dentro de `aparelhos/{uid}`. */
function idDoAparelho(): string {
  const salvo = guardado(CHAVE_APARELHO);
  if (salvo !== null && /^a[A-Za-z0-9]{8,30}$/.test(salvo)) return salvo;
  const letras = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const sorteio = crypto.getRandomValues(new Uint8Array(16));
  const novo = `a${Array.from(sorteio, (n) => letras[n % letras.length]).join('')}`;
  guardar(CHAVE_APARELHO, novo);
  return novo;
}

/** Configurações → Notificações. Ligado até a pessoa desligar. */
export function avisosLigados(): boolean {
  return guardado(CHAVE_LIGADO) !== 'nao';
}

/* ------------------------------ o carteiro ------------------------------ */

/** Depois de mandar: pede ao carteiro para avisar os outros. Nunca atrapalha o envio. */
export function avisarCarteiro(tipo: 'grupo' | 'pv', id: string): void {
  const usuario = auth.currentUser;
  if (usuario === null) return;
  void usuario
    .getIdToken()
    .then((token) =>
      fetch(`${CARTEIRO}/avisar`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ tipo, id }),
        keepalive: true,
      }),
    )
    .catch(() => {
      // Sem aviso desta vez: a mensagem já foi.
    });
}

/* ------------------------------ o Android ------------------------------ */

interface PluginAvisos {
  ligar(): Promise<{ token: string; permitido: boolean }>;
  conversa(opcoes: { id: string }): Promise<void>;
  limpar(): Promise<void>;
  addListener(evento: 'abrir', ouvinte: (e: { abrir: string }) => void): Promise<{ remove: () => Promise<void> }>;
  addListener(evento: 'token', ouvinte: (e: { token: string }) => void): Promise<{ remove: () => Promise<void> }>;
}

const nativo = registerPlugin<PluginAvisos>('Avisos');

/* ------------------------------ ligar e desligar ------------------------------ */

async function anotarAparelho(uid: string, dados: { tipo: 'android'; token: string } | { tipo: 'pc' }): Promise<void> {
  await setDoc(doc(db, 'aparelhos', uid), { lista: { [idDoAparelho()]: dados } }, { merge: true });
}

/** Tira este aparelho da lista (sair da conta, ou desligar os avisos). */
export async function esquecerEsteAparelho(uid: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'aparelhos', uid), { [`lista.${idDoAparelho()}`]: deleteField() });
  } catch {
    // Não existia: nada a tirar.
  }
  if (Capacitor.isNativePlatform()) await nativo.limpar().catch(() => undefined);
}

export interface Avisos {
  /** O app diz qual conversa está aberta (`canal:<id>`, `pv:<uid>` ou ''). */
  conversa(id: string): void;
  parar(): void;
}

/**
 * Liga os avisos deste aparelho para esta conta. `abrir` recebe a rota
 * (`grupo/<g>/<c>` ou `pv/<uid>`) quando a pessoa toca numa notificação.
 */
export function ligarAvisos(uid: string, abrir: (rota: string) => void): Avisos {
  const ouvintes: Promise<{ remove: () => Promise<void> }>[] = [];
  let aberta = '';

  if (Capacitor.isNativePlatform()) {
    ouvintes.push(nativo.addListener('abrir', ({ abrir: rota }) => abrir(rota)));
    if (avisosLigados()) {
      void nativo
        .ligar()
        .then(({ token, permitido }) =>
          // Sem permissão de notificar: não adianta o carteiro mandar para cá.
          token === '' || !permitido ? esquecerEsteAparelho(uid) : anotarAparelho(uid, { tipo: 'android', token }),
        )
        .catch(() => undefined);
      ouvintes.push(
        nativo.addListener('token', ({ token }) => {
          if (avisosLigados()) void anotarAparelho(uid, { tipo: 'android', token }).catch(() => undefined);
        }),
      );
    }
  }

  return {
    conversa(id) {
      if (id === aberta) return;
      aberta = id;
      if (Capacitor.isNativePlatform()) void nativo.conversa({ id }).catch(() => undefined);
    },
    parar() {
      for (const o of ouvintes) void o.then((x) => x.remove());
    },
  };
}
