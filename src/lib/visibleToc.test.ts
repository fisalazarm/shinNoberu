import { describe, expect, it } from 'vitest'
import { spinePaths, type EpubBook, type EpubFile } from './epub'
import { addFrontMatter, suggestText } from './frontMatter'
import {
  createVisibleToc, isStale, refreshVisibleToc, removeVisibleToc, tocLines, visibleTocPath,
} from './visibleToc'

const NAV = `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Índice</title></head>
<body>
  <nav epub:type="toc" id="toc"><ol><li><a href="Cap01.xhtml">Uno</a></li></ol></nav>
  <nav epub:type="landmarks" id="landmarks" hidden=""><ol>
    <li><a epub:type="bodymatter" href="Cap01.xhtml">Comienzo</a></li>
  </ol></nav>
</body></html>`

const chapter = (title: string) => `<html xmlns="http://www.w3.org/1999/xhtml"><head><title>${title}</title>
<link href="../Styles/style.css" rel="stylesheet" type="text/css"/></head>
<body><h1>${title}</h1><p>texto</p></body></html>`

function book(titles = ['El faro', 'La travesía', 'El regreso']): EpubBook {
  const files = new Map<string, EpubFile>()
  titles.forEach((t, i) => {
    const path = `OEBPS/Text/Cap0${i + 1}.xhtml`
    files.set(path, { path, mediaType: 'application/xhtml+xml', text: chapter(t) })
  })
  files.set('OEBPS/Text/toc.xhtml', { path: 'OEBPS/Text/toc.xhtml', mediaType: 'application/xhtml+xml', text: NAV })
  files.set('OEBPS/Styles/style.css', { path: 'OEBPS/Styles/style.css', mediaType: 'text/css', text: 'p { margin: 0 }\n' })
  files.set('OEBPS/content.opf', {
    path: 'OEBPS/content.opf',
    mediaType: 'application/oebps-package+xml',
    text: `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="id">urn:uuid:x</dc:identifier>
    <dc:title>La travesía</dc:title>
    <dc:creator>Ana Ruiz</dc:creator>
    <dc:language>es</dc:language>
  </metadata>
  <manifest>
    <item id="nav" href="Text/toc.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="css" href="Styles/style.css" media-type="text/css"/>
    ${titles.map((_, i) => `<item id="c${i + 1}" href="Text/Cap0${i + 1}.xhtml" media-type="application/xhtml+xml"/>`).join('\n    ')}
  </manifest>
  <spine>
    ${titles.map((_, i) => `<itemref idref="c${i + 1}"/>`).join('\n    ')}
  </spine>
</package>`,
  })
  return { files, opfPath: 'OEBPS/content.opf' }
}

const page = (b: EpubBook) => b.files.get(visibleTocPath(b)!)!.text!

describe('qué entra en el índice', () => {
  it('los capítulos en orden de lectura, con su título', () => {
    expect(tocLines(book()).map(l => l.title)).toEqual(['El faro', 'La travesía', 'El regreso'])
  })

  it('ni el nav ni las páginas de cortesía', () => {
    const b = book()
    addFrontMatter(b, ['portadilla', 'creditos'], suggestText(b))
    expect(tocLines(b).map(l => l.title)).toEqual(['El faro', 'La travesía', 'El regreso'])
  })
})

describe('crear la página', () => {
  it('enlaza cada capítulo', () => {
    const b = book()
    createVisibleToc(b)
    expect(page(b)).toContain('<a href="Cap01.xhtml">El faro</a>')
    expect(page(b)).toContain('<a href="Cap03.xhtml">El regreso</a>')
  })

  it('va delante del primer capítulo', () => {
    const b = book()
    const r = createVisibleToc(b)
    expect(spinePaths(b)[0]).toBe(r.path)
  })

  it('y si hay preliminares, detrás de ellos', () => {
    const b = book()
    addFrontMatter(b, ['portadilla', 'creditos'], suggestText(b))
    const r = createVisibleToc(b)
    const spine = spinePaths(b)
    expect(spine.indexOf(r.path)).toBe(spine.indexOf('OEBPS/Text/Creditos.xhtml') + 1)
    expect(spine.indexOf(r.path)).toBeLessThan(spine.indexOf('OEBPS/Text/Cap01.xhtml'))
  })

  it('se apunta en los landmarks como índice', () => {
    const b = book()
    createVisibleToc(b)
    const nav = b.files.get('OEBPS/Text/toc.xhtml')!.text!
    expect(nav).toContain('epub:type="toc" href="Indice.xhtml"')
  })

  it('enlaza la hoja del libro y le añade su estilo una vez', () => {
    const b = book()
    createVisibleToc(b)
    createVisibleToc(b)
    expect(page(b)).toContain('href="../Styles/style.css"')
    const css = b.files.get('OEBPS/Styles/style.css')!.text!
    expect(css.match(/página de índice/g)).toHaveLength(1)
  })

  it('crearla dos veces no la duplica', () => {
    const b = book()
    createVisibleToc(b)
    const r = createVisibleToc(b)
    expect(r.created).toBe(false)
    expect(spinePaths(b).filter(p => p.includes('Indice'))).toHaveLength(1)
  })

  it('no pisa un Indice.xhtml que no es suyo', () => {
    const b = book()
    b.files.set('OEBPS/Text/Indice.xhtml', { path: 'OEBPS/Text/Indice.xhtml', mediaType: 'application/xhtml+xml', text: '<html><body>mío</body></html>' })
    const r = createVisibleToc(b)
    expect(r.path).toBe('OEBPS/Text/Indice-2.xhtml')
    expect(b.files.get('OEBPS/Text/Indice.xhtml')!.text).toContain('mío')
  })

  it('escapa los títulos', () => {
    const b = book(['Ana & Luis', 'Dos'])
    createVisibleToc(b)
    expect(page(b)).toContain('Ana &amp; Luis')
  })
})

describe('mantenerla al día', () => {
  it('si nada cambió, no escribe', () => {
    const b = book()
    createVisibleToc(b)
    expect(refreshVisibleToc(b)).toBe(false)
    expect(isStale(b)).toBe(false)
  })

  it('al cambiar un título se rehace', () => {
    const b = book()
    createVisibleToc(b)
    b.files.get('OEBPS/Text/Cap02.xhtml')!.text = chapter('La gran travesía')
    expect(isStale(b)).toBe(true)
    expect(refreshVisibleToc(b)).toBe(true)
    expect(page(b)).toContain('La gran travesía')
    expect(isStale(b)).toBe(false)
  })

  it('al quitar un capítulo del libro desaparece de la lista', () => {
    const b = book()
    createVisibleToc(b)
    const opf = b.files.get('OEBPS/content.opf')!
    opf.text = opf.text!.replace('<itemref idref="c3"/>', '')
    refreshVisibleToc(b)
    expect(page(b)).not.toContain('El regreso')
  })

  it('si le quitas la clase deja de ser suya y no la toca', () => {
    const b = book()
    const r = createVisibleToc(b)
    const f = b.files.get(r.path)!
    f.text = f.text!.replace('class="indice-visible"', '').replace('El faro', 'Mi faro escrito a mano')
    expect(visibleTocPath(b)).toBeNull()
    expect(refreshVisibleToc(b)).toBe(false)
    expect(f.text).toContain('Mi faro escrito a mano')
  })

  it('un libro sin página no tiene nada que rehacer', () => {
    expect(refreshVisibleToc(book())).toBe(false)
    expect(isStale(book())).toBe(false)
  })
})

describe('quitarla', () => {
  it('se va del libro, del OPF y de los landmarks', () => {
    const b = book()
    const r = createVisibleToc(b)
    expect(removeVisibleToc(b)).toBe(true)
    expect(b.files.has(r.path)).toBe(false)
    expect(b.files.get('OEBPS/content.opf')!.text).not.toContain('Indice.xhtml')
    expect(b.files.get('OEBPS/Text/toc.xhtml')!.text).not.toContain('Indice.xhtml')
    expect(b.files.get('OEBPS/Text/toc.xhtml')!.text).toContain('bodymatter')
  })
})

describe('la hoja de estilos', () => {
  it('la encuentra aunque el primer capítulo no la enlace', () => {
    const b = book()
    const cap1 = b.files.get('OEBPS/Text/Cap01.xhtml')!
    cap1.text = cap1.text!.replace(/<link[^>]*>/, '')
    createVisibleToc(b)
    expect(page(b)).toContain('href="../Styles/style.css"')
  })

  it('si ningún capítulo usa hoja, la página tampoco', () => {
    const b = book()
    for (const n of [1, 2, 3]) {
      const f = b.files.get(`OEBPS/Text/Cap0${n}.xhtml`)!
      f.text = f.text!.replace(/<link[^>]*>/, '')
    }
    createVisibleToc(b)
    expect(page(b)).not.toContain('<link')
  })
})
