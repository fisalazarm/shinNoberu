// Archivos abiertos recientemente.
//
// No es solo una lista de nombres: en el navegador se guarda el asidero del
// archivo (IndexedDB sí sabe clonarlos, localStorage no), así que un reciente
// se vuelve a abrir de verdad. En Tauri basta con la ruta.
//
// Solo se recuerda lo que se puede reabrir: una entrada que al pulsarla no
// hiciera nada sería peor que no tenerla.

import { RECENTS, run } from './db'
import { readHandle, setSaveTarget, type FileHandle } from './fileIO'

const KEY = '__list'
const MAX = 8

export interface RecentFile {
  /** Ruta en Tauri, o el nombre en el navegador. */
  id: string
  name: string
  openedAt: number
  path?: string
  handle?: FileHandle
}

export interface RecentOpened {
  bytes: Uint8Array
  name: string
  path?: string
}

async function read(): Promise<RecentFile[]> {
  try {
    return (await run<RecentFile[] | undefined>(RECENTS, 'readonly', s => s.get(KEY))) ?? []
  } catch {
    return []
  }
}

const write = (list: RecentFile[]) => run(RECENTS, 'readwrite', s => s.put(list, KEY))

export async function listRecents(): Promise<RecentFile[]> {
  return (await read()).sort((a, b) => b.openedAt - a.openedAt)
}

/** Apunta un libro recién abierto. Sin ruta ni asidero no se guarda nada. */
export async function rememberRecent(entry: {
  name: string
  path?: string
  handle?: FileHandle | null
}): Promise<void> {
  if (!entry.path && !entry.handle) return
  const id = entry.path ?? entry.name
  try {
    const rest = (await read()).filter(r => r.id !== id)
    const next: RecentFile = {
      id,
      name: entry.name,
      openedAt: Date.now(),
      path: entry.path,
      handle: entry.handle ?? undefined,
    }
    await write([next, ...rest].slice(0, MAX))
  } catch { /* sin IndexedDB: se vive sin recientes */ }
}

export async function forgetRecents(): Promise<void> {
  try { await write([]) } catch { /* ignorar */ }
}

export async function forgetRecent(id: string): Promise<void> {
  try { await write((await read()).filter(r => r.id !== id)) } catch { /* ignorar */ }
}

/**
 * Vuelve a leer un reciente. Devuelve null si ya no se puede: el archivo se
 * movió, o el usuario no dio permiso otra vez.
 */
export async function openRecent(r: RecentFile): Promise<RecentOpened | null> {
  if (r.handle) {
    const bytes = await readHandle(r.handle)
    if (!bytes) return null
    setSaveTarget(r.handle) // Guardar vuelve a escribir en ese mismo archivo
    return { bytes, name: r.name, path: r.name }
  }
  if (r.path) {
    try {
      const { readFile } = await import('@tauri-apps/plugin-fs')
      return { bytes: await readFile(r.path), name: r.name, path: r.path }
    } catch {
      return null
    }
  }
  return null
}
