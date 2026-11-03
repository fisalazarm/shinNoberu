// Tamaño de los paneles de la ventana: la lista de archivos y la vista previa
// se pueden ensanchar arrastrando su borde.
//
// Mientras no se arrastra nada, la vista previa conserva su reparto de
// siempre con el editor (1 : 0,9), que se adapta solo al tamaño de la
// ventana. En cuanto se arrastra, pasa a tener un ancho fijo en píxeles, que
// es lo que uno espera: lo que dejaste es lo que encuentras.

export interface PaneSizes {
  /** Ancho de la lista de archivos. */
  sidebar: number | null
  /** Ancho de la vista previa; null es el reparto proporcional de siempre. */
  preview: number | null
}

export const DEFAULT_SIDEBAR = 236

export const LIMITS = {
  sidebar: { min: 160, maxShare: 0.5 },
  preview: { min: 260, maxShare: 0.7 },
  /** Lo mínimo que se le deja al editor, pase lo que pase. */
  center: 320,
  /** Ancho de cada separador. */
  splitter: 1,
}

const STORAGE_KEY = 'epub-editor.paneles'

export function loadPaneSizes(): PaneSizes {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
    return { sidebar: num(raw?.sidebar), preview: num(raw?.preview) }
  } catch {
    return { sidebar: null, preview: null }
  }
}

export function savePaneSizes(s: PaneSizes) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)) } catch { /* sin almacenamiento */ }
}

const clamp = (v: number, min: number, max: number) => Math.round(Math.max(min, Math.min(v, max)))

/**
 * Ajusta los anchos a la ventana que hay ahora. Cada panel respeta su mínimo y
 * su máximo, y si entre los dos no le dejan sitio al editor, cede primero la
 * vista previa y después la lista de archivos.
 */
export function fitPanes(s: PaneSizes, viewport: number): PaneSizes {
  const sidebar = s.sidebar == null ? null : clamp(s.sidebar, LIMITS.sidebar.min, viewport * LIMITS.sidebar.maxShare)
  let preview = s.preview == null ? null : clamp(s.preview, LIMITS.preview.min, viewport * LIMITS.preview.maxShare)

  // Con la vista previa en proporción, el editor siempre se queda con su parte.
  if (preview == null) return { sidebar, preview }

  const fixed = (sidebar ?? DEFAULT_SIDEBAR) + preview + LIMITS.splitter * 2
  let excess = fixed + LIMITS.center - viewport
  if (excess <= 0) return { sidebar, preview }

  const fromPreview = Math.min(excess, preview - LIMITS.preview.min)
  preview -= fromPreview
  excess -= fromPreview

  let side = sidebar
  if (excess > 0) {
    const current = sidebar ?? DEFAULT_SIDEBAR
    side = Math.max(LIMITS.sidebar.min, current - excess)
  }
  return { sidebar: side, preview }
}

/** Las columnas de la rejilla: archivos | separador | editor | separador | vista previa. */
export function gridColumns(s: PaneSizes): string {
  const sidebar = `${s.sidebar ?? DEFAULT_SIDEBAR}px`
  const preview = s.preview == null ? 'minmax(0, 0.9fr)' : `${s.preview}px`
  const line = `${LIMITS.splitter}px`
  // El editor no lleva mínimo en la rejilla: en una ventana muy estrecha
  // saldría una barra horizontal. El mínimo ya lo cuida `fitPanes`.
  return `${sidebar} ${line} minmax(0, 1fr) ${line} ${preview}`
}
