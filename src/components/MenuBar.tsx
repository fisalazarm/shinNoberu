import { useEffect, useRef, useState, type ReactNode } from 'react'

export interface MenuItem {
  label?: string
  /** Se muestra a la derecha, ya en claro (p. ej. "Ctrl+S"). */
  shortcut?: string
  onClick?: () => void
  disabled?: boolean
  /** Dibuja la marca de verificación. */
  checked?: boolean
  separator?: boolean
}

export interface MenuDef {
  label: string
  items: MenuItem[]
}

const usable = (it: MenuItem) => !it.separator && !it.disabled

export default function MenuBar({ menus, brand }: { menus: MenuDef[]; brand?: ReactNode }) {
  const [open, setOpen] = useState<number | null>(null)
  const [focus, setFocus] = useState(-1)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open == null) return
    const away = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(null)
    }
    // En documento y no en el botón: tras abrir con el ratón el foco puede
    // estar en cualquier sitio.
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      setOpen(null)
      setFocus(-1)
    }
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc, true)
    return () => {
      document.removeEventListener('mousedown', away)
      document.removeEventListener('keydown', esc, true)
    }
  }, [open])

  const close = () => { setOpen(null); setFocus(-1) }

  const pick = (item: MenuItem) => {
    close()
    item.onClick?.()
  }

  /** Siguiente elemento utilizable en esa dirección. */
  const step = (items: MenuItem[], from: number, delta: number) => {
    for (let i = 1; i <= items.length; i++) {
      const at = (from + delta * i + items.length * i) % items.length
      if (usable(items[at])) return at
    }
    return from
  }

  const onKeyDown = (e: React.KeyboardEvent, index: number) => {
    const items = menus[index].items
    switch (e.key) {
      case 'Escape':
        e.preventDefault()
        close()
        break
      case 'ArrowDown':
        e.preventDefault()
        setFocus(f => step(items, f < 0 ? -1 : f, 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setFocus(f => step(items, f < 0 ? 0 : f, -1))
        break
      case 'ArrowRight':
      case 'ArrowLeft': {
        e.preventDefault()
        const d = e.key === 'ArrowRight' ? 1 : -1
        setOpen((index + d + menus.length) % menus.length)
        setFocus(-1)
        break
      }
      case 'Enter':
      case ' ':
        if (focus >= 0 && usable(items[focus])) {
          e.preventDefault()
          pick(items[focus])
        }
        break
    }
  }

  return (
    <div className="menubar" ref={root} role="menubar">
      {brand}
      {menus.map((menu, i) => (
        <div key={menu.label} className="menu-slot">
          <button
            className={`menu-title ${open === i ? 'open' : ''}`}
            role="menuitem"
            aria-haspopup="true"
            aria-expanded={open === i}
            onClick={() => { setOpen(open === i ? null : i); setFocus(-1) }}
            // Con un menú abierto, pasar por encima cambia al de al lado.
            onMouseEnter={() => { if (open != null && open !== i) { setOpen(i); setFocus(-1) } }}
            onKeyDown={e => (open === i ? onKeyDown(e, i) : undefined)}
          >
            {menu.label}
          </button>

          {open === i && (
            <ul className="menu" role="menu" aria-label={menu.label}>
              {menu.items.map((item, j) =>
                item.separator ? (
                  <li key={j} className="menu-sep" role="separator" />
                ) : (
                  <li key={j}>
                    <button
                      role="menuitem"
                      className={focus === j ? 'focus' : ''}
                      disabled={item.disabled}
                      onMouseEnter={() => setFocus(j)}
                      onClick={() => pick(item)}
                    >
                      <span className="tick">{item.checked ? '✓' : ''}</span>
                      <span className="label">{item.label}</span>
                      {item.shortcut && <kbd>{item.shortcut}</kbd>}
                    </button>
                  </li>
                ),
              )}
            </ul>
          )}
        </div>
      ))}
    </div>
  )
}
