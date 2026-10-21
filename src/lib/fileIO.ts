// Abrir/guardar archivos, con tres caminos según dónde corra la app:
//
//  1. Tauri: diálogos nativos y sistema de archivos.
//  2. Navegador con File System Access (Edge, Chrome): se guarda el asidero del
//     archivo abierto y «Guardar» escribe encima, como un IDE.
//  3. El resto (Firefox, Safari): <input type=file> y descargas.

import { isTauri } from '@tauri-apps/api/core'

export interface OpenedFile {
  name: string
  /** Ruta en Tauri; en el navegador, solo el nombre, como marca de destino. */
  path?: string
  bytes: Uint8Array
}

export interface SaveResult {
  /** `false` si el usuario canceló el diálogo: entonces nada se ha escrito. */
  saved: boolean
  path?: string
}

interface PickerOptions {
  suggestedName?: string
  types?: { description: string; accept: Record<string, string[]> }[]
}

/** El tipo del DOM no incluye los permisos, que esta API sí necesita. */
export interface FileHandle extends FileSystemFileHandle {
  queryPermission?(o: { mode: 'read' | 'readwrite' }): Promise<PermissionState>
  requestPermission?(o: { mode: 'read' | 'readwrite' }): Promise<PermissionState>
}

declare global {
  interface Window {
    showOpenFilePicker?(o?: PickerOptions & { multiple?: boolean }): Promise<FileHandle[]>
    showSaveFilePicker?(o?: PickerOptions): Promise<FileHandle>
  }
}

const EPUB_TYPE = {
  description: 'EPUB',
  accept: { 'application/epub+zip': ['.epub'] },
}

export const inTauri = () => isTauri()

const hasFsAccess = () => typeof window !== 'undefined' && !!window.showSaveFilePicker

/** Si al pulsar Guardar se escribe encima del archivo o se descarga una copia. */
export const canSaveInPlace = () => inTauri() || hasFsAccess()

/** Asidero del .epub abierto en el navegador; en Tauri manda la ruta. */
let handle: FileHandle | null = null

/** Se llama al empezar un libro nuevo o al abrir uno sin asidero. */
export function forgetTarget() {
  handle = null
}

/** El asidero del libro abierto, para poder guardarlo en los recientes. */
export function currentHandle(): FileHandle | null {
  return handle
}

/** Lo toma como destino de Guardar (al abrir un reciente). */
export function setSaveTarget(h: FileHandle) {
  handle = h
}

/**
 * ¿Se puede leer o escribir en este asidero?
 *
 * Un asidero sin API de permisos no es uno denegado: los del almacén privado
 * del origen no la traen porque no hacen falta. Pedir permiso tiene que salir
 * de un gesto del usuario, y abrir o guardar lo son.
 */
async function allowed(h: FileHandle, mode: 'read' | 'readwrite'): Promise<boolean> {
  if (!h.queryPermission && !h.requestPermission) return true
  const opts = { mode } as const
  if ((await h.queryPermission?.(opts)) === 'granted') return true
  return (await h.requestPermission?.(opts)) === 'granted'
}

/**
 * Lee un asidero guardado de otra sesión. El permiso caduca al cerrar el
 * navegador, así que suele haber que volver a concederlo.
 */
export async function readHandle(h: FileHandle): Promise<Uint8Array | null> {
  try {
    if (!(await allowed(h, 'read'))) return null
    const file = await h.getFile()
    return new Uint8Array(await file.arrayBuffer())
  } catch {
    return null // el archivo se movió o se borró
  }
}

export async function pickEpub(): Promise<OpenedFile | null> {
  if (inTauri()) {
    const { open } = await import('@tauri-apps/plugin-dialog')
    const { readFile } = await import('@tauri-apps/plugin-fs')
    const path = await open({ multiple: false, filters: [{ name: 'EPUB', extensions: ['epub'] }] })
    if (!path) return null
    return { name: path.split(/[\\/]/).pop()!, path, bytes: await readFile(path) }
  }

  if (window.showOpenFilePicker) {
    try {
      const [picked] = await window.showOpenFilePicker({ types: [EPUB_TYPE], multiple: false })
      if (!picked) return null
      handle = picked
      const file = await picked.getFile()
      return { name: picked.name, path: picked.name, bytes: new Uint8Array(await file.arrayBuffer()) }
    } catch {
      return null // el usuario cerró el diálogo
    }
  }

  forgetTarget()
  const [file] = await pickBrowserFiles('.epub', false)
  return file ?? null
}

export async function pickFiles(accept: string): Promise<OpenedFile[]> {
  if (inTauri()) {
    const { open } = await import('@tauri-apps/plugin-dialog')
    const { readFile } = await import('@tauri-apps/plugin-fs')
    const exts = accept.split(',').map(e => e.trim().replace(/^\./, ''))
    const res = await open({ multiple: true, filters: [{ name: 'Archivos', extensions: exts }] })
    const paths = res ? (Array.isArray(res) ? res : [res]) : []
    return Promise.all(
      paths.map(async p => ({ name: p.split(/[\\/]/).pop()!, path: p, bytes: await readFile(p) })),
    )
  }
  // Para imágenes y hojas de estilo basta con leerlas.
  return pickBrowserFiles(accept, true)
}

/**
 * Guarda el EPUB. Con `path` escribe encima de lo que ya hay; sin él pregunta
 * dónde (Guardar como). Devuelve si llegó a escribirse.
 */
export async function saveEpubFile(bytes: Uint8Array, name: string, path?: string): Promise<SaveResult> {
  if (inTauri()) {
    const { save } = await import('@tauri-apps/plugin-dialog')
    const { writeFile } = await import('@tauri-apps/plugin-fs')
    const target = path ?? (await save({ defaultPath: name, filters: [{ name: 'EPUB', extensions: ['epub'] }] }))
    if (!target) return { saved: false }
    await writeFile(target, bytes)
    return { saved: true, path: target }
  }

  if (hasFsAccess()) {
    let target = path ? handle : null
    if (target && !(await allowed(target, 'readwrite'))) target = null // denegado: preguntar
    if (!target) {
      try {
        target = (await window.showSaveFilePicker!({ suggestedName: name, types: [EPUB_TYPE] })) ?? null
      } catch {
        return { saved: false } // cancelado
      }
      if (!target) return { saved: false }
      handle = target
    }
    const stream = await target.createWritable()
    await stream.write(bytes as BlobPart)
    await stream.close()
    return { saved: true, path: target.name }
  }

  const blob = new Blob([bytes as BlobPart], { type: 'application/epub+zip' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  return { saved: true }
}

function pickBrowserFiles(accept: string, multiple: boolean): Promise<OpenedFile[]> {
  return new Promise(resolve => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.multiple = multiple
    input.onchange = async () => {
      const files = [...(input.files ?? [])]
      resolve(
        await Promise.all(
          files.map(async f => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })),
        ),
      )
    }
    input.oncancel = () => resolve([])
    input.click()
  })
}

/**
 * Guarda un archivo de texto suelto (plantillas exportadas, por ahora).
 *
 * No reutiliza `saveEpubFile` porque aquel recuerda el asidero del EPUB
 * abierto: escribir aquí encima dejaría el libro apuntando a otro archivo.
 */
export async function saveTextFile(text: string, name: string): Promise<boolean> {
  if (inTauri()) {
    const { save } = await import('@tauri-apps/plugin-dialog')
    const { writeTextFile } = await import('@tauri-apps/plugin-fs')
    const ext = name.split('.').pop() ?? 'json'
    const target = await save({ defaultPath: name, filters: [{ name: ext.toUpperCase(), extensions: [ext] }] })
    if (!target) return false
    await writeTextFile(target, text)
    return true
  }

  if (window.showSaveFilePicker) {
    try {
      const picked = await window.showSaveFilePicker({ suggestedName: name })
      if (!picked) return false
      const stream = await picked.createWritable()
      await stream.write(text)
      await stream.close()
      return true
    } catch {
      return false // cancelado
    }
  }

  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  return true
}
