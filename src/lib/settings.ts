// Preferencias del usuario: tipografías y temas propios.
//
// Todo el aspecto de la app son variables CSS, así que una preferencia no es
// más que sobrescribir una de ellas en <html>. Un estilo en línea gana a
// cualquier regla, así que pisa al tema base sin pelearse con él.
//
// Los colores van por tema (el acento que luce en oscuro suele cantar en
// claro); las tipografías son comunes a los dos.

import type { Theme } from './theme'

const KEY = 'epub-editor.settings'

export interface Settings {
  /** Tokens que no dependen del tema: tipografías y tamaños. */
  common: Record<string, string>
  light: Record<string, string>
  dark: Record<string, string>
}

export const emptySettings: Settings = { common: {}, light: {}, dark: {} }

export interface TokenInfo {
  token: string
  label: string
  hint?: string
}

/** Los colores que de verdad cambian la cara de la app. */
export const COLOR_TOKENS: TokenInfo[] = [
  { token: '--canvas', label: 'Fondo del editor' },
  { token: '--panel', label: 'Paneles y barras' },
  { token: '--text', label: 'Texto' },
  { token: '--muted', label: 'Texto atenuado' },
  { token: '--border', label: 'Bordes' },
  { token: '--accent', label: 'Acento', hint: 'Selección, enlaces y botones' },
]

/** Colores de sintaxis del editor. Tambien van por tema. */
export const SYNTAX_TOKENS: TokenInfo[] = [
  { token: '--syn-tag', label: 'Etiquetas', hint: '<section>' },
  { token: '--syn-attr', label: 'Atributos', hint: 'class, href' },
  { token: '--syn-string', label: 'Valores y cadenas', hint: '"chapter"' },
  { token: '--syn-punct', label: 'Signos', hint: '< > = ;' },
  { token: '--syn-comment', label: 'Comentarios y DOCTYPE' },
  { token: '--syn-number', label: 'Números y entidades', hint: '1.5em, &amp;' },
  { token: '--syn-keyword', label: 'Palabras clave', hint: '@charset' },
  { token: '--syn-property', label: 'Propiedades CSS', hint: 'margin' },
  { token: '--syn-selector', label: 'Selectores CSS', hint: '.centro' },
  { token: '--syn-link', label: 'Enlaces' },
]

export const FONT_TOKENS: TokenInfo[] = [
  { token: '--font-mono', label: 'Fuente del editor', hint: 'Mejor una de ancho fijo' },
  { token: '--font-ui', label: 'Fuente de la interfaz' },
  { token: '--font-serif', label: 'Fuente con serifa', hint: 'Títulos y vista previa del pegado' },
]

/** Pilas de fuentes que suelen estar instaladas, para no escribirlas a mano. */
export const FONT_PRESETS: Record<string, { label: string; value: string }[]> = {
  '--font-mono': [
    { label: 'Del sistema', value: "ui-monospace, 'Cascadia Code', Consolas, monospace" },
    { label: 'Consolas', value: "Consolas, 'Courier New', monospace" },
    { label: 'Cascadia Code', value: "'Cascadia Code', 'Cascadia Mono', monospace" },
    { label: 'JetBrains Mono', value: "'JetBrains Mono', monospace" },
    { label: 'Fira Code', value: "'Fira Code', monospace" },
    { label: 'Courier New', value: "'Courier New', monospace" },
  ],
  '--font-ui': [
    { label: 'Del sistema', value: "system-ui, 'Segoe UI', Roboto, sans-serif" },
    { label: 'Segoe UI', value: "'Segoe UI', sans-serif" },
    { label: 'Inter', value: 'Inter, system-ui, sans-serif' },
    { label: 'Verdana', value: 'Verdana, sans-serif' },
  ],
  '--font-serif': [
    { label: 'Del sistema', value: "'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif" },
    { label: 'Georgia', value: 'Georgia, serif' },
    { label: 'Cambria', value: 'Cambria, Georgia, serif' },
    { label: 'Times New Roman', value: "'Times New Roman', serif" },
  ],
}

/** Tamaño y interlineado del editor, que no son colores ni fuentes. */
export const SIZE_TOKENS = {
  size: { token: '--editor-size', label: 'Tamaño del editor', min: 11, max: 22, step: 1, unit: 'px' },
  leading: { token: '--editor-leading', label: 'Interlineado', min: 1.2, max: 2.2, step: 0.1, unit: '' },
} as const

export function loadSettings(): Settings {
  try {
    const saved = localStorage.getItem(KEY)
    if (!saved) return { ...emptySettings }
    const parsed = JSON.parse(saved)
    return {
      common: parsed.common ?? {},
      light: parsed.light ?? {},
      dark: parsed.dark ?? {},
    }
  } catch {
    return { ...emptySettings }
  }
}

export function saveSettings(s: Settings) {
  try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* sin almacenamiento */ }
}

/** Lo que se aplicó la última vez, para poder retirarlo al cambiar. */
let applied: string[] = []

export function applySettings(s: Settings, theme: Theme) {
  const root = document.documentElement
  for (const token of applied) root.style.removeProperty(token)

  const all = { ...s.common, ...s[theme] }
  for (const [token, value] of Object.entries(all)) {
    if (token.startsWith('--') && value) root.style.setProperty(token, value)
  }
  applied = Object.keys(all)
}

/** El valor que tiene ahora un token, venga del tema base o de una preferencia. */
export function readToken(token: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(token).trim()
}

/**
 * `<input type="color">` solo entiende #rrggbb. Si el token trae otra cosa
 * (una mezcla, un color con alfa) se devuelve un apaño para no romper el
 * selector; el valor de verdad se puede tocar en el modo JSON.
 */
export function asHexColor(value: string): string {
  const v = value.trim()
  if (/^#[0-9a-f]{6}$/i.test(v)) return v
  if (/^#[0-9a-f]{3}$/i.test(v)) return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`
  if (/^#[0-9a-f]{8}$/i.test(v)) return v.slice(0, 7) // se ignora el alfa
  const m = v.match(/^rgba?\(([^)]+)\)$/i)
  if (m) {
    const [r, g, b] = m[1].split(/[,\s/]+/).map(Number)
    const hex = (n: number) => Math.max(0, Math.min(255, n || 0)).toString(16).padStart(2, '0')
    return `#${hex(r)}${hex(g)}${hex(b)}`
  }
  return '#808080'
}

/** Quita las claves vacías para no guardar basura. */
export function pruneSettings(s: Settings): Settings {
  const clean = (o: Record<string, string>) =>
    Object.fromEntries(Object.entries(o).filter(([k, v]) => k.startsWith('--') && v.trim()))
  return { common: clean(s.common), light: clean(s.light), dark: clean(s.dark) }
}

export function countOverrides(s: Settings): number {
  return Object.keys(s.common).length + Object.keys(s.light).length + Object.keys(s.dark).length
}
