package br.com.loftchat;

import android.content.ContentResolver;
import android.database.Cursor;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.provider.OpenableColumns;
import android.webkit.MimeTypeMap;
import android.webkit.ValueCallback;
import android.webkit.WebView;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.PickVisualMediaRequest;
import androidx.activity.result.contract.ActivityResultContracts.PickMultipleVisualMedia;
import androidx.activity.result.contract.ActivityResultContracts.PickVisualMedia;
import androidx.core.content.FileProvider;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebChromeClient;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * FOTO E VÍDEO DA GALERIA (correção de 25/11/2026).
 *
 * O problema: no Android 13+, pedir "imagem/vídeo" pelo seletor comum cai no
 * seletor de fotos do sistema, que devolve um endereço intermediário
 * (content://media/picker/...) cuja data e tamanho mudam entre uma consulta e
 * outra. O WebView acha que o arquivo mudou no meio da leitura e recusa
 * (NotReadableError / ERR_UPLOAD_FILE_CHANGED — bug do Chromium 40123366).
 * Resultado: nenhuma foto, GIF ou vídeo abria no Loftchat do celular.
 *
 * A correção: o mesmo seletor de fotos do sistema (bonito, com a galeria),
 * mas cada arquivo escolhido é COPIADO para uma pasta do próprio app antes
 * de ir para a página. A cópia tem data e tamanho fixos, e o WebView lê
 * normalmente. As cópias velhas (mais de 1 hora) são apagadas.
 *
 * Só entra quando a página pede imagem e/ou vídeo; o resto (câmera, outros
 * tipos) continua com o seletor do Capacitor.
 */
public class SeletorDeMidia extends BridgeWebChromeClient {
    /** Quantas de uma vez (o mesmo teto do seletor do sistema é maior; 20 basta). */
    private static final int MAXIMO = 20;
    /** Acima disso não copia: a página recusa pelo tamanho antes de ler (limite do vídeo é 50 MB). */
    private static final long COPIA_MAXIMA = 60L * 1024 * 1024;
    private static final long UMA_HORA = 60L * 60 * 1000;

    private final Bridge ponte;
    private final ActivityResultLauncher<PickVisualMediaRequest> umSo;
    private final ActivityResultLauncher<PickVisualMediaRequest> varios;
    private final ExecutorService trabalhador = Executors.newSingleThreadExecutor();
    private final Handler principal = new Handler(Looper.getMainLooper());
    private ValueCallback<Uri[]> esperando;

    public SeletorDeMidia(Bridge bridge) {
        super(bridge);
        ponte = bridge;
        umSo = bridge.registerForActivityResult(new PickVisualMedia(), (uri) -> {
            List<Uri> lista = new ArrayList<>();
            if (uri != null) lista.add(uri);
            entregar(lista);
        });
        varios = bridge.registerForActivityResult(new PickMultipleVisualMedia(MAXIMO), this::entregar);
    }

    @Override
    public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> callback, FileChooserParams params) {
        PickVisualMedia.VisualMediaType tipo = params.isCaptureEnabled() ? null : tipoDaMidia(params.getAcceptTypes());
        if (tipo == null) return super.onShowFileChooser(webView, callback, params);

        // Uma escolha por vez: se ficou uma pendurada, ela termina vazia.
        if (esperando != null) esperando.onReceiveValue(null);
        esperando = callback;
        PickVisualMediaRequest pedido = new PickVisualMediaRequest.Builder().setMediaType(tipo).build();
        try {
            if (params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) varios.launch(pedido);
            else umSo.launch(pedido);
        } catch (Exception e) {
            esperando = null;
            return super.onShowFileChooser(webView, callback, params);
        }
        return true;
    }

    /** "image/*,video/*" → foto e vídeo; só imagem; só vídeo; qualquer outra coisa → null (seletor normal). */
    private static PickVisualMedia.VisualMediaType tipoDaMidia(String[] aceitos) {
        boolean imagem = false;
        boolean video = false;
        boolean outro = false;
        for (String bloco : aceitos) {
            if (bloco == null) continue;
            for (String parte : bloco.split(",")) {
                String t = parte.trim().toLowerCase(Locale.ROOT);
                if (t.isEmpty()) continue;
                if (t.startsWith("image/")) imagem = true;
                else if (t.startsWith("video/")) video = true;
                else outro = true;
            }
        }
        if (outro || (!imagem && !video)) return null;
        if (imagem && video) return PickVisualMedia.ImageAndVideo.INSTANCE;
        return imagem ? PickVisualMedia.ImageOnly.INSTANCE : PickVisualMedia.VideoOnly.INSTANCE;
    }

    /** Copia (fora da linha principal) e entrega à página. */
    private void entregar(List<Uri> escolhidos) {
        final ValueCallback<Uri[]> callback = esperando;
        esperando = null;
        if (callback == null) return;
        if (escolhidos == null || escolhidos.isEmpty()) {
            callback.onReceiveValue(null);
            return;
        }
        trabalhador.execute(() -> {
            File pasta = new File(ponte.getContext().getCacheDir(), "escolhidos");
            limparVelhos(pasta);
            List<Uri> prontos = new ArrayList<>();
            int n = 0;
            for (Uri uri : escolhidos) {
                Uri copia = copiar(uri, pasta, n++);
                // Não deu para copiar (ou grande demais): vai o original — a página diz o motivo.
                prontos.add(copia != null ? copia : uri);
            }
            Uri[] resultado = prontos.toArray(new Uri[0]);
            principal.post(() -> callback.onReceiveValue(resultado));
        });
    }

    private Uri copiar(Uri origem, File pasta, int n) {
        ContentResolver resolver = ponte.getContext().getContentResolver();
        String nome = "arquivo";
        long tamanho = -1;
        try (Cursor c = resolver.query(origem, new String[] { OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE }, null, null, null)) {
            if (c != null && c.moveToFirst()) {
                int iNome = c.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                int iTam = c.getColumnIndex(OpenableColumns.SIZE);
                if (iNome >= 0 && !c.isNull(iNome)) nome = c.getString(iNome);
                if (iTam >= 0 && !c.isNull(iTam)) tamanho = c.getLong(iTam);
            }
        } catch (Exception e) {
            // segue com o nome padrão
        }
        if (tamanho > COPIA_MAXIMA) return null;

        // A extensão decide o tipo que o FileProvider informa à página: garante que bate.
        String tipo = resolver.getType(origem);
        String extensao = tipo == null ? null : MimeTypeMap.getSingleton().getExtensionFromMimeType(tipo);
        nome = nome.replaceAll("[^A-Za-z0-9._ -]", "_");
        if (extensao != null && !nome.toLowerCase(Locale.ROOT).endsWith("." + extensao)) nome = nome + "." + extensao;

        if (!pasta.exists() && !pasta.mkdirs()) return null;
        File destino = new File(pasta, System.currentTimeMillis() + "-" + n + "-" + nome);
        try (InputStream entrada = resolver.openInputStream(origem); OutputStream saida = new FileOutputStream(destino)) {
            if (entrada == null) return null;
            byte[] buffer = new byte[64 * 1024];
            long total = 0;
            int lidos;
            while ((lidos = entrada.read(buffer)) != -1) {
                total += lidos;
                if (total > COPIA_MAXIMA) {
                    saida.close();
                    destino.delete();
                    return null;
                }
                saida.write(buffer, 0, lidos);
            }
        } catch (Exception e) {
            destino.delete();
            return null;
        }
        return FileProvider.getUriForFile(ponte.getContext(), ponte.getContext().getPackageName() + ".fileprovider", destino);
    }

    /** Apaga as cópias de mais de 1 hora (as recentes podem estar subindo ainda). */
    private static void limparVelhos(File pasta) {
        File[] arquivos = pasta.listFiles();
        if (arquivos == null) return;
        long agora = System.currentTimeMillis();
        for (File f : arquivos) {
            if (agora - f.lastModified() > UMA_HORA) f.delete();
        }
    }
}
