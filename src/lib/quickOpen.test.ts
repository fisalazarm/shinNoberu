import { describe, expect, it } from 'vitest'
import { score } from '../components/QuickOpen'

const better = (q: string, a: string, b: string) => score(q, a) > score(q, b)

describe('score', () => {
  it('sin consulta todo vale igual', () => {
    expect(score('', 'lo que sea')).toBe(1)
  })

  it('encuentra por subcadena', () => {
    expect(score('cap', 'Cap01.xhtml')).toBeGreaterThan(0)
  })

  it('encuentra por subsecuencia salteada', () => {
    expect(score('cp1', 'Cap01.xhtml')).toBeGreaterThan(0)
  })

  it('no encuentra lo que no está', () => {
    expect(score('zzz', 'Cap01.xhtml')).toBe(0)
  })

  it('ignora las tildes en los dos sentidos', () => {
    expect(score('indice', 'Regenerar índice')).toBeGreaterThan(0)
    expect(score('índice', 'Regenerar indice')).toBeGreaterThan(0)
    expect(score('capitulo', 'Capítulo 1')).toBeGreaterThan(0)
  })

  it('ignora mayúsculas', () => {
    expect(score('CAP', 'Cap01.xhtml')).toBeGreaterThan(0)
  })

  it('lo que empieza por la consulta va antes', () => {
    expect(better('cap', 'Cap01.xhtml', 'Mi Cap01.xhtml')).toBe(true)
  })

  it('una subcadena vale más que una subsecuencia desperdigada', () => {
    expect(better('toc', 'toc.xhtml', 'Texto Original Corto')).toBe(true)
  })

  it('las letras seguidas puntúan más que las sueltas', () => {
    expect(better('abc', 'xabcx', 'axbxcx')).toBe(true)
  })
})
