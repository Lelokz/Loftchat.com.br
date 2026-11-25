/**
 * TRANSCRIÇÃO DAS MENSAGENS DE VOZ (0.10.5).
 *
 * POST /transcrever  { tipo: 'pv' | 'grupo', id }   (com login)
 *   Quem pede tem de ver a mensagem. O áudio sai do R2, vai para o Whisper
 *   large-v3-turbo da Cloudflare (Workers AI) e o texto é gravado NA
 *   MENSAGEM (`transcricao`), para todos da conversa. Já transcrita = devolve
 *   o que está lá, sem gastar de novo. Só o carteiro escreve esse campo.
 *
 * O grátis da Cloudflare é de 10.000 neurons por dia (~214 min de áudio);
 * passou disso, a Cloudflare recusa até 00:00 UTC (21h em Brasília) — não
 * cobra. Cada pessoa também tem um limite por hora.
 */

import type { Balde } from './arquivos';
import { firestore, json, ler, nomeCompleto, quemChamou, raiz } from './index';
import type { Env } from './index';
import { podeVer } from './unica';
import { podeNoCanal } from './cargos';

type Dados = Record<string, unknown>;

const ID = /^[A-Za-z0-9]{1,64}$/;
const POR_HORA = 30;
const MODELO = '@cf/openai/whisper-large-v3-turbo';

/**
 * Frases que o Whisper inventa em áudio quase sem fala (vêm das legendas com
 * que ele foi treinado). Se o texto for SÓ isso, não tem fala.
 */
const FANTASMAS = [
  /^legendas? (pela|por) .*amara\.org\.?$/i,
  /^obrigad[oa] por assistir[!.]?$/i,
  /^inscreva-se( no canal)?[!.]?$/i,
  /^thanks? for watching[!.]?$/i,
  /^\.+$/,
];

const pedidos = new Map<string, { n: number; desde: number }>();
function passouDoLimite(uid: string): boolean {
  const agora = Date.now();
  const p = pedidos.get(uid);
  if (p === undefined || agora - p.desde > 60 * 60_000) {
    pedidos.set(uid, { n: 1, desde: agora });
    return false;
  }
  p.n += 1;
  return p.n > POR_HORA;
}

function base64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** O que o Whisper devolveu → texto limpo ('' = sem fala). */
export function limparTexto(bruto: string): string {
  const texto = bruto.replace(/\s+/g, ' ').trim();
  return FANTASMAS.some((f) => f.test(texto)) ? '' : texto;
}

/** O Workers AI recusou por limite do dia? (erro 3036 / "daily free allocation") */
function eLimiteDoDia(erro: unknown): boolean {
  return /3036|daily free allocation|neurons|capacity|rate limit/i.test(String(erro));
}

interface Resultado {
  text?: string;
  transcription_info?: { language?: string };
}

/**
 * Só no teste local (emulador + WHISPER_FALSO): nada vai para a Cloudflare.
 * Arquivo com nome "limite" simula o limite do dia; áudio minúsculo, sem fala.
 */
async function whisperFalso(bytes: Uint8Array, nome: string): Promise<Resultado> {
  if (nome === 'limite') throw new Error('3036: you have used up your daily free allocation of 10,000 neurons');
  if (bytes.length < 64) return { text: ' ', transcription_info: { language: 'pt' } };
  return { text: `Transcrição de teste com ${bytes.length} bytes.`, transcription_info: { language: 'pt' } };
}

export async function transcrever(req: Request, env: Env, balde: Balde): Promise<Response> {
  const uid = await quemChamou(req, env);
  if (uid === null) return json({ erro: 'sem login' }, 401);
  let pedido: { tipo?: unknown; id?: unknown };
  try {
    pedido = (await req.json()) as typeof pedido;
  } catch {
    return json({ erro: 'pedido inválido' }, 400);
  }
  const tipo = pedido.tipo === 'pv' || pedido.tipo === 'grupo' ? pedido.tipo : null;
  const id = typeof pedido.id === 'string' && ID.test(pedido.id) ? pedido.id : null;
  if (tipo === null || id === null) return json({ erro: 'pedido inválido' }, 400);

  const caminho = `${tipo === 'pv' ? 'dmMessages' : 'messages'}/${id}`;
  const msg = await ler(env, caminho);
  if (msg === null || !(await podeVer(env, tipo, msg, uid))) return json({ erro: 'não existe' }, 404);
  if (msg['kind'] !== 'audio' || msg['unica'] !== undefined) return json({ erro: 'não é mensagem de voz' }, 400);
  // Grupo: o cargo tem de deixar ("Usar transcrição"). No PV não tem cargo.
  if (tipo === 'grupo') {
    const grupo = String(msg['groupId'] ?? '');
    const canal = String(msg['channelId'] ?? '');
    const [g, c] = await Promise.all([ler(env, `groups/${grupo}`), ler(env, `channels/${canal}`)]);
    if (!(await podeNoCanal(env, grupo, canal, uid, 'transcricao', g, c))) return json({ erro: 'sem permissão' }, 403);
  }

  // Já transcrita: devolve, sem gastar de novo.
  const pronta = msg['transcricao'] as Dados | undefined;
  if (pronta !== undefined && typeof pronta['texto'] === 'string') {
    return json({ texto: pronta['texto'], idioma: pronta['idioma'] ?? '' });
  }
  if (passouDoLimite(uid)) return json({ erro: 'muitos pedidos, espere um pouco' }, 429);

  const anexo = (msg['attachment'] ?? {}) as Dados;
  const chave = String(anexo['chave'] ?? '');
  if (!chave.startsWith('audio/')) return json({ erro: 'não é mensagem de voz' }, 400);
  const obj = await balde.get(chave);
  if (obj === null) return json({ erro: 'expirou' }, 410);
  const bytes = new Uint8Array(await new Response(obj.body).arrayBuffer());

  let resultado: Resultado;
  try {
    if (env.EMULADOR !== undefined && env.WHISPER_FALSO !== undefined) {
      resultado = await whisperFalso(bytes, String(anexo['fileName'] ?? ''));
    } else {
      if (env.AI === undefined) return json({ erro: 'transcrição ainda não ligada' }, 503);
      // vad_filter: tira o silêncio antes — é o que impede o Whisper de inventar frase.
      resultado = (await env.AI.run(MODELO, { audio: base64(bytes), vad_filter: true })) as Resultado;
    }
  } catch (erro) {
    if (eLimiteDoDia(erro)) return json({ erro: 'limite do dia' }, 429);
    console.log('transcrição falhou', String(erro));
    return json({ erro: 'falhou' }, 502);
  }

  const texto = limparTexto(String(resultado.text ?? ''));
  const idioma = String(resultado.transcription_info?.language ?? '');
  const r = await firestore(env, `${raiz(env)}/${caminho}?updateMask.fieldPaths=transcricao&currentDocument.exists=true`, {
    method: 'PATCH',
    body: JSON.stringify({
      name: nomeCompleto(env, caminho),
      fields: {
        transcricao: {
          mapValue: {
            fields: {
              texto: { stringValue: texto },
              idioma: { stringValue: idioma },
              em: { timestampValue: new Date().toISOString() },
            },
          },
        },
      },
    }),
  });
  if (!r.ok && r.status !== 404) throw new Error(`Firestore ${r.status} gravando a transcrição`);
  return json({ texto, idioma });
}
