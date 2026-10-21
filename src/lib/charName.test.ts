import { describe, expect, it } from 'vitest'
import { charInfo, describeChar, hexOf } from './charName'

describe('charInfo', () => {
  it('distingue las tres rayas que parecen iguales', () => {
    expect(charInfo('-')!.label).toBe('guion')
    expect(charInfo('–')!.label).toBe('semirraya')
    expect(charInfo('—')!.label).toBe('raya')
  })

  it('marca como invisible lo que no se ve en el editor', () => {
    for (const c of [' ', ' ', '​', '­', '　', '﻿', '\t']) {
      expect(charInfo(c)!.invisible, `${hexOf(c.codePointAt(0)!)} deberia ser invisible`).toBe(true)
    }
  })

  it('el espacio normal no se marca', () => {
    expect(charInfo(' ')!.invisible).toBeUndefined()
    expect(charInfo(' ')!.label).toBe('espacio')
  })

  it('nombra las comillas de cada estilo', () => {
    expect(charInfo('«')!.label).toBe('comilla latina de apertura')
    expect(charInfo('”')!.label).toBe('comilla inglesa de cierre')
    expect(charInfo('「')!.label).toBe('comilla de esquina de apertura')
    expect(charInfo('"')!.label).toBe('comilla recta doble')
  })

  it('da el código en el formato de siempre', () => {
    expect(charInfo('—')!.hex).toBe('U+2014')
    expect(charInfo(' ')!.hex).toBe('U+00A0')
    expect(hexOf(0x1f600)).toBe('U+1F600')
  })

  it('nombra la puntuación que sale maquetando', () => {
    expect(charInfo('@')!.label).toBe('arroba')
    expect(charInfo('<')!.label).toBe('menor que')
    expect(charInfo('&')!.label).toBe('et')
  })

  it('describe las letras y los dígitos corrientes', () => {
    expect(charInfo('a')!.label).toBe('letra a minúscula')
    expect(charInfo('Ñ')!.label).toBe('letra Ñ mayúscula')
    expect(charInfo('7')!.label).toBe('dígito 7')
  })

  it('aguanta los caracteres fuera del plano básico', () => {
    const info = charInfo('😀')!
    expect(info.code).toBe(0x1f600)
    expect(info.char).toBe('😀')
  })

  it('devuelve null con una cadena vacía', () => {
    expect(charInfo('')).toBeNull()
    expect(describeChar('')).toBe('')
  })
})

describe('describeChar', () => {
  it('junta nombre y código', () => {
    expect(describeChar('—')).toBe('raya (U+2014)')
  })
})
