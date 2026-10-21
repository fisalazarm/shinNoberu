import { describe, expect, it } from 'vitest'
import { pdfToParagraphList, pdfToParagraphSources } from './pdfPaste'

const PDF = `El sol ya se había ocultado detrás de las montañas cuando Kazuto
llegó a la entrada del pueblo. No había nadie en las calles.
12
—¿Hay alguien? —preguntó en voz alta.
Nadie respondió a esas horas de la noche.`

/** El trozo del original al que apunta un párrafo. */
const slice = (raw: string, p: { from: number; to: number }) => raw.slice(p.from, p.to)

describe('pdfToParagraphSources', () => {
  it('da el mismo texto que la versión sin posiciones', () => {
    expect(pdfToParagraphSources(PDF).map(p => p.text)).toEqual(pdfToParagraphList(PDF))
  })

  it('cada párrafo apunta al trozo del original que lo produjo', () => {
    for (const p of pdfToParagraphSources(PDF)) {
      const src = slice(PDF, p)
      // El párrafo junta líneas, así que el trozo las contiene todas.
      expect(src.length).toBeGreaterThan(0)
      expect(p.from).toBeLessThan(p.to)
    }
  })

  it('el primer párrafo abarca las dos líneas que une', () => {
    const [first] = pdfToParagraphSources(PDF)
    expect(slice(PDF, first)).toContain('El sol ya se había ocultado')
    expect(slice(PDF, first)).toContain('No había nadie en las calles.')
  })

  it('las posiciones van en orden y no se solapan', () => {
    const ps = pdfToParagraphSources(PDF)
    for (let i = 1; i < ps.length; i++) expect(ps[i].from).toBeGreaterThanOrEqual(ps[i - 1].to)
  })

  it('el diálogo empieza su propio párrafo, en su línea', () => {
    const dialog = pdfToParagraphSources(PDF).find(p => p.text.startsWith('—¿Hay alguien?'))!
    expect(slice(PDF, dialog)).toBe('—¿Hay alguien? —preguntó en voz alta.')
  })

  it('el número de página descartado no entra en ningún rango', () => {
    const ps = pdfToParagraphSources(PDF)
    const at = PDF.indexOf('\n12\n') + 1
    expect(ps.some(p => p.from <= at && at < p.to)).toBe(false)
  })

  it('aguanta los saltos de Windows sin descolocarse', () => {
    const raw = PDF.replace(/\n/g, '\r\n')
    for (const p of pdfToParagraphSources(raw)) {
      // El texto normalizado debe aparecer dentro de su propio trozo.
      const src = raw.slice(p.from, p.to).replace(/\s+/g, ' ').trim()
      expect(src).toContain(p.text.split(' ').slice(0, 3).join(' '))
    }
  })

  it('con un párrafo por línea, cada rango es una línea', () => {
    const ps = pdfToParagraphSources(PDF, { oneParagraphPerLine: true })
    for (const p of ps) expect(slice(PDF, p)).not.toContain('\n')
  })

  it('un texto vacío no da párrafos', () => {
    expect(pdfToParagraphSources('')).toEqual([])
  })
})
