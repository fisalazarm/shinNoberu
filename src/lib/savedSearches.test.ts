import { beforeEach, describe, expect, it } from 'vitest'
import type { EpubBook } from './epub'
import {
  builtinSearches, deleteSearch, loadSearches, saveSearch,
} from './savedSearches'
import { defaultSearchOptions, replaceAllInBook } from './searchBook'

beforeEach(() => localStorage.clear())

const book = (text: string): EpubBook => ({
  opfPath: 'OEBPS/content.opf',
  files: new Map([
    ['OEBPS/Text/Cap01.xhtml', { path: 'OEBPS/Text/Cap01.xhtml', mediaType: 'application/xhtml+xml', text }],
    ['OEBPS/content.opf', { path: 'OEBPS/content.opf', mediaType: 'application/oebps-package+xml', text: '<package/>' }],
  ]),
})

const run = (name: string, text: string) => {
  const s = builtinSearches.find(x => x.name === name)!
  const b = book(text)
  replaceAllInBook(b, s.options, s.replacement)
  return b.files.get('OEBPS/Text/Cap01.xhtml')!.text
}

describe('guardar y recuperar', () => {
  it('sin nada guardado solo están las de fábrica', () => {
    expect(loadSearches()).toEqual(builtinSearches)
  })

  it('guarda una propia y la pone primero', () => {
    const list = saveSearch('mía', { ...defaultSearchOptions, query: 'x' }, 'y')
    expect(list[0]).toMatchObject({ name: 'mía', replacement: 'y', options: { query: 'x' } })
    expect(list).toHaveLength(builtinSearches.length + 1)
  })

  it('sobrevive a recargar', () => {
    saveSearch('mía', { ...defaultSearchOptions, query: 'x', regex: true }, 'y')
    expect(loadSearches()[0].options.regex).toBe(true)
  })

  it('guardar con el mismo nombre reemplaza, no duplica', () => {
    saveSearch('mía', { ...defaultSearchOptions, query: 'uno' }, '')
    const list = saveSearch('mía', { ...defaultSearchOptions, query: 'dos' }, '')
    expect(list.filter(s => s.name === 'mía')).toHaveLength(1)
    expect(list[0].options.query).toBe('dos')
  })

  it('ignora un nombre vacío', () => {
    expect(saveSearch('  ', defaultSearchOptions, '')).toEqual(builtinSearches)
  })

  it('borra las propias y deja las de fábrica', () => {
    saveSearch('mía', defaultSearchOptions, '')
    expect(deleteSearch('mía')).toEqual(builtinSearches)
    expect(deleteSearch(builtinSearches[0].name)).toEqual(builtinSearches)
  })

  it('completa las opciones que falten en algo guardado antiguo', () => {
    localStorage.setItem('epub-editor.searches', JSON.stringify([{ name: 'vieja', options: { query: 'x' } }]))
    const s = loadSearches()[0]
    expect(s.options.onlyText).toBe(true)
    expect(s.options.scope).toBe('text')
    expect(s.replacement).toBe('')
  })

  it('no se cae si lo guardado es basura', () => {
    localStorage.setItem('epub-editor.searches', 'no es json')
    expect(loadSearches()).toEqual(builtinSearches)
  })
})

describe('las de fábrica hacen lo que dicen', () => {
  it('pasa las comillas rectas a latinas', () => {
    expect(run('Comillas rectas → latinas', '<p>Dijo "hola" y se fue.</p>'))
      .toBe('<p>Dijo «hola» y se fue.</p>')
  })

  it('y no toca las comillas de los atributos', () => {
    expect(run('Comillas rectas → latinas', '<p class="a" id="b">nada</p>'))
      .toBe('<p class="a" id="b">nada</p>')
  })

  it('pone el apóstrofo tipográfico', () => {
    expect(run('Apóstrofo recto → tipográfico', "<p>D'Artagnan</p>")).toBe('<p>D’Artagnan</p>')
  })

  it('junta los tres puntos', () => {
    expect(run('Tres puntos → puntos suspensivos', '<p>Y entonces...</p>')).toBe('<p>Y entonces…</p>')
  })

  it('quita los espacios dobles sin comerse la sangría', () => {
    const src = '<body>\n  <p>uno  dos</p>\n  <p>tres</p>\n</body>'
    expect(run('Espacios dobles', src)).toBe('<body>\n  <p>uno dos</p>\n  <p>tres</p>\n</body>')
  })

  it('quita el espacio antes de la puntuación', () => {
    expect(run('Espacio antes de puntuación', '<p>¿Qué pasa ? Nada .</p>')).toBe('<p>¿Qué pasa? Nada.</p>')
  })

  it('cambia el guion que abre el diálogo por una raya', () => {
    expect(run('Guion de diálogo → raya', '<p>- Buenos días.</p>')).toBe('<p>—Buenos días.</p>')
  })

  it('pero no los guiones de dentro de la frase', () => {
    expect(run('Guion de diálogo → raya', '<p>Un tira-y-afloja</p>')).toBe('<p>Un tira-y-afloja</p>')
  })
})
