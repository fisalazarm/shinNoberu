import { describe, expect, it } from 'vitest'
import { addToOpf, spinePaths, type EpubBook } from './epub'
import { newEpub, xhtmlTemplate } from './newEpub'
import { mergeChapters } from './merge'
import { validateBook } from './validate'
import { readToc, regenerateToc } from './structure'

function chapter(book: EpubBook, name: string, body: string) {
  const path = `OEBPS/Text/${name}`
  book.files.set(path, {
    path,
    mediaType: 'application/xhtml+xml',
    text: xhtmlTemplate(name, '../Styles/style.css', body).replace(/<h1>[^<]*<\/h1>/, ''),
  })
  addToOpf(book, path)
  return path
}

const text = (book: EpubBook, p: string) => book.files.get(p)!.text!

describe('mergeChapters', () => {
  it('junta el contenido en el primero del orden de lectura', () => {
    const book = newEpub()
    const a = 'OEBPS/Text/Cap01.xhtml'
    const b = chapter(book, 'Cap02.xhtml', '<h1>El bosque</h1><p>Segundo.</p>')

    const r = mergeChapters(book, [b, a])!
    expect(r.kept).toBe(a)
    expect(r.absorbed).toEqual([b])
    expect(text(book, a)).toContain('<h1>El bosque</h1>')
    expect(text(book, a)).toContain('<p>Segundo.</p>')
  })

  it('borra los absorbidos del libro y del spine', () => {
    const book = newEpub()
    const a = 'OEBPS/Text/Cap01.xhtml'
    const b = chapter(book, 'Cap02.xhtml', '<h1>Dos</h1>')
    mergeChapters(book, [a, b])

    expect(book.files.has(b)).toBe(false)
    expect(spinePaths(book)).toEqual([a])
  })

  it('el resultado sigue siendo XML bien formado', () => {
    const book = newEpub()
    const a = 'OEBPS/Text/Cap01.xhtml'
    const b = chapter(book, 'Cap02.xhtml', '<h1>Dos</h1><p>Texto.</p>')
    mergeChapters(book, [a, b])

    const doc = new DOMParser().parseFromString(text(book, a), 'application/xml')
    expect(doc.querySelector('parsererror')).toBeNull()
  })

  it('no deja una cabecera ni un <body> de más', () => {
    const book = newEpub()
    const a = 'OEBPS/Text/Cap01.xhtml'
    const b = chapter(book, 'Cap02.xhtml', '<h1>Dos</h1>')
    mergeChapters(book, [a, b])

    expect(text(book, a).match(/<body/g)).toHaveLength(1)
    expect(text(book, a).match(/<head>/g)).toHaveLength(1)
  })

  it('el índice deja de apuntar al vacío', () => {
    const book = newEpub()
    const a = 'OEBPS/Text/Cap01.xhtml'
    const b = chapter(book, 'Cap02.xhtml', '<h1>El bosque</h1>')
    regenerateToc(book, { maxLevel: 1 })
    expect(readToc(book).some(e => e.path === b)).toBe(true)

    mergeChapters(book, [a, b])
    const toc = readToc(book)
    expect(toc.every(e => e.path !== b)).toBe(true)
    expect(toc.some(e => e.path === a && e.hash.startsWith('union-'))).toBe(true)
  })

  it('pone el ancla donde empieza el capítulo absorbido', () => {
    const book = newEpub()
    const a = 'OEBPS/Text/Cap01.xhtml'
    const b = chapter(book, 'Cap02.xhtml', '<h1>El bosque</h1>')
    regenerateToc(book, { maxLevel: 1 })
    mergeChapters(book, [a, b])

    const merged = text(book, a)
    expect(merged).toContain('id="union-cap02"')
    expect(merged.indexOf('id="union-cap02"')).toBeLessThan(merged.indexOf('El bosque'))
  })

  it('sin nadie que enlace no mete anclas de adorno', () => {
    const book = newEpub()
    const a = 'OEBPS/Text/Cap01.xhtml'
    const b = chapter(book, 'Cap02.xhtml', '<h1>Dos</h1>')
    // Se quita el índice para que nada apunte a Cap02.
    book.files.get('OEBPS/Text/toc.xhtml')!.text = '<html><body></body></html>'

    mergeChapters(book, [a, b])
    expect(text(book, a)).not.toContain('union-cap02')
  })

  it('un enlace a un id concreto conserva ese id', () => {
    const book = newEpub()
    const a = 'OEBPS/Text/Cap01.xhtml'
    const b = chapter(book, 'Cap02.xhtml', '<h1 id="bosque">El bosque</h1>')
    book.files.get(a)!.text = text(book, a).replace(
      '<p></p>',
      '<p><a href="Cap02.xhtml#bosque">ir</a></p>',
    )

    mergeChapters(book, [a, b])
    expect(text(book, a)).toContain('href="Cap01.xhtml#bosque"')
  })

  it('el libro resultante no tiene errores', () => {
    const book = newEpub()
    const a = 'OEBPS/Text/Cap01.xhtml'
    const b = chapter(book, 'Cap02.xhtml', '<h1>Dos</h1><p>Texto.</p>')
    regenerateToc(book, { maxLevel: 1 })
    mergeChapters(book, [a, b])

    expect(validateBook(book).filter(p => p.severity === 'error')).toEqual([])
  })

  it('hace falta más de uno', () => {
    const book = newEpub()
    expect(mergeChapters(book, ['OEBPS/Text/Cap01.xhtml'])).toBeNull()
  })

  it('ignora lo que no sea un capítulo', () => {
    const book = newEpub()
    expect(mergeChapters(book, ['OEBPS/Text/Cap01.xhtml', 'OEBPS/Styles/style.css'])).toBeNull()
  })
})
