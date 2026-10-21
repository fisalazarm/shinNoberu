import { useMemo, useState } from 'react'
import Modal from './Modal'
import type { EpubBook } from '../lib/epub'
import { findNames, inconsistent, type NameGroup, type Variant } from '../lib/names'

interface Props {
  book: EpubBook
  /** Cambia con cada modificación del libro: fuerza a rehacer el recuento. */
  rev: number
  onUnify: (from: string, to: string) => void
  onGo: (path: string, from: number, to: number) => void
  onClose: () => void
}

type Filter = 'dudosos' | 'todos'

export default function NamesDialog(props: Props) {
  const [filter, setFilter] = useState<Filter>('dudosos')
  const [open, setOpen] = useState<string | null>(null)
  /** Cuál es la forma buena de cada grupo, si se cambia la propuesta. */
  const [chosen, setChosen] = useState<Record<string, string>>({})

  const all = useMemo(() => findNames(props.book), [props.book, props.rev])
  const dudosos = inconsistent(all)
  const shown = filter === 'dudosos' ? dudosos : all

  const mainOf = (g: NameGroup) => chosen[g.main] ?? g.main
  const name = (p: string) => p.split('/').pop()

  const unify = (g: NameGroup, v: Variant) => {
    const to = mainOf(g)
    if (v.word !== to) props.onUnify(v.word, to)
  }

  return (
    <Modal title="Nombres del libro" onClose={props.onClose} wide>
      <div className="paste-options">
        <label>
          Mostrar
          <select value={filter} onChange={e => setFilter(e.target.value as Filter)}>
            <option value="dudosos">Solo los que se escriben de varias formas ({dudosos.length})</option>
            <option value="todos">Todos los nombres propios ({all.length})</option>
          </select>
        </label>
        <span className="hint">
          Es nombre propio lo que va en mayúscula en mitad de una frase y nunca aparece en minúscula.
        </span>
      </div>

      <div className="names-list">
        {shown.length === 0 && (
          <p className="hint">
            {filter === 'dudosos'
              ? 'Todos los nombres se escriben siempre igual.'
              : 'No encontré nombres propios. En un libro muy corto es normal.'}
          </p>
        )}

        {shown.map(g => {
          const main = mainOf(g)
          const desplegado = open === g.main
          // Los capítulos de todas las formas juntas: el nombre sale ahí aunque
          // esté escrito de otra manera.
          const donde = new Set(g.variants.flatMap(v => v.chapters))
          return (
            <section key={g.main} className={g.variants.length > 1 ? 'mixed' : ''}>
              <button className="head" onClick={() => setOpen(desplegado ? null : g.main)}>
                <span className="who">{main}</span>
                <span className="count">{g.total}</span>
                {g.variants.length > 1 && (
                  <span className="forms">
                    {g.variants.length} formas: {g.variants.map(v => v.word).join(' · ')}
                  </span>
                )}
                <span className="where">
                  {donde.size} capítulo{donde.size === 1 ? '' : 's'}
                </span>
              </button>

              {desplegado && (
                <ul>
                  {g.variants.map(v => (
                    <li key={v.word}>
                      <button
                        className="go"
                        onClick={() => props.onGo(v.first.path, v.first.offset, v.first.offset + v.word.length)}
                        title={`Ir a la primera: ${v.first.path}:${v.first.line}`}
                      >
                        <span className="form">{v.word}</span>
                        <span className="count">{v.count}</span>
                        <span className="where">{v.chapters.map(name).join(', ')}</span>
                      </button>
                      {v.word === main
                        ? <span className="tag good">la buena</span>
                        : (
                          <>
                            <button className="ghost small" onClick={() => setChosen(c => ({ ...c, [g.main]: v.word }))}>
                              Esta es la buena
                            </button>
                            <button className="ghost small accent" onClick={() => unify(g, v)}>
                              Cambiar por «{main}»
                            </button>
                          </>
                        )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )
        })}
      </div>

      <footer>
        <span className="hint">
          Cambiar una forma la reemplaza en todo el libro, como palabra entera y respetando mayúsculas.
        </span>
        <button className="ghost" onClick={props.onClose}>Cerrar</button>
      </footer>
    </Modal>
  )
}
