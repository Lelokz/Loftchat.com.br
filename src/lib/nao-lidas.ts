import {
  collection,
  doc,
  getCountFromServer,
  limit,
  onSnapshot,
  query,
  setDoc,
  where,
} from 'firebase/firestore';
import type { Unsubscribe } from 'firebase/firestore';

import { db } from './firebase';
import { pairId } from './friends';
import { estaSilenciado } from './silencios';
import type { DmThread } from '../types/models';

/**
 * NÃO LIDAS (0.4.5).
 *
 * - `lidas/{uid}`: até onde a pessoa leu cada conversa (`c_<canal>` ou
 *   `p_<amigo>`), guardado na conta — leu no PC, some no celular também.
 *   `desde` é quando a conta começou a contar: conversa nunca aberta conta
 *   a partir dali, e não desde o começo do mundo.
 * - Cada canal tem `ultimaEm`/`ultimaDe` (quem manda anota); o PV já tinha
 *   `lastMessageAt`.
 * - Só CONTA (uma leitura no Firebase) quando há mensagem mais nova que a
 *   marca, e no máximo 10 ("9+").
 */

export const MAX_CONTADO = 10;

interface Ultima {
  em: string;
  de: string;
  grupo?: string;
}

export interface NaoLidas {
  /** Chamado a cada mudança do app: meus grupos, meus PVs e a conversa aberta (`canal:<id>`/`pv:<uid>`). */
  sincronizar(grupos: string[], pvs: DmThread[], aberta: string): void;
  canal(canalId: string): number;
  /** Para a bolinha colorida do grupo: sem o que está silenciado (grupo silenciado = 0). */
  grupo(grupoId: string): number;
  /** 0.11.0: todas do grupo, mesmo silenciadas (a bolinha cinza do grupo silenciado). */
  grupoTodas(grupoId: string): number;
  pv(amigo: string): number;
  privado(): number;
  /** 0.11.0: "Marcar como lido" (`canal:<id>` ou `pv:<uid>`). */
  marcarLida(conversa: string): void;
  parar(): void;
}

function chaveDa(conversa: string): string {
  if (conversa.startsWith('canal:')) return `c_${conversa.slice(6)}`;
  if (conversa.startsWith('pv:')) return `p_${conversa.slice(3)}`;
  return '';
}

export function criarNaoLidas(eu: string, aoMudar: () => void): NaoLidas {
  const refLidas = doc(db, 'lidas', eu);
  let marcas: Record<string, string> = {};
  let desde: string | null = null;
  let aberta = '';

  const canaisPorGrupo = new Map<string, Map<string, Ultima>>();
  const ouvintesDosGrupos = new Map<string, Unsubscribe>();
  const pvs = new Map<string, Ultima>();
  const contagens = new Map<string, number>();
  /** O que já foi contado para cada conversa (marca|última), para não contar de novo. */
  const contado = new Map<string, string>();
  const marcando = new Set<string>();

  const visivel = (): boolean =>
    document.visibilityState === 'visible' && (typeof document.hasFocus !== 'function' || document.hasFocus());

  const pararLidas = onSnapshot(
    refLidas,
    (instantaneo) => {
      if (!instantaneo.exists()) {
        desde = new Date().toISOString();
        void setDoc(refLidas, { desde, marcas: {} }, { merge: true }).catch(() => undefined);
      } else {
        const dados = instantaneo.data() as { desde?: string; marcas?: Record<string, string> };
        desde = dados.desde ?? new Date().toISOString();
        marcas = dados.marcas ?? {};
      }
      reavaliar();
    },
    () => undefined,
  );

  function marcar(chave: string, ate: string): void {
    if (marcando.has(chave) || (marcas[chave] ?? '') >= ate) return;
    marcando.add(chave);
    marcas = { ...marcas, [chave]: ate };
    void setDoc(refLidas, { marcas: { [chave]: ate } }, { merge: true })
      .catch(() => undefined)
      .finally(() => marcando.delete(chave));
  }

  function contar(chave: string, ultima: Ultima, marca: string): void {
    const assinatura = `${marca}|${ultima.em}`;
    if (contado.get(chave) === assinatura) return;
    contado.set(chave, assinatura);
    const consulta = chave.startsWith('c_')
      ? query(
          collection(db, 'messages'),
          where('groupId', '==', ultima.grupo ?? ''),
          where('channelId', '==', chave.slice(2)),
          where('sentAt', '>', marca),
          limit(MAX_CONTADO),
        )
      : query(
          collection(db, 'dmMessages'),
          where('threadId', '==', pairId(eu, chave.slice(2))),
          where('sentAt', '>', marca),
          limit(MAX_CONTADO),
        );
    void getCountFromServer(consulta)
      .then((resposta) => {
        if (contado.get(chave) !== assinatura) return;
        contagens.set(chave, resposta.data().count);
        aoMudar();
      })
      .catch(() => contado.delete(chave));
  }

  function avaliar(chave: string, ultima: Ultima | undefined): void {
    if (desde === null) return;
    const marca = marcas[chave] ?? desde;
    const antes = contagens.get(chave) ?? 0;
    if (ultima === undefined || ultima.em <= marca || ultima.de === eu) {
      contagens.set(chave, 0);
      contado.delete(chave);
    } else if (chave === chaveDa(aberta) && visivel()) {
      // Olhando a conversa: lida até a última.
      marcar(chave, ultima.em);
      contagens.set(chave, 0);
      contado.delete(chave);
    } else {
      contar(chave, ultima, marca);
    }
    if ((contagens.get(chave) ?? 0) !== antes) aoMudar();
  }

  function reavaliar(): void {
    for (const canais of canaisPorGrupo.values()) {
      for (const [canal, ultima] of canais) avaliar(`c_${canal}`, ultima);
    }
    for (const [amigo, ultima] of pvs) avaliar(`p_${amigo}`, ultima);
  }

  function ouvirGrupo(grupo: string): Unsubscribe {
    return onSnapshot(
      query(collection(db, 'channels'), where('groupId', '==', grupo)),
      (instantaneo) => {
        const canais = new Map<string, Ultima>();
        for (const d of instantaneo.docs) {
          const dados = d.data() as { kind?: string; ultimaEm?: unknown; ultimaDe?: unknown };
          if (dados.kind !== 'text' || typeof dados.ultimaEm !== 'string') continue;
          canais.set(d.id, { em: dados.ultimaEm, de: typeof dados.ultimaDe === 'string' ? dados.ultimaDe : '', grupo });
        }
        canaisPorGrupo.set(grupo, canais);
        for (const [canal, ultima] of canais) avaliar(`c_${canal}`, ultima);
        aoMudar();
      },
      () => undefined,
    );
  }

  const aoVoltar = (): void => reavaliar();
  document.addEventListener('visibilitychange', aoVoltar);
  window.addEventListener('focus', aoVoltar);

  return {
    sincronizar(grupos, threads, conversa) {
      for (const [grupo, parar] of ouvintesDosGrupos) {
        if (grupos.includes(grupo)) continue;
        parar();
        ouvintesDosGrupos.delete(grupo);
        canaisPorGrupo.delete(grupo);
      }
      for (const grupo of grupos) {
        if (!ouvintesDosGrupos.has(grupo)) ouvintesDosGrupos.set(grupo, ouvirGrupo(grupo));
      }
      pvs.clear();
      for (const t of threads) {
        const amigo = t.members.find((m) => m !== eu);
        if (amigo === undefined || t.lastMessageAt === '') continue;
        pvs.set(amigo, { em: t.lastMessageAt, de: t.lastMessage.authorId });
      }
      aberta = conversa;
      reavaliar();
    },
    canal: (canal) => contagens.get(`c_${canal}`) ?? 0,
    grupo(grupo) {
      if (estaSilenciado(`g_${grupo}`)) return 0;
      let soma = 0;
      for (const canal of canaisPorGrupo.get(grupo)?.keys() ?? []) {
        if (!estaSilenciado(`c_${canal}`)) soma += contagens.get(`c_${canal}`) ?? 0;
      }
      return soma;
    },
    grupoTodas(grupo) {
      let soma = 0;
      for (const canal of canaisPorGrupo.get(grupo)?.keys() ?? []) soma += contagens.get(`c_${canal}`) ?? 0;
      return soma;
    },
    pv: (amigo) => contagens.get(`p_${amigo}`) ?? 0,
    privado() {
      let soma = 0;
      for (const amigo of pvs.keys()) if (!estaSilenciado(`p_${amigo}`)) soma += contagens.get(`p_${amigo}`) ?? 0;
      return soma;
    },
    marcarLida(conversa) {
      const chave = chaveDa(conversa);
      if (chave === '') return;
      const ultima = chave.startsWith('c_')
        ? [...canaisPorGrupo.values()].map((c) => c.get(chave.slice(2))).find((u) => u !== undefined)
        : pvs.get(chave.slice(2));
      marcar(chave, ultima?.em ?? new Date().toISOString());
      avaliar(chave, ultima);
      aoMudar();
    },
    parar() {
      pararLidas();
      for (const parar of ouvintesDosGrupos.values()) parar();
      ouvintesDosGrupos.clear();
      document.removeEventListener('visibilitychange', aoVoltar);
      window.removeEventListener('focus', aoVoltar);
    },
  };
}

/** O texto da bolinha: 1 a 9, ou "9+". */
export function textoDaBolinha(n: number): string {
  return n >= MAX_CONTADO ? '9+' : String(n);
}
