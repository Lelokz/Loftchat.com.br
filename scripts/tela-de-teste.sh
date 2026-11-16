#!/bin/sh
# Roda um comando numa TELA INVISÍVEL (Xvfb) com gerenciador de janelas.
#
#     scripts/tela-de-teste.sh node scripts/emulator.mjs playwright test tests/desktop.spec.ts
#
# Sem gerenciador de janelas o Electron não lista tela nem janela nenhuma para
# compartilhar (o seletor da janela do Loft vem vazio). O metacity resolve.
# A tela some, o SOM NÃO: os testes da janela já abrem tudo mudo.
exec xvfb-run -a -s "-screen 0 1920x1080x24" sh -c 'metacity --replace >/dev/null 2>&1 & sleep 1; exec "$@"' sh "$@"
