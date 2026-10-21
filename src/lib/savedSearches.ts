// Búsquedas guardadas.
//
// En una novela los mismos arreglos se repiten libro tras libro: comillas
// rectas, tres puntos, espacios de más. Escribir la regex cada vez es la parte
// cansada y la parte en la que uno se equivoca, así que se guardan con nombre.
//
// Las de fábrica no se pueden borrar ni cambiar: están pensadas para el
// castellano y son el ejemplo de cómo se escriben las propias.

import { defaultSearchOptions, type SearchOptions } from './searchBook'

export interface SavedSearch {
  name: string
  options: SearchOptions
  replacement: string
  /** Viene con la app: se puede usar y copiar, no borrar. */
  builtin?: boolean
}

const STORAGE_KEY = 'epub-editor.searches'

const preset = (
  name: string,
  query: string,
  replacement: string,
  patch: Partial<SearchOptions> = {},
): SavedSearch => ({
  name,
  replacement,
  builtin: true,
  options: { ...defaultSearchOptions, query, regex: true, ...patch },
})

/**
 * Las de fábrica. Todas respetan «solo el texto», que es lo que las hace
 * seguras: ninguna puede entrar en un href ni en un xmlns.
 */
export const builtinSearches: SavedSearch[] = [
  preset('Comillas rectas → latinas', '"([^"]*)"', '«$1»'),
  preset('Apóstrofo recto → tipográfico', "'", '’', { regex: false }),
  preset('Tres puntos → puntos suspensivos', String.raw`\.\.\.`, '…'),
  // La sangría del XHTML también es texto entre etiquetas: el lookbehind y el
  // lookahead la dejan en paz y solo tocan los espacios de dentro de la frase.
  preset('Espacios dobles', String.raw`(?<=\S) {2,}(?![ \t]*\n)`, ' '),
  preset('Espacio antes de puntuación', ' +([,;:.!?])', '$1'),
  // `^` cae justo después de una etiqueta, porque cada tramo de texto empieza
  // ahí: así solo se cambia el guion que abre el párrafo, no los de dentro.
  preset('Guion de diálogo → raya', '^[-–] *', '—'),
]

function readUser(): SavedSearch[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (!saved) return []
    const list = JSON.parse(saved)
    if (!Array.isArray(list)) return []
    return list
      .filter((s): s is SavedSearch => !!s && typeof s.name === 'string' && !!s.options)
      .map(s => ({
        name: s.name,
        replacement: typeof s.replacement === 'string' ? s.replacement : '',
        // Una búsqueda guardada con una versión vieja puede no traer todas las
        // opciones; las que falten son las de siempre.
        options: { ...defaultSearchOptions, ...s.options },
      }))
  } catch {
    return []
  }
}

function writeUser(list: SavedSearch[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)) } catch { /* sin almacenamiento */ }
}

/** Las propias primero: son las que el usuario va a querer a mano. */
export function loadSearches(): SavedSearch[] {
  return [...readUser(), ...builtinSearches]
}

/** Guarda o reemplaza una por nombre. Devuelve la lista ya completa. */
export function saveSearch(name: string, options: SearchOptions, replacement: string): SavedSearch[] {
  const clean = name.trim()
  if (!clean) return loadSearches()
  const entry: SavedSearch = { name: clean, options: { ...options }, replacement }
  const user = readUser().filter(s => s.name !== clean)
  writeUser([entry, ...user])
  return loadSearches()
}

/** Borra una propia. Las de fábrica se quedan donde están. */
export function deleteSearch(name: string): SavedSearch[] {
  writeUser(readUser().filter(s => s.name !== name))
  return loadSearches()
}
