import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { MenuItem } from './MenuBar'

export interface ContextTarget {
  x: number
  y: number
  items: MenuItem[]
}

interface Props {
  target: ContextTarget
  onClose: () => void
}

export default function ContextMenu({ target, onClose }: Props) {
  const box = useRef<HTMLUListElement>(null)
  const [at, setAt] = useState({ left: target.x, top: target.y })

  // Si no cabe hacia abajo o a la derecha, se abre hacia el otro lado.
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setAt({
      left: target.x + r.width > window.innerWidth ? Math.max(4, target.x - r.width) : target.x,
      top: target.y + r.height > window.innerHeight ? Math.max(4, target.y - r.height) : target.y,
    })
  }, [target])

  useEffect(() => {
    const away = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) onClose()
    }
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose() }
    }
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', key, true)
    window.addEventListener('resize', onClose)
    // Al desplazar la lista el menú se quedaría flotando donde estaba.
    window.addEventListener('scroll', onClose, true)
    return () => {
      document.removeEventListener('mousedown', away)
      document.removeEventListener('keydown', key, true)
      window.removeEventListener('resize', onClose)
      window.removeEventListener('scroll', onClose, true)
    }
  }, [onClose])

  return (
    <ul className="menu context-menu" role="menu" ref={box} style={{ left: at.left, top: at.top }}>
      {target.items.map((item, i) =>
        item.separator ? (
          <li key={i} className="menu-sep" role="separator" />
        ) : (
          <li key={i}>
            <button
              role="menuitem"
              disabled={item.disabled}
              onClick={() => { onClose(); item.onClick?.() }}
            >
              <span className="tick">{item.checked ? '✓' : ''}</span>
              <span className="label">{item.label}</span>
              {item.shortcut && <kbd>{item.shortcut}</kbd>}
            </button>
          </li>
        ),
      )}
    </ul>
  )
}
