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
  // Notificações de mensagem (0.4.0).
  avisar: (aviso) => ipcRenderer.invoke('loft:aviso', aviso),
  // Janela e bandeja (0.7.0): botões da barra de cima, escolhas deste PC,
  // bolinha da bandeja e puxar as bordas (Linux com cantos redondos).
  janelaEscolhas: () => ipcRenderer.invoke('loft:janela-escolhas'),
  janelaEscolher: (chave, valor) => ipcRenderer.invoke('loft:janela-escolher', String(chave), String(valor)),
  janelaReiniciar: () => ipcRenderer.invoke('loft:janela-reiniciar'),
  janelaAcao: (acao) => ipcRenderer.send('loft:janela-acao', String(acao)),
  aoEstadoDaJanela: (ouvinte) => {
    ipcRenderer.on('loft:janela-estado', (_evento, estado) => ouvinte({ maximizada: Boolean(estado?.maximizada) }));
  },
  bandejaPonto: (tem) => ipcRenderer.send('loft:bandeja-ponto', Boolean(tem)),
  // 0.10.0: visualização única — some do print (Windows e Mac).
  protegerTela: (ligar) => ipcRenderer.send('loft:proteger-tela', Boolean(ligar)),
  janelaPuxar: (borda, x, y) => ipcRenderer.send('loft:janela-puxar', String(borda), Number(x), Number(y)),
  janelaPuxando: (x, y) => ipcRenderer.send('loft:janela-puxando', Number(x), Number(y)),
  janelaSoltar: () => ipcRenderer.send('loft:janela-soltar'),
  aoAbrirAviso: (ouvinte) => {
    const repassar = (_evento, rota) => ouvinte(String(rota));
    ipcRenderer.on('loft:abrir-aviso', repassar);
    return () => ipcRenderer.removeListener('loft:abrir-aviso', repassar);
  },
});
