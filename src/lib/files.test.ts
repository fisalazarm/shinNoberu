import { describe, expect, it } from 'vitest'
import { addToOpf, parseManifest, spinePaths, type EpubBook } from './epub'
import { newEpub, xhtmlTemplate } from './newEpub'
import { copyPath, duplicateFile, planSeries, renameFile, renameSeries, seriesName } from './files'
import { readToc, regenerateToc } from './structure'
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

describe('renameFile', () => {
  it('arregla los enlaces de otros archivos, el manifest y el índice', () => {
    const book = newEpub()
    const dos = withChapter(book, 'Cap02.xhtml')
    regenerateToc(book)
    const uno = book.files.get('OEBPS/Text/Cap01.xhtml')!
    uno.text = uno.text!.replace('</body>', '<p><a href="Cap02.xhtml#x">ir</a></p></body>')

    expect(renameFile(book, dos, 'OEBPS/Text/Segundo.xhtml')).toBe(true)
    expect(book.files.has(dos)).toBe(false)
    expect(uno.text).toContain('href="Segundo.xhtml#x"')
    expect(spinePaths(book)).toContain('OEBPS/Text/Segundo.xhtml')
    expect(readToc(book).map(e => e.path)).toContain('OEBPS/Text/Segundo.xhtml')
    expect(validateBook(book).filter(p => p.severity === 'error')).toEqual([])
  })

  it('también los enlaces del archivo a sí mismo', () => {
    const book = newEpub()
    const dos = withChapter(book, 'Cap02.xhtml')
    const f = book.files.get(dos)!
    f.text = f.text!.replace('</body>', '<p><a href="Cap02.xhtml#n1">1</a></p></body>')
    renameFile(book, dos, 'OEBPS/Text/Otro.xhtml')
    expect(book.files.get('OEBPS/Text/Otro.xhtml')!.text).toContain('href="Otro.xhtml#n1"')
  })

  it('no pisa un archivo que ya existe', () => {
    const book = newEpub()
    const dos = withChapter(book, 'Cap02.xhtml')
    expect(renameFile(book, dos, 'OEBPS/Text/Cap01.xhtml')).toBe(false)
    expect(book.files.has(dos)).toBe(true)
  })
})

describe('renombrar en serie', () => {
  it('rellena el número con las cifras pedidas', () => {
    expect(seriesName('Cap{nn}.xhtml', 7)).toBe('Cap07.xhtml')
    expect(seriesName('cap-{nnn}.xhtml', 12)).toBe('cap-012.xhtml')
    expect(seriesName('{n}.xhtml', 12)).toBe('12.xhtml')
  })

  it('intercambiar nombres no pisa nada', () => {
    const book = newEpub()
    const dos = withChapter(book, 'Cap02.xhtml')
    const uno = 'OEBPS/Text/Cap01.xhtml'
    book.files.get(uno)!.text = book.files.get(uno)!.text!.replace('</body>', '<p>soy el uno</p></body>')
    book.files.get(dos)!.text = book.files.get(dos)!.text!.replace('</body>', '<p>soy el dos</p></body>')
    // El dos va primero en la lectura, así que pasa a llamarse Cap01.
    const { plan, error } = planSeries(book, [dos, uno], 'Cap{nn}.xhtml', 1)
    expect(error).toBeUndefined()
    expect(renameSeries(book, plan)).toBe(2)
    expect(book.files.get(uno)!.text).toContain('soy el dos')
    expect(book.files.get(dos)!.text).toContain('soy el uno')
    expect([...book.files.keys()].some(p => p.includes('~serie'))).toBe(false)
    expect(validateBook(book).filter(p => p.severity === 'error')).toEqual([])
  })

  it('avisa si el patrón no sirve o pisaría otro archivo', () => {
    const book = newEpub()
    const dos = withChapter(book, 'Cap02.xhtml')
    expect(planSeries(book, [dos], 'Capitulo.xhtml', 1).error).toMatch(/necesita/)
    expect(planSeries(book, [dos], 'Cap{nn}.txt', 1).error).toMatch(/xhtml/)
    expect(planSeries(book, [dos], 'Cap{nn}.xhtml', 1).error).toMatch(/Ya hay un Cap01/)
    expect(planSeries(book, [dos], 'Cap{nn}.xhtml', 2).error).toBeUndefined()
  })
})
