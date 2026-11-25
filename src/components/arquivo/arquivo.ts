import './arquivo.css';

import { el, iconEl } from '../../lib/dom';
import { formatBytes } from '../../lib/format';
import { alertIcon, downloadIcon } from '../../lib/icons';
import type { Attachment } from '../../types/models';

/**
 * O CARTÃO DO ARQUIVO no chat (0.11.0, maquete aprovada): a etiqueta
 * colorida do tipo (PDF, ZIP, JAR…), o nome, o tamanho e o botão de baixar.
 * Programa (.exe, .jar, .apk…) vem com o aviso amarelo — não é bloqueado
 * (mod de Minecraft é .jar).
 */

const PROGRAMAS = new Set(['exe', 'msi', 'bat', 'cmd', 'com', 'scr', 'ps1', 'vbs', 'js', 'jar', 'apk', 'sh', 'appimage', 'deb', 'rpm', 'dmg', 'pkg', 'run', 'bin', 'msix', 'reg', 'lnk']);

const CORES: Record<string, string> = {
  pdf: '#e5484d',
  zip: '#d29922', rar: '#d29922', '7z': '#d29922', tar: '#d29922', gz: '#d29922',
  doc: '#3e63dd', docx: '#3e63dd', odt: '#3e63dd', rtf: '#3e63dd',
  xls: '#30a46c', xlsx: '#30a46c', ods: '#30a46c', csv: '#30a46c',
  ppt: '#f76b15', pptx: '#f76b15', odp: '#f76b15',
  txt: '#8b8d98', md: '#8b8d98', json: '#8b8d98', log: '#8b8d98',
  mp3: '#d6409f', wav: '#d6409f', ogg: '#d6409f', flac: '#d6409f', m4a: '#d6409f',
};

const NOMES: Record<string, string> = {
  pdf: 'PDF', zip: 'ZIP', rar: 'RAR', '7z': '7Z', doc: 'Documento do Word', docx: 'Documento do Word',
  xls: 'Planilha', xlsx: 'Planilha', ods: 'Planilha', csv: 'Planilha', ppt: 'Apresentação', pptx: 'Apresentação',
  txt: 'Texto', jar: 'Programa Java', exe: 'Programa', msi: 'Instalador', apk: 'App de Android',
};

export function extensaoDe(nome: string): string {
  const m = /\.([a-z0-9]{1,8})$/i.exec(nome);
  return m === null ? '' : m[1]!.toLowerCase();
}

export function ehPrograma(nome: string): boolean {
  return PROGRAMAS.has(extensaoDe(nome));
}

export function renderArquivo(anexo: Attachment): HTMLElement {
  const ext = extensaoDe(anexo.fileName);
  const etiqueta = ext === '' ? 'ARQ' : ext.slice(0, 4).toUpperCase();
  const cor = CORES[ext] ?? (PROGRAMAS.has(ext) ? '#3e63dd' : '#6e56cf');
  const tipo = NOMES[ext] ?? (PROGRAMAS.has(ext) ? 'Programa' : etiqueta);
  const baixar = el(
    'a',
    {
      class: 'arquivo__baixar',
      href: anexo.url,
      target: '_blank',
      rel: 'noopener noreferrer',
      download: anexo.fileName,
      title: 'Baixar',
      'aria-label': `Baixar ${anexo.fileName}`,
    },
    [iconEl(downloadIcon(18))],
  );
  return el('div', { class: 'arquivo' }, [
    el('div', { class: 'arquivo__cartao' }, [
      el('span', { class: 'arquivo__tipo', style: `background-color:${cor}`, 'aria-hidden': 'true' }, [etiqueta]),
      el('span', { class: 'arquivo__info' }, [
        el('b', { class: 'arquivo__nome', title: anexo.fileName }, [anexo.fileName]),
        el('small', {}, [`${formatBytes(anexo.sizeBytes)} · ${tipo}`]),
      ]),
      baixar,
    ]),
    PROGRAMAS.has(ext) &&
      el('p', { class: 'arquivo__aviso' }, [iconEl(alertIcon(15)), 'Programa: só abra se você confia em quem mandou.']),
  ]);
}
