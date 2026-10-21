// Nombre del carácter bajo el cursor, como la barra de estado de Sigil.
//
// No es una tabla Unicode completa: están los caracteres que de verdad dan
// problemas maquetando novelas —las tres rayas que parecen iguales, los seis
// espacios que parecen uno, las comillas de cada idioma— y el resto cae en
// «U+XXXX». Lo invisible se marca para que salte a la vista.

export interface CharInfo {
  char: string
  code: number
  /** Nombre en claro, p. ej. "raya" o "espacio duro". */
  label: string
  /** "U+2014" */
  hex: string
  /** No se ve en el editor: espacios raros, guiones blandos, marcas de orden. */
  invisible?: boolean
}

interface Entry { label: string; invisible?: boolean }

const NAMES: Record<number, Entry> = {
  0x0009: { label: 'tabulador', invisible: true },
  0x000a: { label: 'salto de línea', invisible: true },
  0x0020: { label: 'espacio' },
  0x0021: { label: 'cierre de exclamación' },
  0x0022: { label: 'comilla recta doble' },
  0x0027: { label: 'comilla recta simple' },
  0x002d: { label: 'guion' },
  0x00a0: { label: 'espacio duro', invisible: true },
  0x00a1: { label: 'apertura de exclamación' },
  0x00ab: { label: 'comilla latina de apertura' },
  0x00ad: { label: 'guion blando', invisible: true },
  0x00b0: { label: 'grado' },
  0x00b7: { label: 'punto medio' },
  0x00bb: { label: 'comilla latina de cierre' },
  0x00bf: { label: 'apertura de interrogación' },
  0x00aa: { label: 'ordinal femenino' },
  0x00ba: { label: 'ordinal masculino' },
  0x00d7: { label: 'signo de multiplicación' },
  0x2002: { label: 'espacio en', invisible: true },
  0x2003: { label: 'espacio em', invisible: true },
  0x2009: { label: 'espacio fino', invisible: true },
  0x200b: { label: 'espacio de ancho cero', invisible: true },
  0x200e: { label: 'marca de izquierda a derecha', invisible: true },
  0x200f: { label: 'marca de derecha a izquierda', invisible: true },
  0x2010: { label: 'guion tipográfico' },
  0x2011: { label: 'guion duro' },
  0x2012: { label: 'guion numeral' },
  0x2013: { label: 'semirraya' },
  0x2014: { label: 'raya' },
  0x2015: { label: 'raya horizontal' },
  0x2018: { label: 'comilla simple de apertura' },
  0x2019: { label: 'comilla simple de cierre' },
  0x201a: { label: 'comilla simple baja' },
  0x201c: { label: 'comilla inglesa de apertura' },
  0x201d: { label: 'comilla inglesa de cierre' },
  0x201e: { label: 'comilla inglesa baja' },
  0x2022: { label: 'bolo' },
  0x2026: { label: 'puntos suspensivos' },
  0x202f: { label: 'espacio duro estrecho', invisible: true },
  0x2039: { label: 'comilla latina simple de apertura' },
  0x203a: { label: 'comilla latina simple de cierre' },
  0x2122: { label: 'marca registrada' },
  0x2212: { label: 'signo menos' },
  0x25c6: { label: 'rombo relleno' },
  0x25c7: { label: 'rombo hueco' },
  0x3000: { label: 'espacio ideográfico', invisible: true },
  0x300c: { label: 'comilla de esquina de apertura' },
  0x300d: { label: 'comilla de esquina de cierre' },
  0x300e: { label: 'comilla de esquina doble de apertura' },
  0x300f: { label: 'comilla de esquina doble de cierre' },
  0x3010: { label: 'corchete negro de apertura' },
  0x3011: { label: 'corchete negro de cierre' },
  0xfeff: { label: 'marca de orden de bytes', invisible: true },
}

const ASCII_PUNCT: Record<string, string> = {
  '<': 'menor que', '>': 'mayor que', '&': 'et', '/': 'barra', '\\': 'barra invertida',
  '=': 'igual', '"': 'comilla recta doble', '#': 'almohadilla', '.': 'punto',
  ',': 'coma', ';': 'punto y coma', ':': 'dos puntos', '(': 'paréntesis de apertura',
  ')': 'paréntesis de cierre', '[': 'corchete de apertura', ']': 'corchete de cierre',
  '{': 'llave de apertura', '}': 'llave de cierre', '?': 'cierre de interrogación',
  '*': 'asterisco', '+': 'más', '%': 'por ciento', '_': 'guion bajo', '|': 'barra vertical',
  '@': 'arroba', '$': 'dólar', '^': 'circunflejo', '~': 'virgulilla', '`': 'acento grave',
}

export const hexOf = (code: number) => `U+${code.toString(16).toUpperCase().padStart(4, '0')}`

/** Describe el primer carácter de `s`. `null` si viene vacío. */
export function charInfo(s: string): CharInfo | null {
  const code = s.codePointAt(0)
  if (code == null) return null
  const char = String.fromCodePoint(code)
  const hex = hexOf(code)

  const known = NAMES[code]
  if (known) return { char, code, label: known.label, hex, invisible: known.invisible }

  if (ASCII_PUNCT[char]) return { char, code, label: ASCII_PUNCT[char], hex }
  if (/\p{Lu}/u.test(char)) return { char, code, label: `letra ${char} mayúscula`, hex }
  if (/\p{Ll}/u.test(char)) return { char, code, label: `letra ${char} minúscula`, hex }
  if (/\p{Nd}/u.test(char)) return { char, code, label: `dígito ${char}`, hex }

  // Lo que no tiene nombre pero tampoco se ve: merece el aviso igual.
  const invisible = /\p{Cf}|\p{Zs}|\p{Cc}/u.test(char) || undefined
  return { char, code, label: invisible ? 'carácter invisible' : 'carácter', hex, invisible }
}

/** Texto corto para la barra de estado. */
export function describeChar(s: string): string {
  const info = charInfo(s)
  if (!info) return ''
  return `${info.label} (${info.hex})`
}
