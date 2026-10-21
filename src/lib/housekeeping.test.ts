import { describe, expect, it } from 'vitest'
import type { EpubBook, EpubFile } from './epub'
import {
  findBrokenLinks, findOrphans, fixLinks, prettyBytes, reachable, removeOrphans,
} from './housekeeping'

interface Parts {
  chapters?: Record<string, string>
  extra?: Record<string, string>
  binary?: string[]
  manifest?: string
  spine?: string
}

function book(p: Parts = {}): EpubBook {
  const chapters = p.chapters ?? { 'Cap01.xhtml': '<p>uno</p>' }
  const files = new Map<string, EpubFile>()

  for (const [name, inner] of Object.entries(chapters)) {
    files.set(`OEBPS/Text/${name}`, {
      path: `OEBPS/Text/${name}`,
      mediaType: 'application/xhtml+xml',
      text: `<html xmlns="http://www.w3.org/1999/xhtml"><head><title>t</title>
<link href="../Styles/style.css" rel="stylesheet" type="text/css"/></head>
<body>\n${inner}\n</body></html>`,
    })
  }
  for (const [path, text] of Object.entries(p.extra ?? {})) {
    files.set(path, { path, mediaType: path.endsWith('.css') ? 'text/css' : 'application/xhtml+xml', text })
  }
  for (const path of p.binary ?? []) {
    files.set(path, { path, mediaType: 'image/jpeg', bytes: new Uint8Array(2048) })
  }
  files.set('OEBPS/Styles/style.css', { path: 'OEBPS/Styles/style.css', mediaType: 'text/css', text: 'p { margin: 0 }' })
  files.set('mimetype', { path: 'mimetype', mediaType: 'text/plain', text: 'application/epub+zip' })
  files.set('META-INF/container.xml', { path: 'META-INF/container.xml', mediaType: 'application/xml', text: '<container/>' })

  const items = p.manifest ?? Object.keys(chapters)
    .map((n, i) => `<item id="c${i + 1}" href="Text/${n}" media-type="application/xhtml+xml"/>`)
    .join('\n    ') + '\n    <item id="css" href="Styles/style.css" media-type="text/css"/>'
  const spine = p.spine ?? Object.keys(chapters).map((_, i) => `<itemref idref="c${i + 1}"/>`).join('\n    ')

  files.set('OEBPS/content.opf', {
    path: 'OEBPS/content.opf',
    mediaType: 'application/oebps-package+xml',
    text: `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
  <metadata/>
  <manifest>
    ${items}
  </manifest>
  <spine>
    ${spine}
  </spine>
</package>`,
  })
  return { files, opfPath: 'OEBPS/content.opf' }
}

const paths = (list: { path: string }[]) => list.map(o => o.path)

describe('qué sigue vivo', () => {
  it('se llega a los capítulos del spine y a lo que enlazan', () => {
    const live = reachable(book())
    expect(live.has('OEBPS/Text/Cap01.xhtml')).toBe(true)
    expect(live.has('OEBPS/Styles/style.css')).toBe(true)
  })

  it('un archivo que no enlaza nadie es huérfano', () => {
    const b = book({ binary: ['OEBPS/Images/sobra.jpg'] })
    expect(paths(findOrphans(b))).toEqual(['OEBPS/Images/sobra.jpg'])
  })

  it('una imagen que un capítulo usa no lo es', () => {
    const b = book({ chapters: { 'Cap01.xhtml': '<img src="../Images/usada.jpg" alt=""/>' }, binary: ['OEBPS/Images/usada.jpg'] })
    expect(findOrphans(b)).toEqual([])
  })

  it('la encuentra también desde el CSS', () => {
    const b = book({ binary: ['OEBPS/Images/fondo.jpg'] })
    b.files.get('OEBPS/Styles/style.css')!.text = 'body { background: url(../Images/fondo.jpg) }'
    expect(findOrphans(b)).toEqual([])
  })

  it('lo que solo enlazaba un huérfano queda huérfano también', () => {
    const b = book({
      extra: { 'OEBPS/Text/Suelto.xhtml': '<html><body><img src="../Images/solo.jpg" alt=""/></body></html>' },
      binary: ['OEBPS/Images/solo.jpg'],
    })
    expect(paths(findOrphans(b)).sort()).toEqual(['OEBPS/Images/solo.jpg', 'OEBPS/Text/Suelto.xhtml'])
  })

  it('nunca llama basura al mimetype ni al container', () => {
    const list = paths(findOrphans(book()))
    expect(list).not.toContain('mimetype')
    expect(list).not.toContain('META-INF/container.xml')
  })

  it('los ordena por tamaño', () => {
    const b = book({ binary: ['OEBPS/Images/a.jpg'], extra: { 'OEBPS/Text/chico.xhtml': '<p>x</p>' } })
    expect(paths(findOrphans(b))[0]).toBe('OEBPS/Images/a.jpg')
  })

  it('borrarlos los saca también del manifest', () => {
    const b = book({
      binary: ['OEBPS/Images/sobra.jpg'],
      manifest: '<item id="c1" href="Text/Cap01.xhtml" media-type="application/xhtml+xml"/>\n    <item id="img" href="Images/sobra.jpg" media-type="image/jpeg"/>',
    })
    expect(removeOrphans(b, ['OEBPS/Images/sobra.jpg'])).toBe(1)
    expect(b.files.has('OEBPS/Images/sobra.jpg')).toBe(false)
    expect(b.files.get('OEBPS/content.opf')!.text).not.toContain('sobra.jpg')
    expect(b.files.get('OEBPS/content.opf')!.text).toContain('Cap01.xhtml')
  })
})

describe('enlaces rotos', () => {
  it('encuentra el que apunta a un archivo que no existe', () => {
    const b = book({ chapters: { 'Cap01.xhtml': '<a href="Cap99.xhtml">allá</a>' } })
    const [l] = findBrokenLinks(b)
    expect(l.raw).toBe('Cap99.xhtml')
    expect(l.kind).toBe('file')
    expect(l.line).toBeGreaterThan(0)
  })

  it('y el que apunta a un ancla que no existe', () => {
    const b = book({ chapters: { 'Cap01.xhtml': '<a href="#nota-7">nota</a>' } })
    const [l] = findBrokenLinks(b)
    expect(l.kind).toBe('fragment')
  })

  it('no se queja de lo que sí existe', () => {
    const b = book({ chapters: { 'Cap01.xhtml': '<p id="aqui">uno</p><a href="#aqui">volver</a>' } })
    expect(findBrokenLinks(b)).toEqual([])
  })

  it('deja en paz los enlaces a internet', () => {
    const b = book({ chapters: { 'Cap01.xhtml': '<a href="https://ejemplo.com/x">fuera</a>' } })
    expect(findBrokenLinks(b)).toEqual([])
  })

  it('propone la ruta buena cuando el archivo está en otra carpeta', () => {
    const b = book({
      chapters: { 'Cap01.xhtml': '<a href="Notas.xhtml">notas</a>' },
      extra: { 'OEBPS/Misc/Notas.xhtml': '<html><body><p>n</p></body></html>' },
    })
    const [l] = findBrokenLinks(b)
    expect(l.suggestion?.raw).toBe('../Misc/Notas.xhtml')
  })

  it('conserva el ancla al proponer el arreglo', () => {
    const b = book({
      chapters: { 'Cap01.xhtml': '<a href="Notas.xhtml#n1">notas</a>' },
      extra: { 'OEBPS/Misc/Notas.xhtml': '<html><body><p id="n1">n</p></body></html>' },
    })
    expect(findBrokenLinks(b)[0].suggestion?.raw).toBe('../Misc/Notas.xhtml#n1')
  })

  it('arregla el id que solo falla en las mayúsculas', () => {
    const b = book({ chapters: { 'Cap01.xhtml': '<p id="Nota1">x</p><a href="#nota1">ir</a>' } })
    expect(findBrokenLinks(b)[0].suggestion?.raw).toBe('#Nota1')
  })

  it('no propone nada si hay dos archivos con el mismo nombre', () => {
    const b = book({
      chapters: { 'Cap01.xhtml': '<a href="Notas.xhtml">notas</a>' },
      extra: {
        'OEBPS/Misc/Notas.xhtml': '<html><body>a</body></html>',
        'OEBPS/Otros/Notas.xhtml': '<html><body>b</body></html>',
      },
    })
    expect(findBrokenLinks(b)[0].suggestion).toBeUndefined()
  })

  it('aplica el arreglo en el texto', () => {
    const b = book({
      chapters: { 'Cap01.xhtml': '<a href="Notas.xhtml">notas</a>' },
      extra: { 'OEBPS/Misc/Notas.xhtml': '<html><body><p>n</p></body></html>' },
    })
    const roto = findBrokenLinks(b)
    expect(fixLinks(b, roto)).toBe(1)
    expect(b.files.get('OEBPS/Text/Cap01.xhtml')!.text).toContain('href="../Misc/Notas.xhtml"')
    expect(findBrokenLinks(b)).toEqual([])
  })

  it('arregla varios del mismo archivo sin descolocarse', () => {
    const b = book({
      chapters: { 'Cap01.xhtml': '<a href="Uno.xhtml">1</a>\n<a href="Dos.xhtml">2</a>' },
      extra: {
        'OEBPS/Misc/Uno.xhtml': '<html><body>1</body></html>',
        'OEBPS/Misc/Dos.xhtml': '<html><body>2</body></html>',
      },
    })
    expect(fixLinks(b, findBrokenLinks(b))).toBe(2)
    const text = b.files.get('OEBPS/Text/Cap01.xhtml')!.text!
    expect(text).toContain('href="../Misc/Uno.xhtml"')
    expect(text).toContain('href="../Misc/Dos.xhtml"')
  })

  it('no escribe nada si el archivo cambió por debajo', () => {
    const b = book({
      chapters: { 'Cap01.xhtml': '<a href="Notas.xhtml">notas</a>' },
      extra: { 'OEBPS/Misc/Notas.xhtml': '<html><body>n</body></html>' },
    })
    const roto = findBrokenLinks(b)
    b.files.get('OEBPS/Text/Cap01.xhtml')!.text = '<html><body>otra cosa entera</body></html>'
    expect(fixLinks(b, roto)).toBe(0)
  })

  it('el manifest declara, no enlaza: sus hrefs no cuentan', () => {
    const b = book({ manifest: '<item id="c1" href="Text/NoExiste.xhtml" media-type="application/xhtml+xml"/>' })
    expect(findBrokenLinks(b).filter(l => l.file === 'OEBPS/content.opf')).toEqual([])
  })
})

describe('tamaños', () => {
  it('se leen de un vistazo', () => {
    expect(prettyBytes(512)).toBe('512 B')
    expect(prettyBytes(2048)).toBe('2 kB')
    expect(prettyBytes(3 * 1024 * 1024)).toBe('3.0 MB')
  })
})
