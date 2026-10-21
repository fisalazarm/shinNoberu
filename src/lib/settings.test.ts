import { describe, expect, it } from 'vitest'
import {
  applySettings, asHexColor, countOverrides, emptySettings, pruneSettings, readToken,
  type Settings,
} from './settings'

const make = (patch: Partial<Settings> = {}): Settings => ({ ...emptySettings, ...patch })
const styleOf = (token: string) => document.documentElement.style.getPropertyValue(token)

describe('asHexColor', () => {
  it('deja pasar un hex de seis dígitos', () => {
    expect(asHexColor('#1a7a45')).toBe('#1a7a45')
    expect(asHexColor('  #FFF000  ')).toBe('#FFF000')
  })

  it('expande el de tres', () => {
    expect(asHexColor('#abc')).toBe('#aabbcc')
  })

  it('recorta el alfa, que el selector no entiende', () => {
    expect(asHexColor('#6cb0f024')).toBe('#6cb0f0')
  })

  it('convierte rgb()', () => {
    expect(asHexColor('rgb(26, 122, 69)')).toBe('#1a7a45')
  })

  it('ante algo raro devuelve un gris en vez de romper el selector', () => {
    expect(asHexColor('color-mix(in srgb, red, blue)')).toBe('#808080')
  })
})

describe('applySettings', () => {
  it('pone las variables del tema activo y las comunes', () => {
    applySettings(make({ common: { '--font-mono': 'Consolas' }, dark: { '--accent': '#ff0000' } }), 'dark')
    expect(styleOf('--font-mono')).toBe('Consolas')
    expect(styleOf('--accent')).toBe('#ff0000')
  })

  it('no mezcla los colores de un tema con los del otro', () => {
    applySettings(make({ dark: { '--accent': '#ff0000' }, light: { '--accent': '#0000ff' } }), 'light')
    expect(styleOf('--accent')).toBe('#0000ff')
  })

  it('retira lo que se aplicó antes al cambiar de preferencias', () => {
    applySettings(make({ dark: { '--accent': '#ff0000' } }), 'dark')
    applySettings(make(), 'dark')
    expect(styleOf('--accent')).toBe('')
  })

  it('también lo retira al cambiar de tema', () => {
    applySettings(make({ dark: { '--accent': '#ff0000' } }), 'dark')
    applySettings(make({ dark: { '--accent': '#ff0000' } }), 'light')
    expect(styleOf('--accent')).toBe('')
  })

  it('ignora claves que no son variables CSS', () => {
    applySettings(make({ common: { color: 'red', '--text': '#111111' } }), 'dark')
    expect(styleOf('--text')).toBe('#111111')
    expect(document.documentElement.style.getPropertyValue('color')).toBe('')
    applySettings(make(), 'dark')
  })
})

describe('pruneSettings', () => {
  it('tira las claves vacías y las que no son variables', () => {
    const out = pruneSettings(make({ common: { '--a': 'x', '--b': '  ', notACssVar: 'y' } }))
    expect(out.common).toEqual({ '--a': 'x' })
  })
})

describe('countOverrides', () => {
  it('suma los tres grupos', () => {
    expect(countOverrides(make())).toBe(0)
    expect(countOverrides(make({ common: { '--a': '1' }, dark: { '--b': '2', '--c': '3' } }))).toBe(3)
  })
})

describe('readToken', () => {
  it('devuelve lo que vale el token ahora mismo', () => {
    applySettings(make({ common: { '--probando': 'valor' } }), 'dark')
    expect(readToken('--probando')).toBe('valor')
    applySettings(make(), 'dark')
  })
})
