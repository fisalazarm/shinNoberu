import { useState } from 'react'
import Modal from './Modal'
import type { Metadata } from '../lib/metadata'

interface Props {
  initial: Metadata
  /** Imágenes del libro, para elegir la portada. */
  images: string[]
  coverPath?: string
  coverUrl?: string
  onCover: (path: string) => void
  onClearCover: () => void
  onAddImage: () => void
  onSave: (m: Metadata) => void
  onClose: () => void
}

export default function MetadataDialog(props: Props) {
  const [m, setM] = useState<Metadata>(props.initial)
  const set = (patch: Partial<Metadata>) => setM(prev => ({ ...prev, ...patch }))
  const name = (p?: string) => p?.split('/').pop()

  return (
    <Modal title="Metadatos del libro" onClose={props.onClose} className="form">
      <div className="meta-grid">
        <label className="field span2">
          Título
          <input autoFocus value={m.title} onChange={e => set({ title: e.target.value })} placeholder="Libro sin título" />
        </label>

        <label className="field">
          Autor
          <input value={m.creator} onChange={e => set({ creator: e.target.value })} placeholder="Nombre Apellido" />
        </label>
        <label className="field" title="Como debe ordenarlo la biblioteca">
          Ordenar autor por
          <input value={m.fileAs} onChange={e => set({ fileAs: e.target.value })} placeholder="Apellido, Nombre" />
        </label>

        <label className="field">
          Saga
          <input value={m.series} onChange={e => set({ series: e.target.value })} placeholder="(ninguna)" />
        </label>
        <label className="field">
          Número en la saga
          <input value={m.seriesIndex} onChange={e => set({ seriesIndex: e.target.value })} placeholder="1" />
        </label>

        <label className="field">
          Idioma
          <input value={m.language} onChange={e => set({ language: e.target.value })} placeholder="es" />
        </label>
        <label className="field">
          Editorial
          <input value={m.publisher} onChange={e => set({ publisher: e.target.value })} />
        </label>

        <label className="field">
          Fecha
          <input value={m.date} onChange={e => set({ date: e.target.value })} placeholder="2026-01-31" />
        </label>
        <label className="field">
          ISBN
          <input value={m.isbn} onChange={e => set({ isbn: e.target.value })} placeholder="(opcional)" />
        </label>

        <label className="field span2">
          <span className="lbl">Etiquetas <span className="hint">separadas por comas</span></span>
          <input value={m.subjects} onChange={e => set({ subjects: e.target.value })} placeholder="Fantasía, Aventuras" />
        </label>

        <label className="field span2">
          Sinopsis
          <textarea className="meta-desc" value={m.description} onChange={e => set({ description: e.target.value })} />
        </label>

        <label className="field span2" title="Se genera solo si está vacío">
          Identificador único
          <input value={m.identifier} onChange={e => set({ identifier: e.target.value })} placeholder="urn:uuid:…" />
        </label>
      </div>

      <section className="cover-box">
        <div className="cover-thumb">
          {props.coverUrl
            ? <img src={props.coverUrl} alt="Portada actual" />
            : <span className="hint">Sin portada</span>}
        </div>
        <div className="cover-controls">
          <strong>Portada</strong>
          <p className="hint">
            Se aplica al momento: marca la imagen como <code>cover-image</code>, crea el XHTML de
            portada y lo pone primero en el orden de lectura.
          </p>
          <div className="cover-row">
            <select
              value={props.coverPath ?? ''}
              onChange={e => e.target.value && props.onCover(e.target.value)}
            >
              <option value="">— elegir imagen del libro —</option>
              {props.images.map(p => (
                <option key={p} value={p}>{name(p)}</option>
              ))}
            </select>
            <button onClick={props.onAddImage}>Añadir imagen…</button>
            <button className="ghost" disabled={!props.coverPath} onClick={props.onClearCover}>
              Quitar
            </button>
          </div>
          {!props.images.length && (
            <p className="hint">El libro todavía no tiene imágenes.</p>
          )}
        </div>
      </section>

      <footer>
        <button className="ghost" onClick={props.onClose}>Cancelar</button>
        <button className="primary" onClick={() => props.onSave(m)}>Guardar metadatos</button>
      </footer>
    </Modal>
  )
}
