import { describe, expect, it } from 'vitest'
import { beautify, renderedText } from './beautify'

describe('beautify', () => {
  it('pone cada bloque en su línea con su sangría', () => {
    const out = beautify('<body><section><p>Uno</p><p>Dos</p></section></body>')
    expect(out).toBe([
      '<body>',
      '  <section>',
      '    <p>Uno</p>',
      '    <p>Dos</p>',
      '  </section>',
      '</body>',
      '',
    ].join('\n'))
  })

  it('rehace una sangría desordenada', () => {
    const feo = '<body>\n        <section>\n<p>Uno</p>\n            <p>Dos</p>\n  </section>\n</body>'
    expect(beautify(feo)).toContain('  <section>\n    <p>Uno</p>\n    <p>Dos</p>\n  </section>')
  })

  it('acaba en un solo salto de línea', () => {
    expect(beautify('<p>a</p>\n\n\n')).toBe('<p>a</p>\n')
  })
})

describe('no cambia lo que se ve', () => {
  const igual = (src: string) => expect(renderedText(beautify(src))).toBe(renderedText(src))

  it('no separa un <em> de la palabra que le sigue', () => {
    const src = '<p><em>Tú</em>y yo</p>'
    expect(beautify(src)).toContain('<em>Tú</em>y yo')
    igual(src)
  })

  it('no mete saltos entre etiquetas en línea', () => {
    const src = '<p><em>a</em><strong>b</strong><span>c</span></p>'
    expect(beautify(src)).toContain('<em>a</em><strong>b</strong><span>c</span>')
  })

  it('respeta el espacio que ya había entre etiquetas en línea', () => {
    const src = '<p><em>a</em> <strong>b</strong></p>'
    expect(beautify(src)).toContain('<em>a</em> <strong>b</strong>')
  })

  it('no toca el texto suelto dentro de un bloque', () => {
    const src = '<p>  Dos espacios   dentro  </p>'
    expect(beautify(src)).toContain('>  Dos espacios   dentro  <')
  })

  it('deja <pre> intacto', () => {
    const src = '<body><pre>  linea 1\n    linea 2</pre></body>'
    expect(beautify(src)).toContain('<pre>  linea 1\n    linea 2</pre>')
  })

  it('un capítulo entero conserva su texto', () => {
    const src = [
      '<?xml version="1.0" encoding="utf-8"?>',
      '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Cap</title></head>',
      '<body><section epub:type="chapter"><h1>El bosque</h1>',
      '<p>Dijo <em>algo</em> y se fue.</p><p class="centro">◇◇◇</p>',
      '</section></body></html>',
    ].join('')
    igual(src)
  })
})

describe('casos raros', () => {
  it('un documento sin etiquetas se devuelve tal cual', () => {
    expect(beautify('solo texto')).toBe('solo texto')
  })

  it('aguanta etiquetas sin cerrar sin perder contenido', () => {
    expect(renderedText(beautify('<body><p>uno<p>dos</body>'))).toBe(renderedText('<body><p>uno<p>dos</body>'))
  })

  it('no se lía con los comentarios', () => {
    const src = '<body><!-- nota --><p>a</p></body>'
    expect(renderedText(beautify(src))).toBe(renderedText(src))
    expect(beautify(src)).toContain('<!-- nota -->')
  })

  it('es idempotente', () => {
    const src = '<body><section><p>Uno</p><p>Dos</p></section></body>'
    expect(beautify(beautify(src))).toBe(beautify(src))
  })
})
