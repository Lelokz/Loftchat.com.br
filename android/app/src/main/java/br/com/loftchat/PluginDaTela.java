package br.com.loftchat;

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

    @PluginMethod
    public void estado(PluginCall call) {
        JSObject resposta = new JSObject();
        resposta.put("escondida", escondeu);
        call.resolve(resposta);
    }
}
