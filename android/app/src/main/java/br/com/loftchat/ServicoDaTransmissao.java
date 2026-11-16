package br.com.loftchat;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.graphics.PixelFormat;
import android.hardware.display.DisplayManager;
import android.hardware.display.VirtualDisplay;
import android.media.Image;
import android.media.ImageReader;
import android.media.projection.MediaProjection;
import android.media.projection.MediaProjectionManager;
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.IBinder;
import android.os.Looper;
import android.os.SystemClock;
import android.util.Base64;
import android.util.DisplayMetrics;
import android.view.Display;

import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;
import androidx.core.content.IntentCompat;
import androidx.webkit.WebMessageCompat;
import androidx.webkit.WebMessagePortCompat;
import androidx.webkit.WebViewFeature;

import java.io.ByteArrayOutputStream;

/**
 * "TRANSMITINDO A TELA" (etapa 10c) — captura a tela do celular.
 *
 * O Android exige um serviço em primeiro plano do tipo "projeção de mídia",
 * com notificação fixa, enquanto a tela é capturada. A tela vai para uma
 * tela virtual de até 1280 px no lado maior; cada imagem vira JPEG e segue
 * para a página do app pelo canal de mensagens (ver `src/lib/android-tela.ts`).
 *
 * RITMO: no máximo ~15 imagens por segundo, e a próxima só sai depois que a
 * página responde "ok" à anterior — celular lento não acumula fila. Tela
 * parada: reenvia a última a cada segundo, para quem entra na sala depois ver
 * a imagem.
 */
public class ServicoDaTransmissao extends Service {
    static final String CANAL = "transmissao";
    static final int ID = 2;
    static final String ACAO_PARAR = "br.com.loftchat.PARAR_TRANSMISSAO";
    static final String EXTRA_CODIGO = "codigo";
    static final String EXTRA_DADOS = "dados";

    /** O canal da página, entregue pelo plugin logo antes de ligar o serviço. */
    static WebMessagePortCompat portaPendente;

    private static final int LADO_MAIOR = 1280;
    private static final long INTERVALO_MS = 66;
    private static final int QUALIDADE_JPEG = 70;

    private final Handler noPrincipal = new Handler(Looper.getMainLooper());
    private HandlerThread fio;
    private Handler noFio;
    private MediaProjection projecao;
    private VirtualDisplay telaVirtual;
    private ImageReader leitor;
    private WebMessagePortCompat porta;
    private volatile boolean parado;
    private boolean sabeBytes;

    // Daqui para baixo, só no `fio`.
    private int largura;
    private int altura;
    private int dpi;
    private Bitmap ultimo;
    private int larguraUtil;
    private boolean temNovo;
    private boolean aguardando;
    private long enviadoEm;
    private final ByteArrayOutputStream jpeg = new ByteArrayOutputStream();

    private final Runnable tentar = this::tentarEnviar;
    private final Runnable destravar = () -> {
        aguardando = false;
        tentarEnviar();
    };
    private final Runnable pulso = new Runnable() {
        @Override
        public void run() {
            if (parado) return;
            if (ultimo != null && SystemClock.uptimeMillis() - enviadoEm >= 1000) {
                temNovo = true;
                tentarEnviar();
            }
            noFio.postDelayed(this, 1000);
        }
    };

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACAO_PARAR.equals(intent.getAction())) {
            pararTudo();
            return START_NOT_STICKY;
        }
        if (projecao != null || intent == null) return START_NOT_STICKY;

        criarCanal();
        int tipo = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
            ? ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION
            : 0;
        ServiceCompat.startForeground(this, ID, notificacao(), tipo);

        Intent dados = IntentCompat.getParcelableExtra(intent, EXTRA_DADOS, Intent.class);
        MediaProjectionManager gerente = getSystemService(MediaProjectionManager.class);
        projecao = dados == null ? null : gerente.getMediaProjection(intent.getIntExtra(EXTRA_CODIGO, 0), dados);
        porta = portaPendente;
        portaPendente = null;
        if (projecao == null || porta == null) {
            pararTudo();
            return START_NOT_STICKY;
        }
        sabeBytes = WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_ARRAY_BUFFER);

        fio = new HandlerThread("loftchat-tela");
        fio.start();
        noFio = new Handler(fio.getLooper());

        // A página respondeu "ok": pode mandar a próxima.
        porta.setWebMessageCallback(noFio, new WebMessagePortCompat.WebMessageCallbackCompat() {
            @Override
            public void onMessage(WebMessagePortCompat p, WebMessageCompat mensagem) {
                noFio.removeCallbacks(destravar);
                aguardando = false;
                tentarEnviar();
            }
        });

        // Obrigatório antes da tela virtual (Android 14+). O Android para a
        // captura sozinho em alguns casos (tela bloqueada, outro app pediu).
        projecao.registerCallback(new MediaProjection.Callback() {
            @Override
            public void onStop() {
                pararTudo();
            }
        }, noPrincipal);

        medir();
        leitor = novoLeitor();
        telaVirtual = projecao.createVirtualDisplay(
            "Loftchat", largura, altura, dpi,
            DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
            leitor.getSurface(), null, noFio);
        noFio.postDelayed(pulso, 1000);
        return START_NOT_STICKY;
    }

    /** O tamanho da tela agora (muda ao girar o celular), limitado a 1280 px. */
    private void medir() {
        DisplayMetrics m = new DisplayMetrics();
        Display tela = getSystemService(DisplayManager.class).getDisplay(Display.DEFAULT_DISPLAY);
        tela.getRealMetrics(m);
        float escala = Math.min(1f, (float) LADO_MAIOR / Math.max(m.widthPixels, m.heightPixels));
        // Par: o codificador de vídeo do outro lado não gosta de lado ímpar.
        largura = Math.max(2, Math.round(m.widthPixels * escala) & ~1);
        altura = Math.max(2, Math.round(m.heightPixels * escala) & ~1);
        dpi = m.densityDpi;
    }

    private ImageReader novoLeitor() {
        ImageReader r = ImageReader.newInstance(largura, altura, PixelFormat.RGBA_8888, 2);
        r.setOnImageAvailableListener(this::chegouImagem, noFio);
        return r;
    }

    private void chegouImagem(ImageReader r) {
        Image imagem;
        try {
            imagem = r.acquireLatestImage();
        } catch (IllegalStateException fechado) {
            return;
        }
        if (imagem == null) return;
        try {
            if (r != leitor || parado) return;
            Image.Plane plano = imagem.getPlanes()[0];
            // A linha pode ter sobra no fim (alinhamento): o bitmap leva a
            // sobra, e o recorte tira na hora de comprimir.
            int larguraComSobra = plano.getRowStride() / plano.getPixelStride();
            if (ultimo == null || ultimo.getWidth() != larguraComSobra || ultimo.getHeight() != imagem.getHeight()) {
                if (ultimo != null) ultimo.recycle();
                ultimo = Bitmap.createBitmap(larguraComSobra, imagem.getHeight(), Bitmap.Config.ARGB_8888);
            }
            ultimo.copyPixelsFromBuffer(plano.getBuffer());
            larguraUtil = imagem.getWidth();
            temNovo = true;
        } finally {
            imagem.close();
        }
        tentarEnviar();
    }

    private void tentarEnviar() {
        if (parado || aguardando || !temNovo || ultimo == null) return;
        long agora = SystemClock.uptimeMillis();
        long falta = enviadoEm + INTERVALO_MS - agora;
        if (falta > 0) {
            noFio.removeCallbacks(tentar);
            noFio.postDelayed(tentar, falta);
            return;
        }
        temNovo = false;
        aguardando = true;
        enviadoEm = agora;

        Bitmap recorte = larguraUtil == ultimo.getWidth()
            ? ultimo
            : Bitmap.createBitmap(ultimo, 0, 0, larguraUtil, ultimo.getHeight());
        jpeg.reset();
        recorte.compress(Bitmap.CompressFormat.JPEG, QUALIDADE_JPEG, jpeg);
        if (recorte != ultimo) recorte.recycle();
        byte[] bytes = jpeg.toByteArray();
        WebMessageCompat mensagem = sabeBytes
            ? new WebMessageCompat(bytes)
            : new WebMessageCompat(Base64.encodeToString(bytes, Base64.NO_WRAP));
        noPrincipal.post(() -> {
            if (!parado) porta.postMessage(mensagem);
        });
        // A página não respondeu (ocupada, perdeu o quadro): segue depois de 2 s.
        noFio.removeCallbacks(destravar);
        noFio.postDelayed(destravar, 2000);
    }

    /** Girou o celular: a tela virtual acompanha (sem pedir autorização de novo). */
    @Override
    public void onConfigurationChanged(Configuration nova) {
        super.onConfigurationChanged(nova);
        if (noFio == null || parado) return;
        noFio.post(() -> {
            if (parado || telaVirtual == null) return;
            int antesL = largura;
            int antesA = altura;
            medir();
            if (largura == antesL && altura == antesA) return;
            ImageReader velho = leitor;
            leitor = novoLeitor();
            telaVirtual.resize(largura, altura, dpi);
            telaVirtual.setSurface(leitor.getSurface());
            velho.close();
        });
    }

    /** O ÚNICO jeito de parar: botão Parar, o chat pedindo, ou o Android. */
    private void pararTudo() {
        if (parado) return;
        parado = true;
        if (noFio != null) {
            noFio.removeCallbacksAndMessages(null);
            noFio.post(() -> {
                if (telaVirtual != null) telaVirtual.release();
                if (leitor != null) leitor.close();
                if (ultimo != null) ultimo.recycle();
                fio.quitSafely();
            });
        }
        noPrincipal.post(() -> {
            if (projecao != null) projecao.stop();
            if (porta != null) porta.close();
        });
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE);
        stopSelf();
        PluginDaTransmissao.avisarParou();
    }

    private Notification notificacao() {
        int imutavel = PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT;
        Intent abrir = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent aoTocar = PendingIntent.getActivity(this, 2, abrir, imutavel);
        Intent parar = new Intent(this, ServicoDaTransmissao.class).setAction(ACAO_PARAR);
        PendingIntent aoParar = PendingIntent.getService(this, 3, parar, imutavel);
        return new NotificationCompat.Builder(this, CANAL)
            .setSmallIcon(R.drawable.loftchat_notificacao)
            .setContentTitle("Transmitindo a tela")
            .setContentText("Quem está na sala vê a tela do seu celular.")
            .setOngoing(true)
            .setSilent(true)
            .setContentIntent(aoTocar)
            .addAction(0, "Parar", aoParar)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .build();
    }

    private void criarCanal() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager gerente = getSystemService(NotificationManager.class);
        if (gerente.getNotificationChannel(CANAL) != null) return;
        NotificationChannel canal = new NotificationChannel(CANAL, "Transmissão de tela", NotificationManager.IMPORTANCE_LOW);
        canal.setDescription("Aparece enquanto você transmite a tela do celular numa sala.");
        canal.setSound(null, null);
        gerente.createNotificationChannel(canal);
    }

    @Override
    public void onDestroy() {
        pararTudo();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
