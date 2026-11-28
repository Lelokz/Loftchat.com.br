package br.com.loftchat;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;

import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;

/**
 * "EM CHAMADA" (etapa 10b) — o serviço em primeiro plano da chamada de voz.
 *
 * Com o app em segundo plano ou a tela apagada, o Android CORTA o microfone
 * de quem não tem um serviço destes do tipo "microfone" (Android 11+). É ele
 * que mantém a voz viva, e a notificação fixa é a regra do Android para isso:
 * mostra a sala, abre o app ao tocar e tem o botão Sair.
 */
public class ServicoDaChamada extends Service {
    static final String CANAL = "chamada";
    static final int ID = 1;
    static final String ACAO_SAIR = "br.com.loftchat.SAIR_DA_CHAMADA";
    static final String EXTRA_SALA = "sala";

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACAO_SAIR.equals(intent.getAction())) {
            // O chat é quem sai da sala de verdade (avisa os outros e para o motor).
            PluginDaChamada.avisarSair();
            return START_NOT_STICKY;
        }
        String sala = intent == null ? null : intent.getStringExtra(EXTRA_SALA);
        criarCanal();
        int tipo = Build.VERSION.SDK_INT >= Build.VERSION_CODES.R
            ? ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
            : 0;
        try {
            ServiceCompat.startForeground(this, ID, notificacao(sala == null ? "Sala de voz" : sala), tipo);
        } catch (RuntimeException erro) {
            // 0.13.5: sem a permissão do microfone o Android recusa (SecurityException);
            // a chamada segue sem a notificação em vez de fechar o app.
            stopSelf();
        }
        return START_NOT_STICKY;
    }

    private Notification notificacao(String sala) {
        int imutavel = PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT;
        Intent abrir = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent aoTocar = PendingIntent.getActivity(this, 0, abrir, imutavel);
        Intent sair = new Intent(this, ServicoDaChamada.class).setAction(ACAO_SAIR);
        PendingIntent aoSair = PendingIntent.getService(this, 1, sair, imutavel);
        return new NotificationCompat.Builder(this, CANAL)
            .setSmallIcon(R.drawable.loftchat_notificacao)
            .setContentTitle("Em chamada")
            .setContentText(sala)
            .setOngoing(true)
            .setSilent(true)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setContentIntent(aoTocar)
            .addAction(0, "Sair", aoSair)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .build();
    }

    private void criarCanal() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager gerente = getSystemService(NotificationManager.class);
        if (gerente.getNotificationChannel(CANAL) != null) return;
        NotificationChannel canal = new NotificationChannel(CANAL, "Chamada de voz", NotificationManager.IMPORTANCE_LOW);
        canal.setDescription("Aparece enquanto você está numa sala de voz.");
        canal.setSound(null, null);
        gerente.createNotificationChannel(canal);
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
