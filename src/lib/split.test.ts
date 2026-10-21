import { describe, expect, it } from 'vitest'
import { addToOpf, spinePaths, type EpubBook } from './epub'
import { newEpub } from './newEpub'
import { docShell, planSplit, splitChapter } from './split'
import { validateBook } from './validate'

const CHAPTER = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="es" lang="es">
<head>
  <title>Todo junto</title>
  <link href="../Styles/style.css" rel="stylesheet" type="text/css"/>
</head>
<body>
  <section epub:type="chapter" role="doc-chapter">
    <h1>El bosque</h1>
    <p>Primero.</p>
    <h1>La torre</h1>
    <p>Segundo.</p>
    <h2>Un desván</h2>
    <p>Tercero.</p>
  </section>
</body>
</html>
`

/** Libro con un capítulo largo en OEBPS/Text/Largo.xhtml. */
function bookWithChapter(text = CHAPTER): { book: EpubBook; path: string } {
  const book = newEpub()
  const path = 'OEBPS/Text/Largo.xhtml'
  book.files.set(path, { path, mediaType: 'application/xhtml+xml', text })
  addToOpf(book, path)
  return { book, path }
}

const wellFormed = (text: string) =>
  !new DOMParser().parseFromString(text, 'application/xml').querySelector('parsererror')

describe('docShell', () => {
  it('toma el <section> como envoltorio y lo deja en la cabecera', () => {
    const shell = docShell(CHAPTER)!
    expect(shell.prologue).toContain('<section epub:type="chapter"')
    expect(shell.prologue.endsWith('>')).toBe(true)
    expect(shell.content.trimStart().startsWith('<h1>El bosque</h1>')).toBe(true)
    expect(shell.epilogue.startsWith('\n  </section>')).toBe(true)
  })

  it('reconstruye el documento original al juntar las tres partes', () => {
    const s = docShell(CHAPTER)!
    expect(s.prologue + s.content + s.epilogue).toBe(CHAPTER)
  })

  it('sin <section> usa el <body> directamente', () => {
    const text = '<html><body>\n  <p>Suelto</p>\n</body></html>\n'
    const s = docShell(text)!
    expect(s.content.trim()).toBe('<p>Suelto</p>')
    expect(s.epilogue.startsWith('\n</body>')).toBe(true)
  })

  it('no toca el cuerpo si hay varios <section>', () => {
    const text = '<html><body>\n<section><p>a</p></section>\n<section><p>b</p></section>\n</body></html>'
    expect(docShell(text)!.content).toContain('<section><p>a</p></section>')
  })

  it('devuelve null si no hay <body>', () => {
    expect(docShell('<html><head></head></html>')).toBeNull()
  })
})

describe('planSplit por encabezados', () => {
  it('corta en cada h1 sin contar el primero', () => {
    const { book, path } = bookWithChapter()
    const plan = planSplit(book, path, { kind: 'headings', level: 1 })!
    expect(plan.pieces.map(p => p.title)).toEqual(['El bosque', 'La torre'])
    expect(plan.names).toEqual(['Largo-2.xhtml'])
  })

  it('con nivel 2 corta también en los h2', () => {
    const { book, path } = bookWithChapter()
    const plan = planSplit(book, path, { kind: 'headings', level: 2 })!
    expect(plan.pieces.map(p => p.title)).toEqual(['El bosque', 'La torre', 'Un desván'])
    expect(plan.names).toEqual(['Largo-2.xhtml', 'Largo-3.xhtml'])
  })

  it('un solo encabezado al principio no da nada que partir', () => {
    const { book, path } = bookWithChapter(CHAPTER.replace(/<h1>La torre<\/h1>[\s\S]*?(?=  <\/section>)/, ''))
    expect(planSplit(book, path, { kind: 'headings', level: 1 })!.pieces).toHaveLength(1)
  })

  it('no choca con un nombre que ya existe', () => {
    const { book, path } = bookWithChapter()
    const taken = 'OEBPS/Text/Largo-2.xhtml'
    book.files.set(taken, { path: taken, mediaType: 'application/xhtml+xml', text: '<html/>' })
    expect(planSplit(book, path, { kind: 'headings', level: 1 })!.names).toEqual(['Largo-3.xhtml'])
  })
})

describe('planSplit en el cursor', () => {
  it('corta por el principio de la línea del cursor', () => {
    const { book, path } = bookWithChapter()
    const offset = CHAPTER.indexOf('<h1>La torre') + 4 // a media etiqueta
    const plan = planSplit(book, path, { kind: 'cursor', offset })!
    expect(plan.pieces).toHaveLength(2)
    expect(plan.pieces[1].content.trimStart().startsWith('<h1>La torre')).toBe(true)
    expect(plan.pieces[1].title).toBe('La torre')
  })

  it('no parte si el cursor está antes de todo', () => {
    const { book, path } = bookWithChapter()
    const offset = CHAPTER.indexOf('<h1>El bosque')
    expect(planSplit(book, path, { kind: 'cursor', offset })!.pieces).toHaveLength(1)
  })
})

describe('splitChapter', () => {
  it('reparte el contenido y deja los archivos bien formados', () => {
    const { book, path } = bookWithChapter()
    const r = splitChapter(book, path, { kind: 'headings', level: 2 })!

    expect(r.created).toEqual(['OEBPS/Text/Largo-2.xhtml', 'OEBPS/Text/Largo-3.xhtml'])

    const kept = book.files.get(path)!.text!
    const dos = book.files.get(r.created[0])!.text!
    const tres = book.files.get(r.created[1])!.text!

    for (const t of [kept, dos, tres]) expect(wellFormed(t)).toBe(true)

    expect(kept).toContain('<h1>El bosque</h1>')
    expect(kept).not.toContain('La torre')
    expect(dos).toContain('<h1>La torre</h1>')
    expect(dos).toContain('<p>Segundo.</p>')
    expect(dos).not.toContain('Un desván')
    expect(tres).toContain('<h2>Un desván</h2>')
  })

  it('conserva la cabecera: hoja de estilos y envoltorio', () => {
    const { book, path } = bookWithChapter()
    const r = splitChapter(book, path, { kind: 'headings', level: 1 })!
    const dos = book.files.get(r.created[0])!.text!
    expect(dos).toContain('href="../Styles/style.css"')
    expect(dos).toContain('<section epub:type="chapter" role="doc-chapter">')
    expect(dos).toContain('</section>')
  })

  it('pone el <title> de cada trozo nuevo y no toca el del original', () => {
    const { book, path } = bookWithChapter()
    const r = splitChapter(book, path, { kind: 'headings', level: 1 })!
    expect(book.files.get(path)!.text).toContain('<title>Todo junto</title>')
    expect(book.files.get(r.created[0])!.text).toContain('<title>La torre</title>')
  })

  it('mantiene la sangría del contenido', () => {
    const { book, path } = bookWithChapter()
    const r = splitChapter(book, path, { kind: 'headings', level: 1 })!
    expect(book.files.get(r.created[0])!.text).toContain('>\n    <h1>La torre</h1>')
  })

  it('mete los archivos nuevos en el spine justo detrás, en orden', () => {
    const { book, path } = bookWithChapter()
    const r = splitChapter(book, path, { kind: 'headings', level: 2 })!
    expect(spinePaths(book)).toEqual([
      'OEBPS/Text/Cap01.xhtml',
      path,
      r.created[0],
      r.created[1],
    ])
  })

  it('el libro resultante no tiene problemas nuevos', () => {
    const { book, path } = bookWithChapter()
    const before = validateBook(book).map(p => p.code)
    splitChapter(book, path, { kind: 'headings', level: 2 })
    const after = validateBook(book).map(p => p.code)
    // Los trozos nuevos están en el manifest y en el spine; solo queda lo de antes.
    expect(after.filter(c => c !== 'no-cover')).toEqual(before.filter(c => c !== 'no-cover'))
  })

  it('devuelve null cuando no hay nada que partir', () => {
    const book = newEpub()
    expect(splitChapter(book, 'OEBPS/Text/Cap01.xhtml', { kind: 'headings', level: 1 })).toBeNull()
  })
})
