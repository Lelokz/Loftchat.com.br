/*
 * A ponte entre o site do Loft e a janela.
 *
 * O site só enxerga `window.loftDesktop` — nada de Node, nada de Electron.
 * Com isso ele sabe que está na janela e mostra o seletor de tela próprio.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('loftDesktop', {
  fontesDeTela: () => ipcRenderer.invoke('loft:fontes-de-tela'),
  escolherFonte: (id) => ipcRenderer.invoke('loft:escolher-fonte', String(id)),
  // Linux: liga o microfone virtual com o som do PC (menos o do Loft).
  ligarAudioDoPc: () => ipcRenderer.invoke('loft:audio-do-pc-ligar'),
  soltarAudioDoPc: () => ipcRenderer.invoke('loft:audio-do-pc-soltar'),
  desligarAudioDoPc: () => ipcRenderer.invoke('loft:audio-do-pc-desligar'),
});
