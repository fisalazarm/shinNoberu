// Redimensionar y recomprimir las imágenes del libro.
//
// Un EPUB que viene de otra herramienta suele traer los JPEG tal cual salieron
// del escáner: 4000 px de ancho para una página que se lee a 1200. Eso es la
// mayor parte del peso del archivo.

export interface ImageOptions {
  /** Lado mayor, en píxeles. */
  maxSide: number
  /** Calidad de JPEG y WebP, de 0 a 1. */
  quality: number
  /** `keep` respeta el formato de origen. */
  format: 'keep' | 'jpeg' | 'webp'
}

export const defaultImageOptions: ImageOptions = {
  maxSide: 1600,
  quality: 0.82,
  format: 'keep',
}

export interface ImageInfo {
  width: number
  height: number
}

export interface Optimized {
  bytes: Uint8Array
  mediaType: string
  width: number
  height: number
}

/** Tamaño de destino, manteniendo la proporción y sin agrandar nunca. */
export function targetSize(width: number, height: number, maxSide: number): ImageInfo {
  const side = Math.max(width, height)
  if (!side || side <= maxSide) return { width, height }
  const k = maxSide / side
  return {
    width: Math.max(1, Math.round(width * k)),
    height: Math.max(1, Math.round(height * k)),
  }
}

/** Los PNG con transparencia se quedan en PNG: pasarlos a JPEG los ennegrece. */
export function outputType(sourceType: string, format: ImageOptions['format']): string {
  if (format === 'jpeg') return 'image/jpeg'
  if (format === 'webp') return 'image/webp'
  if (sourceType === 'image/png' || sourceType === 'image/gif') return 'image/png'
  if (sourceType === 'image/webp') return 'image/webp'
  return 'image/jpeg'
}

export const canOptimize = (mediaType: string) =>
  ['image/jpeg', 'image/png', 'image/webp'].includes(mediaType)

async function decode(bytes: Uint8Array, mediaType: string): Promise<ImageBitmap> {
  return createImageBitmap(new Blob([bytes as BlobPart], { type: mediaType }))
}

/** Lee el tamaño sin tocar nada, para la lista del diálogo. */
export async function readSize(bytes: Uint8Array, mediaType: string): Promise<ImageInfo | null> {
  try {
    const bmp = await decode(bytes, mediaType)
    const out = { width: bmp.width, height: bmp.height }
    bmp.close()
    return out
  } catch {
    return null
  }
}

/**
 * Devuelve la imagen optimizada, o `null` si no se pudo o si no salía a
 * cuenta: recomprimir algo que ya está apretado solo pierde calidad.
 */
export async function optimizeImage(
  bytes: Uint8Array,
  mediaType: string,
  opts: ImageOptions,
): Promise<Optimized | null> {
  if (!canOptimize(mediaType)) return null
  try {
    const bmp = await decode(bytes, mediaType)
    const source = { width: bmp.width, height: bmp.height } // bmp se cierra luego
    const size = targetSize(source.width, source.height, opts.maxSide)
    const type = outputType(mediaType, opts.format)

    const canvas = document.createElement('canvas')
    canvas.width = size.width
    canvas.height = size.height
    const ctx = canvas.getContext('2d')
    if (!ctx) { bmp.close(); return null }
    // Fondo blanco al pasar a JPEG, que no sabe de transparencia.
    if (type === 'image/jpeg') {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, size.width, size.height)
    }
    ctx.drawImage(bmp, 0, 0, size.width, size.height)
    bmp.close()

    const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, type, opts.quality))
    if (!blob) return null
    const out = new Uint8Array(await blob.arrayBuffer())

    // Si no adelgaza y tampoco se ha redimensionado, no vale la pena tocarla.
    if (out.byteLength >= bytes.byteLength && size.width === source.width) return null

    return { bytes: out, mediaType: type, width: size.width, height: size.height }
  } catch {
    return null
  }
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} kB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}
