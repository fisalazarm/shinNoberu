import { describe, expect, it } from 'vitest'
import type { EpubBook } from './epub'
import {
  defaultSearchOptions, replaceAllInBook, replaceMatch, searchBook, textRanges,
} from './searchBook'

function book(files: Record<string, string>): EpubBook {
  const map = new Map()
  for (const [path, text] of Object.entries(files)) {
    map.set(path, {
      path,
      mediaType: path.endsWith('.css') ? 'text/css' : 'application/xhtml+xml',
      text,
    })
  }
  map.set('OEBPS/content.opf', { path: 'OEBPS/content.opf', mediaType: 'application/oebps-package+xml', text: '<package/>' })
  return { files: map, opfPath: 'OEBPS/content.opf' }
}

const opts = (patch = {}) => ({ ...defaultSearchOptions, ...patch })

describe('searchBook', () => {
  it('encuentra coincidencias en varios capítulos', () => {
    const b = book({
      'OEBPS/Text/Cap01.xhtml': '<p>dijo "hola"</p>',
      'OEBPS/Text/Cap02.xhtml': '<p>otra vez "hola" y "adiós"</p>',
    })
    const r = searchBook(b, opts({ query: '"' }))
    expect(r.total).toBe(6)
    expect(r.files).toHaveLength(2)
  })

  it('ignora mayúsculas salvo que se pida lo contrario', () => {
    const b = book({ 'OEBPS/Text/Cap01.xhtml': 'Kazuto y kazuto' })
    expect(searchBook(b, opts({ query: 'kazuto' })).total).toBe(2)
    expect(searchBook(b, opts({ query: 'kazuto', caseSensitive: true })).total).toBe(1)
  })

  it('respeta la opción de palabra completa', () => {
    const b = book({ 'OEBPS/Text/Cap01.xhtml': 'casa casas casa' })
    expect(searchBook(b, opts({ query: 'casa' })).total).toBe(3)
    expect(searchBook(b, opts({ query: 'casa', wholeWord: true })).total).toBe(2)
  })

  it('solo mira los capítulos salvo que el ámbito sea "all"', () => {
    const b = book({ 'OEBPS/Text/Cap01.xhtml': 'serif', 'OEBPS/Styles/style.css': 'font-family: serif;' })
    expect(searchBook(b, opts({ query: 'serif' })).total).toBe(1)
    expect(searchBook(b, opts({ query: 'serif', scope: 'all' })).total).toBe(2)
  })

  it('da la línea y el contexto de cada coincidencia', () => {
    const b = book({ 'OEBPS/Text/Cap01.xhtml': 'linea uno\nlinea dos con aguja aquí\n' })
    const m = searchBook(b, opts({ query: 'aguja' })).files[0].matches[0]
    expect(m.line).toBe(2)
    expect(m.hit).toBe('aguja')
    expect(m.before).toContain('linea dos con ')
    expect(m.after).toContain(' aquí')
  })

  it('avisa si la expresión regular no compila', () => {
    const b = book({ 'OEBPS/Text/Cap01.xhtml': 'x' })
    const r = searchBook(b, opts({ query: '(sin cerrar', regex: true }))
    expect(r.error).toBeTruthy()
    expect(r.total).toBe(0)
  })

  it('no se cuelga con una regex que acepta la cadena vacía', () => {
    const b = book({ 'OEBPS/Text/Cap01.xhtml': 'abc' })
    const r = searchBook(b, opts({ query: 'x*', regex: true }))
    expect(r.total).toBeGreaterThan(0)
    expect(r.total).toBeLessThan(100)
  })
})

describe('textRanges', () => {
  it('deja fuera lo que va dentro de las etiquetas', () => {
    const text = '<p class="a">hola</p>'
    expect(textRanges(text).map(([s, e]) => text.slice(s, e))).toEqual(['hola'])
  })

  it('también deja fuera los comentarios', () => {
    const text = 'uno<!-- nota "x" -->dos'
    expect(textRanges(text).map(([s, e]) => text.slice(s, e))).toEqual(['uno', 'dos'])
  })

  it('un archivo sin etiquetas es todo texto', () => {
    expect(textRanges('body { color: red }')).toEqual([[0, 19]])
  })
})

describe('no tocar las etiquetas', () => {
  const markup = '<p class="dialogo" id="x">Dijo "hola" y se fue.</p>'

  it('por defecto ignora las comillas de los atributos', () => {
    const b = book({ 'OEBPS/Text/Cap01.xhtml': markup })
    expect(searchBook(b, opts({ query: '"' })).total).toBe(2)
  })

  it('las encuentra todas si se desactiva', () => {
    const b = book({ 'OEBPS/Text/Cap01.xhtml': markup })
    expect(searchBook(b, opts({ query: '"', onlyText: false })).total).toBe(6)
  })

  it('el reemplazo masivo no destroza el marcado', () => {
    const b = book({ 'OEBPS/Text/Cap01.xhtml': markup })
    expect(replaceAllInBook(b, opts({ query: '"' }), '«')).toBe(2)
    expect(b.files.get('OEBPS/Text/Cap01.xhtml')!.text)
      .toBe('<p class="dialogo" id="x">Dijo «hola« y se fue.</p>')
  })

  it('una coincidencia suelta tampoco cae en un atributo', () => {
    const b = book({ 'OEBPS/Text/Cap01.xhtml': markup })
    const o = opts({ query: '"' })
    const m = searchBook(b, o).files[0].matches[0]
    replaceMatch(b, m, o, '«')
    expect(b.files.get('OEBPS/Text/Cap01.xhtml')!.text)
      .toBe('<p class="dialogo" id="x">Dijo «hola" y se fue.</p>')
  })
})

describe('replaceAllInBook', () => {
  it('reemplaza en todos los capítulos y devuelve la cuenta', () => {
    const b = book({
      'OEBPS/Text/Cap01.xhtml': '<p>"hola"</p>',
      'OEBPS/Text/Cap02.xhtml': '<p>"adiós"</p>',
    })
    expect(replaceAllInBook(b, opts({ query: '"' }), '«')).toBe(4)
    expect(b.files.get('OEBPS/Text/Cap01.xhtml')!.text).toBe('<p>«hola«</p>')
  })

  it('trata los $ como texto cuando no es regex', () => {
    const b = book({ 'OEBPS/Text/Cap01.xhtml': 'precio' })
    replaceAllInBook(b, opts({ query: 'precio' }), '$10')
    expect(b.files.get('OEBPS/Text/Cap01.xhtml')!.text).toBe('$10')
  })

  it('usa los grupos cuando es regex', () => {
    const b = book({ 'OEBPS/Text/Cap01.xhtml': '<p>— Hola</p>' })
    replaceAllInBook(b, opts({ query: '— (\\w+)', regex: true }), '—$1')
    expect(b.files.get('OEBPS/Text/Cap01.xhtml')!.text).toBe('<p>—Hola</p>')
  })
})

describe('replaceMatch', () => {
  it('cambia solo la coincidencia elegida', () => {
    const b = book({ 'OEBPS/Text/Cap01.xhtml': 'uno dos uno' })
    const o = opts({ query: 'uno' })
    const second = searchBook(b, o).files[0].matches[1]
    expect(replaceMatch(b, second, o, 'tres')).toBe('tres')
    expect(b.files.get('OEBPS/Text/Cap01.xhtml')!.text).toBe('uno dos tres')
  })

  it('no hace nada si el archivo cambió y la coincidencia ya no está ahí', () => {
    const b = book({ 'OEBPS/Text/Cap01.xhtml': 'uno dos' })
    const o = opts({ query: 'dos' })
    const m = searchBook(b, o).files[0].matches[0]
    b.files.get('OEBPS/Text/Cap01.xhtml')!.text = 'otra cosa entera'
    expect(replaceMatch(b, m, o, 'x')).toBeNull()
  })
})

describe('ignorar las etiquetas', () => {
  // "de una vez" partido por un <em> en medio.
  const partido = '<p>Lo dijo de <em>una</em> vez y se fue.</p>'

  it('sin la opción no encuentra la frase partida', () => {
    expect(searchBook(book({ 'OEBPS/Text/Cap01.xhtml': partido }), opts({ query: 'de una vez' })).total).toBe(0)
  })

  it('con la opción sí la encuentra', () => {
    const r = searchBook(book({ 'OEBPS/Text/Cap01.xhtml': partido }), opts({ query: 'de una vez', ignoreTags: true }))
    expect(r.total).toBe(1)
    expect(r.files[0].matches[0].spansTags).toBe(true)
  })

  it('apunta al trozo del original que incluye la etiqueta', () => {
    const r = searchBook(book({ 'OEBPS/Text/Cap01.xhtml': partido }), opts({ query: 'de una vez', ignoreTags: true }))
    const m = r.files[0].matches[0]
    expect(partido.slice(m.from, m.to)).toBe('de <em>una</em> vez')
  })

  it('lo que no cruza ninguna etiqueta no se marca', () => {
    const r = searchBook(book({ 'OEBPS/Text/Cap01.xhtml': partido }), opts({ query: 'se fue', ignoreTags: true }))
    expect(r.files[0].matches[0].spansTags).toBeUndefined()
  })

  it('no reemplaza lo que atraviesa una etiqueta', () => {
    const b = book({ 'OEBPS/Text/Cap01.xhtml': partido })
    const o = opts({ query: 'de una vez', ignoreTags: true })
    expect(replaceAllInBook(b, o, 'YA')).toBe(0)
    expect(b.files.get('OEBPS/Text/Cap01.xhtml')!.text).toBe(partido)
  })

  it('pero sí reemplaza lo que cabe entre dos etiquetas', () => {
    const b = book({ 'OEBPS/Text/Cap01.xhtml': partido })
    const o = opts({ query: 'se fue', ignoreTags: true })
    expect(replaceAllInBook(b, o, 'volvió')).toBe(1)
    expect(b.files.get('OEBPS/Text/Cap01.xhtml')!.text).toContain('y volvió.')
  })

  it('tampoco de una en una', () => {
    const b = book({ 'OEBPS/Text/Cap01.xhtml': partido })
    const o = opts({ query: 'de una vez', ignoreTags: true })
    const m = searchBook(b, o).files[0].matches[0]
    expect(replaceMatch(b, m, o, 'YA')).toBeNull()
  })

  it('sigue sin mirar dentro de los atributos', () => {
    const src = '<p class="una">Lo dijo de <em>una</em> vez.</p>'
    const r = searchBook(book({ 'OEBPS/Text/Cap01.xhtml': src }), opts({ query: 'una', ignoreTags: true }))
    expect(r.total).toBe(1)
  })
})

describe('reemplazo con grupos', () => {
  it('funciona con una regex que mira hacia atrás', () => {
    // El trozo encontrado ("  ") no vuelve a coincidir con la regex si se la
    // pasa sola: el reemplazo tiene que salir de la coincidencia original.
    const b = book({ 'OEBPS/Text/Cap01.xhtml': '<p>uno  dos</p>' })
    expect(replaceAllInBook(b, opts({ query: '(?<=\\S) {2,}', regex: true }), ' ')).toBe(1)
    expect(b.files.get('OEBPS/Text/Cap01.xhtml')!.text).toBe('<p>uno dos</p>')
  })

  it('entiende $& y $$', () => {
    const b = book({ 'OEBPS/Text/Cap01.xhtml': 'nota' })
    replaceAllInBook(b, opts({ query: 'nota', regex: true }), '[$&] $$')
    expect(b.files.get('OEBPS/Text/Cap01.xhtml')!.text).toBe('[nota] $')
  })

  it('entiende los grupos con nombre', () => {
    const b = book({ 'OEBPS/Text/Cap01.xhtml': 'Cap 7' })
    replaceAllInBook(b, opts({ query: 'Cap (?<n>\\d+)', regex: true }), 'Capítulo $<n>')
    expect(b.files.get('OEBPS/Text/Cap01.xhtml')!.text).toBe('Capítulo 7')
  })

  it('deja estar un $9 que no existe', () => {
    const b = book({ 'OEBPS/Text/Cap01.xhtml': 'x' })
    replaceAllInBook(b, opts({ query: 'x', regex: true }), 'a$9b')
    expect(b.files.get('OEBPS/Text/Cap01.xhtml')!.text).toBe('a$9b')
  })

  it('con varias coincidencias cada una usa sus propios grupos', () => {
    const b = book({ 'OEBPS/Text/Cap01.xhtml': '<p>— Hola</p><p>— Adiós</p>' })
    replaceAllInBook(b, opts({ query: '— (\\w+)', regex: true }), '—$1')
    expect(b.files.get('OEBPS/Text/Cap01.xhtml')!.text).toBe('<p>—Hola</p><p>—Adiós</p>')
  })
})
