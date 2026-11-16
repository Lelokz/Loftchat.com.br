#!/usr/bin/env bash
# Monta os instaladores do Loftchat (etapa 9c): Linux (AppImage) e Windows
# (instalador NSIS), na pasta do HD — nada disso fica no SSD.
#
#     scripts/instaladores.sh            # os dois
#     scripts/instaladores.sh --linux    # só um
#
# Não publica nada: publicar nas Releases é a etapa 9d, e só quando o Leo mandar.
set -euo pipefail
cd "$(dirname "$(readlink -f "$0")")/.."
H=/mnt/cab1286d-6765-4c73-9c77-8d3119b4b644/Arquivo/Loft-desktop
export ELECTRON_CACHE="$H/cache-electron" ELECTRON_BUILDER_CACHE="$H/cache-builder" TMPDIR="$H/tmp-testes"
unset ELECTRON_RUN_AS_NODE
npm run build:desktop
cd desktop
alvos=("$@"); [ ${#alvos[@]} -eq 0 ] && alvos=(--linux --win)
nice -n 19 npx electron-builder "${alvos[@]}" --x64 --publish never \
  --config.directories.output="$H/dist"
