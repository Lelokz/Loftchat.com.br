import { el } from '../../lib/dom';
import { loftDesktop } from '../../lib/desktop';
import type { EscolhasDaJanela, InfoDaJanela } from '../../lib/janela';

/**
 * CONFIGURAÇÕES → JANELA E BANDEJA (0.7.0), só no programa do PC: barra de
 * cima, cantos, ícone da bandeja e o que fechar faz. Vale neste computador e
 * muda na hora — menos barra e cantos, que pedem reiniciar o Loftchat.
 */

type Opcao<K extends keyof EscolhasDaJanela> = { id: EscolhasDaJanela[K]; nome: string };

export function temSecaoJanela(): boolean {
  return loftDesktop()?.janelaEscolhas !== undefined;
}

export function renderJanelaSection(): HTMLElement[] {
  const desktop = loftDesktop();
  const corpo = el('div', { class: 'settings__janela' }, [el('p', { class: 'settings__help' }, ['Carregando…'])]);
  const aviso = el('div', { class: 'settings__reiniciar', role: 'status' });
  aviso.hidden = true;

  void desktop?.janelaEscolhas?.().then((info: InfoDaJanela) => {
    const atual = { ...info.escolhas };
    const linux = info.plataforma === 'linux';

    const precisaReiniciar = (): boolean =>
      atual.barra !== info.nasceu.barra ||
      (linux && atual.barra === 'loftchat' && (atual.cantos === 'redondos') !== info.nasceu.transparente);

    const desenharAviso = (): void => {
      aviso.hidden = !precisaReiniciar();
      if (aviso.hidden) return;
      const reiniciar = el('button', { class: 'settings__button', type: 'button' }, ['Reiniciar agora']);
      reiniciar.addEventListener('click', () => void desktop?.janelaReiniciar?.());
      aviso.replaceChildren(el('span', {}, ['Para mudar a barra e os cantos, o Loftchat precisa reiniciar.']), reiniciar);
    };

    const campo = <K extends keyof EscolhasDaJanela>(
      chave: K,
      rotulo: string,
      opcoes: Opcao<K>[],
      ajuda: string,
    ): HTMLElement => {
      const grupo = el('div', { class: 'settings__fonts', role: 'radiogroup', 'aria-label': rotulo });
      for (const opcao of opcoes) {
        const botao = el(
          'button',
          { class: 'settings__font', type: 'button', role: 'radio', 'aria-checked': String(atual[chave] === opcao.id) },
          [opcao.nome],
        );
        botao.addEventListener('click', () => {
          void desktop?.janelaEscolher?.(chave, opcao.id).then((salvo) => {
            if (salvo === null || salvo === undefined) return;
            atual[chave] = opcao.id;
            for (const b of grupo.querySelectorAll('[role="radio"]')) b.setAttribute('aria-checked', String(b === botao));
            desenharAviso();
          });
        });
        grupo.append(botao);
      }
      return el('div', { class: 'settings__field' }, [
        el('span', { class: 'settings__label' }, [rotulo]),
        grupo,
        el('p', { class: 'settings__help' }, [ajuda]),
      ]);
    };

    corpo.replaceChildren(
      campo(
        'barra',
        'Barra de cima',
        [
          { id: 'loftchat', nome: 'Do Loftchat (padrão)' },
          { id: 'sistema', nome: 'Do sistema' },
        ],
        `A do Loftchat tem as cores do seu tema e os botões de minimizar, maximizar e fechar. A do sistema é a do ${linux ? 'Linux' : 'Windows'}.`,
      ),
      ...(linux
        ? [
            campo(
              'cantos',
              'Cantos da janela',
              [
                { id: 'redondos', nome: 'Arredondados (padrão)' },
                { id: 'retos', nome: 'Retos' },
              ],
              'Só aparece com a janela solta; maximizada ela encosta nas bordas. Vale com a barra do Loftchat.',
            ),
          ]
        : []),
      campo(
        'bandeja',
        'Ícone na bandeja',
        [
          { id: 'pb', nome: 'Preto e branco (padrão)' },
          { id: 'cor', nome: 'Colorido' },
          { id: 'esconder', nome: 'Esconder' },
        ],
        'Fica no canto da barra de tarefas. Mensagem nova acende uma bolinha vermelha nele.',
      ),
      campo(
        'aoFechar',
        'Ao fechar a janela',
        [
          { id: 'bandeja', nome: 'Continua na bandeja (padrão)' },
          { id: 'sair', nome: 'Fecha de vez' },
        ],
        'Na bandeja você continua recebendo as mensagens e as notificações. Sem o ícone na bandeja, fechar fecha de vez.',
      ),
    );
    desenharAviso();
  });

  return [
    el('h2', { class: 'settings__title' }, ['Janela e bandeja']),
    el('p', { class: 'settings__subtitle' }, ['Como o Loftchat aparece neste computador.']),
    aviso,
    corpo,
  ];
}
