import { describe, expect, it } from 'vitest'
import { spinePaths, type EpubBook, type EpubFile } from './epub'
import {
  addFrontMatter, PIECES, renderPiece, suggestText, type FrontMatterText,
} from './frontMatter'

const NAV = `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Índice</title></head>
<body>
  <nav epub:type="toc" id="toc"><h1>Índice</h1><ol>
    <li><a href="Cap01.xhtml">Capítulo 1</a></li>
  </ol></nav>
  <nav epub:type="landmarks" id="landmarks" hidden=""><ol>
    <li><a epub:type="bodymatter" href="Cap01.xhtml">Comienzo</a></li>
  </ol></nav>
</body>
</html>`

function book(): EpubBook {
  const files = new Map<string, EpubFile>()
  files.set('OEBPS/Text/Cap01.xhtml', {
    path: 'OEBPS/Text/Cap01.xhtml',
    mediaType: 'application/xhtml+xml',
    text: `<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Uno</title>
<link href="../Styles/style.css" rel="stylesheet" type="text/css"/></head><body><p>uno</p></body></html>`,
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
    <dc:publisher>Editorial Faro</dc:publisher>
    <dc:date>2024-03-01</dc:date>
  </metadata>
  <manifest>
    <item id="nav" href="Text/toc.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="css" href="Styles/style.css" media-type="text/css"/>
    <item id="c1" href="Text/Cap01.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="c1"/>
  </spine>
</package>`,
  })
  return { files, opfPath: 'OEBPS/content.opf' }
}

const texto = (b: EpubBook): FrontMatterText => suggestText(b)
const nav = (b: EpubBook) => b.files.get('OEBPS/Text/toc.xhtml')!.text!
const opf = (b: EpubBook) => b.files.get('OEBPS/content.opf')!.text!

describe('lo que se rellena solo', () => {
  it('sale de los metadatos del libro', () => {
    const t = texto(book())
    expect(t.title).toBe('La travesía')
    expect(t.author).toBe('Ana Ruiz')
    expect(t.publisher).toBe('Editorial Faro')
    expect(t.year).toBe('2024')
  })

  it('el colofón ya viene escrito', () => {
    expect(texto(book()).colophon).toContain('2024')
  })
})

describe('las páginas', () => {
  const piece = (id: string) => PIECES.find(p => p.id === id)!

  it('la portada lleva título, autor y editorial', () => {
    const html = renderPiece(piece('portada'), texto(book()))
    expect(html).toContain('<h1 class="titulo">La travesía</h1>')
    expect(html).toContain('Ana Ruiz')
    expect(html).toContain('Editorial Faro')
  })

  it('los créditos llevan el copyright y la reserva de derechos', () => {
    const html = renderPiece(piece('creditos'), texto(book()))
    expect(html).toContain('© 2024 Ana Ruiz')
    expect(html).toContain('Todos los derechos reservados')
  })

  it('sin editorial no deja la línea vacía', () => {
    const t = { ...texto(book()), publisher: '' }
    expect(renderPiece(piece('portada'), t)).not.toContain('editorial')
  })

  it('cada página dice de qué tipo es, para el lector', () => {
    expect(renderPiece(piece('creditos'), texto(book()))).toContain('epub:type="copyright-page"')
  })

  it('escapa lo que escriba el autor', () => {
    const t = { ...texto(book()), dedication: 'A Ana & Luis <siempre>' }
    const html = renderPiece(piece('dedicatoria'), t)
    expect(html).toContain('A Ana &amp; Luis &lt;siempre&gt;')
    expect(html).not.toContain('<siempre>')
  })
})

describe('meterlas en el libro', () => {
  it('van delante del primer capítulo y en su orden', () => {
    const b = book()
    addFrontMatter(b, ['portadilla', 'portada', 'creditos'], texto(b))
    expect(spinePaths(b)).toEqual([
      'OEBPS/Text/Portadilla.xhtml',
      'OEBPS/Text/Portada.xhtml',
      'OEBPS/Text/Creditos.xhtml',
      'OEBPS/Text/Cap01.xhtml',
    ])
  })

  it('el colofón va al final', () => {
    const b = book()
    addFrontMatter(b, ['colofon'], texto(b))
    expect(spinePaths(b).at(-1)).toBe('OEBPS/Text/Colofon.xhtml')
  })

  it('quedan declaradas en el manifest', () => {
    const b = book()
    addFrontMatter(b, ['portada'], texto(b))
    expect(opf(b)).toContain('href="Text/Portada.xhtml"')
  })

  it('se apuntan en los landmarks, no en el índice', () => {
    const b = book()
    addFrontMatter(b, ['creditos'], texto(b))
    const landmarks = nav(b).slice(nav(b).indexOf('landmarks'))
    expect(landmarks).toContain('epub:type="copyright-page"')
    expect(landmarks).toContain('Creditos.xhtml')
    const toc = nav(b).slice(nav(b).indexOf('epub:type="toc"'), nav(b).indexOf('landmarks'))
    expect(toc).not.toContain('Creditos')
  })

  it('enlazan la hoja de estilos del libro', () => {
    const b = book()
    addFrontMatter(b, ['portada'], texto(b))
    expect(b.files.get('OEBPS/Text/Portada.xhtml')!.text).toContain('href="../Styles/style.css"')
  })

  it('añaden su CSS una sola vez', () => {
    const b = book()
    addFrontMatter(b, ['portada'], texto(b))
    addFrontMatter(b, ['creditos'], texto(b))
    const css = b.files.get('OEBPS/Styles/style.css')!.text!
    expect(css.match(/páginas de cortesía/g)).toHaveLength(1)
    expect(css).toContain('p { margin: 0 }')
  })

  it('no pisan una página que ya existe', () => {
    const b = book()
    addFrontMatter(b, ['portada'], texto(b))
    b.files.get('OEBPS/Text/Portada.xhtml')!.text = '<html><body>mía</body></html>'
    const r = addFrontMatter(b, ['portada'], texto(b))
    expect(r.created).toEqual([])
    expect(r.skipped).toEqual(['OEBPS/Text/Portada.xhtml'])
    expect(b.files.get('OEBPS/Text/Portada.xhtml')!.text).toBe('<html><body>mía</body></html>')
  })

  it('volver a generar no duplica el itemref', () => {
    const b = book()
    addFrontMatter(b, ['portada'], texto(b))
    addFrontMatter(b, ['portada'], texto(b))
    expect(opf(b).match(/idref="Portada.xhtml"/g)).toHaveLength(1)
  })

  it('ni la entrada de los landmarks', () => {
    const b = book()
    addFrontMatter(b, ['creditos'], texto(b))
    b.files.delete('OEBPS/Text/Creditos.xhtml')
    addFrontMatter(b, ['creditos'], texto(b))
    expect(nav(b).match(/Creditos\.xhtml/g)).toHaveLength(1)
  })

  it('dice qué creó', () => {
    const b = book()
    const r = addFrontMatter(b, ['portadilla', 'colofon'], texto(b))
    expect(r.created).toEqual(['OEBPS/Text/Portadilla.xhtml', 'OEBPS/Text/Colofon.xhtml'])
  })

  it('un libro sin índice no se rompe', () => {
    const b = book()
    b.files.delete('OEBPS/Text/toc.xhtml')
    expect(() => addFrontMatter(b, ['portada'], texto(b))).not.toThrow()
    expect(b.files.has('OEBPS/Text/Portada.xhtml')).toBe(true)
  })
})
