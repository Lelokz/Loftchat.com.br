#!/usr/bin/env bash
# Monta o app Android do Loftchat (etapa 10): o chat (vite build) dentro do
# projeto Capacitor (android/) e o APK pelo Gradle.
#
#     scripts/android.sh                  # APK de teste (debug)
#     scripts/android.sh assembleRelease  # outra tarefa do Gradle
#
# As ferramentas (JDK, SDK do Android, Gradle e o cache dele) moram no HD,
# as mesmas dos apps da NOVA — nada disso no SSD.
set -euo pipefail
cd "$(dirname "$(readlink -f "$0")")/.."
F=/mnt/cab1286d-6765-4c73-9c77-8d3119b4b644/Arquivo/Android-Ferramentas
export JAVA_HOME="$F/jdk" ANDROID_HOME="$F/sdk" GRADLE_USER_HOME="$F/gradle-cache"
export TMPDIR=/mnt/cab1286d-6765-4c73-9c77-8d3119b4b644/Arquivo/Loft-desktop/tmp-testes
echo "sdk.dir=$ANDROID_HOME" > android/local.properties
npx tsc --noEmit
npx vite build --logLevel error
npx cap sync android
cd android
# --no-daemon: o Gradle não fica na memória depois (1,5 GB à toa).
exec nice -n 19 ./gradlew --no-daemon --console=plain "${@:-assembleDebug}"
