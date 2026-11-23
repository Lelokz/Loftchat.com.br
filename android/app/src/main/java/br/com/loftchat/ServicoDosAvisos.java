package br.com.loftchat;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.PorterDuff;
import android.graphics.PorterDuffXfermode;
import android.graphics.Rect;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.Map;

/**
 * NOTIFICAÇÕES DE MENSAGEM (0.4.0): o Google acorda este serviço quando o
 * carteiro manda um aviso, mesmo com o app fechado. Ele monta a notificação:
 * foto e nome de quem mandou, onde ("no seu privado" ou "Grupo · #canal"),
 * horário e a mensagem. Tocar abre a conversa.
 */
public class ServicoDosAvisos extends FirebaseMessagingService {
    static final String CANAL = "mensagens";
    static final String EXTRA_ABRIR = "loftchat_abrir";

    @Override
    public void onNewToken(String token) {
        PluginDosAvisos.tokenNovo(token);
    }

    @Override
    public void onMessageReceived(RemoteMessage mensagem) {
        Map<String, String> d = mensagem.getData();
        String conversa = d.get("conversa");
        if (conversa == null) return;
        // Já estou olhando essa conversa: nada de aviso.
        if (MainActivity.naFrente && conversa.equals(PluginDosAvisos.conversaAberta)) return;
        mostrar(d, conversa);
    }

    private void mostrar(Map<String, String> d, String conversa) {
        criarCanal(this);
        String de = valor(d, "de", "Loftchat");
        String texto = valor(d, "texto", "");

        Intent abrir = new Intent(this, MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
            .putExtra(EXTRA_ABRIR, valor(d, "abrir", ""));
        PendingIntent aoTocar = PendingIntent.getActivity(
            this, conversa.hashCode(), abrir, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);

        NotificationCompat.Builder aviso = new NotificationCompat.Builder(this, CANAL)
            .setSmallIcon(R.drawable.loftchat_notificacao)
            .setContentTitle(de)
            .setContentText(texto)
            .setSubText(valor(d, "onde", ""))
            .setStyle(new NotificationCompat.BigTextStyle().bigText(texto))
            .setWhen(quando(d.get("quando")))
            .setShowWhen(true)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setContentIntent(aoTocar);
        Bitmap foto = baixarFoto(d.get("foto"));
        if (foto != null) aviso.setLargeIcon(foto);

        try {
            NotificationManagerCompat.from(this).notify(conversa.hashCode(), aviso.build());
        } catch (SecurityException semPermissao) {
            // A pessoa não deixou o Loftchat notificar.
        }
    }

    static void criarCanal(android.content.Context contexto) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager gerente = contexto.getSystemService(NotificationManager.class);
        if (gerente.getNotificationChannel(CANAL) != null) return;
        NotificationChannel canal = new NotificationChannel(CANAL, "Mensagens", NotificationManager.IMPORTANCE_HIGH);
        canal.setDescription("Mensagens novas nos grupos e no privado.");
        gerente.createNotificationChannel(canal);
    }

    private static String valor(Map<String, String> d, String chave, String padrao) {
        String v = d.get(chave);
        return v == null ? padrao : v;
    }

    private static long quando(String iso) {
        if (iso == null) return System.currentTimeMillis();
        try {
            SimpleDateFormat formato = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSX", Locale.US);
            Date data = formato.parse(iso);
            return data == null ? System.currentTimeMillis() : data.getTime();
        } catch (Exception erro) {
            return System.currentTimeMillis();
        }
    }

    /** A foto de quem mandou, em círculo. Sem foto (ou sem internet), segue sem. */
    private static Bitmap baixarFoto(String endereco) {
        if (endereco == null || !endereco.startsWith("https://")) return null;
        HttpURLConnection conexao = null;
        try {
            conexao = (HttpURLConnection) new URL(endereco).openConnection();
            conexao.setConnectTimeout(4000);
            conexao.setReadTimeout(4000);
            try (InputStream entrada = conexao.getInputStream()) {
                Bitmap original = BitmapFactory.decodeStream(entrada);
                return original == null ? null : redonda(original);
            }
        } catch (Exception erro) {
            return null;
        } finally {
            if (conexao != null) conexao.disconnect();
        }
    }

    private static Bitmap redonda(Bitmap original) {
        int lado = Math.min(original.getWidth(), original.getHeight());
        Bitmap saida = Bitmap.createBitmap(lado, lado, Bitmap.Config.ARGB_8888);
        Canvas tela = new Canvas(saida);
        Paint pincel = new Paint(Paint.ANTI_ALIAS_FLAG);
        tela.drawCircle(lado / 2f, lado / 2f, lado / 2f, pincel);
        pincel.setXfermode(new PorterDuffXfermode(PorterDuff.Mode.SRC_IN));
        int x = (original.getWidth() - lado) / 2;
        int y = (original.getHeight() - lado) / 2;
        tela.drawBitmap(original, new Rect(x, y, x + lado, y + lado), new Rect(0, 0, lado, lado), pincel);
        return saida;
    }
}
