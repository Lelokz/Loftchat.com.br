import { ArquivoRecusado, mandarArquivo, prepararArquivo } from './midia';
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
      });
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
