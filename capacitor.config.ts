import type { CapacitorConfig } from '@capacitor/cli';

/**
 * App Android do Loftchat (etapa 10, Capacitor): o MESMO chat do site e do
 * programa, dentro de um app de verdade. A pasta `dist/` (o `vite build`) vai
 * para dentro do APK — `npm run android` monta e sincroniza.
 */
const config: CapacitorConfig = {
  appId: 'br.com.loftchat',
  appName: 'Loftchat',
  webDir: 'dist',
  android: {
    // O fundo enquanto o chat carrega: a cor do tema Noite (tokens.css).
    backgroundColor: '#140f26',
  },
};

export default config;
