import { beforeEach, describe, expect, it } from 'vitest'
import type { EpubBook, EpubFile } from './epub'
import { addFrontMatter, suggestText } from './frontMatter'
import {
  applyTemplate, captureTemplate, defaultApplyOptions, defaultTemplate, defaultTemplateName,
  deleteTemplate, describe as describeTemplate, exportTemplates, importTemplates,
  loadTemplates, previewTemplate, saveTemplate, setDefaultTemplate,
} from './layoutTemplate'
import { applyNovelStyle, defaultNovelStyle, readStyle } from './novelStyle'

beforeEach(() => localStorage.clear())

const NAV = `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Índice</title></head>
<body>
  <nav epub:type="toc" id="toc"><ol><li><a href="Cap01.xhtml">Capítulo 1</a></li></ol></nav>
  <nav epub:type="landmarks" id="landmarks" hidden=""><ol>
    <li><a epub:type="bodymatter" href="Cap01.xhtml">Comienzo</a></li>
  </ol></nav>
</body></html>`

function book(title = 'La travesía', autor = 'Ana Ruiz', css = 'p { margin: 0 }\n'): EpubBook {
  const files = new Map<string, EpubFile>()
  files.set('OEBPS/Text/Cap01.xhtml', {
    path: 'OEBPS/Text/Cap01.xhtml',
    mediaType: 'application/xhtml+xml',
    text: `<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Uno</title>
<link href="../Styles/style.css" rel="stylesheet" type="text/css"/></head>
<body><p>Primero</p>
<p>* * *</p>
<p>Segundo</p></body></html>`,
  })
  files.set('OEBPS/Text/toc.xhtml', { path: 'OEBPS/Text/toc.xhtml', mediaType: 'application/xhtml+xml', text: NAV })
  files.set('OEBPS/Styles/style.css', { path: 'OEBPS/Styles/style.css', mediaType: 'text/css', text: css })
  files.set('OEBPS/content.opf', {
    path: 'OEBPS/content.opf',
    mediaType: 'application/oebps-package+xml',
    text: `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="id">urn:uuid:x</dc:identifier>
    <dc:title>${title}</dc:title>
    <dc:creator>${autor}</dc:creator>
    <dc:language>es</dc:language>
  </metadata>
  <manifest>
    <item id="nav" href="Text/toc.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="css" href="Styles/style.css" media-type="text/css"/>
    <item id="c1" href="Text/Cap01.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine><itemref idref="c1"/></spine>
</package>`,
  })
  return { files, opfPath: 'OEBPS/content.opf' }
}

/** Un libro ya maquetado: estilos aplicados y preliminares puestos. */
function maquetado(): EpubBook {
  const b = book()
  applyNovelStyle(b, { ...defaultNovelStyle, lineHeight: 1.8, dropCap: 4, scene: '❧' })
  addFrontMatter(b, ['portadilla', 'creditos'], suggestText(b))
  b.files.get('OEBPS/Styles/style.css')!.text += '\n.mia { color: red }\n'
  return b
}

const css = (b: EpubBook) => b.files.get('OEBPS/Styles/style.css')!.text!

describe('guardar una plantilla', () => {
  it('recoge estilos, hoja y preliminares del libro', () => {
    const t = captureTemplate(maquetado(), 'Mi novela')!
    expect(t.novel?.lineHeight).toBe(1.8)
    expect(t.novel?.scene).toBe('❧')
    expect(t.css).toContain('.mia { color: red }')
    expect(t.pieces.sort()).toEqual(['creditos', 'portadilla'])
  })

  it('un libro sin maquetar da una plantilla casi vacía', () => {
    const t = captureTemplate(book(), 'Pelada')!
    expect(t.novel).toBeNull()
    expect(t.pieces).toEqual([])
    expect(describeTemplate(t)).toBe('hoja de estilos')
  })

  it('no acepta un nombre vacío', () => {
    expect(captureTemplate(book(), '   ')).toBeNull()
  })

  it('se guarda y se recupera', () => {
    saveTemplate(captureTemplate(maquetado(), 'Mi novela')!)
    const [t] = loadTemplates()
    expect(t.name).toBe('Mi novela')
    expect(t.novel?.dropCap).toBe(4)
  })

  it('guardar con el mismo nombre reemplaza', () => {
    saveTemplate(captureTemplate(maquetado(), 'Mi novela')!)
    const list = saveTemplate(captureTemplate(book(), 'Mi novela')!)
    expect(list.filter(t => t.name === 'Mi novela')).toHaveLength(1)
    expect(list[0].novel).toBeNull()
  })

  it('se borra', () => {
    saveTemplate(captureTemplate(maquetado(), 'Mi novela')!)
    expect(deleteTemplate('Mi novela')).toEqual([])
  })

  it('con basura en el almacén no se cae', () => {
    localStorage.setItem('epub-editor.plantillas', 'no es json')
    expect(loadTemplates()).toEqual([])
  })
})

describe('aplicar una plantilla', () => {
  const plantilla = () => captureTemplate(maquetado(), 'Mi novela')!

  it('lleva los estilos de novela al libro nuevo', () => {
    const otro = book('Otro libro', 'Luis Paz')
    applyTemplate(otro, plantilla())
    expect(readStyle(otro)?.lineHeight).toBe(1.8)
    expect(css(otro)).toContain('font-size: 7.2em') // capitular de 4 líneas
  })

  it('y marca el libro nuevo con ellos', () => {
    const otro = book('Otro libro', 'Luis Paz')
    applyTemplate(otro, plantilla())
    expect(otro.files.get('OEBPS/Text/Cap01.xhtml')!.text).toContain('class="capitular"')
    expect(otro.files.get('OEBPS/Text/Cap01.xhtml')!.text).toContain('class="escena">❧')
  })

  it('por defecto fusiona: lo del libro se queda y entra lo que le falta', () => {
    const otro = book('Otro libro', 'Luis Paz', 'p { color: blue }\n')
    applyTemplate(otro, plantilla())
    expect(css(otro)).toContain('color: blue')
    expect(css(otro)).toContain('.mia { color: red }')
  })

  it('y si se pide reemplazar, se reemplaza entera', () => {
    const otro = book('Otro libro', 'Luis Paz', 'p { color: blue }\n')
    applyTemplate(otro, plantilla(), { ...defaultApplyOptions, css: 'replace' })
    expect(css(otro)).toContain('.mia { color: red }')
    expect(css(otro)).not.toContain('color: blue')
  })

  it('los preliminares se rellenan con los metadatos del libro nuevo', () => {
    const otro = book('Otro libro', 'Luis Paz')
    applyTemplate(otro, plantilla())
    const creditos = otro.files.get('OEBPS/Text/Creditos.xhtml')!.text!
    expect(creditos).toContain('Luis Paz')
    expect(creditos).not.toContain('Ana Ruiz')
    expect(otro.files.has('OEBPS/Text/Portadilla.xhtml')).toBe(true)
  })

  it('dice qué hizo', () => {
    const r = applyTemplate(book('Otro', 'Luis'), plantilla())
    expect(r.done.join(' ')).toContain('reglas de estilo')
    expect(r.done.join(' ')).toContain('estilos de novela')
    expect(r.done.join(' ')).toContain('páginas de cortesía')
    // Lo único que se salta es la editorial, porque el libro ya traía idioma.
    expect(r.skipped.join(' ')).not.toContain('no se pudo')
  })

  it('se puede aplicar solo una parte', () => {
    const otro = book('Otro', 'Luis', 'p { color: blue }\n')
    applyTemplate(otro, plantilla(), { novel: true, css: 'no', pieces: false, imprint: false })
    expect(css(otro)).toContain('color: blue') // la suya no se tocó
    expect(readStyle(otro)?.lineHeight).toBe(1.8)
    expect(otro.files.has('OEBPS/Text/Portadilla.xhtml')).toBe(false)
  })

  it('aplicarla dos veces no duplica nada', () => {
    const otro = book('Otro', 'Luis')
    applyTemplate(otro, plantilla())
    applyTemplate(otro, plantilla())
    expect(css(otro).match(/estilos de novela \(los gestiona/g)).toHaveLength(1)
    expect(otro.files.get('OEBPS/Text/Cap01.xhtml')!.text!.match(/capitular/g)).toHaveLength(1)
  })

  it('avisa de lo que no pudo hacer', () => {
    const vacia = captureTemplate(book(), 'Pelada')!
    const r = applyTemplate(book('Otro', 'Luis'), vacia)
    expect(r.skipped.join(' ')).toContain('estilos de novela')
    expect(r.skipped.join(' ')).toContain('preliminares')
  })

  it('un libro sin hoja de estilos no se rompe', () => {
    const otro = book('Otro', 'Luis')
    otro.files.delete('OEBPS/Styles/style.css')
    const r = applyTemplate(otro, plantilla())
    expect(r.skipped.join(' ')).toContain('no tiene hoja de estilos')
  })
})

describe('editorial e idioma', () => {
  const conEditorial = () => {
    const b = book()
    const opf = b.files.get('OEBPS/content.opf')!
    opf.text = opf.text!.replace('</metadata>', '  <dc:publisher>Editorial Faro</dc:publisher>\n  </metadata>')
    return captureTemplate(b, 'Faro')!
  }

  it('viajan con la plantilla', () => {
    expect(conEditorial().imprint).toMatchObject({ publisher: 'Editorial Faro', language: 'es' })
  })

  it('se ponen en el libro que no los tiene', () => {
    const otro = book('Otro', 'Luis')
    applyTemplate(otro, conEditorial())
    expect(otro.files.get('OEBPS/content.opf')!.text).toContain('Editorial Faro')
  })

  it('no pisan los que el libro ya tiene', () => {
    const otro = book('Otro', 'Luis')
    const opf = otro.files.get('OEBPS/content.opf')!
    opf.text = opf.text!.replace('</metadata>', '  <dc:publisher>La suya</dc:publisher>\n  </metadata>')
    applyTemplate(otro, conEditorial())
    expect(otro.files.get('OEBPS/content.opf')!.text).toContain('La suya')
    expect(otro.files.get('OEBPS/content.opf')!.text).not.toContain('Editorial Faro')
  })

  it('un libro sin editorial no guarda una vacía', () => {
    const t = captureTemplate(book(), 'Pelada')!
    expect(t.imprint).toMatchObject({ publisher: '', language: 'es' })
  })
})

describe('la plantilla de los libros nuevos', () => {
  it('no hay ninguna al empezar', () => {
    expect(defaultTemplateName()).toBe('')
    expect(defaultTemplate()).toBeNull()
  })

  it('se marca y se recupera entera', () => {
    saveTemplate(captureTemplate(maquetado(), 'Mi novela')!)
    setDefaultTemplate('Mi novela')
    expect(defaultTemplate()?.novel?.dropCap).toBe(4)
  })

  it('se desmarca', () => {
    saveTemplate(captureTemplate(maquetado(), 'Mi novela')!)
    setDefaultTemplate('Mi novela')
    setDefaultTemplate('')
    expect(defaultTemplate()).toBeNull()
  })

  it('si la marcada ya no existe, no se inventa otra', () => {
    saveTemplate(captureTemplate(maquetado(), 'Mi novela')!)
    setDefaultTemplate('Mi novela')
    deleteTemplate('Mi novela')
    expect(defaultTemplate()).toBeNull()
  })
})

describe('llevárselas a otro ordenador', () => {
  it('lo exportado se vuelve a importar igual', () => {
    const t = captureTemplate(maquetado(), 'Mi novela')!
    const file = exportTemplates([t])
    localStorage.clear()
    const r = importTemplates(file)
    expect(r.error).toBeUndefined()
    expect(r.added).toHaveLength(1)
    expect(loadTemplates()[0].novel?.scene).toBe('❧')
    expect(loadTemplates()[0].css).toContain('.mia')
  })

  it('no pisa una que ya existe: la renombra', () => {
    saveTemplate(captureTemplate(maquetado(), 'Mi novela')!)
    const file = exportTemplates([captureTemplate(book(), 'Mi novela')!])
    const r = importTemplates(file)
    expect(r.renamed).toEqual(['Mi novela'])
    expect(loadTemplates().map(t => t.name).sort()).toEqual(['Mi novela', 'Mi novela (2)'])
  })

  it('un archivo que no es nuestro se rechaza con nombre y apellidos', () => {
    expect(importTemplates('{"kind":"otra-cosa"}').error).toContain('no es una lista de plantillas')
    expect(importTemplates('no es json').error).toBeTruthy()
    expect(loadTemplates()).toEqual([])
  })

  it('un archivo nuestro pero vacío también', () => {
    expect(importTemplates(exportTemplates([])).error).toContain('no traía ninguna')
  })
})

describe('la vista previa', () => {
  it('lleva la hoja de la plantilla y sus estilos de novela', () => {
    const html = previewTemplate(captureTemplate(maquetado(), 'Mi novela')!)
    expect(html).toContain('.mia { color: red }')
    expect(html).toContain('p.capitular::first-letter')
  })

  it('usa el ornamento de la plantilla en el salto de escena', () => {
    expect(previewTemplate(captureTemplate(maquetado(), 'Mi novela')!)).toContain('>❧<')
  })

  it('una plantilla sin estilos de novela también se puede ver', () => {
    const html = previewTemplate(captureTemplate(book(), 'Pelada')!)
    expect(html).toContain('<h1>Capítulo uno</h1>')
  })
})
