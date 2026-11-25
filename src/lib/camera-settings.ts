/**
 * CÂMERA (0.9.5): qual câmera usar e se o MEU vídeo aparece espelhado para
 * mim. Igual à Voz e áudio, fica NESTE APARELHO (localStorage): a câmera do
 * PC não existe no celular, e os ids mudam de um navegador para outro.
 *
 * Espelhar é só para mim (como um espelho, que é como a gente se reconhece):
 * quem está na sala sempre recebe a imagem do jeito certo.
 */

export interface CameraSettings {
  /** `''` = a padrão do aparelho. */
  cameraId: string;
  espelhar: boolean;
  /** Celular: usar a câmera da frente (true) ou a de trás. */
  frente: boolean;
}

export const DEFAULT_CAMERA_SETTINGS: CameraSettings = { cameraId: '', espelhar: true, frente: true };

const CHAVE = 'loft.camera';

export function loadCameraSettings(): CameraSettings {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(CHAVE) ?? 'null');
    if (typeof raw !== 'object' || raw === null) return { ...DEFAULT_CAMERA_SETTINGS };
    const r = raw as Record<string, unknown>;
    return {
      cameraId: typeof r['cameraId'] === 'string' && r['cameraId'].length <= 300 ? r['cameraId'] : '',
      espelhar: r['espelhar'] !== false,
      frente: r['frente'] !== false,
    };
  } catch {
    return { ...DEFAULT_CAMERA_SETTINGS };
  }
}

const ouvintes = new Set<(v: CameraSettings) => void>();

export function saveCameraSettings(v: CameraSettings): void {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(v));
  } catch {
    // Sem armazenamento: vale até fechar a página.
  }
  for (const ouvinte of ouvintes) ouvinte({ ...v });
}

export function onCameraSettings(ouvinte: (v: CameraSettings) => void): () => void {
  ouvintes.add(ouvinte);
  return () => ouvintes.delete(ouvinte);
}

/** As câmeras do aparelho (o nome só vem depois de a pessoa liberar a câmera uma vez). */
export async function listarCameras(): Promise<{ id: string; nome: string }[]> {
  if (navigator.mediaDevices?.enumerateDevices === undefined) return [];
  const todos = await navigator.mediaDevices.enumerateDevices().catch(() => []);
  return todos
    .filter((d) => d.kind === 'videoinput')
    .map((d, i) => ({ id: d.deviceId, nome: d.label !== '' ? d.label : `Câmera ${i + 1}` }));
}
