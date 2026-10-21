import Icon from './Icon'
import type { EpubBook } from '../lib/epub'
import { iconForFile } from '../lib/fileIcon'

interface Props {
  book: EpubBook
  open: string[]
  active: string
  onPick: (path: string) => void
  onClose: (path: string) => void
}

export default function Tabs({ book, open, active, onPick, onClose }: Props) {
  if (!open.length) return null

  return (
    <div className="tabs" role="tablist" aria-label="Archivos abiertos">
      {open.map(path => {
        const file = book.files.get(path)
        const name = path.split('/').pop()
        return (
          <div key={path} className={`tab ${path === active ? 'active' : ''}`} title={path}>
            <button
              role="tab"
              aria-selected={path === active}
              onClick={() => onPick(path)}
              // Botón central: cerrar, como en cualquier editor con pestañas.
              onAuxClick={e => { if (e.button === 1) { e.preventDefault(); onClose(path) } }}
            >
              <Icon name={iconForFile(file?.mediaType ?? '', path)} size={13} />
              <span className="name">{name}</span>
            </button>
            <button className="close" title="Cerrar" onClick={() => onClose(path)}>×</button>
          </div>
        )
      })}
    </div>
  )
}
