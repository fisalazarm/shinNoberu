import { deflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { parseManifest } from './epub'
import {
  applyFonts, embeddingSync, fontsCss, guessFromName, missingStyles, noRoles, readFontInfo, readFontSetup,
  type Face,
} from './fonts'
import { newEpub } from './newEpub'
import { reviewRelease } from './release'
import { validateBook } from './validate'

// ---------- fuentes de mentira, pero con tablas de verdad ----------

function nameTable(names: Record<number, string>): Uint8Array {
  const ids = Object.keys(names).map(Number)
  const strings = ids.map(id => {
    const s = names[id]
    const out = new Uint8Array(s.length * 2)
    for (let i = 0; i < s.length; i++) { out[i * 2] = s.charCodeAt(i) >> 8; out[i * 2 + 1] = s.charCodeAt(i) & 255 }
    return out
  })
  const head = 6 + ids.length * 12
  const total = head + strings.reduce((n, s) => n + s.length, 0)
  const t = new Uint8Array(total)
  const v = new DataView(t.buffer)
  v.setUint16(2, ids.length)
  v.setUint16(4, head)
  let off = 0
  ids.forEach((id, i) => {
    const at = 6 + i * 12
    v.setUint16(at, 3) // Windows
    v.setUint16(at + 2, 1) // Unicode
    v.setUint16(at + 4, 0x409) // inglés
    v.setUint16(at + 6, id)
    v.setUint16(at + 8, strings[i].length)
    v.setUint16(at + 10, off)
    t.set(strings[i], head + off)
    off += strings[i].length
  })
  return t
}

function os2Table(weight: number, fsType: number, italic: boolean): Uint8Array {
  const t = new Uint8Array(78)
  const v = new DataView(t.buffer)
  v.setUint16(4, weight)
  v.setUint16(8, fsType)
  v.setUint16(62, italic ? 1 : 0x40)
  return t
}

const headTable = () => new Uint8Array(54)

type Tables = Record<string, Uint8Array>

function sfnt(tables: Tables): Uint8Array {
  const tags = Object.keys(tables)
  let off = 12 + tags.length * 16
  const offsets = tags.map(tg => { const o = off; off += (tables[tg].length + 3) & ~3; return o })
  const out = new Uint8Array(off)
  const v = new DataView(out.buffer)
  v.setUint32(0, 0x00010000)
  v.setUint16(4, tags.length)
  tags.forEach((tg, i) => {
    const at = 12 + i * 16
    for (let k = 0; k < 4; k++) out[at + k] = tg.charCodeAt(k)
    v.setUint32(at + 8, offsets[i])
    v.setUint32(at + 12, tables[tg].length)
    out.set(tables[tg], offsets[i])
  })
  return out
}

function woff(tables: Tables): Uint8Array {
  const tags = Object.keys(tables)
  const packed = tags.map(tg => deflateSync(tables[tg]))
  let off = 44 + tags.length * 20
  const offsets = packed.map(p => { const o = off; off += (p.length + 3) & ~3; return o })
  const out = new Uint8Array(off)
  const v = new DataView(out.buffer)
  out.set([0x77, 0x4f, 0x46, 0x46]) // wOFF
  v.setUint16(12, tags.length)
  tags.forEach((tg, i) => {
    const at = 44 + i * 20
    for (let k = 0; k < 4; k++) out[at + k] = tg.charCodeAt(k)
    v.setUint32(at + 4, offsets[i])
    v.setUint32(at + 8, packed[i].length)
    v.setUint32(at + 12, tables[tg].length)
    out.set(packed[i], offsets[i])
  })
  return out
}

const tablas = (family: string, sub: string, weight: number, italic: boolean, fsType = 0): Tables => ({
  name: nameTable({ 1: family, 2: sub, 13: 'This Font Software is licensed under the SIL Open Font License' }),
  'OS/2': os2Table(weight, fsType, italic),
  head: headTable(),
})

describe('leer la fuente', () => {
  it('saca familia, grosor, cursiva y licencia de un TTF', async () => {
    const info = await readFontInfo(sfnt(tablas('Lora', 'Bold Italic', 700, true)), 'cualquiera.ttf')
    expect(info).toMatchObject({ family: 'Lora', weight: 700, italic: true, embedding: 'installable', fromFile: true, format: 'ttf' })
    expect(info.license).toMatch(/Open Font License/)
  })

  it('lee también un WOFF, que va comprimido', async () => {
    const info = await readFontInfo(woff(tablas('Crimson Pro', 'Regular', 400, false)), 'x.woff')
    expect(info).toMatchObject({ family: 'Crimson Pro', weight: 400, italic: false, fromFile: true, format: 'woff' })
  })

  it('avisa de una licencia que no deja incrustar', async () => {
    const info = await readFontInfo(sfnt(tablas('Cara', 'Regular', 400, false, 0x0002)), 'Cara.otf')
    expect(info.embedding).toBe('restricted')
  })

  it('si no se puede leer (WOFF2), tira del nombre del archivo', async () => {
    const info = await readFontInfo(new Uint8Array([0x77, 0x4f, 0x46, 0x32, 0, 0, 0, 0, 0, 0, 0, 0]), 'PlayfairDisplay-BoldItalic.woff2')
    expect(info).toMatchObject({ family: 'Playfair Display', weight: 700, italic: true, embedding: 'unknown', fromFile: false })
  })
})

describe('guessFromName', () => {
  it.each([
    ['Lora-Regular.ttf', 'Lora', 400, false],
    ['Lora-Italic.ttf', 'Lora', 400, true],
    ['Lora-SemiBoldItalic.ttf', 'Lora', 600, true],
    ['EBGaramond-ExtraBold.otf', 'EB Garamond', 800, false],
    ['Merriweather_Light_Italic.woff2', 'Merriweather', 300, true],
    ['Alegreya.ttf', 'Alegreya', 400, false],
  ])('%s', (file, family, weight, italic) => {
    expect(guessFromName(file)).toEqual({ family, weight, italic })
  })
})

describe('missingStyles', () => {
  const face = (weight: number, italic: boolean): Face => ({ path: `F/${weight}${italic}.ttf`, family: 'Lora', weight, italic })

  it('con solo la normal faltan cursiva y negrita', () => {
    expect(missingStyles([face(400, false)], 'Lora')).toEqual(['cursiva', 'negrita'])
  })

  it('con las cuatro no falta nada', () => {
    expect(missingStyles([face(400, false), face(400, true), face(700, false), face(700, true)], 'Lora')).toEqual([])
  })

  it('con normal, cursiva y negrita falta la negrita cursiva', () => {
    expect(missingStyles([face(400, false), face(400, true), face(700, false)], 'Lora')).toEqual(['negrita cursiva'])
  })
})

describe('fontsCss', () => {
  it('declara cada archivo con su ruta relativa a la hoja y usa la familia', () => {
    const css = fontsCss(
      [{ path: 'OEBPS/Fonts/Lora-Italic.ttf', family: 'Lora', weight: 400, italic: true }],
      { ...noRoles, body: 'Lora' },
      'OEBPS/Styles/style.css',
    )
    expect(css).toContain('src: url("../Fonts/Lora-Italic.ttf") format("truetype");')
    expect(css).toContain('font-style: italic;')
    expect(css).toMatch(/html body \{\s*font-family: "Lora", serif;/)
  })
})

describe('applyFonts', () => {
  const lora = (name: string, weight: number, italic: boolean) =>
    ({ name, bytes: sfnt(tablas('Lora', 'x', weight, italic)), family: 'Lora', weight, italic })

  it('mete los archivos, el manifest y el CSS, y se puede volver a leer', () => {
    const book = newEpub()
    const r = applyFonts(book, {
      faces: [], remove: [],
      add: [lora('Lora-Regular.ttf', 400, false), lora('Lora-Italic.ttf', 400, true)],
      roles: { ...noRoles, body: 'Lora', headings: 'Lora' },
    }, 'OEBPS/Fonts')!
    expect(r.added).toEqual(['OEBPS/Fonts/Lora-Regular.ttf', 'OEBPS/Fonts/Lora-Italic.ttf'])
    expect(parseManifest(book).find(i => i.path === 'OEBPS/Fonts/Lora-Italic.ttf')?.mediaType).toBe('font/ttf')

    const setup = readFontSetup(book)
    expect(setup.roles).toMatchObject({ body: 'Lora', headings: 'Lora', dropCap: '' })
    expect(setup.faces.map(f => [f.family, f.weight, f.italic])).toEqual([['Lora', 400, false], ['Lora', 400, true]])
    expect(validateBook(book).filter(p => p.severity === 'error')).toEqual([])
  })

  it('volver a aplicar reemplaza el bloque en vez de añadir otro', () => {
    const book = newEpub()
    const base = { faces: [], remove: [], roles: { ...noRoles, body: 'Lora' } }
    applyFonts(book, { ...base, add: [lora('Lora-Regular.ttf', 400, false)] }, 'OEBPS/Fonts')
    const setup = readFontSetup(book)
    applyFonts(book, { faces: setup.faces, remove: [], add: [], roles: { ...setup.roles, fallback: 'sans-serif' } }, 'OEBPS/Fonts')
    const css = book.files.get(setup.cssPath!)!.text!
    expect(css.match(/fuentes incrustadas \(las gestiona/g)).toHaveLength(1)
    expect(css).toContain('"Lora", sans-serif')
  })

  it('quitar la última fuente quita el bloque y el archivo', () => {
    const book = newEpub()
    const cssPath = readFontSetup(book).cssPath!
    const antes = book.files.get(cssPath)!.text
    applyFonts(book, { faces: [], remove: [], roles: { ...noRoles, body: 'Lora' }, add: [lora('Lora-Regular.ttf', 400, false)] }, 'OEBPS/Fonts')
    const setup = readFontSetup(book)
    applyFonts(book, { faces: setup.faces, remove: ['OEBPS/Fonts/Lora-Regular.ttf'], add: [], roles: setup.roles }, 'OEBPS/Fonts')
    expect(book.files.has('OEBPS/Fonts/Lora-Regular.ttf')).toBe(false)
    expect(book.files.get(cssPath)!.text!.trimEnd()).toBe(antes!.trimEnd())
    expect(validateBook(book).filter(p => p.severity === 'error')).toEqual([])
  })

  it('respeta un @font-face escrito a mano: no lo repite, pero se puede usar', () => {
    const book = newEpub()
    const cssPath = readFontSetup(book).cssPath!
    book.files.set('OEBPS/Fonts/Mia.otf', { path: 'OEBPS/Fonts/Mia.otf', mediaType: 'font/otf', bytes: new Uint8Array(4) })
    const css = book.files.get(cssPath)!
    css.text += '\n@font-face { font-family: "Mía"; src: url(../Fonts/Mia.otf); }\n'
    const setup = readFontSetup(book)
    expect(setup.external.map(f => f.family)).toEqual(['Mía'])
    expect(setup.faces).toEqual([])
    applyFonts(book, { faces: setup.faces, remove: [], add: [], roles: { ...noRoles, body: 'Mía' } }, 'OEBPS/Fonts')
    expect(css.text!.match(/@font-face/g)).toHaveLength(1)
    expect(css.text).toContain('font-family: "Mía", serif;')
  })
})

describe('antes de publicar', () => {
  const add = (book: ReturnType<typeof newEpub>, file: string, weight: number, italic: boolean, fsType = 0) =>
    applyFonts(book, {
      faces: readFontSetup(book).faces, remove: [], roles: { ...noRoles, body: 'Lora' },
      add: [{ name: file, bytes: sfnt(tablas('Lora', 'x', weight, italic, fsType)), family: 'Lora', weight, italic }],
    }, 'OEBPS/Fonts')
  const bloque = (book: ReturnType<typeof newEpub>) => reviewRelease(book).blocks.find(b => b.id === 'fuentes')

  it('sin fuentes no dice nada', () => {
    expect(bloque(newEpub())).toBeUndefined()
  })

  it('una licencia restringida es roja', () => {
    const book = newEpub()
    add(book, 'Lora-Regular.ttf', 400, false, 0x0002)
    expect(embeddingSync(book.files.get('OEBPS/Fonts/Lora-Regular.ttf')!.bytes!)).toBe('restricted')
    expect(bloque(book)).toMatchObject({ level: 'error', opens: 'fonts' })
  })

  it('sin cursiva para el texto es amarillo; con la familia completa, verde', () => {
    const book = newEpub()
    add(book, 'Lora-Regular.ttf', 400, false)
    expect(bloque(book)).toMatchObject({ level: 'warn' })
    expect(bloque(book)!.summary).toMatch(/cursiva/)
    add(book, 'Lora-Italic.ttf', 400, true)
    add(book, 'Lora-Bold.ttf', 700, false)
    add(book, 'Lora-BoldItalic.ttf', 700, true)
    expect(bloque(book)).toMatchObject({ level: 'ok' })
  })
})
