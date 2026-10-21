import { describe, expect, it } from 'vitest'
import { parseManifest, spinePaths, type EpubBook } from './epub'
import { newEpub } from './newEpub'
import {
  clearCover, coverImagePath, emptyMetadata, readMetadata, setCover, writeMetadata,
} from './metadata'

/** Añade una imagen de mentira al libro (sin pasar por el manifest). */
function withImage(book: EpubBook, path = 'OEBPS/Images/portada.jpg') {
  book.files.set(path, { path, mediaType: 'image/jpeg', bytes: new Uint8Array([1, 2, 3]) })
  return path
}

const opf = (book: EpubBook) => book.files.get(book.opfPath)!.text!

describe('readMetadata', () => {
  it('lee lo que trae la plantilla de libro nuevo', () => {
    const m = readMetadata(newEpub())
    expect(m.title).toBe('Libro sin título')
    expect(m.creator).toBe('Autor')
    expect(m.language).toBe('es')
    expect(m.identifier).toMatch(/^urn:uuid:/)
  })
})

describe('writeMetadata', () => {
  it('guarda y vuelve a leer todos los campos', () => {
    const book = newEpub()
    const input = {
      ...emptyMetadata,
      title: 'El nombre del viento',
      creator: 'Patrick Rothfuss',
      fileAs: 'Rothfuss, Patrick',
      language: 'es',
      identifier: 'urn:uuid:1234',
      isbn: '978-84-01-33720-9',
      publisher: 'Plaza & Janés',
      date: '2009-03-01',
      description: 'Primer libro de la crónica.',
      subjects: 'Fantasía, Aventuras',
      series: 'Crónica del asesino de reyes',
      seriesIndex: '1',
    }
    expect(writeMetadata(book, input)).toBe(true)

    const out = readMetadata(book)
    expect(out).toEqual({ ...input, isbn: '9788401337209' })
  })

  it('conserva la declaración XML del OPF', () => {
    const book = newEpub()
    writeMetadata(book, { ...emptyMetadata, title: 'X' })
    expect(opf(book).startsWith('<?xml version="1.0" encoding="utf-8"?>')).toBe(true)
  })

  it('escapa los caracteres especiales del título', () => {
    const book = newEpub()
    writeMetadata(book, { ...emptyMetadata, title: 'Tú & yo <siempre>' })
    expect(opf(book)).toContain('Tú &amp; yo &lt;siempre&gt;')
    expect(readMetadata(book).title).toBe('Tú & yo <siempre>')
  })

  it('actualiza dcterms:modified', () => {
    const book = newEpub()
    writeMetadata(book, { ...emptyMetadata, title: 'X' })
    expect(opf(book)).toMatch(/property="dcterms:modified">\d{4}-\d{2}-\d{2}T/)
  })

  it('quita la saga y sus refinamientos cuando se deja vacía', () => {
    const book = newEpub()
    writeMetadata(book, { ...emptyMetadata, title: 'X', series: 'Saga', seriesIndex: '2' })
    expect(opf(book)).toContain('belongs-to-collection')

    writeMetadata(book, { ...emptyMetadata, title: 'X' })
    expect(opf(book)).not.toContain('belongs-to-collection')
    expect(opf(book)).not.toContain('group-position')
    expect(readMetadata(book).series).toBe('')
  })

  it('no deja dos identificadores principales al guardar dos veces', () => {
    const book = newEpub()
    writeMetadata(book, { ...emptyMetadata, title: 'X', identifier: 'urn:uuid:abc' })
    writeMetadata(book, { ...emptyMetadata, title: 'X', identifier: 'urn:uuid:abc' })
    expect(opf(book).match(/<dc:identifier/g)).toHaveLength(1)
  })

  it('genera un identificador si viene vacío', () => {
    const book = newEpub()
    writeMetadata(book, { ...emptyMetadata, title: 'X' })
    expect(readMetadata(book).identifier).toMatch(/^urn:uuid:/)
  })
})

describe('setCover', () => {
  it('declara la imagen, crea el XHTML y lo pone primero', () => {
    const book = newEpub()
    const img = withImage(book)
    expect(setCover(book, img)).toBe(true)

    const item = parseManifest(book).find(i => i.path === img)
    expect(item?.properties).toContain('cover-image')
    expect(opf(book)).toContain('name="cover"')
    expect(coverImagePath(book)).toBe(img)

    const docPath = 'OEBPS/Text/cover.xhtml'
    expect(book.files.has(docPath)).toBe(true)
    expect(book.files.get(docPath)!.text).toContain('src="../Images/portada.jpg"')
    expect(spinePaths(book)[0]).toBe(docPath)
  })

  it('no duplica el XHTML al cambiar de imagen', () => {
    const book = newEpub()
    setCover(book, withImage(book, 'OEBPS/Images/una.jpg'))
    setCover(book, withImage(book, 'OEBPS/Images/otra.jpg'))

    const covers = [...book.files.keys()].filter(p => /cover\.xhtml$/.test(p))
    expect(covers).toHaveLength(1)
    expect(book.files.get(covers[0])!.text).toContain('src="../Images/otra.jpg"')
    expect(coverImagePath(book)).toBe('OEBPS/Images/otra.jpg')
    // Solo una imagen queda marcada.
    const marked = parseManifest(book).filter(i => i.properties?.includes('cover-image'))
    expect(marked).toHaveLength(1)
  })

  it('añade la entrada de portada a landmarks', () => {
    const book = newEpub()
    setCover(book, withImage(book))
    expect(book.files.get('OEBPS/Text/toc.xhtml')!.text).toContain('epub:type="cover"')
  })

  it('mantiene el capítulo en el spine detrás de la portada', () => {
    const book = newEpub()
    setCover(book, withImage(book))
    expect(spinePaths(book)).toEqual(['OEBPS/Text/cover.xhtml', 'OEBPS/Text/Cap01.xhtml'])
  })
})

describe('clearCover', () => {
  it('deja de declarar la portada sin borrar los archivos', () => {
    const book = newEpub()
    const img = withImage(book)
    setCover(book, img)
    clearCover(book)

    expect(opf(book)).not.toContain('cover-image')
    expect(opf(book)).not.toContain('name="cover"')
    expect(book.files.has(img)).toBe(true)
  })
})
