/**
 * Inicialização do Firebase.
 *
 * A apiKey abaixo NÃO é segredo: em app web ela é um identificador público do
 * projeto, e vai no bundle do cliente por definição. Quem protege os dados são
 * as regras de segurança do Firestore/Storage e a configuração de Auth, não o
 * sigilo dessa chave.
 *
 * `PROJECT_ID` e `API_KEY` também saem daqui nomeados porque a saída do canal de
 * voz precisa falar com a REST do Firestore na mão — o SDK não tem como garantir
 * uma escrita durante o fechamento da página. Ver lib/voice-presence.ts.
 */

import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyBJhEOubcXL4DAg6TXHu4K0n2gcwrDy0iw',
  authDomain: 'loft-3d6c0f.firebaseapp.com',
  projectId: 'loft-3d6c0f',
  storageBucket: 'loft-3d6c0f.firebasestorage.app',
  messagingSenderId: '76150757543',
  appId: '1:76150757543:web:88f08256e8fbbc2255a382',
};

export const app = initializeApp(firebaseConfig);

export const PROJECT_ID = firebaseConfig.projectId;
export const apiKey = firebaseConfig.apiKey;

/**
 * `getAuth` já usa browserLocalPersistence por padrão no SDK web, então a sessão
 * sobrevive ao reload sem `setPersistence`.
 */
export const auth = getAuth(app);

export const db = getFirestore(app);

/* -------------------------------------------------------------------------- */
/* EMULADOR × PROJETO REAL                                                     */
/* -------------------------------------------------------------------------- */

/**
 * COMO SE APONTA PARA UM E PARA O OUTRO:
 *
 *   npm test        → emulador  (a suíte inteira, sem tocar em produção)
 *   npm run dev:emu → emulador  (o app, para mexer sem gastar cota)
 *   npm run dev     → PROJETO REAL
 *   npm run deploy  → PROJETO REAL, sempre
 *
 * A decisão sai de `VITE_USE_EMULATOR`, que o `playwright.config.ts` repassa ao
 * Vite quando ele mesmo está rodando dentro do `firebase emulators:exec`.
 * Nenhuma dessas variáveis é definida à mão em lugar nenhum.
 *
 * ERRA PARA O LADO SEGURO: variável ausente = projeto real. Para cair no
 * emulador é preciso estar dentro do `emulators:exec` — não acontece por
 * acidente, e um `npm run build` comum nunca embute isto.
 */
const emulatorHosts = import.meta.env['VITE_USE_EMULATOR'] as string | undefined;

export const USING_EMULATOR = emulatorHosts !== undefined && emulatorHosts !== '';

/** `authHost|firestoreHost`, como o `playwright.config.ts` monta. */
const [authHost = '127.0.0.1:9099', firestoreHost = '127.0.0.1:8088'] = (
  emulatorHosts ?? ''
).split('|');

if (USING_EMULATOR) {
  connectAuthEmulator(auth, `http://${authHost}`, { disableWarnings: true });
  const [host = '127.0.0.1', port = '8088'] = firestoreHost.split(':');
  connectFirestoreEmulator(db, host, Number(port));
}

/**
 * A base REST do Firestore.
 *
 * Existe porque UMA escrita do produto não passa pelo SDK: o `fetch(keepalive)`
 * que apaga a presença no `pagehide` (ver lib/voice-presence.ts) — o SDK não tem
 * como garantir uma escrita durante o fechamento da página.
 *
 * Se ela continuasse montando a URL de `firestore.googleapis.com` na mão, essa
 * escrita iria para PRODUÇÃO mesmo com todo o resto no emulador, e ninguém
 * notaria: some uma linha de presença num banco que o teste nem olha.
 */
export const FIRESTORE_REST_BASE = USING_EMULATOR
  ? `http://${firestoreHost}/v1`
  : 'https://firestore.googleapis.com/v1';
