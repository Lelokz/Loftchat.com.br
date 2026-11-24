import { el } from '../../lib/dom';
import { avisosLigados, mudarAvisos, recebeAvisos } from '../../lib/avisos';
import { loftDesktop } from '../../lib/desktop';

/**
 * CONFIGURAÇÕES → NOTIFICAÇÕES (0.4.0): liga e desliga os avisos de mensagem
 * neste aparelho. Muda na hora, sem botão de salvar.
 */
export function renderNotificacoesSection(): HTMLElement[] {
  const pode = recebeAvisos();
  const ligado = (): boolean => pode && avisosLigados();

  const caixa = el('span', { class: 'aparencia-aba__caixa', 'aria-hidden': 'true' }, [ligado() ? '✓' : '']);
  const botao = el(
    'button',
    { class: 'settings__font aparencia-aba', type: 'button', role: 'switch', 'aria-checked': String(ligado()) },
    [caixa, 'Avisar quando chegar mensagem'],
  );
  botao.disabled = !pode;
  botao.addEventListener('click', () => {
    mudarAvisos(!avisosLigados());
    botao.setAttribute('aria-checked', String(ligado()));
    caixa.textContent = ligado() ? '✓' : '';
  });

  const ajuda = pode
    ? 'Nos grupos e no privado, mesmo com o Loftchat fechado. A conversa que você está olhando não avisa.'
    : 'Aqui no navegador não tem aviso. Use o programa no PC ou o app no celular.';

  return [
    el('h2', { class: 'settings__title' }, ['Notificações']),
    el('p', { class: 'settings__help' }, ['Vale neste aparelho.']),
    el('div', { class: 'settings__field' }, [
      el('span', { class: 'settings__label' }, ['Mensagens novas']),
      el('div', { class: 'voz__filtro' }, [botao, el('p', { class: 'settings__help' }, [ajuda])]),
    ]),
    ...(loftDesktop() === null
      ? []
      : [
          el('p', { class: 'settings__help' }, [
            'Fechar a janela deixa o Loftchat no canto da barra de tarefas, para continuar avisando ',
            '(dá para mudar em Janela e bandeja). Para fechar de vez, clique no ícone dele ali e em Sair.',
          ]),
        ]),
  ];
}
