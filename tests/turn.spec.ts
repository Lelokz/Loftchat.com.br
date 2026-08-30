import { expect, test } from '@playwright/test';

import { buildIceServers } from '../src/lib/ice-servers-core';

/*
 * De `ice-servers-core`, NÃO de `ice-servers` — este arquivo roda no Node,
 * fora do bundle do Vite, e `ice-servers.ts` lê `import.meta.env` no escopo
 * do módulo (só existe dentro do bundle). `ice-servers-core.ts` é a mesma
 * lógica sem leitura de ambiente nenhuma; as credenciais aqui vêm de
 * `process.env`, que `playwright.config.ts` carrega do `.env` da raiz antes
 * de qualquer spec ser importado (ver o topo daquele arquivo).
 */
const ICE_SERVERS = buildIceServers(
  process.env['VITE_TURN_USERNAME'],
  process.env['VITE_TURN_CREDENTIAL'],
);

/**
 * O TURN atende? — o único teste da suíte que depende de SERVIÇO EXTERNO.
 *
 * ====================================================================
 * SE ESTE ARQUIVO FALHAR E O RESTO DA SUÍTE PASSAR, O PROBLEMA É O
 * EXPRESSTURN, NÃO O CÓDIGO. Rode sem ele com:
 *
 *     npx playwright test --grep-invert @externo
 *
 * ====================================================================
 *
 * POR QUE ELE PRECISA EXISTIR: duas abas na mesma máquina fecham por candidato
 * `host` e nunca encostam no TURN. Toda a suíte de voz passa com a credencial
 * errada, expirada ou em branco — ela não prova nada sobre relay. Este teste
 * força o caminho para descobrir que a credencial quebrou ANTES de alguém
 * precisar dela de verdade, numa rede onde não há alternativa.
 *
 * `iceTransportPolicy: 'relay'` aparece AQUI E SÓ AQUI. No produto ele nunca
 * entra: forçar relay gastaria o plano gratuito em chamadas que fechariam
 * sozinhas de graça.
 *
 * E ele é forçado só de UM LADO. Forçar os dois testava relay↔relay — dois
 * clientes do mesmo servidor conversando por dentro dele —, que não é o que
 * acontece na prática: o caso real é uma pessoa presa atrás de NAT simétrico
 * falando com outra que conecta direto. Medido aqui: com os dois forçados, os
 * dois lados ALOCAM `relay/udp` normalmente (prova de que a credencial vale) e
 * mesmo assim a checagem de conectividade entre eles nunca passa neste plano
 * gratuito. Com um lado só, fecha em segundos.
 */

/** Quanto esperar o relay fechar. Servidor gratuito e compartilhado é lento. */
const CONNECT_TIMEOUT_MS = 60_000;

test('@externo o TURN atende e a conexão fecha por relay', async ({ page }) => {
  test.setTimeout(90_000);

  // Uma página qualquer do app: o teste roda dentro do navegador, e só precisa
  // de um documento com origem válida para poder criar RTCPeerConnection.
  await page.goto('/');

  const resultado = await page.evaluate(
    async ([iceServers, timeout]) => {
      const erros: string[] = [];

      /*
       * Dois lados conversando dentro da própria página.
       *
       * Sem Firestore, sem conta e sem UI: o que está sendo testado é a
       * credencial e o servidor, e enfiar a sinalização real no meio só
       * acrescentaria formas de o teste falhar por outro motivo.
       */
      const a = new RTCPeerConnection({
        iceServers: iceServers as RTCIceServer[],
        iceTransportPolicy: 'relay',
      });
      /*
       * SÓ O LADO A É FORÇADO A RELAY. O B fica livre.
       *
       * É o cenário REAL: uma pessoa atrás de NAT simétrico que só consegue
       * relay, falando com outra que conecta direto. Forçar os dois testava
       * relay↔relay — dois clientes do mesmo servidor conversando por dentro
       * dele —, que não é o que acontece na prática e que este plano gratuito
       * não fecha (medido: os dois lados alocam `relay/udp` e a checagem de
       * conectividade entre eles nunca passa).
       */
      const b = new RTCPeerConnection({ iceServers: iceServers as RTCIceServer[] });

      const anotar = (lado: string) => (event: Event) => {
        const error = event as RTCPeerConnectionIceErrorEvent;
        const linha = `${lado}: código ${error.errorCode} em ${error.url}`;
        if (!erros.includes(linha)) erros.push(linha);
      };
      a.addEventListener('icecandidateerror', anotar('A'));
      b.addEventListener('icecandidateerror', anotar('B'));

      /*
       * CANDIDATO SÓ DEPOIS DA DESCRIÇÃO REMOTA.
       *
       * A coleta começa no `setLocalDescription`, antes de o outro lado ter
       * descrição nenhuma — e `addIceCandidate` antes disso é recusado. Sem
       * esta fila, os primeiros candidatos (justamente os de relay, que
       * demoram) eram jogados fora e a conexão nunca fechava. É o mesmo cuidado
       * que o motor de voz tem em `peer.pending`.
       */
      const filas = new Map<RTCPeerConnection, RTCIceCandidate[]>([
        [a, []],
        [b, []],
      ]);
      const prontos = new Set<RTCPeerConnection>();

      const entregar = (destino: RTCPeerConnection, candidate: RTCIceCandidate): void => {
        if (prontos.has(destino)) void destino.addIceCandidate(candidate);
        else filas.get(destino)!.push(candidate);
      };
      const liberar = (destino: RTCPeerConnection): void => {
        prontos.add(destino);
        for (const candidate of filas.get(destino)!.splice(0)) {
          void destino.addIceCandidate(candidate);
        }
      };

      const coletados: string[] = [];
      a.addEventListener('icecandidate', (event) => {
        if (event.candidate) {
          coletados.push(`${event.candidate.type}/${event.candidate.protocol}`);
          entregar(b, event.candidate);
        }
      });
      const coletadosB: string[] = [];
      b.addEventListener('icecandidate', (event) => {
        if (event.candidate) {
          coletadosB.push(`${event.candidate.type}/${event.candidate.protocol}`);
          entregar(a, event.candidate);
        }
      });

      // Um data channel é o suficiente para o ICE rodar de verdade, e não
      // depende de microfone nem de permissão nenhuma.
      a.createDataChannel('sonda');

      const conectado = new Promise<boolean>((resolve) => {
        const ver = () => {
          if (a.connectionState === 'connected') resolve(true);
          if (a.connectionState === 'failed') resolve(false);
        };
        a.addEventListener('connectionstatechange', ver);
        setTimeout(() => resolve(false), timeout as number);
      });

      await a.setLocalDescription();
      await b.setRemoteDescription(a.localDescription!);
      liberar(b);
      await b.setLocalDescription();
      await a.setRemoteDescription(b.localDescription!);
      liberar(a);

      const ok = await conectado;
      // O estado É LIDO ANTES DE FECHAR: depois do `close()` ele é sempre
      // 'closed', e a mensagem de falha diria isso em vez do motivo real.
      const estado = a.connectionState;

      /* O tipo do candidato que venceu — tem que ser `relay`. */
      let tipo: string | null = null;
      const stats = await a.getStats();
      let pairId: string | null = null;
      stats.forEach((report) => {
        if (report.type === 'candidate-pair' && report['state'] === 'succeeded') {
          pairId = report['localCandidateId'] as string;
        }
      });
      if (pairId !== null) {
        stats.forEach((report) => {
          if (report.id === pairId) tipo = (report['candidateType'] as string) ?? null;
        });
      }

      a.close();
      b.close();
      return {
        ok,
        tipo,
        erros,
        estado,
        ice: `${a.iceConnectionState}/${b.iceConnectionState}`,
        coletados: [...new Set(coletados)],
        coletadosB: [...new Set(coletadosB)],
      };
    },
    [ICE_SERVERS, CONNECT_TIMEOUT_MS] as const,
  );

  /*
   * A FALHA TEM QUE DIZER O MOTIVO.
   *
   * Um teste que só estoura o tempo manda procurar no lugar errado. Os códigos
   * de `icecandidateerror` separam as duas causas que importam: 401/403 é
   * credencial recusada — regerar no painel do ExpressTURN e trocar em
   * src/lib/ice-servers.ts; 7xx é servidor fora do ar ou inalcançável, e aí não
   * há nada a consertar no código.
   */
  const coletados =
    resultado.coletados.length > 0
      ? `\nCandidatos A: ${resultado.coletados.join(', ')}` +
        `\nCandidatos B: ${resultado.coletadosB.join(', ') || 'NENHUM'}` +
        `\nEstado ICE (A/B): ${resultado.ice}`
      : '\nNENHUM candidato local foi coletado — a alocação no TURN não saiu.';

  const detalhe =
    coletados +
    (resultado.erros.length > 0
      ? `\nErros de ICE observados:\n  ${resultado.erros.join('\n  ')}`
      : '\nNenhum erro de ICE reportado — o servidor não respondeu a tempo.');

  const credencialRecusada = resultado.erros.some(
    (linha) => linha.includes('código 401') || linha.includes('código 403'),
  );

  expect(
    credencialRecusada,
    'O TURN RECUSOU A CREDENCIAL (401/403). Ela provavelmente expirou: ' +
      'gere outra no painel do ExpressTURN e troque em src/lib/ice-servers.ts.' +
      detalhe,
  ).toBe(false);

  expect(
    resultado.ok,
    `A conexão forçada a relay não fechou (estado: ${resultado.estado}). ` +
      'Isto é o SERVIÇO EXTERNO, não o código do Loft — se o resto da suíte ' +
      'passou, o ExpressTURN está fora do ar ou sem cota.' +
      detalhe,
  ).toBe(true);

  expect(
    resultado.tipo,
    'A conexão fechou, mas não por relay — com `iceTransportPolicy: "relay"` ' +
      'isso não deveria ser possível.' +
      detalhe,
  ).toBe('relay');
});
