import { avatarEl, el } from '../../lib/dom';
import { IMAGE_SPECS } from '../../lib/images';
import type { ImageKind } from '../../lib/images';
import { openImageAdjuster } from '../image-adjuster/image-adjuster';
import { showToast } from '../toast/toast';

export interface ImageFieldOptions {
  kind: ImageKind;
  /** A imagem de agora (data URL); '' = sem imagem. */
  value: string;
  /** Iniciais para a amostra quando não há foto. */
  initials: string;
  /**
   * O ARQUIVO ORIGINAL de cada imagem escolhida nesta visita. "Ajustar" usa
   * ele (mais nítido); depois de fechar a tela, ajusta-se o recorte salvo.
   */
  originals: Map<ImageKind, File>;
  /** Imagem nova ('' = removida). Quem chama atualiza o rascunho e redesenha. */
  onChange: (dataUrl: string) => void;
}

const FORMATO: Record<ImageKind, string> = {
  foto: 'círculo',
  grupo: 'quadrado',
  banner: 'faixa',
  fundo: 'cartão inteiro',
  chat: 'tela do chat',
};

/**
 * UM BLOCO DE IMAGEM das configurações (perfil na etapa 2b, grupo na 3a):
 * amostra, nome, formato final e Escolher/Trocar · Ajustar · Remover — tudo
 * passando pelo ajustador.
 */
export function renderImageField(options: ImageFieldOptions): HTMLElement {
  const { kind, value, originals, onChange } = options;
  const spec = IMAGE_SPECS[kind];
  const tem = value !== '';

  function escolherArquivo(): void {
    const input = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif' });
    input.addEventListener('change', () => {
      const arquivo = input.files?.[0];
      if (arquivo === undefined) return;
      originals.set(kind, arquivo);
      ajustar(arquivo);
    });
    input.click();
  }

  function ajustar(source: File | string): void {
    openImageAdjuster({ kind, source, onApply: onChange, onPickAnother: escolherArquivo }).catch(
      (error: unknown) => {
        showToast(error instanceof Error ? error.message : 'Não deu para abrir essa imagem.');
      },
    );
  }

  let amostra: HTMLElement;
  if (kind === 'foto' || kind === 'grupo') {
    amostra = avatarEl(
      options.initials,
      'xl',
      `settings__image-avatar${kind === 'grupo' ? ' avatar--quadrado' : ''}`,
      tem ? value : undefined,
    );
  } else {
    amostra = el('div', { class: `settings__image-sample settings__image-sample--${kind}` });
    if (tem) amostra.style.backgroundImage = `url("${value}")`;
    else amostra.classList.add('is-vazio');
  }

  const botao = (rotulo: string, aria: string, acao: () => void): HTMLButtonElement => {
    const b = el('button', { class: 'settings__link', type: 'button', 'aria-label': aria }, [rotulo]);
    b.addEventListener('click', acao);
    return b;
  };
  const nomeMinusculo = spec.label.toLowerCase();
  const acoes = el('div', { class: 'settings__image-actions' }, [
    botao(tem ? 'Trocar' : 'Escolher imagem', `${tem ? 'Trocar' : 'Escolher'} ${nomeMinusculo}`, escolherArquivo),
  ]);
  if (tem) {
    acoes.append(
      botao('Ajustar', `Ajustar ${nomeMinusculo}`, () => ajustar(originals.get(kind) ?? value)),
      botao('Remover', `Remover ${nomeMinusculo}`, () => {
        originals.delete(kind);
        onChange('');
      }),
    );
  }

  return el('div', { class: `settings__image settings__image--${kind}` }, [
    amostra,
    el('span', { class: 'settings__image-title' }, [spec.label]),
    el('span', { class: 'settings__image-spec' }, [`${FORMATO[kind]} · ${spec.width}×${spec.height}`]),
    acoes,
  ]);
}
