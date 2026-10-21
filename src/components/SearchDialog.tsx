import { useMemo, useState } from 'react'
import Modal from './Modal'
import Icon from './Icon'
import type { EpubBook } from '../lib/epub'
import { replaceableCount, searchBook, type Match, type SearchOptions } from '../lib/searchBook'
import { deleteSearch, loadSearches, saveSearch } from '../lib/savedSearches'

interface Props {
  book: EpubBook
  /** Cambia con cada modificación del libro: fuerza a repetir la búsqueda. */
  rev: number
  options: SearchOptions
  onOptions: (o: SearchOptions) => void
  onGo: (m: Match) => void
  onReplaceOne: (m: Match, replacement: string) => void
  onReplaceAll: (replacement: string) => void
  onClose: () => void
}

export default function SearchDialog(props: Props) {
  const o = props.options
  const [replacement, setReplacement] = useState('')
  const [saved, setSaved] = useState(loadSearches)
  const [chosen, setChosen] = useState('')
  // Mientras tiene un valor, se está poniendo nombre a la búsqueda actual.
  const [naming, setNaming] = useState<string | null>(null)
  const set = (patch: Partial<SearchOptions>) => props.onOptions({ ...o, ...patch })

  // `rev` entra a propósito: el libro se modifica en el lugar, así que es lo
  // único que delata un reemplazo.
  const result = useMemo(() => searchBook(props.book, o), [props.book, props.rev, o])
  const replaceable = replaceableCount(result)

  const mine = saved.filter(s => !s.builtin)
  const factory = saved.filter(s => s.builtin)
  const chosenIsMine = mine.some(s => s.name === chosen)

  const apply = (name: string) => {
    setChosen(name)
    const s = saved.find(x => x.name === name)
    if (!s) return
    props.onOptions({ ...s.options })
    setReplacement(s.replacement)
  }

  const confirmName = () => {
    const name = (naming ?? '').trim()
    if (!name) return
    setSaved(saveSearch(name, o, replacement))
    setChosen(name)
    setNaming(null)
  }

  const removeChosen = () => {
    setSaved(deleteSearch(chosen))
    setChosen('')
  }

  const name = (p: string) => p.split('/').pop()

  return (
    <Modal title="Buscar en todo el libro" onClose={props.onClose} wide>
      <div className="search-row">
        <label className="field grow">
          Buscar
          <input
            autoFocus
            value={o.query}
            onChange={e => set({ query: e.target.value })}
            placeholder={o.regex ? 'expresión regular…' : 'texto a buscar…'}
          />
        </label>
        <label className="field grow">
          Reemplazar por
          <input
            value={replacement}
            onChange={e => setReplacement(e.target.value)}
            placeholder={o.regex ? '$1 para los grupos' : '(vacío = borrar)'}
          />
        </label>
      </div>

      <div className="saved-searches">
        <label className="field">
          Guardadas
          <select value={chosen} onChange={e => apply(e.target.value)}>
            <option value="">Elegir una…</option>
            {mine.length > 0 && (
              <optgroup label="Mías">
                {mine.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
              </optgroup>
            )}
            <optgroup label="De fábrica">
              {factory.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
            </optgroup>
          </select>
        </label>

        {naming === null ? (
          <>
            <button
              className="ghost"
              disabled={!o.query}
              title="Guardar esta búsqueda con su reemplazo para volver a usarla"
              onClick={() => setNaming(o.query)}
            >
              Guardar esta…
            </button>
            {chosenIsMine && (
              <button className="ghost danger" title="Borrar la búsqueda guardada" onClick={removeChosen}>
                <Icon name="trash" label="Borrar" /> Borrar
              </button>
            )}
          </>
        ) : (
          <>
            <input
              autoFocus
              className="name-it"
              value={naming}
              placeholder="nombre"
              onChange={e => setNaming(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') confirmName()
                // Escape cierra el modal entero si lo dejamos subir.
                if (e.key === 'Escape') { e.stopPropagation(); setNaming(null) }
              }}
            />
            <button className="primary" disabled={!naming.trim()} onClick={confirmName}>Guardar</button>
            <button className="ghost" onClick={() => setNaming(null)}>Cancelar</button>
          </>
        )}
      </div>

      <div className="paste-options">
        <label><input type="checkbox" checked={o.caseSensitive} onChange={e => set({ caseSensitive: e.target.checked })} /> Distinguir mayúsculas</label>
        <label><input type="checkbox" checked={o.wholeWord} onChange={e => set({ wholeWord: e.target.checked })} /> Palabra completa</label>
        <label><input type="checkbox" checked={o.regex} onChange={e => set({ regex: e.target.checked })} /> Expresión regular</label>
        <label title="Sin esto, reemplazar «quot» cambiaría también los href y los xmlns y rompería el libro">
          <input type="checkbox" checked={o.onlyText} onChange={e => set({ onlyText: e.target.checked })} />
          Solo el texto, no las etiquetas
        </label>
        <label title="Encuentra «de una vez» aunque un <em> parta la frase por la mitad. Lo que cruce una etiqueta se puede visitar, pero no reemplazar.">
          <input type="checkbox" checked={o.ignoreTags} onChange={e => set({ ignoreTags: e.target.checked })} />
          Ignorar las etiquetas al buscar
        </label>
        <label>
          Dónde
          <select value={o.scope} onChange={e => set({ scope: e.target.value as SearchOptions['scope'] })}>
            <option value="text">Solo capítulos</option>
            <option value="all">Todo (CSS, OPF, índice…)</option>
          </select>
        </label>
      </div>

      {result.error && o.query && <p className="error">{result.error}</p>}

      <div className="search-results">
        {!o.query && <p className="hint">Escribe algo para buscar en todos los capítulos a la vez.</p>}
        {o.query && !result.error && result.total === 0 && <p className="hint">Sin resultados.</p>}
        {result.files.map(f => (
          <section key={f.path}>
            <h3>{name(f.path)} <span className="count">{f.matches.length}</span></h3>
            <ul>
              {f.matches.map(m => (
                <li key={`${m.from}`} className={m.spansTags ? 'spans-tags' : ''}>
                  <button onClick={() => props.onGo(m)} title={`${f.path}:${m.line}`}>
                    <span className="ln">{m.line}</span>
                    <span className="snippet">
                      {m.before}<mark>{m.hit}</mark>{m.after}
                    </span>
                  </button>
                  <button
                    className="ghost replace-one"
                    disabled={m.spansTags}
                    title={m.spansTags
                      ? 'Atraviesa una etiqueta: cambiarlo desde aquí se llevaría el marcado de en medio'
                      : 'Reemplazar solo esta'}
                    onClick={() => props.onReplaceOne(m, replacement)}
                  >
                    ⇥
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <footer>
        <span className="hint">
          {result.total > 0 && `${result.total} coincidencia${result.total === 1 ? '' : 's'} en ${result.files.length} archivo${result.files.length === 1 ? '' : 's'}`}
          {result.truncated && ' (se muestran las primeras)'}
          {replaceable < result.total && (result.total - replaceable === 1
            ? ' · 1 atraviesa etiquetas y no se reemplaza'
            : ` · ${result.total - replaceable} atraviesan etiquetas y no se reemplazan`)}
        </span>
        <button className="ghost" onClick={props.onClose}>Cerrar</button>
        <button
          className="primary"
          disabled={!replaceable}
          onClick={() => props.onReplaceAll(replacement)}
        >
          Reemplazar todo ({replaceable})
        </button>
      </footer>
    </Modal>
  )
}
