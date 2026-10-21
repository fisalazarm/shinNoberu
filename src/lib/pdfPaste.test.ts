import { describe, expect, it } from 'vitest'
import { pdfToParagraphList, pdfToParagraphs } from './pdfPaste'

const PDF = `El sol ya se había ocultado detrás de las montañas cuando Kazuto
llegó a la entrada del pueblo. No había nadie en las calles y el vien-
to frío le golpeaba la cara sin piedad.
Se detuvo frente a la posada.
—¿Hay alguien? —preguntó en voz alta, aunque sabía que nadie le
iba a responder a esas horas de la noche.
「No deberías estar aquí」, dijo una voz a sus espaldas.
12
Kazuto se dio la vuelta lentamente, con la mano ya sobre la empuña-
dura de su espada, y vio a una chica de pelo plateado que lo miraba.
◇◇◇
A la mañana siguiente, el pueblo parecía otro.`

describe('pdfToParagraphList', () => {
  const paras = pdfToParagraphList(PDF)

  it('une líneas de la misma oración y arma palabras cortadas', () => {
    expect(paras[0]).toBe(
      'El sol ya se había ocultado detrás de las montañas cuando Kazuto llegó a la entrada del pueblo. No había nadie en las calles y el viento frío le golpeaba la cara sin piedad.',
    )
  })

  it('separa párrafos en línea corta con punto y en diálogos', () => {
    expect(paras[1]).toBe('Se detuvo frente a la posada.')
    expect(paras[2].startsWith('—¿Hay alguien?')).toBe(true)
    expect(paras[2].endsWith('a esas horas de la noche.')).toBe(true)
    expect(paras[3]).toBe('「No deberías estar aquí」, dijo una voz a sus espaldas.')
  })

  it('quita números de página y respeta separadores', () => {
    expect(paras.some(p => p === '12')).toBe(false)
    expect(paras[4]).toContain('empuñadura de su espada')
    expect(paras[5]).toBe('◇◇◇')
    expect(paras[6]).toBe('A la mañana siguiente, el pueblo parecía otro.')
    expect(paras).toHaveLength(7)
  })

  it('limpia espacios dobles, tabs y espacios no separables', () => {
    expect(pdfToParagraphList('Hola   mundo  \tcruel.')).toEqual(['Hola mundo cruel.'])
  })

  it('modo un párrafo por línea', () => {
    expect(pdfToParagraphList('uno\ndos\n\n3\ntres', { oneParagraphPerLine: true })).toEqual(['uno', 'dos', 'tres'])
  })
})

describe('pdfToParagraphs', () => {
  it('genera <p> escapando HTML y con clase opcional', () => {
    expect(pdfToParagraphs('a < b & c.', { paragraphClass: 'x' })).toBe('<p class="x">a &lt; b &amp; c.</p>')
  })
})
