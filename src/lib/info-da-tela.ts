import { addDoc, collection } from 'firebase/firestore';

import { db } from './firebase';
import { estadoDaAtualizacao } from './atualizacao';

/**
 * "MANDAR INFORMAÇÕES DA TELA" (Configurações → Sobre, 23/11/2026).
 *
 * Quando o Loftchat fica feio no celular de alguém, o Léo precisava pedir
 * print. Um toque aqui manda o que importa para desenhar a tela daquele
 * aparelho: modelo, Android, tamanho da tela, densidade, tamanho da letra do
 * sistema, versão do navegador interno — sem foto e sem nada da conversa. Vai
 * o nome de exibição, para saber de quem é o celular.
 *
 * Fica em `infoDeTela/` e a regra só deixa CRIAR: ninguém lê pelo app.
 */
export interface InfoDaTela {
  nome: string;
  quando: string;
  onde: string;
  versao: string;
  navegador: string;
  telaW: number;
  telaH: number;
  janelaW: number;
  janelaH: number;
  densidade: number;
  letra: number;
  escuro: boolean;
  toque: boolean;
  margens: string;
  recursos: string;
}

/** Quanto a letra do sistema aumentou: o Android multiplica o texto, não o resto. */
function medirLetra(): number {
  const amostra = document.createElement('span');
  amostra.textContent = 'M';
  amostra.style.cssText =
    'position:fixed;left:-9999px;top:0;font:100px/1 sans-serif;padding:0;margin:0;visibility:hidden';
  document.body.append(amostra);
  const altura = amostra.getBoundingClientRect().height;
  amostra.remove();
  return Math.round((altura / 100) * 100) / 100;
}

/** Folga que o sistema tira (entalhe da câmera, barra de botões), em px: cima/direita/baixo/esquerda. */
function medirMargens(): string {
  const caixa = document.createElement('div');
  caixa.style.cssText =
    'position:fixed;visibility:hidden;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
  document.body.append(caixa);
  const s = getComputedStyle(caixa);
  const texto = [s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft].map((v) => parseFloat(v) || 0).join('/');
  caixa.remove();
  return texto;
}

/** Os recursos de visual que o Loftchat usa e que navegador velho não tem. */
function medirRecursos(): string {
  const tem = (prop: string, valor: string): boolean => CSS.supports(prop, valor);
  const lista = [
    `color-mix:${tem('color', 'color-mix(in srgb, red, blue)') ? 'sim' : 'NAO'}`,
    `has:${CSS.supports('selector(:has(a))') ? 'sim' : 'NAO'}`,
    `dvh:${tem('height', '100dvh') ? 'sim' : 'NAO'}`,
  ];
  return lista.join(' ');
}

export function juntarInfoDaTela(nome: string): InfoDaTela {
  return {
    nome: nome.slice(0, 60),
    quando: new Date().toISOString(),
    onde: estadoDaAtualizacao().onde,
    versao: __VERSAO__,
    navegador: navigator.userAgent.slice(0, 300),
    telaW: screen.width,
    telaH: screen.height,
    janelaW: window.innerWidth,
    janelaH: window.innerHeight,
    densidade: Math.round(window.devicePixelRatio * 1000) / 1000,
    letra: medirLetra(),
    escuro: window.matchMedia('(prefers-color-scheme: dark)').matches,
    toque: window.matchMedia('(pointer: coarse)').matches,
    margens: medirMargens(),
    recursos: medirRecursos(),
  };
}

export async function mandarInfoDaTela(nome: string): Promise<void> {
  await addDoc(collection(db, 'infoDeTela'), juntarInfoDaTela(nome));
}
