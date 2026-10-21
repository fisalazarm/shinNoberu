// Conteo de palabras del texto visible (sin etiquetas ni llamadas a nota).

import { spinePaths, type EpubBook } from './epub'
import { navItemPath, plainText } from './structure'

/** Solo el cuerpo: el <title> del <head> no es texto del libro. */
function bodyOf(xhtml: string): string {
  const open = xhtml.match(/<body\b[^>]*>/i)
  const close = xhtml.lastIndexOf('</body>')
  if (!open || open.index == null || close < 0) return xhtml
  return xhtml.slice(open.index + open[0].length, close)
}

export function countWords(xhtml: string): number {
  const body = bodyOf(xhtml).replace(/<(style|script)\b[\s\S]*?<\/\1\s*>/gi, '')
  const text = plainText(body)
  if (!text) return 0
  // Los signos sueltos (rayas de diálogo, ◇) no son palabras.
  return text.split(/\s+/).filter(w => /[\p{L}\p{N}]/u.test(w)).length
}

/** Palabras de todo el libro, siguiendo el orden de lectura. */
export function bookWords(book: EpubBook): number {
  const nav = navItemPath(book)
  let total = 0
  for (const path of spinePaths(book)) {
    if (path === nav) continue
    const text = book.files.get(path)?.text
    if (text != null) total += countWords(text)
  }
  return total
}
