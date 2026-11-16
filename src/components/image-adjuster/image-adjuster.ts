import './image-adjuster.css';

import { el } from '../../lib/dom';
import { approxKb, encodeCanvas, IMAGE_SPECS, loadImage } from '../../lib/images';
import type { ImageKind } from '../../lib/images';
import { openModal } from '../modal/modal';

export interface AdjusterOptions {
  kind: ImageKind;
  /** A imagem a ajustar: um arquivo recém-escolhido ou uma já salva. */
  source: File | string;
  /** O recorte final, já codificado e dentro do teto. */
  onApply: (dataUrl: string) => void;
  /** "Escolher outra": quem chamou abre o seletor de arquivo de novo. */
  onPickAnother: () => void;
}

/** Tamanho do palco (área cinza) e da moldura, em pixels de tela. */
const STAGE_W = 560;
const STAGE_H = 320;
const ZOOM_MAX = 4;

function frameSize(kind: ImageKind): { w: number; h: number } {
  const { width, height } = IMAGE_SPECS[kind];
  const proporcao = width / height;
  // A moldura ocupa o máximo do palco com folga de 20px em volta.
  const maxW = STAGE_W - 40;
  const maxH = STAGE_H - 40;
  return proporcao >= maxW / maxH ? { w: maxW, h: maxW / proporcao } : { w: maxH * proporcao, h: maxH };
}

/**
 * AJUSTADOR DE IMAGEM (proposta A): arrastar para mover, zoom pela barra,
 * pela rodinha do mouse ou com dois dedos — sempre no formato em que a
 * imagem vai aparecer (círculo da foto, faixa do banner, retrato do fundo).
 *
 * Tudo acontece no aparelho: sai daqui só o recorte pequeno, nunca o
 * arquivo original.
 */
export async function openImageAdjuster(options: AdjusterOptions): Promise<void> {
  const { kind, source, onApply, onPickAnother } = options;
  const spec = IMAGE_SPECS[kind];
  const img = await loadImage(source);

  const frame = frameSize(kind);
  const frameX = (STAGE_W - frame.w) / 2;
  const frameY = (STAGE_H - frame.h) / 2;
  const minScale = Math.max(frame.w / img.naturalWidth, frame.h / img.naturalHeight);

  let zoom = 1; // 1 = a imagem cobre a moldura justinha
  let scale = minScale;
  // Canto de cima/esquerda da imagem, relativo à moldura (em pixels de tela).
  let ox = (frame.w - img.naturalWidth * scale) / 2;
  let oy = (frame.h - img.naturalHeight * scale) / 2;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const canvas = el('canvas', {
    class: 'adjuster__stage',
    width: Math.round(STAGE_W * dpr),
    height: Math.round(STAGE_H * dpr),
    tabindex: 0,
    role: 'img',
    'aria-label': 'Imagem: arraste para mover, use + e − para aproximar',
  });
  const ctx = canvas.getContext('2d')!;

  const slider = el('input', {
    class: 'adjuster__zoom',
    type: 'range',
    min: 1,
    max: ZOOM_MAX,
    step: 0.01,
    value: 1,
    'aria-label': 'Aproximar',
  });

  const tamanho = el('span', { class: 'adjuster__size' });

  /* --- miniaturas (só a foto: cartão, mensagens, chamada) ---------------- */
  const minis =
    kind === 'foto'
      ? [
          { px: 56, rotulo: 'no cartão' },
          { px: 32, rotulo: 'nas mensagens' },
          { px: 22, rotulo: 'na chamada' },
        ].map(({ px, rotulo }) => {
          const c = el('canvas', {
            class: 'adjuster__mini',
            width: px * dpr,
            height: px * dpr,
            'aria-hidden': 'true',
          });
          c.style.width = `${px}px`;
          c.style.height = `${px}px`;
          return { c, rotulo };
        })
      : [];

  function clamp(): void {
    const w = img.naturalWidth * scale;
    const h = img.naturalHeight * scale;
    ox = Math.min(0, Math.max(frame.w - w, ox));
    oy = Math.min(0, Math.max(frame.h - h, oy));
  }

  function setZoom(next: number, cx = frame.w / 2, cy = frame.h / 2): void {
    const z = Math.min(ZOOM_MAX, Math.max(1, next));
    const novo = minScale * z;
    // Mantém parado o ponto que está embaixo de (cx, cy).
    ox = cx - ((cx - ox) * novo) / scale;
    oy = cy - ((cy - oy) * novo) / scale;
    zoom = z;
    scale = novo;
    slider.value = String(z);
    clamp();
    draw();
  }

  /** Desenha o recorte num contexto qualquer, com `k` pixels por pixel da moldura. */
  function drawCrop(target: CanvasRenderingContext2D, k: number): void {
    target.imageSmoothingQuality = 'high';
    target.drawImage(img, ox * k, oy * k, img.naturalWidth * scale * k, img.naturalHeight * scale * k);
  }

  let estimar = 0;
  function draw(): void {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, STAGE_W, STAGE_H);
    ctx.save();
    ctx.translate(frameX, frameY);
    drawCrop(ctx, 1);
    ctx.restore();

    // Escurece o que fica de fora do recorte.
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, STAGE_W, STAGE_H);
    if (spec.round) {
      ctx.arc(frameX + frame.w / 2, frameY + frame.h / 2, frame.w / 2, 0, Math.PI * 2, true);
    } else {
      ctx.roundRect(frameX, frameY, frame.w, frame.h, 12);
    }
    ctx.fillStyle = getComputedStyle(canvas).getPropertyValue('--adjuster-veu').trim() || 'black';
    ctx.fill('evenodd');
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    if (spec.round) ctx.arc(frameX + frame.w / 2, frameY + frame.h / 2, frame.w / 2, 0, Math.PI * 2);
    else ctx.roundRect(frameX, frameY, frame.w, frame.h, 12);
    ctx.lineWidth = 2;
    ctx.strokeStyle = getComputedStyle(canvas).getPropertyValue('--adjuster-borda').trim() || 'white';
    ctx.stroke();
    ctx.restore();

    for (const { c } of minis) {
      const m = c.getContext('2d')!;
      m.setTransform(1, 0, 0, 1, 0, 0);
      m.clearRect(0, 0, c.width, c.height);
      drawCrop(m, c.width / frame.w);
    }

    window.clearTimeout(estimar);
    estimar = window.setTimeout(() => {
      try {
        tamanho.textContent = `Sai como ${spec.width}×${spec.height}, uns ${approxKb(exportar())} KB.`;
      } catch {
        tamanho.textContent = `Sai como ${spec.width}×${spec.height}.`;
      }
    }, 250);
  }

  function exportar(): string {
    const out = document.createElement('canvas');
    out.width = spec.width;
    out.height = spec.height;
    drawCrop(out.getContext('2d')!, spec.width / frame.w);
    return encodeCanvas(out, kind);
  }

  /* --- arrastar e pinçar --------------------------------------------------- */
  const pontos = new Map<number, { x: number; y: number }>();
  let pinca: { dist: number; zoom: number } | null = null;

  function distancia(): number {
    const [a, b] = [...pontos.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }

  canvas.addEventListener('pointerdown', (event) => {
    canvas.setPointerCapture(event.pointerId);
    pontos.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pontos.size === 2) pinca = { dist: distancia(), zoom };
  });
  canvas.addEventListener('pointermove', (event) => {
    const antes = pontos.get(event.pointerId);
    if (antes === undefined) return;
    const escala = STAGE_W / canvas.getBoundingClientRect().width;
    pontos.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pinca !== null && pontos.size === 2) {
      const d = distancia();
      if (pinca.dist > 0) setZoom((pinca.zoom * d) / pinca.dist);
      return;
    }
    ox += (event.clientX - antes.x) * escala;
    oy += (event.clientY - antes.y) * escala;
    clamp();
    draw();
  });
  const soltar = (event: PointerEvent): void => {
    pontos.delete(event.pointerId);
    if (pontos.size < 2) pinca = null;
  };
  canvas.addEventListener('pointerup', soltar);
  canvas.addEventListener('pointercancel', soltar);

  canvas.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      const r = canvas.getBoundingClientRect();
      const escala = STAGE_W / r.width;
      const cx = (event.clientX - r.left) * escala - frameX;
      const cy = (event.clientY - r.top) * escala - frameY;
      setZoom(zoom * Math.exp(-event.deltaY * 0.0015), cx, cy);
    },
    { passive: false },
  );

  canvas.addEventListener('keydown', (event) => {
    const passo = 10;
    const mapa: Record<string, () => void> = {
      ArrowLeft: () => (ox += passo),
      ArrowRight: () => (ox -= passo),
      ArrowUp: () => (oy += passo),
      ArrowDown: () => (oy -= passo),
      '+': () => setZoom(zoom + 0.1),
      '=': () => setZoom(zoom + 0.1),
      '-': () => setZoom(zoom - 0.1),
    };
    const acao = mapa[event.key];
    if (acao === undefined) return;
    event.preventDefault();
    acao();
    clamp();
    draw();
  });

  slider.addEventListener('input', () => setZoom(Number(slider.value)));

  const outra = el('button', { class: 'adjuster__other', type: 'button' }, ['Escolher outra']);

  const body = el('div', { class: `adjuster adjuster--${kind}` }, [
    el('div', { class: 'adjuster__frame' }, [
      canvas,
      el('span', { class: 'adjuster__hint', 'aria-hidden': 'true' }, ['✥ arraste para mover']),
    ]),
    el('div', { class: 'adjuster__zoom-row' }, [
      el('span', { 'aria-hidden': 'true' }, ['−']),
      slider,
      el('span', { 'aria-hidden': 'true' }, ['+']),
    ]),
    minis.length > 0 &&
      el(
        'div',
        { class: 'adjuster__minis' },
        minis.map(({ c, rotulo }) => el('span', { class: 'adjuster__mini-item' }, [c, el('span', {}, [rotulo])])),
      ),
    el('div', { class: 'adjuster__foot' }, [tamanho, outra]),
  ]);

  const modal = openModal({
    title: `Ajustar ${spec.label.toLowerCase()}`,
    description: 'Arraste para mover. Use a rodinha do mouse, a barra ou dois dedos para aproximar.',
    body,
    confirmLabel: 'Aplicar',
    wide: true,
    initialFocus: canvas,
    onConfirm: async (controller) => {
      const url = exportar();
      onApply(url);
      controller.close();
    },
  });

  outra.addEventListener('click', () => {
    modal.close();
    onPickAnother();
  });

  draw();
}
