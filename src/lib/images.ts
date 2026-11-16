/**
 * IMAGENS DO PERFIL (proposta A, etapa 2b) — foto, banner e fundo do cartão.
 *
 * O Storage do Firebase exige o plano pago (Blaze) desde 2026, então as
 * imagens moram NO FIRESTORE, como texto (data URL), já recortadas pelo
 * ajustador e pequenas:
 *
 *  - foto: 256×256, dentro de `users/{uid}` — aparece em todo lugar
 *    (mensagens, membros, chamada) e vem junto com o perfil que já é lido;
 *  - banner (960×280) e fundo do cartão (540×720): em `profileArt/{uid}`,
 *    lidos só quando alguém abre o cartão — a lista de membros não paga por
 *    imagem grande que nem mostra.
 *
 * A regra do banco cobra o MESMO formato e os mesmos tetos (firestore.rules).
 */

export type ImageKind = 'foto' | 'banner' | 'fundo' | 'grupo' | 'chat';

interface ImageSpec {
  label: string;
  /** Tamanho final, em pixels. */
  width: number;
  height: number;
  /** Teto do texto (data URL), em caracteres — igual ao da regra. */
  maxChars: number;
  /** A forma do recorte no ajustador. */
  round: boolean;
}

export const IMAGE_SPECS: Record<ImageKind, ImageSpec> = {
  foto: { label: 'Foto', width: 256, height: 256, maxChars: 90_000, round: true },
  banner: { label: 'Banner', width: 960, height: 280, maxChars: 300_000, round: false },
  fundo: { label: 'Fundo do cartão', width: 540, height: 720, maxChars: 300_000, round: false },
  // Etapa 3a: a foto do GRUPO é quadrada de cantos redondos (a aba e o cartão do grupo).
  grupo: { label: 'Foto do grupo', width: 256, height: 256, maxChars: 90_000, round: false },
  // Etapa 5c: o fundo do chat (só na minha tela), em 16:9, cobrindo a coluna do chat.
  chat: { label: 'Fundo do chat', width: 1600, height: 900, maxChars: 400_000, round: false },
};

/** Só WebP ou JPEG em base64 — nada que vire outra coisa num `url(...)`. */
const DATA_URL_RE = /^data:image\/(webp|jpeg);base64,[A-Za-z0-9+/=]+$/;

/** A imagem que veio do banco serve para pôr na tela? (A regra já cobra; isto é a segunda tranca.) */
export function safeImage(value: unknown, kind: ImageKind): string | undefined {
  if (typeof value !== 'string') return undefined;
  if (value.length > IMAGE_SPECS[kind].maxChars) return undefined;
  return DATA_URL_RE.test(value) ? value : undefined;
}

/**
 * Desenha o recorte no tamanho final e codifica, baixando a qualidade até
 * caber no teto. WebP quando o navegador sabe gerar (Chrome, Electron,
 * Android); senão JPEG.
 */
export function encodeCanvas(canvas: HTMLCanvasElement, kind: ImageKind): string {
  const { maxChars } = IMAGE_SPECS[kind];
  const webp = canvas.toDataURL('image/webp', 0.9).startsWith('data:image/webp');
  const tipo = webp ? 'image/webp' : 'image/jpeg';
  for (const qualidade of [0.88, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3]) {
    const url = canvas.toDataURL(tipo, qualidade);
    if (url.length <= maxChars) return url;
  }
  throw new Error('A imagem ficou grande demais mesmo comprimida. Tente outra.');
}

/** "uns 15 KB" — o tamanho aproximado do arquivo dentro do texto base64. */
export function approxKb(dataUrl: string): number {
  const base64 = dataUrl.length - dataUrl.indexOf(',') - 1;
  return Math.max(1, Math.round((base64 * 3) / 4 / 1024));
}

/** Abre um arquivo do computador/celular como imagem pronta para desenhar. */
export function loadImage(source: File | string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = typeof source === 'string' ? source : URL.createObjectURL(source);
    img.onload = () => {
      if (typeof source !== 'string') URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      if (typeof source !== 'string') URL.revokeObjectURL(url);
      reject(new Error('Não deu para abrir essa imagem. Tente um PNG, JPG ou WebP.'));
    };
    img.src = url;
  });
}
