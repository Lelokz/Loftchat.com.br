package br.com.loftchat;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * ATUALIZAR O APP (17/11/2026) — `src/lib/atualizacao.ts`.
 *
 * Baixa o APK da versão nova (das Releases do GitHub) para a pasta de
 * rascunhos do app e abre a tela de instalar do próprio Android. O "Instalar"
 * é sempre da pessoa: o Android não deixa app nenhum instalar sozinho.
 *
 * Na primeira vez o Android exige liberar "instalar apps desta fonte" para o
 * Loftchat: abre essa tela e devolve o erro PERMISSAO (o chat explica e a
 * pessoa toca em Atualizar de novo).
 */
@CapacitorPlugin(name = "Atualizador")
public class PluginDoAtualizador extends Plugin {

    @PluginMethod
    public void instalar(PluginCall call) {
        String endereco = call.getString("url");
        if (endereco == null || !endereco.startsWith("https://github.com/")) {
            call.reject("Endereço da atualização inválido.");
            return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            && !getContext().getPackageManager().canRequestPackageInstalls()) {
            Intent liberar = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:" + getContext().getPackageName()))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(liberar);
            call.reject("Libere a instalação para o Loftchat.", "PERMISSAO");
            return;
        }
        new Thread(() -> baixarEInstalar(call, endereco), "loftchat-atualizacao").start();
    }

    private void baixarEInstalar(PluginCall call, String endereco) {
        File pasta = new File(getContext().getCacheDir(), "atualizacao");
        File apk = new File(pasta, "Loftchat.apk");
        try {
            if (!pasta.exists() && !pasta.mkdirs()) throw new IllegalStateException("sem pasta");
            HttpURLConnection conexao = abrir(endereco);
            long total = conexao.getContentLengthLong();
            try (InputStream entrada = conexao.getInputStream(); OutputStream saida = new FileOutputStream(apk)) {
                byte[] pedaco = new byte[64 * 1024];
                long baixado = 0;
                int ultimo = -1;
                int lidos;
                while ((lidos = entrada.read(pedaco)) != -1) {
                    saida.write(pedaco, 0, lidos);
                    baixado += lidos;
                    int pct = total > 0 ? (int) (baixado * 100 / total) : 0;
                    if (pct != ultimo) {
                        ultimo = pct;
                        JSObject progresso = new JSObject();
                        progresso.put("pct", pct);
                        notifyListeners("progresso", progresso);
                    }
                }
            } finally {
                conexao.disconnect();
            }
            Uri arquivo = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apk);
            Intent instalar = new Intent(Intent.ACTION_VIEW)
                .setDataAndType(arquivo, "application/vnd.android.package-archive")
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(instalar);
            call.resolve();
        } catch (Exception erro) {
            call.reject("Não deu para baixar a atualização.", "BAIXAR", erro);
        }
    }

    /** O GitHub manda o APK por redirecionamentos (para o servidor de arquivos): segue até 5. */
    private HttpURLConnection abrir(String endereco) throws Exception {
        String atual = endereco;
        for (int i = 0; i < 5; i++) {
            HttpURLConnection c = (HttpURLConnection) new URL(atual).openConnection();
            c.setInstanceFollowRedirects(false);
            c.setConnectTimeout(20_000);
            c.setReadTimeout(30_000);
            int codigo = c.getResponseCode();
            if (codigo >= 300 && codigo < 400) {
                String proximo = c.getHeaderField("Location");
                c.disconnect();
                if (proximo == null || !proximo.startsWith("https://")) throw new IllegalStateException("redirecionamento estranho");
                atual = proximo;
                continue;
            }
            if (codigo != 200) throw new IllegalStateException("HTTP " + codigo);
            return c;
        }
        throw new IllegalStateException("redirecionamentos demais");
    }
}
