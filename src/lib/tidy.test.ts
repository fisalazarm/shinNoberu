import { describe, expect, it } from 'vitest'
import { addToOpf } from './epub'
import { newEpub } from './newEpub'
import {
  applyTidy, defaultTidyOptions, noTidyRules, tidyBook, tidyChanges, type TidyOptions,
} from './tidy'

const opts = (patch: Partial<TidyOptions> = {}): TidyOptions => ({ ...defaultTidyOptions, ...patch })
const only = (k: keyof TidyOptions): TidyOptions => ({ ...noTidyRules, [k]: true })

describe('comillas', () => {
  it('abre y cierra según lo que haya delante', () => {
    expect(applyTidy('<p>Dijo "hola" y se fue.</p>', only('quotes')))
      .toBe('<p>Dijo «hola» y se fue.</p>')
  })

  it('no toca las comillas de los atributos', () => {
    const src = '<p class="dialogo" id="x">Dijo "hola".</p>'
    expect(applyTidy(src, only('quotes'))).toBe('<p class="dialogo" id="x">Dijo «hola».</p>')
  })

  it('abre tras un paréntesis o una apertura de interrogación', () => {
    expect(applyTidy('<p>¿"Qué"?</p>', only('quotes'))).toBe('<p>¿«Qué»?</p>')
  })
})

describe('raya de diálogo', () => {
  it('cambia el guion de apertura por una raya', () => {
    expect(applyTidy('<p>\n- Hola\n</p>', only('dashes'))).toBe('<p>\n—Hola\n</p>')
  })

  it('también con dos guiones', () => {
    expect(applyTidy('<p>\n--Hola\n</p>', only('dashes'))).toBe('<p>\n—Hola\n</p>')
  })

  it('respeta la sangría de la línea', () => {
    expect(applyTidy('<p>\n    - Hola\n</p>', only('dashes'))).toBe('<p>\n    —Hola\n</p>')
  })

  it('no toca un guion en mitad de la frase', () => {
    expect(applyTidy('<p>bien-sabido</p>', only('dashes'))).toBe('<p>bien-sabido</p>')
  })
})

describe('espacios y puntos', () => {
  it('junta los espacios dobles', () => {
    expect(applyTidy('<p>uno  dos   tres</p>', only('doubleSpaces'))).toBe('<p>uno dos tres</p>')
  })

  it('cambia los espacios duros por normales', () => {
    expect(applyTidy('<p>uno\u00a0dos\u202ftres</p>', only('hardSpaces'))).toBe('<p>uno dos tres</p>')
  })

  it('convierte los tres puntos', () => {
    expect(applyTidy('<p>Vaya...</p>', only('ellipsis'))).toBe('<p>Vaya…</p>')
  })

  it('quita los espacios del final de línea', () => {
    expect(applyTidy('<p>uno   \ndos</p>', only('trailing'))).toBe('<p>uno\ndos</p>')
  })
})

describe('tidyChanges', () => {
  it('no deja dos cambios pisándose', () => {
    const text = '<p>uno  \ndos</p>' // espacio doble que además va al final de linea
    const changes = tidyChanges(text, opts())
    for (let i = 1; i < changes.length; i++) {
      expect(changes[i].from).toBeGreaterThanOrEqual(changes[i - 1].to)
    }
    expect(applyTidy(text, opts())).toBe('<p>uno\ndos</p>')
  })

  it('dice qué regla pilló cada cambio', () => {
    const changes = tidyChanges('<p>"a"  b...</p>', opts())
    expect(new Set(changes.map(c => c.rule))).toEqual(new Set(['quotes', 'doubleSpaces', 'ellipsis']))
  })

  it('no encuentra nada en un texto ya limpio', () => {
    expect(tidyChanges('<p>«Hola», dijo. Nada más…</p>', opts())).toEqual([])
  })
})

describe('tidyBook', () => {
  it('limpia solo el capítulo pedido', () => {
    const book = newEpub()
    const second = 'OEBPS/Text/Cap02.xhtml'
    book.files.set(second, { path: second, mediaType: 'application/xhtml+xml', text: '<p>"b"</p>' })
    addToOpf(book, second)
    const first = book.files.get('OEBPS/Text/Cap01.xhtml')!
    first.text = '<p>"a"</p>'

    const done = tidyBook(book, only('quotes'), second)
    expect(done).toEqual([{ path: second, changes: 2 }])
    expect(first.text).toBe('<p>"a"</p>')
    expect(book.files.get(second)!.text).toBe('<p>«b»</p>')
  })

  it('limpia todo el libro si no se le pide un capítulo', () => {
    const book = newEpub()
    book.files.get('OEBPS/Text/Cap01.xhtml')!.text = '<p>"a"</p>'
    expect(tidyBook(book, only('quotes'))).toHaveLength(1)
  })

  it('no toca el CSS ni el OPF', () => {
    const book = newEpub()
    const css = book.files.get('OEBPS/Styles/style.css')!
    const before = css.text
    css.text = `${before}\n.x { font-family: "Georgia" }`
    tidyBook(book, opts())
    expect(css.text).toContain('"Georgia"')
  })
})

describe('la sangría del XHTML', () => {
  const doc = '<body>\n    <p>uno  dos</p>\n    <p>tres</p>\n</body>'

  it('no se toca al juntar los espacios dobles', () => {
    expect(applyTidy(doc, only('doubleSpaces')))
      .toBe('<body>\n    <p>uno dos</p>\n    <p>tres</p>\n</body>')
  })

  it('tampoco con todas las reglas a la vez', () => {
    expect(applyTidy(doc, opts())).toContain('\n    <p>tres</p>')
  })

  it('solo cuenta los espacios dobles de verdad', () => {
    const changes = tidyChanges(doc, only('doubleSpaces'))
    expect(changes).toHaveLength(1)
  })
})
