import { describe, expect, it } from 'vitest'
import { newEpub } from './newEpub'
import { PreviewResolver } from './preview'

/** El <style> del visor es el primero del <head>. */
function viewerCss(theme: 'light' | 'dark', zoom = 1): string {
  const book = newEpub()
  const r = new PreviewResolver(book)
  r.theme = theme
  r.zoom = zoom
  const path = 'OEBPS/Text/Cap01.xhtml'
  const html = r.render(path, book.files.get(path)!.text!)
  r.dispose()
  return html.match(/<style[^>]*>([\s\S]*?)<\/style>/)![1]
}

describe('tema de la vista previa', () => {
  it('en claro deja el papel blanco y no fuerza nada', () => {
    const css = viewerCss('light')
    expect(css).toContain('background:#ffffff')
    expect(css).toContain('color:#111111')
    expect(css).not.toContain('!important')
  })

  it('en oscuro cambia el papel y la tinta', () => {
    const css = viewerCss('dark')
    expect(css).toContain('background:#1b1d22')
    expect(css).toContain('color:#dcd9d4')
  })

  it('en oscuro gana al "body { background: #fff }" que trae casi todo libro', () => {
    const css = viewerCss('dark')
    expect(css).toMatch(/body\{background:transparent !important;color:inherit !important\}/)
  })

  it('en oscuro hace legibles los enlaces de las notas', () => {
    expect(viewerCss('dark')).toContain('a{color:#8ab4e8 !important}')
  })

  it('el zoom va en los dos modos', () => {
    expect(viewerCss('light', 1.35)).toContain('zoom:1.35')
    expect(viewerCss('dark', 0.75)).toContain('zoom:0.75')
  })

  it('el aviso de XHTML roto sigue estando', () => {
    for (const t of ['light', 'dark'] as const) expect(viewerCss(t)).toContain('.__xml-error')
  })
})
