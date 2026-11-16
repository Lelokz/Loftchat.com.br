import { App } from '@capacitor/app';
import { Capacitor, registerPlugin } from '@capacitor/core';

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
/** Rodando dentro do app Android? */
export function emAppAndroid(): boolean {
  return Capacitor.isNativePlatform();
}

export function ligarAndroid(): void {
  if (!Capacitor.isNativePlatform()) return;
  document.documentElement.classList.add('app-android');
  /*
   * A BARRA DE CIMA DO SISTEMA: o app pede para escondê-la (MainActivity).
   * Se o celular obedeceu, o Loftchat vai até a borda de cima, sem folga
   * nenhuma (pedido do Leo); se não, os botões ficam abaixo da barra, como
   * antes. Quem sabe é o `PluginDaTela.java`.
   */
  const marcar = (): void => document.documentElement.classList.add('barra-escondida');
  void tela.addListener('escondida', marcar);
  void tela.estado().then(({ escondida }) => {
    if (escondida) marcar();
  });

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

/** A barra de cima do sistema sumiu de verdade? (`PluginDaTela.java`) */
interface Tela {
  estado(): Promise<{ escondida: boolean }>;
  addListener(evento: 'escondida', ouvinte: () => void): Promise<{ remove: () => Promise<void> }>;
}

const tela = registerPlugin<Tela>('Tela');

/** O "Em chamada" do Android (etapa 10b): `android/.../PluginDaChamada.java`. */
interface Chamada {
  iniciar(opcoes: { sala: string }): Promise<void>;
  parar(): Promise<void>;
  addListener(evento: 'sair', ouvinte: () => void): Promise<{ remove: () => Promise<void> }>;
}

const chamada = registerPlugin<Chamada>('Chamada');

/**
 * Liga a notificação fixa "Em chamada" enquanto há uma chamada aberta — é o
 * que mantém o microfone vivo com o app atrás ou a tela apagada (sem ela o
 * Android corta). O botão Sair da notificação sai da sala pelo chat.
 *
 * `sala` é chamado a cada mudança; devolve o nome da sala da chamada, ou
 * null sem chamada. Só o NOME mudar também atualiza a notificação.
 */
export function acompanharChamadaNoAndroid(
  sala: () => string | null,
  sair: () => void,
): { aoMudar: () => void; desligar: () => void } {
  if (!Capacitor.isNativePlatform()) return { aoMudar: () => {}, desligar: () => {} };
  let atual: string | null = null;
  const ouvinte = chamada.addListener('sair', sair);
  return {
    aoMudar: () => {
      const agora = sala();
      if (agora === atual) return;
      atual = agora;
      if (agora === null) void chamada.parar().catch(() => {});
      else void chamada.iniciar({ sala: agora }).catch((erro: unknown) => console.warn('[chamada]', erro));
    },
    // Saiu da conta (o chat desmonta): a notificação não fica para trás.
    desligar: () => {
      void ouvinte.then((o) => o.remove());
      if (atual !== null) void chamada.parar().catch(() => {});
      atual = null;
    },
  };
}
