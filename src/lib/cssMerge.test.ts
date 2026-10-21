import { describe, expect, it } from 'vitest'
import { chunks, mergeCss } from './cssMerge'

const keys = (css: string) => chunks(css).map(c => c.key)

describe('partir la hoja en trozos', () => {
  it('una regla por selector', () => {
    expect(keys('p { margin: 0 } h1 { color: red }')).toEqual(['p', 'h1'])
  })

  it('los comentarios van aparte', () => {
    const c = chunks('/* nota */ p { margin: 0 }')
    expect(c).toHaveLength(2)
    expect(c[0].text).toBe('/* nota */')
  })

  it('un at-rule con bloque se queda entero', () => {
    const c = chunks('@media print { p { color: black } h1 { color: black } }')
    expect(c).toHaveLength(1)
    expect(c[0].text).toContain('h1 { color: black }')
  })

  it('un at-rule sin bloque también', () => {
    expect(keys('@charset "utf-8"; p { margin: 0 }')).toEqual(['@charset "utf-8"', 'p'])
  })

  it('el mismo selector escrito distinto es el mismo', () => {
    expect(keys('h1,p { margin: 0 }')).toEqual(keys('p ,  h1 { color: red }'))
  })

  it('una hoja vacía no da nada', () => {
    expect(chunks('   \n  ')).toEqual([])
  })

  it('una llave sin cerrar no se come el resto en silencio', () => {
    const c = chunks('p { margin: 0')
    expect(c).toHaveLength(1)
    expect(c[0].text).toContain('margin: 0')
  })
})

describe('fusionar', () => {
  it('lo del libro manda', () => {
    const { css } = mergeCss('p { color: blue }', 'p { color: red }')
    expect(css).toContain('color: blue')
    expect(css).not.toContain('color: red')
  })

  it('lo que el libro no tenía entra', () => {
    const { css, added } = mergeCss('p { color: blue }', 'h1 { text-align: center }')
    expect(added).toBe(1)
    expect(css).toContain('color: blue')
    expect(css).toContain('text-align: center')
  })

  it('se marca de dónde viene lo añadido', () => {
    expect(mergeCss('p { color: blue }', 'h1 { color: red }').css).toContain('de la plantilla')
  })

  it('si no hay nada que añadir, la hoja no se toca', () => {
    const original = 'p { color: blue }\n'
    const { css, added } = mergeCss(original, 'p { color: red }')
    expect(added).toBe(0)
    expect(css).toBe(original)
  })

  it('los comentarios de la plantilla no se copian solos', () => {
    const { css } = mergeCss('p { color: blue }', '/* mi nota */ p { color: red }')
    expect(css).not.toContain('mi nota')
  })

  it('un @media que el libro no tiene entra entero', () => {
    const { css } = mergeCss('p { margin: 0 }', '@media print { p { color: black } }')
    expect(css).toContain('@media print')
    expect(css).toContain('color: black')
  })

  it('y si ya lo tiene, se respeta el suyo', () => {
    const { css, added } = mergeCss('@media print { p { color: red } }', '@media print { p { color: black } }')
    expect(added).toBe(0)
    expect(css).not.toContain('black')
  })

  it('fusionar dos veces no duplica', () => {
    const uno = mergeCss('p { color: blue }', 'h1 { color: red }').css
    const dos = mergeCss(uno, 'h1 { color: red }')
    expect(dos.added).toBe(0)
    expect(dos.css.match(/h1/g)).toHaveLength(1)
  })

  it('una plantilla vacía no cambia nada', () => {
    expect(mergeCss('p { color: blue }\n', '').added).toBe(0)
  })

  it('un libro sin hoja se queda con la de la plantilla', () => {
    const { css, added } = mergeCss('', 'p { margin: 0 }\nh1 { color: red }')
    expect(added).toBe(2)
    expect(css).toContain('margin: 0')
    expect(css).toContain('color: red')
  })
})
