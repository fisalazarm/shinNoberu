import { useMemo, useState } from 'react'
import Modal from './Modal'
import Icon from './Icon'
import type { EpubBook } from '../lib/epub'
import {
  captureTemplate, defaultApplyOptions, defaultTemplateName, deleteTemplate, describe,
  exportTemplates, loadTemplates, previewTemplate, saveTemplate, setDefaultTemplate,
  type ApplyOptions, type LayoutTemplate,
} from '../lib/layoutTemplate'

interface Props {
  book: EpubBook
  onApply: (t: LayoutTemplate, opts: ApplyOptions) => void
  /** Guardar el archivo de plantillas exportado. */
  onExport: (text: string, name: string) => void
  /** Elegir un archivo y devolver su contenido. */
  onImport: () => void
  onClose: () => void
}

const fecha = (ms: number) =>
  new Date(ms).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })

export default function TemplateDialog(props: Props) {
  const [list, setList] = useState(loadTemplates)
  const [name, setName] = useState('')
  const [opts, setOpts] = useState<ApplyOptions>(defaultApplyOptions)
  const [chosen, setChosen] = useState<string>(() => loadTemplates()[0]?.name ?? '')
  const [porDefecto, setPorDefecto] = useState(defaultTemplateName)

  const set = (patch: Partial<ApplyOptions>) => setOpts(o => ({ ...o, ...patch }))
  const current = list.find(t => t.name === chosen) ?? null

  const guardar = () => {
    const t = captureTemplate(props.book, name)
    if (!t) return
    setList(saveTemplate(t))
    setChosen(t.name)
    setName('')
  }

  const borrar = (t: LayoutTemplate) => {
    const next = deleteTemplate(t.name)
    setList(next)
    if (chosen === t.name) setChosen(next[0]?.name ?? '')
    if (porDefecto === t.name) { setDefaultTemplate(''); setPorDefecto('') }
  }

  const marcar = (t: LayoutTemplate) => {
    const next = porDefecto === t.name ? '' : t.name
    setDefaultTemplate(next)
    setPorDefecto(next)
  }

  const html = useMemo(() => (current ? previewTemplate(current) : ''), [current])
  const nada = !opts.novel && opts.css === 'no' && !opts.pieces && !opts.imprint

  return (
    <Modal title="Plantillas de maquetación" onClose={props.onClose} wide className="novel-style">
      <div className="saved-searches">
        <label className="field grow">
          Guardar este libro como plantilla
          <input
            value={name}
            placeholder="Mi novela clásica"
            onChange={e => setName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') guardar()
              if (e.key === 'Escape') { e.stopPropagation(); setName('') }
            }}
          />
        </label>
        <button className="primary" disabled={!name.trim()} onClick={guardar}>Guardar</button>
        <button
          className="ghost"
          disabled={!list.length}
          title="Guardar todas en un archivo para llevártelas a otro ordenador"
          onClick={() => props.onExport(exportTemplates(list), 'plantillas.json')}
        >
          Exportar
        </button>
        <button className="ghost" title="Traer plantillas de un archivo" onClick={props.onImport}>
          Importar
        </button>
      </div>

      <div className="novel-grid">
        <div className="novel-controls">
          <div className="template-list">
            {list.length === 0
              ? <p className="hint">Todavía no has guardado ninguna. Maqueta un libro a tu gusto y guárdalo aquí.</p>
              : (
                <ul>
                  {list.map(t => (
                    <li key={t.name} className={t.name === chosen ? 'on' : ''}>
                      <button className="pick" onClick={() => setChosen(t.name)}>
                        <span className="who">{t.name}</span>
                        <span className="what">{describe(t)}</span>
                        <span className="when">{fecha(t.savedAt)}</span>
                      </button>
                      <button
                        className={`icon-btn ${porDefecto === t.name ? 'on' : ''}`}
                        title={porDefecto === t.name
                          ? 'Los libros nuevos nacen con esta plantilla'
                          : 'Usar esta en los libros nuevos'}
                        onClick={() => marcar(t)}
                      >
                        <Icon name={porDefecto === t.name ? 'starFilled' : 'star'} label="Por defecto" />
                      </button>
                      <button className="icon-btn danger" title="Borrar la plantilla" onClick={() => borrar(t)}>
                        <Icon name="trash" label="Borrar" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
          </div>

          <div className="paste-options col">
            <label><input type="checkbox" checked={opts.novel} onChange={e => set({ novel: e.target.checked })} /> Estilos de novela</label>
            <label><input type="checkbox" checked={opts.pieces} onChange={e => set({ pieces: e.target.checked })} /> Preliminares y cortesía</label>
            <label title="Solo rellena lo que el libro tenga vacío; nunca pisa lo que ya dice">
              <input type="checkbox" checked={opts.imprint} onChange={e => set({ imprint: e.target.checked })} />
              Editorial e idioma
            </label>
            <label className="field">
              Hoja de estilos
              <select value={opts.css} onChange={e => set({ css: e.target.value as ApplyOptions['css'] })}>
                <option value="merge">Fusionar: la del libro manda</option>
                <option value="replace">Reemplazar la del libro</option>
                <option value="no">No tocarla</option>
              </select>
            </label>
          </div>

          <p className="hint">
            {porDefecto
              ? <>Los libros nuevos nacen con <b>{porDefecto}</b>.</>
              : 'Marca una con la estrella y los libros nuevos nacerán con ella.'}
          </p>
        </div>

        <div className="novel-preview">
          {current
            ? <iframe title={`Vista previa: ${current.name}`} srcDoc={html} />
            : <p className="hint empty">Elige una plantilla para ver cómo queda.</p>}
        </div>
      </div>

      <footer>
        <span className="hint">
          Se guarda la tipografía, la hoja de estilos y qué páginas de cortesía tiene.
          El título y el autor no: esos son de cada libro.
        </span>
        <button className="ghost" onClick={props.onClose}>Cerrar</button>
        <button
          className="primary"
          disabled={!current || nada}
          onClick={() => current && props.onApply(current, opts)}
        >
          Aplicar al libro
        </button>
      </footer>
    </Modal>
  )
}
