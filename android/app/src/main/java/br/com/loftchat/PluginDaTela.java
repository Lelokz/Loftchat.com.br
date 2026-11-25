package br.com.loftchat;

import android.app.Activity;
import android.content.pm.ActivityInfo;
import android.view.WindowManager;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * A barra de cima do sistema SUMIU de verdade? (16/11/2026)
 *
 * O app pede para escondê-la (MainActivity), mas nem todo celular obedece.
 * Quando a MainActivity vê que ela sumiu, avisa aqui uma vez só e para sempre
 * (o puxão do dedo que a mostra por uns segundos não desfaz: senão a tela
 * pularia a cada puxão). O chat pergunta (`estado`) e escuta (`escondida`):
 * escondeu = botões colados no topo; não escondeu = botões abaixo da barra.
 */
@CapacitorPlugin(name = "Tela")
public class PluginDaTela extends Plugin {
    private static PluginDaTela atual;
    private static boolean escondeu = false;

    @Override
    public void load() {
        atual = this;
    }

    static void marcarEscondida() {
        if (escondeu) return;
        escondeu = true;
        if (atual != null) atual.notifyListeners("escondida", new JSObject());
    }

    /**
     * TELA CHEIA da transmissão (16/11/2026). Dentro do app a tela cheia da
     * página não funciona (o Capacitor recusa e a página ficava vazia, com os
     * botões mortos); quem faz é o Android: some com as duas barras do
     * sistema e deita a tela. Sair devolve a barra de gestos e o giro livre.
     */
    @PluginMethod
    public void telaCheia(PluginCall call) {
        boolean ligar = Boolean.TRUE.equals(call.getBoolean("ligar", false));
        Activity atividade = getActivity();
        atividade.runOnUiThread(() -> {
            WindowInsetsControllerCompat barras =
                WindowCompat.getInsetsController(atividade.getWindow(), atividade.getWindow().getDecorView());
            barras.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            if (ligar) {
                barras.hide(WindowInsetsCompat.Type.systemBars());
                atividade.setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
            } else {
                barras.show(WindowInsetsCompat.Type.navigationBars());
                atividade.setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
            }
            call.resolve();
        });
    }

    /**
     * VISUALIZAÇÃO ÚNICA (0.10.0): enquanto a foto/vídeo está aberta, o
     * Android não deixa tirar print nem gravar a tela (sai preto) e esconde
     * o app na lista de recentes. Fechar devolve o normal.
     */
    @PluginMethod
    public void proteger(PluginCall call) {
        boolean ligar = Boolean.TRUE.equals(call.getBoolean("ligar", false));
        Activity atividade = getActivity();
        atividade.runOnUiThread(() -> {
            if (ligar) atividade.getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
            else atividade.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
            call.resolve();
        });
    }

    @PluginMethod
    public void estado(PluginCall call) {
        JSObject resposta = new JSObject();
        resposta.put("escondida", escondeu);
        call.resolve(resposta);
    }
}
