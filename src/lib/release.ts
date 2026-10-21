// Antes de publicar: todas las revisiones a la vez y un veredicto.
//
// El editor ya sabe mirar cada cosa por separado —la estructura, los enlaces,
// el diálogo, los nombres—, pero para saber si el libro está listo había que
// abrir seis paneles y acordarse de los seis. Esto los junta y dice una sola
// cosa: se puede publicar o no.
//
// Aquí no se revisa nada nuevo: se llama a lo que ya existe y se traduce a
// semáforo. Lo que rompe el libro o lo que una tienda rechaza es rojo; lo que
// solo conviene arreglar es amarillo.

import { isTextFile, parseManifest, type EpubBook } from './epub'
import { reviewDialogue, fixable } from './dialogue'
import { findBrokenLinks, findOrphans, prettyBytes, totalBytes } from './housekeeping'
import { coverImagePath, readMetadata } from './metadata'
import { findNames, inconsistent } from './names'
import { bookReport } from './report'
import { navItemPath, readToc } from './structure'
import { countBySeverity, validateBook } from './validate'
import { isStale, tocLines, visibleTocPath } from './visibleToc'

export type Level = 'ok' | 'warn' | 'error'

/** Qué panel abre cada bloque; la app lo traduce a su diálogo. */
export type Opens = 'problems' | 'cleanup' | 'dialogue' | 'names' | 'images' | 'metadata' | 'toc' | 'report'

export interface Block {
  id: string
  label: string
  level: Level
  /** Una línea: lo que hay. */
  summary: string
  /** Qué hacer, si hay algo que hacer. */
  advice?: string
  opens?: Opens
}

export interface Release {
  blocks: Block[]
  level: Level
  /** Cuánto ocupará el EPUB, aproximado. */
  bytes: number
  words: number
}

/** Una imagen por encima de esto hace el libro pesado sin que se note mejor. */
const HEAVY_IMAGE = 400 * 1024
/** Por debajo de esto, la portada se ve borrosa en las tiendas. */
const MIN_COVER_SIDE = 1400

const worst = (a: Level, b: Level): Level =>
  a === 'error' || b === 'error' ? 'error' : a === 'warn' || b === 'warn' ? 'warn' : 'ok'

/** Lee el ancho de un PNG o un JPEG sin decodificar la imagen entera. */
export function imageWidth(bytes: Uint8Array): number | null {
  // PNG: el ancho son cuatro bytes en la cabecera IHDR.
  if (bytes.length > 24 && bytes[0] === 0x89 && bytes[1] === 0x50) {
    return (bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19]
  }
  // JPEG: hay que recorrer los marcadores hasta el que lleva el tamaño.
  if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xff) { i++; continue }
      const marker = bytes[i + 1]
      const size = (bytes[i + 2] << 8) | bytes[i + 3]
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return (bytes[i + 7] << 8) | bytes[i + 8]
      }
      i += 2 + size
    }
  }
  return null
}

function metadataBlock(book: EpubBook): Block {
  const m = readMetadata(book)
  const faltan = [
    !m.title && 'el título',
    !m.creator && 'el autor',
    !m.language && 'el idioma',
    !m.identifier && 'el identificador',
  ].filter(Boolean) as string[]

  if (faltan.length) {
    return {
      id: 'metadatos',
      label: 'Metadatos',
      level: 'error',
      summary: `Falta ${faltan.join(', ')}.`,
      advice: 'Sin esto ninguna tienda acepta el libro.',
      opens: 'metadata',
    }
  }
  const sinSerie = m.series && !m.seriesIndex
  return {
    id: 'metadatos',
    label: 'Metadatos',
    level: sinSerie ? 'warn' : 'ok',
    summary: sinSerie
      ? `«${m.title}», de ${m.creator}. La colección no dice qué número es.`
      : `«${m.title}», de ${m.creator} · ${m.language}`,
    opens: 'metadata',
  }
}

function coverBlock(book: EpubBook): Block {
  const path = coverImagePath(book)
  if (!path) {
    return {
      id: 'portada',
      label: 'Portada',
      level: 'error',
      summary: 'El libro no declara portada.',
      advice: 'Elige la imagen en Metadatos.',
      opens: 'metadata',
    }
  }
  const f = book.files.get(path)
  if (!f) {
    return {
      id: 'portada',
      label: 'Portada',
      level: 'error',
      summary: `La portada declarada (${path.split('/').pop()}) no está en el libro.`,
      advice: 'Vuelve a elegirla en Metadatos.',
      opens: 'metadata',
    }
  }
  const width = f.bytes ? imageWidth(f.bytes) : null
  const small = width != null && width < MIN_COVER_SIDE
  return {
    id: 'portada',
    label: 'Portada',
    level: small ? 'warn' : 'ok',
    summary: small
      ? `${path.split('/').pop()} mide ${width} px de ancho.`
      : `${path.split('/').pop()}${width ? ` · ${width} px` : ''}`,
    advice: small ? `Las tiendas la quieren de ${MIN_COVER_SIDE} px o más.` : undefined,
    opens: 'metadata',
  }
}

function structureBlock(book: EpubBook): Block {
  const { errors, warnings } = countBySeverity(validateBook(book))
  return {
    id: 'estructura',
    label: 'Estructura del EPUB',
    level: errors ? 'error' : warnings ? 'warn' : 'ok',
    summary: errors || warnings
      ? `${errors} error${errors === 1 ? '' : 'es'} y ${warnings} aviso${warnings === 1 ? '' : 's'}.`
      : 'El esqueleto del libro está bien.',
    advice: errors ? 'Un error aquí puede impedir que el libro se abra.' : undefined,
    opens: 'problems',
  }
}

function tocBlock(book: EpubBook): Block {
  const nav = navItemPath(book)
  if (!nav) {
    return {
      id: 'indice',
      label: 'Índice',
      level: 'error',
      summary: 'No hay índice de navegación.',
      advice: 'Regenéralo desde el menú Libro.',
      opens: 'toc',
    }
  }
  const entries = readToc(book).length
  // Capítulos de verdad: ni los preliminares ni la propia página de índice
  // cuentan, o un libro con portadilla y créditos parecería tener de menos.
  const chapters = tocLines(book).length
  const pocas = entries === 0 || entries < chapters / 2
  const visible = visibleTocPath(book)
  const atrasada = visible != null && isStale(book)
  const pagina = visible ? ' Con página de índice visible.' : ''
  return {
    id: 'indice',
    label: 'Índice',
    level: pocas || atrasada ? 'warn' : 'ok',
    summary: `${entries} entrada${entries === 1 ? '' : 's'} para ${chapters} capítulo${chapters === 1 ? '' : 's'}.${pagina}`,
    advice: atrasada
      ? 'La página de índice visible no dice lo que hay ahora: edita algo o vuelve a añadirla para rehacerla.'
      : pocas ? 'Puede que falten títulos o que haya que regenerarlo.' : undefined,
    opens: 'toc',
  }
}

function linksBlock(book: EpubBook): Block {
  const broken = findBrokenLinks(book)
  const orphans = findOrphans(book)
  if (!broken.length && !orphans.length) {
    return { id: 'enlaces', label: 'Enlaces y archivos', level: 'ok', summary: 'Todo enlaza a su sitio y nada sobra.', opens: 'cleanup' }
  }
  const partes = [
    broken.length && `${broken.length} enlace${broken.length === 1 ? '' : 's'} roto${broken.length === 1 ? '' : 's'}`,
    orphans.length && `${orphans.length} archivo${orphans.length === 1 ? '' : 's'} sin usar (${prettyBytes(totalBytes(orphans))})`,
  ].filter(Boolean)
  return {
    id: 'enlaces',
    label: 'Enlaces y archivos',
    level: broken.length ? 'error' : 'warn',
    summary: `${partes.join(' · ')}.`,
    advice: broken.length ? 'Un enlace roto es lo primero que ve un revisor.' : 'Ocupan sitio sin que nadie los vea.',
    opens: 'cleanup',
  }
}

function dialogueBlock(book: EpubBook): Block {
  const all = reviewDialogue(book)
  if (!all.length) {
    return { id: 'dialogo', label: 'Diálogo y puntuación', level: 'ok', summary: 'La puntuación del diálogo está bien.', opens: 'dialogue' }
  }
  const auto = fixable(all).length
  return {
    id: 'dialogo',
    label: 'Diálogo y puntuación',
    level: 'warn',
    summary: `${all.length} aviso${all.length === 1 ? '' : 's'}, ${auto} se arreglan solos.`,
    advice: 'No impide publicar, pero se nota al leer.',
    opens: 'dialogue',
  }
}

function namesBlock(book: EpubBook): Block {
  const malos = inconsistent(findNames(book))
  return {
    id: 'nombres',
    label: 'Nombres propios',
    level: malos.length ? 'warn' : 'ok',
    summary: malos.length
      ? `${malos.length} nombre${malos.length === 1 ? ' se escribe' : 's se escriben'} de varias formas: ${malos.slice(0, 3).map(g => g.main).join(', ')}${malos.length > 3 ? '…' : ''}`
      : 'Cada nombre se escribe siempre igual.',
    advice: malos.length ? 'Puede ser a propósito; míralo antes de publicar.' : undefined,
    opens: 'names',
  }
}

function imagesBlock(book: EpubBook): Block {
  const pesadas = [...book.files.values()].filter(
    f => f.mediaType.startsWith('image/') && (f.bytes?.length ?? 0) > HEAVY_IMAGE,
  )
  const sinAlt = [...book.files.values()].reduce((n, f) => {
    if (f.text == null || f.mediaType !== 'application/xhtml+xml') return n
    return n + [...f.text.matchAll(/<img\b([^>]*)>/gi)].filter(m => !/\balt\s*=/.test(m[1])).length
  }, 0)

  if (!pesadas.length && !sinAlt) {
    return { id: 'imagenes', label: 'Imágenes', level: 'ok', summary: 'Ninguna pesa de más y todas tienen alt.', opens: 'images' }
  }
  const partes = [
    pesadas.length && `${pesadas.length} pesa${pesadas.length === 1 ? '' : 'n'} más de ${prettyBytes(HEAVY_IMAGE)}`,
    sinAlt && `${sinAlt} sin texto alternativo`,
  ].filter(Boolean)
  return {
    id: 'imagenes',
    label: 'Imágenes',
    level: 'warn',
    summary: `${partes.join(' · ')}.`,
    advice: sinAlt ? 'El alt es lo que lee quien no ve la imagen.' : 'Optimizarlas aligera la descarga.',
    opens: pesadas.length ? 'images' : 'problems',
  }
}

function sizeBlock(book: EpubBook): { bytes: number; words: number; block: Block } {
  let bytes = 0
  for (const f of book.files.values()) {
    bytes += f.bytes?.byteLength ?? (f.text ? new Blob([f.text]).size : 0)
  }
  const { words, chapters } = bookReport(book)
  const vacios = chapters.filter(c => c.words === 0).length
  return {
    bytes,
    words,
    block: {
      id: 'contenido',
      label: 'Contenido',
      level: vacios ? 'warn' : 'ok',
      summary: `${words.toLocaleString('es')} palabras en ${chapters.length} capítulo${chapters.length === 1 ? '' : 's'} · ${prettyBytes(bytes)}`,
      advice: vacios ? `${vacios} capítulo${vacios === 1 ? ' está vacío' : 's están vacíos'}.` : undefined,
      opens: 'report',
    },
  }
}

/** Archivos declarados que no son ni texto ni imagen ni fuente: suelen sobrar. */
function strayBlock(book: EpubBook): Block | null {
  const raros = parseManifest(book).filter(i =>
    !i.mediaType.startsWith('image/') &&
    !i.mediaType.startsWith('font/') &&
    !isTextFile(i.path) &&
    i.mediaType !== 'application/x-dtbncx+xml')
  if (!raros.length) return null
  return {
    id: 'raros',
    label: 'Archivos extraños',
    level: 'warn',
    summary: `${raros.length} archivo${raros.length === 1 ? '' : 's'} de tipo poco habitual: ${raros.slice(0, 2).map(i => i.path.split('/').pop()).join(', ')}.`,
    advice: 'Algunas tiendas rechazan lo que no reconocen.',
    opens: 'cleanup',
  }
}

export function reviewRelease(book: EpubBook): Release {
  const size = sizeBlock(book)
  const blocks = [
    metadataBlock(book),
    coverBlock(book),
    structureBlock(book),
    tocBlock(book),
    linksBlock(book),
    imagesBlock(book),
    dialogueBlock(book),
    namesBlock(book),
    size.block,
    strayBlock(book),
  ].filter((b): b is Block => b != null)

  return {
    blocks,
    level: blocks.reduce<Level>((acc, b) => worst(acc, b.level), 'ok'),
    bytes: size.bytes,
    words: size.words,
  }
}

export function verdict(level: Level): string {
  if (level === 'error') return 'Hay cosas que arreglar antes de publicar'
  if (level === 'warn') return 'Se puede publicar, pero conviene mirar lo marcado'
  return 'El libro está listo para publicar'
}
