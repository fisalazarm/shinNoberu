// Comparar dos versiones de un archivo, por líneas.
//
// No hace falta un diff bonito: basta con saber cuánto se movió cada archivo
// respecto a un punto de control. Se recortan el principio y el final comunes
// —que en un libro suelen ser casi todo— y solo el resto pasa por el LCS, con
// un tope para que un archivo enorme y muy cambiado no congele la pestaña.

const BUDGET = 4_000_000 // celdas de la tabla; ~2000 × 2000 líneas

export interface LineDiff {
  added: number
  removed: number
  /** El archivo era demasiado grande y distinto: las cifras son una cota. */
  approximate?: boolean
}

/**
 * El salto final no es una línea más: sin esto, un archivo vacío contaría como
 * una línea y terminar en salto o no se vería como un cambio.
 */
function lines(s: string): string[] {
  const out = s.split('\n')
  if (out.length && out[out.length - 1] === '') out.pop()
  return out
}

export function lineDiff(before: string, after: string): LineDiff {
  if (before === after) return { added: 0, removed: 0 }

  const a = lines(before)
  const b = lines(after)

  // Prefijo y sufijo comunes.
  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start++
  let endA = a.length
  let endB = b.length
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB-- }

  const left = a.slice(start, endA)
  const right = b.slice(start, endB)
  if (!left.length) return { added: right.length, removed: 0 }
  if (!right.length) return { added: 0, removed: left.length }

  if (left.length * right.length > BUDGET) {
    // Sin tabla: se cuenta cuántas líneas de cada lado no están en el otro.
    const inRight = new Set(right)
    const inLeft = new Set(left)
    return {
      removed: left.filter(l => !inRight.has(l)).length,
      added: right.filter(l => !inLeft.has(l)).length,
      approximate: true,
    }
  }

  // Longitud de la subsecuencia común más larga, por filas para no guardar
  // toda la tabla.
  let prev = new Uint32Array(right.length + 1)
  let cur = new Uint32Array(right.length + 1)
  for (let i = 1; i <= left.length; i++) {
    for (let j = 1; j <= right.length; j++) {
      cur[j] = left[i - 1] === right[j - 1]
        ? prev[j - 1] + 1
        : Math.max(prev[j], cur[j - 1])
    }
    const tmp = prev
    prev = cur
    cur = tmp
    cur.fill(0)
  }

  const common = prev[right.length]
  return { added: right.length - common, removed: left.length - common }
}

export type FileChange = 'added' | 'removed' | 'changed'

export interface BookChange {
  path: string
  kind: FileChange
  diff?: LineDiff
}

/** Qué ha cambiado entre dos juegos de archivos. */
export function compareFiles(
  before: Map<string, { text?: string; bytes?: Uint8Array }>,
  after: Map<string, { text?: string; bytes?: Uint8Array }>,
): BookChange[] {
  const out: BookChange[] = []

  for (const [path, old] of before) {
    const now = after.get(path)
    if (!now) {
      out.push({ path, kind: 'removed' })
      continue
    }
    if (old.text != null && now.text != null) {
      if (old.text === now.text) continue
      out.push({ path, kind: 'changed', diff: lineDiff(old.text, now.text) })
      continue
    }
    // Binarios: solo se mira si cambió el tamaño.
    if ((old.bytes?.byteLength ?? 0) !== (now.bytes?.byteLength ?? 0)) {
      out.push({ path, kind: 'changed' })
    }
  }

  for (const path of after.keys()) {
    if (!before.has(path)) out.push({ path, kind: 'added' })
  }

  const rank: Record<FileChange, number> = { changed: 0, added: 1, removed: 2 }
  return out.sort((x, y) => rank[x.kind] - rank[y.kind] || x.path.localeCompare(y.path))
}
