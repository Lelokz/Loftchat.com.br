import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

/**
 * O APP ANDROID (etapa 10a, Capacitor). Só faz algo dentro do app; no site e
 * no programa não liga nada.
 *
 * O botão VOLTAR do Android segue a ordem que a pessoa espera:
 *   1. uma janela aberta (Configurações, confirmação…) → fecha ela, pelo
 *      mesmo caminho do Esc (o evento `cancel` do <dialog>);
 *   2. senão, volta no histórico — é assim que as gavetas fecham (elas
 *      empilham um estado no histórico ao abrir) e que se sai de uma rota;
 *   3. senão, minimiza o app (nunca fecha: a chamada continua).
 */
export function ligarAndroid(): void {
  if (!Capacitor.isNativePlatform()) return;

  void App.addListener('backButton', ({ canGoBack }) => {
    const janelas = document.querySelectorAll<HTMLDialogElement>('dialog[open]');
    const deCima = janelas[janelas.length - 1];
    if (deCima !== undefined) {
      const pedido = new Event('cancel', { cancelable: true });
      if (deCima.dispatchEvent(pedido)) deCima.close();
      return;
    }
    if (canGoBack) {
      window.history.back();
      return;
    }
    void App.minimizeApp();
  });
}
