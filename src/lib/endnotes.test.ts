import { describe, expect, it } from 'vitest'
import { spinePaths, type EpubBook, type EpubFile } from './epub'
import {
  countEndnotes, countFootnotes, notesPagePath, toEndnotes, toFootnotes,
} from './endnotes'
import { addFrontMatter, suggestText } from './frontMatter'
import { findBrokenLinks } from './housekeeping'

const call = (n: number) =>
  `<a class="nota" epub:type="noteref" href="#nota${n}" id="ref${n}" role="doc-noteref">[${n}]</a>`
const aside = (n: number, text: string) =>
  `  <aside class="nota-trad" epub:type="footnote" id="nota${n}" role="doc-footnote">\n` +
  `    <p><a href="#ref${n}">[${n}]</a> ${text}</p>\n` +
  '  </aside>\n'

const chapter = (title: string, body: string, notes = '') => `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>${title}</title>
<link href="../Styles/style.css" rel="stylesheet" type="text/css"/></head>
<body>
  <section epub:type="chapter">
    <h1>${title}</h1>
    ${body}
${notes}  </section>
</body></html>`

/** Dos capítulos con dos notas el primero y una el segundo. */
function book(): EpubBook {
  const files = new Map<string, EpubFile>()
  files.set('OEBPS/Text/Cap01.xhtml', {
    path: 'OEBPS/Text/Cap01.xhtml',
    mediaType: 'application/xhtml+xml',
    text: chapter('Uno', `<p>Dijo «sayonara»${call(1)} y se fue al konbini${call(2)}.</p>`,
      aside(1, 'Adiós, en japonés.') + aside(2, 'Tienda de <em>conveniencia</em>.')),
  })
  files.set('OEBPS/Text/Cap02.xhtml', {
    path: 'OEBPS/Text/Cap02.xhtml',
    mediaType: 'application/xhtml+xml',
    text: chapter('Dos', `<p>Comieron onigiri${call(1)}.</p>`, aside(1, 'Bola de arroz.')),
  })
  files.set('OEBPS/Styles/style.css', { path: 'OEBPS/Styles/style.css', mediaType: 'text/css', text: 'p { margin: 0 }\n' })
  files.set('OEBPS/content.opf', {
    path: 'OEBPS/content.opf',
    mediaType: 'application/oebps-package+xml',
    text: `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="id">urn:uuid:x</dc:identifier>
    <dc:title>Libro</dc:title>
    <dc:language>es</dc:language>
  </metadata>
  <manifest>
    <item id="css" href="Styles/style.css" media-type="text/css"/>
    <item id="c1" href="Text/Cap01.xhtml" media-type="application/xhtml+xml"/>
    <item id="c2" href="Text/Cap02.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="c1"/>
    <itemref idref="c2"/>
  </spine>
</package>`,
  })
  return { files, opfPath: 'OEBPS/content.opf' }
}

const text = (b: EpubBook, p: string) => b.files.get(p)!.text!
const cap1 = (b: EpubBook) => text(b, 'OEBPS/Text/Cap01.xhtml')
const cap2 = (b: EpubBook) => text(b, 'OEBPS/Text/Cap02.xhtml')
const notas = (b: EpubBook) => text(b, notesPagePath(b)!)

describe('contar', () => {
  it('cuenta las notas al pie con llamada y texto', () => {
    expect(countFootnotes(book())).toBe(3)
  })

  it('una llamada sin nota no cuenta', () => {
    const b = book()
    const f = b.files.get('OEBPS/Text/Cap02.xhtml')!
    f.text = f.text!.replace(/<aside[\s\S]*?<\/aside>\n?/, '')
    expect(countFootnotes(b)).toBe(2)
  })
})

describe('pasar al final', () => {
  it('crea la página de notas al final del libro', () => {
    const b = book()
    const r = toEndnotes(b)!
    expect(r.notes).toBe(3)
    expect(spinePaths(b).at(-1)).toBe(r.path)
    expect(countEndnotes(b)).toBe(3)
  })

  it('numera seguido en todo el libro, en orden de lectura', () => {
    const b = book()
    toEndnotes(b)
    expect(cap1(b)).toContain('[1]</a> y se fue')
    expect(cap1(b)).toContain('[2]</a>.')
    expect(cap2(b)).toContain('href="Notas.xhtml#nota3" id="ref3"')
  })

  it('las llamadas apuntan a la página de notas', () => {
    const b = book()
    toEndnotes(b)
    expect(cap1(b)).toContain('href="Notas.xhtml#nota1"')
  })

  it('y la página vuelve a cada llamada', () => {
    const b = book()
    toEndnotes(b)
    expect(notas(b)).toContain('<a href="Cap01.xhtml#ref2" role="doc-backlink">[2]</a> Tienda de <em>conveniencia</em>.')
    expect(notas(b)).toContain('<a href="Cap02.xhtml#ref3" role="doc-backlink">[3]</a> Bola de arroz.')
  })

  it('los capítulos se quedan sin sus notas al pie', () => {
    const b = book()
    toEndnotes(b)
    expect(cap1(b)).not.toContain('<aside')
    expect(cap2(b)).not.toContain('<aside')
  })

  it('no deja ningún enlace roto', () => {
    const b = book()
    toEndnotes(b)
    expect(findBrokenLinks(b)).toEqual([])
  })

  it('marca la página como notas al final para los lectores', () => {
    const b = book()
    toEndnotes(b)
    expect(notas(b)).toContain('epub:type="endnotes"')
    expect(notas(b)).toContain('epub:type="endnote"')
  })

  it('va antes del colofón si lo hay', () => {
    const b = book()
    addFrontMatter(b, ['colofon'], suggestText(b))
    const r = toEndnotes(b)!
    const spine = spinePaths(b)
    expect(spine.indexOf(r.path!)).toBeLessThan(spine.indexOf('OEBPS/Text/Colofon.xhtml'))
  })

  it('enlaza la hoja del libro y le pone su estilo una vez', () => {
    const b = book()
    toEndnotes(b)
    toEndnotes(b)
    expect(notas(b)).toContain('href="../Styles/style.css"')
    expect(text(b, 'OEBPS/Styles/style.css').match(/notas al final/g)).toHaveLength(1)
  })

  it('sin notas no hace nada', () => {
    const b = book()
    for (const p of ['OEBPS/Text/Cap01.xhtml', 'OEBPS/Text/Cap02.xhtml']) {
      const f = b.files.get(p)!
      f.text = f.text!.replace(/<aside[\s\S]*?<\/aside>\n?/g, '').replace(/<a class="nota"[^>]*>\[\d\]<\/a>/g, '')
    }
    expect(toEndnotes(b)).toBeNull()
    expect(notesPagePath(b)).toBeNull()
  })

  it('una llamada sin nota se deja donde está', () => {
    const b = book()
    const f = b.files.get('OEBPS/Text/Cap02.xhtml')!
    f.text = f.text!.replace(/<aside[\s\S]*?<\/aside>\n?/, '')
    toEndnotes(b)
    expect(cap2(b)).toContain('href="#nota1"')
    expect(countEndnotes(b)).toBe(2)
  })

  it('convertir dos veces no duplica', () => {
    const b = book()
    toEndnotes(b)
    toEndnotes(b)
    expect(countEndnotes(b)).toBe(3)
    expect(spinePaths(b).filter(p => p.includes('Notas'))).toHaveLength(1)
  })

  it('si se añade una nota al pie después, al volver a juntar entra en su sitio', () => {
    const b = book()
    toEndnotes(b)
    // Una nota nueva en el capítulo 2, antes de la que ya había.
    const f = b.files.get('OEBPS/Text/Cap02.xhtml')!
    f.text = f.text!
      .replace('<p>Comieron', `<p>Primero${call(9)} comieron`)
      .replace('  </section>', `${aside(9, 'Nota nueva.')}  </section>`)
    toEndnotes(b)
    expect(countEndnotes(b)).toBe(4)
    expect(notas(b)).toContain('[3]</a> Nota nueva.')
    expect(notas(b)).toContain('[4]</a> Bola de arroz.')
  })
})

describe('volver a notas al pie', () => {
  it('cada nota vuelve a su capítulo', () => {
    const b = book()
    toEndnotes(b)
    const r = toFootnotes(b)!
    expect(r.notes).toBe(3)
    expect(cap1(b)).toContain('Adiós, en japonés.')
    expect(cap2(b)).toContain('Bola de arroz.')
  })

  it('numeradas de nuevo desde 1 en cada capítulo', () => {
    const b = book()
    toEndnotes(b)
    toFootnotes(b)
    expect(cap2(b)).toContain('href="#nota1" id="ref1"')
    expect(cap2(b)).toContain('id="nota1"')
  })

  it('la página de notas desaparece', () => {
    const b = book()
    const r = toEndnotes(b)!
    toFootnotes(b)
    expect(b.files.has(r.path!)).toBe(false)
    expect(text(b, 'OEBPS/content.opf')).not.toContain('Notas.xhtml')
  })

  it('ida y vuelta deja el libro como estaba en lo que importa', () => {
    const b = book()
    toEndnotes(b)
    toFootnotes(b)
    expect(countFootnotes(b)).toBe(3)
    expect(cap1(b)).toContain('Tienda de <em>conveniencia</em>.')
    expect(findBrokenLinks(b)).toEqual([])
  })

  it('sin página de notas no hace nada', () => {
    expect(toFootnotes(book())).toBeNull()
  })
})
