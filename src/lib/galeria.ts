import { subscribeGaleria } from './firestore';
import type { Message } from '../types/models';

/**
 * GALERIA DO GRUPO (0.8.0): uma escuta só por grupo, dividida entre a aba
 * Mídia do painel e a janela "Ver tudo". O painel é remontado toda hora
 * (alguém entra na sala, muda o canal...), então a escuta mora aqui e cada
 * desenho novo só pede o que já chegou.
 */

const SESSENTA_DIAS = 60 * 24 * 60 * 60 * 1000;

export interface EstadoDaGaleria {
  carregada: boolean;
  itens: Message[];
  erro: boolean;
}

type Ouvinte = (estado: EstadoDaGaleria) => void;

let grupo: string | null = null;
let parar: (() => void) | null = null;
let estado: EstadoDaGaleria = { carregada: false, itens: [], erro: false };
const ouvintes = new Set<Ouvinte>();

function avisar(): void {
  for (const o of [...ouvintes]) o(estado);
}

/**
 * Começa (ou reaproveita) a escuta do grupo e chama `aoMudar` agora e a cada
 * mudança. Devolve a função de soltar; sem ninguém ouvindo, a escuta para.
 */
export function ouvirGaleria(groupId: string, aoMudar: Ouvinte): () => void {
  if (groupId !== grupo) {
    parar?.();
    grupo = groupId;
    estado = { carregada: false, itens: [], erro: false };
    const desde = new Date(Date.now() - SESSENTA_DIAS).toISOString();
    parar = subscribeGaleria(
      groupId,
      desde,
      (itens) => {
        estado = { carregada: true, itens, erro: false };
        avisar();
      },
      (erro) => {
        console.error('[galeria]', erro);
        estado = { carregada: true, itens: [], erro: true };
        avisar();
      },
    );
  }
  ouvintes.add(aoMudar);
  aoMudar(estado);
  return () => {
    ouvintes.delete(aoMudar);
    if (ouvintes.size === 0) {
      parar?.();
      parar = null;
      grupo = null;
    }
  };
}

/** Uma foto que não abre mais (passou dos 60 dias): some da galeria até a próxima vez. */
const sumidas = new Set<string>();
export function marcarSumida(id: string): void {
  sumidas.add(id);
}
export function sumiu(id: string): boolean {
  return sumidas.has(id);
}

/* --- separar por período --------------------------------------------------- */

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

/**
 * "Esta semana" (últimos 7 dias) e depois um bloco por mês. `curto` tira o
 * ano (painel estreito); o ano só aparece se não for o atual.
 */
export function porPeriodo(itens: Message[], curto: boolean, agora = new Date()): { titulo: string; itens: Message[] }[] {
  const semana = agora.getTime() - 7 * 24 * 60 * 60 * 1000;
  const blocos: { titulo: string; itens: Message[] }[] = [];
  for (const item of itens) {
    const quando = new Date(item.sentAt);
    let titulo: string;
    if (quando.getTime() >= semana) titulo = 'Esta semana';
    else {
      const mes = MESES[quando.getMonth()]!;
      titulo = curto && quando.getFullYear() === agora.getFullYear() ? mes : `${mes} de ${quando.getFullYear()}`;
    }
    const ultimo = blocos[blocos.length - 1];
    if (ultimo !== undefined && ultimo.titulo === titulo) ultimo.itens.push(item);
    else blocos.push({ titulo, itens: [item] });
  }
  return blocos;
}
