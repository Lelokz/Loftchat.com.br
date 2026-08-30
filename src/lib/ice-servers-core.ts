/**
 * Construção pura da lista de servidores ICE, e o glossário de erros — sem
 * NENHUMA leitura de ambiente aqui.
 *
 * ARQUIVO SEPARADO DE `ice-servers.ts` DE PROPÓSITO: `tests/turn.spec.ts`
 * importa `buildIceServers` pelo Node, fora do bundle do Vite, para montar a
 * lista ANTES de entrar no navegador via `page.evaluate`. `ice-servers.ts` lê
 * `import.meta.env` no escopo do módulo, e isso quebra ao ser importado pelo
 * Node — mesmo sem usar o valor, porque um módulo ES roda o corpo inteiro na
 * primeira importação, não só o que foi pedido. Separar em dois arquivos é o
 * que deixa este aqui seguro de importar de qualquer lugar, e o outro só de
 * dentro do bundle do Vite.
 *
 * A ORDEM É PREFERÊNCIA DE CUSTO. O navegador tenta o mais barato primeiro —
 * conexão direta na rede local, depois a descoberta por STUN — e só cai no
 * relay quando nada mais fecha. É por isso que `iceTransportPolicy: 'relay'`
 * NÃO aparece no produto em lugar nenhum: forçar relay gastaria o plano em
 * chamadas que fechariam sozinhas. (O teste força, e só ele — ver
 * tests/turn.spec.ts.)
 *
 * LIMITAÇÃO CONHECIDA — só a porta 3478. O plano gratuito do ExpressTURN não
 * oferece TLS na 443, e é justamente a 443 que atravessa firewall corporativo
 * muito restritivo, porque parece tráfego HTTPS comum. Rede que bloqueie a 3478
 * nas duas variantes continua sem conectar, e não há o que fazer daqui.
 * Acrescentar uma URL de 443 que ninguém atende seria pior do que não ter: só
 * somaria espera na coleta de candidatos e daria falsa sensação de cobertura.
 */

/**
 * Sem usuário E credencial, a entrada do TURN some da lista — não é
 * `undefined` jogado num `username`/`credential` que o navegador recusaria; é
 * a diferença entre "esta sala não tem TURN" (funciona, com uma limitação
 * conhecida) e "esta sala tenta um servidor que não existe" (quebra a
 * negociação inteira).
 */
export function buildIceServers(
  turnUsername: string | undefined,
  turnCredential: string | undefined,
): RTCIceServer[] {
  return [
    { urls: 'stun:stun.l.google.com:19302' },
    ...(turnUsername && turnCredential
      ? [
          {
            urls: ['turn:free.expressturn.com:3478', 'turn:free.expressturn.com:3478?transport=tcp'],
            username: turnUsername,
            credential: turnCredential,
          },
        ]
      : []),
  ];
}

/**
 * O que cada código de `icecandidateerror` quer dizer, em português.
 *
 * Sem isto, o TURN quebrado é indistinguível de rede ruim: os dois terminam em
 * "não conectou". Estes números são a diferença entre "está quebrado do nosso
 * lado" e "a rede dessa pessoa não deixa".
 */
export function iceErrorMeaning(errorCode: number): string {
  if (errorCode === 401 || errorCode === 403) {
    return 'credencial do TURN recusada (401/403) — provavelmente expirou e precisa ser regerada';
  }
  if (errorCode === 300) return 'o TURN pediu redirecionamento (300)';
  if (errorCode === 486) return 'o TURN está sem alocação livre (486) — cota ou limite do plano';
  if (errorCode === 508) return 'o TURN recusou a alocação (508)';
  // 701 é o "não deu para chegar no servidor" do Chrome; os 7xx em geral são rede.
  if (errorCode >= 700) return `servidor ICE inalcançável (${errorCode})`;
  return `erro ICE ${errorCode}`;
}
