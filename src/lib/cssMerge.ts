// Fusionar dos hojas de estilo sin pisar lo que ya había.
//
// Reemplazar la hoja del libro por la de la plantilla es rápido pero se lleva
// por delante lo que el autor hubiera escrito a mano. Fusionar es lo que uno
// esperaría: lo del libro manda, y de la plantilla solo entra lo que el libro
// no tenía.
//
// La comparación es por selector, no por contenido: si el libro ya dice algo
// sobre `p`, su regla se queda y la de la plantilla se descarta entera. Mezclar
// propiedad a propiedad daría resultados impredecibles —el orden y la
// especificidad cambian el significado— y aquí vale más ser aburrido.

export interface Chunk {
  /** Clave por la que se decide si es «lo mismo» que otro trozo. */
  key: string
  text: string
}

/**
 * Parte una hoja en trozos de primer nivel: comentarios, reglas y at-rules.
 * No se interpreta nada de dentro de las llaves.
 */
export function chunks(css: string): Chunk[] {
  const out: Chunk[] = []
  let i = 0

  while (i < css.length) {
    // Espacio en blanco entre trozos: se descarta, luego se reconstruye.
    const ws = css.slice(i).match(/^\s+/)
    if (ws) { i += ws[0].length; continue }

    if (css.startsWith('/*', i)) {
      const end = css.indexOf('*/', i + 2)
      const stop = end < 0 ? css.length : end + 2
      out.push({ key: `comentario:${out.length}`, text: css.slice(i, stop) })
      i = stop
      continue
    }

    // At-rules sin bloque: @charset, @import…
    if (css[i] === '@') {
      const semi = css.indexOf(';', i)
      const brace = css.indexOf('{', i)
      if (semi >= 0 && (brace < 0 || semi < brace)) {
        out.push({ key: normalize(css.slice(i, semi)), text: css.slice(i, semi + 1) })
        i = semi + 1
        continue
      }
    }

    const brace = css.indexOf('{', i)
    if (brace < 0) {
      const rest = css.slice(i).trim()
      if (rest) out.push({ key: `resto:${out.length}`, text: rest })
      break
    }

    const end = closing(css, brace)
    out.push({ key: normalize(css.slice(i, brace)), text: css.slice(i, end + 1) })
    i = end + 1
  }

  return out
}

/** Dónde cierra la llave que abre en `open`, contando las de dentro. */
function closing(css: string, open: number): number {
  let depth = 0
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++
    else if (css[i] === '}' && --depth === 0) return i
  }
  return css.length - 1
}

/** «p.capitular ,  h1» y «h1, p.capitular» son el mismo selector. */
function normalize(prelude: string): string {
  return prelude
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(',')
    .map(s => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .sort()
    .join(',')
}

/**
 * Añade a la hoja del libro las reglas de la plantilla que no colisionan.
 * Devuelve la hoja nueva y cuántas reglas entraron.
 */
export function mergeCss(bookCss: string, templateCss: string): { css: string; added: number } {
  const mine = chunks(bookCss)
  const theirs = chunks(templateCss)
  const seen = new Set(mine.filter(c => !c.key.startsWith('comentario:') && !c.key.startsWith('resto:')).map(c => c.key))

  const nuevos = theirs.filter(c => {
    if (c.key.startsWith('comentario:') || c.key.startsWith('resto:')) return false
    if (seen.has(c.key)) return false
    seen.add(c.key)
    return true
  })

  if (!nuevos.length) return { css: bookCss, added: 0 }

  const header = '/* === de la plantilla === */'
  const body = nuevos.map(c => c.text).join('\n\n')
  return {
    css: `${bookCss.replace(/\s*$/, '\n\n')}${header}\n\n${body}\n`,
    added: nuevos.length,
  }
}
