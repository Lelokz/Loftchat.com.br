import { ArquivoRecusado, mandarArquivo, mandarArquivoQualquer, prepararArquivo, subirArquivo } from './midia';
import type { Gravacao } from './gravador';
import type { Midia } from './firestore';

/**
 * ARQUIVOS SUBINDO (0.5.0): o que está sendo mandado em cada conversa, com a
 * miniatura e a porcentagem. O campo de mensagem da conversa mostra.
 */

export interface Envio {
  id: number;
  destino: string;
  previa: string;
  /** 0 a 1. */
  progresso: number;
  nome: string;
}

const envios = new Map<number, Envio>();
const ouvintes = new Set<() => void>();
let proximo = 1;

function avisar(): void {
  for (const ouvir of ouvintes) ouvir();
}

export function enviosDe(destino: string): Envio[] {
  return [...envios.values()].filter((e) => e.destino === destino);
}

export function ouvirEnvios(ouvir: () => void): () => void {
  ouvintes.add(ouvir);
  return () => ouvintes.delete(ouvir);
}

/**
 * Manda os arquivos, um por mensagem, na ordem. A legenda vai com o primeiro.
 * `enviar` grava a mensagem (grupo, PV ou sala). Erros vão para `aoErro`.
 */
export async function mandarArquivos(
  destino: string,
  arquivos: File[],
  legenda: string,
  enviar: (midia: Midia, legenda: string) => Promise<void>,
  aoErro: (texto: string) => void,
  /** 0.10.0: visualização única (quantas vezes). */
  vezes?: number,
): Promise<void> {
  let primeira = true;
  for (const arquivo of arquivos) {
    const id = proximo++;
    envios.set(id, { id, destino, previa: '', progresso: 0, nome: arquivo.name });
    avisar();
    try {
      const preparado = await prepararArquivo(arquivo);
      envios.set(id, { ...envios.get(id)!, previa: preparado.previa });
      avisar();
      const midia = await mandarArquivo(preparado, (fracao) => {
        const atual = envios.get(id);
        if (atual === undefined) return;
        envios.set(id, { ...atual, progresso: fracao });
        avisar();
      }, vezes);
      await enviar(midia, primeira ? legenda : '');
      primeira = false;
    } catch (erro) {
      aoErro(
        erro instanceof ArquivoRecusado || erro instanceof Error
          ? erro.message
          : 'Não deu para mandar o arquivo.',
      );
    } finally {
      envios.delete(id);
      avisar();
    }
  }
}

/** 0.11.0: arquivos quaisquer (PDF, ZIP…), um por mensagem, com a porcentagem na fila. */
export async function mandarDocumentos(
  destino: string,
  arquivos: File[],
  legenda: string,
  enviar: (midia: Midia, legenda: string) => Promise<void>,
  aoErro: (texto: string) => void,
): Promise<void> {
  let primeira = true;
  for (const arquivo of arquivos) {
    const id = proximo++;
    envios.set(id, { id, destino, previa: '', progresso: 0, nome: arquivo.name });
    avisar();
    try {
      const midia = await mandarArquivoQualquer(arquivo, (fracao) => {
        const atual = envios.get(id);
        if (atual === undefined) return;
        envios.set(id, { ...atual, progresso: fracao });
        avisar();
      });
      await enviar(midia, primeira ? legenda : '');
      primeira = false;
    } catch (erro) {
      aoErro(erro instanceof Error ? erro.message : 'Não deu para mandar o arquivo.');
    } finally {
      envios.delete(id);
      avisar();
    }
  }
}

/** MENSAGEM DE VOZ (0.5.5): sobe o áudio (com a porcentagem na fila) e grava a mensagem. */
export async function mandarVoz(
  destino: string,
  gravacao: Gravacao,
  enviar: (midia: Midia) => Promise<void>,
  aoErro: (texto: string) => void,
): Promise<void> {
  const id = proximo++;
  envios.set(id, { id, destino, previa: '', progresso: 0, nome: 'Mensagem de voz' });
  avisar();
  try {
    const guardado = await subirArquivo(gravacao.blob, gravacao.formato, 'audio', (fracao) => {
      const atual = envios.get(id);
      if (atual === undefined) return;
      envios.set(id, { ...atual, progresso: fracao });
      avisar();
    });
    await enviar({
      kind: 'audio',
      attachment: {
        url: guardado.url,
        chave: guardado.chave,
        fileName: 'voz',
        mimeType: gravacao.formato,
        sizeBytes: gravacao.blob.size,
        durationMs: gravacao.duracaoMs,
        ondas: gravacao.ondas,
      },
    });
  } catch (erro) {
    aoErro(erro instanceof Error ? erro.message : 'Não deu para mandar a mensagem de voz.');
  } finally {
    envios.delete(id);
    avisar();
  }
}
