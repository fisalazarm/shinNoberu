// Prueba de extremo a extremo: montar un libro con todo lo nuevo, guardarlo
// como .epub de verdad, volver a abrirlo y comprobar que sigue entero.

import { describe, expect, it } from 'vitest'
import { addToOpf, loadEpub, parseManifest, saveEpub, spinePaths } from './epub'
import { newEpub, xhtmlTemplate } from './newEpub'
import { coverImagePath, readMetadata, setCover, writeMetadata, emptyMetadata } from './metadata'
import { regenerateToc } from './structure'
import { replaceAllInBook, defaultSearchOptions } from './searchBook'
import { validateBook } from './validate'

describe('ida y vuelta por el zip', () => {
  it('conserva metadatos, portada e índice al guardar y reabrir', async () => {
    const book = newEpub()

    // Un par de capítulos más.
    for (const [name, title] of [['Cap02.xhtml', 'El bosque'], ['Cap03.xhtml', 'La torre']]) {
      const path = `OEBPS/Text/${name}`
      book.files.set(path, {
        path,
        mediaType: 'application/xhtml+xml',
        text: xhtmlTemplate(title, '../Styles/style.css', '<p>Dijo "algo" y se fue.</p>'),
      })
      addToOpf(book, path)
    }

    // Portada.
    const img = 'OEBPS/Images/portada.jpg'
    book.files.set(img, { path: img, mediaType: 'image/jpeg', bytes: new Uint8Array([255, 216, 255, 217]) })
    expect(setCover(book, img)).toBe(true)

    // Metadatos.
    writeMetadata(book, {
      ...emptyMetadata,
      title: 'La torre del bosque',
      creator: 'Fabián Salazar',
      fileAs: 'Salazar, Fabián',
      language: 'es',
      isbn: '9788401337209',
      series: 'Crónicas',
      seriesIndex: '2',
      subjects: 'Fantasía',
    })

    // Comillas rectas a comillas latinas, en todo el libro.
    const replaced = replaceAllInBook(book, { ...defaultSearchOptions, query: '"' }, '«')
    expect(replaced).toBe(4)

    // Índice + ncx.
    const toc = regenerateToc(book, { maxLevel: 2, ncx: true })
    expect(toc?.headings.map(h => h.title)).toEqual(['Capítulo 1', 'El bosque', 'La torre'])

    // Guardar y reabrir.
    const bytes = await saveEpub(book)
    expect(bytes.length).toBeGreaterThan(0)
    const again = await loadEpub(bytes)

    // El mimetype va primero y sin comprimir (lo exige la especificación).
    expect(new TextDecoder().decode(bytes.slice(30, 38))).toBe('mimetype')
    expect(again.opfPath).toBe('OEBPS/content.opf')

    const m = readMetadata(again)
    expect(m.title).toBe('La torre del bosque')
    expect(m.creator).toBe('Fabián Salazar')
    expect(m.series).toBe('Crónicas')
    expect(m.seriesIndex).toBe('2')
    expect(m.isbn).toBe('9788401337209')
    expect(m.subjects).toBe('Fantasía')

    expect(coverImagePath(again)).toBe(img)
    expect(spinePaths(again)[0]).toBe('OEBPS/Text/cover.xhtml')
    expect(again.files.get('OEBPS/Text/toc.xhtml')!.text).toContain('<a href="Cap03.xhtml">La torre</a>')
    expect(again.files.get('OEBPS/toc.ncx')!.text).toContain('<text>El bosque</text>')
    expect(again.files.get('OEBPS/Text/Cap02.xhtml')!.text).toContain('«algo«')

    // La imagen sobrevive al zip tal cual.
    expect([...again.files.get(img)!.bytes!]).toEqual([255, 216, 255, 217])

    // Y el libro que sale no tiene ni un problema.
    expect(validateBook(again)).toEqual([])
  })

  it('el ncx y la portada quedan declarados en el manifest', async () => {
    const book = newEpub()
    const img = 'OEBPS/Images/p.png'
    book.files.set(img, { path: img, mediaType: 'image/png', bytes: new Uint8Array([1]) })
    setCover(book, img)
    regenerateToc(book, { ncx: true })

    const again = await loadEpub(await saveEpub(book))
    const items = parseManifest(again)
    expect(items.find(i => i.path === img)?.properties).toContain('cover-image')
    expect(items.find(i => i.path === 'OEBPS/toc.ncx')?.mediaType).toBe('application/x-dtbncx+xml')
    expect(items.find(i => i.path === 'OEBPS/Text/cover.xhtml')).toBeTruthy()
  })
})
