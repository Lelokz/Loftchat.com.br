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
  // Atualização automática (etapa 9d): versão nova baixada e pronta.
  versao: () => ipcRenderer.invoke('loft:versao'),
  atualizacaoPronta: () => ipcRenderer.invoke('loft:atualizacao-estado'),
  aoAtualizacaoPronta: (ouvinte) => {
    ipcRenderer.on('loft:atualizacao-pronta', (_evento, versao) => ouvinte(String(versao)));
  },
  atualizarAgora: () => ipcRenderer.invoke('loft:atualizar-agora'),
  // Achou versão nova (baixando), quanto já baixou, e "procurar agora".
  aoAtualizacaoDisponivel: (ouvinte) => {
    ipcRenderer.on('loft:atualizacao-disponivel', (_evento, versao) => ouvinte(String(versao)));
  },
  aoProgressoDaAtualizacao: (ouvinte) => {
    ipcRenderer.on('loft:atualizacao-progresso', (_evento, pct) => ouvinte(Number(pct)));
  },
  procurarAtualizacao: () => ipcRenderer.invoke('loft:procurar-atualizacao'),
  // Link de convite com o programa já aberto (etapa 9b): só o código chega.
  aoAbrirConvite: (ouvinte) => {
    ipcRenderer.on('loft:convite', (_evento, codigo) => ouvinte(String(codigo)));
  },
});
