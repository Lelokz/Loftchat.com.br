/**
 * O Loft rodando dentro da JANELA de computador (desktop/, Electron).
 *
 * A janela abre este mesmo site e põe `window.loftDesktop` na página (ver
 * desktop/preload.cjs). No navegador ela não existe, e tudo segue como antes.
 */

export interface FonteDeTela {
  id: string;
  nome: string;
  tipo: 'tela' | 'janela';
  /** Imagem PNG em data URL; null quando o sistema não deu miniatura. */
  miniatura: string | null;
  /** Ícone do programa (só janelas), em data URL. */
  icone: string | null;
}

export interface LoftDesktop {
  fontesDeTela(): Promise<FonteDeTela[]>;
  /** Avisa a janela qual fonte o próximo getDisplayMedia deve entregar. */
  escolherFonte(id: string): Promise<void>;
}

export function loftDesktop(): LoftDesktop | null {
  return (window as unknown as { loftDesktop?: LoftDesktop }).loftDesktop ?? null;
}
