import { describe, expect, it } from 'vitest'
import type { EpubBook, EpubFile } from './epub'
import { fillSnippet, snippetVars, type FillResult } from './snippetFill'
import { chooseNumber } from './snippetNumbers'
import type { Snippet } from './snippets'

const LLAMADA = '<a href="notas.xhtml#nt{}" id="rf{}"><sup>❮{}❯</sup></a>'
const DETALLE: Snippet = {
  name: 'Detalle nota',
  insert: '<p id="nt{}"><a href="{CAPNOTA}#rf{}"><sup>❮{}❯</sup> Texto</a></p>',
  vars: { CAPNOTA: 'noteChapter' },
}

const call = (n: number) => `<a href="notas.xhtml#nt${n}" id="rf${n}"><sup>❮${String(n).padStart(2, '0')}❯</sup></a>`
const note = (n: number, cap: string) => `<p id="nt${n}"><a href="${cap}#rf${n}"><sup>❮${String(n).padStart(2, '0')}❯</sup> Texto</a></p>`

const NOTAS = 'OEBPS/Text/notas.xhtml'

/** Capítulos en orden de lectura y, al final, el archivo de notas. */
function book(chapters: string[], notas = ''): EpubBook {
  const files = new Map<string, EpubFile>()
  const ids: string[] = []
  chapters.forEach((body, i) => {
    const path = `OEBPS/Text/Cap0${i + 1}.xhtml`
    files.set(path, { path, mediaType: 'application/xhtml+xml', text: `<html><body>${body}</body></html>` })
    ids.push(`c${i + 1}`)
  })
  files.set(NOTAS, { path: NOTAS, mediaType: 'application/xhtml+xml', text: `<html><body>${notas}</body></html>` })
  files.set('OEBPS/content.opf', {
    path: 'OEBPS/content.opf',
    mediaType: 'application/oebps-package+xml',
    text: `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata/><manifest>
${chapters.map((_, i) => `<item id="c${i + 1}" href="Text/Cap0${i + 1}.xhtml" media-type="application/xhtml+xml"/>`).join('')}
<item id="notas" href="Text/notas.xhtml" media-type="application/xhtml+xml"/>
</manifest><spine>${ids.map(id => `<itemref idref="${id}"/>`).join('')}<itemref idref="notas"/></spine></package>`,
  })
  return { files, opfPath: 'OEBPS/content.opf' }
}

const done = (r: FillResult) => {
  if (!('done' in r)) throw new Error(`pregunta por ${r.ask.name}`)
  return r.done.insert
}

describe('el detalle de nota', () => {
  it('toma la primera llamada sin su nota y enlaza a su capítulo', () => {
    const b = book([`<p>uno${call(1)} dos${call(2)}</p>`, `<p>tres${call(3)}</p>`], note(1, 'Cap01.xhtml'))
    expect(done(fillSnippet(DETALLE, b, NOTAS))).toBe(note(2, 'Cap01.xhtml'))
  })

  it('cuando se acaban las del capítulo 1, sigue con el 2', () => {
    const b = book([`<p>${call(1)}${call(2)}</p>`, `<p>${call(3)}</p>`], note(1, 'Cap01.xhtml') + note(2, 'Cap01.xhtml'))
    expect(done(fillSnippet(DETALLE, b, NOTAS))).toBe(note(3, 'Cap02.xhtml'))
  })

  it('escribirlas una tras otra las numera en orden', () => {
    const b = book([`<p>${call(1)}${call(2)}</p>`, `<p>${call(3)}</p>`])
    const notas = b.files.get(NOTAS)!
    const salidas: string[] = []
    for (let i = 0; i < 3; i++) {
      const out = done(fillSnippet(DETALLE, b, NOTAS))!
      salidas.push(out)
      notas.text = notas.text!.replace('</body>', `${out}</body>`)
    }
    expect(salidas).toEqual([note(1, 'Cap01.xhtml'), note(2, 'Cap01.xhtml'), note(3, 'Cap02.xhtml')])
  })

  it('si una nota se saltó, va a por ella', () => {
    const b = book([`<p>${call(1)}${call(2)}${call(3)}</p>`], note(1, 'Cap01.xhtml') + note(3, 'Cap01.xhtml'))
    expect(done(fillSnippet(DETALLE, b, NOTAS))).toBe(note(2, 'Cap01.xhtml'))
  })

  it('la ruta sale relativa a donde se escribe', () => {
    const b = book([`<p>${call(1)}</p>`])
    b.files.set('OEBPS/Misc/notas.xhtml', { path: 'OEBPS/Misc/notas.xhtml', mediaType: 'application/xhtml+xml', text: '<html/>' })
    expect(done(fillSnippet(DETALLE, b, 'OEBPS/Misc/notas.xhtml'))).toContain('href="../Text/Cap01.xhtml#rf1"')
  })

  it('sin llamadas pendientes no se inventa el capítulo: pregunta', () => {
    const b = book([`<p>${call(1)}</p>`], note(1, 'Cap01.xhtml'))
    const r = fillSnippet(DETALLE, b, NOTAS)
    expect('ask' in r && r.ask.name).toBe('CAPNOTA')
  })
})

describe('la llamada no cambia de comportamiento', () => {
  it('sigue siendo la más alta más uno', () => {
    const b = book([`<p>${call(1)}${call(2)}</p>`], note(1, 'Cap01.xhtml'))
    expect(done(fillSnippet({ name: 'llamada', insert: LLAMADA }, b, 'OEBPS/Text/Cap01.xhtml'))).toBe(call(3))
  })

  it('pero si la nota se escribió antes que la llamada, la llamada usa su número', () => {
    const b = book(['<p>sin llamadas</p>'], note(4, 'Cap01.xhtml'))
    expect(chooseNumber(b, LLAMADA).n).toBe(4)
  })
})

describe('las reglas', () => {
  const con = (rule: Snippet['vars']) => ({ name: 'x', insert: '<a href="{DONDE}">ir</a>', vars: rule })
  const b = book(['<p>uno</p>', '<p>dos</p>', '<p>tres</p>'])

  it('último capítulo: el último del orden de lectura que no es este archivo', () => {
    expect(done(fillSnippet(con({ DONDE: 'lastChapter' }), b, NOTAS))).toBe('<a href="Cap03.xhtml">ir</a>')
  })

  it('archivo que editas', () => {
    expect(done(fillSnippet(con({ DONDE: 'current' }), b, 'OEBPS/Text/Cap02.xhtml'))).toBe('<a href="Cap02.xhtml">ir</a>')
  })

  it('texto fijo', () => {
    expect(done(fillSnippet(con({ DONDE: { text: 'https://ejemplo.com' } }), b, NOTAS))).toBe('<a href="https://ejemplo.com">ir</a>')
  })

  it('elegir: pregunta con todos los documentos en orden de lectura', () => {
    const r = fillSnippet(con({ DONDE: 'ask' }), b, NOTAS)
    if (!('ask' in r)) throw new Error('debía preguntar')
    expect(r.ask.choices).toEqual(['OEBPS/Text/Cap01.xhtml', 'OEBPS/Text/Cap02.xhtml', 'OEBPS/Text/Cap03.xhtml', NOTAS])
    expect(done(r.ask.then('OEBPS/Text/Cap02.xhtml'))).toBe('<a href="Cap02.xhtml">ir</a>')
  })

  it('una variable sin regla se pregunta', () => {
    const r = fillSnippet({ name: 'x', insert: '{DONDE}' }, b, NOTAS)
    expect('ask' in r).toBe(true)
  })

  it('con dos que preguntar, pregunta una y luego la otra', () => {
    const r = fillSnippet({ name: 'x', insert: '{A}|{B}' }, b, NOTAS)
    if (!('ask' in r)) throw new Error('debía preguntar A')
    expect(r.ask.name).toBe('A')
    const r2 = r.ask.then('OEBPS/Text/Cap01.xhtml')
    if (!('ask' in r2)) throw new Error('debía preguntar B')
    expect(r2.ask.name).toBe('B')
    expect(done(r2.ask.then('OEBPS/Text/Cap03.xhtml'))).toBe('Cap01.xhtml|Cap03.xhtml')
  })

  it('la misma variable dos veces se pregunta una sola', () => {
    const r = fillSnippet({ name: 'x', insert: '{A} y {A}' }, b, NOTAS)
    if (!('ask' in r)) throw new Error('debía preguntar')
    expect(done(r.ask.then('OEBPS/Text/Cap02.xhtml'))).toBe('Cap02.xhtml y Cap02.xhtml')
  })

  it('al preguntar el capítulo de la nota, propone el de la llamada pendiente', () => {
    const s = { ...DETALLE, vars: { CAPNOTA: 'ask' as const } }
    const r = fillSnippet(s, book(['<p>uno</p>', `<p>${call(1)}</p>`]), NOTAS)
    if (!('ask' in r)) throw new Error('debía preguntar')
    expect(r.ask.suggested).toBe('OEBPS/Text/Cap02.xhtml')
  })
})

describe('reconocer las variables', () => {
  it('solo las palabras en mayúsculas entre llaves', () => {
    expect(snippetVars({ name: 'x', insert: '{CAPNOTA} {} {n} {nn} {Otra} {A_2}' })).toEqual(['CAPNOTA', 'A_2'])
  })

  it('un snippet sin variables ni números sale tal cual', () => {
    const s = { name: 'em', wrap: ['<em>', '</em>'] as [string, string] }
    expect(fillSnippet(s, book([]), NOTAS)).toEqual({ done: s })
  })
})
