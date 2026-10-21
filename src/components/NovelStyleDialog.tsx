import { useMemo, useState } from 'react'
import Modal from './Modal'
import type { EpubBook } from '../lib/epub'
import {
  defaultNovelStyle, ORNAMENTS, previewDoc, readStyle, styleSheetFor, type NovelStyle,
} from '../lib/novelStyle'

interface Props {
  book: EpubBook
  onApply: (style: NovelStyle) => void
  onClose: () => void
}

const FONTS: { label: string; value: string }[] = [
  { label: 'No cambiarla', value: '' },
  { label: 'Georgia', value: 'Georgia, "Iowan Old Style", "Times New Roman", serif' },
  { label: 'Palatino', value: 'Palatino, "Palatino Linotype", "Book Antiqua", serif' },
  { label: 'Times', value: '"Times New Roman", Times, serif' },
  { label: 'Garamond', value: '"EB Garamond", Garamond, Georgia, serif' },
  { label: 'Sin serifa', value: '"Helvetica Neue", Helvetica, Arial, sans-serif' },
]

export default function NovelStyleDialog(props: Props) {
  // Si el libro ya trae ajustes puestos, se sigue desde ahí.
  const [style, setStyle] = useState<NovelStyle>(() => readStyle(props.book) ?? defaultNovelStyle)
  const set = (patch: Partial<NovelStyle>) => setStyle(s => ({ ...s, ...patch }))

  const sheet = useMemo(() => styleSheetFor(props.book), [props.book])
  const html = useMemo(() => previewDoc(style), [style])

  return (
    <Modal title="Estilos de novela" onClose={props.onClose} wide className="novel-style">
      <div className="novel-grid">
        <div className="novel-controls">
          <label className="field">
            Tipografía del cuerpo
            <select value={style.bodyFont} onChange={e => set({ bodyFont: e.target.value })}>
              {FONTS.map(f => <option key={f.label} value={f.value}>{f.label}</option>)}
            </select>
          </label>

          <label className="field">
            <span className="lbl">Altura de línea <b>{style.lineHeight.toFixed(2)}</b></span>
            <input
              type="range" min="1.1" max="2.1" step="0.05"
              value={style.lineHeight}
              onChange={e => set({ lineHeight: Number(e.target.value) })}
            />
          </label>

          <label className="field">
            <span className="lbl">
              Sangría de primera línea <b>{style.indent === 0 ? 'ninguna' : `${style.indent.toFixed(1)} em`}</b>
            </span>
            <input
              type="range" min="0" max="3" step="0.1"
              value={style.indent}
              onChange={e => set({ indent: Number(e.target.value) })}
            />
          </label>

          <div className="paste-options col">
            <label><input type="checkbox" checked={style.justify} onChange={e => set({ justify: e.target.checked })} /> Texto justificado</label>
            <label title="Al justificar sin partir palabras se abren ríos de blanco en pantallas estrechas">
              <input type="checkbox" disabled={!style.justify} checked={style.hyphens} onChange={e => set({ hyphens: e.target.checked })} />
              Partir palabras con guion
            </label>
            <label title="Al imprimir, el párrafo que abre un capítulo o una escena no se sangra">
              <input type="checkbox" disabled={style.indent === 0} checked={style.firstNoIndent} onChange={e => set({ firstNoIndent: e.target.checked })} />
              No sangrar el primer párrafo
            </label>
          </div>

          <label className="field">
            Capitular
            <select value={style.dropCap} onChange={e => set({ dropCap: Number(e.target.value) })}>
              <option value={0}>Sin capitular</option>
              <option value={2}>De 2 líneas</option>
              <option value={3}>De 3 líneas</option>
              <option value={4}>De 4 líneas</option>
            </select>
          </label>

          <div className="field">
            <span className="lbl">
              Salto de escena
              <span className="hint">se reconocen los párrafos que solo llevan adornos</span>
            </span>
            <div className="ornaments">
              {ORNAMENTS.map(o => (
                <button
                  key={o}
                  className={`ghost ${style.scene === o ? 'on' : ''}`}
                  onClick={() => set({ scene: o })}
                >
                  {o}
                </button>
              ))}
              <button className={`ghost ${style.scene === '' ? 'on' : ''}`} onClick={() => set({ scene: '' })}>
                no tocarlos
              </button>
              <input
                className="other"
                value={style.scene}
                placeholder="otro"
                onChange={e => set({ scene: e.target.value })}
              />
            </div>
          </div>

          <label className="field">
            Títulos
            <select value={style.headingAlign} onChange={e => set({ headingAlign: e.target.value as NovelStyle['headingAlign'] })}>
              <option value="center">Centrados</option>
              <option value="left">A la izquierda</option>
            </select>
          </label>
          <div className="paste-options col">
            <label><input type="checkbox" checked={style.headingSpaced} onChange={e => set({ headingSpaced: e.target.checked })} /> Títulos en mayúsculas y espaciados</label>
          </div>
        </div>

        <div className="novel-preview">
          <iframe title="Vista previa de los estilos" srcDoc={html} />
        </div>
      </div>

      <footer>
        <span className="hint">
          {sheet
            ? <>Se escribe en <code>{sheet.split('/').pop()}</code>, entre marcas: lo que hayas escrito tú no se toca.</>
            : 'Este libro no tiene hoja de estilos: añade una para poder aplicar esto.'}
        </span>
        <button className="ghost" onClick={props.onClose}>Cancelar</button>
        <button className="primary" disabled={!sheet} onClick={() => props.onApply(style)}>
          Aplicar al libro
        </button>
      </footer>
    </Modal>
  )
}
