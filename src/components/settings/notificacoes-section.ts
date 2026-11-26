import { el } from '../../lib/dom';
import { avisosLigados, mudarAvisos, recebeAvisos } from '../../lib/avisos';
import { loftDesktop } from '../../lib/desktop';
import { cantoDoAviso, mostrarAvisoDeInsignia, mudarCantoDoAviso } from '../insignias/insignias-ui';
import type { CantoDoAviso } from '../insignias/insignias-ui';
import { POR_ID } from '../../lib/insignias';

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

  // 0.12.0: onde aparece o aviso de insígnia nova (no celular é sempre embaixo, acima da caixa de mensagem).
  const CANTOS: Array<[CantoDoAviso, string]> = [
    ['inf-dir', 'Inferior direito'],
    ['inf-esq', 'Inferior esquerdo'],
    ['sup-dir', 'Superior direito'],
    ['sup-esq', 'Superior esquerdo'],
  ];
  const cantos = CANTOS.map(([canto, rotulo]) => {
    const b = el('button', { class: 'settings__font aparencia-aba', type: 'button', role: 'radio', 'aria-checked': String(cantoDoAviso() === canto) }, [
      el('span', { class: 'aparencia-aba__caixa', 'aria-hidden': 'true' }, [cantoDoAviso() === canto ? '✓' : '']),
      rotulo,
    ]);
    b.addEventListener('click', () => {
      mudarCantoDoAviso(canto);
      for (const x of cantos) {
        const on = x === b;
        x.setAttribute('aria-checked', String(on));
        x.querySelector('.aparencia-aba__caixa')!.textContent = on ? '✓' : '';
      }
    });
    return b;
  });
  const exemplo = el('button', { class: 'settings__font aparencia-aba', type: 'button' }, ['Ver como fica']);
  exemplo.addEventListener('click', () => {
    const ins = POR_ID.get('tagarela3');
    if (ins !== undefined) mostrarAvisoDeInsignia(ins);
  });

  return [
    el('h2', { class: 'settings__title' }, ['Notificações']),
    el('p', { class: 'settings__help' }, ['Vale neste aparelho.']),
    el('div', { class: 'settings__field' }, [
      el('span', { class: 'settings__label' }, ['Mensagens novas']),
      el('div', { class: 'voz__filtro' }, [botao, el('p', { class: 'settings__help' }, [ajuda])]),
    ]),
    el('div', { class: 'settings__field' }, [
      el('span', { class: 'settings__label' }, ['Insígnia nova']),
      el('div', { class: 'voz__filtro', role: 'radiogroup', 'aria-label': 'Canto do aviso de insígnia nova' }, [
        ...cantos,
        exemplo,
        el('p', { class: 'settings__help' }, ['Em que canto da tela aparece o aviso quando você ganha uma insígnia. No celular ele fica embaixo, acima da caixa de mensagem.']),
      ]),
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
