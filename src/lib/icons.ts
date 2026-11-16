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

export const gearIcon = (size?: number): string =>
  svg(
    '<circle cx="12" cy="12" r="3.2"/>' +
      '<path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2' +
      'M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6"/>',
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

/** Monitor "vazio" — placeholder da tela compartilhada. */
export const monitorIcon = (size?: number): string =>
  svg('<rect x="2.5" y="4" width="19" height="13" rx="2"/><path d="M8.5 21h7M12 17v4"/>', size);

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
