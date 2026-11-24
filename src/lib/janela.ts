import './janela.css';

import { el, iconEl } from './dom';
import { loftDesktop } from './desktop';

/**
 * A JANELA DO PROGRAMA (0.7.0), só no PC: a barra de cima do chat vira a
 * barra da janela (arrastar, dois cliques, minimizar/maximizar/fechar), os
 * cantos ficam arredondados (Linux) e a bandeja ganha a bolinha de mensagem
 * nova. As escolhas ficam no programa, por computador (desktop/main.mjs).
 */

export type EscolhasDaJanela = {
  barra: 'loftchat' | 'sistema';
  cantos: 'redondos' | 'retos';
  bandeja: 'pb' | 'cor' | 'esconder';
  aoFechar: 'bandeja' | 'sair';
};

export interface InfoDaJanela {
  escolhas: EscolhasDaJanela;
  /** Como a janela nasceu: barra e cantos só mudam ao reiniciar. */
  nasceu: { barra: 'loftchat' | 'sistema'; transparente: boolean };
  plataforma: string;
  maximizada: boolean;
}

let propria = false;
let maximizada = false;
let pronta: Promise<InfoDaJanela | null> = Promise.resolve(null);

/** Resolve quando a janela já sabe como nasceu (para a barra de cima redesenhar com os botões). */
export function quandoAJanelaLigar(): Promise<InfoDaJanela | null> {
  return pronta;
}

const SVG = (d: string): string =>
  `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" focusable="false">${d}</svg>`;
const MINIMIZAR = SVG('<path d="M6 12h12"/>');
const MAXIMIZAR = SVG('<rect x="6" y="6" width="12" height="12" rx="2.5"/>');
const RESTAURAR = SVG('<rect x="5" y="8.5" width="10.5" height="10.5" rx="2.2"/><path d="M8.5 5.5h7.8a2.2 2.2 0 0 1 2.2 2.2v7.8"/>');
const FECHAR = SVG('<path d="M7 7l10 10M17 7 7 17"/>');

function desenharMaximizar(): void {
  for (const botao of document.querySelectorAll<HTMLButtonElement>('.janela-botoes__max')) {
    const nome = maximizada ? 'Restaurar' : 'Maximizar';
    botao.title = nome;
    botao.setAttribute('aria-label', nome);
    botao.replaceChildren(iconEl(maximizada ? RESTAURAR : MAXIMIZAR));
  }
}

/** Liga tudo ao abrir o chat. No navegador e no celular não faz nada. */
export function ligarJanela(): Promise<InfoDaJanela | null> {
  pronta = ligar();
  return pronta;
}

async function ligar(): Promise<InfoDaJanela | null> {
  const desktop = loftDesktop();
  if (desktop?.janelaEscolhas === undefined) return null;
  const info = await desktop.janelaEscolhas();
  propria = info.nasceu.barra === 'loftchat';
  maximizada = info.maximizada;
  const raiz = document.documentElement;
  raiz.classList.toggle('janela-propria', propria);
  raiz.classList.toggle('janela-redonda', info.nasceu.transparente);
  raiz.classList.toggle('janela-maximizada', maximizada);
  desktop.aoEstadoDaJanela?.((estado) => {
    maximizada = estado.maximizada;
    raiz.classList.toggle('janela-maximizada', maximizada);
    desenharMaximizar();
  });
  if (info.nasceu.transparente) ligarBordas();
  // Entrar, cadastro, convite: telas sem a barra de cima do chat. Uma faixa
  // fininha no topo segura a janela e traz os 3 botões (some dentro do app).
  if (propria) {
    const botoes = botoesDaJanela();
    if (botoes !== null) document.body.append(el('div', { class: 'janela-flutuante' }, [botoes]));
  }
  return info;
}

/** Os 3 botões no fim da barra de cima — ou null (barra do sistema, navegador, celular). */
export function botoesDaJanela(): HTMLElement | null {
  const desktop = loftDesktop();
  if (!propria || desktop?.janelaAcao === undefined) return null;
  const botao = (acao: 'min' | 'max' | 'fechar', nome: string, icone: string): HTMLButtonElement => {
    const b = el('button', { class: `janela-botoes__${acao}`, type: 'button', title: nome, 'aria-label': nome }, [
      iconEl(icone),
    ]);
    b.addEventListener('click', () => desktop.janelaAcao?.(acao));
    return b;
  };
  const caixa = el('div', { class: 'janela-botoes' }, [
    botao('min', 'Minimizar', MINIMIZAR),
    botao('max', maximizada ? 'Restaurar' : 'Maximizar', maximizada ? RESTAURAR : MAXIMIZAR),
    botao('fechar', 'Fechar', FECHAR),
  ]);
  return caixa;
}

/** Dois cliques num pedaço vazio da barra de cima: maximiza ou restaura. */
export function duploCliqueNaBarra(barra: HTMLElement): void {
  if (!propria) return;
  barra.addEventListener('dblclick', (e) => {
    if (e.target !== barra && (e.target as HTMLElement).closest('button, a, input, li') !== null) return;
    loftDesktop()?.janelaAcao?.('max');
  });
}

let pontoAvisado: boolean | null = null;
/** Bolinha vermelha no ícone da bandeja: tem mensagem não lida? */
export function avisarBandeja(tem: boolean): void {
  if (pontoAvisado === tem) return;
  pontoAvisado = tem;
  loftDesktop()?.bandejaPonto?.(tem);
}

/*
 * Linux com cantos redondos: a janela é transparente e o sistema não dá
 * borda para puxar. Faixas invisíveis nas beiradas fazem isso — mandam onde
 * o mouse está, e o programa muda o tamanho.
 */
function ligarBordas(): void {
  const desktop = loftDesktop();
  if (desktop?.janelaPuxar === undefined) return;
  const caixa = el('div', { class: 'janela-bordas', 'aria-hidden': 'true' });
  for (const borda of ['n', 's', 'l', 'o', 'nl', 'no', 'sl', 'so']) {
    const faixa = el('div', { class: `janela-borda janela-borda--${borda}` });
    let quadro = 0;
    let ultimo: [number, number] | null = null;
    faixa.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      faixa.setPointerCapture(e.pointerId);
      desktop.janelaPuxar?.(borda, e.screenX, e.screenY);
    });
    faixa.addEventListener('pointermove', (e) => {
      if (!faixa.hasPointerCapture(e.pointerId)) return;
      ultimo = [e.screenX, e.screenY];
      if (quadro !== 0) return;
      quadro = requestAnimationFrame(() => {
        quadro = 0;
        if (ultimo !== null) desktop.janelaPuxando?.(ultimo[0], ultimo[1]);
      });
    });
    const soltar = (): void => {
      cancelAnimationFrame(quadro);
      quadro = 0;
      if (ultimo !== null) desktop.janelaPuxando?.(ultimo[0], ultimo[1]);
      ultimo = null;
      desktop.janelaSoltar?.();
    };
    faixa.addEventListener('pointerup', soltar);
    faixa.addEventListener('lostpointercapture', soltar);
    caixa.append(faixa);
  }
  document.body.append(caixa);
}
