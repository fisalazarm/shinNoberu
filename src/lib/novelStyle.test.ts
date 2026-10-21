import { describe, expect, it } from 'vitest'
import type { EpubBook } from './epub'
import {
  applyNovelStyle, cssFor, defaultNovelStyle, readStyle, styleSheetFor, writeBlock,
} from './novelStyle'

const OPF = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
  <metadata/>
  <manifest>
    <item id="c1" href="Text/Cap01.xhtml" media-type="application/xhtml+xml"/>
    <item id="c2" href="Text/Cap02.xhtml" media-type="application/xhtml+xml"/>
    <item id="s" href="Styles/style.css" media-type="text/css"/>
    <item id="o" href="Styles/otra.css" media-type="text/css"/>
  </manifest>
  <spine>
    <itemref idref="c1"/>
    <itemref idref="c2"/>
  </spine>
</package>`

const chapter = (inner: string) => `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>Uno</title><link href="../Styles/style.css" rel="stylesheet" type="text/css"/></head>
<body>
${inner}
</body>
</html>`

function book(chapters: string[], css = ''): EpubBook {
  const files = new Map<string, { path: string; mediaType: string; text: string }>()
  chapters.forEach((inner, i) => {
    const path = `OEBPS/Text/Cap0${i + 1}.xhtml`
    files.set(path, { path, mediaType: 'application/xhtml+xml', text: chapter(inner) })
  })
  files.set('OEBPS/Styles/otra.css', { path: 'OEBPS/Styles/otra.css', mediaType: 'text/css', text: 'a { color: red }' })
  files.set('OEBPS/Styles/style.css', { path: 'OEBPS/Styles/style.css', mediaType: 'text/css', text: css })
  files.set('OEBPS/content.opf', { path: 'OEBPS/content.opf', mediaType: 'application/oebps-package+xml', text: OPF })
  return { files: files as EpubBook['files'], opfPath: 'OEBPS/content.opf' }
}

const sheet = (b: EpubBook) => b.files.get('OEBPS/Styles/style.css')!.text!
const cap = (b: EpubBook, n = 1) => b.files.get(`OEBPS/Text/Cap0${n}.xhtml`)!.text!

describe('el bloque de la hoja de estilos', () => {
  it('se reemplaza en vez de acumularse', () => {
    const once = writeBlock('p { color: red }\n', cssFor(defaultNovelStyle))
    const twice = writeBlock(once, cssFor({ ...defaultNovelStyle, lineHeight: 2 }))
    expect(twice.match(/estilos de novela \(los gestiona/g)).toHaveLength(1)
    expect(twice).toContain('line-height: 2;')
    expect(twice).not.toContain('line-height: 1.5;')
  })

  it('no toca lo que el autor escribió fuera', () => {
    const out = writeBlock('p.mio { color: red }\n', cssFor(defaultNovelStyle))
    expect(out).toContain('p.mio { color: red }')
    const after = writeBlock(out + '\n.posterior { margin: 0 }\n', cssFor(defaultNovelStyle))
    expect(after).toContain('p.mio { color: red }')
    expect(after).toContain('.posterior { margin: 0 }')
  })

  it('escribe en la hoja que enlaza el primer capítulo', () => {
    expect(styleSheetFor(book(['<p>uno</p>']))).toBe('OEBPS/Styles/style.css')
  })

  it('devuelve los ajustes que quedaron guardados', () => {
    const b = book(['<p>uno</p>'])
    applyNovelStyle(b, { ...defaultNovelStyle, lineHeight: 1.8, scene: '❧' })
    const back = readStyle(b)
    expect(back?.lineHeight).toBe(1.8)
    expect(back?.scene).toBe('❧')
  })

  it('sin ajustes guardados no inventa ninguno', () => {
    expect(readStyle(book(['<p>uno</p>']))).toBeNull()
  })
})

describe('la capitular', () => {
  it('va en el primer párrafo con texto, no en los siguientes', () => {
    const b = book(['<p>Primero</p>\n<p>Segundo</p>'])
    expect(applyNovelStyle(b, defaultNovelStyle)?.chapters).toBe(1)
    expect(cap(b)).toContain('<p class="capitular">Primero</p>')
    expect(cap(b)).toContain('<p>Segundo</p>')
  })

  it('respeta las clases que el párrafo ya tenía', () => {
    const b = book(['<p class="intro">Primero</p>'])
    applyNovelStyle(b, defaultNovelStyle)
    expect(cap(b)).toContain('class="intro capitular"')
  })

  it('no se pone dos veces al volver a aplicar', () => {
    const b = book(['<p>Primero</p>'])
    applyNovelStyle(b, defaultNovelStyle)
    applyNovelStyle(b, defaultNovelStyle)
    expect(cap(b).match(/capitular/g)).toHaveLength(1)
  })

  it('se quita al apagarla', () => {
    const b = book(['<p>Primero</p>'])
    applyNovelStyle(b, defaultNovelStyle)
    applyNovelStyle(b, { ...defaultNovelStyle, dropCap: 0 })
    expect(cap(b)).toContain('<p>Primero</p>')
    expect(sheet(b)).not.toContain('::first-letter')
  })

  it('marca cada capítulo', () => {
    const b = book(['<p>Uno</p>', '<p>Dos</p>'])
    expect(applyNovelStyle(b, defaultNovelStyle)?.chapters).toBe(2)
    expect(cap(b, 2)).toContain('<p class="capitular">Dos</p>')
  })

  it('su tamaño sale de las líneas que ocupa', () => {
    expect(cssFor({ ...defaultNovelStyle, dropCap: 3, lineHeight: 1.5 })).toContain('font-size: 4.5em;')
  })
})

describe('los saltos de escena', () => {
  it('reconoce los asteriscos y pone el ornamento', () => {
    const b = book(['<p>Uno</p>\n<p>* * *</p>\n<p>Dos</p>'])
    expect(applyNovelStyle(b, defaultNovelStyle)?.scenes).toBe(1)
    expect(cap(b)).toContain('<p class="escena">⁂</p>')
  })

  it('cambiar el ornamento alcanza a los ya marcados', () => {
    const b = book(['<p>Uno</p>\n<p>***</p>'])
    applyNovelStyle(b, defaultNovelStyle)
    applyNovelStyle(b, { ...defaultNovelStyle, scene: '❧' })
    expect(cap(b)).toContain('<p class="escena">❧</p>')
    expect(cap(b)).not.toContain('⁂')
  })

  it('deja en paz una raya de diálogo', () => {
    const b = book(['<p>— Buenos días.</p>\n<p>— Y a ti.</p>'])
    expect(applyNovelStyle(b, defaultNovelStyle)?.scenes).toBe(0)
    expect(cap(b)).toContain('<p>— Y a ti.</p>')
  })

  it('tampoco toca un párrafo normal corto', () => {
    const b = book(['<p>Sí.</p>\n<p>No.</p>'])
    expect(applyNovelStyle(b, defaultNovelStyle)?.scenes).toBe(0)
  })

  it('con el ornamento vacío no se mete con ellos', () => {
    const b = book(['<p>Uno</p>\n<p>* * *</p>'])
    expect(applyNovelStyle(b, { ...defaultNovelStyle, scene: '' })?.scenes).toBe(0)
    expect(cap(b)).toContain('<p>* * *</p>')
  })

  it('el separador no se lleva la capitular', () => {
    const b = book(['<p>***</p>\n<p>Empieza aquí</p>'])
    applyNovelStyle(b, defaultNovelStyle)
    expect(cap(b)).toContain('<p class="capitular">Empieza aquí</p>')
  })
})

describe('seguridad', () => {
  it('no se come los $ del texto', () => {
    const b = book(['<p>Costaba $100</p>\n<p>y $200 más</p>'])
    applyNovelStyle(b, defaultNovelStyle)
    expect(cap(b)).toContain('Costaba $100')
    expect(cap(b)).toContain('y $200 más')
  })

  it('deja intacto lo que hay fuera del body', () => {
    const b = book(['<p>Uno</p>'])
    applyNovelStyle(b, defaultNovelStyle)
    expect(cap(b)).toContain('<title>Uno</title>')
    expect(cap(b)).toContain('<?xml version="1.0" encoding="utf-8"?>')
  })

  it('avisa si el libro no tiene hoja de estilos', () => {
    const b = book(['<p>Uno</p>'])
    b.files.delete('OEBPS/Styles/style.css')
    b.files.delete('OEBPS/Styles/otra.css')
    expect(applyNovelStyle(b, defaultNovelStyle)).toBeNull()
  })

  it('sin sangría pone aire entre párrafos', () => {
    const css = cssFor({ ...defaultNovelStyle, indent: 0 })
    expect(css).toContain('margin: 0 0 0.9em;')
    expect(css).not.toContain('text-indent: 1.2em;')
  })
})
