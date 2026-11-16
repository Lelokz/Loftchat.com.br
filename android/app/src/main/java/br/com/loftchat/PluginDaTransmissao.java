package br.com.loftchat;

import android.app.Activity;
import android.content.Intent;
import android.media.projection.MediaProjectionManager;
import android.net.Uri;
import android.webkit.WebView;

import androidx.activity.result.ActivityResult;
import androidx.core.content.ContextCompat;
import androidx.webkit.WebMessageCompat;
import androidx.webkit.WebMessagePortCompat;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * A ponte de TRANSMITIR A TELA DO CELULAR (etapa 10c) — `src/lib/android-tela.ts`.
 *
 * `iniciar` abre a autorização do próprio Android ("O Loftchat vai ter acesso
 * a tudo que aparece na tela…"). Autorizado: abre um canal de mensagens com a
 * página (as imagens vão por ele) e liga o `ServicoDaTransmissao`, que captura.
 */
@CapacitorPlugin(name = "Transmissao")
public class PluginDaTransmissao extends Plugin {
    private static PluginDaTransmissao atual;

    @Override
    public void load() {
        atual = this;
    }

    /** A tela parou pelo Android (Parar na notificação, tela bloqueada…). */
    static void avisarParou() {
        if (atual != null) atual.notifyListeners("parou", new JSObject());
    }

    /** O canal de mensagens depende da versão do "Android System WebView". */
    private static boolean webViewSabe() {
        return WebViewFeature.isFeatureSupported(WebViewFeature.CREATE_WEB_MESSAGE_CHANNEL)
            && WebViewFeature.isFeatureSupported(WebViewFeature.POST_WEB_MESSAGE)
            && WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_PORT_POST_MESSAGE)
            && WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_PORT_SET_MESSAGE_CALLBACK)
            && WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_PORT_CLOSE);
    }

    @PluginMethod
    public void disponivel(PluginCall call) {
        JSObject resposta = new JSObject();
        resposta.put("disponivel", webViewSabe());
        call.resolve(resposta);
    }

    @PluginMethod
    public void iniciar(PluginCall call) {
        if (!webViewSabe()) {
            call.reject("Este celular não deixa transmitir a tela.");
            return;
        }
        MediaProjectionManager gerente = getContext().getSystemService(MediaProjectionManager.class);
        startActivityForResult(call, gerente.createScreenCaptureIntent(), "depoisDaAutorizacao");
    }

    @ActivityCallback
    private void depoisDaAutorizacao(PluginCall call, ActivityResult resultado) {
        JSObject resposta = new JSObject();
        if (resultado.getResultCode() != Activity.RESULT_OK || resultado.getData() == null) {
            // Recusou na janela do Android: desistência, não erro.
            resposta.put("ok", false);
            call.resolve(resposta);
            return;
        }
        try {
            WebView pagina = getBridge().getWebView();
            WebMessagePortCompat[] portas = WebViewCompat.createWebMessageChannel(pagina);
            ServicoDaTransmissao.portaPendente = portas[0];
            WebViewCompat.postWebMessage(
                pagina,
                new WebMessageCompat("loft-tela", new WebMessagePortCompat[] { portas[1] }),
                Uri.parse("*")
            );
            Intent intent = new Intent(getContext(), ServicoDaTransmissao.class)
                .putExtra(ServicoDaTransmissao.EXTRA_CODIGO, resultado.getResultCode())
                .putExtra(ServicoDaTransmissao.EXTRA_DADOS, resultado.getData());
            ContextCompat.startForegroundService(getContext(), intent);
        } catch (Exception erro) {
            call.reject("Não deu para começar a transmitir a tela.", erro);
            return;
        }
        resposta.put("ok", true);
        call.resolve(resposta);
    }

    @PluginMethod
    public void parar(PluginCall call) {
        getContext().stopService(new Intent(getContext(), ServicoDaTransmissao.class));
        call.resolve();
    }
}
