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
    permissions = {
        @Permission(alias = "notificacoes", strings = { Manifest.permission.POST_NOTIFICATIONS }),
        @Permission(alias = "microfone", strings = { Manifest.permission.RECORD_AUDIO })
    }
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
        // 0.13.5: Android 14+ derruba o app que liga o "Em chamada" (tipo
        // microfone) sem o microfone JÁ liberado — era o que fechava o app na
        // primeira chamada de vídeo. Primeiro o microfone, depois o resto.
        if (getPermissionState("microfone") != PermissionState.GRANTED) {
            requestPermissionForAlias("microfone", call, "depoisDoMicrofone");
            return;
        }
        depoisDoMicrofoneLiberado(call);
    }

    @PermissionCallback
    private void depoisDoMicrofone(PluginCall call) {
        if (getPermissionState("microfone") != PermissionState.GRANTED) {
            call.reject("Sem o microfone liberado, o aviso da chamada não liga.");
            return;
        }
        depoisDoMicrofoneLiberado(call);
    }

    private void depoisDoMicrofoneLiberado(PluginCall call) {
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
