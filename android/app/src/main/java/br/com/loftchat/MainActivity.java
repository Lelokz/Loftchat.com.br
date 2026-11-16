package br.com.loftchat;

import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // O "Em chamada" (etapa 10b), antes do super: o Capacitor carrega os
        // plugins ao montar a ponte.
        registerPlugin(PluginDaChamada.class);
        super.onCreate(savedInstanceState);

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
