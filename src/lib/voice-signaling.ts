/**
 * Sinalização WebRTC pelo Firestore.
 *
 * UM DOCUMENTO POR PAR E POR SENTIDO: `{de}_{para}`. Cada lado escreve só o seu
 * e lê o do outro. Ninguém escreve no documento alheio — é o que torna a regra
 * trivial (`from == uid()`) e o que elimina disputa de escrita entre dois pares
 * negociando ao mesmo tempo.
 *
 * QUEM OFERTA É QUEM TEM O UID MENOR. Determinístico dos dois lados, então nunca
 * há duas ofertas cruzadas e não é preciso rollback.
 *
 * Os candidatos ICE vão por `arrayUnion` NO PRÓPRIO documento do par, e não numa
 * subcoleção: um punhado de candidatos cabe folgado no limite de 1 MB, e assim
 * cada lado tem UM listener por par em vez de dois.
 */

import {
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import type { Unsubscribe } from 'firebase/firestore';

import { db } from './firebase';

export interface SignalDoc {
  from: string;
  to: string;
  kind: 'offer' | 'answer';
  sdp: string;
  /**
   * Sobe a cada descrição nova.
   *
   * Sem ele, uma descrição REESCRITA (renegociação) seria indistinguível da
   * anterior sendo reentregue pelo listener — que reentrega a cada candidato
   * acrescentado. Quem recebe aplica a descrição só quando este número muda.
   */
  negotiationId: number;
  /** `RTCIceCandidateInit` serializados — array de objetos não entra em arrayUnion com segurança. */
  candidates: string[];
}

/** Quem oferta: comparação de string, igual dos dois lados. */
export const iAmOfferer = (myUid: string, peerUid: string): boolean => myUid < peerUid;

const signalsOf = (channelId: string) =>
  collection(db, 'voiceChannels', channelId, 'signals');

const signalRef = (channelId: string, from: string, to: string) =>
  doc(db, 'voiceChannels', channelId, 'signals', `${from}_${to}`);

/**
 * Grava a oferta ou a resposta.
 *
 * `merge: true` de propósito: os candidatos já acumulados NÃO podem ser
 * apagados numa renegociação. Eles continuam válidos, porque a sessão ICE é a
 * mesma — a conexão nunca é refeita, só ganha ou perde uma faixa.
 */
export async function writeDescription(
  channelId: string,
  groupId: string,
  from: string,
  to: string,
  kind: 'offer' | 'answer',
  sdp: string,
  negotiationId: number,
): Promise<void> {
  await setDoc(
    signalRef(channelId, from, to),
    {
      groupId,
      from,
      to,
      kind,
      sdp,
      negotiationId,
      createdAt: new Date().toISOString(),
    },
    { merge: true },
  );
}

export async function appendCandidate(
  channelId: string,
  from: string,
  to: string,
  candidate: RTCIceCandidateInit,
): Promise<void> {
  await updateDoc(signalRef(channelId, from, to), {
    candidates: arrayUnion(JSON.stringify(candidate)),
  });
}

/**
 * Tudo que é endereçado a mim neste canal, numa assinatura só.
 *
 * Ofertas, respostas e candidatos de TODOS os pares chegam por aqui. A consulta
 * restringe `groupId` porque é o que a regra examina — sem isso ela é recusada
 * inteira, e não por falta de permissão de verdade.
 */
export function subscribeIncomingSignals(
  channelId: string,
  groupId: string,
  myUid: string,
  onSignal: (signal: SignalDoc) => void,
  onError: (error: unknown) => void,
): Unsubscribe {
  return onSnapshot(
    query(signalsOf(channelId), where('groupId', '==', groupId), where('to', '==', myUid)),
    (snapshot) => {
      for (const entry of snapshot.docs) {
        const data = entry.data();
        onSignal({
          from: typeof data['from'] === 'string' ? data['from'] : '',
          to: myUid,
          kind: data['kind'] === 'answer' ? 'answer' : 'offer',
          sdp: typeof data['sdp'] === 'string' ? data['sdp'] : '',
          negotiationId: typeof data['negotiationId'] === 'number' ? data['negotiationId'] : 0,
          candidates: Array.isArray(data['candidates']) ? (data['candidates'] as string[]) : [],
        });
      }
    },
    onError,
  );
}

/** Apaga os dois documentos de um par. */
export async function clearPairSignals(
  channelId: string,
  myUid: string,
  peerUid: string,
): Promise<void> {
  await Promise.all([
    deleteDoc(signalRef(channelId, myUid, peerUid)).catch(() => {}),
    deleteDoc(signalRef(channelId, peerUid, myUid)).catch(() => {}),
  ]);
}

/**
 * Apaga tudo que me envolve neste canal, nos dois sentidos.
 *
 * SINALIZAÇÃO VELHA NÃO É LIXO INOFENSIVO: uma oferta de uma sessão anterior é
 * consumida como se fosse nova e envenena a negociação. O caso mais provável é
 * recarregar a página no meio de uma chamada — os documentos da sessão morta
 * continuam lá, esperando para serem lidos.
 *
 * Por isso isto roda ANTES de qualquer outra coisa ao entrar num canal.
 */
export async function clearMySignals(
  channelId: string,
  groupId: string,
  myUid: string,
): Promise<void> {
  const [mine, forMe] = await Promise.all([
    getDocs(query(signalsOf(channelId), where('groupId', '==', groupId), where('from', '==', myUid))),
    getDocs(query(signalsOf(channelId), where('groupId', '==', groupId), where('to', '==', myUid))),
  ]);

  const refs = [...mine.docs, ...forMe.docs].map((entry) => entry.ref);
  await Promise.all(refs.map((ref) => deleteDoc(ref).catch(() => {})));
}
