import { Capacitor, registerPlugin } from '@capacitor/core';
import { deleteField, doc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore';

import { loftDesktop } from './desktop';
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
const EVENTO_MUDOU = 'loft:avisos-mudou';
/** Aviso mais velho que isso (o PC estava fechado) não aparece. */
const IDADE_MAX_MS = 2 * 60_000;

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

/** Este aparelho recebe avisos? Só o app e o programa; o site não. */
export function recebeAvisos(): boolean {
  return Capacitor.isNativePlatform() || loftDesktop()?.avisar !== undefined;
}

/** Configurações → Notificações. Ligado até a pessoa desligar. */
export function avisosLigados(): boolean {
  return guardado(CHAVE_LIGADO) !== 'nao';
}

export function mudarAvisos(ligado: boolean): void {
  guardar(CHAVE_LIGADO, ligado ? 'sim' : 'nao');
  window.dispatchEvent(new Event(EVENTO_MUDOU));
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

/* ------------------------------ a lista de aparelhos ------------------------------ */

async function anotarAparelho(uid: string, dados: { tipo: 'android'; token: string } | { tipo: 'pc' }): Promise<void> {
  await setDoc(doc(db, 'aparelhos', uid), { lista: { [idDoAparelho()]: dados } }, { merge: true });
}

/** Tira este aparelho da lista (sair da conta, ou desligar os avisos). */
export async function esquecerEsteAparelho(uid: string): Promise<void> {
  if (!recebeAvisos()) return;
  try {
    await updateDoc(doc(db, 'aparelhos', uid), { [`lista.${idDoAparelho()}`]: deleteField() });
  } catch {
    // Não existia: nada a tirar.
  }
  if (Capacitor.isNativePlatform()) await nativo.limpar().catch(() => undefined);
}

/* ------------------------------ ligar ------------------------------ */

export interface Avisos {
  /** O app diz qual conversa está aberta (`canal:<id>`, `pv:<uid>` ou ''). */
  conversa(id: string): void;
  parar(): void;
}

interface Aviso {
  mensagem?: string;
  de?: string;
  onde?: string;
  texto?: string;
  quando?: string;
  conversa?: string;
  abrir?: string;
  foto?: string;
}

function hora(iso: string | undefined): string {
  const data = new Date(iso ?? '');
  return Number.isNaN(data.getTime())
    ? ''
    : data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Liga os avisos deste aparelho para esta conta. `abrir` recebe a rota
 * (`grupo/<g>/<c>` ou `pv/<uid>`) quando a pessoa toca numa notificação.
 */
export function ligarAvisos(uid: string, abrir: (rota: string) => void): Avisos {
  let aberta = '';
  const sempre: (() => void)[] = [];
  let enquantoLigado: (() => void)[] = [];

  const desligar = (): void => {
    for (const parar of enquantoLigado) parar();
    enquantoLigado = [];
  };

  /* Celular. */
  const ligarNoAndroid = (): void => {
    void nativo
      .ligar()
      .then(({ token, permitido }) =>
        // Sem permissão de notificar: não adianta o carteiro mandar para cá.
        token === '' || !permitido ? esquecerEsteAparelho(uid) : anotarAparelho(uid, { tipo: 'android', token }),
      )
      .catch(() => undefined);
    const ouvinte = nativo.addListener('token', ({ token }) => {
      void anotarAparelho(uid, { tipo: 'android', token }).catch(() => undefined);
    });
    enquantoLigado.push(() => void ouvinte.then((o) => o.remove()));
  };

  /* PC: o carteiro escreve o último aviso em `avisos/{uid}`. */
  const ligarNoPc = (): void => {
    const desktop = loftDesktop();
    if (desktop?.avisar === undefined) return;
    void anotarAparelho(uid, { tipo: 'pc' }).catch(() => undefined);
    let ultimo = '';
    const parar = onSnapshot(
      doc(db, 'avisos', uid),
      (instantaneo) => {
        const aviso = instantaneo.get('ultimo') as Aviso | undefined;
        const id = aviso?.mensagem;
        if (aviso === undefined || id === undefined || id === ultimo) return;
        ultimo = id;
        if (!(Date.now() - Date.parse(aviso.quando ?? '') < IDADE_MAX_MS)) return;
        const olhando = document.hasFocus() && document.visibilityState === 'visible' && aviso.conversa === aberta;
        if (olhando) return;
        void desktop.avisar?.({
          titulo: aviso.de ?? 'Loftchat',
          corpo: `${aviso.onde ?? ''} · ${hora(aviso.quando)}\n${aviso.texto ?? ''}`,
          rota: aviso.abrir ?? '',
          foto: aviso.foto ?? '',
        });
      },
      () => undefined,
    );
    enquantoLigado.push(parar);
  };

  const ligar = (): void => {
    desligar();
    if (!avisosLigados()) {
      void esquecerEsteAparelho(uid);
      return;
    }
    if (Capacitor.isNativePlatform()) ligarNoAndroid();
    else ligarNoPc();
  };

  if (Capacitor.isNativePlatform()) {
    const ouvinte = nativo.addListener('abrir', ({ abrir: rota }) => abrir(rota));
    sempre.push(() => void ouvinte.then((o) => o.remove()));
  }
  const tirarClique = loftDesktop()?.aoAbrirAviso?.((rota) => abrir(rota));
  if (tirarClique !== undefined) sempre.push(tirarClique);

  if (recebeAvisos()) {
    window.addEventListener(EVENTO_MUDOU, ligar);
    sempre.push(() => window.removeEventListener(EVENTO_MUDOU, ligar));
    ligar();
  }

  return {
    conversa(id) {
      if (id === aberta) return;
      aberta = id;
      if (Capacitor.isNativePlatform()) void nativo.conversa({ id }).catch(() => undefined);
    },
    parar() {
      desligar();
      for (const parar of sempre) parar();
    },
  };
}
