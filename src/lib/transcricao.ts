import { auth } from './firebase';
import { CARTEIRO } from './avisos';

/**
 * TRANSCRIÇÃO DAS MENSAGENS DE VOZ (0.10.5) — o pedido ao carteiro.
 * O texto volta aqui E fica gravado na mensagem (para todos da conversa):
 * quem está com a conversa aberta recebe pela escuta normal das mensagens.
 */
export async function pedirTranscricao(tipo: 'pv' | 'grupo', id: string): Promise<{ texto: string } | { erro: string }> {
  const usuario = auth.currentUser;
  if (usuario === null) return { erro: 'Entre de novo para transcrever.' };
  let r: Response;
  try {
    r = await fetch(`${CARTEIRO}/transcrever`, {
      method: 'POST',
      headers: { authorization: `Bearer ${await usuario.getIdToken()}`, 'content-type': 'application/json' },
      body: JSON.stringify({ tipo, id }),
    });
  } catch {
    return { erro: 'Sem conexão. Tente de novo.' };
  }
  const corpo = (await r.json().catch(() => ({}))) as { texto?: unknown; erro?: unknown };
  if (r.ok && typeof corpo.texto === 'string') return { texto: corpo.texto };
  if (r.status === 429) {
    return corpo.erro === 'limite do dia'
      ? { erro: 'O limite de transcrição de hoje acabou. Volta às 21h.' }
      : { erro: 'Muitas transcrições seguidas. Espere um pouco.' };
  }
  if (r.status === 410) return { erro: 'Este áudio expirou.' };
  return { erro: 'Não deu para transcrever. Tente de novo.' };
}
