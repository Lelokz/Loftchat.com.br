/**
 * REPORTAR BUG (0.13.0) — o lado do app: mandar o reporte e ouvir os meus.
 * Quem confere tudo (limite por dia, arquivos da própria pessoa) é o
 * carteiro (carteiro/src/reportes.ts).
 */

import { Capacitor } from '@capacitor/core';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { auth, db } from './firebase';
import { CARTEIRO } from './avisos';
import { loftDesktop } from './desktop';
import { subirArquivo } from './midia';
import { LIMITE_DE_REPORTES_POR_DIA, lerReporte } from './reportes-comum';
import type { Anexo, Reporte } from './reportes-comum';

export interface Aparelho {
  versao: string;
  tipo: 'computador' | 'celular' | 'navegador';
  sistema: string;
  tela: string;
}

/** O sistema pelo navegador ("Windows 11" não dá para separar do 10: o navegador diz igual). */
function sistema(): string {
  const ua = navigator.userAgent;
  const android = /Android (\d+(?:\.\d+)?)/.exec(ua);
  if (android) return `Android ${android[1]}`;
  if (/iPhone|iPad/.test(ua)) return 'iOS';
  if (/Windows/.test(ua)) return 'Windows';
  if (/Mac OS X/.test(ua)) return 'macOS';
  if (/CrOS/.test(ua)) return 'ChromeOS';
  if (/Linux/.test(ua)) return 'Linux';
  return 'Outro';
}

/** O que vai junto com o reporte (a pessoa vê antes de mandar). */
export function aparelhoAtual(): Aparelho {
  const tipo = Capacitor.isNativePlatform() ? 'celular' : loftDesktop() !== null ? 'computador' : 'navegador';
  const escala = window.devicePixelRatio || 1;
  const tela = tipo === 'celular' ? `${screen.width} × ${screen.height}` : `${Math.round(screen.width * escala)} × ${Math.round(screen.height * escala)}`;
  return { versao: `Loftchat ${__VERSAO__}`, tipo, sistema: sistema(), tela };
}

/** O "Tirar print agora" só existe no programa do PC (versão nova). */
export function podeTirarPrint(): boolean {
  return typeof loftDesktop()?.tirarPrint === 'function';
}

/** Tira o print da janela do Loft, escondendo `esconder` (as Configurações) enquanto isso. */
export async function tirarPrint(esconder: HTMLElement): Promise<Blob> {
  const ponte = loftDesktop();
  if (ponte?.tirarPrint === undefined) throw new Error('O print só funciona no programa do computador.');
  esconder.style.visibility = 'hidden';
  try {
    // Dois quadros e um respiro: a tela redesenha sem as Configurações.
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    await new Promise((r) => setTimeout(r, 150));
    const png = await ponte.tirarPrint();
    return new Blob([new Uint8Array(png)], { type: 'image/png' });
  } finally {
    esconder.style.visibility = '';
  }
}

export interface ArquivoDoReporte {
  blob: Blob;
  nome: string;
  tipo: Anexo['tipo'];
}

export interface NovoReporte {
  titulo: string;
  categoria: string;
  texto: string;
  audio: { blob: Blob; duracaoMs: number } | null;
  anexos: ArquivoDoReporte[];
}

/** Sobe os arquivos e manda o reporte. `aoPasso` conta o andamento ("1 de 3"). */
export async function enviarReporte(r: NovoReporte, aoPasso: (feitos: number, total: number) => void = () => undefined): Promise<{ id: string; restamHoje: number }> {
  const usuario = auth.currentUser;
  if (usuario === null) throw new Error('Entre de novo para mandar o reporte.');
  const total = r.anexos.length + (r.audio === null ? 0 : 1);
  let feitos = 0;
  aoPasso(0, total);
  const subir = async (blob: Blob, nome: string): Promise<string> => {
    const g = await subirArquivo(blob, blob.type || 'application/octet-stream', 'reporte', () => undefined, nome);
    feitos += 1;
    aoPasso(feitos, total);
    return g.chave;
  };
  const audio = r.audio === null ? null : { chave: await subir(r.audio.blob, 'audio'), duracaoMs: r.audio.duracaoMs };
  const anexos: Anexo[] = [];
  for (const a of r.anexos) anexos.push({ chave: await subir(a.blob, a.nome), tipo: a.tipo, nome: a.nome });

  const token = await usuario.getIdToken();
  const resposta = await fetch(`${CARTEIRO}/reportes`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ titulo: r.titulo, categoria: r.categoria, texto: r.texto, audio, anexos, aparelho: aparelhoAtual() }),
  });
  const d = (await resposta.json().catch(() => ({}))) as { id?: string; restamHoje?: number; erro?: string };
  if (!resposta.ok || typeof d.id !== 'string') throw new Error(d.erro ?? 'Não deu para mandar. Tente de novo.');
  return { id: d.id, restamHoje: d.restamHoje ?? 0 };
}

/** Os meus reportes, do mais novo ao mais velho. */
export function ouvirMeusReportes(uid: string, aoMudar: (lista: Reporte[]) => void): () => void {
  return onSnapshot(
    query(collection(db, 'reportes'), where('uid', '==', uid)),
    (snap) => {
      const lista = snap.docs.map((d) => lerReporte(d.id, d.data())).filter((x): x is Reporte => x !== null);
      lista.sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
      aoMudar(lista);
    },
    () => aoMudar([]),
  );
}

/** O dia de Brasília (o mesmo do limite do carteiro). */
export function diaDeBrasilia(iso: string | number = Date.now()): string {
  return new Date(new Date(iso).getTime() - 3 * 3_600_000).toISOString().slice(0, 10);
}

/** Quantos ainda dá para mandar hoje, pela lista. */
export function restamHoje(lista: Reporte[]): number {
  const hoje = diaDeBrasilia();
  return Math.max(0, LIMITE_DE_REPORTES_POR_DIA - lista.filter((r) => r.criadoEm !== '' && diaDeBrasilia(r.criadoEm) === hoje).length);
}
