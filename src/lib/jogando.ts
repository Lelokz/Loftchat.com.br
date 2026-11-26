import { deleteDoc, doc, onSnapshot, serverTimestamp, setDoc, Timestamp } from 'firebase/firestore';
import type { Unsubscribe } from 'firebase/firestore';

import { loftDesktop } from './desktop';
import type { JogoDoPc } from './desktop';
import { db } from './firebase';
import { contarConquista } from './conquistas';

/**
 * JOGANDO AGORA (0.12.0).
 *
 * O programa do PC reconhece o jogo aberto (desktop/jogos.mjs) e o chat grava
 * `jogando/{uid}`: o nome, a loja, desde quando e um `visto` que se renova a
 * cada 90 s. Quem lê ignora o que ficou sem renovar por 4 min — o PC
 * desligado sem fechar o Loft não deixa ninguém "jogando" para sempre.
 *
 * "Mostrar o que estou jogando" fica NESTE PC (é ele que vê o jogo).
 */

export interface Jogando {
  nome: string;
  loja: string | null;
  steamId?: number;
  /** Capa (Steam ou IGDB), quando se sabe. */
  capa?: string;
  /** Desde quando, em ms. */
  desde: number;
}

const BATIDA_MS = 90_000;
const VENCE_MS = 4 * 60_000;
const CHAVE_MOSTRAR = 'loft:mostrar-jogando';
const EVENTO = 'loft:jogando-mudou';

/* ----------------------------- a preferência ----------------------------- */

export function mostrarJogando(): boolean {
  try {
    return localStorage.getItem(CHAVE_MOSTRAR) !== 'nao';
  } catch {
    return true;
  }
}

export function mudarMostrarJogando(sim: boolean): void {
  try {
    localStorage.setItem(CHAVE_MOSTRAR, sim ? 'sim' : 'nao');
  } catch {
    // sem localStorage: vale só até fechar
  }
  window.dispatchEvent(new Event('loft:mostrar-jogando'));
}

/** A capa de um jogo da Steam (a vertical, igual à da biblioteca). */
export function capaDaSteam(id: number): string {
  return `https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/library_600x900.jpg`;
}

/* ------------------------------- o meu jogo ------------------------------- */

/**
 * Liga o "Jogando…" desta conta (só no programa do PC). `buscarCapa` acha a
 * capa no catálogo pelo nome (opcional). Devolve como parar.
 */
export function ligarMeuJogo(uid: string, buscarCapa?: (nome: string) => Promise<string | undefined>): () => void {
  const desktop = loftDesktop();
  if (desktop?.jogoAtual === undefined || desktop.aoMudarJogo === undefined) return () => {};
  const ref = doc(db, 'jogando', uid);
  let jogo: JogoDoPc | null = null;
  let gravado = false;
  let capa: { nome: string; url: string | undefined } | null = null;
  let relogio: number | undefined;
  let parado = false;
  /** 0.12.0 insígnias: de 5 em 5 min o carteiro conta o tempo de jogo. */
  let contouEm = 0;

  async function gravar(): Promise<void> {
    window.clearTimeout(relogio);
    if (parado) return;
    const vale = jogo !== null && mostrarJogando();
    try {
      if (vale && jogo !== null) {
        if (capa?.nome !== jogo.nome) {
          const nome = jogo.nome;
          capa = { nome, url: jogo.steamId === undefined ? await buscarCapa?.(nome).catch(() => undefined) : capaDaSteam(jogo.steamId) };
          if (jogo?.nome !== nome) return;
        }
        await setDoc(ref, {
          nome: jogo.nome.slice(0, 80),
          loja: jogo.loja === null ? null : jogo.loja.slice(0, 20),
          ...(jogo.steamId === undefined ? {} : { steamId: jogo.steamId }),
          ...(capa?.url === undefined ? {} : { capa: capa.url }),
          desde: jogo.desde,
          visto: serverTimestamp(),
        });
        gravado = true;
        if (Date.now() - contouEm >= 5 * 60_000 - 5_000) {
          contouEm = Date.now();
          contarConquista({ evento: 'jogo' });
        }
        relogio = window.setTimeout(() => void gravar(), BATIDA_MS);
      } else if (gravado) {
        gravado = false;
        await deleteDoc(ref);
      }
    } catch (erro) {
      console.error('Jogando agora: não deu para gravar.', erro);
      relogio = window.setTimeout(() => void gravar(), BATIDA_MS);
    }
  }

  const parar = desktop.aoMudarJogo((novo) => {
    jogo = novo;
    void gravar();
  });
  const mudouPreferencia = (): void => void gravar();
  window.addEventListener('loft:mostrar-jogando', mudouPreferencia);
  void desktop.jogoAtual().then((j) => {
    if (jogo === null) jogo = j;
    void gravar();
  });

  return () => {
    parado = true;
    window.clearTimeout(relogio);
    parar();
    window.removeEventListener('loft:mostrar-jogando', mudouPreferencia);
    if (gravado) void deleteDoc(ref).catch(() => {});
  };
}

/* ---------------------------- o jogo dos outros ---------------------------- */

const vistos = new Map<string, { dado: Jogando | null; visto: number; parar: Unsubscribe }>();
let relogioVencer: number | undefined;

function avisar(): void {
  window.dispatchEvent(new Event(EVENTO));
}

function ler(raw: Record<string, unknown> | undefined): { dado: Jogando | null; visto: number } {
  if (raw === undefined || typeof raw['nome'] !== 'string' || raw['nome'] === '') return { dado: null, visto: 0 };
  const visto = raw['visto'] instanceof Timestamp ? raw['visto'].toMillis() : Date.now();
  const capa = typeof raw['capa'] === 'string' && /^https:\/\//.test(raw['capa']) ? raw['capa'] : undefined;
  return {
    dado: {
      nome: raw['nome'].slice(0, 80),
      loja: typeof raw['loja'] === 'string' ? raw['loja'] : null,
      ...(typeof raw['steamId'] === 'number' ? { steamId: raw['steamId'] } : {}),
      ...(capa === undefined ? {} : { capa }),
      desde: typeof raw['desde'] === 'number' ? raw['desde'] : Date.now(),
    },
    visto,
  };
}

/** Acompanha o "Jogando…" destas pessoas (a lista inteira, a cada chamada). */
export function acompanharJogando(uids: Iterable<string>): void {
  const quero = new Set(uids);
  for (const [uid, v] of vistos) {
    if (!quero.has(uid)) {
      v.parar();
      vistos.delete(uid);
    }
  }
  for (const uid of quero) {
    if (vistos.has(uid) || uid === '') continue;
    const item = { dado: null as Jogando | null, visto: 0, parar: (() => {}) as Unsubscribe };
    vistos.set(uid, item);
    item.parar = onSnapshot(
      doc(db, 'jogando', uid),
      (snap) => {
        const { dado, visto } = ler(snap.data());
        // Só a TROCA de jogo redesenha (a batida de 90 s não mexe na tela).
        const antes = jogandoDe(uid)?.nome;
        item.dado = dado;
        item.visto = visto;
        if (antes !== jogandoDe(uid)?.nome) avisar();
      },
      () => {
        item.dado = null;
      },
    );
  }
  // De minuto em minuto, quem parou de renovar some da tela.
  if (relogioVencer === undefined) {
    relogioVencer = window.setInterval(() => {
      // Quem acabou de vencer some da tela (uma vez: o vencido vira null).
      let venceu = false;
      for (const v of vistos.values()) {
        if (v.dado !== null && Date.now() - v.visto > VENCE_MS) {
          v.dado = null;
          venceu = true;
        }
      }
      if (venceu) avisar();
    }, 60_000);
  }
}

export function pararJogando(): void {
  for (const v of vistos.values()) v.parar();
  vistos.clear();
  window.clearInterval(relogioVencer);
  relogioVencer = undefined;
}

/** O que a pessoa está jogando agora (null = nada, ou parou de renovar). */
export function jogandoDe(uid: string): Jogando | null {
  const v = vistos.get(uid);
  if (v === undefined || v.dado === null) return null;
  if (Date.now() - v.visto > VENCE_MS) return null;
  return v.dado;
}

export function aoMudarJogando(ouvinte: () => void): () => void {
  window.addEventListener(EVENTO, ouvinte);
  return () => window.removeEventListener(EVENTO, ouvinte);
}

/** "há 23 min", "há 1 h 10 min". */
export function haQuantoTempo(desde: number, agora = Date.now()): string {
  const min = Math.max(0, Math.floor((agora - desde) / 60_000));
  if (min < 1) return 'agora há pouco';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  const resto = min % 60;
  return resto === 0 ? `há ${h} h` : `há ${h} h ${resto} min`;
}
