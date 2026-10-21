// Tema claro u oscuro. Se guarda la elección; si no hay ninguna, manda el sistema.

export type Theme = 'light' | 'dark'

const KEY = 'epub-editor.theme'

function systemTheme(): Theme {
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

export function loadTheme(): Theme {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved === 'light' || saved === 'dark') return saved
  } catch { /* sin almacenamiento */ }
  return systemTheme()
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme
  try { localStorage.setItem(KEY, theme) } catch { /* ignorar */ }
}
