import { describe, expect, it } from 'vitest'
import type { EpubBook, EpubFile } from './epub'
import { imageWidth, reviewRelease, verdict } from './release'

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

/** Un PNG de verdad en lo que importa: la cabecera con el ancho. */
function png(width: number): Uint8Array {
  const b = new Uint8Array(64)
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0)
  b[16] = (width >> 24) & 255
  b[17] = (width >> 16) & 255
  b[18] = (width >> 8) & 255
  b[19] = width & 255
  return b
}

interface Parts {
  metadata?: string
  chapter?: string
  cover?: Uint8Array
  nav?: string
}

function book(p: Parts = {}): EpubBook {
  const files = new Map<string, EpubFile>()
  files.set('mimetype', { path: 'mimetype', mediaType: 'text/plain', text: 'application/epub+zip' })
  files.set('META-INF/container.xml', {
    path: 'META-INF/container.xml',
    mediaType: 'application/xml',
    text: '<?xml version="1.0"?><container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
  })
  files.set('OEBPS/Text/Cap01.xhtml', {
    path: 'OEBPS/Text/Cap01.xhtml',
    mediaType: 'application/xhtml+xml',
    text: `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Uno</title></head>
<body><h1>Capítulo 1</h1>${p.chapter ?? '<p>La nieve caía despacio sobre el valle y nadie dijo nada.</p>'}</body></html>`,
  })
  files.set('OEBPS/Text/toc.xhtml', { path: 'OEBPS/Text/toc.xhtml', mediaType: 'application/xhtml+xml', text: p.nav ?? NAV })
  files.set('OEBPS/Images/portada.png', { path: 'OEBPS/Images/portada.png', mediaType: 'image/png', bytes: p.cover ?? png(1600) })

  const metadata = p.metadata ?? `
    <dc:identifier id="BookId">urn:uuid:x</dc:identifier>
    <dc:title>La travesía</dc:title>
    <dc:creator>Ana Ruiz</dc:creator>
    <dc:language>es</dc:language>`
  files.set('OEBPS/content.opf', {
    path: 'OEBPS/content.opf',
    mediaType: 'application/oebps-package+xml',
    text: `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="BookId">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">${metadata}
    <meta property="dcterms:modified">2026-01-01T00:00:00Z</meta>
  </metadata>
  <manifest>
    <item id="nav" href="Text/toc.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="c1" href="Text/Cap01.xhtml" media-type="application/xhtml+xml"/>
    <item id="cover" href="Images/portada.png" media-type="image/png" properties="cover-image"/>
  </manifest>
  <spine><itemref idref="c1"/></spine>
</package>`,
  })
  return { files, opfPath: 'OEBPS/content.opf' }
}

const bloque = (b: EpubBook, id: string) => reviewRelease(b).blocks.find(x => x.id === id)!

describe('el veredicto', () => {
  it('un libro sano sale en verde', () => {
    const r = reviewRelease(book())
    expect(r.level).toBe('ok')
    expect(verdict(r.level)).toContain('listo')
  })

  it('manda el bloque más grave', () => {
    const b = book({ metadata: '<dc:title>Solo el título</dc:title>' })
    expect(reviewRelease(b).level).toBe('error')
  })

  it('un aviso no bloquea', () => {
    const b = book({ cover: png(800) })
    const r = reviewRelease(b)
    expect(r.level).toBe('warn')
    expect(verdict(r.level)).toContain('Se puede publicar')
  })

  it('da el tamaño y las palabras del libro', () => {
    const r = reviewRelease(book())
    expect(r.bytes).toBeGreaterThan(0)
    expect(r.words).toBeGreaterThan(5)
  })
})

describe('los bloques', () => {
  it('avisan de los metadatos que faltan', () => {
    const b = bloque(book({ metadata: '<dc:title>Solo el título</dc:title>' }), 'metadatos')
    expect(b.level).toBe('error')
    expect(b.summary).toContain('el autor')
    expect(b.opens).toBe('metadata')
  })

  it('se quejan si la portada declarada no está', () => {
    const b = book()
    b.files.delete('OEBPS/Images/portada.png')
    const bl = bloque(b, 'portada')
    expect(bl.level).toBe('error')
    expect(bl.summary).toContain('no está en el libro')
  })

  it('y si no se declara ninguna', () => {
    const b = book()
    const opf = b.files.get('OEBPS/content.opf')!
    opf.text = opf.text!.replace(/<item id="cover"[^>]*\/>/, '')
    b.files.delete('OEBPS/Images/portada.png')
    expect(bloque(b, 'portada').summary).toContain('no declara portada')
  })

  it('y si la portada es pequeña', () => {
    const b = bloque(book({ cover: png(800) }), 'portada')
    expect(b.level).toBe('warn')
    expect(b.summary).toContain('800 px')
  })

  it('una portada grande pasa', () => {
    expect(bloque(book({ cover: png(1600) }), 'portada').level).toBe('ok')
  })

  it('cuentan los enlaces rotos como error', () => {
    const b = bloque(book({ chapter: '<p><a href="NoExiste.xhtml">allá</a></p>' }), 'enlaces')
    expect(b.level).toBe('error')
    expect(b.summary).toContain('1 enlace roto')
  })

  it('los archivos sin usar solo son aviso', () => {
    const b = book()
    b.files.set('OEBPS/Images/sobra.jpg', { path: 'OEBPS/Images/sobra.jpg', mediaType: 'image/jpeg', bytes: new Uint8Array(10) })
    const bl = bloque(b, 'enlaces')
    expect(bl.level).toBe('warn')
    expect(bl.summary).toContain('sin usar')
  })

  it('avisan del diálogo mal puntuado', () => {
    const b = bloque(book({ chapter: '<p>— Vamos allá.</p>' }), 'dialogo')
    expect(b.level).toBe('warn')
    expect(b.summary).toContain('se arreglan solos')
  })

  it('avisan de las imágenes sin alt', () => {
    const b = bloque(book({ chapter: '<p><img src="../Images/portada.png"/></p>' }), 'imagenes')
    expect(b.level).toBe('warn')
    expect(b.summary).toContain('sin texto alternativo')
  })

  it('y de las que pesan demasiado', () => {
    const b = book({ cover: png(1600) })
    b.files.get('OEBPS/Images/portada.png')!.bytes = new Uint8Array(900 * 1024)
    expect(bloque(b, 'imagenes').summary).toContain('pesa')
  })

  it('avisan si el índice se quedó corto', () => {
    const b = book({ nav: NAV.replace('<li><a href="Cap01.xhtml">Capítulo 1</a></li>', '') })
    expect(bloque(b, 'indice').level).toBe('warn')
  })

  it('un capítulo vacío se nota en el contenido', () => {
    const b = book()
    b.files.set('OEBPS/Text/Cap02.xhtml', {
      path: 'OEBPS/Text/Cap02.xhtml',
      mediaType: 'application/xhtml+xml',
      text: '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Dos</title></head><body></body></html>',
    })
    const opf = b.files.get('OEBPS/content.opf')!
    opf.text = opf.text!
      .replace('</manifest>', '  <item id="c2" href="Text/Cap02.xhtml" media-type="application/xhtml+xml"/>\n  </manifest>')
      .replace('</spine>', '<itemref idref="c2"/></spine>')
    expect(bloque(b, 'contenido').advice).toContain('vacío')
  })

  it('una página que solo lleva una ilustración no cuenta como vacía', () => {
    const b = book()
    b.files.set('OEBPS/Text/Lamina.xhtml', {
      path: 'OEBPS/Text/Lamina.xhtml',
      mediaType: 'application/xhtml+xml',
      text: '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Lámina</title></head><body><figure class="dimg"><img src="../Images/l1.jpg" alt=""/></figure></body></html>',
    })
    const opf = b.files.get('OEBPS/content.opf')!
    opf.text = opf.text!
      .replace('</manifest>', '  <item id="l1" href="Text/Lamina.xhtml" media-type="application/xhtml+xml"/>\n  </manifest>')
      .replace('</spine>', '<itemref idref="l1"/></spine>')
    expect(bloque(b, 'contenido').advice).toBeUndefined()
  })

  it('cada bloque sabe qué panel abre', () => {
    for (const b of reviewRelease(book()).blocks) expect(b.opens).toBeTruthy()
  })
})

describe('medir imágenes', () => {
  it('lee el ancho de un PNG', () => {
    expect(imageWidth(png(1600))).toBe(1600)
  })

  it('lee el ancho de un JPEG', () => {
    const b = new Uint8Array(32)
    b.set([0xff, 0xd8], 0)
    b.set([0xff, 0xc0, 0x00, 0x11, 0x08, 0x02, 0x00, 0x04, 0xb0], 2) // alto 0x200, ancho 0x4b0
    expect(imageWidth(b)).toBe(1200)
  })

  it('con otra cosa no inventa', () => {
    expect(imageWidth(new Uint8Array([1, 2, 3, 4]))).toBeNull()
  })
})

describe('el índice con preliminares', () => {
  it('las páginas de cortesía no cuentan como capítulos sin entrada', async () => {
    const { addFrontMatter, suggestText } = await import('./frontMatter')
    const b = book()
    addFrontMatter(b, ['portadilla', 'portada', 'creditos'], suggestText(b))
    const bl = reviewRelease(b).blocks.find(x => x.id === 'indice')!
    expect(bl.level).toBe('ok')
    expect(bl.summary).toContain('para 1 capítulo')
  })

  it('dice si hay página de índice visible', async () => {
    const { createVisibleToc } = await import('./visibleToc')
    const b = book()
    createVisibleToc(b)
    expect(reviewRelease(b).blocks.find(x => x.id === 'indice')!.summary).toContain('página de índice visible')
  })

  it('y avisa si se quedó atrás', async () => {
    const { createVisibleToc } = await import('./visibleToc')
    const b = book()
    createVisibleToc(b)
    const cap = b.files.get('OEBPS/Text/Cap01.xhtml')!
    cap.text = cap.text!.replace('<h1>Capítulo 1</h1>', '<h1>Otro título</h1>')
    const bl = reviewRelease(b).blocks.find(x => x.id === 'indice')!
    expect(bl.level).toBe('warn')
    expect(bl.advice).toContain('no dice lo que hay ahora')
  })
})
