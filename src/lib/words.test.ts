import { describe, expect, it } from 'vitest'
import { addToOpf } from './epub'
import { newEpub } from './newEpub'
import { bookWords, countWords } from './words'

describe('countWords', () => {
  it('no cuenta las etiquetas', () => {
    expect(countWords('<p class="x">Tres palabras aquí</p>')).toBe(3)
  })

  it('no cuenta los signos sueltos', () => {
    expect(countWords('<p>— Hola ◇ adiós</p>')).toBe(2)
  })

  it('no cuenta las llamadas a nota', () => {
    expect(countWords('<p>Palabra<a epub:type="noteref" href="#n1">[1]</a> otra</p>')).toBe(2)
  })

  it('cuenta las palabras con acentos y ñ como una', () => {
    expect(countWords('<p>El niño comió rápido</p>')).toBe(4)
  })

  it('un documento vacío da cero', () => {
    expect(countWords('<p></p>')).toBe(0)
  })
})

describe('bookWords', () => {
  it('suma los capítulos del orden de lectura', () => {
    const book = newEpub()
    const path = 'OEBPS/Text/Cap02.xhtml'
    book.files.set(path, {
      path,
      mediaType: 'application/xhtml+xml',
      text: '<html><body><p>una dos tres</p></body></html>',
    })
    addToOpf(book, path)
    // Cap01 trae "Capítulo 1" del encabezado de la plantilla.
    expect(bookWords(book)).toBe(2 + 3)
  })

  it('no cuenta el índice', () => {
    const book = newEpub()
    const sinNav = bookWords(book)
    expect(book.files.get('OEBPS/Text/toc.xhtml')!.text).toContain('Índice')
    expect(sinNav).toBe(2) // solo "Capítulo 1"
  })
})
