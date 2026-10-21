import { describe, expect, it } from 'vitest'
import { footnoteEdit, nextFootnoteNumber } from './footnotes'

const doc = (body: string) => `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<body>
  <section epub:type="chapter">
    <h1>Capítulo 1</h1>
${body}
  </section>
</body>
</html>
`

/** Aplica las dos inserciones como lo haría CodeMirror. */
function apply(text: string, cursor: number) {
  const e = footnoteEdit(text, cursor)
  const parts = [e.call, e.aside].sort((a, b) => b.at - a.at) // de atrás hacia delante
  let out = text
  for (const p of parts) out = out.slice(0, p.at) + p.text + out.slice(p.at)
  return { out, edit: e }
}

describe('nextFootnoteNumber', () => {
  it('empieza en 1 cuando no hay notas', () => {
    expect(nextFootnoteNumber(doc('    <p>Hola</p>'))).toBe(1)
  })

  it('usa el siguiente al mayor que ya existe', () => {
    const text = doc('    <aside id="nota1"></aside>\n    <aside id="nota7"></aside>')
    expect(nextFootnoteNumber(text)).toBe(8)
  })

  it('también mira los ids de las llamadas', () => {
    expect(nextFootnoteNumber(doc('    <a id="ref3">[3]</a>'))).toBe(4)
  })
})

describe('footnoteEdit', () => {
  it('inserta la llamada en el cursor y el aside antes de </section>', () => {
    const text = doc('    <p>Una frase</p>')
    const cursor = text.indexOf('Una frase') + 'Una frase'.length
    const { out, edit } = apply(text, cursor)

    expect(edit.n).toBe(1)
    expect(out).toContain('Una frase<a class="nota" epub:type="noteref" href="#nota1" id="ref1"')
    expect(out.indexOf('<aside')).toBeLessThan(out.indexOf('</section>'))
    expect(out).toContain('id="nota1" role="doc-footnote"')
  })

  it('deja el cursor dentro de la nota, tras el enlace de vuelta', () => {
    const text = doc('    <p>Una frase</p>')
    const cursor = text.indexOf('frase')
    const { out, edit } = apply(text, cursor)
    expect(out.slice(0, edit.cursor)).toMatch(/<a href="#ref1">\[1\]<\/a> $/)
  })

  it('no repite números al insertar dos notas seguidas', () => {
    const text = doc('    <p>Primera y segunda</p>')
    const first = apply(text, text.indexOf('Primera') + 'Primera'.length)
    const second = apply(first.out, first.out.indexOf('segunda') + 'segunda'.length)

    expect(second.edit.n).toBe(2)
    const ids = [...second.out.matchAll(/id="(nota|ref)(\d+)"/g)].map(m => m[0])
    expect(new Set(ids).size).toBe(ids.length) // ningún id repetido
    expect(ids).toHaveLength(4)
  })

  it('cae en </body> si el capítulo no tiene <section>', () => {
    const text = '<html><body>\n  <p>Suelto</p>\n</body></html>\n'
    const { out } = apply(text, text.indexOf('Suelto'))
    expect(out.indexOf('<aside')).toBeLessThan(out.indexOf('</body>'))
  })
})
