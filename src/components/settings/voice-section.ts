import { el } from '../../lib/dom';
import {
  loadVoiceSettings,
  micConstraints,
  outputChoiceSupported,
  saveVoiceSettings,
} from '../../lib/voice-settings';
import type { VoiceSettings } from '../../lib/voice-settings';

/**
 * CONFIGURAÇÕES → VOZ E ÁUDIO (proposta A, etapa 8c).
 *
 * Muda NA HORA, sem barra de salvar: é coisa deste aparelho (ver
 * lib/voice-settings.ts) e, com a chamada aberta, o motor troca o microfone e
 * a saída sem sair da sala.
 *
 * O TESTE DO MICROFONE só mostra a barra de nível — não toca o que você fala
 * de volta (isso faria eco e barulho no PC).
 */
export interface VoiceSection {
  elementos: HTMLElement[];
  /** Para o teste do microfone e solta os ouvintes (trocar de seção, fechar). */
  parar: () => void;
}

export function renderVoiceSection(): VoiceSection {
  let atual: VoiceSettings = loadVoiceSettings();
  let parado = false;

  const guardar = (): void => {
    saveVoiceSettings(atual);
    // Teste ligado: reinicia com o microfone/filtros novos.
    if (teste !== null) void ligarTeste();
  };

  /* --- aparelhos ---------------------------------------------------------- */

  const microfone = el('select', { class: 'settings__input voz__select', 'aria-label': 'Microfone' });
  const saida = el('select', { class: 'settings__input voz__select', 'aria-label': 'Saída de som' });
  const avisoNomes = el('p', { class: 'settings__help' }, [
    'Os nomes dos aparelhos aparecem depois que o navegador deixa usar o microfone (é só testar uma vez).',
  ]);
  avisoNomes.hidden = true;

  microfone.addEventListener('change', () => {
    atual = { ...atual, micId: microfone.value };
    guardar();
  });
  saida.addEventListener('change', () => {
    atual = { ...atual, speakerId: saida.value };
    guardar();
  });

  function preencher(select: HTMLSelectElement, aparelhos: MediaDeviceInfo[], escolhido: string, nome: string): void {
    const opcoes = [el('option', { value: '' }, ['Padrão do sistema'])];
    aparelhos
      .filter((a) => a.deviceId !== '' && a.deviceId !== 'default' && a.deviceId !== 'communications')
      .forEach((a, i) => opcoes.push(el('option', { value: a.deviceId }, [a.label || `${nome} ${i + 1}`])));
    // O escolhido sumiu (fone desplugado): continua na lista, para não trocar sozinho.
    if (escolhido !== '' && !opcoes.some((o) => o.value === escolhido)) {
      opcoes.push(el('option', { value: escolhido }, [`${nome} desconectado`]));
    }
    select.replaceChildren(...opcoes);
    select.value = escolhido;
  }

  async function listarAparelhos(): Promise<void> {
    let aparelhos: MediaDeviceInfo[] = [];
    try {
      aparelhos = await navigator.mediaDevices.enumerateDevices();
    } catch {
      aparelhos = [];
    }
    if (parado) return;
    const entradas = aparelhos.filter((a) => a.kind === 'audioinput');
    preencher(microfone, entradas, atual.micId, 'Microfone');
    preencher(saida, aparelhos.filter((a) => a.kind === 'audiooutput'), atual.speakerId, 'Saída');
    avisoNomes.hidden = entradas.length === 0 || entradas.some((a) => a.label !== '');
  }

  const aoTrocarAparelhos = (): void => void listarAparelhos();
  navigator.mediaDevices?.addEventListener('devicechange', aoTrocarAparelhos);
  void listarAparelhos();

  /* --- teste do microfone ------------------------------------------------- */

  const preenchimento = el('span', { class: 'voz__nivel' });
  const medidor = el(
    'div',
    {
      class: 'voz__medidor',
      role: 'meter',
      'aria-label': 'Nível do microfone',
      'aria-valuemin': '0',
      'aria-valuemax': '100',
      'aria-valuenow': '0',
    },
    [preenchimento],
  );
  const botaoTeste = el('button', { class: 'settings__font voz__testar', type: 'button' }, ['Testar microfone']);
  const erroTeste = el('p', { class: 'settings__error', role: 'alert' });
  erroTeste.hidden = true;

  let teste: { stream: MediaStream; contexto: AudioContext; quadro: number } | null = null;

  function desligarTeste(): void {
    if (teste === null) return;
    cancelAnimationFrame(teste.quadro);
    teste.stream.getTracks().forEach((t) => t.stop());
    void teste.contexto.close().catch(() => {});
    teste = null;
    preenchimento.style.width = '0%';
    medidor.setAttribute('aria-valuenow', '0');
    botaoTeste.textContent = 'Testar microfone';
    botaoTeste.setAttribute('aria-pressed', 'false');
  }

  async function ligarTeste(): Promise<void> {
    desligarTeste();
    erroTeste.hidden = true;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: micConstraints(atual) });
    } catch {
      erroTeste.textContent = 'O navegador não deixou usar o microfone. Libere nas permissões do site e tente de novo.';
      erroTeste.hidden = false;
      return;
    }
    if (parado) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    // Agora com permissão: os nomes dos aparelhos aparecem.
    void listarAparelhos();

    const contexto = new AudioContext();
    // Criado DEPOIS de esperar a permissão: o clique já "venceu", e o navegador
    // pode deixar o contexto pausado — a barra ficaria parada em zero.
    void contexto.resume().catch(() => {});
    const analisador = contexto.createAnalyser();
    analisador.fftSize = 512;
    // Só a análise: nada vai para os alto-falantes.
    contexto.createMediaStreamSource(stream).connect(analisador);
    const amostras = new Float32Array(new ArrayBuffer(analisador.fftSize * 4));

    const medir = (): void => {
      if (teste === null) return;
      analisador.getFloatTimeDomainData(amostras);
      let soma = 0;
      for (const s of amostras) soma += s * s;
      const rms = Math.sqrt(soma / amostras.length);
      // Escala de fala: ~0,3 de RMS já é falar alto perto do microfone.
      const nivel = Math.min(100, Math.round((rms / 0.3) * 100));
      preenchimento.style.width = `${nivel}%`;
      medidor.setAttribute('aria-valuenow', String(nivel));
      teste.quadro = requestAnimationFrame(medir);
    };
    teste = { stream, contexto, quadro: requestAnimationFrame(medir) };
    botaoTeste.textContent = 'Parar teste';
    botaoTeste.setAttribute('aria-pressed', 'true');
  }

  botaoTeste.setAttribute('aria-pressed', 'false');
  botaoTeste.addEventListener('click', () => {
    if (teste === null) void ligarTeste();
    else desligarTeste();
  });

  /* --- filtros ------------------------------------------------------------ */

  function chave(rotulo: string, ajuda: string, valor: () => boolean, mudar: (v: boolean) => void): HTMLElement {
    const botao = el(
      'button',
      { class: 'settings__font aparencia-aba', type: 'button', role: 'switch', 'aria-checked': String(valor()) },
      [el('span', { class: 'aparencia-aba__caixa', 'aria-hidden': 'true' }, [valor() ? '✓' : '']), rotulo],
    );
    botao.addEventListener('click', () => {
      mudar(!valor());
      botao.setAttribute('aria-checked', String(valor()));
      botao.querySelector('.aparencia-aba__caixa')!.textContent = valor() ? '✓' : '';
      guardar();
    });
    return el('div', { class: 'voz__filtro' }, [botao, el('p', { class: 'settings__help' }, [ajuda])]);
  }

  const elementos = [
    el('h2', { class: 'settings__title' }, ['Voz e áudio']),
    el('p', { class: 'settings__help' }, [
      'Vale neste aparelho. Com a chamada aberta, muda na hora, sem sair da sala.',
    ]),
    el('div', { class: 'settings__field' }, [
      el('span', { class: 'settings__label' }, ['Microfone']),
      microfone,
      avisoNomes,
    ]),
    el('div', { class: 'settings__field' }, [
      el('span', { class: 'settings__label' }, ['Testar o microfone']),
      el('div', { class: 'voz__teste' }, [botaoTeste, medidor]),
      el('p', { class: 'settings__help' }, [
        'Fale normalmente: a barra mexe com a sua voz. Você não se ouve de volta, para não fazer eco.',
      ]),
      erroTeste,
    ]),
    el('div', { class: 'settings__field' }, [
      el('span', { class: 'settings__label' }, ['Saída de som']),
      ...(outputChoiceSupported()
        ? [saida, el('p', { class: 'settings__help' }, ['Onde você ouve a turma: fone, caixa de som…'])]
        : [el('p', { class: 'settings__help' }, ['Este navegador não deixa escolher: o som sai pela saída padrão do sistema.'])]),
    ]),
    el('div', { class: 'settings__field' }, [
      el('span', { class: 'settings__label' }, ['Filtros do microfone']),
      chave(
        'Redução de ruído',
        'Tira ventilador, teclado e barulho de fundo.',
        () => atual.noiseSuppression,
        (v) => (atual = { ...atual, noiseSuppression: v }),
      ),
      chave(
        'Cancelamento de eco',
        'Evita que a turma se ouça de volta quando você usa caixa de som em vez de fone.',
        () => atual.echoCancellation,
        (v) => (atual = { ...atual, echoCancellation: v }),
      ),
      chave(
        'Volume automático',
        'Equilibra o volume da sua voz quando você se afasta ou chega perto do microfone.',
        () => atual.autoGainControl,
        (v) => (atual = { ...atual, autoGainControl: v }),
      ),
    ]),
  ];

  return {
    elementos,
    parar: () => {
      parado = true;
      desligarTeste();
      navigator.mediaDevices?.removeEventListener('devicechange', aoTrocarAparelhos);
    },
  };
}
