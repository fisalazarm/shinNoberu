import { useEffect, useMemo, useRef, useState } from 'react'
import Modal from './Modal'

export interface QuickItem {
  id: string
  label: string
  /** Etiqueta pequeña a la izquierda: la carpeta, el menú del que viene… */
  group?: string
  /** A la derecha: el atajo, si lo tiene. */
  hint?: string
  disabled?: boolean
  run: () => void
}

interface Props {
  title: string
  placeholder: string
  items: QuickItem[]
  onClose: () => void
}

/** Sin tildes ni mayúsculas: en español se escribe «indice» y se espera «índice». */
const DIACRITICS = new RegExp(`[${String.fromCodePoint(0x0300)}-${String.fromCodePoint(0x036f)}]`, 'g')
const plain = (s: string) => s.toLowerCase().normalize('NFD').replace(DIACRITICS, '')

/**
 * Coincidencia por subsecuencia: «cap3» encuentra «Cap03.xhtml». Devuelve una
 * puntuación para que lo que empieza por lo escrito salga antes.
 */
export function score(query: string, text: string): number {
  if (!query) return 1
  const q = plain(query)
  const t = plain(text)

  const direct = t.indexOf(q)
  if (direct === 0) return 1000
  if (direct > 0) return 500 - direct

  let at = 0
  let hits = 0
  for (const ch of q) {
    const found = t.indexOf(ch, at)
    if (found < 0) return 0
    // Las letras seguidas valen más que las desperdigadas.
    hits += found === at ? 2 : 1
    at = found + 1
  }
  return hits
}

export default function QuickOpen(props: Props) {
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const list = useRef<HTMLUListElement>(null)

  const items = useMemo(() => {
    const scored = props.items
      .map(it => ({ it, s: score(q, `${it.group ?? ''} ${it.label}`) }))
      .filter(x => x.s > 0)
      .sort((a, b) => b.s - a.s)
    return scored.map(x => x.it).slice(0, 60)
  }, [props.items, q])

  useEffect(() => { setSel(0) }, [q])
  useEffect(() => {
    list.current?.querySelector('.sel')?.scrollIntoView({ block: 'nearest' })
  }, [sel])

  const pick = (it: QuickItem) => {
    if (it.disabled) return
    props.onClose()
    it.run()
  }

  return (
    <Modal title={props.title} onClose={props.onClose}>
      <input
        autoFocus
        className="palette-input"
        placeholder={props.placeholder}
        value={q}
        onChange={e => setQ(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(s + 1, items.length - 1)) }
          if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(s - 1, 0)) }
          if (e.key === 'Enter' && items[sel]) { e.preventDefault(); pick(items[sel]) }
        }}
      />
      <ul className="palette-list" ref={list}>
        {items.map((it, i) => (
          <li key={it.id}>
            <button
              className={`${i === sel ? 'sel' : ''} ${it.disabled ? 'off' : ''}`}
              disabled={it.disabled}
              onMouseEnter={() => setSel(i)}
              onClick={() => pick(it)}
            >
              {it.group && <span className="group">{it.group}</span>}
              <span className="label">{it.label}</span>
              {it.hint && <kbd>{it.hint}</kbd>}
            </button>
          </li>
        ))}
      </ul>
      {!items.length && <p className="empty">Nada que coincida.</p>}
    </Modal>
  )
}
