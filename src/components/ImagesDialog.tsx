import { useEffect, useMemo, useState } from 'react'
import Modal from './Modal'
import type { EpubBook, EpubFile } from '../lib/epub'
import {
  canOptimize, defaultImageOptions, formatBytes, optimizeImage, readSize, targetSize,
  type ImageOptions, type Optimized,
} from '../lib/images'

interface Props {
  book: EpubBook
  rev: number
  onApply: (results: Map<string, Optimized>) => void
  onClose: () => void
}

interface Row {
  file: EpubFile
  width?: number
  height?: number
  result?: Optimized | null // null = probada y no sale a cuenta
}

export default function ImagesDialog(props: Props) {
  const [options, setOptions] = useState<ImageOptions>(defaultImageOptions)
  const [rows, setRows] = useState<Row[]>([])
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  const set = (patch: Partial<ImageOptions>) => {
    setOptions(o => ({ ...o, ...patch }))
    setDone(false)
    setRows(rs => rs.map(r => ({ ...r, result: undefined })))
  }

  const images = useMemo(
    () => [...props.book.files.values()].filter(f => f.bytes && canOptimize(f.mediaType)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [props.book, props.rev],
  )

  // El tamaño en píxeles hay que decodificarlo; se hace una vez al abrir.
  useEffect(() => {
    let alive = true
    Promise.all(
      images.map(async file => {
        const size = await readSize(file.bytes!, file.mediaType)
        return { file, width: size?.width, height: size?.height } as Row
      }),
    ).then(rs => { if (alive) setRows(rs) })
    return () => { alive = false }
  }, [images])

  const analyse = async () => {
    setBusy(true)
    const out: Row[] = []
    for (const r of rows) {
      out.push({ ...r, result: await optimizeImage(r.file.bytes!, r.file.mediaType, options) })
    }
    setRows(out)
    setBusy(false)
    setDone(true)
  }

  const gains = rows.filter(r => r.result)
  const before = gains.reduce((n, r) => n + r.file.bytes!.byteLength, 0)
  const after = gains.reduce((n, r) => n + r.result!.bytes.byteLength, 0)

  const apply = () => {
    const map = new Map<string, Optimized>()
    for (const r of gains) map.set(r.file.path, r.result!)
    props.onApply(map)
  }

  const name = (p: string) => p.split('/').pop()

  return (
    <Modal title="Optimizar imágenes" onClose={props.onClose} wide>
      <div className="paste-options">
        <label>
          Lado mayor
          <select value={options.maxSide} onChange={e => set({ maxSide: Number(e.target.value) })}>
            {[1000, 1200, 1600, 2000, 2560, 99999].map(px => (
              <option key={px} value={px}>{px === 99999 ? 'No redimensionar' : `${px} px`}</option>
            ))}
          </select>
        </label>
        <label>
          Calidad {Math.round(options.quality * 100)}%
          <input
            type="range" min={40} max={100}
            value={Math.round(options.quality * 100)}
            onChange={e => set({ quality: Number(e.target.value) / 100 })}
          />
        </label>
        <label>
          Formato
          <select value={options.format} onChange={e => set({ format: e.target.value as ImageOptions['format'] })}>
            <option value="keep">Mantener</option>
            <option value="jpeg">JPEG</option>
            <option value="webp">WebP</option>
          </select>
        </label>
        <button disabled={busy || !rows.length} onClick={analyse}>
          {busy ? 'Calculando…' : 'Calcular'}
        </button>
      </div>

      <div className="img-list">
        {!rows.length && <p className="empty">El libro no tiene imágenes que se puedan optimizar.</p>}
        {rows.map(r => {
          const size = r.width ? targetSize(r.width, r.height!, options.maxSide) : undefined
          const shrinks = size && r.width && size.width < r.width
          return (
            <div key={r.file.path} className="img-row">
              <span className="name" title={r.file.path}>{name(r.file.path)}</span>
              <span className="dims">
                {r.width ? `${r.width}×${r.height}` : '—'}
                {shrinks && <span className="to"> → {size!.width}×{size!.height}</span>}
              </span>
              <span className="size">{formatBytes(r.file.bytes!.byteLength)}</span>
              <span className="after">
                {r.result === undefined && (done ? '' : '')}
                {r.result === null && <span className="hint">ya está ajustada</span>}
                {r.result && (
                  <>
                    <span className="minus">{formatBytes(r.result.bytes.byteLength)}</span>
                    <span className="pct">
                      −{Math.round((1 - r.result.bytes.byteLength / r.file.bytes!.byteLength) * 100)}%
                    </span>
                  </>
                )}
              </span>
            </div>
          )
        })}
      </div>

      <footer>
        <span className="hint">
          {done && (gains.length
            ? `${gains.length} de ${rows.length} · ${formatBytes(before)} → ${formatBytes(after)}`
            : 'No hay nada que ganar con estos ajustes.')}
          {!done && !!rows.length && 'Pulsa «Calcular» para ver cuánto se ahorra.'}
        </span>
        <button className="ghost" onClick={props.onClose}>Cancelar</button>
        <button className="primary" disabled={!gains.length} onClick={apply}>
          Optimizar {gains.length ? `(${gains.length})` : ''}
        </button>
      </footer>
    </Modal>
  )
}
