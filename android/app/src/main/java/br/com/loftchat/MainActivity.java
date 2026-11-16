package br.com.loftchat;

import android.os.Bundle;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // O "Em chamada" (etapa 10b), antes do super: o Capacitor carrega os
        // plugins ao montar a ponte.
        registerPlugin(PluginDaChamada.class);
        super.onCreate(savedInstanceState);
        // O Loftchat é escuro: hora, bateria e os botões do sistema em CLARO.
        // (No Android 15+ as barras ficam transparentes e o tema não decide isso.)
        WindowInsetsControllerCompat barras =
            WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        barras.setAppearanceLightStatusBars(false);
        barras.setAppearanceLightNavigationBars(false);
    }
}
