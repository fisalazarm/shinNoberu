import { useEffect, useMemo, useState } from 'react'
import Modal from './Modal'
import type { EpubBook } from '../lib/epub'
import { bookWords, contextOf, isAccepted, type Hit } from '../lib/spell'
import { misspelled, suggestions } from '../lib/spellClient'

interface Props {
  book: EpubBook
  rev: number
  accepted: ReadonlySet<string>
  onJump: (path: string, from: number, to: number) => void
  onReplace: (word: string, replacement: string) => void
  onAccept: (word: string, where: 'personal' | 'book') => void
  onClose: () => void
}

interface Doubt {
  word: string
  hits: Hit[]
}

const isCapital = (w: string) => w[0] !== w[0].toLowerCase()
const name = (p: string) => p.split('/').pop()

export default function SpellDialog(props: Props) {
  const [doubts, setDoubts] = useState<Doubt[] | null>(null)
  const [total, setTotal] = useState(0)
  const [filter, setFilter] = useState('')
  const [hideCaps, setHideCaps] = useState(false)
  const [ignored, setIgnored] = useState<Set<string>>(new Set())
  const [sel, setSel] = useState<string | null>(null)
  const [sugg, setSugg] = useState<{ word: string; list: string[] } | null>(null)
  const [custom, setCustom] = useState('')

  // Todas las palabras del libro, y de ellas las que el diccionario no conoce.
  useEffect(() => {
    let alive = true
    const words = bookWords(props.book)
    setTotal(words.size)
    misspelled(words.keys()).then(bad => {
      if (!alive) return
      const list = [...bad].map(word => ({ word, hits: words.get(word)! }))
      list.sort((a, b) => b.hits.length - a.hits.length || a.word.localeCompare(b.word))
      setDoubts(list)
    })
    return () => { alive = false }
  }, [props.book, props.rev])

  const shown = useMemo(() => {
    const f = filter.trim().toLowerCase()
    return (doubts ?? []).filter(d =>
      !isAccepted(d.word, props.accepted) &&
      !ignored.has(d.word) &&
      (!hideCaps || !isCapital(d.word)) &&
      (!f || d.word.toLowerCase().includes(f)))
  }, [doubts, props.accepted, ignored, hideCaps, filter])

  const current = shown.find(d => d.word === sel) ?? shown[0] ?? null

  useEffect(() => {
    setCustom('')
    if (!current) return
    let alive = true
    suggestions(current.word).then(list => { if (alive) setSugg({ word: current.word, list }) })
    return () => { alive = false }
  }, [current?.word])

  /** Tras resolver una, se pasa a la siguiente de la lista. */
  const next = () => {
    if (!current) return
    const i = shown.indexOf(current)
    setSel(shown[i + 1]?.word ?? shown[i - 1]?.word ?? null)
  }

  const replace = (to: string) => {
    if (!current || !to.trim()) return
    next()
    props.onReplace(current.word, to.trim())
  }

  const files = current ? new Set(current.hits.map(h => h.path)).size : 0
  const list = sugg?.word === current?.word ? sugg?.list ?? [] : null

  return (
    <Modal title="Ortografía del libro" onClose={props.onClose} wide className="spell-dialog">
      {doubts == null ? (
        <p className="hint">Revisando {total.toLocaleString('es')} palabras distintas…</p>
      ) : (
        <div className="spell-body">
          <div className="spell-list">
            <input
              placeholder="Filtrar…"
              value={filter}
              onChange={e => setFilter(e.target.value)}
              aria-label="Filtrar palabras"
            />
            <label className="check">
              <input type="checkbox" checked={hideCaps} onChange={e => setHideCaps(e.target.checked)} />
              Ocultar las que empiezan con mayúscula
            </label>
            <ul>
              {shown.map(d => (
                <li key={d.word}>
                  <button className={d === current ? 'active' : ''} onClick={() => setSel(d.word)}>
                    <span className="w">{d.word}</span>
                    <span className="n">{d.hits.length}</span>
                  </button>
                </li>
              ))}
            </ul>
            {!shown.length && <p className="hint">{doubts.length ? 'Nada con ese filtro.' : 'No hay ninguna palabra dudosa.'}</p>}
          </div>

          {current && (
            <div className="spell-detail">
              <h3>
                {current.word}
                <span className="hint">
                  {' '}· {current.hits.length} {current.hits.length === 1 ? 'vez' : 'veces'}
                  {files > 1 ? ` en ${files} archivos` : ''}
                </span>
              </h3>

              <div className="spell-fix">
                <span className="lbl">Cambiar en todo el libro por</span>
                <div className="spell-sugg">
                  {list == null && <span className="hint">Buscando…</span>}
                  {list?.length === 0 && <span className="hint">El diccionario no tiene sugerencias.</span>}
                  {list?.map(s => (
                    <button key={s} onClick={() => replace(s)}>{s}</button>
                  ))}
                </div>
                <div className="spell-custom">
                  <input
                    placeholder="Otra palabra…"
                    value={custom}
                    onChange={e => setCustom(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && replace(custom)}
                    aria-label="Cambiar por otra palabra"
                  />
                  <button disabled={!custom.trim()} onClick={() => replace(custom)}>Cambiar</button>
                </div>
              </div>

              <div className="spell-keep">
                <button onClick={() => { next(); props.onAccept(current.word, 'personal') }} title="Vale para todos tus libros">
                  Añadir a mi diccionario
                </button>
                <button onClick={() => { next(); props.onAccept(current.word, 'book') }} title="Solo en este libro">
                  Aceptar en este libro
                </button>
                <button className="ghost" onClick={() => { next(); setIgnored(s => new Set(s).add(current.word)) }} title="Hasta que cierres esta ventana">
                  Ignorar
                </button>
              </div>

              <span className="lbl">Dónde sale</span>
              <ul className="spell-hits">
                {current.hits.slice(0, 40).map((h, i) => {
                  const c = contextOf(props.book.files.get(h.path)?.text ?? '', h.from, h.to)
                  return (
                    <li key={i}>
                      <button onClick={() => props.onJump(h.path, h.from, h.to)}>
                        <span className="file">{name(h.path)}</span>
                        <span className="ctx">{c.before}<mark>{c.word}</mark>{c.after}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
              {current.hits.length > 40 && <p className="hint">Y {current.hits.length - 40} más.</p>}
            </div>
          )}
        </div>
      )}

      <footer>
        <span className="hint">
          {doubts == null ? '' : `${shown.length} dudosa${shown.length === 1 ? '' : 's'} de ${total.toLocaleString('es')} palabras distintas`}
        </span>
        <button className="ghost" onClick={props.onClose}>Cerrar</button>
      </footer>
    </Modal>
  )
}
