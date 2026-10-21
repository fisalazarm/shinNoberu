import { useMemo, useState } from 'react'
import Modal from './Modal'
import type { EpubBook } from '../lib/epub'
import {
  CORTESIA_CSS, PIECES, renderPiece, suggestText,
  type FrontMatterText, type PieceId,
} from '../lib/frontMatter'

interface Props {
  book: EpubBook
  onApply: (ids: PieceId[], text: FrontMatterText) => void
  onClose: () => void
}

const DEFAULT: PieceId[] = ['portadilla', 'portada', 'creditos']

export default function FrontMatterDialog(props: Props) {
  const [text, setText] = useState<FrontMatterText>(() => suggestText(props.book))
  const [picked, setPicked] = useState<Set<PieceId>>(new Set(DEFAULT))
  const [preview, setPreview] = useState<PieceId>('portada')

  const set = (patch: Partial<FrontMatterText>) => setText(t => ({ ...t, ...patch }))

  const toggle = (id: PieceId) =>
    setPicked(prev => {
      const next = new Set(prev)
      if (!next.delete(id)) next.add(id)
      return next
    })

  // Las que ya están en el libro se avisan: no se vuelven a escribir.
  const existing = useMemo(() => {
    const has = new Set<PieceId>()
    for (const p of PIECES) {
      for (const path of props.book.files.keys()) {
        if (path.endsWith(`/${p.file}`)) has.add(p.id)
      }
    }
    return has
  }, [props.book])

  const piece = PIECES.find(p => p.id === preview)!
  const html = useMemo(() => {
    const body = renderPiece(piece, text).replace(/<link[^>]*>/, '')
    return body.replace('</head>', `<style>
html { background: #fbf8f1; color: #1b1a17; font-family: Georgia, serif; }
body { padding: 10px 18px; }
${CORTESIA_CSS}
</style></head>`)
  }, [piece, text])

  return (
    <Modal title="Preliminares y cortesía" onClose={props.onClose} wide className="novel-style">
      <div className="novel-grid">
        <div className="novel-controls">
          <div className="piece-list">
            {PIECES.map(p => (
              <label key={p.id} className={preview === p.id ? 'on' : ''}>
                <input type="checkbox" checked={picked.has(p.id)} onChange={() => toggle(p.id)} />
                <span className="what" onClick={() => setPreview(p.id)}>
                  <strong>{p.label}</strong>
                  <span className="hint">{p.about}</span>
                </span>
                {existing.has(p.id) && <span className="tag" title="Ya existe en el libro: no se toca">ya está</span>}
              </label>
            ))}
          </div>

          <div className="search-row">
            <label className="field grow">
              Título
              <input value={text.title} onChange={e => set({ title: e.target.value })} />
            </label>
            <label className="field grow">
              Autor
              <input value={text.author} onChange={e => set({ author: e.target.value })} />
            </label>
          </div>

          <div className="search-row">
            <label className="field grow">
              Editorial
              <input value={text.publisher} onChange={e => set({ publisher: e.target.value })} placeholder="(opcional)" />
            </label>
            <label className="field">
              Año
              <input className="year" value={text.year} onChange={e => set({ year: e.target.value })} />
            </label>
            <label className="field grow">
              ISBN
              <input value={text.isbn} onChange={e => set({ isbn: e.target.value })} placeholder="(opcional)" />
            </label>
          </div>

          <label className="field">
            Dedicatoria
            <input
              value={text.dedication}
              onChange={e => set({ dedication: e.target.value })}
              placeholder="A quien corresponda"
              onFocus={() => setPreview('dedicatoria')}
            />
          </label>

          <label className="field">
            Colofón
            <input
              value={text.colophon}
              onChange={e => set({ colophon: e.target.value })}
              onFocus={() => setPreview('colofon')}
            />
          </label>
        </div>

        <div className="novel-preview">
          <iframe title={`Vista previa: ${piece.label}`} srcDoc={html} />
        </div>
      </div>

      <footer>
        <span className="hint">
          Van al principio del libro en su orden, y el colofón al final. Se apuntan en los
          landmarks del índice, no en la lista de capítulos.
        </span>
        <button className="ghost" onClick={props.onClose}>Cancelar</button>
        <button
          className="primary"
          disabled={!picked.size}
          onClick={() => props.onApply([...picked], text)}
        >
          Añadir al libro
        </button>
      </footer>
    </Modal>
  )
}
