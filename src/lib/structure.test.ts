import { describe, expect, it } from 'vitest'
import { addToOpf, spinePaths, type EpubBook } from './epub'
import { newEpub, xhtmlTemplate } from './newEpub'
import {
  buildNavOl, collectHeadings, moveSpineItem, plainText, regenerateToc, writeNcx,
} from './structure'

/** Añade un capítulo con el cuerpo dado y lo mete en el spine. */
function chapter(book: EpubBook, name: string, body: string) {
  const path = `OEBPS/Text/${name}`
  book.files.set(path, {
    path,
    mediaType: 'application/xhtml+xml',
    text: xhtmlTemplate(name, undefined, body).replace(/<h1>[^<]*<\/h1>/, ''),
  })
  addToOpf(book, path)
  return path
}

const nav = (book: EpubBook) => book.files.get('OEBPS/Text/toc.xhtml')!.text!

describe('plainText', () => {
  it('quita etiquetas y decodifica entidades', () => {
    expect(plainText('<em>Tú</em> &amp; yo')).toBe('Tú & yo')
  })

  it('descarta las llamadas a nota', () => {
    expect(plainText('Capítulo<a epub:type="noteref" href="#n1">[1]</a>')).toBe('Capítulo')
  })
})

describe('collectHeadings', () => {
  it('recoge los encabezados en orden de lectura', () => {
    const book = newEpub()
    chapter(book, 'Cap02.xhtml', '<h1>Segundo</h1>\n<h2>Una parte</h2>')

    const hs = collectHeadings(book)
    expect(hs.map(h => h.title)).toEqual(['Capítulo 1', 'Segundo', 'Una parte'])
    expect(hs.map(h => h.level)).toEqual([1, 1, 2])
  })

  it('respeta el nivel máximo', () => {
    const book = newEpub()
    chapter(book, 'Cap02.xhtml', '<h1>Dos</h1><h2>Sub</h2>')
    expect(collectHeadings(book, { maxLevel: 1 }).map(h => h.title)).toEqual(['Capítulo 1', 'Dos'])
  })

  it('no toca el libro si no se le pide asignar ids', () => {
    const book = newEpub()
    const before = book.files.get('OEBPS/Text/Cap01.xhtml')!.text
    collectHeadings(book)
    expect(book.files.get('OEBPS/Text/Cap01.xhtml')!.text).toBe(before)
  })

  it('pone un id a los encabezados que no lo tienen', () => {
    const book = newEpub()
    collectHeadings(book, { assignIds: true })
    expect(book.files.get('OEBPS/Text/Cap01.xhtml')!.text).toContain('<h1 id="capitulo-1">')
  })

  it('conserva el id que ya tenía', () => {
    const book = newEpub()
    chapter(book, 'Cap02.xhtml', '<h1 id="mio">Dos</h1>')
    collectHeadings(book, { assignIds: true })
    const text = book.files.get('OEBPS/Text/Cap02.xhtml')!.text!
    expect(text).toContain('<h1 id="mio">')
    expect(text.match(/id="/g)).toHaveLength(1)
  })

  it('no repite ids dentro de un mismo archivo', () => {
    const book = newEpub()
    chapter(book, 'Cap02.xhtml', '<h2>Parte</h2><h2>Parte</h2>')
    const hs = collectHeadings(book, { assignIds: true }).filter(h => h.title === 'Parte')
    expect(new Set(hs.map(h => h.id)).size).toBe(2)
  })
})

describe('buildNavOl', () => {
  it('anida los h2 dentro de su h1', () => {
    const hs = [
      { path: 'OEBPS/Text/Cap01.xhtml', id: 'a', level: 1, title: 'Uno', firstInFile: true },
      { path: 'OEBPS/Text/Cap01.xhtml', id: 'b', level: 2, title: 'Sub', firstInFile: false },
    ]
    const ol = buildNavOl(hs, 'OEBPS/Text/toc.xhtml')
    expect(ol).toContain('<li><a href="Cap01.xhtml">Uno</a>')
    expect(ol).toContain('<li><a href="Cap01.xhtml#b">Sub</a></li>')
    expect(ol.match(/<ol>/g)).toHaveLength(2)
  })
})

describe('regenerateToc', () => {
  it('reemplaza el índice con los encabezados encontrados', () => {
    const book = newEpub()
    chapter(book, 'Cap02.xhtml', '<h1>El bosque</h1>')

    const r = regenerateToc(book, { maxLevel: 2 })
    expect(r?.headings).toHaveLength(2)
    expect(nav(book)).toContain('<a href="Cap02.xhtml">El bosque</a>')
    // El <li> de la plantilla ya no está duplicado.
    expect(nav(book).match(/<a href="Cap01.xhtml">/g)).toHaveLength(1)
  })

  it('no deja listas antiguas dentro del nav al regenerar dos veces', () => {
    const book = newEpub()
    chapter(book, 'Cap02.xhtml', '<h1>Dos</h1><h2>Sub</h2>')
    regenerateToc(book, { maxLevel: 2 })
    const once = nav(book)
    regenerateToc(book, { maxLevel: 2 })
    expect(nav(book)).toBe(once)
  })

  it('mantiene el nav de landmarks intacto', () => {
    const book = newEpub()
    regenerateToc(book)
    expect(nav(book)).toContain('epub:type="landmarks"')
    expect(nav(book)).toContain('epub:type="bodymatter"')
  })

  it('genera toc.ncx si se pide', () => {
    const book = newEpub()
    const r = regenerateToc(book, { ncx: true })
    expect(r?.ncxPath).toBe('OEBPS/toc.ncx')
    const ncx = book.files.get('OEBPS/toc.ncx')!.text!
    expect(ncx).toContain('<text>Capítulo 1</text>')
    expect(ncx).toContain('<content src="Text/Cap01.xhtml"/>')
    expect(book.files.get(book.opfPath)!.text).toMatch(/<spine[^>]*toc="toc\.ncx"/)
  })
})

describe('writeNcx', () => {
  it('numera playOrder de forma creciente', () => {
    const book = newEpub()
    chapter(book, 'Cap02.xhtml', '<h1>Dos</h1><h2>Sub</h2>')
    writeNcx(book, collectHeadings(book, { maxLevel: 2, assignIds: true }))
    const orders = [...book.files.get('OEBPS/toc.ncx')!.text!.matchAll(/playOrder="(\d+)"/g)].map(m => Number(m[1]))
    expect(orders).toEqual([1, 2, 3])
  })
})

describe('moveSpineItem', () => {
  it('intercambia dos capítulos', () => {
    const book = newEpub()
    chapter(book, 'Cap02.xhtml', '<h1>Dos</h1>')
    expect(spinePaths(book)).toEqual(['OEBPS/Text/Cap01.xhtml', 'OEBPS/Text/Cap02.xhtml'])

    expect(moveSpineItem(book, 'OEBPS/Text/Cap02.xhtml', -1)).toBe(true)
    expect(spinePaths(book)).toEqual(['OEBPS/Text/Cap02.xhtml', 'OEBPS/Text/Cap01.xhtml'])
  })

  it('no hace nada en los extremos', () => {
    const book = newEpub()
    expect(moveSpineItem(book, 'OEBPS/Text/Cap01.xhtml', -1)).toBe(false)
    expect(moveSpineItem(book, 'OEBPS/Text/Cap01.xhtml', 1)).toBe(false)
  })

  it('conserva los atributos propios de cada itemref', () => {
    const book = newEpub()
    chapter(book, 'Cap02.xhtml', '<h1>Dos</h1>')
    const opf = book.files.get(book.opfPath)!
    opf.text = opf.text!.replace('<itemref idref="Cap02.xhtml"/>', '<itemref idref="Cap02.xhtml" linear="no"/>')

    moveSpineItem(book, 'OEBPS/Text/Cap02.xhtml', -1)
    expect(opf.text).toMatch(/<itemref idref="Cap02\.xhtml" linear="no"\/>/)
    expect(spinePaths(book)[0]).toBe('OEBPS/Text/Cap02.xhtml')
  })
})
