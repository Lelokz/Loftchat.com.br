import { auth } from './firebase';
import { CARTEIRO } from './avisos';
import type { Attachment, MessageKind } from '../types/models';

/**
 * IMAGEM, GIF E VÍDEO (0.5.0): prepara o arquivo no aparelho e manda para o
 * carteiro (que guarda no R2).
 *
 * - Imagem: encolhe (lado maior até 2048 px) e vira WebP — boa qualidade e
 *   uns 300 KB. Se ficar maior que o original, vai o original.
 * - GIF: vai como está (encolher tiraria a animação). Até 20 MB.
 * - Vídeo: vai como está, até 50 MB, com uma capa tirada do começo.
 */

const MB = 1024 * 1024;
export const MAX_IMAGEM = 20 * MB;
export const MAX_GIF = 20 * MB;
export const MAX_VIDEO = 50 * MB;
const LADO_MAXIMO = 2048;

export type TipoDoArquivo = 'imagem' | 'gif' | 'video' | 'figurinha' | 'capa';

export interface Preparado {
  kind: Extract<MessageKind, 'image' | 'gif' | 'video'>;
  arquivo: Blob;
  formato: string;
  nome: string;
  largura: number;
  altura: number;
  duracaoMs?: number;
  capa?: Blob;
  /** Para mostrar enquanto sobe. */
  previa: string;
}

export class ArquivoRecusado extends Error {}

function carregarImagem(fonte: Blob): Promise<HTMLImageElement> {
  return new Promise((pronto, falhou) => {
    const img = new Image();
    img.onload = () => pronto(img);
    img.onerror = () => falhou(new ArquivoRecusado('Não deu para abrir essa imagem.'));
    img.src = URL.createObjectURL(fonte);
  });
}

function paraBlob(tela: HTMLCanvasElement, formato: string, qualidade: number): Promise<Blob> {
  return new Promise((pronto, falhou) =>
    tela.toBlob((b) => (b === null ? falhou(new Error('sem imagem')) : pronto(b)), formato, qualidade),
  );
}

/** Desenha encolhendo para caber em `lado`; devolve a tela. */
export function encolher(fonte: CanvasImageSource, largura: number, altura: number, lado: number): HTMLCanvasElement {
  const escala = Math.min(1, lado / Math.max(largura, altura));
  const tela = document.createElement('canvas');
  tela.width = Math.max(1, Math.round(largura * escala));
  tela.height = Math.max(1, Math.round(altura * escala));
  tela.getContext('2d')!.drawImage(fonte, 0, 0, tela.width, tela.height);
  return tela;
}

function tamanhoEmMb(bytes: number): string {
  return `${Math.round(bytes / MB)} MB`;
}

async function prepararVideo(arquivo: File): Promise<Preparado> {
  if (arquivo.size > MAX_VIDEO) {
    throw new ArquivoRecusado(`Esse vídeo tem ${tamanhoEmMb(arquivo.size)}. O limite é ${tamanhoEmMb(MAX_VIDEO)}.`);
  }
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  const url = URL.createObjectURL(arquivo);
  video.src = url;
  await new Promise<void>((pronto, falhou) => {
    video.onloadeddata = () => pronto();
    video.onerror = () => falhou(new ArquivoRecusado('Não deu para abrir esse vídeo. Tente mandar em MP4.'));
  });
  // A capa: um quadro do começo (não o primeiro, que costuma ser preto).
  await new Promise<void>((pronto) => {
    video.onseeked = () => pronto();
    video.currentTime = Math.min(0.5, (video.duration || 1) / 3);
    setTimeout(pronto, 2000);
  });
  const largura = video.videoWidth || 640;
  const altura = video.videoHeight || 360;
  const capa = await paraBlob(encolher(video, largura, altura, 720), 'image/webp', 0.8).catch(() => undefined);
  const duracao = Number.isFinite(video.duration) ? Math.round(video.duration * 1000) : undefined;
  return {
    kind: 'video',
    arquivo,
    formato: arquivo.type || 'video/mp4',
    nome: arquivo.name,
    largura,
    altura,
    ...(duracao === undefined ? {} : { duracaoMs: duracao }),
    ...(capa === undefined ? {} : { capa }),
    previa: capa === undefined ? url : URL.createObjectURL(capa),
  };
}

export async function prepararArquivo(arquivo: File): Promise<Preparado> {
  const tipo = arquivo.type.toLowerCase();
  if (tipo.startsWith('video/')) return prepararVideo(arquivo);
  if (tipo === 'image/gif') {
    if (arquivo.size > MAX_GIF) {
      throw new ArquivoRecusado(`Esse GIF tem ${tamanhoEmMb(arquivo.size)}. O limite é ${tamanhoEmMb(MAX_GIF)}.`);
    }
    const img = await carregarImagem(arquivo);
    return { kind: 'gif', arquivo, formato: 'image/gif', nome: arquivo.name, largura: img.naturalWidth, altura: img.naturalHeight, previa: img.src };
  }
  if (!tipo.startsWith('image/')) throw new ArquivoRecusado('Dá para mandar imagem, GIF ou vídeo.');
  if (arquivo.size > MAX_IMAGEM * 2) {
    throw new ArquivoRecusado(`Essa imagem tem ${tamanhoEmMb(arquivo.size)}. O limite é ${tamanhoEmMb(MAX_IMAGEM)}.`);
  }
  const img = await carregarImagem(arquivo);
  const tela = encolher(img, img.naturalWidth, img.naturalHeight, LADO_MAXIMO);
  const webp = await paraBlob(tela, 'image/webp', 0.85);
  const usarOriginal = webp.size >= arquivo.size && arquivo.size <= MAX_IMAGEM && /^image\/(jpeg|png|webp)$/.test(tipo);
  const final = usarOriginal ? arquivo : webp;
  if (final.size > MAX_IMAGEM) throw new ArquivoRecusado('Essa imagem é grande demais, mesmo encolhida.');
  return {
    kind: 'image',
    arquivo: final,
    formato: usarOriginal ? tipo : 'image/webp',
    nome: arquivo.name,
    largura: usarOriginal ? img.naturalWidth : tela.width,
    altura: usarOriginal ? img.naturalHeight : tela.height,
    previa: img.src,
  };
}

/* --------------------------------- envio --------------------------------- */

export interface Guardado {
  url: string;
  chave: string;
}

/** Manda um arquivo ao carteiro, avisando o progresso (0 a 1). */
export async function subirArquivo(
  corpo: Blob,
  formato: string,
  tipo: TipoDoArquivo,
  aoProgresso: (fracao: number) => void = () => undefined,
): Promise<Guardado> {
  const usuario = auth.currentUser;
  if (usuario === null) throw new Error('Entre de novo para mandar arquivos.');
  const token = await usuario.getIdToken();
  return new Promise((pronto, falhou) => {
    const pedido = new XMLHttpRequest();
    pedido.open('POST', `${CARTEIRO}/arquivo?tipo=${tipo}`);
    pedido.setRequestHeader('authorization', `Bearer ${token}`);
    pedido.setRequestHeader('content-type', formato);
    pedido.upload.onprogress = (e) => {
      if (e.lengthComputable) aoProgresso(e.loaded / e.total);
    };
    pedido.onerror = () => falhou(new Error('Sem conexão. O arquivo não foi.'));
    pedido.onload = () => {
      let resposta: { url?: string; chave?: string; erro?: string } = {};
      try {
        resposta = JSON.parse(pedido.responseText) as typeof resposta;
      } catch {
        // resposta vazia
      }
      if (pedido.status === 200 && typeof resposta.url === 'string' && typeof resposta.chave === 'string') {
        pronto({ url: resposta.url, chave: resposta.chave });
        return;
      }
      const motivos: Record<number, string> = {
        413: 'Arquivo grande demais.',
        415: 'Esse tipo de arquivo não dá para mandar.',
        429: 'Muitos arquivos seguidos. Espere um pouco.',
        503: 'O envio de arquivos ainda não foi ligado.',
        507: 'O espaço de arquivos do Loftchat encheu. Tente de novo amanhã.',
      };
      falhou(new Error(motivos[pedido.status] ?? 'Não deu para mandar o arquivo. Tente de novo.'));
    };
    pedido.send(corpo);
  });
}

/** Prepara, sobe (com a capa, no vídeo) e devolve o anexo da mensagem. */
export async function mandarArquivo(
  preparado: Preparado,
  aoProgresso: (fracao: number) => void,
): Promise<{ kind: Preparado['kind']; attachment: Attachment }> {
  let capaUrl: string | undefined;
  if (preparado.capa !== undefined) {
    capaUrl = (await subirArquivo(preparado.capa, 'image/webp', 'capa').catch(() => null))?.url;
  }
  const tipo: TipoDoArquivo = preparado.kind === 'image' ? 'imagem' : preparado.kind;
  const guardado = await subirArquivo(preparado.arquivo, preparado.formato, tipo, aoProgresso);
  return {
    kind: preparado.kind,
    attachment: {
      url: guardado.url,
      chave: guardado.chave,
      fileName: preparado.nome.slice(0, 120),
      mimeType: preparado.formato,
      sizeBytes: preparado.arquivo.size,
      largura: preparado.largura,
      altura: preparado.altura,
      ...(preparado.duracaoMs === undefined ? {} : { durationMs: preparado.duracaoMs }),
      ...(capaUrl === undefined ? {} : { capaUrl }),
    },
  };
}

/** O anexo só vale se o arquivo vem do carteiro (nada de imagem de outro site no chat). */
export function arquivoDoLoft(url: unknown): url is string {
  return typeof url === 'string' && url.startsWith(`${CARTEIRO}/arquivo/`);
}
