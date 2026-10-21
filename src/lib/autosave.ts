// Borrador automático en IndexedDB.
//
// Antes, si se cerraba el navegador se perdía todo: `beforeunload` solo avisa.
// Aquí se guarda el libro entero cada pocos segundos y al arrancar se ofrece
// recuperarlo. IndexedDB almacena Map y Uint8Array tal cual (clonado
// estructurado), así que el libro se guarda sin convertirlo a nada.

import type { EpubBook, EpubFile } from './epub'
import { DRAFTS, run } from './db'

/** Solo hay un borrador: el del libro que se está editando. */
const KEY = 'current'
/** Por encima de esto no se guarda: el clonado bloquearía la interfaz. */
const MAX_BYTES = 120 * 1024 * 1024

export interface Draft {
  fileName: string
  savePath?: string
  opfPath: string
  files: Map<string, EpubFile>
  active: string
  savedAt: number
}

/** Tamaño aproximado del libro, para no intentar guardar algo enorme. */
export function bookBytes(book: EpubBook): number {
  let n = 0
  for (const f of book.files.values()) n += f.bytes?.byteLength ?? (f.text?.length ?? 0) * 2
  return n
}

export async function saveDraft(draft: Draft): Promise<boolean> {
  try {
    await run(DRAFTS, 'readwrite', s => s.put(draft, KEY))
    return true
  } catch {
    return false // sin cuota o sin IndexedDB: el aviso de `beforeunload` sigue ahí
  }
}

export async function loadDraft(): Promise<Draft | null> {
  try {
    const d = await run<Draft | undefined>(DRAFTS, 'readonly', s => s.get(KEY))
    return d && d.files instanceof Map && d.files.size ? d : null
  } catch {
    return null
  }
}

export async function clearDraft(): Promise<void> {
  try {
    await run(DRAFTS, 'readwrite', s => s.delete(KEY))
  } catch { /* ignorar */ }
}

export function draftToBook(d: Draft): EpubBook {
  return { files: d.files, opfPath: d.opfPath }
}

export function bookToDraft(
  book: EpubBook,
  meta: { fileName: string; savePath?: string; active: string },
): Draft | null {
  if (bookBytes(book) > MAX_BYTES) return null
  return { ...meta, opfPath: book.opfPath, files: book.files, savedAt: Date.now() }
}

/** "hace 3 minutos", para el diálogo de recuperación. */
export function timeAgo(ts: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ts) / 1000))
  if (s < 60) return 'hace unos segundos'
  const m = Math.round(s / 60)
  if (m < 60) return `hace ${m} minuto${m === 1 ? '' : 's'}`
  const h = Math.round(m / 60)
  if (h < 24) return `hace ${h} hora${h === 1 ? '' : 's'}`
  const d = Math.round(h / 24)
  return `hace ${d} día${d === 1 ? '' : 's'}`
}
