import { useMemo, useState } from 'react'
import Modal from './Modal'
import {
  toChapters, type ChapterDraft, type DocxDoc,
} from '../lib/docx'

interface Props {
  doc: DocxDoc
  /** Nombre del .docx, para proponer el título del libro. */
  fileName: string
  /** Si no hay libro abierto con contenido, solo cabe crear uno nuevo. */
  canAppend: boolean
  onApply: (chapters: ChapterDraft[], mode: Mode, title: string) => void
  onClose: () => void
}

export type Mode = 'new' | 'append'

export default function DocxDialog(props: Props) {
  const [splitAt, setSplitAt] = useState(1)
  const [mode, setMode] = useState<Mode>(props.canAppend ? 'append' : 'new')
  const [shown, setShown] = useState(0)

  const chapters = useMemo(
    () => toChapters(props.doc, { splitAt, imagePrefix: '../Images/' }),
    [props.doc, splitAt],
  )

  const title = props.fileName.replace(/\.docx$/i, '')
  const words = chapters.reduce((n, c) => n + c.words, 0)
  const current = chapters[Math.min(shown, chapters.length - 1)]

  const html = useMemo(() => {
    if (!current) return ''
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
html { background: #fbf8f1; color: #1b1a17; font: 15px/1.5 Georgia, serif; }
body { padding: 14px 18px; }
h1, h2, h3 { font-weight: 400; letter-spacing: 0.03em; }
p { margin: 0; text-indent: 1.2em; text-align: justify; }
h1 + p, h2 + p, h3 + p { text-indent: 0; }
p.centrado { text-indent: 0; text-align: center; }
img { max-width: 100%; }
aside { margin-top: 1.4em; padding-top: 0.6em; border-top: 1px solid #0002; font-size: 0.85em; }
</style></head><body>${current.html.split('../Images/').join('')}</body></html>`
  }, [current])

  return (
    <Modal title="Importar desde Word" onClose={props.onClose} wide className="novel-style">
      <div className="paste-options">
        <label>
          Partir en capítulos
          <select value={splitAt} onChange={e => { setSplitAt(Number(e.target.value)); setShown(0) }}>
            <option value={1}>En los títulos de nivel 1</option>
            <option value={2}>En los de nivel 1 y 2</option>
            <option value={0}>No partir: un solo archivo</option>
          </select>
        </label>
        <label>
          Dónde
          <select value={mode} onChange={e => setMode(e.target.value as Mode)} disabled={!props.canAppend}>
            <option value="append">Añadir al libro abierto</option>
            <option value="new">Crear un libro nuevo</option>
          </select>
        </label>
        <span className="hint">
          {chapters.length} capítulo{chapters.length === 1 ? '' : 's'} · {words.toLocaleString('es')} palabras
          {props.doc.images.length > 0 && ` · ${props.doc.images.length} imagen${props.doc.images.length === 1 ? '' : 'es'}`}
          {props.doc.notes.size > 0 && ` · ${props.doc.notes.size} nota${props.doc.notes.size === 1 ? '' : 's'} al pie`}
        </span>
      </div>

      <div className="novel-grid">
        <div className="docx-chapters">
          <ul>
            {chapters.map((c, i) => (
              <li key={i} className={i === shown ? 'on' : ''}>
                <button onClick={() => setShown(i)}>
                  <span className="num">{i + 1}</span>
                  <span className="who">{c.title}</span>
                  <span className="mins">{c.words.toLocaleString('es')}</span>
                </button>
              </li>
            ))}
          </ul>
          {chapters.length === 0 && <p className="hint">El documento está vacío.</p>}
        </div>

        <div className="novel-preview">
          <iframe title="Vista previa del capítulo" srcDoc={html} />
        </div>
      </div>

      <footer>
        <span className="hint">
          Se conservan cursiva, negrita, listas, enlaces, imágenes y notas al pie.
          {props.doc.dropped > 0 && ` Se tiraron ${props.doc.dropped} párrafos vacíos.`}
        </span>
        <button className="ghost" onClick={props.onClose}>Cancelar</button>
        <button
          className="primary"
          disabled={!chapters.length}
          onClick={() => props.onApply(chapters, mode, title)}
        >
          {mode === 'new' ? 'Crear el libro' : 'Añadir al libro'}
        </button>
      </footer>
    </Modal>
  )
}
