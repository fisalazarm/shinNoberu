import type { TocEntry } from '../lib/structure'

interface Props {
  entries: TocEntry[]
  active: string
  onGo: (path: string, hash: string) => void
}

function Level({ entries, active, onGo, depth }: Props & { depth: number }) {
  return (
    <ul>
      {entries.map((e, i) => (
        <li key={`${e.path}#${e.hash}:${i}`}>
          <button
            className={e.path === active ? 'active' : ''}
            style={{ paddingLeft: `${10 + depth * 14}px` }}
            title={e.hash ? `${e.path}#${e.hash}` : e.path}
            onClick={() => onGo(e.path, e.hash)}
          >
            {e.title}
          </button>
          {e.children.length > 0 && (
            <Level entries={e.children} active={active} onGo={onGo} depth={depth + 1} />
          )}
        </li>
      ))}
    </ul>
  )
}

export default function TocPanel({ entries, active, onGo }: Props) {
  if (!entries.length) {
    return (
      <div className="toc-panel">
        <p className="empty">
          El libro no tiene índice todavía. Créalo con «Índice…» en la barra de arriba.
        </p>
      </div>
    )
  }

  return (
    <nav className="toc-panel" aria-label="Índice del libro">
      <Level entries={entries} active={active} onGo={onGo} depth={0} />
    </nav>
  )
}
