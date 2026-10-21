import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { readDocx, toChapters, type DocxDoc } from './docx'

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
const RNS = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'

const run = (text: string, props = '') =>
  `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}<w:t xml:space="preserve">${text}</w:t></w:r>`

const para = (inner: string, pPr = '') => `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ''}${inner}</w:p>`
const heading = (text: string, n = 1) => para(run(text), `<w:pStyle w:val="Heading${n}"/>`)

const document = (body: string) => `<?xml version="1.0" encoding="UTF-8"?>
<w:document ${W} ${RNS}><w:body>${body}</w:body></w:document>`

const RELS = (extra = '') => `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${extra}</Relationships>`

async function docx(body: string, extra: Record<string, string | Uint8Array> = {}): Promise<DocxDoc> {
  const zip = new JSZip()
  zip.file('word/document.xml', document(body))
  if (!('word/_rels/document.xml.rels' in extra)) zip.file('word/_rels/document.xml.rels', RELS())
  for (const [path, content] of Object.entries(extra)) zip.file(path, content)
  return readDocx(await zip.generateAsync({ type: 'uint8array' }))
}

describe('leer el documento', () => {
  it('saca los párrafos', async () => {
    const d = await docx(para(run('Hola mundo')))
    expect(d.blocks).toHaveLength(1)
    expect(d.blocks[0]).toMatchObject({ tag: 'p', html: 'Hola mundo' })
  })

  it('conserva la cursiva y la negrita', async () => {
    const d = await docx(para(run('Era ') + run('rápido', '<w:i/>') + run(' y ') + run('fuerte', '<w:b/>')))
    expect(d.blocks[0].html).toBe('Era <em>rápido</em> y <strong>fuerte</strong>')
  })

  it('la cursiva apagada no cuenta', async () => {
    const d = await docx(para(run('normal', '<w:i w:val="0"/>')))
    expect(d.blocks[0].html).toBe('normal')
  })

  it('junta los trozos que Word parte sin motivo', async () => {
    const d = await docx(para(run('Hol') + run('a mu') + run('ndo')))
    expect(d.blocks[0].html).toBe('Hola mundo')
  })

  it('escapa lo que podría romper el XHTML', async () => {
    // Word escribe las entidades, así que lo que llega aquí es texto de verdad.
    const d = await docx(para(run('Ana &amp; Luis &lt;siempre&gt;')))
    expect(d.blocks[0].html).toBe('Ana &amp; Luis &lt;siempre&gt;')
  })

  it('los saltos de línea se mantienen', async () => {
    const d = await docx(para(`<w:r><w:t>uno</w:t><w:br/><w:t>dos</w:t></w:r>`))
    expect(d.blocks[0].html).toBe('uno<br/>dos')
  })

  it('tira los párrafos vacíos y dice cuántos', async () => {
    const d = await docx(para(run('texto')) + para('') + para(run('  ')))
    expect(d.blocks).toHaveLength(1)
    expect(d.dropped).toBe(2)
  })

  it('reconoce los títulos por el estilo', async () => {
    const d = await docx(heading('Capítulo uno') + heading('Una parte', 2))
    expect(d.blocks.map(b => b.tag)).toEqual(['h1', 'h2'])
  })

  it('también los de un Word en español', async () => {
    const d = await docx(para(run('Capítulo uno'), '<w:pStyle w:val="Ttulo1"/>'))
    expect(d.blocks[0].tag).toBe('h1')
  })

  it('y por el nivel de esquema cuando el estilo no dice nada', async () => {
    const d = await docx(para(run('Título'), '<w:pStyle w:val="MiEstiloRaro"/><w:outlineLvl w:val="0"/>'))
    expect(d.blocks[0].tag).toBe('h1')
  })

  it('un párrafo centrado se marca', async () => {
    const d = await docx(para(run('* * *'), '<w:jc w:val="center"/>'))
    expect(d.blocks[0].centered).toBe(true)
  })

  it('los puntos de una lista se marcan', async () => {
    const d = await docx(para(run('uno'), '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>'))
    expect(d.blocks[0].listItem).toBe(true)
  })

  it('los enlaces de internet se conservan', async () => {
    const d = await docx(
      para(`<w:hyperlink r:id="rId9">${run('mi web')}</w:hyperlink>`),
      { 'word/_rels/document.xml.rels': RELS('<Relationship Id="rId9" Type="x" Target="https://ejemplo.com" TargetMode="External"/>') },
    )
    expect(d.blocks[0].html).toBe('<a href="https://ejemplo.com">mi web</a>')
  })

  it('un enlace interno se queda en texto, sin href roto', async () => {
    const d = await docx(
      para(`<w:hyperlink r:id="rId9">${run('ver arriba')}</w:hyperlink>`),
      { 'word/_rels/document.xml.rels': RELS('<Relationship Id="rId9" Type="x" Target="marcador.docx"/>') },
    )
    expect(d.blocks[0].html).toBe('ver arriba')
  })

  it('avisa si el archivo no es un .docx', async () => {
    const zip = new JSZip()
    zip.file('cualquier.txt', 'nada')
    await expect(readDocx(await zip.generateAsync({ type: 'uint8array' }))).rejects.toThrow(/docx/i)
  })
})

describe('las imágenes', () => {
  const imagen = new Uint8Array([137, 80, 78, 71, 1, 2, 3])

  const conImagen = () => docx(
    para(`<w:r><w:drawing><a:blip xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" r:embed="rId5"/></w:drawing></w:r>`),
    {
      'word/_rels/document.xml.rels': RELS('<Relationship Id="rId5" Type="x" Target="media/image1.png"/>'),
      'word/media/image1.png': imagen,
    },
  )

  it('salen con sus bytes y su tipo', async () => {
    const d = await conImagen()
    expect(d.images).toHaveLength(1)
    expect(d.images[0]).toMatchObject({ name: 'image1.png', mediaType: 'image/png' })
    expect(d.images[0].bytes).toEqual(imagen)
  })

  it('el párrafo las enlaza', async () => {
    const d = await conImagen()
    expect(d.blocks[0].html).toContain('<img src="%IMG%image1.png" alt=""/>')
  })

  it('al montar el capítulo apuntan a la carpeta del libro', async () => {
    const d = await conImagen()
    const [c] = toChapters(d)
    expect(c.html).toContain('src="../Images/image1.png"')
    expect(c.images).toEqual(['image1.png'])
  })
})

describe('las notas al pie', () => {
  const NOTAS = `<?xml version="1.0" encoding="UTF-8"?>
<w:footnotes ${W} ${RNS}>
  <w:footnote w:id="0"><w:p>${run('separador')}</w:p></w:footnote>
  <w:footnote w:id="2"><w:p>${run('Nota del traductor.')}</w:p></w:footnote>
</w:footnotes>`

  const conNota = () => docx(
    para(run('Dijo algo') + `<w:r><w:footnoteReference w:id="2"/></w:r>`),
    { 'word/footnotes.xml': NOTAS },
  )

  it('la llamada queda como la del editor', async () => {
    const d = await conNota()
    expect(d.blocks[0].html).toContain('epub:type="noteref"')
    expect(d.blocks[0].html).toContain('href="#nota2"')
  })

  it('el texto de la nota se lee', async () => {
    const d = await conNota()
    expect(d.notes.get('2')).toBe('Nota del traductor.')
  })

  it('las notas automáticas de Word no cuentan', async () => {
    const d = await conNota()
    expect(d.notes.has('0')).toBe(false)
  })

  it('el aside va al final del capítulo', async () => {
    const [c] = toChapters(await conNota())
    expect(c.html).toContain('<aside class="nota-trad" epub:type="footnote" id="nota2"')
    expect(c.html).toContain('Nota del traductor.')
    expect(c.html.indexOf('aside')).toBeGreaterThan(c.html.indexOf('Dijo algo'))
  })
})

describe('partir en capítulos', () => {
  const tres = () => docx(
    heading('Uno') + para(run('texto uno')) +
    heading('Dos') + para(run('texto dos')) +
    heading('Tres') + para(run('texto tres')),
  )

  it('uno por cada título de nivel 1', async () => {
    const c = toChapters(await tres())
    expect(c.map(x => x.title)).toEqual(['Uno', 'Dos', 'Tres'])
  })

  it('el título se queda dentro del capítulo', async () => {
    const [c] = toChapters(await tres())
    expect(c.html).toContain('<h1>Uno</h1>')
    expect(c.html).toContain('<p>texto uno</p>')
  })

  it('lo que va antes del primer título no se pierde', async () => {
    const d = await docx(para(run('Dedicatoria suelta')) + heading('Uno') + para(run('texto')))
    const c = toChapters(d)
    expect(c[0].title).toBe('Comienzo')
    expect(c[0].html).toContain('Dedicatoria suelta')
  })

  it('con splitAt 0 todo va junto', async () => {
    const c = toChapters(await tres(), { splitAt: 0, imagePrefix: '../Images/' })
    expect(c).toHaveLength(1)
    expect(c[0].html).toContain('<h1>Tres</h1>')
  })

  it('partiendo por nivel 2 también corta en los de nivel 1', async () => {
    const d = await docx(heading('Parte') + heading('Capítulo', 2) + para(run('x')))
    expect(toChapters(d, { splitAt: 2, imagePrefix: '' }).map(c => c.title)).toEqual(['Parte', 'Capítulo'])
  })

  it('cuenta las palabras de cada capítulo', async () => {
    const d = await docx(heading('Uno') + para(run('una dos tres')))
    expect(toChapters(d)[0].words).toBe(4) // el título también es texto del libro
  })

  it('los puntos de lista van dentro de un ul', async () => {
    const lista = '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>'
    const d = await docx(para(run('uno'), lista) + para(run('dos'), lista) + para(run('fuera')))
    const [c] = toChapters(d)
    expect(c.html).toContain('<ul>\n    <li>uno</li>\n    <li>dos</li>\n  </ul>')
    expect(c.html).toContain('<p>fuera</p>')
  })

  it('el párrafo centrado lleva su clase', async () => {
    const d = await docx(para(run('* * *'), '<w:jc w:val="center"/>'))
    expect(toChapters(d)[0].html).toContain('<p class="centrado">* * *</p>')
  })
})
