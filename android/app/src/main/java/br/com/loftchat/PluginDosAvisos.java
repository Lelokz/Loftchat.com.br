package br.com.loftchat;

import android.Manifest;
import android.content.Intent;
import android.os.Build;

import androidx.core.app.NotificationManagerCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.google.firebase.messaging.FirebaseMessaging;

/**
 * A ponte entre o chat e as notificações de mensagem (0.4.0):
 *  - `ligar`: pede a permissão (Android 13+) e devolve o token do Google;
 *  - `conversa`: o chat diz qual conversa está aberta (não avisa dela);
 *  - `limpar`: tira as notificações (sair da conta);
 *  - evento `abrir`: a pessoa tocou numa notificação;
 *  - evento `token`: o Google trocou o token deste aparelho.
 */
@CapacitorPlugin(
    name = "Avisos",
    permissions = { @Permission(alias = "notificacoes", strings = { Manifest.permission.POST_NOTIFICATIONS }) }
)
public class PluginDosAvisos extends Plugin {
    static volatile String conversaAberta = "";
    private static PluginDosAvisos atual;

    @Override
    public void load() {
        atual = this;
        pegarAbertura(getActivity().getIntent());
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        pegarAbertura(intent);
    }

    private void pegarAbertura(Intent intent) {
        if (intent == null) return;
        String rota = intent.getStringExtra(ServicoDosAvisos.EXTRA_ABRIR);
        if (rota == null || rota.isEmpty()) return;
        intent.removeExtra(ServicoDosAvisos.EXTRA_ABRIR);
        JSObject evento = new JSObject();
        evento.put("abrir", rota);
        // Guarda até o chat estar pronto para ouvir (app abrindo do zero).
        notifyListeners("abrir", evento, true);
    }

    static void tokenNovo(String token) {
        if (atual == null) return;
        JSObject evento = new JSObject();
        evento.put("token", token);
        atual.notifyListeners("token", evento);
    }

    @PluginMethod
    public void ligar(PluginCall call) {
        ServicoDosAvisos.criarCanal(getContext());
        if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notificacoes") != PermissionState.GRANTED) {
            requestPermissionForAlias("notificacoes", call, "depoisDaPermissao");
            return;
        }
        pegarToken(call);
    }

    @PermissionCallback
    private void depoisDaPermissao(PluginCall call) {
        pegarToken(call);
    }

    private void pegarToken(PluginCall call) {
        boolean permitido = NotificationManagerCompat.from(getContext()).areNotificationsEnabled();
        FirebaseMessaging.getInstance().getToken().addOnCompleteListener(tarefa -> {
            JSObject resposta = new JSObject();
            resposta.put("permitido", permitido);
            resposta.put("token", tarefa.isSuccessful() && tarefa.getResult() != null ? tarefa.getResult() : "");
            call.resolve(resposta);
        });
    }

    @PluginMethod
    public void conversa(PluginCall call) {
        String id = call.getString("id", "");
        conversaAberta = id == null ? "" : id;
        // Abriu a conversa: o aviso dela sai da gaveta.
        if (!conversaAberta.isEmpty()) NotificationManagerCompat.from(getContext()).cancel(conversaAberta.hashCode());
        call.resolve();
    }

    @PluginMethod
    public void limpar(PluginCall call) {
        conversaAberta = "";
        NotificationManagerCompat.from(getContext()).cancelAll();
        call.resolve();
    }
}
