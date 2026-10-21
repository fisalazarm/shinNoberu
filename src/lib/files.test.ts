import { describe, expect, it } from 'vitest'
import { addToOpf, parseManifest, spinePaths, type EpubBook } from './epub'
import { newEpub, xhtmlTemplate } from './newEpub'
import { copyPath, duplicateFile } from './files'
import { validateBook } from './validate'

function withChapter(book: EpubBook, name: string) {
  const path = `OEBPS/Text/${name}`
  book.files.set(path, {
    path,
    mediaType: 'application/xhtml+xml',
    text: xhtmlTemplate(name, '../Styles/style.css', '<p>Contenido</p>'),
  })
  addToOpf(book, path)
  return path
}

describe('copyPath', () => {
  it('añade "-copia" antes de la extensión', () => {
    expect(copyPath(newEpub(), 'OEBPS/Text/Cap01.xhtml')).toBe('OEBPS/Text/Cap01-copia.xhtml')
  })

  it('numera si la copia ya existe', () => {
    const book = newEpub()
    const taken = 'OEBPS/Text/Cap01-copia.xhtml'
    book.files.set(taken, { path: taken, mediaType: 'application/xhtml+xml', text: '' })
    expect(copyPath(book, 'OEBPS/Text/Cap01.xhtml')).toBe('OEBPS/Text/Cap01-copia-2.xhtml')
  })

  it('aguanta un archivo sin extensión', () => {
    expect(copyPath(newEpub(), 'mimetype')).toBe('mimetype-copia')
  })
})

describe('duplicateFile', () => {
  it('copia el contenido tal cual', () => {
    const book = newEpub()
    const src = book.files.get('OEBPS/Text/Cap01.xhtml')!
    const copy = duplicateFile(book, src.path)!
    expect(book.files.get(copy)!.text).toBe(src.text)
    expect(book.files.get(copy)!.mediaType).toBe(src.mediaType)
  })

  it('mete la copia justo detrás en el orden de lectura', () => {
    const book = newEpub()
    withChapter(book, 'Cap02.xhtml')
    const copy = duplicateFile(book, 'OEBPS/Text/Cap01.xhtml')!
    expect(spinePaths(book)).toEqual([
      'OEBPS/Text/Cap01.xhtml',
      copy,
      'OEBPS/Text/Cap02.xhtml',
    ])
  })

  it('la declara en el manifest', () => {
    const book = newEpub()
    const copy = duplicateFile(book, 'OEBPS/Text/Cap01.xhtml')!
    expect(parseManifest(book).some(i => i.path === copy)).toBe(true)
  })

  it('clona los bytes en vez de compartir el búfer', () => {
    const book = newEpub()
    const img = 'OEBPS/Images/x.png'
    book.files.set(img, { path: img, mediaType: 'image/png', bytes: new Uint8Array([1, 2, 3]) })
    const copy = duplicateFile(book, img)!

    book.files.get(img)!.bytes![0] = 9
    expect([...book.files.get(copy)!.bytes!]).toEqual([1, 2, 3])
  })

  it('una imagen duplicada no entra en el orden de lectura', () => {
    const book = newEpub()
    const img = 'OEBPS/Images/x.png'
    book.files.set(img, { path: img, mediaType: 'image/png', bytes: new Uint8Array([1]) })
    const before = spinePaths(book).length
    duplicateFile(book, img)
    expect(spinePaths(book)).toHaveLength(before)
  })

  it('el libro resultante sigue sin errores', () => {
    const book = newEpub()
    duplicateFile(book, 'OEBPS/Text/Cap01.xhtml')
    expect(validateBook(book).filter(p => p.severity === 'error')).toEqual([])
  })

  it('devuelve null si el archivo no existe', () => {
    expect(duplicateFile(newEpub(), 'OEBPS/Text/nada.xhtml')).toBeNull()
  })
})
