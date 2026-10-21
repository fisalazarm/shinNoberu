import { describe, expect, it } from 'vitest'
import type { EpubBook } from './epub'
import { distance, findNames, fold, inconsistent } from './names'

function book(chapters: string[]): EpubBook {
  const files = new Map<string, { path: string; mediaType: string; text: string }>()
  chapters.forEach((inner, i) => {
    const path = `OEBPS/Text/Cap0${i + 1}.xhtml`
    files.set(path, {
      path,
      mediaType: 'application/xhtml+xml',
      text: `<html xmlns="http://www.w3.org/1999/xhtml"><head><title>t</title></head><body>\n${inner}\n</body></html>`,
    })
  })
  files.set('OEBPS/content.opf', {
    path: 'OEBPS/content.opf',
    mediaType: 'application/oebps-package+xml',
    text: `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
  <metadata/>
  <manifest>
    ${chapters.map((_, i) => `<item id="c${i + 1}" href="Text/Cap0${i + 1}.xhtml" media-type="application/xhtml+xml"/>`).join('\n    ')}
  </manifest>
  <spine>
    ${chapters.map((_, i) => `<itemref idref="c${i + 1}"/>`).join('\n    ')}
  </spine>
</package>`,
  })
  return { files: files as EpubBook['files'], opfPath: 'OEBPS/content.opf' }
}

const names = (b: EpubBook) => findNames(b).map(g => g.variants.map(v => `${v.word}×${v.count}`))

describe('qué se considera un nombre', () => {
  it('una palabra en mayúscula en mitad de la frase', () => {
    const b = book(['<p>Allí estaba Kazuto esperando. Volvió a ver a Kazuto.</p>'])
    expect(names(b)).toEqual([['Kazuto×2']])
  })

  it('no la primera palabra de la frase', () => {
    const b = book(['<p>Entonces llovió. Entonces paró. Entonces siguió.</p>'])
    expect(names(b)).toEqual([])
  })

  it('tampoco la que abre un párrafo', () => {
    const b = book(['<p>Nadie vino.</p>\n<p>Nadie dijo nada.</p>'])
    expect(names(b)).toEqual([])
  })

  it('ni la que va tras una raya de diálogo', () => {
    const b = book(['<p>— Vamos allá, dijo.</p>\n<p>— Vamos, repitió.</p>'])
    expect(names(b)).toEqual([])
  })

  it('ni la que va tras unas comillas que abren la frase', () => {
    const b = book(['<p>Dijo: «Bueno, qué sé yo». Y añadió: «Bueno, ya veremos».</p>'])
    expect(names(b).flat()).not.toContain('Bueno×2')
  })

  it('una palabra que también sale en minúscula no es un nombre', () => {
    const b = book(['<p>Le dio una rosa a Rosa. La rosa era blanca y Rosa sonrió.</p>'])
    expect(names(b).flat().join()).not.toContain('Rosa')
  })

  it('no mira dentro de las etiquetas', () => {
    const b = book(['<p class="Kazuto" id="Kazuto">texto sin nombres aquí dentro</p>'])
    expect(names(b)).toEqual([])
  })

  it('las palabras muy cortas se dejan estar', () => {
    const b = book(['<p>Fue en El pueblo y en El campo con El.</p>'])
    expect(names(b).flat().join()).not.toContain('El')
  })
})

describe('agrupar las variantes', () => {
  it('junta las que se diferencian en una letra', () => {
    const b = book([
      '<p>Vino Kazuto. Luego vino Kazuto otra vez.</p>',
      '<p>Entonces Kasuto dijo que sí, y Kasuto se fue.</p>',
    ])
    const malas = inconsistent(findNames(b))
    expect(malas).toHaveLength(1)
    expect(malas[0].variants.map(v => v.word).sort()).toEqual(['Kasuto', 'Kazuto'])
  })

  it('la forma más usada es la que se propone', () => {
    const b = book([
      '<p>Habló Kazuto. Rio Kazuto. Calló Kazuto.</p>',
      '<p>Dijo Kasuto que no.</p>',
    ])
    expect(findNames(b)[0].main).toBe('Kazuto')
  })

  it('junta las que solo se diferencian en la tilde', () => {
    const b = book([
      '<p>Llegó Nicolás tarde. Esperó Nicolás un rato.</p>',
      '<p>Habló Nicolas despacio. Rio Nicolas.</p>',
    ])
    expect(inconsistent(findNames(b))[0].variants.map(v => v.word).sort()).toEqual(['Nicolas', 'Nicolás'])
  })

  it('no junta dos nombres que de verdad son distintos', () => {
    const b = book(['<p>Vino Kazuto y vino Marcela. Hablaron Kazuto y Marcela.</p>'])
    expect(inconsistent(findNames(b))).toEqual([])
  })

  it('tampoco junta los que empiezan por letras distintas', () => {
    const b = book(['<p>Vino Lucía y vino Sofía. Hablaron Lucía y Sofía.</p>'])
    expect(inconsistent(findNames(b))).toEqual([])
  })

  // Marta y Marte son dos nombres distintos y aun así se agrupan: con una letra
  // de diferencia no hay forma de saber cuál es un personaje y cuál una errata.
  // Se agrupan a propósito y se muestran las cuentas; decidir es de quien lee.
  it('agrupa dos nombres parecidos aunque sean distintos, y eso se ve en las cuentas', () => {
    const b = book(['<p>Hablé con Marta y con Marte. Volví a ver a Marta y a Marte.</p>'])
    const [g] = inconsistent(findNames(b))
    expect(g.variants.map(v => `${v.word}×${v.count}`).sort()).toEqual(['Marta×2', 'Marte×2'])
  })

  it('cuenta las apariciones de cada variante', () => {
    const b = book([
      '<p>Dijo Kazuto. Rio Kazuto. Calló Kazuto.</p>',
      '<p>Dijo Kasuto.</p>',
    ])
    const g = findNames(b)[0]
    expect(g.total).toBe(4)
    expect(g.variants.map(v => v.count)).toEqual([3, 1])
  })

  it('dice en qué capítulos sale cada una, en orden de lectura', () => {
    const b = book([
      '<p>Vino Kazuto. Se fue Kazuto.</p>',
      '<p>Volvió Kazuto y habló Kazuto.</p>',
    ])
    expect(findNames(b)[0].variants[0].chapters).toEqual(['OEBPS/Text/Cap01.xhtml', 'OEBPS/Text/Cap02.xhtml'])
  })

  it('apunta a la primera aparición para poder ir a verla', () => {
    const b = book(['<p>Allí estaba Kazuto y Kazuto no habló.</p>'])
    const { first } = findNames(b)[0].variants[0]
    const text = b.files.get('OEBPS/Text/Cap01.xhtml')!.text!
    expect(text.slice(first.offset, first.offset + 6)).toBe('Kazuto')
    expect(first.line).toBe(2)
  })

  it('los grupos con varias formas van primero', () => {
    const b = book([
      '<p>Habló Marcela. Rio Marcela. Calló Marcela. Durmió Marcela.</p>',
      '<p>Vino Kazuto. Luego Kasuto se marchó.</p>',
    ])
    expect(findNames(b)[0].variants.length).toBeGreaterThan(1)
  })
})

describe('las piezas sueltas', () => {
  it('fold quita tildes y mayúsculas', () => {
    expect(fold('Nicolás')).toBe('nicolas')
  })

  it('distance se rinde en cuanto se pasa del tope', () => {
    expect(distance('kazuto', 'kasuto', 1)).toBe(1)
    expect(distance('kazuto', 'marcela', 2)).toBe(3)
    expect(distance('casa', 'casa', 1)).toBe(0)
  })
})
