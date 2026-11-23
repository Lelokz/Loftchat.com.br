/**
 * PRÉVIA DO YOUTUBE (0.5.0): link de vídeo vira um cartão com a thumb, o
 * título e o canal. Sem play dentro do Loftchat — clicar abre o vídeo (no
 * PC, no navegador padrão; no celular, no app do YouTube, ou no navegador
 * se não tiver o app).
 *
 * A thumb vem de i.ytimg.com e o título do oEmbed do próprio YouTube (sem
 * chave, e ele libera o pedido direto do app).
 */

const FORMATOS = [
  /(?:^|\/\/)(?:www\.|m\.|music\.)?youtube\.com\/watch\?(?:[^#\s]*&)?v=([A-Za-z0-9_-]{11})/,
  /(?:^|\/\/)(?:www\.|m\.)?youtube\.com\/(?:shorts|live|embed)\/([A-Za-z0-9_-]{11})/,
  /(?:^|\/\/)youtu\.be\/([A-Za-z0-9_-]{11})/,
];

/** O id do primeiro vídeo do YouTube no texto, ou null. */
export function idDoYouTube(texto: string): string | null {
  for (const palavra of texto.split(/\s+/)) {
    if (!/^https?:\/\//.test(palavra)) continue;
    for (const formato of FORMATOS) {
      const achado = formato.exec(palavra);
      if (achado !== null) return achado[1]!;
    }
  }
  return null;
}

export function thumbDoYouTube(id: string): string {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

export function linkDoYouTube(id: string): string {
  return `https://www.youtube.com/watch?v=${id}`;
}

export interface DadosDoVideo {
  titulo: string;
  canal: string;
}

const guardados = new Map<string, Promise<DadosDoVideo | null>>();

/** Título e canal (uma vez por vídeo; vídeo privado ou apagado = null). */
export function dadosDoYouTube(id: string): Promise<DadosDoVideo | null> {
  let pedido = guardados.get(id);
  if (pedido === undefined) {
    pedido = fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(linkDoYouTube(id))}`)
      .then((r) => (r.ok ? (r.json() as Promise<{ title?: unknown; author_name?: unknown }>) : null))
      .then((d) =>
        d === null || typeof d.title !== 'string'
          ? null
          : { titulo: d.title, canal: typeof d.author_name === 'string' ? d.author_name : '' },
      )
      .catch(() => {
        // Sem internet: tenta de novo na próxima vez.
        guardados.delete(id);
        return null;
      });
    if (guardados.size > 300) guardados.clear();
    guardados.set(id, pedido);
  }
  return pedido;
}
