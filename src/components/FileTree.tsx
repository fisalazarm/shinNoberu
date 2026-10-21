import { useState } from 'react'
import Icon from './Icon'
import ContextMenu, { type ContextTarget } from './ContextMenu'
import { dirname, type EpubBook, type EpubFile } from '../lib/epub'
import { iconForFile } from '../lib/fileIcon'

interface Props {
  book: EpubBook
  spine: string[]
  active: string
  coverPath?: string
  onOpen: (path: string) => void
  onDelete: (path: string) => void
  onRename: (path: string) => void
  onMoveSpine: (path: string, delta: number) => void
  onSetCover: (path: string) => void
  onDuplicate: (path: string) => void
  onSplit: (path: string) => void
  onMerge: (paths: string[]) => void
}

interface DirNode {
  name: string
  /** Ruta mostrada, relativa a la carpeta del OPF. Sirve de clave al plegar. */
  path: string
  dirs: DirNode[]
  files: EpubFile[]
}

/** Orden habitual de las carpetas de un EPUB; lo demás va detrás. */
const PREFERRED = ['Text', 'Styles', 'Images', 'Fonts', 'Audio', 'Video', 'Misc']
const PROTECTED = /^(mimetype|META-INF\/container\.xml)$|\.opf$/

function buildTree(book: EpubBook): DirNode {
  const opfDir = dirname(book.opfPath)
  const root: DirNode = { name: '', path: '', dirs: [], files: [] }

  for (const f of book.files.values()) {
    // Se muestra desde la carpeta del OPF: casi todo cuelga de ella y ese nivel
    // de más no aporta nada. Sigil hace lo mismo.
    const shown = opfDir && f.path.startsWith(`${opfDir}/`) ? f.path.slice(opfDir.length + 1) : f.path
    const parts = shown.split('/')
    parts.pop()

    let node = root
    let acc = ''
    for (const name of parts) {
      acc = acc ? `${acc}/${name}` : name
      let dir = node.dirs.find(d => d.name === name)
      if (!dir) {
        dir = { name, path: acc, dirs: [], files: [] }
        node.dirs.push(dir)
      }
      node = dir
    }
    node.files.push(f)
  }
  return root
}

const dirRank = (name: string) => {
  const i = PREFERRED.indexOf(name)
  return i < 0 ? PREFERRED.length : i
}

function countFiles(node: DirNode): number {
  return node.files.length + node.dirs.reduce((n, d) => n + countFiles(d), 0)
}

export default function FileTree(props: Props) {
  const { book, spine, active, coverPath } = props
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [context, setContext] = useState<ContextTarget | null>(null)
  // Con Ctrl se van marcando capítulos para fusionarlos.
  const [marked, setMarked] = useState<Set<string>>(new Set())

  const spineIndex = new Map(spine.map((p, i) => [p, i]))
  const root = buildTree(book)

  const toggle = (path: string) =>
    setCollapsed(prev => {
      const next = new Set(prev)
      if (!next.delete(path)) next.add(path)
      return next
    })

  const sortedDirs = (node: DirNode) =>
    [...node.dirs].sort((a, b) => dirRank(a.name) - dirRank(b.name) || a.name.localeCompare(b.name))

  // Dentro de una carpeta manda el orden de lectura; lo que no está en el
  // spine va después, por nombre.
  const sortedFiles = (node: DirNode) =>
    [...node.files].sort((a, b) => {
      const sa = spineIndex.get(a.path) ?? 1e9
      const sb = spineIndex.get(b.path) ?? 1e9
      return sa - sb || a.path.localeCompare(b.path, undefined, { numeric: true })
    })

  const toggleMark = (path: string) =>
    setMarked(prev => {
      const next = new Set(prev)
      if (!next.delete(path)) next.add(path)
      return next
    })

  const openContext = (e: React.MouseEvent, f: EpubFile) => {
    e.preventDefault()
    if (!marked.has(f.path)) props.onOpen(f.path)
    const at = spineIndex.get(f.path)
    const isDoc = f.mediaType === 'application/xhtml+xml'
    const isImage = f.mediaType.startsWith('image/')
    const locked = PROTECTED.test(f.path)

    setContext({
      x: e.clientX,
      y: e.clientY,
      items: [
        ...(isDoc && marked.size > 1 && marked.has(f.path)
          ? [
              {
                label: `Fusionar ${marked.size} capítulos`,
                onClick: () => { props.onMerge([...marked]); setMarked(new Set()) },
              },
              { separator: true },
            ]
          : []),
        { label: 'Duplicar', disabled: locked, onClick: () => props.onDuplicate(f.path) },
        { label: 'Renombrar…', disabled: locked, onClick: () => props.onRename(f.path) },
        { label: 'Eliminar', disabled: locked, onClick: () => props.onDelete(f.path) },
        ...(isDoc
          ? [
              { separator: true },
              { label: 'Subir en el orden de lectura', disabled: at == null || at === 0, onClick: () => props.onMoveSpine(f.path, -1) },
              { label: 'Bajar en el orden de lectura', disabled: at == null || at === spine.length - 1, onClick: () => props.onMoveSpine(f.path, 1) },
              { separator: true },
              { label: 'Partir capítulo…', onClick: () => props.onSplit(f.path) },
            ]
          : []),
        ...(isImage
          ? [
              { separator: true },
              { label: 'Usar como portada', disabled: f.path === coverPath, onClick: () => props.onSetCover(f.path) },
            ]
          : []),
      ],
    })
  }

  const renderFile = (f: EpubFile, depth: number) => {
    const name = f.path.split('/').pop()
    const at = spineIndex.get(f.path)
    const inSpine = at != null
    const isDoc = f.mediaType === 'application/xhtml+xml'
    const isImage = f.mediaType.startsWith('image/')
    const isCover = isImage && f.path === coverPath

    return (
      <li key={f.path} className={`${f.path === active ? 'active' : ''} ${marked.has(f.path) ? 'marked' : ''}`}>
        <button
          className="row file"
          title={isDoc ? `${f.path}
Ctrl+clic para marcarlo y fusionarlo` : f.path}
          style={{ paddingLeft: `${10 + depth * 13}px` }}
          onClick={e => (isDoc && (e.ctrlKey || e.metaKey) ? toggleMark(f.path) : props.onOpen(f.path))}
          onContextMenu={e => openContext(e, f)}
        >
          {isCover
            ? <span className="cover-mark"><Icon name="starFilled" size={13} label="Portada" /></span>
            : <Icon name={iconForFile(f.mediaType, f.path)} size={13} />}
          <span className={`name ${isDoc && !inSpine ? 'muted' : ''}`}>{name}</span>
        </button>
        <span className="file-actions">
          {isDoc && inSpine && (
            <>
              <button
                className="icon-btn"
                title="Subir en el orden de lectura"
                disabled={at === 0}
                onClick={() => props.onMoveSpine(f.path, -1)}
              >
                <Icon name="up" label="Subir" />
              </button>
              <button
                className="icon-btn"
                title="Bajar en el orden de lectura"
                disabled={at === spine.length - 1}
                onClick={() => props.onMoveSpine(f.path, 1)}
              >
                <Icon name="down" label="Bajar" />
              </button>
            </>
          )}
          {isImage && !isCover && (
            <button className="icon-btn" title="Usar como portada" onClick={() => props.onSetCover(f.path)}>
              <Icon name="star" label="Usar como portada" />
            </button>
          )}
          {!PROTECTED.test(f.path) && (
            <>
              <button className="icon-btn" title="Renombrar" onClick={() => props.onRename(f.path)}>
                <Icon name="pencil" label="Renombrar" />
              </button>
              <button className="icon-btn danger" title="Eliminar" onClick={() => props.onDelete(f.path)}>
                <Icon name="trash" label="Eliminar" />
              </button>
            </>
          )}
        </span>
      </li>
    )
  }

  const renderDir = (node: DirNode, depth: number) => {
    const shut = collapsed.has(node.path)
    return (
      <li key={node.path} className="dir">
        <button
          className="row folder"
          style={{ paddingLeft: `${8 + depth * 13}px` }}
          aria-expanded={!shut}
          title={node.path}
          onClick={() => toggle(node.path)}
        >
          <Icon name={shut ? 'right' : 'down'} size={11} />
          <Icon name="folder" size={13} />
          <span className="name">{node.name}</span>
          <span className="count">{countFiles(node)}</span>
        </button>
        {!shut && (
          <ul>
            {sortedDirs(node).map(d => renderDir(d, depth + 1))}
            {sortedFiles(node).map(f => renderFile(f, depth + 1))}
          </ul>
        )}
      </li>
    )
  }

  return (
    <nav className="tree" aria-label="Archivos del libro">
      <ul>
        {sortedDirs(root).map(d => renderDir(d, 0))}
        {sortedFiles(root).map(f => renderFile(f, 0))}
      </ul>
      {context && <ContextMenu target={context} onClose={() => setContext(null)} />}
    </nav>
  )
}
