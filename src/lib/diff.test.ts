import { describe, expect, it } from 'vitest'
import { compareFiles, lineDiff } from './diff'

describe('lineDiff', () => {
  it('dos textos iguales no tienen cambios', () => {
    expect(lineDiff('a\nb\nc', 'a\nb\nc')).toEqual({ added: 0, removed: 0 })
  })

  it('cuenta las líneas añadidas', () => {
    expect(lineDiff('a\nb', 'a\nx\ny\nb')).toEqual({ added: 2, removed: 0 })
  })

  it('cuenta las quitadas', () => {
    expect(lineDiff('a\nx\ny\nb', 'a\nb')).toEqual({ added: 0, removed: 2 })
  })

  it('una línea cambiada cuenta como una fuera y una dentro', () => {
    expect(lineDiff('a\nb\nc', 'a\nB\nc')).toEqual({ added: 1, removed: 1 })
  })

  it('de texto a vacío se van todas', () => {
    expect(lineDiff('a\nb\nc', '')).toEqual({ added: 0, removed: 3 })
  })

  it('no se confunde cuando lo común está en medio', () => {
    expect(lineDiff('x\ncomun\ny', 'z\ncomun\nw')).toEqual({ added: 2, removed: 2 })
  })

  it('reordenar líneas se nota', () => {
    const d = lineDiff('a\nb\nc', 'c\nb\na')
    expect(d.added).toBeGreaterThan(0)
    expect(d.removed).toBe(d.added)
  })

  it('con archivos enormes y muy distintos da una cota en vez de colgarse', () => {
    const a = Array.from({ length: 3000 }, (_, i) => `linea a ${i}`).join('\n')
    const b = Array.from({ length: 3000 }, (_, i) => `linea b ${i}`).join('\n')
    const t0 = Date.now()
    const d = lineDiff(a, b)
    expect(Date.now() - t0).toBeLessThan(2000)
    expect(d.approximate).toBe(true)
    expect(d.added).toBe(3000)
    expect(d.removed).toBe(3000)
  })
})

describe('compareFiles', () => {
  const file = (text: string) => ({ text })
  const bin = (n: number) => ({ bytes: new Uint8Array(n) })

  it('ve lo nuevo, lo borrado y lo cambiado', () => {
    const before = new Map([['a', file('uno')], ['b', file('dos')]])
    const after = new Map([['a', file('uno cambiado')], ['c', file('tres')]])

    expect(compareFiles(before, after)).toEqual([
      { path: 'a', kind: 'changed', diff: { added: 1, removed: 1 } },
      { path: 'c', kind: 'added' },
      { path: 'b', kind: 'removed' },
    ])
  })

  it('un archivo intacto no aparece', () => {
    const m = new Map([['a', file('uno')]])
    expect(compareFiles(m, new Map([['a', file('uno')]]))).toEqual([])
  })

  it('de los binarios solo mira el tamaño', () => {
    const before = new Map([['img', bin(100)], ['otra', bin(50)]])
    const after = new Map([['img', bin(80)], ['otra', bin(50)]])
    expect(compareFiles(before, after)).toEqual([{ path: 'img', kind: 'changed' }])
  })

  it('pone primero lo cambiado', () => {
    const before = new Map([['z', file('a')], ['borrado', file('x')]])
    const after = new Map([['z', file('b')], ['nuevo', file('y')]])
    expect(compareFiles(before, after).map(c => c.kind)).toEqual(['changed', 'added', 'removed'])
  })
})

describe('el salto final', () => {
  it('no cuenta como una línea de más', () => {
    expect(lineDiff('a\nb\n', 'a\nb')).toEqual({ added: 0, removed: 0 })
  })

  it('un archivo vacío no tiene líneas', () => {
    expect(lineDiff('', 'a')).toEqual({ added: 1, removed: 0 })
  })
})
