import { useMemo, useState } from 'react'
import Modal from './Modal'
import type { EpubBook } from '../lib/epub'
import { collectHeadings } from '../lib/structure'

interface Props {
  book: EpubBook
  rev: number
  onApply: (opts: { maxLevel: number; ncx: boolean }) => void
  onClose: () => void
}

export default function TocDialog(props: Props) {
  const [maxLevel, setMaxLevel] = useState(2)
  const [ncx, setNcx] = useState(false)

  // Sin assignIds: es solo una vista previa, no debe tocar el libro.
  // `rev` entra a propósito: el libro se modifica en el lugar.
  const headings = useMemo(
    () => collectHeadings(props.book, { maxLevel }),
    [props.book, props.rev, maxLevel],
  )

  return (
    <Modal title="Regenerar el índice" onClose={props.onClose}>
      <p className="hint">
        El índice se rehace con los encabezados de los capítulos, en el orden de lectura.
        A los que no tengan <code>id</code> se les pondrá uno.
      </p>

      <div className="paste-options">
        <label>
          Hasta
          <select value={maxLevel} onChange={e => setMaxLevel(Number(e.target.value))}>
            <option value={1}>solo h1</option>
            <option value={2}>h1 y h2</option>
            <option value={3}>h1, h2 y h3</option>
          </select>
        </label>
        <label title="Lectores antiguos (algunos Kindle) usan toc.ncx en vez del índice de EPUB 3">
          <input type="checkbox" checked={ncx} onChange={e => setNcx(e.target.checked)} />
          Generar también toc.ncx
        </label>
      </div>

      <div className="toc-preview">
        {headings.length === 0
          ? <p className="hint">No se encontró ningún encabezado en los capítulos.</p>
          : (
            <ul>
              {headings.map((h, i) => (
                <li key={i} style={{ paddingLeft: `${(h.level - 1) * 18}px` }}>
                  <span className="lvl">h{h.level}</span> {h.title}
                </li>
              ))}
            </ul>
          )}
      </div>

      <footer>
        <span className="hint">{headings.length} entrada{headings.length === 1 ? '' : 's'}</span>
        <button className="ghost" onClick={props.onClose}>Cancelar</button>
        <button className="primary" disabled={!headings.length} onClick={() => props.onApply({ maxLevel, ncx })}>
          Regenerar
        </button>
      </footer>
    </Modal>
  )
}
