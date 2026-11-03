import { describe, expect, it } from 'vitest'
import { addToOpf, type EpubBook } from './epub'
import { toEndnotes } from './endnotes'
import { newEpub } from './newEpub'
import { checkNotes, type NoteCode } from './noteCheck'
import { reviewRelease } from './release'

// ---------- formato de los snippets: notas juntas en notas.xhtml ----------

const pad = (n: number) => String(n).padStart(2, '0')
const llamada = (n: number, ver = n, nota = n) =>
  `<a href="notas.xhtml#nt${nota}" id="rf${n}"><sup>❮${pad(ver)}❯</sup></a>`
const detalle = (n: number, cap: string, vuelta = n, ver = n) =>
  `<p id="nt${n}"><a href="${cap}#rf${vuelta}"><sup>❮${pad(ver)}❯</sup> Texto de la nota ${n}.</a></p>`

const xhtml = (body: string) =>
  `<?xml version="1.0" encoding="utf-8"?>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>x</title></head>\n<body>\n${body}\n</body></html>`

/** Un libro con capítulos (por orden) y, si se da, la página de notas al final. */
function libro(capitulos: string[], notas?: string): EpubBook {
  const book = newEpub()
  book.files.get('OEBPS/Text/Cap01.xhtml')!.text = xhtml(capitulos[0])
  capitulos.slice(1).forEach((body, i) => {
    const path = `OEBPS/Text/Cap0${i + 2}.xhtml`
    book.files.set(path, { path, mediaType: 'application/xhtml+xml', text: xhtml(body) })
    addToOpf(book, path)
  })
  if (notas != null) {
    const path = 'OEBPS/Text/notas.xhtml'
    book.files.set(path, { path, mediaType: 'application/xhtml+xml', text: xhtml(notas) })
    addToOpf(book, path)
  }
  return book
}

const codigos = (book: EpubBook) => checkNotes(book).issues.map(i => i.code)
const de = (book: EpubBook, code: NoteCode) => checkNotes(book).issues.filter(i => i.code === code)

describe('notas juntas al final (formato de los snippets)', () => {
  const bien = () => libro(
    [`<p>Uno${llamada(1)} dos${llamada(2)}</p>`, `<p>Tres${llamada(3)}</p>`],
    [detalle(1, 'Cap01.xhtml'), detalle(2, 'Cap01.xhtml'), detalle(3, 'Cap02.xhtml')].join('\n'),
  )

  it('un libro bien hecho no da avisos y cuenta lo que hay', () => {
    const r = checkNotes(bien())
    expect(r.issues).toEqual([])
    expect([r.calls, r.notes]).toEqual([3, 3])
  })

  it('la vuelta que lleva a otra llamada', () => {
    const book = libro(
      [`<p>Uno${llamada(1)} dos${llamada(2)}</p>`],
      [detalle(1, 'Cap01.xhtml'), detalle(2, 'Cap01.xhtml', 1)].join('\n'),
    )
    const [i] = de(book, 'vuelta-equivocada')
    expect(i.message).toContain('#rf1')
    expect(i.message).toContain('#rf2')
    expect(i.path).toBe('OEBPS/Text/notas.xhtml')
  })

  it('el ❮07❯ cuya nota dice ❮08❯', () => {
    const book = libro([`<p>Uno${llamada(1)}</p>`], detalle(1, 'Cap01.xhtml', 1, 8))
    expect(de(book, 'numero-distinto')[0].message).toBe('La llamada dice 1 pero su nota (#nt1) dice 8.')
  })

  it('una nota a la que no llama nadie', () => {
    const book = libro([`<p>Uno${llamada(1)}</p>`], [detalle(1, 'Cap01.xhtml'), detalle(2, 'Cap01.xhtml')].join('\n'))
    expect(de(book, 'huerfana').map(i => i.message)).toEqual(['Nadie llama a la nota #nt2.'])
  })

  it('una llamada que lleva a una nota que no existe', () => {
    const book = libro([`<p>Uno${llamada(1)} dos${llamada(2)}</p>`], detalle(1, 'Cap01.xhtml'))
    const [i] = de(book, 'rota')
    expect(i.severity).toBe('error')
    expect(i.path).toBe('OEBPS/Text/Cap01.xhtml')
    expect(i.context).toContain('❮02❯')
  })

  it('una vuelta que lleva a una llamada que no existe', () => {
    const book = libro([`<p>Uno${llamada(1)}</p>`], detalle(1, 'Cap09.xhtml'))
    expect(codigos(book)).toContain('vuelta-rota')
  })

  it('dos llamadas a la misma nota', () => {
    const book = libro([`<p>Uno${llamada(1)} y otra vez${llamada(2, 2, 1)}</p>`], detalle(1, 'Cap01.xhtml'))
    expect(codigos(book)).toContain('repetida')
  })
})

describe('la numeración', () => {
  const conLlamadas = (...nums: number[][]) => libro(
    nums.map(cap => `<p>${cap.map(n => `x${llamada(n)}`).join(' ')}</p>`),
    // Cada nota vuelve al capítulo donde está su llamada.
    [...new Set(nums.flat())].map(n => detalle(n, `Cap0${nums.findIndex(cap => cap.includes(n)) + 1}.xhtml`)).join('\n'),
  )

  it('un número saltado', () => {
    expect(de(conLlamadas([1, 2, 4]), 'saltado')[0].message).toBe('Después del 2 viene el 4: falta el 3.')
  })

  it('varios saltados de golpe', () => {
    expect(de(conLlamadas([1, 5]), 'saltado')[0].message).toContain('del 2 al 4')
  })

  it('fuera de orden', () => {
    expect(de(conLlamadas([1, 3, 2]), 'desordenado')[0].message).toBe('El 2 va después del 3.')
  })

  it('el orden se mira a través de los capítulos', () => {
    expect(codigos(conLlamadas([1, 2], [3, 4]))).toEqual([])
    expect(de(conLlamadas([1, 2], [4]), 'saltado')).toHaveLength(1)
  })

  it('volver a 1 en otro capítulo es empezar la cuenta, no un error', () => {
    // Notas al pie numeradas por capítulo, cada una en su archivo.
    const cap = (a: number, b: number) => `<p>a${nota(a)} b${nota(b)}</p>\n${aside(a)}\n${aside(b)}`
    const book = libro([cap(1, 2), cap(1, 2)])
    expect(codigos(book)).toEqual([])
  })
})

// ---------- formato del editor: notas al pie en <aside> ----------

const nota = (n: number) =>
  `<a class="nota" epub:type="noteref" href="#nota${n}" id="ref${n}" role="doc-noteref">[${n}]</a>`
const aside = (n: number, vuelta = true) =>
  `<aside class="nota-trad" epub:type="footnote" id="nota${n}" role="doc-footnote">\n  <p>${vuelta ? `<a href="#ref${n}">[${n}]</a> ` : ''}Nota ${n}.</p>\n</aside>`

describe('notas al pie (formato del editor)', () => {
  it('reconoce llamada, nota y vuelta', () => {
    const r = checkNotes(libro([`<p>Uno${nota(1)} dos${nota(2)}</p>\n${aside(1)}\n${aside(2)}`]))
    expect(r.issues).toEqual([])
    expect([r.calls, r.notes]).toEqual([2, 2])
  })

  it('si el libro no usa vueltas en ninguna nota, no se piden', () => {
    expect(codigos(libro([`<p>Uno${nota(1)}</p>\n${aside(1, false)}`]))).toEqual([])
  })

  it('si las demás la tienen, la que no la tiene se nota', () => {
    const book = libro([`<p>Uno${nota(1)} dos${nota(2)}</p>\n${aside(1)}\n${aside(2, false)}`])
    expect(de(book, 'sin-vuelta').map(i => i.message)).toEqual(['La nota #nota2 no tiene enlace de vuelta a su llamada.'])
  })

  it('un aside de nota sin llamada, aunque se llame distinto', () => {
    const book = libro([`<p>Uno${nota(1)}</p>\n${aside(1)}\n<aside epub:type="footnote" id="suelta">Huérfana.</aside>`])
    expect(de(book, 'huerfana')).toHaveLength(1)
  })

  it('pasarlas al final con el editor deja todo cuadrado', () => {
    const book = libro([`<p>Uno${nota(1)} dos${nota(2)}</p>\n${aside(1)}\n${aside(2)}`, `<p>Tres${nota(1)}</p>\n${aside(1)}`])
    expect(toEndnotes(book)).not.toBeNull()
    const r = checkNotes(book)
    expect(r.issues).toEqual([])
    expect(r.notes).toBe(3)
  })
})

describe('lo que no son notas', () => {
  it('un enlace normal o el índice no cuentan', () => {
    const book = libro([`<p>Ver <a href="Cap02.xhtml#sec">el capítulo 2</a>.</p>`, '<h2 id="sec">Dos</h2>'])
    expect(checkNotes(book)).toEqual({ calls: 0, notes: 0, issues: [] })
  })

  it('un elemento sin cerrar no cuelga', () => {
    const book = libro([`<p>Uno${llamada(1)}</p>`], '<p id="nt1"><a href="Cap01.xhtml#rf1">❮01❯ sin cerrar')
    expect(checkNotes(book).calls).toBe(1)
  })
})

describe('antes de publicar', () => {
  const bloque = (book: EpubBook) => reviewRelease(book).blocks.find(b => b.id === 'notas')

  it('sin notas no dice nada', () => {
    expect(bloque(libro(['<p>Sin notas.</p>']))).toBeUndefined()
  })

  it('notas bien: verde', () => {
    expect(bloque(libro([`<p>Uno${llamada(1)}</p>`], detalle(1, 'Cap01.xhtml')))).toMatchObject({ level: 'ok', opens: 'notes' })
  })

  it('una vuelta equivocada: amarillo; una llamada rota: rojo', () => {
    const torcida = libro([`<p>Uno${llamada(1)} dos${llamada(2)}</p>`], [detalle(1, 'Cap01.xhtml'), detalle(2, 'Cap01.xhtml', 1)].join('\n'))
    expect(bloque(torcida)?.level).toBe('warn')
    const rota = libro([`<p>Uno${llamada(1)} dos${llamada(2)}</p>`], detalle(1, 'Cap01.xhtml'))
    expect(bloque(rota)?.level).toBe('error')
  })
})
