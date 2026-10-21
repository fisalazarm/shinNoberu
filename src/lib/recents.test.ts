// IndexedDB no existe en el entorno de pruebas: se sustituye por un almacén
// en memoria para poder probar la lógica de la lista.

import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = new Map<string, unknown>()

vi.mock('./db', () => ({
  RECENTS: 'recents',
  run: async (_s: string, _m: string, fn: (s: unknown) => unknown) => {
    const fake = {
      get: (k: string) => ({ result: store.get(k) }),
      put: (v: unknown, k: string) => { store.set(k, v); return { result: undefined } },
    }
    return (fn(fake) as { result: unknown }).result
  },
}))

const readHandle = vi.fn()
const setSaveTarget = vi.fn()
vi.mock('./fileIO', () => ({
  readHandle: (...a: unknown[]) => readHandle(...a),
  setSaveTarget: (...a: unknown[]) => setSaveTarget(...a),
}))

const { forgetRecent, forgetRecents, listRecents, openRecent, rememberRecent } = await import('./recents')

const handle = (name: string) => ({ name }) as never

beforeEach(() => {
  store.clear()
  readHandle.mockReset()
  setSaveTarget.mockReset()
})

describe('rememberRecent', () => {
  it('no apunta nada que no se pueda reabrir', async () => {
    await rememberRecent({ name: 'suelto.epub' })
    expect(await listRecents()).toEqual([])
  })

  it('apunta lo que trae asidero o ruta', async () => {
    await rememberRecent({ name: 'a.epub', handle: handle('a.epub') })
    await rememberRecent({ name: 'b.epub', path: 'C:/libros/b.epub' })
    expect((await listRecents()).map(r => r.name)).toEqual(['b.epub', 'a.epub'])
  })

  it('el más reciente va primero', async () => {
    await rememberRecent({ name: 'a.epub', handle: handle('a') })
    await new Promise(r => setTimeout(r, 2))
    await rememberRecent({ name: 'b.epub', handle: handle('b') })
    expect((await listRecents())[0].name).toBe('b.epub')
  })

  it('reabrir uno lo sube arriba sin duplicarlo', async () => {
    await rememberRecent({ name: 'a.epub', handle: handle('a') })
    await new Promise(r => setTimeout(r, 2))
    await rememberRecent({ name: 'b.epub', handle: handle('b') })
    await new Promise(r => setTimeout(r, 2))
    await rememberRecent({ name: 'a.epub', handle: handle('a') })

    const list = await listRecents()
    expect(list).toHaveLength(2)
    expect(list[0].name).toBe('a.epub')
  })

  it('distingue dos rutas con el mismo nombre', async () => {
    await rememberRecent({ name: 'libro.epub', path: 'C:/uno/libro.epub' })
    await rememberRecent({ name: 'libro.epub', path: 'C:/dos/libro.epub' })
    expect(await listRecents()).toHaveLength(2)
  })

  it('se queda con los ocho últimos', async () => {
    for (let i = 0; i < 12; i++) {
      await rememberRecent({ name: `l${i}.epub`, path: `C:/l${i}.epub` })
    }
    const list = await listRecents()
    expect(list).toHaveLength(8)
    expect(list[0].name).toBe('l11.epub')
  })
})

describe('openRecent', () => {
  it('lee por el asidero y lo deja como destino de Guardar', async () => {
    readHandle.mockResolvedValue(new Uint8Array([1, 2, 3]))
    const h = handle('x.epub')
    const out = await openRecent({ id: 'x.epub', name: 'x.epub', openedAt: 0, handle: h })

    expect(out?.name).toBe('x.epub')
    expect([...out!.bytes]).toEqual([1, 2, 3])
    expect(setSaveTarget).toHaveBeenCalledWith(h)
  })

  it('devuelve null si el permiso se deniega o el archivo ya no está', async () => {
    readHandle.mockResolvedValue(null)
    const out = await openRecent({ id: 'x', name: 'x.epub', openedAt: 0, handle: handle('x') })
    expect(out).toBeNull()
    expect(setSaveTarget).not.toHaveBeenCalled()
  })

  it('sin asidero ni ruta no hay nada que abrir', async () => {
    expect(await openRecent({ id: 'x', name: 'x.epub', openedAt: 0 })).toBeNull()
  })
})

describe('olvidar', () => {
  it('vacía la lista entera', async () => {
    await rememberRecent({ name: 'a.epub', path: 'C:/a.epub' })
    await forgetRecents()
    expect(await listRecents()).toEqual([])
  })

  it('quita solo el pedido', async () => {
    await rememberRecent({ name: 'a.epub', path: 'C:/a.epub' })
    await rememberRecent({ name: 'b.epub', path: 'C:/b.epub' })
    await forgetRecent('C:/a.epub')
    expect((await listRecents()).map(r => r.name)).toEqual(['b.epub'])
  })
})
