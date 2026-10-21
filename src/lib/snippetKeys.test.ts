import { describe, expect, it } from 'vitest'
import { keyFromEvent, prettyKey, snippetPreview } from './snippets'

const press = (key: string, mods: Partial<Record<'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey', boolean>> = {}) =>
  keyFromEvent({ key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...mods })

describe('keyFromEvent', () => {
  it('arma el atajo en el formato de CodeMirror', () => {
    expect(press('p', { ctrlKey: true })).toBe('Mod-p')
    expect(press('S', { ctrlKey: true, shiftKey: true })).toBe('Mod-Shift-s')
    expect(press('1', { altKey: true })).toBe('Alt-1')
  })

  it('escribe el guion tal cual, no como "minus"', () => {
    // CodeMirror parte con /-(?!$)/, asi que el guion final sobrevive.
    expect(press('-', { ctrlKey: true, shiftKey: true })).toBe('Mod-Shift--')
  })

  it('ignora las teclas modificadoras a solas', () => {
    for (const k of ['Control', 'Shift', 'Alt', 'Meta']) expect(press(k, { ctrlKey: true })).toBeNull()
  })

  it('una tecla sin modificador no es un atajo', () => {
    expect(press('a')).toBeNull()
    expect(press('F2')).toBeNull()
  })

  it('conserva el nombre de las teclas con nombre', () => {
    expect(press('Enter', { ctrlKey: true })).toBe('Mod-Enter')
    expect(press(' ', { ctrlKey: true })).toBe('Mod-Space')
  })
})

describe('prettyKey', () => {
  it('traduce los modificadores', () => {
    expect(prettyKey('Mod-p')).toBe('Ctrl+P')
    expect(prettyKey('Mod-Shift-s')).toBe('Ctrl+Shift+S')
    expect(prettyKey('Alt-1')).toBe('Alt+1')
  })

  it('no se confunde con el guion final', () => {
    expect(prettyKey('Mod-Shift--')).toBe('Ctrl+Shift+-')
  })

  it('deja legibles las teclas con nombre', () => {
    expect(prettyKey('Mod-Enter')).toBe('Ctrl+Enter')
    expect(prettyKey('Mod-Space')).toBe('Ctrl+Espacio')
  })

  it('va y vuelve con keyFromEvent', () => {
    const k = press('-', { ctrlKey: true, shiftKey: true })!
    expect(prettyKey(k)).toBe('Ctrl+Shift+-')
  })
})

describe('snippetPreview', () => {
  it('envuelve la muestra y deja el cursor detrás', () => {
    expect(snippetPreview({ name: 'p', wrap: ['<p>', '</p>'] }, 'texto'))
      .toBe('<p>texto</p>│')
  })

  it('pone el cursor donde marca la barra', () => {
    expect(snippetPreview({ name: 'span', wrap: ['<span class="|">', '</span>'] }, 'texto'))
      .toBe('<span class="│">texto</span>')
  })

  it('en los bloques marca el cursor y quita la barra', () => {
    expect(snippetPreview({ name: 'raya', insert: '—|' })).toBe('—│')
    expect(snippetPreview({ name: 'sep', insert: '<p>◇</p>' })).toBe('<p>◇</p>│')
  })
})
