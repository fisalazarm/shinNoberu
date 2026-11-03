import { useMemo, useState } from 'react'
import Modal from './Modal'
import { spinePaths, type EpubBook } from '../lib/epub'
import { planSeries, type Rename } from '../lib/files'
import { titleOf } from '../lib/report'
import { navItemPath } from '../lib/structure'

interface Props {
  book: EpubBook
  rev: number
  onApply: (plan: Rename[]) => void
  onClose: () => void
}

const name = (p: string) => p.split('/').pop()!

/**
 * Lo que se propone renombrar: los que ya llevan número en el nombre
 * («Section0003», «capitulo-7»), que suelen ser los capítulos. Portada,
 * créditos y demás se quedan como están salvo que se marquen.
 */
const looksLikeChapter = (path: string) => /\d/.test(name(path)) || /cap|chap|sec/i.test(name(path))

export default function SeriesDialog(props: Props) {
  const docs = useMemo(() => {
    const nav = navItemPath(props.book)
    return spinePaths(props.book).filter(p => p !== nav)
  }, [props.book, props.rev])

  const [pattern, setPattern] = useState('Cap{nn}.xhtml')
  const [start, setStart] = useState(1)
  const [picked, setPicked] = useState<Set<string>>(() => {
    const guess = docs.filter(looksLikeChapter)
    return new Set(guess.length ? guess : docs)
  })

  const chosen = docs.filter(p => picked.has(p))
  const { plan, error } = planSeries(props.book, chosen, pattern, start)
  const changes = plan.filter(r => r.from !== r.to).length
  const target = new Map(plan.map(r => [r.from, r.to]))

  const toggle = (p: string) =>
    setPicked(prev => {
      const next = new Set(prev)
      if (!next.delete(p)) next.add(p)
      return next
    })

  return (
    <Modal title="Renombrar en serie" onClose={props.onClose} wide>
      <p className="hint">
        Los archivos marcados se renombran en el orden de lectura. Los enlaces, el índice y el
        manifest se arreglan solos.
      </p>

      <div className="paste-options">
        <label>
          Nombre
          <input
            value={pattern}
            onChange={e => setPattern(e.target.value)}
            spellCheck={false}
            aria-label="Nombre de los archivos"
          />
        </label>
        <label>
          Empezar en
          <input
            type="number"
            min={0}
            value={start}
            onChange={e => setStart(Math.max(0, Number(e.target.value) || 0))}
            style={{ width: '5em' }}
          />
        </label>
        <span className="hint">
          <code>{'{nn}'}</code> son dos cifras (07), <code>{'{nnn}'}</code> tres, <code>{'{n}'}</code> el número solo
        </span>
      </div>

      <div className="series-list">
        <div className="series-tools">
          <button className="ghost" onClick={() => setPicked(new Set(docs))}>Todos</button>
          <button className="ghost" onClick={() => setPicked(new Set())}>Ninguno</button>
        </div>
        <ul>
          {docs.map(p => {
            const to = target.get(p)
            const same = to === p
            return (
              <li key={p} className={picked.has(p) ? '' : 'off'}>
                <label>
                  <input type="checkbox" checked={picked.has(p)} onChange={() => toggle(p)} />
                  <span className="from">{name(p)}</span>
                  <span className="arrow">{to ? '→' : ''}</span>
                  <span className="to">{to ? (same ? 'se queda igual' : name(to)) : ''}</span>
                  <span className="title">{titleOf(props.book.files.get(p)?.text ?? '', p)}</span>
                </label>
              </li>
            )
          })}
        </ul>
      </div>

      <footer>
        <span className={error ? 'hint error-text' : 'hint'}>
          {error ?? (changes ? `${changes} archivo${changes === 1 ? '' : 's'} cambia${changes === 1 ? '' : 'n'} de nombre` : 'Nada que cambiar')}
        </span>
        <button className="ghost" onClick={props.onClose}>Cancelar</button>
        <button className="primary" disabled={!!error || !changes} onClick={() => props.onApply(plan)}>
          Renombrar
        </button>
      </footer>
    </Modal>
  )
}
