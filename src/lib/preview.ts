// Prepara un XHTML del libro para mostrarlo en un iframe: las imágenes, CSS y
// fuentes se reemplazan por blob: URLs y los enlaces internos se marcan para
// poder navegar entre capítulos.

import { resolvePath, type EpubBook } from './epub'

export type PreviewTheme = 'light' | 'dark'

/** Colores del visor. El libro manda salvo que estorbe para leer. */
export const PREVIEW_COLORS: Record<PreviewTheme, { bg: string; fg: string; link: string }> = {
  light: { bg: '#ffffff', fg: '#111111', link: '#1a5fb4' },
  dark: { bg: '#1b1d22', fg: '#dcd9d4', link: '#8ab4e8' },
}

export class PreviewResolver {
  private binUrls = new Map<string, string>()
  private tempUrls: string[] = []
  private book: EpubBook
  /** Escala de la vista previa (1 = 100%). */
  zoom = 1
  /** Modo de lectura del visor; no toca el EPUB, solo cómo se ve aquí. */
  theme: PreviewTheme = 'light'

  constructor(book: EpubBook) {
    this.book = book
  }

  dispose() {
    for (const u of this.binUrls.values()) URL.revokeObjectURL(u)
    this.revokeTemp()
  }

  /** Olvida la URL de un binario (p. ej. si se reemplazó la imagen). */
  invalidate(path: string) {
    const u = this.binUrls.get(path)
    if (u) URL.revokeObjectURL(u)
    this.binUrls.delete(path)
  }

  private revokeTemp() {
    for (const u of this.tempUrls) URL.revokeObjectURL(u)
    this.tempUrls = []
  }

  private urlFor(path: string): string | null {
    const f = this.book.files.get(path)
    if (!f) return null
    if (f.mediaType === 'text/css') {
      const css = rewriteCssUrls(f.text ?? '', path, p => this.urlFor(p))
      const u = URL.createObjectURL(new Blob([css], { type: 'text/css' }))
      this.tempUrls.push(u)
      return u
    }
    if (f.bytes) {
      let u = this.binUrls.get(path)
      if (!u) {
        u = URL.createObjectURL(new Blob([f.bytes as BlobPart], { type: f.mediaType }))
        this.binUrls.set(path, u)
      }
      return u
    }
    if (f.text != null && f.mediaType === 'image/svg+xml') {
      const u = URL.createObjectURL(new Blob([f.text], { type: f.mediaType }))
      this.tempUrls.push(u)
      return u
    }
    return null
  }

  /**
   * Hoja del visor. Va la primera del <head>, así que el libro la pisa en
   * igualdad de especificidad; en modo oscuro hacen falta unos `!important`
   * porque lo normal es que el libro ponga `body { background: #fff }`.
   */
  private viewerCss(): string {
    const c = PREVIEW_COLORS[this.theme]
    const night = this.theme === 'dark'
      ? `body{background:transparent !important;color:inherit !important}` +
        `a{color:${c.link} !important}`
      : ''
    return (
      `html{background:${c.bg};color:${c.fg};zoom:${this.zoom}}` +
      night +
      '.__xml-error{position:sticky;top:0;background:#fde2e1;color:#8a1c14;font:12px system-ui;padding:6px 10px;border-bottom:1px solid #f3b4b0;z-index:9}'
    )
  }

  render(path: string, text: string): string {
    this.revokeTemp()

    let doc = new DOMParser().parseFromString(text, 'application/xhtml+xml')
    let xmlError: string | null = null
    const err = doc.querySelector('parsererror')
    if (err) {
      xmlError = err.textContent?.split('\n').find(Boolean) ?? 'XHTML mal formado'
      doc = new DOMParser().parseFromString(text, 'text/html')
    }

    const isExternal = (v: string) => /^([a-z][a-z0-9+.-]*:|#|\/\/)/i.test(v)

    for (const el of doc.querySelectorAll('[src], [href], image')) {
      for (const attr of ['src', 'href', 'xlink:href']) {
        const v = el.getAttribute(attr)
        if (!v || isExternal(v)) continue
        const target = resolvePath(path, v)
        const f = this.book.files.get(target)
        if (!f) continue
        if (f.mediaType === 'application/xhtml+xml' && el.localName === 'a') {
          el.setAttribute('data-epub-path', target)
          el.setAttribute('data-epub-hash', v.includes('#') ? v.slice(v.indexOf('#') + 1) : '')
          continue
        }
        const url = this.urlFor(target)
        if (url) el.setAttribute(attr, url)
      }
    }

    // CSS en <style> dentro del documento.
    for (const st of doc.querySelectorAll('style')) {
      st.textContent = rewriteCssUrls(st.textContent ?? '', path, p => this.urlFor(p))
    }

    // Estilos del visor (fondo tipo página y aviso de errores).
    const head = doc.querySelector('head') ?? doc.documentElement
    const viewerStyle = doc.createElementNS('http://www.w3.org/1999/xhtml', 'style')
    viewerStyle.textContent = this.viewerCss()
    head.insertBefore(viewerStyle, head.firstChild)

    let html = new XMLSerializer().serializeToString(doc)
    if (xmlError) {
      const banner = `<div class="__xml-error">⚠ ${escape(xmlError)}</div>`
      html = html.replace(/<body([^>]*)>/i, `<body$1>${banner}`)
    }
    return html
  }
}

function escape(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
}

export function rewriteCssUrls(css: string, cssPath: string, urlFor: (p: string) => string | null): string {
  return css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (m, _q, href: string) => {
    if (/^([a-z]+:|#)/i.test(href)) return m
    const u = urlFor(resolvePath(cssPath, href))
    return u ? `url("${u}")` : m
  })
}
