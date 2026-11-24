import { Capacitor, registerPlugin } from '@capacitor/core';

import { loftDesktop } from './desktop';
import listaDeNovidades from '../../novidades.json';

/**
 * ATUALIZAÇÃO DO LOFTCHAT (17/11/2026) — o mesmo jeito nos três:
 *
 *  - PROGRAMA (Windows e Linux): o atualizador do próprio programa
 *    (electron-updater, desktop/main.mjs) acha a versão nova nas Releases do
 *    GitHub e baixa sozinho; pronta, o chat oferece "Atualizar" (reinicia
 *    nela).
 *  - APP ANDROID: o chat pergunta às Releases qual é a última versão; se for
 *    mais nova, oferece "Atualizar" — o app baixa o APK e abre a tela de
 *    instalar do Android (`PluginDoAtualizador.java`). O toque em "Instalar"
 *    é sempre da pessoa: o Android não deixa app nenhum pular isso.
 *  - SITE: é sempre a versão mais nova; não há o que atualizar.
 *
 * Dizer "Depois" não muda nada no que funciona: o Loftchat segue igual, só
 * sem as novidades. A faixa some até sair outra versão, e a atualização fica
 * em Configurações → Sobre o Loftchat.
 */

export interface Versao {
  versao: string;
  data: string;
  itens: string[];
}

/** As novidades de cada versão, até esta (novidades.json, vem junto no app). */
export const NOVIDADES: Versao[] = listaDeNovidades;

export type Onde = 'pc' | 'android' | 'site';

export interface EstadoDaAtualizacao {
  onde: Onde;
  /** A versão que está rodando. */
  atual: string;
  /** Uma versão mais nova que existe (null = esta é a última, ou ainda não sei). */
  nova: string | null;
  /** O que mudou na nova (das Releases do GitHub). */
  notas: string[] | null;
  /** Baixando a nova: 0–100. */
  progresso: number | null;
  /** Dá para atualizar AGORA (PC: já baixou; Android: é só tocar). */
  pronta: boolean;
  procurando: boolean;
  /** Última procura sem achar nada (para o "Você está na versão mais nova"). */
  conferido: boolean;
  erro: string | null;
}

const REPOSITORIO = 'Lelokz/Loftchat.com.br';
const NOME_DO_APK = 'Loftchat-Android.apk';
/** De quanto em quanto tempo procura versão nova com o app aberto (o Leo: "no máximo 5 minutos"). */
const CINCO_MINUTOS = 5 * 60 * 1000;

interface Atualizador {
  instalar(opcoes: { url: string }): Promise<void>;
  /** 0.5.5: a versão nova pelo link de download (sem o limite da API do GitHub). */
  procurar(opcoes: { repositorio: string; apk: string }): Promise<{ versao: string; apk: string }>;
  addListener(evento: 'progresso', ouvinte: (p: { pct: number }) => void): Promise<{ remove: () => Promise<void> }>;
}
const atualizador = registerPlugin<Atualizador>('Atualizador');

let estado: EstadoDaAtualizacao = {
  onde: Capacitor.isNativePlatform() ? 'android' : loftDesktop() !== null ? 'pc' : 'site',
  atual: __VERSAO__,
  nova: null,
  notas: null,
  progresso: null,
  pronta: false,
  procurando: false,
  conferido: false,
  erro: null,
};
let apkDaNova: string | null = null;
const ouvintes = new Set<(e: EstadoDaAtualizacao) => void>();

function mudar(parte: Partial<EstadoDaAtualizacao>): void {
  estado = { ...estado, ...parte };
  for (const ouvinte of ouvintes) ouvinte(estado);
}

export function estadoDaAtualizacao(): EstadoDaAtualizacao {
  return estado;
}

/** Ouve as mudanças (a faixa e a tela Sobre). Devolve como parar de ouvir. */
export function aoMudarAtualizacao(ouvinte: (e: EstadoDaAtualizacao) => void): () => void {
  ouvintes.add(ouvinte);
  return () => ouvintes.delete(ouvinte);
}

/** "0.10.0" > "0.9.5": compara número por número. */
export function maisNova(a: string, b: string): boolean {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}

/**
 * O que mudou numa versão: o `novidades.json` daquela etiqueta, direto do
 * GitHub (o raw não tem o limite de 60 por hora da API, e libera o CORS).
 */
async function notasDa(versao: string): Promise<string[] | null> {
  const resposta = await fetch(`https://raw.githubusercontent.com/${REPOSITORIO}/v${versao}/novidades.json`, { cache: 'no-store' });
  if (!resposta.ok) return null;
  const lista = (await resposta.json()) as Array<{ versao?: unknown; itens?: unknown }>;
  const desta = Array.isArray(lista) ? lista.find((n) => n.versao === versao) : undefined;
  return Array.isArray(desta?.itens) ? desta.itens.filter((x): x is string => typeof x === 'string') : null;
}

/** O que mudou na versão nova (para a faixa e a tela Sobre). */
async function buscarNotas(versao: string): Promise<void> {
  const notas = await notasDa(versao).catch(() => null);
  if (notas !== null && estado.nova === versao) mudar({ notas });
}

/** Procura agora (abrir o app, a cada 5 minutos, ao voltar para o app e o botão "Procurar atualizações"). */
export async function procurarAtualizacao(): Promise<void> {
  if (estado.onde === 'site' || estado.procurando) return;
  mudar({ procurando: true, erro: null });
  try {
    if (estado.onde === 'pc') {
      const versao = (await loftDesktop()?.procurarAtualizacao?.()) ?? null;
      if (versao !== null && maisNova(versao, estado.atual)) {
        if (estado.nova !== versao) mudar({ nova: versao });
        void buscarNotas(versao);
      }
      mudar({ conferido: versao === null && estado.nova === null });
      return;
    }
    // Android: pelo link de download, no lado nativo (sem CORS e sem o
    // limite da API — no 4G ele estourava e a faixa nunca aparecia).
    const ultima = await atualizador.procurar({ repositorio: REPOSITORIO, apk: NOME_DO_APK });
    if (maisNova(ultima.versao, estado.atual)) {
      apkDaNova = ultima.apk;
      mudar({ nova: ultima.versao, pronta: true, conferido: false });
      void buscarNotas(ultima.versao);
    } else {
      mudar({ conferido: true });
    }
  } catch {
    mudar({ erro: 'Não deu para procurar agora (sem internet?). Tente de novo daqui a pouco.' });
  } finally {
    mudar({ procurando: false });
  }
}

/** Instala a versão nova: PC reinicia nela; Android baixa e abre o instalador. */
export async function instalarAtualizacao(): Promise<void> {
  if (!estado.pronta || estado.progresso !== null) return;
  mudar({ erro: null });
  if (estado.onde === 'pc') {
    mudar({ progresso: 100 });
    await loftDesktop()?.atualizarAgora?.();
    return;
  }
  if (estado.onde !== 'android' || apkDaNova === null) return;
  const ouvinte = await atualizador.addListener('progresso', ({ pct }) => mudar({ progresso: pct }));
  mudar({ progresso: 0 });
  try {
    await atualizador.instalar({ url: apkDaNova });
  } catch (erro) {
    const codigo = (erro as { code?: string }).code;
    mudar({
      erro:
        codigo === 'PERMISSAO'
          ? 'O Android pediu para liberar a instalação: ligue "Permitir desta fonte" para o Loftchat na tela que abriu e toque em Atualizar de novo.'
          : 'Não deu para baixar a atualização. Confira a internet e tente de novo.',
    });
  } finally {
    void ouvinte.remove();
    mudar({ progresso: null });
  }
}

let ligado = false;

/** Liga a procura (uma vez, ao abrir o chat). */
export function ligarAtualizacao(): void {
  if (ligado || estado.onde === 'site') return;
  ligado = true;

  const desktop = loftDesktop();
  if (estado.onde === 'pc' && desktop !== null) {
    void desktop.versao?.().then((v) => mudar({ atual: v }));
    desktop.aoAtualizacaoDisponivel?.((versao) => {
      mudar({ nova: versao, progresso: 0, conferido: false });
      void buscarNotas(versao);
    });
    desktop.aoProgressoDaAtualizacao?.((pct) => {
      if (!estado.pronta) mudar({ progresso: pct });
    });
    const pronta = (versao: string): void => {
      mudar({ nova: versao, pronta: true, progresso: null, conferido: false });
      if (estado.notas === null) void buscarNotas(versao);
    };
    desktop.aoAtualizacaoPronta?.(pronta);
    // Já baixada antes de a página carregar (ex.: recarregou).
    void desktop.atualizacaoPronta?.().then((versao) => {
      if (versao) pronta(versao);
    });
    // O programa procura sozinho ao abrir e a cada 5 minutos (main.mjs).
    return;
  }

  void procurarAtualizacao();
  window.setInterval(() => void procurarAtualizacao(), CINCO_MINUTOS);
  // Em segundo plano o Android congela o relógio do app: ao voltar para a
  // tela, procura de novo (no máximo uma vez por minuto).
  let ultimaVez = Date.now();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || Date.now() - ultimaVez < 60_000) return;
    ultimaVez = Date.now();
    void procurarAtualizacao();
  });
}
