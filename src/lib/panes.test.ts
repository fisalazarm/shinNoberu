import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_SIDEBAR, fitPanes, gridColumns, LIMITS, loadPaneSizes, savePaneSizes } from './panes'

beforeEach(() => localStorage.clear())

describe('recordar el tamaño', () => {
  it('sin nada guardado, el reparto de siempre', () => {
    expect(loadPaneSizes()).toEqual({ sidebar: null, preview: null })
  })

  it('se guarda y se recupera', () => {
    savePaneSizes({ sidebar: 300, preview: 500 })
    expect(loadPaneSizes()).toEqual({ sidebar: 300, preview: 500 })
  })

  it('con basura guardada no se cae', () => {
    localStorage.setItem('epub-editor.paneles', 'no es json')
    expect(loadPaneSizes()).toEqual({ sidebar: null, preview: null })
    localStorage.setItem('epub-editor.paneles', '{"sidebar":"ancho","preview":null}')
    expect(loadPaneSizes()).toEqual({ sidebar: null, preview: null })
  })
})

describe('ajustar a la ventana', () => {
  it('lo que cabe se queda como está', () => {
    expect(fitPanes({ sidebar: 300, preview: 500 }, 1600)).toEqual({ sidebar: 300, preview: 500 })
  })

  it('la lista de archivos no baja de su mínimo', () => {
    expect(fitPanes({ sidebar: 40, preview: null }, 1600).sidebar).toBe(LIMITS.sidebar.min)
  })

  it('ni pasa de la mitad de la ventana', () => {
    expect(fitPanes({ sidebar: 1500, preview: null }, 1600).sidebar).toBe(800)
  })

  it('la vista previa no baja de su mínimo', () => {
    expect(fitPanes({ sidebar: null, preview: 50 }, 1600).preview).toBe(LIMITS.preview.min)
  })

  it('al editor siempre le quedan sus píxeles', () => {
    const s = fitPanes({ sidebar: 500, preview: 700 }, 1200)
    const editor = 1200 - s.sidebar! - s.preview! - LIMITS.splitter * 2
    expect(editor).toBeGreaterThanOrEqual(LIMITS.center)
  })

  it('cede primero la vista previa', () => {
    const s = fitPanes({ sidebar: 300, preview: 700 }, 1200)
    expect(s.sidebar).toBe(300)
    expect(s.preview).toBeLessThan(700)
  })

  it('y si no basta, también la lista', () => {
    const s = fitPanes({ sidebar: 500, preview: 700 }, 1000)
    expect(s.preview).toBe(LIMITS.preview.min)
    expect(s.sidebar).toBeLessThan(500)
    expect(s.sidebar).toBeGreaterThanOrEqual(LIMITS.sidebar.min)
  })

  it('con la vista previa en proporción no recorta nada más', () => {
    expect(fitPanes({ sidebar: 300, preview: null }, 900)).toEqual({ sidebar: 300, preview: null })
  })
})

describe('las columnas de la rejilla', () => {
  it('sin tocar nada, el reparto de siempre', () => {
    expect(gridColumns({ sidebar: null, preview: null }))
      .toBe(`${DEFAULT_SIDEBAR}px 1px minmax(0, 1fr) 1px minmax(0, 0.9fr)`)
  })

  it('con anchos guardados, en píxeles', () => {
    expect(gridColumns({ sidebar: 300, preview: 520 })).toBe('300px 1px minmax(0, 1fr) 1px 520px')
  })
})
