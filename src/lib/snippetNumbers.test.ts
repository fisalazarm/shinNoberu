import { describe, expect, it } from 'vitest'
import type { EpubBook, EpubFile } from './epub'
import { fillSlots, hasSlots, lastNumber, numberSnippet, slotPrefixes } from './snippetNumbers'

const SNIPPET = '<a href="notas.xhtml#nt{}" id="rf{}"><sup>❮{}❯</sup></a>'

const call = (n: number) => `<a href="notas.xhtml#nt${n}" id="rf${n}"><sup>❮${String(n).padStart(2, '0')}❯</sup></a>`

function book(chapters: string[], notes = ''): EpubBook {
  const files = new Map<string, EpubFile>()
  chapters.forEach((body, i) => {
    const path = `OEBPS/Text/Cap0${i + 1}.xhtml`
    files.set(path, { path, mediaType: 'application/xhtml+xml', text: `<html><body>${body}</body></html>` })
  })
  if (notes) files.set('OEBPS/Text/notas.xhtml', { path: 'OEBPS/Text/notas.xhtml', mediaType: 'application/xhtml+xml', text: notes })
  files.set('OEBPS/Images/x.png', { path: 'OEBPS/Images/x.png', mediaType: 'image/png', bytes: new Uint8Array(4) })
  return { files, opfPath: 'OEBPS/content.opf' }
}

const insert = (b: EpubBook, insert = SNIPPET) => numberSnippet({ name: 'nota', insert }, b).insert

describe('el ejemplo del snippet', () => {
  it('la primera nota del libro es la 1', () => {
    expect(insert(book(['<p>sin notas</p>']))).toBe(call(1))
  })

  it('dentro del sup va con dos cifras y fuera el número solo', () => {
    expect(insert(book([`<p>uno${call(1)} dos${call(2)}</p>`])))
      .toBe('<a href="notas.xhtml#nt3" id="rf3"><sup>❮03❯</sup></a>')
  })

  it('cuenta las notas de todos los capítulos', () => {
    const b = book([`<p>${call(1)}${call(2)}</p>`, `<p>${call(3)}${call(4)}</p>`])
    expect(insert(b)).toBe(call(5))
  })

  it('va por la más alta, aunque estén desordenadas', () => {
    expect(insert(book([`<p>${call(7)}</p>`, `<p>${call(2)}</p>`]))).toBe(call(8))
  })

  it('también mira el archivo de notas', () => {
    const b = book(['<p>nada</p>'], '<p id="nt12">una nota sin llamada todavía</p>')
    expect(insert(b)).toBe(call(13))
  })

  it('pasada la 9, el sup sigue con su número entero', () => {
    expect(insert(book([`<p>${call(9)}</p>`]))).toBe('<a href="notas.xhtml#nt10" id="rf10"><sup>❮10❯</sup></a>')
  })

  it('y pasada la 99 no recorta nada', () => {
    expect(insert(book([`<p>${call(99)}</p>`]))).toContain('<sup>❮100❯</sup>')
  })

  it('no se lía con ids parecidos que no son notas', () => {
    const b = book([`<p id="rf5b">otra cosa</p><p id="ntx">más</p>${call(2)}`])
    expect(insert(b)).toBe(call(3))
  })

  it('las notas de otro estilo no cuentan', () => {
    const b = book(['<a href="#nota8" id="ref8">[8]</a>'])
    expect(insert(b)).toBe(call(1))
  })
})

describe('los huecos', () => {
  it('{n} es siempre el número solo, también dentro de sup', () => {
    expect(fillSlots('<sup>{n}</sup>', 3)).toBe('<sup>3</sup>')
  })

  it('{nn} es siempre con dos cifras, también fuera', () => {
    expect(fillSlots('id="x{nn}"', 3)).toBe('id="x03"')
  })

  it('un sup con atributos también cuenta', () => {
    expect(fillSlots('<sup class="n">{}</sup> {}', 4)).toBe('<sup class="n">04</sup> 4')
  })

  it('reconoce qué prefijos numerar', () => {
    expect(slotPrefixes(SNIPPET).sort()).toEqual(['nt', 'rf'])
  })

  it('un snippet sin huecos sale tal cual', () => {
    const s = { name: 'cursiva', wrap: ['<em>', '</em>'] as [string, string] }
    expect(hasSlots(s)).toBe(false)
    expect(numberSnippet(s, book(['']))).toBe(s)
  })

  it('el cursor | se respeta', () => {
    expect(insert(book(['']), '<a href="#nt{}" id="rf{}">|</a>')).toBe('<a href="#nt1" id="rf1">|</a>')
  })

  it('en un snippet que envuelve, la apertura y el cierre se numeran juntos', () => {
    const s = { name: 'nota', wrap: ['<a id="rf{}"><sup>❮{}', '❯</sup></a>'] as [string, string] }
    expect(numberSnippet(s, book([`<p>${call(4)}</p>`])).wrap).toEqual(['<a id="rf5"><sup>❮05', '❯</sup></a>'])
  })

  it('sin ids que buscar, empieza por 1', () => {
    expect(lastNumber(book([`<p>${call(3)}</p>`]), [])).toBe(0)
    expect(insert(book([`<p>${call(3)}</p>`]), '<sup>{}</sup>')).toBe('<sup>01</sup>')
  })
})
