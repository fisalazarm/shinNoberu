import { useMemo, useState } from 'react'
import Modal from './Modal'
import Icon from './Icon'
import type { EpubBook } from '../lib/epub'
import { iconForFile } from '../lib/fileIcon'
import {
  findBrokenLinks, findOrphans, prettyBytes, totalBytes, type BrokenLink,
} from '../lib/housekeeping'

interface Props {
  book: EpubBook
  /** Cambia con cada modificación del libro: fuerza a rehacer el análisis. */
  rev: number
  onDelete: (paths: string[]) => void
  onFix: (links: BrokenLink[]) => void
  onGo: (path: string, from: number, to: number) => void
  onClose: () => void
}

export default function CleanupDialog(props: Props) {
  const [marked, setMarked] = useState<Set<string>>(new Set())

  // `rev` entra a propósito: el libro se modifica en el lugar.
  const orphans = useMemo(() => findOrphans(props.book), [props.book, props.rev])
  const broken = useMemo(() => findBrokenLinks(props.book), [props.book, props.rev])
  const fixable = broken.filter(l => l.suggestion)

  const toggle = (path: string) =>
    setMarked(prev => {
      const next = new Set(prev)
      if (!next.delete(path)) next.add(path)
      return next
    })

  const allMarked = orphans.length > 0 && marked.size === orphans.length
  const toggleAll = () => setMarked(allMarked ? new Set() : new Set(orphans.map(o => o.path)))
  const markedBytes = totalBytes(orphans.filter(o => marked.has(o.path)))

  const name = (p: string) => p.split('/').pop()

  return (
    <Modal title="Enlaces y archivos sueltos" onClose={props.onClose} wide>
      <div className="cleanup">
        <section>
          <h3>
            Archivos que no usa nadie
            <span className="count">{orphans.length}</span>
            {orphans.length > 0 && <span className="weigh">{prettyBytes(totalBytes(orphans))}</span>}
            {orphans.length > 0 && (
              <button className="ghost mark-all" onClick={toggleAll}>
                {allMarked ? 'Desmarcar todos' : 'Marcar todos'}
              </button>
            )}
          </h3>

          {orphans.length === 0
            ? <p className="hint">Nada sobra: a todos los archivos se llega desde el libro.</p>
            : (
              <>
                <p className="hint">
                  No se llega a ellos desde el orden de lectura, ni desde el índice, ni desde la
                  portada, ni desde ningún enlace. Ocupan sitio en el EPUB sin que nadie los vea.
                </p>
                <ul className="orphan-list">
                  {orphans.map(o => (
                    <li key={o.path}>
                      <label>
                        <input type="checkbox" checked={marked.has(o.path)} onChange={() => toggle(o.path)} />
                        <Icon name={iconForFile(o.mediaType, o.path)} size={13} />
                        <span className="who">{o.path}</span>
                        {!o.inManifest && <span className="tag" title="Ni siquiera está declarado en el manifest">fuera del manifest</span>}
                        <span className="weigh">{prettyBytes(o.bytes)}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </>
            )}
        </section>

        <section>
          <h3>
            Enlaces que no llevan a ninguna parte
            <span className="count">{broken.length}</span>
          </h3>

          {broken.length === 0
            ? <p className="hint">Todos los enlaces internos llegan a su sitio.</p>
            : (
              <ul className="broken-list">
                {broken.map(l => (
                  <li key={`${l.file}:${l.from}`}>
                    <button className="where" onClick={() => props.onGo(l.file, l.from, l.to)} title={`${l.file}:${l.line}`}>
                      <span className="ln">{name(l.file)}:{l.line}</span>
                      <code>{l.raw}</code>
                      <span className="why">
                        {l.kind === 'file' ? 'ese archivo no está en el libro' : 'ese ancla no existe'}
                      </span>
                    </button>
                    {l.suggestion
                      ? (
                        <button className="ghost fix" title={l.suggestion.why} onClick={() => props.onFix([l])}>
                          → <code>{l.suggestion.raw}</code>
                        </button>
                      )
                      : <span className="hint no-fix">sin arreglo claro</span>}
                  </li>
                ))}
              </ul>
            )}
        </section>
      </div>

      <footer>
        <span className="hint">
          {fixable.length > 0 && `${fixable.length} con arreglo propuesto`}
          {fixable.length > 0 && broken.length > fixable.length && ' · '}
          {broken.length > fixable.length && `${broken.length - fixable.length} hay que mirarlos a mano`}
        </span>
        <button className="ghost" onClick={props.onClose}>Cerrar</button>
        <button className="ghost" disabled={!fixable.length} onClick={() => props.onFix(fixable)}>
          Arreglar {fixable.length} enlace{fixable.length === 1 ? '' : 's'}
        </button>
        <button className="primary danger" disabled={!marked.size} onClick={() => { props.onDelete([...marked]); setMarked(new Set()) }}>
          Eliminar {marked.size} archivo{marked.size === 1 ? '' : 's'} ({prettyBytes(markedBytes)})
        </button>
      </footer>
    </Modal>
  )
}
