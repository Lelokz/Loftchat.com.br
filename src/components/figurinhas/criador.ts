import { el } from '../../lib/dom';
import { loadImage } from '../../lib/images';
import { subirArquivo } from '../../lib/midia';
import { favoritar } from '../../lib/figurinhas';
import type { Figurinha } from '../../lib/figurinhas';
import { openModal } from '../modal/modal';

/**
 * CRIAR FIGURINHA (0.5.0): escolhe a imagem e ajusta como a foto de perfil
 * (arrastar, rodinha, dois dedos, barra), no formato escolhido:
 *  - quadrado com bordas redondas, retângulo com bordas redondas, círculo;
 *  - ou o formato original da imagem (inteira, sem recorte).
 * Sai pequena (até 512 px), com o fundo transparente fora do formato e uma
 * borda branca fina, como figurinha de verdade. Criou, já vira favorita.
 */

type Forma = 'quadrado' | 'retangulo' | 'circulo' | 'original';

const FORMAS: { id: Forma; nome: string }[] = [
  { id: 'quadrado', nome: 'Quadrado' },
  { id: 'retangulo', nome: 'Retângulo' },
  { id: 'circulo', nome: 'Círculo' },
  { id: 'original', nome: 'Original' },
];

const PALCO_L = 520;
const PALCO_A = 340;
const LADO = 512;
const ZOOM_MAX = 4;

function proporcao(forma: Forma, img: HTMLImageElement): number {
  if (forma === 'retangulo') return 4 / 3;
  if (forma === 'original') return img.naturalWidth / img.naturalHeight;
  return 1;
}

/** O contorno da forma, num retângulo (x, y, l, a). */
function contorno(g: CanvasRenderingContext2D, forma: Forma, x: number, y: number, l: number, a: number): void {
  g.beginPath();
  if (forma === 'circulo') g.arc(x + l / 2, y + a / 2, Math.min(l, a) / 2, 0, Math.PI * 2);
  else if (forma === 'original') g.rect(x, y, l, a);
  else g.roundRect(x, y, l, a, Math.min(l, a) * 0.18);
}

export function escolherECriarFigurinha(aoCriar?: (f: Figurinha) => void): void {
  const escolher = el('input', { type: 'file', accept: 'image/*', hidden: '' });
  document.body.append(escolher);
  escolher.addEventListener('change', () => {
    const arquivo = escolher.files?.[0];
    escolher.remove();
    if (arquivo !== undefined) void abrirCriador(arquivo, aoCriar);
  });
  escolher.click();
}

async function abrirCriador(arquivo: File, aoCriar?: (f: Figurinha) => void): Promise<void> {
  const img = await loadImage(arquivo);
  let forma: Forma = 'quadrado';
  let quadro = { l: 0, a: 0, x: 0, y: 0 };
  let minimo = 1;
  let zoom = 1;
  let escala = 1;
  let ox = 0;
  let oy = 0;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const palco = el('canvas', {
    class: 'criador__palco',
    width: Math.round(PALCO_L * dpr),
    height: Math.round(PALCO_A * dpr),
    tabindex: 0,
    role: 'img',
    'aria-label': 'Figurinha: arraste para mover, use + e − para aproximar',
  });
  const g = palco.getContext('2d')!;
  const barra = el('input', { class: 'criador__zoom', type: 'range', min: 1, max: ZOOM_MAX, step: 0.01, value: 1, 'aria-label': 'Aproximar' });
  const previa = el('canvas', { class: 'criador__previa', width: 320, height: 320, 'aria-hidden': 'true' });
  const botoesForma = FORMAS.map(({ id, nome }) => {
    const b = el('button', { class: 'criador__forma', type: 'button', 'aria-pressed': String(id === forma) }, [nome]);
    b.addEventListener('click', () => mudarForma(id));
    return b;
  });

  function mudarForma(nova: Forma): void {
    forma = nova;
    for (const [i, b] of botoesForma.entries()) b.setAttribute('aria-pressed', String(FORMAS[i]!.id === forma));
    const p = proporcao(forma, img);
    const maxL = PALCO_L - 40;
    const maxA = PALCO_A - 40;
    const l = p >= maxL / maxA ? maxL : maxA * p;
    quadro = { l, a: l / p, x: (PALCO_L - l) / 2, y: (PALCO_A - l / p) / 2 };
    minimo = Math.max(quadro.l / img.naturalWidth, quadro.a / img.naturalHeight);
    zoom = 1;
    escala = minimo;
    ox = (quadro.l - img.naturalWidth * escala) / 2;
    oy = (quadro.a - img.naturalHeight * escala) / 2;
    barra.value = '1';
    // No original vai a imagem inteira: não tem o que mover nem aproximar.
    barra.disabled = forma === 'original';
    desenhar();
  }

  function prender(): void {
    ox = Math.min(0, Math.max(quadro.l - img.naturalWidth * escala, ox));
    oy = Math.min(0, Math.max(quadro.a - img.naturalHeight * escala, oy));
  }

  function aproximar(novo: number, cx = quadro.l / 2, cy = quadro.a / 2): void {
    if (forma === 'original') return;
    const z = Math.min(ZOOM_MAX, Math.max(1, novo));
    const s = minimo * z;
    ox = cx - ((cx - ox) * s) / escala;
    oy = cy - ((cy - oy) * s) / escala;
    zoom = z;
    escala = s;
    barra.value = String(z);
    prender();
    desenhar();
  }

  /** A figurinha pronta, no tamanho final (até 512 px no lado maior). */
  function montar(): HTMLCanvasElement {
    const k = LADO / Math.max(quadro.l, quadro.a);
    const saida = document.createElement('canvas');
    saida.width = Math.round(quadro.l * k);
    saida.height = Math.round(quadro.a * k);
    const s = saida.getContext('2d')!;
    const borda = forma === 'original' ? 0 : Math.round(saida.width * 0.025);
    // Borda branca, depois a imagem recortada por dentro dela.
    if (borda > 0) {
      contorno(s, forma, 0, 0, saida.width, saida.height);
      s.fillStyle = '#ffffff';
      s.fill();
    }
    s.save();
    contorno(s, forma, borda, borda, saida.width - borda * 2, saida.height - borda * 2);
    s.clip();
    s.imageSmoothingQuality = 'high';
    s.drawImage(img, ox * k, oy * k, img.naturalWidth * escala * k, img.naturalHeight * escala * k);
    s.restore();
    return saida;
  }

  function desenhar(): void {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, PALCO_L, PALCO_A);
    g.save();
    g.translate(quadro.x, quadro.y);
    g.drawImage(img, ox, oy, img.naturalWidth * escala, img.naturalHeight * escala);
    g.restore();
    // Escurece o que fica de fora.
    g.save();
    g.beginPath();
    g.rect(0, 0, PALCO_L, PALCO_A);
    contorno(g, forma, quadro.x, quadro.y, quadro.l, quadro.a);
    g.fillStyle = 'rgba(10, 6, 24, 0.72)';
    g.fill('evenodd');
    contorno(g, forma, quadro.x, quadro.y, quadro.l, quadro.a);
    g.lineWidth = 2;
    g.strokeStyle = '#ffffff';
    g.stroke();
    g.restore();
    // Prévia do tamanho no chat.
    const p = previa.getContext('2d')!;
    p.clearRect(0, 0, previa.width, previa.height);
    const pronta = montar();
    const k = Math.min(previa.width / pronta.width, previa.height / pronta.height);
    p.drawImage(pronta, (previa.width - pronta.width * k) / 2, (previa.height - pronta.height * k) / 2, pronta.width * k, pronta.height * k);
  }

  /* --- mexer: arrastar, pinçar, rodinha, teclado (igual ao ajustador do perfil) --- */
  const pontos = new Map<number, { x: number; y: number }>();
  let pinca: { d: number; z: number } | null = null;
  const distancia = (): number => {
    const [a, b] = [...pontos.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };
  palco.addEventListener('pointerdown', (e) => {
    palco.setPointerCapture(e.pointerId);
    pontos.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pontos.size === 2) pinca = { d: distancia(), z: zoom };
  });
  palco.addEventListener('pointermove', (e) => {
    const antes = pontos.get(e.pointerId);
    if (antes === undefined || forma === 'original') return;
    const k = PALCO_L / palco.getBoundingClientRect().width;
    pontos.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinca !== null && pontos.size === 2) {
      const d = distancia();
      if (pinca.d > 0) aproximar((pinca.z * d) / pinca.d);
      return;
    }
    ox += (e.clientX - antes.x) * k;
    oy += (e.clientY - antes.y) * k;
    prender();
    desenhar();
  });
  const soltar = (e: PointerEvent): void => {
    pontos.delete(e.pointerId);
    if (pontos.size < 2) pinca = null;
  };
  palco.addEventListener('pointerup', soltar);
  palco.addEventListener('pointercancel', soltar);
  palco.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const r = palco.getBoundingClientRect();
      const k = PALCO_L / r.width;
      aproximar(zoom * Math.exp(-e.deltaY * 0.0015), (e.clientX - r.left) * k - quadro.x, (e.clientY - r.top) * k - quadro.y);
    },
    { passive: false },
  );
  palco.addEventListener('keydown', (e) => {
    const passo = 10;
    const acoes: Record<string, () => void> = {
      ArrowLeft: () => (ox += passo),
      ArrowRight: () => (ox -= passo),
      ArrowUp: () => (oy += passo),
      ArrowDown: () => (oy -= passo),
      '+': () => aproximar(zoom + 0.1),
      '=': () => aproximar(zoom + 0.1),
      '-': () => aproximar(zoom - 0.1),
    };
    const acao = acoes[e.key];
    if (acao === undefined || forma === 'original') return;
    e.preventDefault();
    acao();
    prender();
    desenhar();
  });
  barra.addEventListener('input', () => aproximar(Number(barra.value)));

  const erro = el('p', { class: 'criador__erro', role: 'alert' });
  erro.hidden = true;

  const corpo = el('div', { class: 'criador' }, [
    el('div', { class: 'criador__formas', role: 'group', 'aria-label': 'Formato da figurinha' }, botoesForma),
    el('div', { class: 'criador__meio' }, [
      el('div', { class: 'criador__quadro' }, [palco]),
      el('div', { class: 'criador__lado' }, [el('span', { class: 'criador__rotulo' }, ['No chat']), previa]),
    ]),
    el('div', { class: 'criador__zoom-linha' }, [el('span', { 'aria-hidden': 'true' }, ['−']), barra, el('span', { 'aria-hidden': 'true' }, ['+'])]),
    erro,
  ]);

  mudarForma('quadrado');

  openModal({
    title: 'Criar figurinha',
    description: 'Escolha o formato e arraste para ajustar. Ela fica pequena no chat, como figurinha.',
    body: corpo,
    confirmLabel: 'Salvar figurinha',
    wide: true,
    initialFocus: palco,
    onConfirm: async (controle) => {
      erro.hidden = true;
      try {
        const pronta = montar();
        const blob = await new Promise<Blob>((ok, falhou) =>
          pronta.toBlob((b) => (b === null ? falhou(new Error('sem imagem')) : ok(b)), 'image/webp', 0.9),
        );
        const guardado = await subirArquivo(blob, 'image/webp', 'figurinha');
        const figurinha = { url: guardado.url, largura: pronta.width, altura: pronta.height };
        await favoritar(figurinha);
        aoCriar?.(figurinha);
        controle.close();
      } catch (e) {
        erro.textContent = e instanceof Error ? e.message : 'Não deu para salvar a figurinha.';
        erro.hidden = false;
      }
    },
  });
}
