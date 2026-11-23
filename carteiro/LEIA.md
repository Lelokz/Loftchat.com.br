# Carteiro das notificações

Roda na Cloudflare (conta bevonesileonardo, plano grátis):
https://loftchat-carteiro.bevonesileonardo.workers.dev

- `node_modules` é atalho para o HD (`Arquivo/Loft-desktop/carteiro/node_modules`).
- O login do Wrangler também fica no HD. Para publicar:

```sh
H=/mnt/cab1286d-6765-4c73-9c77-8d3119b4b644/Arquivo/Loft-desktop/carteiro
XDG_CONFIG_HOME=$H/config WRANGLER_SEND_METRICS=false npx wrangler deploy
```

Segredos (já guardados na Cloudflare, nunca no git): `CHAVE_GOOGLE` (chave da
conta de serviço do Firebase) e `SEGREDO_FOTO` (assina o endereço das fotos).
Teste: `node scripts/emulator.mjs playwright test tests/carteiro.spec.ts`.
