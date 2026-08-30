/**
 * Presença num canal de voz: o documento, o heartbeat e a saída.
 *
 * Este arquivo existe por um motivo só: o Firestore NÃO TEM `onDisconnect`
 * (isso é do Realtime Database). Sem nada, quem fecha o navegador fica
 * eternamente "conectado" para todo mundo. Três camadas, em ordem de confiança:
 *
 *   1. HEARTBEAT — `lastSeen` a cada 15s. É a única em que eu confio.
 *   2. FILTRO DE QUEM LÊ — participante com lastSeen além de 45s é ignorado.
 *      É isto que faz o fantasma sumir da tela dos outros, com ou sem o passo 3.
 *   3. MELHOR ESFORÇO AO FECHAR — tenta apagar o documento no `pagehide`.
 *
 * Sobre o passo 3: um `deleteDoc` normal quase nunca termina durante o unload —
 * a página morre antes do round-trip. Por isso ele vai por `fetch` com
 * `keepalive`, que existe justamente para sobreviver ao fechamento e aceita
 * cabeçalho de autorização (o `sendBeacon` não aceita, por isso não serve).
 */

import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import type { User } from 'firebase/auth';

import { db } from './firebase';
import { FIRESTORE_REST_BASE, PROJECT_ID, apiKey } from './firebase';

const HEARTBEAT_MS = 15_000;

/** Além disto, o participante é fantasma e some da tela de quem lê. */
export const GHOST_AFTER_MS = 45_000;

/** Teto de gente por sala. */
export const VOICE_ROOM_LIMIT = 4;

export const voiceParticipantId = (channelId: string, uid: string): string =>
  `${channelId}_${uid}`;

/** Está vivo? Usado por quem lê o roster e por quem checa outra aba. */
export function isLive(lastSeen: string, now = Date.now()): boolean {
  const seen = Date.parse(lastSeen);
  return Number.isFinite(seen) && now - seen < GHOST_AFTER_MS;
}

/* -------------------------------------------------------------------------- */
/* Identidade desta aba                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Id desta aba, sorteado uma vez por carregamento de página.
 *
 * NÃO substitui o uid na chave dos documentos: trocar a chave por sessão perderia
 * a garantia de "um documento por pessoa por canal" que a regra verifica, e
 * deixaria a mesma pessoa aparecer duas vezes no roster. O sessionId serve para
 * DETECTAR o conflito, não para conviver com ele.
 */
export const SESSION_ID = crypto.randomUUID();

const TAB_CHANNEL = 'loft:voice';
const TAB_REPLY_MS = 200;

/**
 * Já existe outra aba minha conectada neste canal?
 *
 * Pergunta às outras abas do mesmo navegador e espera um instante pela resposta.
 *
 * Poderia ser feito lendo o documento e checando `lastSeen`, mas isso erraria
 * justamente o caso mais comum de quem testa sozinho: RECARREGAR a página no
 * meio de uma chamada deixa o documento fresco por até 45s, e a aba nova diria
 * "você já está em outra aba" quando não há outra aba nenhuma.
 *
 * Limite honesto: isto enxerga só o mesmo navegador. A mesma conta em dois
 * navegadores diferentes ainda colide — e é a checagem de `sessionId` no
 * heartbeat que percebe e avisa.
 */
export function askOtherTabs(channelId: string): Promise<boolean> {
  if (typeof BroadcastChannel === 'undefined') return Promise.resolve(false);

  return new Promise((resolve) => {
    const bus = new BroadcastChannel(TAB_CHANNEL);
    let answered = false;

    bus.onmessage = (event: MessageEvent<TabMessage>) => {
      if (event.data.type === 'aqui' && event.data.channelId === channelId) {
        answered = true;
        finish();
      }
    };

    const finish = (): void => {
      bus.close();
      resolve(answered);
    };

    bus.postMessage({ type: 'quem', channelId } satisfies TabMessage);
    setTimeout(finish, TAB_REPLY_MS);
  });
}

interface TabMessage {
  type: 'quem' | 'aqui';
  channelId: string;
}

/* -------------------------------------------------------------------------- */
/* Sessão de presença                                                          */
/* -------------------------------------------------------------------------- */

export interface PresenceSession {
  setMuted(muted: boolean): Promise<void>;
  /** Publica que estou (ou não) transmitindo a tela. */
  setSharingScreen(sharing: boolean): Promise<void>;
  /** Sai do canal: para o heartbeat, responde outras abas e apaga o documento. */
  leave(): Promise<void>;
}

export interface PresenceOptions {
  /** Chamado quando OUTRA sessão assumiu o meu documento. */
  onDisplaced: () => void;
}

export async function joinVoiceChannel(
  user: User,
  groupId: string,
  channelId: string,
  options: PresenceOptions,
): Promise<PresenceSession> {
  const ref = doc(db, 'voiceParticipants', voiceParticipantId(channelId, user.uid));
  const now = new Date().toISOString();

  await setDoc(ref, {
    channelId,
    groupId,
    uid: user.uid,
    sessionId: SESSION_ID,
    joinedAt: now,
    muted: false,
    sharingScreen: false,
    lastSeen: now,
  });

  // Responde a outras abas que perguntarem por este canal.
  const bus = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(TAB_CHANNEL);
  if (bus !== null) {
    bus.onmessage = (event: MessageEvent<TabMessage>) => {
      if (event.data.type === 'quem' && event.data.channelId === channelId) {
        bus.postMessage({ type: 'aqui', channelId } satisfies TabMessage);
      }
    };
  }

  // O token vai para o `fetch` de saída, que roda quando já não dá para esperar
  // uma promessa. Renovado junto do heartbeat.
  let idToken = await user.getIdToken();

  const beat = window.setInterval(() => {
    void (async () => {
      try {
        const snapshot = await getDoc(ref);
        // Outra sessão assumiu meu documento: perdi o lugar. Melhor saber do que
        // ficar disputando o heartbeat em silêncio com a outra ponta.
        if (snapshot.exists() && snapshot.get('sessionId') !== SESSION_ID) {
          options.onDisplaced();
          return;
        }
        await updateDoc(ref, { lastSeen: new Date().toISOString() });
        idToken = await user.getIdToken();
      } catch (error) {
        console.error('Falha no heartbeat da voz.', error);
      }
    })();
  }, HEARTBEAT_MS);

  const onPageHide = (): void => {
    // `keepalive` é o que dá a esta requisição chance de sair com a página
    // fechando. Ainda assim é melhor esforço: quem garante é o filtro dos 45s.
    void fetch(
      // Base do lib/firebase.ts, e não a URL de produção na mão: sem isto esta
      // escrita vazaria para o projeto REAL mesmo com todo o resto no emulador,
      // e ninguém notaria — some uma linha de presença num banco que o teste
      // nem olha.
      `${FIRESTORE_REST_BASE}/projects/${PROJECT_ID}/databases/(default)/documents:commit?key=${apiKey}`,
      {
        method: 'POST',
        keepalive: true,
        headers: { 'content-type': 'application/json', authorization: `Bearer ${idToken}` },
        body: JSON.stringify({
          writes: [
            {
              delete: `projects/${PROJECT_ID}/databases/(default)/documents/voiceParticipants/${voiceParticipantId(channelId, user.uid)}`,
            },
          ],
        }),
      },
    ).catch(() => {
      /* a página está indo embora; não há a quem reportar */
    });
  };
  window.addEventListener('pagehide', onPageHide);

  const stop = (): void => {
    window.clearInterval(beat);
    window.removeEventListener('pagehide', onPageHide);
    bus?.close();
  };

  return {
    async setMuted(muted) {
      await updateDoc(ref, { muted, lastSeen: new Date().toISOString() });
    },
    async setSharingScreen(sharing) {
      await updateDoc(ref, { sharingScreen: sharing, lastSeen: new Date().toISOString() });
    },
    async leave() {
      stop();
      await deleteDoc(ref).catch((error: unknown) => {
        console.error('Falha ao sair do canal de voz.', error);
      });
    },
  };
}
