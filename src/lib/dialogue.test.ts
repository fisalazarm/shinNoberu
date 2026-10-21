import { describe, expect, it } from 'vitest'
import type { EpubBook } from './epub'
import { fixDialogue, fixable, reviewDialogue, type DialogueIssue } from './dialogue'

function book(...paragraphs: string[]): EpubBook {
  const files = new Map<string, { path: string; mediaType: string; text: string }>()
  files.set('OEBPS/Text/Cap01.xhtml', {
    path: 'OEBPS/Text/Cap01.xhtml',
    mediaType: 'application/xhtml+xml',
    text: `<html xmlns="http://www.w3.org/1999/xhtml"><head><title>t</title></head>
<body>
${paragraphs.map(p => `  <p>${p}</p>`).join('\n')}
</body></html>`,
  })
  files.set('OEBPS/content.opf', {
    path: 'OEBPS/content.opf',
    mediaType: 'application/oebps-package+xml',
    text: `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
  <metadata/>
  <manifest><item id="c1" href="Text/Cap01.xhtml" media-type="application/xhtml+xml"/></manifest>
  <spine><itemref idref="c1"/></spine>
</package>`,
  })
  return { files: files as EpubBook['files'], opfPath: 'OEBPS/content.opf' }
}

const codes = (b: EpubBook) => reviewDialogue(b).map(i => i.code)
const texto = (b: EpubBook) => b.files.get('OEBPS/Text/Cap01.xhtml')!.text!

/** Aplica todo lo arreglable y devuelve el párrafo resultante. */
function arreglado(...paragraphs: string[]): string {
  const b = book(...paragraphs)
  fixDialogue(b, fixable(reviewDialogue(b)))
  return texto(b)
}

describe('la raya que abre', () => {
  it('un guion en su sitio se señala', () => {
    expect(codes(book('- Vamos.'))).toContain('guion')
  })

  it('y se arregla', () => {
    expect(arreglado('- Vamos.')).toContain('<p>—Vamos.</p>')
  })

  it('el espacio de después sobra', () => {
    expect(codes(book('— Vamos.'))).toContain('espacio-tras-raya')
    expect(arreglado('— Vamos.')).toContain('<p>—Vamos.</p>')
  })

  it('una raya bien puesta no se toca', () => {
    expect(reviewDialogue(book('—Vamos.'))).toEqual([])
  })

  it('un párrafo de narración se deja en paz', () => {
    expect(reviewDialogue(book('La nieve caía despacio sobre el puerto.'))).toEqual([])
  })

  it('un guion entre palabras no es una raya', () => {
    expect(reviewDialogue(book('Era un tira-y-afloja constante.'))).toEqual([])
  })
})

describe('el inciso', () => {
  it('pide espacio delante', () => {
    expect(codes(book('—Vamos—dijo ella.'))).toContain('inciso-sin-espacio')
    expect(arreglado('—Vamos—dijo ella.')).toContain('<p>—Vamos —dijo ella.</p>')
  })

  it('y nada detrás', () => {
    expect(codes(book('—Vamos — dijo ella.'))).toContain('inciso-con-espacio')
    expect(arreglado('—Vamos — dijo ella.')).toContain('<p>—Vamos —dijo ella.</p>')
  })

  it('bien escrito no da nada', () => {
    expect(reviewDialogue(book('—Vamos —dijo ella.'))).toEqual([])
  })

  it('la raya que cierra puede llevar puntuación detrás', () => {
    expect(reviewDialogue(book('—Vamos —dijo ella—. Y se fue.'))).toEqual([])
  })

  it('si el diálogo sigue, falta la raya de cierre', () => {
    expect(codes(book('—Vamos —dijo ella. Y se fue.'))).toContain('cierre-inciso')
  })

  it('y se arregla poniendo la raya antes del punto', () => {
    expect(arreglado('—Vamos —dijo ella. Y se fue.')).toContain('<p>—Vamos —dijo ella—. Y se fue.</p>')
  })

  it('un inciso que acaba el párrafo no necesita cierre', () => {
    expect(codes(book('—Vamos —dijo ella.'))).not.toContain('cierre-inciso')
  })

  it('el punto no va antes de la raya final', () => {
    expect(codes(book('—Vamos —dijo ella.—'))).toContain('punto-antes-de-raya')
    expect(arreglado('—Vamos —dijo ella.—')).toContain('<p>—Vamos —dijo ella—.</p>')
  })
})

describe('parejas sin cerrar', () => {
  it('unas comillas latinas abiertas', () => {
    expect(codes(book('Dijo «hola y se fue.'))).toContain('comillas')
  })

  it('cerradas no molestan', () => {
    expect(reviewDialogue(book('Dijo «hola» y se fue.'))).toEqual([])
  })

  it('un paréntesis abierto', () => {
    expect(codes(book('Entró (sin avisar y cerró la puerta.'))).toContain('parentesis')
  })

  it('una pregunta sin cerrar', () => {
    expect(codes(book('¿Qué hora es.'))).toContain('apertura')
  })

  it('una exclamación sin cerrar', () => {
    expect(codes(book('¡Qué frío.'))).toContain('apertura')
  })

  it('bien cerradas no dan nada', () => {
    expect(reviewDialogue(book('¿Qué hora es? ¡Qué frío!'))).toEqual([])
  })

  it('una comilla recta suelta', () => {
    expect(codes(book('Dijo "hola y se fue.'))).toContain('comillas')
  })

  it('nada de esto se arregla solo', () => {
    const b = book('Dijo «hola y se fue.')
    expect(fixable(reviewDialogue(b))).toEqual([])
  })
})

describe('dónde está cada cosa', () => {
  it('señala el sitio exacto del archivo', () => {
    const b = book('— Vamos.')
    const [i] = reviewDialogue(b)
    expect(texto(b).slice(i.from, i.to)).toBe(' ')
  })

  it('da la línea', () => {
    const b = book('Narración.', '— Vamos.')
    const i = reviewDialogue(b).find(x => x.code === 'espacio-tras-raya')!
    expect(i.line).toBe(4)
  })

  it('no se lía con las etiquetas de dentro del párrafo', () => {
    const b = book('—Vamos —dijo <em>ella</em>. Y se fue.')
    const i = reviewDialogue(b).find(x => x.code === 'cierre-inciso')!
    expect(texto(b).slice(i.from, i.to)).toBe('.')
    fixDialogue(b, [i])
    expect(texto(b)).toContain('<em>ella</em>—. Y se fue.')
  })

  it('no mira dentro de los atributos', () => {
    expect(reviewDialogue(book('<span class="a-b-c">texto normal</span>'))).toEqual([])
  })
})

describe('aplicar los arreglos', () => {
  it('varios en el mismo párrafo no se descolocan', () => {
    expect(arreglado('- Vamos — dijo ella.')).toContain('<p>—Vamos —dijo ella.</p>')
  })

  it('en varios párrafos a la vez', () => {
    const out = arreglado('— Uno.', '— Dos.')
    expect(out).toContain('<p>—Uno.</p>')
    expect(out).toContain('<p>—Dos.</p>')
  })

  it('devuelve cuántos cambió', () => {
    const b = book('— Uno.', '— Dos.')
    expect(fixDialogue(b, fixable(reviewDialogue(b)))).toBe(2)
  })

  it('no escribe si el texto cambió por debajo', () => {
    const b = book('— Vamos.')
    const list = fixable(reviewDialogue(b))
    b.files.get('OEBPS/Text/Cap01.xhtml')!.text = '<html><body><p>otra cosa entera</p></body></html>'
    expect(fixDialogue(b, list)).toBe(0)
  })

  it('arreglar deja el libro limpio', () => {
    const b = book('- Vamos — dijo ella. Y se fue.')
    fixDialogue(b, fixable(reviewDialogue(b)))
    const quedan = reviewDialogue(b).filter((i: DialogueIssue) => i.fix != null)
    expect(quedan).toEqual([])
  })
})
