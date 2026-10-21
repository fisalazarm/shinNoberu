import { describe, expect, it } from 'vitest'
import type { EpubBook } from './epub'
import { bookReport, chapterStats, outlier, prettyMinutes, titleOf } from './report'

const chapter = (inner: string) => `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>no cuenta</title></head>
<body>
${inner}
</body></html>`

function book(chapters: string[]): EpubBook {
  const files = new Map<string, { path: string; mediaType: string; text: string }>()
  chapters.forEach((inner, i) => {
    const path = `OEBPS/Text/Cap0${i + 1}.xhtml`
    files.set(path, { path, mediaType: 'application/xhtml+xml', text: chapter(inner) })
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

const words = (n: number, w = 'palabra') => Array(n).fill(w).join(' ')

describe('un capítulo', () => {
  it('toma el título del primer encabezado, no del <head>', () => {
    expect(titleOf(chapter('<h1>El faro</h1><p>x</p>'), 'OEBPS/Text/Cap01.xhtml')).toBe('El faro')
  })

  it('y si no hay encabezado, el nombre del archivo', () => {
    expect(titleOf(chapter('<p>x</p>'), 'OEBPS/Text/Cap01.xhtml')).toBe('Cap01.xhtml')
  })

  it('cuenta los párrafos que tienen texto', () => {
    const s = chapterStats(chapter('<p>uno</p>\n<p></p>\n<p>dos</p>'), 'c')
    expect(s.paragraphs).toBe(2)
  })

  it('reconoce el diálogo por la raya y por las comillas', () => {
    const s = chapterStats(chapter('<p>— Hola.</p>\n<p>«Qué tal», dijo.</p>\n<p>Narración normal.</p>'), 'c')
    expect(s.dialogue).toBe(2)
    expect(s.paragraphs).toBe(3)
  })

  it('mide la frase más larga en palabras', () => {
    const s = chapterStats(chapter(`<p>Corta. ${words(30)} y fin.</p>`), 'c')
    expect(s.longestSentence).toBe(32)
  })

  it('no cuenta lo que hay dentro de las etiquetas', () => {
    const s = chapterStats(chapter('<p class="uno dos tres">una</p>'), 'c')
    expect(s.words).toBe(1)
  })

  it('el tiempo de lectura nunca es cero', () => {
    expect(chapterStats(chapter('<p>una</p>'), 'c').minutes).toBe(1)
  })
})

describe('el libro entero', () => {
  it('suma palabras y tiempo', () => {
    const r = bookReport(book([`<p>${words(230)}</p>`, `<p>${words(230)}</p>`]))
    expect(r.words).toBe(460)
    expect(r.minutes).toBe(2)
  })

  it('da la media y señala el más largo y el más corto', () => {
    const r = bookReport(book([`<p>${words(100)}</p>`, `<p>${words(500)}</p>`, `<p>${words(300)}</p>`]))
    expect(r.average).toBe(300)
    expect(r.longest?.words).toBe(500)
    expect(r.shortest?.words).toBe(100)
  })

  it('calcula cuánto del libro es diálogo', () => {
    const r = bookReport(book(['<p>— Hola.</p>\n<p>Narró.</p>', '<p>— Adiós.</p>\n<p>Narró más.</p>']))
    expect(r.dialogueRatio).toBe(0.5)
  })

  it('un libro sin párrafos no divide por cero', () => {
    const r = bookReport(book(['<div>sin parrafos</div>']))
    expect(r.dialogueRatio).toBe(0)
    expect(r.average).toBeGreaterThan(0)
  })

  it('marca como descompensado el que dobla la media', () => {
    const r = bookReport(book([`<p>${words(100)}</p>`, `<p>${words(100)}</p>`, `<p>${words(1000)}</p>`]))
    expect(outlier(r.longest!, r.average)).toBe(true)
    expect(outlier(r.chapters[0], r.average)).toBe(true) // 100 frente a 400 de media
  })

  it('el capítulo normal no se marca', () => {
    const r = bookReport(book([`<p>${words(300)}</p>`, `<p>${words(300)}</p>`]))
    expect(outlier(r.chapters[0], r.average)).toBe(false)
  })

  it('respeta el orden de lectura', () => {
    const b = book([`<p>${words(10)}</p>`, `<p>${words(20)}</p>`])
    expect(bookReport(b).chapters.map(c => c.path)).toEqual([
      'OEBPS/Text/Cap01.xhtml', 'OEBPS/Text/Cap02.xhtml',
    ])
  })
})

describe('las palabras que se repiten', () => {
  it('saca las que vuelven una y otra vez', () => {
    const r = bookReport(book([`<p>${words(20, 'sonrió')} y algo distinto aquí dentro</p>`]))
    expect(r.repeats[0]).toMatchObject({ word: 'sonrió', count: 20 })
  })

  it('deja fuera las palabras vacías', () => {
    const r = bookReport(book([`<p>${words(20, 'que')} ${words(5, 'mirada')}</p>`]))
    expect(r.repeats.map(x => x.word)).not.toContain('que')
    expect(r.repeats.map(x => x.word)).toContain('mirada')
  })

  it('y las demasiado cortas', () => {
    const r = bookReport(book([`<p>${words(20, 'vez')}</p>`]))
    expect(r.repeats.map(x => x.word)).not.toContain('vez')
  })

  it('da la frecuencia por diez mil palabras', () => {
    const r = bookReport(book([`<p>${words(10, 'sonrió')} ${words(90, 'relleno')}</p>`]))
    const s = r.repeats.find(x => x.word === 'sonrió')!
    expect(s.per10k).toBe(1000)
  })

  it('no se queja de lo que solo sale dos veces', () => {
    const r = bookReport(book(['<p>sonrió una vez, sonrió otra vez, suficiente texto aquí</p>']))
    expect(r.repeats.map(x => x.word)).not.toContain('sonrió')
  })

  it('un libro vacío no da nada', () => {
    expect(bookReport(book([])).repeats).toEqual([])
  })
})

describe('el tiempo en cristiano', () => {
  it('se lee de un vistazo', () => {
    expect(prettyMinutes(45)).toBe('45 min')
    expect(prettyMinutes(60)).toBe('1 h')
    expect(prettyMinutes(80)).toBe('1 h 20 min')
  })
})
