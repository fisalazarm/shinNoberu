import { describe, expect, it } from 'vitest'
import type { EpubBook } from './epub'
import { newEpub } from './newEpub'
import { validateBook } from './validate'

const codes = (book: EpubBook) => validateBook(book).map(p => p.code)
const cap01 = (book: EpubBook) => book.files.get('OEBPS/Text/Cap01.xhtml')!

function setBody(book: EpubBook, body: string) {
  const f = cap01(book)
  f.text = f.text!.replace('<p></p>', body)
}

describe('validateBook', () => {
  it('un libro nuevo solo se queja de que falta la portada', () => {
    expect(codes(newEpub())).toEqual(['no-cover'])
  })

  it('detecta imágenes y enlaces que no existen', () => {
    const book = newEpub()
    setBody(book, '<p><img src="../Images/no-esta.jpg" alt="x"/></p>')
    const broken = validateBook(book).filter(p => p.code === 'broken-link')
    expect(broken).toHaveLength(1)
    expect(broken[0].file).toBe('OEBPS/Text/Cap01.xhtml')
    expect(broken[0].line).toBeGreaterThan(1)
  })

  it('no se queja de enlaces externos', () => {
    const book = newEpub()
    setBody(book, '<p><a href="https://example.com">fuera</a></p>')
    expect(codes(book)).not.toContain('broken-link')
  })

  it('detecta ids repetidos, que rompen las notas al pie', () => {
    const book = newEpub()
    setBody(book, '<p id="nota1">una</p><p id="nota1">otra</p>')
    const dup = validateBook(book).filter(p => p.code === 'duplicate-id')
    expect(dup).toHaveLength(1)
    expect(dup[0].message).toContain('nota1')
    expect(dup[0].severity).toBe('error')
  })

  it('detecta un enlace a un id que no existe', () => {
    const book = newEpub()
    setBody(book, '<p><a href="#nota9">[9]</a></p>')
    const frag = validateBook(book).filter(p => p.code === 'broken-fragment')
    expect(frag).toHaveLength(1)
    expect(frag[0].severity).toBe('warning')
  })

  it('acepta un enlace a un id que sí existe', () => {
    const book = newEpub()
    setBody(book, '<p><a href="#nota1">[1]</a></p><aside id="nota1">nota</aside>')
    expect(codes(book)).not.toContain('broken-fragment')
  })

  it('detecta XHTML mal formado', () => {
    const book = newEpub()
    setBody(book, '<p>sin cerrar</div>')
    const bad = validateBook(book).filter(p => p.code === 'malformed')
    expect(bad).toHaveLength(1)
    expect(bad[0].severity).toBe('error')
  })

  it('avisa de las entidades HTML que XHTML no conoce', () => {
    const book = newEpub()
    setBody(book, '<p>uno&nbsp;dos</p>')
    const ent = validateBook(book).filter(p => p.code === 'undefined-entity')
    expect(ent).toHaveLength(1)
    expect(ent[0].severity).toBe('warning')
    expect(ent[0].message).toContain('&#160;')
  })

  it('avisa de las imágenes sin alt', () => {
    const book = newEpub()
    book.files.set('OEBPS/Images/x.jpg', { path: 'OEBPS/Images/x.jpg', mediaType: 'image/jpeg', bytes: new Uint8Array([1]) })
    setBody(book, '<p><img src="../Images/x.jpg"/></p>')
    expect(codes(book)).toContain('img-no-alt')
  })

  it('avisa de los archivos que no están en el manifest', () => {
    const book = newEpub()
    book.files.set('OEBPS/Images/huerfana.jpg', { path: 'OEBPS/Images/huerfana.jpg', mediaType: 'image/jpeg', bytes: new Uint8Array([1]) })
    const orphan = validateBook(book).filter(p => p.code === 'not-in-manifest')
    expect(orphan).toHaveLength(1)
    expect(orphan[0].file).toBe('OEBPS/Images/huerfana.jpg')
  })

  it('detecta un capítulo del manifest que no está en el spine', () => {
    const book = newEpub()
    const opf = book.files.get(book.opfPath)!
    opf.text = opf.text!.replace('<itemref idref="Cap01.xhtml"/>', '')
    expect(codes(book)).toContain('not-in-spine')
    expect(codes(book)).toContain('empty-spine')
  })

  it('explica el problema cuando el OPF está roto, en vez de callarse', () => {
    const book = newEpub()
    const opf = book.files.get(book.opfPath)!
    opf.text = opf.text!.replace('</manifest>', '')

    const problems = validateBook(book)
    expect(problems[0].code).toBe('opf-malformed')
    expect(problems[0].severity).toBe('error')
    // Es lo único que se informa: sin OPF no tiene sentido lo demás.
    expect(problems.filter(p => p.code !== 'opf-malformed')).toHaveLength(0)
  })

  it('detecta que container.xml apunta a otro sitio', () => {
    const book = newEpub()
    const c = book.files.get('META-INF/container.xml')!
    c.text = c.text!.replace('OEBPS/content.opf', 'otro/content.opf')
    expect(codes(book)).toContain('container-mismatch')
  })

  it('detecta que falta el índice de EPUB 3', () => {
    const book = newEpub()
    const opf = book.files.get(book.opfPath)!
    opf.text = opf.text!.replace(' properties="nav"', '')
    expect(codes(book)).toContain('no-nav')
  })

  it('pone los errores antes que los avisos', () => {
    const book = newEpub()
    setBody(book, '<p id="a"></p><p id="a"><img src="x.jpg"/></p>')
    const list = validateBook(book)
    const firstWarning = list.findIndex(p => p.severity === 'warning')
    const lastError = list.map(p => p.severity).lastIndexOf('error')
    expect(lastError).toBeLessThan(firstWarning)
  })
})
