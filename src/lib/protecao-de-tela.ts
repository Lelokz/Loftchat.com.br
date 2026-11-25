import { protegerNoAndroid } from './android';
import { loftDesktop } from './desktop';

/**
 * PROTEÇÃO CONTRA PRINT (0.10.0), enquanto uma visualização única está aberta.
 *
 * - App Android: FLAG_SECURE — print e gravação de tela saem pretos.
 * - Programa do PC: `setContentProtection` — no Windows (e Mac) a janela sai
 *   preta em print, gravação e transmissão. No Linux o sistema não tem como.
 * - Navegador: não existe jeito; lá só fica sem baixar, copiar e arrastar.
 *
 * Conta quantas telas pediram, para uma fechar sem soltar a outra.
 */
let pedidos = 0;

export function protegerTela(ligar: boolean): void {
  const antes = pedidos > 0;
  pedidos = Math.max(0, pedidos + (ligar ? 1 : -1));
  const agora = pedidos > 0;
  if (antes === agora) return;
  protegerNoAndroid(agora);
  loftDesktop()?.protegerTela?.(agora);
}
