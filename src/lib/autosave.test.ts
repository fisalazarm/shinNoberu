// Solo los ayudantes puros: IndexedDB no existe en el entorno de pruebas.

import { describe, expect, it } from 'vitest'
import { newEpub } from './newEpub'
import { bookBytes, bookToDraft, draftToBook, timeAgo } from './autosave'

describe('timeAgo', () => {
  const now = Date.UTC(2026, 0, 10, 12, 0, 0)
  const ago = (ms: number) => timeAgo(now - ms, now)

  it('redondea a la unidad que se entiende', () => {
    expect(ago(5_000)).toBe('hace unos segundos')
    expect(ago(60_000)).toBe('hace 1 minuto')
    expect(ago(8 * 60_000)).toBe('hace 8 minutos')
    expect(ago(2 * 3_600_000)).toBe('hace 2 horas')
    expect(ago(3 * 86_400_000)).toBe('hace 3 días')
  })

  it('no da tiempos negativos si el reloj se mueve', () => {
    expect(timeAgo(now + 10_000, now)).toBe('hace unos segundos')
  })
})

describe('bookBytes', () => {
  it('cuenta el texto y los binarios', () => {
    const book = newEpub()
    const soloTexto = bookBytes(book)
    expect(soloTexto).toBeGreaterThan(0)

    book.files.set('OEBPS/Images/x.jpg', {
      path: 'OEBPS/Images/x.jpg',
      mediaType: 'image/jpeg',
      bytes: new Uint8Array(1000),
    })
    expect(bookBytes(book)).toBe(soloTexto + 1000)
  })
})

describe('bookToDraft', () => {
  it('guarda el libro y los datos para recuperarlo', () => {
    const book = newEpub()
    const d = bookToDraft(book, { fileName: 'libro.epub', active: 'OEBPS/Text/Cap01.xhtml' })!

    expect(d.fileName).toBe('libro.epub')
    expect(d.opfPath).toBe(book.opfPath)
    expect(d.files.size).toBe(book.files.size)
    expect(d.savedAt).toBeLessThanOrEqual(Date.now())
  })

  it('se niega con un libro demasiado grande para clonarlo', () => {
    const book = newEpub()
    book.files.set('OEBPS/Images/enorme.jpg', {
      path: 'OEBPS/Images/enorme.jpg',
      mediaType: 'image/jpeg',
      bytes: new Uint8Array(130 * 1024 * 1024),
    })
    expect(bookToDraft(book, { fileName: 'x.epub', active: 'a' })).toBeNull()
  })

  it('vuelve a dar un libro utilizable', () => {
    const book = newEpub()
    const again = draftToBook(bookToDraft(book, { fileName: 'x.epub', active: 'a' })!)
    expect(again.opfPath).toBe(book.opfPath)
    expect(again.files.get('OEBPS/Text/Cap01.xhtml')!.text).toContain('Capítulo 1')
  })
})
