import './voice-diagnostics.css';

import { el } from '../../lib/dom';
import { formatBytes } from '../../lib/format';
import { TURN_CONFIGURED } from '../../lib/ice-servers';
import { openModal } from '../modal/modal';
import type { PeerDiagnostic } from '../../lib/voice-engine';

/**
 * Painel de diagnóstico das conexões da sala.
 *
 * Nasceu porque não havia TURN e a conexão direta simplesmente não fechava em
 * algumas redes. Com TURN (etapa 11) ele mudou de função e ficou MAIS
 * necessário: relay é invisível — a chamada funciona igual — e é o único
 * caminho que consome um plano de terceiro. É aqui que dá para ver se está
 * sendo usado. E a diferença entre "não conectou" e "conectou por srflx e o
 * áudio está mudo por outro motivo" continua invisível sem isto.
 *
 * Também é o que torna a conexão TESTÁVEL: o teste abre o painel e confere que
 * o estado chegou a `connected`, em vez de espiar objetos internos.
 *
 * Escondido de propósito: Ctrl+Alt+V, ou o menu de contexto dentro da sala.
 */

const REFRESH_MS = 1000;

/** O que cada estado quer dizer, para quem não vive de WebRTC. */
const CANDIDATE_MEANING: Record<string, string> = {
  host: 'rede local',
  srflx: 'via STUN',
  prflx: 'descoberto na negociação',
  relay: 'via TURN',
};

/** Por que o vídeo caiu de qualidade — a pergunta que o painel existe para responder. */
const LIMITATION_MEANING: Record<string, string> = {
  cpu: 'CPU (o computador não dá conta de codificar)',
  bandwidth: 'banda (o upload não dá conta)',
  other: 'outro motivo',
};

/**
 * O painel aberto agora, ou null.
 *
 * Sem isto, apertar o atalho duas vezes EMPILHA painéis: dois modais, dois
 * cronômetros lendo `getStats()`, e nada avisando. Foi o que apareceu medindo a
 * etapa 9 — o próprio instrumento de diagnóstico atrapalhando a medição.
 */
let openPanel: { close(): void } | null = null;

export function openVoiceDiagnostics(
  read: () => Promise<PeerDiagnostic[]>,
  nameOf: (uid: string) => string,
): void {
  /*
   * Segundo atalho FECHA em vez de abrir outro.
   *
   * Quem decide se já está aberto é o DOM, não o sinalizador. O sinalizador
   * sozinho pode ficar preso — ele é limpo por um ouvinte de `close` pendurado
   * num `querySelector`, e se aquele nó não for o certo o atalho trava para
   * sempre num painel que não existe mais. Com o DOM na frente, sinalizador
   * obsoleto se conserta sozinho no próximo uso.
   */
  // `dialog[open]` e não a presença do `.diag`: o nó do painel continua no
  // documento depois de fechado, e olhar só para ele fazia o atalho entender
  // "já está aberto" e fechar um painel invisível — o atalho parava de abrir.
  const onScreen = document.querySelector('dialog.modal[open]') !== null;
  if (onScreen && openPanel !== null) {
    openPanel.close();
    openPanel = null;
    return;
  }
  openPanel = null;

  const body = el('div', { class: 'diag' }, [
    el('p', { class: 'diag__empty' }, ['Lendo o estado das conexões…']),
  ]);

  const controller = openModal({
    title: 'Diagnóstico da conexão',
    description:
      'Uma linha por pessoa. "via TURN" significa que aquela conexão está ' +
      'passando por relay e consumindo o plano gratuito.',
    body,
    confirmLabel: 'Fechar',
  });

  /*
   * TURN não configurado é aviso de CONFIGURAÇÃO, não de conexão — por isso
   * aparece mesmo sozinho na sala (`peers.length === 0`), antes de haver
   * qualquer par para diagnosticar. É a mesma moldura do aviso de relay: as
   * duas classes existem para chamar atenção do jeito que este painel já usa.
   */
  const turnBanner = TURN_CONFIGURED
    ? []
    : [
        el('div', { class: 'diag__relay' }, [
          el('p', { class: 'diag__relay-title' }, ['TURN não configurado']),
          el('p', { class: 'diag__relay-note' }, [
            'Rodando só com STUN. Quem estiver atrás de NAT restritivo ou ' +
              'firewall corporativo pode não conseguir entrar na sala — ' +
              'defina VITE_TURN_USERNAME e VITE_TURN_CREDENTIAL (ver .env.example).',
          ]),
        ]),
      ];

  const render = (peers: PeerDiagnostic[]): void => {
    if (peers.length === 0) {
      body.replaceChildren(
        ...turnBanner,
        el('p', { class: 'diag__empty' }, ['Nenhuma conexão: você está sozinho na sala.']),
      );
      return;
    }

    /*
     * A SOMA do vídeo saindo para todos os pares.
     *
     * Numa malha, cada par recebe a própria cópia — o gargalo é este total, não
     * o de nenhuma conexão isolada. É este número que diz se o problema é o seu
     * upload.
     */
    const totalUp = peers.reduce((sum, peer) => sum + (peer.outboundVideo?.kbps ?? 0), 0);

    const summary =
      totalUp > 0
        ? [
            el('div', { class: 'diag__total' }, [
              el('span', { class: 'diag__label' }, ['vídeo saindo, somando todos os pares']),
              el('span', { class: 'diag__value diag__value--strong' }, [`${totalUp} kbps`]),
            ]),
          ]
        : [];

    /*
     * O AVISO DE RELAY, no topo e sem sutileza.
     *
     * Relay é o único caminho que consome um plano de terceiro, e é invisível
     * por natureza: a chamada funciona igual. Sem este aviso, a pessoa só
     * descobriria que gastou o plano quando ele acabasse.
     */
    const relayPeers = peers.filter((peer) => peer.viaRelay);
    const relayBanner =
      relayPeers.length === 0
        ? []
        : [
            el('div', { class: 'diag__relay' }, [
              el('p', { class: 'diag__relay-title' }, [
                relayPeers.length === 1
                  ? 'Uma conexão está passando por TURN'
                  : `${relayPeers.length} conexões estão passando por TURN`,
              ]),
              el('p', { class: 'diag__relay-note' }, [
                'O tráfego atravessa um servidor de terceiro e consome o plano gratuito. ' +
                  `Nestes pares o vídeo fica limitado a ${formatBitrate(relayPeers[0]!.bitrateCap)}.`,
              ]),
              el('p', { class: 'diag__relay-note' }, [
                `Tráfego relayado nesta sessão: ${formatBytes(
                  relayPeers.reduce((sum, peer) => sum + peer.relayBytes, 0),
                )} — aproximado.`,
              ]),
            ]),
          ];

    body.replaceChildren(
      ...turnBanner,
      ...relayBanner,
      ...summary,
      ...peers.map((peer) =>
        el('div', { class: `diag__peer${peer.failed ? ' is-failed' : ''}` }, [
          el('p', { class: 'diag__name' }, [nameOf(peer.uid)]),
          row('conexão', peer.connectionState),
          row('ICE', peer.iceConnectionState),
          // Relay em DESTAQUE: é o único tipo de candidato que custa dinheiro.
          row(
            'candidato',
            peer.candidateType === null
              ? '—'
              : `${peer.candidateType} (${CANDIDATE_MEANING[peer.candidateType] ?? 'desconhecido'})`,
            peer.viaRelay,
          ),
          ...(peer.viaRelay
            ? [row('relayado (aprox.)', formatBytes(peer.relayBytes))]
            : []),
          row('teto de vídeo', formatBitrate(peer.bitrateCap)),
          ...peer.iceErrors.map((message) => row('erro de ICE', message, true)),
          ...videoRows('vídeo saindo', peer.outboundVideo),
          ...videoRows('vídeo chegando', peer.inboundVideo),
          ...directionRow(peer.videoDirection),
          ...ignoredRows(peer.ignored),
          row('transceivers', peer.transceiverMap),
        ]),
      ),
    );
  };

  /**
   * A direção EFETIVA do transceiver de vídeo.
   *
   * `currentDirection` é a que foi negociada de verdade; `direction` é só o que
   * foi pedido. Quando as duas divergem, a tela não sai por este par por mais
   * que o `replaceTrack` tenha dado certo — e nada mais na interface contaria
   * isso. Aparece sempre, inclusive sem vídeo nenhum: é para diagnóstico.
   */
  const directionRow = (
    direction: PeerDiagnostic['videoDirection'],
  ): HTMLElement[] => {
    const current = direction.current ?? 'ainda não negociada';
    const diverged = direction.current !== null && direction.current !== direction.desired;
    return [
      row(
        'direção do vídeo',
        diverged ? `${current} (pedida: ${direction.desired})` : current,
        diverged,
      ),
    ];
  };

  /**
   * Sinal jogado fora, com contagem.
   *
   * Existe porque descartar em silêncio custou uma etapa inteira de depuração
   * com três contas. `obsoleto` acima de zero é DEFEITO: uma negociação de
   * verdade foi perdida. `colisão` é o perfect negotiation funcionando, e fica
   * separado para não ser confundido com o outro.
   */
  const ignoredRows = (ignored: PeerDiagnostic['ignored']): HTMLElement[] => {
    const rows = [
      // SEMPRE visível, inclusive em zero: o valor de um contador de defeito é
      // poder ver que ele está em zero. Escondido, "sem linha" e "não medi" são
      // a mesma coisa na tela.
      row('sinal descartado (obsoleto)', String(ignored.stale), ignored.stale > 0),
    ];
    if (ignored.glare > 0) {
      rows.push(row('oferta ignorada (colisão)', String(ignored.glare)));
    }
    return rows;
  };

  /** Linhas de vídeo, só quando há vídeo naquela direção. */
  const videoRows = (
    label: string,
    stats: PeerDiagnostic['outboundVideo'],
  ): HTMLElement[] => {
    if (stats === null || (stats.width === 0 && stats.kbps === 0)) return [];

    const rows = [
      row(label, `${stats.width}×${stats.height} a ${stats.fps} fps · ${stats.kbps} kbps`),
    ];
    if (stats.framesDropped > 0) {
      rows.push(row('quadros descartados', String(stats.framesDropped)));
    }
    // `cpu` ou `bandwidth`: é o campo que responde "travou por quê".
    if (stats.limitation !== null && stats.limitation !== 'none') {
      rows.push(row('limitado por', LIMITATION_MEANING[stats.limitation] ?? stats.limitation));
    }
    return rows;
  };

  const refresh = (): void => {
    void read()
      .then(render)
      .catch(() => {
        /* a sala pode ter fechado no meio; o intervalo morre junto */
      });
  };

  refresh();
  const timer = window.setInterval(refresh, REFRESH_MS);

  openPanel = controller;

  // O modal se remove sozinho ao fechar; o intervalo precisa ir junto, senão
  // fica lendo estatística de uma chamada que já acabou. E a trava de painel
  // único só vale se for liberada no MESMO evento — fechar pelo botão, pelo
  // Escape ou pelo atalho passam todos por aqui.
  document.querySelector('dialog.modal')?.addEventListener('close', () => {
    window.clearInterval(timer);
    openPanel = null;
  });
}

/** Teto de banda em Mbps, que é a unidade em que se pensa upload. */
function formatBitrate(bitsPerSecond: number): string {
  return `${(bitsPerSecond / 1_000_000).toFixed(1).replace('.', ',')} Mbps`;
}

/** `alert` marca a linha que indica defeito, não só informação. */
function row(label: string, value: string, alert = false): HTMLElement {
  return el('p', { class: 'diag__row' }, [
    el('span', { class: 'diag__label' }, [label]),
    el('span', { class: `diag__value${alert ? ' diag__value--alert' : ''}` }, [value]),
  ]);
}
