package br.com.loftchat;

import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.WebView;

import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import androidx.webkit.WebSettingsCompat;
import androidx.webkit.WebViewFeature;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // O "Em chamada" (etapa 10b), antes do super: o Capacitor carrega os
        // plugins ao montar a ponte.
        registerPlugin(PluginDaChamada.class);
        registerPlugin(PluginDaTela.class);
        registerPlugin(PluginDaTransmissao.class);
        registerPlugin(PluginDoAtualizador.class);
        super.onCreate(savedInstanceState);

        // A página continua com prioridade alta com o app atrás: a voz e a
        // tela transmitida (etapa 10c) não podem engasgar quando a pessoa
        // abre outro app para mostrar.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getBridge().getWebView().setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false);
        }

        // ESCURO FORÇADO (revisão dos celulares, 23/11/2026): Xiaomi e outros
        // pintam de escuro o app que "não tem tema escuro", invertendo cores.
        // O Loftchat tem os próprios temas (claro e escuro) — nada de pintar
        // por cima. São as duas chaves oficiais: a da janela (Android 10+) e a
        // do WebView (Android 13+, pela androidx.webkit).
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            getWindow().getDecorView().setForceDarkAllowed(false);
            getBridge().getWebView().setForceDarkAllowed(false);
        }
        if (WebViewFeature.isFeatureSupported(WebViewFeature.ALGORITHMIC_DARKENING)) {
            WebSettingsCompat.setAlgorithmicDarkeningAllowed(getBridge().getWebView().getSettings(), false);
        }

        // O Loftchat vai até a borda de cima, por trás do furinho da câmera
        // (o chat só desce os BOTÕES a altura dele, pelo env(safe-area-inset-top)).
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            WindowManager.LayoutParams janela = getWindow().getAttributes();
            janela.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            getWindow().setAttributes(janela);
        }
        esconderBarraDeCima();
    }

    /*
     * A BARRA DE CIMA DO SISTEMA (hora, bateria, notificações) fica escondida
     * — pedido do Leo, 16/11: o app ocupa a tela toda, sem faixa em cima.
     * Puxando o dedo de cima para baixo ela aparece por uns segundos e some
     * de novo. A barra de gestos de baixo continua (não é tela cheia).
     * O Android às vezes devolve a barra (teclado, voltar ao app): reaplica.
     */
    private void esconderBarraDeCima() {
        WindowInsetsControllerCompat barras =
            WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        barras.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        barras.hide(WindowInsetsCompat.Type.statusBars());
        // Quando ela aparece pelo puxão, e na barra de gestos: ícones CLAROS
        // (o Loftchat é escuro).
        barras.setAppearanceLightStatusBars(false);
        barras.setAppearanceLightNavigationBars(false);
        conferirSeEscondeu();
    }

    /** Pediu para esconder: confere, logo depois, se o celular obedeceu (ver PluginDaTela). */
    private void conferirSeEscondeu() {
        getWindow().getDecorView().postDelayed(() -> {
            WindowInsetsCompat agora = ViewCompat.getRootWindowInsets(getWindow().getDecorView());
            if (agora != null && !agora.isVisible(WindowInsetsCompat.Type.statusBars())) {
                PluginDaTela.marcarEscondida();
            }
        }, 400);
    }

    @Override
    public void onResume() {
        super.onResume();
        esconderBarraDeCima();
    }

    @Override
    public void onWindowFocusChanged(boolean temFoco) {
        super.onWindowFocusChanged(temFoco);
        if (temFoco) esconderBarraDeCima();
    }
}
