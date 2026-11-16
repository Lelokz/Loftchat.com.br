import { deleteField, doc, onSnapshot, setDoc } from 'firebase/firestore';

import { db } from './firebase';

/**
 * PREFERÊNCIAS PRIVADAS da conta (`userPrivate/{uid}`), escutadas AO VIVO:
 * mudar no PC aparece no celular sem recarregar. Só a própria pessoa lê e
 * escreve (firestore.rules).
 *
 *  - `welcomeSeen.{groupId}: true` — boas-vindas já dispensadas (etapa 3c);
 *  - `groupLabels.{groupId}` — como EU chamo o grupo na aba (etapa 3d):
 *    um apelido, ou '' para "sem nome" (só o ícone). Ausente = o nome do grupo;
 *  - `tabMode` — o jeito das abas (etapa 4a): todas com nome, só ícones, ou
 *    só a aberta com nome;
 *  - `groupOrder` — a ordem das abas que EU escolhi (etapa 4a). Grupo que
 *    não está na lista (entrou depois) vai para o fim;
 *  - `groupFolders` — pastas de grupos (etapa 4b): nome, cor e quais grupos.
 *    A ORDEM dos grupos dentro da pasta é a de `groupOrder`, e a pasta fica
 *    na barra no lugar do primeiro grupo dela — uma ordem só, sem duas
 *    listas para desencontrar.
 */

export const MAX_FOLDERS = 20;
export const MAX_FOLDER_NAME = 24;

export interface GroupFolder {
  id: string;
  name: string;
  /** Lista fechada da cor do cartão (lib/person-theme.ts). */
  color: string;
  groupIds: string[];
}

export const TAB_MODES = ['nomes', 'icones', 'aberto'] as const;
export type TabMode = (typeof TAB_MODES)[number];

export const MAX_GROUP_LABEL = 32;

export interface PrivatePrefs {
  welcomeSeen: Set<string>;
  groupLabels: Map<string, string>;
  tabMode: TabMode;
  groupOrder: string[];
  groupFolders: GroupFolder[];
}

export const EMPTY_PREFS: PrivatePrefs = {
  welcomeSeen: new Set(),
  groupLabels: new Map(),
  tabMode: 'nomes',
  groupOrder: [],
  groupFolders: [],
};

/** Lê as pastas com cuidado: um grupo só pode estar numa pasta. */
export function parseFolders(raw: unknown): GroupFolder[] {
  if (!Array.isArray(raw)) return [];
  const usados = new Set<string>();
  const ids = new Set<string>();
  const pastas: GroupFolder[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const r = item as Record<string, unknown>;
    const id = r['id'];
    if (typeof id !== 'string' || id === '' || ids.has(id)) continue;
    const name = typeof r['name'] === 'string' ? r['name'].slice(0, MAX_FOLDER_NAME) : 'Pasta';
    const color = typeof r['color'] === 'string' ? r['color'] : 'roxo';
    const groupIds = Array.isArray(r['groupIds'])
      ? r['groupIds'].filter((g): g is string => typeof g === 'string' && !usados.has(g))
      : [];
    for (const g of groupIds) usados.add(g);
    ids.add(id);
    pastas.push({ id, name, color, groupIds });
    if (pastas.length === MAX_FOLDERS) break;
  }
  return pastas;
}

export async function saveFolders(uid: string, folders: GroupFolder[]): Promise<void> {
  await setDoc(
    doc(db, 'userPrivate', uid),
    { groupFolders: folders.map((f) => ({ id: f.id, name: f.name.trim().slice(0, MAX_FOLDER_NAME), color: f.color, groupIds: f.groupIds })) },
    { merge: true },
  );
}

/** Um item da barra: um grupo solto, ou uma pasta com os grupos dela (na minha ordem). */
export type BarItem<T> = { kind: 'group'; group: T } | { kind: 'folder'; folder: GroupFolder; groups: T[] };

/**
 * Monta a barra: grupos na minha ordem; a pasta entra no lugar do primeiro
 * grupo dela. Pasta sem nenhum grupo meu (saí de todos) não aparece.
 */
export function barItems<T extends { id: string }>(ordered: T[], folders: GroupFolder[]): BarItem<T>[] {
  const pastaDe = new Map<string, GroupFolder>();
  for (const f of folders) for (const g of f.groupIds) pastaDe.set(g, f);
  const itens: BarItem<T>[] = [];
  const jaPos = new Set<string>();
  for (const group of ordered) {
    const pasta = pastaDe.get(group.id);
    if (pasta === undefined) {
      itens.push({ kind: 'group', group });
      continue;
    }
    if (jaPos.has(pasta.id)) continue;
    jaPos.add(pasta.id);
    const membros = new Set(pasta.groupIds);
    itens.push({ kind: 'folder', folder: pasta, groups: ordered.filter((g) => membros.has(g.id)) });
  }
  return itens;
}

export function watchPrivatePrefs(uid: string, onPrefs: (prefs: PrivatePrefs) => void): () => void {
  return onSnapshot(
    doc(db, 'userPrivate', uid),
    (snap) => {
      const vistos = snap.exists() ? snap.get('welcomeSeen') : undefined;
      const rotulos = snap.exists() ? snap.get('groupLabels') : undefined;
      const welcomeSeen = new Set<string>();
      const groupLabels = new Map<string, string>();
      if (typeof vistos === 'object' && vistos !== null) {
        for (const [id, v] of Object.entries(vistos as Record<string, unknown>)) if (v === true) welcomeSeen.add(id);
      }
      if (typeof rotulos === 'object' && rotulos !== null) {
        for (const [id, v] of Object.entries(rotulos as Record<string, unknown>)) {
          if (typeof v === 'string') groupLabels.set(id, v.slice(0, MAX_GROUP_LABEL));
        }
      }
      const modo = snap.exists() ? snap.get('tabMode') : undefined;
      const tabMode: TabMode = TAB_MODES.includes(modo as TabMode) ? (modo as TabMode) : 'nomes';
      const ordem = snap.exists() ? snap.get('groupOrder') : undefined;
      const groupOrder = Array.isArray(ordem) ? ordem.filter((id): id is string => typeof id === 'string').slice(0, 500) : [];
      const groupFolders = parseFolders(snap.exists() ? snap.get('groupFolders') : undefined);
      onPrefs({ welcomeSeen, groupLabels, tabMode, groupOrder, groupFolders });
    },
    // Sem rede ou sem permissão: segue com tudo vazio (nada quebra).
    () => onPrefs({ ...EMPTY_PREFS, welcomeSeen: new Set(), groupLabels: new Map(), groupFolders: [] }),
  );
}

/**
 * Grava os rótulos que mudaram: texto = apelido, '' = sem nome, null = voltar
 * ao nome do grupo (apaga a chave).
 */
export async function saveGroupLabels(uid: string, mudancas: Map<string, string | null>): Promise<void> {
  if (mudancas.size === 0) return;
  const groupLabels: Record<string, unknown> = {};
  for (const [id, valor] of mudancas) groupLabels[id] = valor === null ? deleteField() : valor.trim().slice(0, MAX_GROUP_LABEL);
  await setDoc(doc(db, 'userPrivate', uid), { groupLabels }, { merge: true });
}

/** O nome que a aba mostra: apelido, o nome do grupo, ou null para só o ícone. */
export function tabLabel(groupName: string, label: string | undefined): string | null {
  if (label === undefined) return groupName;
  const limpo = label.trim();
  return limpo === '' ? null : limpo;
}

/** Grava o jeito e/ou a ordem das abas (etapa 4a). */
export async function saveTabPrefs(uid: string, prefs: { tabMode?: TabMode; groupOrder?: string[] }): Promise<void> {
  if (prefs.tabMode === undefined && prefs.groupOrder === undefined) return;
  await setDoc(doc(db, 'userPrivate', uid), prefs, { merge: true });
}

/** Os grupos na MINHA ordem; os que não estão na lista vão para o fim, na ordem de antes. */
export function sortGroups<T extends { id: string }>(groups: T[], order: string[]): T[] {
  const pos = new Map(order.map((id, i) => [id, i]));
  return groups
    .map((g, i) => ({ g, k: pos.get(g.id) ?? order.length + i }))
    .sort((a, b) => a.k - b.k)
    .map(({ g }) => g);
}
