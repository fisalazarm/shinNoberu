// Puntos de control: instantáneas del libro que se pueden restaurar.
//
// El borrador automático te salva de un cierre inesperado; esto te salva de ti
// mismo, cuando un reemplazo masivo o un «partir capítulo» sale al revés.
//
// El índice vive bajo una clave fija del mismo almacén para poder listarlos sin
// cargar los libros enteros: IndexedDB no sabe leer un registro a medias.

import { CHECKPOINTS, run } from './db'
import { bookBytes } from './autosave'
import { bookWords } from './words'
import type { EpubBook, EpubFile } from './epub'

const INDEX_KEY = '__index'
/** Por encima de esto se tira el más viejo. */
const MAX = 20
const MAX_BYTES = 120 * 1024 * 1024

export interface CheckpointMeta {
  id: string
  label: string
  savedAt: number
  fileName: string
  files: number
  words: number
  bytes: number
  /** Lo creó la app antes de una operación masiva, no el usuario. */
  auto?: boolean
}

interface Stored {
  meta: CheckpointMeta
  opfPath: string
  files: Map<string, EpubFile>
}

const readIndex = async (): Promise<CheckpointMeta[]> => {
  try {
    return (await run<CheckpointMeta[] | undefined>(CHECKPOINTS, 'readonly', s => s.get(INDEX_KEY))) ?? []
  } catch {
    return []
  }
}

const writeIndex = (list: CheckpointMeta[]) =>
  run(CHECKPOINTS, 'readwrite', s => s.put(list, INDEX_KEY))

/** Los puntos de control guardados, del más reciente al más antiguo. */
export async function listCheckpoints(): Promise<CheckpointMeta[]> {
  return (await readIndex()).sort((a, b) => b.savedAt - a.savedAt)
}

export async function createCheckpoint(
  book: EpubBook,
  label: string,
  fileName: string,
  auto = false,
): Promise<CheckpointMeta | null> {
  const bytes = bookBytes(book)
  if (bytes > MAX_BYTES) return null

  const meta: CheckpointMeta = {
    id: `cp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    label: label.trim() || 'Sin nombre',
    savedAt: Date.now(),
    fileName,
    files: book.files.size,
    words: bookWords(book),
    bytes,
    auto: auto || undefined,
  }

  try {
    const stored: Stored = { meta, opfPath: book.opfPath, files: new Map(book.files) }
    await run(CHECKPOINTS, 'readwrite', s => s.put(stored, meta.id))

    const index = [...(await readIndex()), meta].sort((a, b) => b.savedAt - a.savedAt)
    for (const old of index.slice(MAX)) {
      await run(CHECKPOINTS, 'readwrite', s => s.delete(old.id))
    }
    await writeIndex(index.slice(0, MAX))
    return meta
  } catch {
    return null // sin cuota: no es motivo para romper nada
  }
}

/** Devuelve una copia del libro guardado, o null si ya no está. */
export async function restoreCheckpoint(id: string): Promise<EpubBook | null> {
  try {
    const stored = await run<Stored | undefined>(CHECKPOINTS, 'readonly', s => s.get(id))
    if (!stored?.files) return null
    return { files: new Map(stored.files), opfPath: stored.opfPath }
  } catch {
    return null
  }
}

export async function deleteCheckpoint(id: string): Promise<void> {
  try {
    await run(CHECKPOINTS, 'readwrite', s => s.delete(id))
    await writeIndex((await readIndex()).filter(m => m.id !== id))
  } catch { /* ignorar */ }
}

/** Los archivos guardados en un punto de control, para poder compararlos. */
export async function checkpointFiles(id: string): Promise<Map<string, EpubFile> | null> {
  const book = await restoreCheckpoint(id)
  return book ? book.files : null
}

/** Nombre por defecto: la hora, que es lo que ayuda a reconocerlo. */
export function defaultLabel(now = new Date()): string {
  const dd = (n: number) => String(n).padStart(2, '0')
  return `${dd(now.getDate())}/${dd(now.getMonth() + 1)} ${dd(now.getHours())}:${dd(now.getMinutes())}`
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} kB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

/** Cómo ha cambiado el libro desde ese punto. */
export function describeDelta(meta: CheckpointMeta, now: { files: number; words: number }): string {
  const dw = now.words - meta.words
  const df = now.files - meta.files
  const parts: string[] = []
  if (dw) parts.push(`${dw > 0 ? '+' : '−'}${Math.abs(dw).toLocaleString()} palabras`)
  if (df) parts.push(`${df > 0 ? '+' : '−'}${Math.abs(df)} archivo${Math.abs(df) === 1 ? '' : 's'}`)
  return parts.length ? `${parts.join(' · ')} desde entonces` : 'Igual que ahora'
}
