package br.com.loftchat;

import android.Manifest;
import android.content.Intent;
import android.os.Build;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * A ponte entre o chat e o "Em chamada" (etapa 10b): o chat liga a
 * notificação ao entrar numa sala e desliga ao sair; o botão Sair da
 * notificação volta para o chat como o evento "sair".
 */
@CapacitorPlugin(
    name = "Chamada",
    permissions = { @Permission(alias = "notificacoes", strings = { Manifest.permission.POST_NOTIFICATIONS }) }
)
public class PluginDaChamada extends Plugin {
    private static PluginDaChamada atual;

    @Override
    public void load() {
        atual = this;
    }

    static void avisarSair() {
        if (atual != null) atual.notifyListeners("sair", new JSObject());
    }

    @PluginMethod
    public void iniciar(PluginCall call) {
        // Android 13+: sem esta permissão a notificação some da gaveta (a voz
        // continua). Pede; se a pessoa já recusou, o Android responde na hora
        // sem perguntar de novo, e a chamada segue igual.
        if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notificacoes") != PermissionState.GRANTED) {
            requestPermissionForAlias("notificacoes", call, "depoisDaPermissao");
            return;
        }
        ligar(call);
    }

    @PermissionCallback
    private void depoisDaPermissao(PluginCall call) {
        ligar(call);
    }

    private void ligar(PluginCall call) {
        Intent intent = new Intent(getContext(), ServicoDaChamada.class)
            .putExtra(ServicoDaChamada.EXTRA_SALA, call.getString("sala", "Sala de voz"));
        try {
            ContextCompat.startForegroundService(getContext(), intent);
            call.resolve();
        } catch (Exception erro) {
            call.reject("Não deu para ligar o aviso da chamada.", erro);
        }
    }

    @PluginMethod
    public void parar(PluginCall call) {
        getContext().stopService(new Intent(getContext(), ServicoDaChamada.class));
        call.resolve();
    }
}
