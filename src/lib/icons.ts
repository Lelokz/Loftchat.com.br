/**
 * Ícones em SVG inline, escritos à mão.
 *
 * "Sem biblioteca de UI" inclui icon pack, então são constantes daqui mesmo.
 * Todos usam `currentColor`, então a cor vem do CSS do componente — nenhum hex
 * escapa para cá.
 */

const svg = (paths: string, size = 20): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}" ` +
  `fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" ` +
  `stroke-linejoin="round" focusable="false">${paths}</svg>`;

/** Marca do app — um "loft" (sótão). Único ícone preenchido. */
export const logoIcon = (size = 22): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}" ` +
  `fill="currentColor" focusable="false">` +
  `<path d="M4 10 12 4l8 6v9a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1v-9Z"/></svg>`;

export const speakerIcon = (size?: number): string =>
  svg('<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/>', size);

export const plusIcon = (size?: number): string => svg('<path d="M12 5v14M5 12h14"/>', size);

/**
 * Engrenagem de verdade, com dentes (23/11/2026): a antiga — um círculo com
 * raios — parecia um SOL. Contorno no traço da Lucide (licença ISC).
 */
export const gearIcon = (size?: number): string =>
  svg(
    '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2Z"/>' +
      '<circle cx="12" cy="12" r="3"/>',
    size,
  );

/** Sino (Lucide, ISC): Configurações → Notificações. */
export const bellIcon = (size?: number): string =>
  svg(
    '<path d="M10.268 21a2 2 0 0 0 3.464 0"/>' +
      '<path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"/>',
    size,
  );

export const clipIcon = (size?: number): string =>
  svg(
    '<path d="M20.4 11.6 12.3 19.7a5.5 5.5 0 0 1-7.8-7.8l8.1-8.1a3.7 3.7 0 0 1 5.2 5.2l-8.1 8.1a1.8 1.8 0 0 1-2.6-2.6l7.5-7.5"/>',
    size,
  );

export const micIcon = (size?: number): string =>
  svg('<rect x="9" y="2.5" width="6" height="11.5" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3.5M9 21.5h6"/>', size);

export const cameraIcon = (size?: number): string =>
  svg('<rect x="2.5" y="6" width="13" height="12" rx="2.5"/><path d="m21.5 8-6 4 6 4V8Z"/>', size);

/** Câmera desligada / pausada (0.9.5). */
export const cameraOffIcon = (size?: number): string =>
  svg('<rect x="2.5" y="6" width="13" height="12" rx="2.5"/><path d="m21.5 8-6 4 6 4V8Z"/><path d="M2 3l19 18"/>', size);

/** Virar entre a câmera da frente e a de trás (celular). */
export const flipCameraIcon = (size?: number): string =>
  svg('<path d="M4 12a8 8 0 0 1 14-5.3L20 9"/><path d="M20 4v5h-5"/><path d="M20 12a8 8 0 0 1-14 5.3L4 15"/><path d="M4 20v-5h5"/>', size);

/** Olho cortado: esconder (quem está sem câmera). */
export const eyeOffIcon = (size?: number): string =>
  svg('<path d="M3 3l18 18"/><path d="M10.6 6.1A9.8 9.8 0 0 1 12 6c5 0 9 6 9 6a17 17 0 0 1-2.6 3.3M6.6 7.6C4.3 9.2 3 12 3 12s4 6 9 6a8.7 8.7 0 0 0 4.3-1.1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>', size);

/** Monitor "vazio" — placeholder da tela compartilhada. */
export const monitorIcon = (size?: number): string =>
  svg('<rect x="2.5" y="4" width="19" height="13" rx="2"/><path d="M8.5 21h7M12 17v4"/>', size);

/** Tela cheia: as quatro setinhas para fora (e para dentro, ao sair). */
export const expandIcon = (size?: number): string =>
  svg('<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>', size);

export const shrinkIcon = (size?: number): string =>
  svg('<path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/>', size);

/** Chevron do cabeçalho do grupo. */
export const chevronDownIcon = (size?: number): string => svg('<path d="m6 9 6 6 6-6"/>', size);

/** Sair da sessão. */
export const logoutIcon = (size?: number): string =>
  svg(
    '<path d="M9.5 20H5.5A1.5 1.5 0 0 1 4 18.5v-13A1.5 1.5 0 0 1 5.5 4h4"/>' +
      '<path d="m15 8 4 4-4 4"/><path d="M19 12H9.5"/>',
    size,
  );

export const screenShareIcon = (size?: number): string =>
  svg(
    '<rect x="2.5" y="4" width="19" height="13" rx="2"/>' +
      '<path d="M8.5 21h7M12 17v4"/>' +
      '<path d="M12 13.5v-6m0 0L9.6 9.9M12 7.5l2.4 2.4"/>',
    size,
  );

export const hangupIcon = (size?: number): string =>
  svg(
    '<path d="M2.6 12.2a13 13 0 0 1 18.8 0l-2.2 2.3a1.6 1.6 0 0 1-2.1.1l-1.6-1.3a1.6 1.6 0 0 1-.6-1.2v-1.4a11.2 11.2 0 0 0-5.8 0v1.4a1.6 1.6 0 0 1-.6 1.2l-1.6 1.3a1.6 1.6 0 0 1-2.1-.1l-2.2-2.3Z"/>',
    size,
  );

export const sendIcon = (size?: number): string =>
  svg('<path d="m3.5 3.5 17 8.5-17 8.5 3-8.5-3-8.5Z"/><path d="M6.5 12h14"/>', size);

/** Figurinha: adesivo com a pontinha dobrada (0.5.0) — abre Emojis | Figurinhas. */
export const stickerIcon = (size?: number): string =>
  svg(
    '<path d="M15.5 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h9.5L21 14.5V5a2 2 0 0 0-2-2z"/>' +
      '<path d="M14 21v-5a2 2 0 0 1 2-2h5"/><path d="M8.5 9.5h.01M14.5 9.5h.01"/><path d="M8.5 13.5a4 4 0 0 0 4.5 1"/>',
    size,
  );

/** Anexar (0.5.0): o + que manda imagem, GIF e vídeo. */
export const attachIcon = (size?: number): string => svg('<path d="M12 5v14M5 12h14"/>', size);

export const fileIcon = (size?: number): string =>
  svg('<path d="M14 3v4.5a1 1 0 0 0 1 1h4.5"/><path d="M14 3H7.5A2.5 2.5 0 0 0 5 5.5v13A2.5 2.5 0 0 0 7.5 21h9a2.5 2.5 0 0 0 2.5-2.5V8l-5-5Z"/>', size);

export const phoneIcon = (size?: number): string =>
  svg(
    '<path d="M6.5 3.5h-2a2 2 0 0 0-2 2.2A17.5 17.5 0 0 0 18.3 21.5a2 2 0 0 0 2.2-2v-2a1.5 1.5 0 0 0-1.2-1.5l-2.6-.5a1.5 1.5 0 0 0-1.5.6l-.8 1a13.5 13.5 0 0 1-5.5-5.5l1-.8a1.5 1.5 0 0 0 .6-1.5l-.5-2.6a1.5 1.5 0 0 0-1.5-1.2Z"/>',
    size,
  );

/* --- mobile: gavetas ------------------------------------------------------ */

export const menuIcon = (size?: number): string =>
  svg('<path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h16"/>', size);

/** Dois balões de conversa — a aba Privado (antes era a casinha, igual ao logo). */
export const chatsIcon = (size?: number): string =>
  svg(
    '<path d="M4 4.5h10a1.5 1.5 0 0 1 1.5 1.5v6a1.5 1.5 0 0 1-1.5 1.5H8.5L5 16.5v-3H4A1.5 1.5 0 0 1 2.5 12V6A1.5 1.5 0 0 1 4 4.5Z"/>' +
      '<path d="M18.5 8.5h1.5A1.5 1.5 0 0 1 21.5 10v6a1.5 1.5 0 0 1-1.5 1.5h-1v3l-3.5-3H12a1.5 1.5 0 0 1-1.5-1.5v-1"/>',
    size,
  );

export const peopleIcon = (size?: number): string =>
  svg(
    '<path d="M15.5 20v-1.5a3.5 3.5 0 0 0-3.5-3.5H7a3.5 3.5 0 0 0-3.5 3.5V20"/><circle cx="9.5" cy="8" r="3.25"/><path d="M20.5 20v-1.5a3.5 3.5 0 0 0-2.6-3.4"/><path d="M15.5 4.7a3.25 3.25 0 0 1 0 6.3"/>',
    size,
  );

export const rotateIcon = (size?: number): string =>
  svg(
    '<rect x="3" y="7" width="18" height="10" rx="2"/><path d="M8.5 4.5 11 2m0 0 2.5 2.5M11 2v3"/>',
    size,
  );

/** X — cancelar uma resposta, fechar uma faixa. */
export const closeIcon = (size?: number): string =>
  svg(`<path d="M18 6 6 18M6 6l12 12"/>`, size);

/** Mensagem fixada — cabeçalho do grupo (etapa 19). */
export const pinIcon = (size?: number): string =>
  svg(
    '<path d="M12 21s7-7.6 7-12.5A7 7 0 0 0 5 8.5C5 13.4 12 21 12 21Z"/><circle cx="12" cy="8.5" r="2.5"/>',
    size,
  );

/** Rosto — Configurações → Perfil. */
export const faceIcon = (size?: number): string =>
  svg(
    '<circle cx="12" cy="12" r="9"/><path d="M8.5 14.5a4.5 4.5 0 0 0 7 0"/>' +
      '<path d="M9 9.5h.01M15 9.5h.01"/>',
    size,
  );

/** Escudo — Configurações → Conta e segurança. */
export const shieldIcon = (size?: number): string =>
  svg('<path d="M12 3 5 6v5c0 4.4 3 8.3 7 10 4-1.7 7-5.6 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-4"/>', size);

/** Seta para a esquerda — voltar, no celular. */
export const arrowLeftIcon = (size?: number): string =>
  svg('<path d="M19 12H5M11 18l-6-6 6-6"/>', size);

/** Janela com a coluna da direita — mostrar/esconder o painel da direita (etapa 5d). */
export const panelRightIcon = (size?: number): string =>
  svg('<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M15 4v16"/>', size);

/** Paleta de pintor — Configurações → Aparência. */
export const paletteIcon = (size?: number): string =>
  svg(
    '<path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.8-.9 1.8-1.8 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-1 .8-1.8 1.8-1.8H17a4 4 0 0 0 4-4c0-4.4-4-8-9-8Z"/>' +
      '<path d="M7.5 11.5h.01M10 7.5h.01M14.5 7.5h.01M17 11h.01"/>',
    size,
  );

/** Lixeira (0.5.5): jogar fora a mensagem de voz que está gravando. */
export const windowIcon = (size?: number): string =>
  svg('<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 9h18"/><path d="M15 6.5h.01M18 6.5h.01"/>', size);

export const trashIcon = (size?: number): string =>
  svg('<path d="M4 7h16M9.5 7V4.5h5V7M6 7l1 13h10l1-13M10 11v5M14 11v5"/>', size);

/** Tocar / pausar (0.5.5): o balão da mensagem de voz. Preenchidos. */
export const playIcon = (size = 16): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}" fill="currentColor" focusable="false"><path d="M7 4.5v15l12.5-7.5z"/></svg>`;
export const pauseIcon = (size = 16): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}" fill="currentColor" focusable="false"><path d="M6 4.5h4v15H6zM14 4.5h4v15h-4z"/></svg>`;

/** Foto (0.10.0): o item "Foto, GIF ou vídeo" do menu do +. */
export const imageIcon = (size?: number): string =>
  svg('<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>', size);

/** Visualização única (0.10.0): um "1" num círculo pontilhado. */
export const unicaIcon = (size?: number): string =>
  svg('<circle cx="12" cy="12" r="9.5" stroke-dasharray="3.2 2.6"/><path d="M10 9.2 12.6 7.5V16.5" stroke-width="2"/>', size);

/** Cadeado (0.10.0): o aviso "não dá para baixar" da visualização única. */
export const lockIcon = (size?: number): string =>
  svg('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>', size);

/** Transcrição (0.10.5): linhas de texto — o botão do balão de voz. */
export const transcreverIcon = (size?: number): string => svg('<path d="M4 7h11M4 12h16M4 17h9" stroke-width="2"/>', size);

/** Reagir (0.11.0): carinha com um "+" — abre todos os emojis. */
export const addReactionIcon = (size?: number): string =>
  svg('<circle cx="11" cy="13" r="8"/><path d="M7.8 15.2a4.2 4.2 0 0 0 6.4 0M8.5 11h.01M13.5 11h.01"/><path d="M19 2v5M16.5 4.5h5"/>', size);

/** Responder (0.11.0): a seta voltando. */
export const replyIcon = (size?: number): string => svg('<path d="m9 6-6 6 6 6"/><path d="M3 12h11a6 6 0 0 1 6 6v1"/>', size);

/** Encaminhar (0.11.0): a seta indo. */
export const encaminharIcon = (size?: number): string => svg('<path d="m15 6 6 6-6 6"/><path d="M21 12H10a6 6 0 0 0-6 6v1"/>', size);

/** Mais opções (0.11.0): três pontos. */
export const moreIcon = (size?: number): string =>
  svg('<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>', size);

/** Baixar (0.11.0): o cartão do arquivo. */
export const downloadIcon = (size?: number): string => svg('<path d="M12 4v11m-5-5 5 5 5-5M5 20h14"/>', size);

/** Alerta (0.11.0): o aviso de programa no cartão do arquivo. */
export const alertIcon = (size?: number): string => svg('<path d="M12 3 2 20h20L12 3z"/><path d="M12 10v4M12 17h.01"/>', size);

/** Silenciado (0.11.0): o sino riscado. */
export const bellOffIcon = (size?: number): string =>
  svg('<path d="M13.7 21a2 2 0 0 1-3.4 0"/><path d="M18.6 13A16 16 0 0 1 18 8a6 6 0 0 0-9.3-5"/><path d="M6.3 6.3A6 6 0 0 0 6 8c0 7-3 9-3 9h14"/><path d="m2 2 20 20"/>', size);
