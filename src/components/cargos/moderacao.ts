import './cargos.css';

import { el } from '../../lib/dom';
import { textoDoErro } from '../../lib/firestore-errors';
import { modalField, openModal } from '../modal/modal';
import { openConfirmDialog } from '../modal/dialogs';

/**
 * MODERAÇÃO (0.8.5, etapa 4): as janelinhas de castigo, banir, apelido e
 * passar o grupo. Quem confere permissão e hierarquia é o carteiro; o erro
 * dele (em português) aparece na própria janela.
 */

export const TEMPOS_DE_CASTIGO: [number, string][] = [
  [60, '60 segundos'],
  [5 * 60, '5 minutos'],
  [10 * 60, '10 minutos'],
  [60 * 60, '1 hora'],
  [24 * 3600, '1 dia'],
  [7 * 24 * 3600, '1 semana'],
];

function motivoCampo(id: string): { field: HTMLElement; input: HTMLInputElement } {
  return modalField(id, 'Motivo (opcional, fica no registro)', { maxlength: '200', autocomplete: 'off' });
}

export function abrirCastigo(nome: string, aoConfirmar: (segundos: number, motivo: string) => Promise<void>): void {
  let escolhido = 10 * 60;
  const opcoes = el('div', { class: 'md-tempos', role: 'radiogroup', 'aria-label': 'Por quanto tempo' });
  const desenhar = (): void => {
    opcoes.replaceChildren(
      ...TEMPOS_DE_CASTIGO.map(([s, rotulo]) => {
        const b = el('button', { class: `md-tempo${s === escolhido ? ' is-on' : ''}`, type: 'button', role: 'radio', 'aria-checked': String(s === escolhido) }, [rotulo]);
        b.addEventListener('click', () => {
          escolhido = s;
          desenhar();
        });
        return b;
      }),
    );
  };
  desenhar();
  const motivo = motivoCampo('castigo-motivo');
  openModal({
    title: `Castigo para ${nome}`,
    description: 'Durante o castigo a pessoa continua vendo e lendo, mas não escreve, não reage e não fala na voz.',
    body: el('div', { class: 'modal__field' }, [el('span', { class: 'modal__label' }, ['Por quanto tempo']), opcoes, motivo.field]),
    confirmLabel: 'Pôr de castigo',
    busyLabel: 'Aplicando…',
    danger: true,
    async onConfirm(c) {
      try {
        await aoConfirmar(escolhido, motivo.input.value.trim());
        c.close();
      } catch (e) {
        c.setError(textoDoErro(e, 'Não deu para aplicar o castigo.'));
      }
    },
  });
}

export function abrirBanir(nome: string, aoConfirmar: (motivo: string) => Promise<void>): void {
  const motivo = motivoCampo('banir-motivo');
  openModal({
    title: `Banir ${nome}`,
    description: `${nome} sai do grupo e não consegue voltar por convite até alguém desbanir (Configurações do grupo → Banidos). As mensagens que já escreveu continuam lá.`,
    body: motivo.field,
    confirmLabel: 'Banir',
    busyLabel: 'Banindo…',
    danger: true,
    initialFocus: motivo.input,
    async onConfirm(c) {
      try {
        await aoConfirmar(motivo.input.value.trim());
        c.close();
      } catch (e) {
        c.setError(textoDoErro(e, 'Não deu para banir.'));
      }
    },
  });
}

export function abrirApelido(nome: string, atual: string, proprio: boolean, aoConfirmar: (apelido: string) => Promise<void>): void {
  const campo = modalField('apelido-servidor', proprio ? 'Seu apelido neste grupo' : `Apelido de ${nome} neste grupo`, { maxlength: '32', autocomplete: 'off', placeholder: nome });
  campo.input.value = atual;
  openModal({
    title: proprio ? 'Mudar meu apelido' : `Mudar o apelido de ${nome}`,
    description: 'Vale só neste grupo. Deixe vazio para voltar ao nome normal.',
    body: campo.field,
    confirmLabel: 'Salvar',
    busyLabel: 'Salvando…',
    initialFocus: campo.input,
    async onConfirm(c) {
      try {
        await aoConfirmar(campo.input.value.trim());
        c.close();
      } catch (e) {
        c.setError(textoDoErro(e, 'Não deu para mudar o apelido.'));
      }
    },
  });
}

export function abrirPassarDono(nome: string, aoConfirmar: () => Promise<void>): void {
  openConfirmDialog({
    title: `Passar o grupo para ${nome}`,
    description: `${nome} vira o dono: pode tudo, inclusive apagar o grupo. Você continua no grupo, com os seus cargos. Não dá para desfazer sozinho — só ${nome} pode devolver.`,
    confirmLabel: 'Passar o grupo',
    busyLabel: 'Passando…',
    requireTypedText: 'passar',
    failureMessage: 'Não deu para passar o grupo.',
    async onConfirm(c) {
      await aoConfirmar();
      c.close();
    },
  });
}

export const TEMPOS_DO_LENTO: [number, string][] = [
  [0, 'Desligado'],
  [5, '5 s'],
  [10, '10 s'],
  [30, '30 s'],
  [60, '1 min'],
  [5 * 60, '5 min'],
  [15 * 60, '15 min'],
  [3600, '1 hora'],
  [6 * 3600, '6 horas'],
];

export function abrirModoLento(canal: string, atual: number, aoConfirmar: (segundos: number) => Promise<void>): void {
  let escolhido = TEMPOS_DO_LENTO.some(([s]) => s === atual) ? atual : 0;
  const opcoes = el('div', { class: 'md-tempos', role: 'radiogroup', 'aria-label': 'Intervalo' });
  const desenhar = (): void => {
    opcoes.replaceChildren(
      ...TEMPOS_DO_LENTO.map(([s, rotulo]) => {
        const b = el('button', { class: `md-tempo${s === escolhido ? ' is-on' : ''}`, type: 'button', role: 'radio', 'aria-checked': String(s === escolhido) }, [rotulo]);
        b.addEventListener('click', () => {
          escolhido = s;
          desenhar();
        });
        return b;
      }),
    );
  };
  desenhar();
  openModal({
    title: `Modo lento em #${canal}`,
    description: 'Cada pessoa só manda uma mensagem a cada intervalo. Quem tem "Ignorar o modo lento" escreve à vontade.',
    body: el('div', { class: 'modal__field' }, [opcoes]),
    confirmLabel: 'Salvar',
    busyLabel: 'Salvando…',
    async onConfirm(c) {
      try {
        await aoConfirmar(escolhido);
        c.close();
      } catch (e) {
        c.setError(textoDoErro(e, 'Não deu para mudar o modo lento.'));
      }
    },
  });
}
