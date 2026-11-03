// Palabras que el diccionario no conoce pero están bien: las tuyas, que valen
// para todos los libros («pingüino», que el diccionario libre no trae; tus
// muletillas, tu jerga), y las de un libro concreto (los nombres de lugares de
// esa novela, palabras inventadas).
//
// Se guardan en el navegador de la app. Las de cada libro van por su
// identificador, así que siguen ahí al volver a abrirlo.

import { readMetadata } from './metadata'
import type { EpubBook } from './epub'

const PERSONAL = 'epub-editor.diccionario'
const BOOK = 'epub-editor.diccionario.libro.'

function load(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key)
    const list = raw ? JSON.parse(raw) : []
    return new Set(Array.isArray(list) ? list.filter((w): w is string => typeof w === 'string') : [])
  } catch {
    return new Set()
  }
}

function save(key: string, words: Set<string>) {
  try {
    if (words.size) localStorage.setItem(key, JSON.stringify([...words].sort((a, b) => a.localeCompare(b))))
    else localStorage.removeItem(key)
  } catch { /* sin almacenamiento: se queda en memoria */ }
}

/** Con qué se reconoce el libro: su identificador, o su título si no tiene. */
export function bookKey(book: EpubBook): string | null {
  const m = readMetadata(book)
  const id = (m.identifier || m.title).trim()
  return id ? BOOK + id : null
}

export const loadPersonal = () => load(PERSONAL)
export const savePersonal = (w: Set<string>) => save(PERSONAL, w)

export function loadBookWords(book: EpubBook): Set<string> {
  const k = bookKey(book)
  return k ? load(k) : new Set()
}

export function saveBookWords(book: EpubBook, w: Set<string>) {
  const k = bookKey(book)
  if (k) save(k, w)
}
