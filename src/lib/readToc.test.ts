import { describe, expect, it } from 'vitest'
import { addToOpf, type EpubBook } from './epub'
import { newEpub, xhtmlTemplate } from './newEpub'
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

const setNav = (book: EpubBook, ol: string) => {
  const nav = book.files.get('OEBPS/Text/toc.xhtml')!
  nav.text = nav.text!.replace(/<ol>[\s\S]*?<\/ol>/, ol)
}

describe('readToc', () => {
  it('lee las entradas del índice de un libro nuevo', () => {
    const toc = readToc(newEpub())
    expect(toc).toHaveLength(1)
    expect(toc[0].title).toBe('Capítulo 1')
    expect(toc[0].path).toBe('OEBPS/Text/Cap01.xhtml')
    expect(toc[0].hash).toBe('')
  })

  it('respeta la jerarquía de los h2 bajo su h1', () => {
    const book = newEpub()
    chapter(book, 'Cap02.xhtml', '<h1>El bosque</h1><h2>Un claro</h2><h2>Un río</h2>')
    regenerateToc(book, { maxLevel: 2 })

    const toc = readToc(book)
    const bosque = toc.find(e => e.title === 'El bosque')!
    expect(bosque.children.map(c => c.title)).toEqual(['Un claro', 'Un río'])
    expect(bosque.children[0].path).toBe('OEBPS/Text/Cap02.xhtml')
    expect(bosque.children[0].hash).toBe('un-claro')
  })

  it('separa la ruta del fragmento', () => {
    const book = newEpub()
    setNav(book, '<ol>\n      <li><a href="Cap01.xhtml#sec3">Tercera parte</a></li>\n    </ol>')
    const [e] = readToc(book)
    expect(e.path).toBe('OEBPS/Text/Cap01.xhtml')
    expect(e.hash).toBe('sec3')
  })

  it('resuelve las rutas relativas contra el nav', () => {
    const book = newEpub()
    setNav(book, '<ol>\n      <li><a href="../Text/Cap01.xhtml">Uno</a></li>\n    </ol>')
    expect(readToc(book)[0].path).toBe('OEBPS/Text/Cap01.xhtml')
  })

  it('quita las etiquetas del título', () => {
    const book = newEpub()
    setNav(book, '<ol>\n      <li><a href="Cap01.xhtml"><em>Tú</em> &amp; yo</a></li>\n    </ol>')
    expect(readToc(book)[0].title).toBe('Tú & yo')
  })

  it('no se lleva el nav de landmarks', () => {
    const toc = readToc(newEpub())
    expect(toc.some(e => e.title === 'Comienzo')).toBe(false)
  })

  it('aguanta tres niveles de anidamiento', () => {
    const book = newEpub()
    setNav(book, [
      '<ol>',
      '      <li><a href="Cap01.xhtml">Uno</a>',
      '        <ol>',
      '          <li><a href="Cap01.xhtml#a">Uno.a</a>',
      '            <ol><li><a href="Cap01.xhtml#b">Uno.a.b</a></li></ol>',
      '          </li>',
      '        </ol>',
      '      </li>',
      '    </ol>',
    ].join('\n'))

    const [uno] = readToc(book)
    expect(uno.title).toBe('Uno')
    expect(uno.children[0].title).toBe('Uno.a')
    expect(uno.children[0].children[0].title).toBe('Uno.a.b')
  })

  it('devuelve una lista vacía si el libro no tiene nav', () => {
    const book = newEpub()
    book.files.delete('OEBPS/Text/toc.xhtml')
    const opf = book.files.get(book.opfPath)!
    opf.text = opf.text!.replace(/<item id="nav"[^>]*\/>/, '')
    expect(readToc(book)).toEqual([])
  })
})
