/**
 * Credenciais do TURN, lidas do ambiente — a construção da lista e o
 * glossário de erros moram em `ice-servers-core.ts`, que não lê ambiente
 * nenhum (ver o comentário lá para o porquê da separação: é o que permite
 * `tests/turn.spec.ts` importar a montagem da lista pelo Node).
 *
 * ELAS VÊM DE VARIÁVEL DE AMBIENTE (`VITE_TURN_USERNAME`/`VITE_TURN_CREDENTIAL`,
 * ver `.env.example`), NUNCA DO CÓDIGO. Não são segredo como uma senha — o
 * navegador precisa delas em claro para falar com o servidor, então quem abre
 * o painel de rede do navegador já vê as duas —, mas commitadas elas ficariam
 * no HISTÓRICO do git para sempre, sobrevivendo até a uma regeneração. Fora
 * do código, regenerar de verdade apaga a antiga. Regenerável no painel em
 * https://www.expressturn.com — troca é só o `.env`, o código não muda.
 */

import { buildIceServers, iceErrorMeaning } from './ice-servers-core';

export { buildIceServers, iceErrorMeaning };

const TURN_USERNAME = import.meta.env['VITE_TURN_USERNAME'] as string | undefined;
const TURN_CREDENTIAL = import.meta.env['VITE_TURN_CREDENTIAL'] as string | undefined;

/**
 * As duas variáveis vieram preenchidas? O painel de diagnóstico
 * (voice-diagnostics.ts) também lê isto, para avisar QUEM ESTÁ NA SALA, não
 * só o console — sem TURN configurado, gente atrás de NAT restritivo ou
 * firewall corporativo pode simplesmente não conseguir entrar, e sem aviso
 * isso passa por "defeito aleatório" em vez de "falta configurar".
 */
export const TURN_CONFIGURED = Boolean(TURN_USERNAME) && Boolean(TURN_CREDENTIAL);

if (!TURN_CONFIGURED) {
  console.warn(
    'TURN não configurado (faltam VITE_TURN_USERNAME/VITE_TURN_CREDENTIAL no ' +
      '.env) — a chamada roda só com STUN. Ver .env.example.',
  );
}

export const ICE_SERVERS: RTCIceServer[] = buildIceServers(TURN_USERNAME, TURN_CREDENTIAL);
