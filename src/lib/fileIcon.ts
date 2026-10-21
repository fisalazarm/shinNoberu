// Qué icono le toca a cada archivo del libro. Lo usan el árbol y las pestañas.

import type { IconName } from '../components/Icon'

export function iconForFile(mediaType: string, path: string): IconName {
  if (mediaType === 'application/xhtml+xml') return 'doc'
  if (mediaType === 'text/css') return 'style'
  if (mediaType.startsWith('image/')) return 'image'
  if (mediaType.startsWith('font/') || /\.(ttf|otf|woff2?)$/i.test(path)) return 'font'
  return 'file'
}
