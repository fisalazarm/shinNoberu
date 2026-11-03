import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { EditorView } from '@codemirror/view'
import { redo, undo } from '@codemirror/commands'
import Editor, { type CursorInfo, type Goto } from './components/Editor'
import FileTree from './components/FileTree'
import Preview from './components/Preview'
import Tabs from './components/Tabs'
import TocPanel from './components/TocPanel'
import Icon from './components/Icon'
import { Palette, PasteDialog, PromptDialog } from './components/Dialogs'
import SnippetsDialog from './components/SnippetsDialog'
import MetadataDialog from './components/MetadataDialog'
import ProblemsDialog from './components/ProblemsDialog'
import SearchDialog from './components/SearchDialog'
import TocDialog from './components/TocDialog'
import SeriesDialog from './components/SeriesDialog'
import FontsDialog from './components/FontsDialog'
import NotesDialog from './components/NotesDialog'
import AboutDialog from './components/AboutDialog'
import SpellDialog from './components/SpellDialog'
import ContextMenu, { type ContextTarget } from './components/ContextMenu'
import type { SpellMenuRequest } from './components/Editor'
import { findNames } from './lib/names'
import { matchCase, replaceWord } from './lib/spell'
import { suggestions } from './lib/spellClient'
import { loadBookWords, loadPersonal, saveBookWords, savePersonal } from './lib/userDict'
import { applyFonts, fontFolder, type FontChanges } from './lib/fonts'
import SplitDialog from './components/SplitDialog'
import RecoverDialog from './components/RecoverDialog'
import MenuBar, { type MenuDef } from './components/MenuBar'
import CheckpointsDialog from './components/CheckpointsDialog'
import TidyDialog from './components/TidyDialog'
import CharsDialog from './components/CharsDialog'
import SettingsDialog from './components/SettingsDialog'
import CompareDialog from './components/CompareDialog'
import ImagesDialog from './components/ImagesDialog'
import NovelStyleDialog from './components/NovelStyleDialog'
import CleanupDialog from './components/CleanupDialog'
import NamesDialog from './components/NamesDialog'
import ReportDialog from './components/ReportDialog'
import FrontMatterDialog from './components/FrontMatterDialog'
import DocxDialog, { type Mode } from './components/DocxDialog'
import DialogueDialog from './components/DialogueDialog'
import ReleaseDialog from './components/ReleaseDialog'
import TemplateDialog from './components/TemplateDialog'
import QuickOpen, { type QuickItem } from './components/QuickOpen'
import UndoBar, { type UndoOffer } from './components/UndoBar'
import {
  addToOpf, dirname, guessMediaType, isTextFile, loadEpub, parseManifest, relativePath,
  removeFromOpf, saveEpub, spinePaths, type EpubBook,
} from './lib/epub'
import { newEpub, xhtmlTemplate } from './lib/newEpub'
import {
  canSaveInPlace, currentHandle, forgetTarget, inTauri, pickEpub, pickFiles, saveEpubFile, saveTextFile,
} from './lib/fileIO'
import {
  forgetRecents, listRecents, openRecent, rememberRecent, type RecentFile,
} from './lib/recents'
import { PREVIEW_COLORS, PreviewResolver, type PreviewTheme } from './lib/preview'
import {
  applySnippet, loadSnippets, prettyKey, resetSnippets, saveSnippets, type Snippet,
} from './lib/snippets'
import { defaultPdfPasteOptions, type PdfPasteOptions } from './lib/pdfPaste'
import {
  clearCover, coverImagePath, readMetadata, setCover, touchModified, writeMetadata,
  type Metadata,
} from './lib/metadata'
import { followSpineInToc, moveSpineBefore, moveSpineItem, readToc, regenerateToc } from './lib/structure'
import { countBySeverity, validateBook, type Problem } from './lib/validate'
import {
  defaultSearchOptions, replaceAllInBook, replaceMatch, type Match, type SearchOptions,
} from './lib/searchBook'
import { insertFootnote } from './lib/footnotes'
import { tidyBook, type TidyOptions } from './lib/tidy'
import { applyNovelStyle, type NovelStyle } from './lib/novelStyle'
import { fixLinks, removeOrphans, type BrokenLink } from './lib/housekeeping'
import { addFrontMatter, type FrontMatterText, type PieceId } from './lib/frontMatter'
import { importChapters, readDocx, type ChapterDraft, type DocxDoc } from './lib/docx'
import { fixDialogue, type DialogueIssue } from './lib/dialogue'
import { DEVICES, deviceById } from './lib/devices'
import type { Opens } from './lib/release'
import { createVisibleToc, refreshVisibleToc, removeVisibleToc, visibleTocPath } from './lib/visibleToc'
import { countFootnotes, notesPagePath, toEndnotes, toFootnotes } from './lib/endnotes'
import { fitPanes, gridColumns, loadPaneSizes, savePaneSizes } from './lib/panes'
import { fillSnippet, type Ask, type FillResult } from './lib/snippetFill'
import { titleOf } from './lib/report'
import Splitter from './components/Splitter'
import {
  applyTemplate, defaultTemplate, importTemplates, type ApplyOptions, type LayoutTemplate,
} from './lib/layoutTemplate'
import {
  createCheckpoint, deleteCheckpoint, listCheckpoints, restoreCheckpoint,
  type CheckpointMeta,
} from './lib/checkpoints'
import type { Optimized } from './lib/images'
import { splitChapter, type SplitAt } from './lib/split'
import { duplicateFile, renameFile, renameSeries, type Rename } from './lib/files'
import { mergeChapters } from './lib/merge'
import { beautify } from './lib/beautify'
import { applyTheme, loadTheme, type Theme } from './lib/theme'
import { applySettings, loadSettings, saveSettings, type Settings } from './lib/settings'
import { bookWords, countWords } from './lib/words'
import { charInfo } from './lib/charName'
import {
  bookToDraft, clearDraft, draftToBook, loadDraft, saveDraft, type Draft,
} from './lib/autosave'

type Dialog =
  | { kind: 'paste' }
  | { kind: 'palette' }
  | { kind: 'snippets' }
  | { kind: 'metadata' }
  | { kind: 'problems' }
  | { kind: 'search' }
  | { kind: 'toc' }
  | { kind: 'series' }
  | { kind: 'split'; cursor: number }
  | { kind: 'checkpoints' }
  | { kind: 'tidy' }
  | { kind: 'chars' }
  | { kind: 'settings' }
  | { kind: 'compare'; meta: CheckpointMeta }
  | { kind: 'images' }
  | { kind: 'novelStyle' }
  | { kind: 'fonts' }
  | { kind: 'spell' }
  | { kind: 'cleanup' }
  | { kind: 'names' }
  | { kind: 'report' }
  | { kind: 'frontMatter' }
  | { kind: 'docx'; doc: DocxDoc; fileName: string }
  | { kind: 'dialogue' }
  | { kind: 'notes' }
  | { kind: 'about' }
  | { kind: 'release' }
  | { kind: 'pickVar'; ask: Ask }
  | { kind: 'templates' }
  | { kind: 'files' }
  | { kind: 'commands' }
  | { kind: 'prompt'; title: string; label: string; initial: string; onSubmit: (v: string) => void }
  | null

const PASTE_KEY = 'epub-editor.paste'
const SHEET_KEY = 'epub-editor.sheet'
const SPELL_KEY = 'epub-editor.ortografia'
const PREVIEW_THEME_KEY = 'epub-editor.previewTheme'
const AUTOSAVE_MS = 3000
const ADD_ACCEPT = '.jpg,.jpeg,.png,.gif,.webp,.svg,.css,.ttf,.otf,.woff,.woff2,.xhtml,.html'

/** Anchos de la hoja de la vista previa, para comprobar el largo de línea. */
const SHEETS = [
  { id: 'narrow', label: 'Estrecho', css: '34rem' },
  { id: 'medium', label: 'Medio', css: '46rem' },
  { id: 'wide', label: 'Ancho', css: '100%' },
] as const
type SheetId = (typeof SHEETS)[number]['id']

const ZOOMS = [0.6, 0.75, 0.9, 1, 1.15, 1.35, 1.6, 2]

function loadPasteOptions(): PdfPasteOptions {
  try {
    const s = localStorage.getItem(PASTE_KEY)
    if (s) return { ...defaultPdfPasteOptions, ...JSON.parse(s) }
  } catch { /* sin almacenamiento */ }
  return defaultPdfPasteOptions
}

function loadSheet(): SheetId {
  try {
    const s = localStorage.getItem(SHEET_KEY)
    if (SHEETS.some(x => x.id === s)) return s as SheetId
  } catch { /* sin almacenamiento */ }
  return 'medium'
}

/** `auto` sigue al tema de la app hasta que se elija uno a mano. */
function loadPreviewTheme(): PreviewTheme | 'auto' {
  try {
    const s = localStorage.getItem(PREVIEW_THEME_KEY)
    if (s === 'light' || s === 'dark') return s
  } catch { /* sin almacenamiento */ }
  return 'auto'
}

function firstDocument(book: EpubBook): string {
  const spine = spinePaths(book)
  return spine[0] ?? [...book.files.keys()].find(p => p.endsWith('.xhtml')) ?? book.opfPath
}

/** Posición del comienzo de una línea (1-based), para los problemas del validador. */
function offsetOfLine(text: string, line: number): number {
  let i = 0
  for (let n = 1; n < line; n++) {
    const j = text.indexOf('\n', i)
    if (j < 0) return i
    i = j + 1
  }
  return i
}

export default function App() {
  const [book, setBook] = useState<EpubBook>(() => newEpub())
  const [bookId, setBookId] = useState(0) // cambia al abrir otro libro: reinicia editor y vista previa
  const [fileName, setFileName] = useState('nuevo.epub')
  const [savePath, setSavePath] = useState<string | undefined>()
  const [active, setActive] = useState(() => 'OEBPS/Text/Cap01.xhtml')
  const [openPaths, setOpenPaths] = useState<string[]>(() => ['OEBPS/Text/Cap01.xhtml'])
  const [hash, setHash] = useState<string>()
  const [rev, setRev] = useState(0) // se incrementa con cada cambio del libro
  const [dirty, setDirty] = useState(false)
  const [status, setStatus] = useState('')
  const [dialog, setDialog] = useState<Dialog>(null)
  const [snippets, setSnippets] = useState<Snippet[]>(loadSnippets)
  const [smartPaste, setSmartPaste] = useState(true)
  const [spellOn, setSpellOn] = useState(() => {
    try { return localStorage.getItem(SPELL_KEY) !== 'no' } catch { return true }
  })
  const [personalWords, setPersonalWords] = useState(loadPersonal)
  const [bookWordSet, setBookWordSet] = useState<Set<string>>(new Set())
  const [nameWords, setNameWords] = useState<Set<string>>(new Set())
  const [spellMenu, setSpellMenu] = useState<ContextTarget | null>(null)
  const [pasteOptions, setPasteOptions] = useState<PdfPasteOptions>(loadPasteOptions)
  const [previewHtml, setPreviewHtml] = useState('')
  const [problems, setProblems] = useState<Problem[]>([])
  const [searchOptions, setSearchOptions] = useState<SearchOptions>(defaultSearchOptions)
  const [goto, setGoto] = useState<Goto>()
  const [theme, setTheme] = useState<Theme>(loadTheme)
  const [sheet, setSheet] = useState<SheetId>(loadSheet)
  const [zoom, setZoom] = useState(1)
  /** Ancho de la lista de archivos y de la vista previa, arrastrando sus bordes. */
  const [panes, setPanes] = useState(loadPaneSizes)
  const [viewport, setViewport] = useState(() => window.innerWidth)
  const sidebarRef = useRef<HTMLElement>(null)
  const previewRef = useRef<HTMLElement>(null)
  /** Sube al importar plantillas: obliga al diálogo a releer la lista. */
  const [templatesRev, setTemplatesRev] = useState(0)
  /** Pantalla de lector elegida, o vacío para ver la hoja suelta. */
  const [device, setDevice] = useState('')
  const [previewTheme, setPreviewTheme] = useState<PreviewTheme | 'auto'>(loadPreviewTheme)
  const [pane, setPane] = useState<'preview' | 'toc'>('preview')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [totalWords, setTotalWords] = useState(0)
  const [cursor, setCursor] = useState<CursorInfo>({ line: 1, col: 1, char: '' })
  const [dropping, setDropping] = useState(false)
  const [checkpoints, setCheckpoints] = useState<CheckpointMeta[]>([])
  const [settings, setSettings] = useState<Settings>(loadSettings)
  const [recents, setRecents] = useState<RecentFile[]>([])
  const [undoOffer, setUndoOffer] = useState<UndoOffer | null>(null)
  const view = useRef<EditorView | null>(null)
  const nonce = useRef(0)

  const touch = useCallback(() => { setRev(r => r + 1); setDirty(true) }, [])
  const flash = (msg: string) => { setStatus(msg); setTimeout(() => setStatus(s => (s === msg ? '' : s)), 4000) }

  const resolver = useMemo(() => new PreviewResolver(book), [book])
  useEffect(() => () => resolver.dispose(), [resolver])

  useEffect(() => { applyTheme(theme) }, [theme])
  useEffect(() => { applySettings(settings, theme) }, [settings, theme])
  useEffect(() => { saveSettings(settings) }, [settings])
  useEffect(() => {
    try { localStorage.setItem(SHEET_KEY, sheet) } catch { /* ignorar */ }
  }, [sheet])
  useEffect(() => {
    if (previewTheme === 'auto') return
    try { localStorage.setItem(PREVIEW_THEME_KEY, previewTheme) } catch { /* ignorar */ }
  }, [previewTheme])

  // `rev` invalida el cálculo cuando cambia el OPF (el libro se modifica en el lugar).
  // Modo del visor: el de la app mientras no se elija uno a mano.
  const paper: PreviewTheme = previewTheme === 'auto' ? theme : previewTheme

  const spine = useMemo(() => spinePaths(book), [book, rev])
  const toc = useMemo(() => readToc(book), [book, rev])
  const activeFile = book.files.get(active)
  const isDoc = activeFile?.mediaType === 'application/xhtml+xml'
  const isText = activeFile?.text != null

  const coverPath = useMemo(() => coverImagePath(book), [book, rev])
  const images = useMemo(
    () => [...book.files.values()].filter(f => f.mediaType.startsWith('image/')).map(f => f.path).sort(),
    [book, rev],
  )

  // El del archivo abierto es barato; el del libro entero va con retardo para
  // no recorrer cuarenta capítulos en cada tecla.
  const activeWords = useMemo(() => (isDoc ? countWords(activeFile?.text ?? '') : 0), [activeFile?.text, isDoc])
  useEffect(() => {
    const t = setTimeout(() => setTotalWords(bookWords(book)), 800)
    return () => clearTimeout(t)
  }, [book, rev])

  // La miniatura solo hace falta con el diálogo de metadatos abierto.
  const wantCoverUrl = dialog?.kind === 'metadata'
  const coverUrl = useMemo(() => {
    const f = wantCoverUrl && coverPath ? book.files.get(coverPath) : undefined
    if (!f?.bytes) return undefined
    return URL.createObjectURL(new Blob([f.bytes as BlobPart], { type: f.mediaType }))
  }, [wantCoverUrl, coverPath, book, rev])
  useEffect(() => () => { if (coverUrl) URL.revokeObjectURL(coverUrl) }, [coverUrl])

  // Documento que se ve en la vista previa: el activo si es XHTML; si es CSS, el último capítulo abierto.
  const [lastDoc, setLastDoc] = useState(active)
  if (isDoc && lastDoc !== active) setLastDoc(active)
  const previewPath = book.files.has(lastDoc) ? lastDoc : firstDocument(book)

  // Vista previa con un pequeño retardo para no rehacerla en cada tecla.
  useEffect(() => {
    const t = setTimeout(() => {
      const f = book.files.get(previewPath)
      resolver.zoom = zoom
      resolver.theme = paper
      setPreviewHtml(f?.text != null ? resolver.render(previewPath, f.text) : '')
    }, 250)
    return () => clearTimeout(t)
  }, [book, previewPath, rev, resolver, zoom, paper])

  useEffect(() => {
    const onResize = () => setViewport(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Se guarda un momento después del último cambio: arrastrar produce decenas
  // por segundo y basta con quedarse con el último.
  useEffect(() => {
    const t = setTimeout(() => savePaneSizes(panes), 300)
    return () => clearTimeout(t)
  }, [panes])

  // La página de índice visible se rehace sola cuando cambian los capítulos.
  // Solo con cambios del usuario: abrir un libro no debe marcarlo como
  // modificado sin haber tocado nada.
  useEffect(() => {
    if (!dirty) return
    const t = setTimeout(() => { if (refreshVisibleToc(book)) touch() }, 800)
    return () => clearTimeout(t)
  }, [book, rev, dirty, touch])

  useEffect(() => {
    try { localStorage.setItem(PASTE_KEY, JSON.stringify(pasteOptions)) } catch { /* ignorar */ }
  }, [pasteOptions])

  // ---------- ortografía ----------

  useEffect(() => {
    try { localStorage.setItem(SPELL_KEY, spellOn ? 'si' : 'no') } catch { /* ignorar */ }
  }, [spellOn])

  // Las palabras aceptadas de este libro van por su identificador.
  useEffect(() => { setBookWordSet(loadBookWords(book)) }, [book])

  // Los nombres propios del libro no se subrayan. Se recalculan con calma
  // tras escribir, y solo se cambia la lista si de verdad cambió: si no, el
  // editor volvería a revisar en cada pausa.
  useEffect(() => {
    if (!spellOn) return
    const t = setTimeout(() => {
      const names = findNames(book).flatMap(g => g.variants.map(v => v.word))
      setNameWords(prev => {
        if (prev.size === names.length && names.every(n => prev.has(n))) return prev
        return new Set(names)
      })
    }, rev === 0 ? 0 : 1500)
    return () => clearTimeout(t)
  }, [book, rev, spellOn])

  const spellAccepted = useMemo(
    () => new Set([...personalWords, ...bookWordSet, ...nameWords]),
    [personalWords, bookWordSet, nameWords],
  )

  useEffect(() => {
    document.title = `${dirty ? '● ' : ''}${fileName} — ShinNoberu`
  }, [dirty, fileName])

  // ---------- pestañas ----------

  const openFile = useCallback((path: string) => {
    setOpenPaths(list => (list.includes(path) ? list : [...list, path]))
    setActive(path)
  }, [])

  const closeFile = (path: string) => {
    const i = openPaths.indexOf(path)
    if (i < 0) return
    const next = openPaths.filter(p => p !== path)
    setOpenPaths(next)
    // Al cerrar la pestaña activa se pasa a la de al lado, como en cualquier editor.
    if (path === active && next.length) setActive(next[i] ?? next[i - 1])
  }

  // ---------- borrador automático ----------

  useEffect(() => { loadDraft().then(d => { if (d) setDraft(d) }) }, [])

  useEffect(() => {
    if (!dirty) return
    const t = setTimeout(() => {
      const d = bookToDraft(book, { fileName, savePath, active })
      if (d) saveDraft(d)
    }, AUTOSAVE_MS)
    return () => clearTimeout(t)
  }, [book, rev, dirty, fileName, savePath, active])

  const doRecover = () => {
    if (!draft) return
    const b = draftToBook(draft)
    const first = b.files.has(draft.active) ? draft.active : firstDocument(b)
    setBook(b)
    setBookId(id => id + 1)
    setFileName(draft.fileName)
    setSavePath(draft.savePath)
    setActive(first)
    setOpenPaths([first])
    setHash(undefined)
    setProblems([])
    setDirty(true) // sigue sin guardarse en disco
    setDraft(null)
    flash('Borrador recuperado')
  }

  const doDiscardDraft = () => { clearDraft(); setDraft(null) }

  // ---------- acciones ----------

  const confirmDiscard = () => !dirty || window.confirm('Hay cambios sin guardar. ¿Descartarlos?')

  const replaceBook = (b: EpubBook, name: string, path?: string) => {
    clearDraft()
    const first = firstDocument(b)
    setBook(b)
    setBookId(id => id + 1)
    setFileName(name)
    setSavePath(path)
    setActive(first)
    setOpenPaths([first])
    setHash(undefined)
    setDirty(false)
    setProblems([])
  }

  const doNew = () => {
    if (!confirmDiscard()) return
    forgetTarget()
    const fresh = newEpub()
    // Si hay plantilla marcada, el libro nace ya maquetado.
    const t = defaultTemplate()
    const r = t ? applyTemplate(fresh, t) : null
    replaceBook(fresh, 'nuevo.epub')
    if (r?.done.length) {
      // Trae contenido que aún no está en ningún archivo: si no se marca,
      // ni se autoguarda ni avisa al cerrar.
      setDirty(true)
      flash(`Libro nuevo con «${t!.name}»`)
    }
  }

  const openEpubBytes = async (bytes: Uint8Array, name: string, path?: string) => {
    try {
      replaceBook(await loadEpub(bytes), name, path)
      flash(`Abierto ${name}`)
    } catch (e) {
      alert(`No se pudo abrir el EPUB: ${e instanceof Error ? e.message : e}`)
    }
  }

  const refreshRecents = () => { listRecents().then(setRecents) }
  useEffect(() => { refreshRecents() }, [])

  const doOpen = async () => {
    if (!confirmDiscard()) return
    const f = await pickEpub()
    if (!f) return
    await openEpubBytes(f.bytes, f.name, f.path)
    await rememberRecent({ name: f.name, path: inTauri() ? f.path : undefined, handle: currentHandle() })
    refreshRecents()
  }

  const doOpenRecent = async (r: RecentFile) => {
    if (!confirmDiscard()) return
    const opened = await openRecent(r)
    if (!opened) {
      return alert(`No se pudo abrir «${r.name}». Puede que se haya movido, o que haya que dar permiso otra vez.`)
    }
    await openEpubBytes(opened.bytes, opened.name, opened.path)
    await rememberRecent({ name: r.name, path: r.path, handle: r.handle })
    refreshRecents()
  }

  const doForgetRecents = async () => {
    await forgetRecents()
    refreshRecents()
  }

  const doSave = async (asNew = false) => {
    try {
      touchModified(book)
      const bytes = await saveEpub(book)
      const res = await saveEpubFile(bytes, fileName, asNew ? undefined : savePath)
      // Si canceló el diálogo no se ha escrito nada: el libro sigue sucio.
      if (!res.saved) return
      if (res.path) { setSavePath(res.path); setFileName(res.path.split(/[\\/]/).pop()!) }
      setDirty(false)
      clearDraft()
      flash(canSaveInPlace() ? `Guardado ${res.path ?? fileName}` : `Descargado ${fileName}`)
    } catch (e) {
      alert(`No se pudo guardar: ${e instanceof Error ? e.message : e}`)
    }
  }

  const onChange = useCallback((path: string, text: string) => {
    const f = book.files.get(path)
    if (f && f.text !== text) { f.text = text; touch() }
  }, [book, touch])

  const opfDir = dirname(book.opfPath)
  const folderFor = (mediaType: string) => {
    const existing = parseManifest(book).find(i => i.mediaType === mediaType)
      ?? parseManifest(book).find(i => i.mediaType.split('/')[0] === mediaType.split('/')[0])
    if (existing) return dirname(existing.path)
    const sub = mediaType.startsWith('image/') ? 'Images'
      : mediaType === 'text/css' ? 'Styles'
      : mediaType.startsWith('font/') ? 'Fonts'
      : 'Text'
    return [opfDir, sub].filter(Boolean).join('/')
  }

  const firstCss = () => [...book.files.values()].find(f => f.mediaType === 'text/css')?.path

  const addToNav = (chapterPath: string, title: string) => {
    const navItem = parseManifest(book).find(i => i.properties?.split(' ').includes('nav'))
    const nav = navItem && book.files.get(navItem.path)
    if (!nav?.text) return
    const start = nav.text.indexOf('epub:type="toc"')
    const end = nav.text.indexOf('</nav>', start)
    const olEnd = start < 0 || end < 0 ? -1 : nav.text.lastIndexOf('</ol>', end)
    if (olEnd < 0) return
    const li = `  <li><a href="${relativePath(nav.path, chapterPath)}">${title}</a></li>\n    `
    nav.text = nav.text.slice(0, olEnd) + li + nav.text.slice(olEnd)
  }

  const doNewChapter = () => {
    const dir = folderFor('application/xhtml+xml')
    let n = spine.length + 1
    const name = () => `Cap${String(n).padStart(2, '0')}.xhtml`
    while (book.files.has(`${dir}/${name()}`)) n++
    setDialog({
      kind: 'prompt',
      title: 'Nuevo capítulo',
      label: 'Nombre del archivo',
      initial: name(),
      onSubmit: value => {
        const file = value.endsWith('.xhtml') ? value : `${value}.xhtml`
        const path = `${dir}/${file}`
        if (book.files.has(path)) return alert('Ya existe un archivo con ese nombre.')
        const css = firstCss()
        const title = `Capítulo ${n}`
        book.files.set(path, {
          path,
          mediaType: 'application/xhtml+xml',
          text: xhtmlTemplate(title, css ? relativePath(path, css) : undefined),
        })
        addToOpf(book, path, { spineAfter: isDoc ? active : undefined })
        addToNav(path, title)
        setDialog(null)
        openFile(path)
        touch()
      },
    })
  }

  /** Mete archivos ya leídos en el libro y devuelve sus rutas. */
  const addPicked = (files: { name: string; bytes: Uint8Array }[]): string[] => {
    const paths: string[] = []
    for (const f of files) {
      const mediaType = guessMediaType(f.name)
      const path = `${folderFor(mediaType)}/${f.name}`
      const entry = isTextFile(f.name)
        ? { path, mediaType, text: new TextDecoder().decode(f.bytes) }
        : { path, mediaType, bytes: f.bytes }
      book.files.set(path, entry)
      resolver.invalidate(path)
      addToOpf(book, path)
      paths.push(path)
    }
    if (paths.length) {
      touch()
      flash(`Agregado${paths.length > 1 ? 's' : ''} ${paths.length} archivo${paths.length > 1 ? 's' : ''}`)
    }
    return paths
  }

  const addFiles = async (accept: string) => addPicked(await pickFiles(accept))
  const doAddFiles = () => addFiles(ADD_ACCEPT)

  /** Arrastrar y soltar: un .epub abre el libro, lo demás se añade. */
  const onDrop = async (list: FileList) => {
    const files = [...list]
    if (!files.length) return
    if (files.length === 1 && /\.epub$/i.test(files[0].name)) {
      if (!confirmDiscard()) return
      // Un archivo soltado no trae asidero: habrá que preguntar al guardar.
      forgetTarget()
      const bytes = new Uint8Array(await files[0].arrayBuffer())
      return openEpubBytes(bytes, files[0].name)
    }
    addPicked(await Promise.all(
      files.map(async f => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })),
    ))
  }

  const doDelete = (path: string) => {
    if (!window.confirm(`¿Eliminar ${path.split('/').pop()} del libro?`)) return
    removeFromOpf(book, path)
    book.files.delete(path)
    setOpenPaths(list => list.filter(p => p !== path))
    if (active === path) setActive(firstDocument(book))
    touch()
  }

  const doRename = (oldPath: string) => {
    setDialog({
      kind: 'prompt',
      title: 'Renombrar archivo',
      label: 'Nuevo nombre',
      initial: oldPath.split('/').pop()!,
      onSubmit: value => {
        const newPath = `${dirname(oldPath)}/${value}`
        if (newPath === oldPath) return setDialog(null)
        if (book.files.has(newPath)) return alert('Ya existe un archivo con ese nombre.')
        if (!renameFile(book, oldPath, newPath)) return alert('No se pudo renombrar ese archivo.')
        resolver.invalidate(oldPath)
        setOpenPaths(list => list.map(p => (p === oldPath ? newPath : p)))
        if (active === oldPath) setActive(newPath)
        if (lastDoc === oldPath) setLastDoc(newPath)
        setDialog(null)
        touch()
      },
    })
  }

  const insertHtml = (html: string) => {
    const v = view.current
    if (!v) return
    const { from, to } = v.state.selection.main
    v.dispatch({ changes: { from, to, insert: html }, selection: { anchor: from + html.length }, scrollIntoView: true })
    v.focus()
  }

  /**
   * Sigue con un snippet a medio rellenar: si ya está, se inserta; si queda una
   * variable por elegir, se abre la lista de archivos para ella.
   */
  const continueSnippet = (r: FillResult) => {
    if ('ask' in r) return setDialog({ kind: 'pickVar', ask: r.ask })
    setDialog(null)
    if (view.current) requestAnimationFrame(() => applySnippet(view.current!, r.done))
  }

  /**
   * El snippet con su número de nota y sus variables, mirando el libro tal
   * como está ahora. null si hay que preguntar un archivo: entonces se abre la
   * lista y se inserta al elegir.
   */
  const prepareSnippet = (s: Snippet): Snippet | null => {
    const r = fillSnippet(s, book, active)
    if ('done' in r) return r.done
    continueSnippet(r)
    return null
  }

  const runSnippet = (s: Snippet) => {
    setDialog(null)
    const ready = prepareSnippet(s)
    if (ready && view.current) requestAnimationFrame(() => applySnippet(view.current!, ready))
  }

  const navigate = (path: string, h: string) => { openFile(path); setHash(h || undefined) }

  /** Abre un archivo y deja el cursor en una posición concreta. */
  const jump = (path: string, from: number, to?: number) => {
    setDialog(null)
    openFile(path)
    setGoto({ path, from, to, nonce: ++nonce.current })
  }

  // ---------- metadatos y portada ----------

  const saveMetadata = (m: Metadata) => {
    if (!writeMetadata(book, m)) {
      return alert('No se pudo escribir en el OPF. Usa «Revisar» para ver qué le pasa.')
    }
    setDialog(null)
    touch()
    flash('Metadatos guardados')
  }

  const doSetCover = (path: string) => {
    if (!setCover(book, path)) return alert('No se pudo marcar esa imagen como portada.')
    touch()
    flash(`Portada: ${path.split('/').pop()}`)
  }

  const doClearCover = () => { clearCover(book); touch(); flash('Portada quitada') }

  const doAddCoverImage = async () => {
    const added = await addFiles('.jpg,.jpeg,.png,.webp')
    if (added.length) doSetCover(added[0])
  }

  // ---------- estructura ----------

  // El índice sigue al capítulo movido, si estaba en orden de lectura.
  const doMoveSpine = (path: string, delta: number) => {
    const before = spinePaths(book)
    if (!moveSpineItem(book, path, delta)) return
    followSpineInToc(book, before)
    touch()
  }

  const doMoveSpineTo = (path: string, target: string | null) => {
    const before = spinePaths(book)
    if (!moveSpineBefore(book, path, target)) return
    const toc = followSpineInToc(book, before)
    touch()
    const name = (p: string) => p.split('/').pop()
    flash(`${name(path)} ${target ? `va ahora delante de ${name(target)}` : 'va ahora al final'}${toc ? ' · índice actualizado' : ''}`)
  }

  const doToc = (opts: { maxLevel: number; ncx: boolean }) => {
    setDialog(null)
    bulk('Antes de regenerar el índice', () => {
      const r = regenerateToc(book, opts)
      if (!r) {
        alert('No se pudo regenerar el índice (no se encontró el documento de navegación).')
        return null
      }
      return `Índice regenerado: ${r.headings.length} entrada${r.headings.length === 1 ? '' : 's'}${r.ncxPath ? ' + toc.ncx' : ''}`
    })
  }

  const acceptWord = (word: string, where: 'personal' | 'book') => {
    if (where === 'personal') {
      const next = new Set(personalWords).add(word)
      savePersonal(next)
      setPersonalWords(next)
      flash(`«${word}» añadida a tu diccionario`)
    } else {
      const next = new Set(bookWordSet).add(word)
      saveBookWords(book, next)
      setBookWordSet(next)
      flash(`«${word}» aceptada en este libro`)
    }
  }

  const doReplaceWord = (word: string, replacement: string) => {
    bulk(`Antes de cambiar «${word}»`, () => {
      const n = replaceWord(book, word, replacement)
      return n ? `«${word}» → «${replacement}» en ${n} sitio${n === 1 ? '' : 's'}` : null
    })
  }

  /** Clic derecho sobre una palabra subrayada: sugerencias y diccionarios. */
  const openSpellMenu = async (m: SpellMenuRequest) => {
    const list = await suggestions(m.word)
    const fix = (s: string) => {
      const v = view.current
      // Por si el texto se movió mientras llegaban las sugerencias.
      if (!v || v.state.sliceDoc(m.from, m.to) !== m.word) return
      v.dispatch({ changes: { from: m.from, to: m.to, insert: matchCase(m.word, s) }, userEvent: 'input.spell' })
      v.focus()
    }
    setSpellMenu({
      x: m.x,
      y: m.y,
      items: [
        ...(list.length
          ? list.map(s => ({ label: matchCase(m.word, s), onClick: () => fix(s) }))
          : [{ label: 'Sin sugerencias', disabled: true }]),
        { separator: true },
        { label: `Añadir «${m.word}» a mi diccionario`, onClick: () => acceptWord(m.word, 'personal') },
        { label: 'Aceptar solo en este libro', onClick: () => acceptWord(m.word, 'book') },
        { separator: true },
        { label: 'Ortografía del libro…', onClick: () => setDialog({ kind: 'spell' }) },
      ],
    })
  }

  const doFonts = (changes: FontChanges) => {
    setDialog(null)
    bulk('Antes de cambiar las fuentes', () => {
      const r = applyFonts(book, changes, fontFolder(book))
      if (!r) {
        alert('El libro no tiene ninguna hoja de estilos donde declarar las fuentes.')
        return null
      }
      resolver.invalidate(r.cssPath)
      for (const p of [...r.added, ...changes.remove]) resolver.invalidate(p)
      const partes = [
        r.added.length && `${r.added.length} añadida${r.added.length === 1 ? '' : 's'}`,
        changes.remove.length && `${changes.remove.length} quitada${changes.remove.length === 1 ? '' : 's'}`,
      ].filter(Boolean)
      return `Fuentes actualizadas${partes.length ? `: ${partes.join(', ')}` : ''}`
    })
  }

  const doSeries = (plan: Rename[]) => {
    setDialog(null)
    bulk('Antes de renombrar en serie', () => {
      const n = renameSeries(book, plan)
      if (!n) return null
      // Lo abierto sigue abierto con su nombre nuevo.
      const moved = new Map(plan.map(r => [r.from, r.to]))
      const now = (p: string) => moved.get(p) ?? p
      for (const r of plan) resolver.invalidate(r.from)
      setOpenPaths(list => list.map(now))
      setActive(now(active))
      setLastDoc(now(lastDoc))
      return `${n} archivo${n === 1 ? '' : 's'} renombrado${n === 1 ? '' : 's'}`
    })
  }

  const doDuplicate = (path: string) => {
    const copy = duplicateFile(book, path)
    if (!copy) return alert('No se pudo duplicar ese archivo.')
    touch()
    openFile(copy)
    flash(`Duplicado como ${copy.split('/').pop()}`)
  }

  const doMerge = (paths: string[]) => {
    bulk('Antes de fusionar', () => {
      const r = mergeChapters(book, paths)
      if (!r) {
        alert('Hacen falta al menos dos capítulos para fusionar.')
        return null
      }
      openFile(r.kept)
      setOpenPaths(list => list.filter(p => !r.absorbed.includes(p)))
      return `${r.absorbed.length + 1} capítulos en uno · regenera el índice`
    })
  }

  /** Sangra el XHTML sin cambiar lo que se ve. */
  const doBeautify = (only?: string) => {
    bulk('Antes de sangrar', () => {
      let n = 0
      for (const f of book.files.values()) {
        if (f.mediaType !== 'application/xhtml+xml' || f.text == null) continue
        if (only && f.path !== only) continue
        const out = beautify(f.text)
        if (out === f.text) continue
        f.text = out
        n++
      }
      return n ? `${n} archivo${n === 1 ? '' : 's'} sangrado${n === 1 ? '' : 's'}` : null
    })
  }

  const openSplit = (path: string) => {
    openFile(path)
    setDialog({ kind: 'split', cursor: view.current?.state.selection.main.head ?? 0 })
  }

  const doSplit = (at: SplitAt) => {
    setDialog(null)
    bulk('Antes de partir el capítulo', () => {
      const r = splitChapter(book, active, at)
      if (!r) {
        alert('No se pudo partir el capítulo.')
        return null
      }
      return `Partido en ${r.created.length + 1} archivos · regenera el índice`
    })
  }

  const doFootnote = () => { if (view.current) insertFootnote(view.current) }

  // ---------- revisión ----------

  const doCheck = () => {
    const list = validateBook(book)
    setProblems(list)
    setDialog({ kind: 'problems' })
    const { errors, warnings } = countBySeverity(list)
    flash(list.length ? `${errors} error(es), ${warnings} aviso(s)` : 'Sin problemas')
  }

  const goProblem = (p: Problem) => {
    const f = book.files.get(p.file)
    if (!f) { setDialog(null); return }
    const offset = p.offset ?? (p.line && f.text != null ? offsetOfLine(f.text, p.line) : 0)
    jump(p.file, offset)
  }

  // ---------- buscar y reemplazar ----------

  const doReplaceOne = (m: Match, replacement: string) => {
    if (replaceMatch(book, m, searchOptions, replacement) != null) touch()
  }

  const doReplaceAll = (replacement: string) => {
    bulk('Antes de reemplazar todo', () => {
      const n = replaceAllInBook(book, searchOptions, replacement)
      return n ? `${n} reemplazo${n === 1 ? '' : 's'}` : null
    })
  }

  // ---------- puntos de control ----------

  const refreshCheckpoints = () => { listCheckpoints().then(setCheckpoints) }
  useEffect(() => { refreshCheckpoints() }, [])

  const doCreateCheckpoint = async (label: string) => {
    const meta = await createCheckpoint(book, label, fileName)
    if (!meta) return alert('El libro es demasiado grande para guardar un punto de control.')
    refreshCheckpoints()
    flash(`Punto de control «${meta.label}»`)
  }

  const doRestoreCheckpoint = async (meta: CheckpointMeta) => {
    if (!window.confirm(`¿Volver a «${meta.label}»? Se pierde todo lo hecho desde entonces.`)) return
    const b = await restoreCheckpoint(meta.id)
    if (!b) return alert('Ese punto de control ya no está disponible.')
    replaceBook(b, meta.fileName)
    setDirty(true) // lo restaurado tampoco está en disco
    setDialog(null)
    flash(`Restaurado «${meta.label}»`)
  }

  const doDeleteCheckpoint = async (id: string) => {
    await deleteCheckpoint(id)
    refreshCheckpoints()
  }

  /**
   * Envuelve una operación que toca varios archivos: guarda un punto de
   * control antes y deja ofrecido el deshacer. El editor solo mantiene
   * historial del archivo abierto, así que sin esto no habría vuelta atrás.
   */
  const bulk = async (label: string, run: () => string | null) => {
    const before = await createCheckpoint(book, label, fileName, true)
    const message = run()
    refreshCheckpoints()
    if (!message) return
    touch()
    if (before) setUndoOffer({ message, checkpointId: before.id, nonce: ++nonce.current })
    else flash(message)
  }

  const undoBulk = async () => {
    if (!undoOffer) return
    const b = await restoreCheckpoint(undoOffer.checkpointId)
    setUndoOffer(null)
    if (!b) return alert('El punto de control de antes ya no está disponible.')
    replaceBook(b, fileName, savePath)
    setDirty(true)
    flash('Deshecho')
  }

  // ---------- limpiar ----------

  const doTidy = (options: TidyOptions, only?: string) => {
    setDialog(null)
    bulk('Antes de limpiar', () => {
      const done = tidyBook(book, options, only)
      if (!done.length) return null
      const total = done.reduce((n, d) => n + d.changes, 0)
      return `${total} cambio${total === 1 ? '' : 's'} en ${done.length} archivo${done.length === 1 ? '' : 's'}`
    })
  }

  const doNovelStyle = (style: NovelStyle) => {
    setDialog(null)
    bulk('Antes de los estilos de novela', () => {
      const done = applyNovelStyle(book, style)
      if (!done) return null
      const partes = [`estilos en ${done.sheet.split('/').pop()}`]
      if (done.chapters) partes.push(`${done.chapters} capitular${done.chapters === 1 ? '' : 'es'}`)
      if (done.scenes) partes.push(`${done.scenes} salto${done.scenes === 1 ? '' : 's'} de escena`)
      return partes.join(' · ')
    })
  }

  const doCleanupDelete = (paths: string[]) => {
    bulk('Antes de eliminar archivos sueltos', () => {
      const n = removeOrphans(book, paths)
      if (!n) return null
      // Si lo borrado era lo que estaba abierto, hay que irse a otra parte.
      if (!book.files.has(active)) openFile(spinePaths(book)[0] ?? book.opfPath)
      return `${n} archivo${n === 1 ? '' : 's'} fuera`
    })
  }

  const doCleanupFix = (links: BrokenLink[]) => {
    bulk('Antes de arreglar enlaces', () => {
      const n = fixLinks(book, links)
      return n ? `${n} enlace${n === 1 ? '' : 's'} arreglado${n === 1 ? '' : 's'}` : null
    })
  }

  const doUnifyName = (from: string, to: string) => {
    bulk(`Antes de unificar «${from}»`, () => {
      // Palabra entera y distinguiendo mayúsculas: cambiar "Ana" no debe tocar
      // "Mariana" ni "ana" en mitad de otra palabra.
      const n = replaceAllInBook(
        book,
        { ...defaultSearchOptions, query: from, wholeWord: true, caseSensitive: true },
        to,
      )
      return n ? `${from} → ${to} · ${n} ${n === 1 ? 'vez' : 'veces'}` : null
    })
  }

  const doExportTemplates = async (text: string, name: string) => {
    if (await saveTextFile(text, name)) flash('Plantillas exportadas')
  }

  const doImportTemplates = async () => {
    const [file] = await pickFiles('.json')
    if (!file) return
    const r = importTemplates(new TextDecoder().decode(file.bytes))
    if (r.error) return alert(r.error)
    const n = r.renamed.length
    const otra = n ? ` · ${n} se ${n === 1 ? 'renombró' : 'renombraron'} para no pisar las tuyas` : ''
    flash(`${r.added.length} plantilla${r.added.length === 1 ? '' : 's'} importada${r.added.length === 1 ? '' : 's'}${otra}`)
    // El diálogo lee la lista al montarse: se le cambia la clave para que
    // vuelva a montarse y la relea.
    setTemplatesRev(v => v + 1)
  }

  const doApplyTemplate = (t: LayoutTemplate, opts: ApplyOptions) => {
    setDialog(null)
    bulk(`Antes de aplicar «${t.name}»`, () => {
      const r = applyTemplate(book, t, opts)
      if (!r.done.length) return r.skipped.length ? `No se aplicó nada: ${r.skipped[0]}` : null
      const pero = r.skipped.length ? ` · ${r.skipped.length} sin aplicar` : ''
      return `${t.name}: ${r.done.join(', ')}${pero}`
    })
  }

  const doToggleVisibleToc = () => {
    if (visibleTocPath(book)) {
      bulk('Antes de quitar la página de índice', () =>
        removeVisibleToc(book) ? 'Página de índice quitada' : null)
      return
    }
    bulk('Antes de añadir la página de índice', () => {
      const r = createVisibleToc(book)
      openFile(r.path)
      return `Página de índice con ${r.entries} capítulo${r.entries === 1 ? '' : 's'}`
    })
  }

  const doToEndnotes = () => {
    // Sin esto, el menú no haría nada visible en un libro sin notas.
    if (!countFootnotes(book) && !notesPagePath(book)) return flash('El libro no tiene notas al pie que pasar')
    bulk('Antes de pasar las notas al final', () => {
      const r = toEndnotes(book)
      if (!r) return null
      if (r.path) openFile(r.path)
      return `${r.notes} nota${r.notes === 1 ? '' : 's'} al final del libro · regenera el índice para que salga «Notas»`
    })
  }

  const doToFootnotes = () => {
    bulk('Antes de devolver las notas al pie', () => {
      const r = toFootnotes(book)
      return r ? `${r.notes} nota${r.notes === 1 ? '' : 's'} de vuelta al pie de su capítulo` : null
    })
  }

  /** Desde «Antes de publicar» se salta al panel que arregla cada cosa. */
  const openFromRelease = (what: Opens) => {
    // «Revisar» no es un diálogo: calcula los problemas y luego los enseña.
    if (what === 'problems') return doCheck()
    setDialog({ kind: what })
  }

  const doFixDialogue = (issues: DialogueIssue[]) => {
    bulk('Antes de arreglar el diálogo', () => {
      const n = fixDialogue(book, issues)
      return n ? `${n} arreglo${n === 1 ? '' : 's'} en el diálogo` : null
    })
  }

  // ---------- importar desde Word ----------

  const doPickDocx = async () => {
    const [file] = await pickFiles('.docx')
    if (!file) return
    try {
      const doc = await readDocx(file.bytes)
      if (!doc.blocks.length) return alert('Ese documento no tiene texto.')
      setDialog({ kind: 'docx', doc, fileName: file.name })
    } catch (e) {
      alert(`No se pudo leer el documento: ${e instanceof Error ? e.message : e}`)
    }
  }

  const doImportDocx = (doc: DocxDoc, chapters: ChapterDraft[], mode: Mode, title: string) => {
    setDialog(null)
    // Un libro nuevo se lleva por delante el abierto: se pregunta antes.
    if (mode === 'new' && !confirmDiscard()) return

    const target = mode === 'new' ? newEpub(title) : book
    if (mode === 'new') {
      // La plantilla trae un capítulo de ejemplo que aquí sobra.
      for (const path of spinePaths(target)) {
        removeFromOpf(target, path)
        target.files.delete(path)
      }
    }

    // Todo se calcula sobre `target`: en un libro nuevo, el abierto ya no pinta.
    const textDir = dirname(firstDocument(target)) || dirname(target.opfPath)
    const imagesDir = [dirname(textDir), 'Images'].filter(Boolean).join('/')
    const css = [...target.files.values()].find(f => f.mediaType === 'text/css')?.path
      ?? `${dirname(textDir)}/Styles/style.css`

    const run = () => {
      const r = importChapters(target, doc, chapters, {
        textDir,
        imagesDir,
        cssHref: relativePath(`${textDir}/x.xhtml`, css),
      })
      regenerateToc(target, { maxLevel: 2 })
      const n = r.chapters.length
      const img = r.images.length ? ` y ${r.images.length} imagen${r.images.length === 1 ? '' : 'es'}` : ''
      return `${n} capítulo${n === 1 ? '' : 's'}${img} desde Word`
    }

    if (mode === 'new') {
      const message = run()
      forgetTarget()
      replaceBook(target, `${title}.epub`)
      setDirty(true)
      flash(message)
      return
    }
    bulk('Antes de importar desde Word', run)
  }

  const doFrontMatter = (ids: PieceId[], text: FrontMatterText) => {
    setDialog(null)
    bulk('Antes de añadir los preliminares', () => {
      const r = addFrontMatter(book, ids, text)
      if (!r.created.length) {
        return r.skipped.length ? 'Esas páginas ya estaban en el libro' : null
      }
      if (r.created[0]) openFile(r.created[0])
      const n = r.created.length
      const ya = r.skipped.length ? ` · ${r.skipped.length} ya estaban` : ''
      return `${n} página${n === 1 ? '' : 's'} de cortesía${ya}`
    })
  }

  const doOptimizeImages = (results: Map<string, Optimized>) => {
    setDialog(null)
    bulk('Antes de optimizar imágenes', () => {
      let saved = 0
      for (const [path, out] of results) {
        const f = book.files.get(path)
        if (!f?.bytes) continue
        saved += f.bytes.byteLength - out.bytes.byteLength
        f.bytes = out.bytes
        f.mediaType = out.mediaType
        resolver.invalidate(path)
      }
      if (!results.size) return null
      return `${results.size} imagen${results.size === 1 ? '' : 'es'} · ${Math.round(saved / 1024)} kB menos`
    })
  }

  const insertChar = (c: string) => {
    const v = view.current
    if (!v) return
    const { from, to } = v.state.selection.main
    v.dispatch({ changes: { from, to, insert: c }, selection: { anchor: from + c.length } })
    v.focus()
  }

  // Atajos globales.
  const shortcuts = useRef<Record<string, () => void>>({})
  shortcuts.current = {
    s: () => doSave(),
    S: () => doSave(true),
    o: doOpen,
    k: () => setDialog({ kind: 'commands' }),
    p: () => setDialog({ kind: 'files' }),
    F: () => setDialog({ kind: 'search' }),
    ',': () => setDialog({ kind: 'settings' }),
    w: () => closeFile(active),
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // El campo de atajos de los snippets se queda las teclas para sí.
      if ((e.target as HTMLElement | null)?.dataset?.keycapture) return
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return
      const k = e.shiftKey ? e.key.toUpperCase() : e.key.toLowerCase()
      const fn = shortcuts.current[k]
      if (fn) { e.preventDefault(); fn() }
    }
    window.addEventListener('keydown', onKey, true)
    const beforeUnload = (e: BeforeUnloadEvent) => { if (dirty) e.preventDefault() }
    window.addEventListener('beforeunload', beforeUnload)
    return () => { window.removeEventListener('keydown', onKey, true); window.removeEventListener('beforeunload', beforeUnload) }
  }, [dirty])

  // ---------- vista ----------

  const imageUrl = useMemo(() => {
    if (!activeFile?.bytes || !activeFile.mediaType.startsWith('image/')) return null
    return URL.createObjectURL(new Blob([activeFile.bytes as BlobPart], { type: activeFile.mediaType }))
  }, [activeFile])
  useEffect(() => () => { if (imageUrl) URL.revokeObjectURL(imageUrl) }, [imageUrl])

  // `rev` entra a propósito: el libro se modifica en el sitio.
  const hasEndnotes = useMemo(() => !!notesPagePath(book), [book, rev])
  const sheetCss = SHEETS.find(s => s.id === sheet)!.css
  const screen = deviceById(device) ?? null
  const charAt = isText ? charInfo(cursor.char) : null
  const stepZoom = (dir: number) => {
    const i = ZOOMS.indexOf(zoom)
    const next = ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, (i < 0 ? ZOOMS.indexOf(1) : i) + dir))]
    setZoom(next)
  }
  const nothingOpen = openPaths.length === 0
  const problemCount = countBySeverity(problems)

  const runInEditor = (cmd: (v: EditorView) => boolean) => () => {
    if (view.current) { cmd(view.current); view.current.focus() }
  }

  const menus: MenuDef[] = [
    {
      label: 'Archivo',
      items: [
        { label: 'Nuevo', onClick: doNew },
        { label: 'Abrir…', shortcut: 'Ctrl+O', onClick: doOpen },
        { label: 'Importar desde Word…', onClick: doPickDocx },
        { separator: true },
        { label: canSaveInPlace() ? 'Guardar' : 'Descargar', shortcut: 'Ctrl+S', onClick: () => doSave() },
        ...(canSaveInPlace() ? [{ label: 'Guardar como…', shortcut: 'Ctrl+Shift+S', onClick: () => doSave(true) }] : []),
        ...(recents.length
          ? [
              { separator: true },
              ...recents.slice(0, 6).map(r => ({ label: r.name, onClick: () => doOpenRecent(r) })),
              { label: 'Vaciar recientes', onClick: doForgetRecents },
            ]
          : []),
        { separator: true },
        { label: 'Metadatos…', onClick: () => setDialog({ kind: 'metadata' }) },
        { label: 'Puntos de control…', onClick: () => { refreshCheckpoints(); setDialog({ kind: 'checkpoints' }) } },
      ],
    },
    {
      label: 'Edición',
      items: [
        { label: 'Deshacer', shortcut: 'Ctrl+Z', disabled: !isText, onClick: runInEditor(undo) },
        { label: 'Rehacer', shortcut: 'Ctrl+Y', disabled: !isText, onClick: runInEditor(redo) },
        { separator: true },
        { label: 'Buscar en el libro…', shortcut: 'Ctrl+Shift+F', onClick: () => setDialog({ kind: 'search' }) },
        { label: 'Ir a un archivo…', shortcut: 'Ctrl+P', onClick: () => setDialog({ kind: 'files' }) },
        { label: 'Todos los comandos…', shortcut: 'Ctrl+K', onClick: () => setDialog({ kind: 'commands' }) },
        { label: 'Limpiar documento…', onClick: () => setDialog({ kind: 'tidy' }) },
        { label: 'Revisar el diálogo…', onClick: () => setDialog({ kind: 'dialogue' }) },
        { label: 'Sangrar este capítulo', disabled: !isDoc, onClick: () => doBeautify(active) },
        { label: 'Sangrar todo el libro', onClick: () => doBeautify() },
        { separator: true },
        { label: 'Pegar desde PDF…', onClick: () => setDialog({ kind: 'paste' }) },
        { label: 'Pegado inteligente', checked: smartPaste, onClick: () => setSmartPaste(v => !v) },
        { label: 'Pegar sin limpiar', shortcut: 'Ctrl+Shift+V', disabled: true },
      ],
    },
    {
      label: 'Insertar',
      items: [
        { label: 'Capítulo…', onClick: doNewChapter },
        { label: 'Archivos…', onClick: doAddFiles },
        { label: 'Optimizar imágenes…', onClick: () => setDialog({ kind: 'images' }) },
        { separator: true },
        { label: 'Nota al pie', shortcut: 'Ctrl+Alt+N', disabled: !isDoc, onClick: doFootnote },
        { label: 'Carácter especial…', disabled: !isText, onClick: () => setDialog({ kind: 'chars' }) },
        { separator: true },
        { label: 'Snippet…', onClick: () => setDialog({ kind: 'palette' }) },
        { label: 'Editar snippets…', onClick: () => setDialog({ kind: 'snippets' }) },
      ],
    },
    {
      label: 'Libro',
      items: [
        { label: 'Regenerar índice…', onClick: () => setDialog({ kind: 'toc' }) },
        { label: 'Página de índice visible', checked: !!visibleTocPath(book), onClick: doToggleVisibleToc },
        { separator: true },
        { label: 'Pasar las notas al final', onClick: doToEndnotes },
        { label: 'Devolver las notas al pie', disabled: !hasEndnotes, onClick: doToFootnotes },
        { label: 'Revisar las notas…', onClick: () => setDialog({ kind: 'notes' }) },
        { label: 'Duplicar este archivo', disabled: !activeFile, onClick: () => doDuplicate(active) },
        { label: 'Renombrar en serie…', onClick: () => setDialog({ kind: 'series' }) },
        { label: 'Partir capítulo…', disabled: !isDoc, onClick: () => setDialog({ kind: 'split', cursor: view.current?.state.selection.main.head ?? 0 }) },
        { separator: true },
        { label: 'Estilos de novela…', onClick: () => setDialog({ kind: 'novelStyle' }) },
        { label: 'Fuentes incrustadas…', onClick: () => setDialog({ kind: 'fonts' }) },
        { label: 'Ortografía del libro…', onClick: () => setDialog({ kind: 'spell' }) },
        { label: 'Plantillas de maquetación…', onClick: () => setDialog({ kind: 'templates' }) },
        { separator: true },
        { label: 'Enlaces y archivos sueltos…', onClick: () => setDialog({ kind: 'cleanup' }) },
        { label: 'Nombres del libro…', onClick: () => setDialog({ kind: 'names' }) },
        { label: 'Informe del libro…', onClick: () => setDialog({ kind: 'report' }) },
        { separator: true },
        { label: 'Preliminares y cortesía…', onClick: () => setDialog({ kind: 'frontMatter' }) },
        { label: 'Revisar el libro', onClick: doCheck },
        { label: 'Antes de publicar…', onClick: () => setDialog({ kind: 'release' }) },
      ],
    },
    {
      label: 'Vista',
      items: [
        { label: 'Tema oscuro', checked: theme === 'dark', onClick: () => setTheme(t => (t === 'dark' ? 'light' : 'dark')) },
        { label: 'Vista previa oscura', checked: paper === 'dark', onClick: () => setPreviewTheme(paper === 'dark' ? 'light' : 'dark') },
        { label: 'Subrayar la ortografía', checked: spellOn, onClick: () => setSpellOn(on => !on) },
        { separator: true },
        { label: 'Panel: vista previa', checked: pane === 'preview', onClick: () => setPane('preview') },
        { label: 'Panel: índice', checked: pane === 'toc', onClick: () => setPane('toc') },
        { separator: true },
        ...SHEETS.map(x => ({
          label: `Hoja ${x.label.toLowerCase()}`,
          checked: !device && sheet === x.id,
          onClick: () => { setDevice(''); setSheet(x.id) },
        })),
        { separator: true },
        ...DEVICES.map(d => ({ label: `Pantalla: ${d.label}`, checked: device === d.id, onClick: () => setDevice(d.id) })),
        { separator: true },
        { label: 'Acercar', disabled: zoom === ZOOMS[ZOOMS.length - 1], onClick: () => stepZoom(1) },
        { label: 'Alejar', disabled: zoom === ZOOMS[0], onClick: () => stepZoom(-1) },
        { label: 'Zoom al 100 %', disabled: zoom === 1, onClick: () => setZoom(1) },
        { separator: true },
        {
          label: 'Restablecer el ancho de los paneles',
          disabled: panes.sidebar == null && panes.preview == null,
          onClick: () => setPanes({ sidebar: null, preview: null }),
        },
        { separator: true },
        { label: 'Preferencias…', shortcut: 'Ctrl+,', onClick: () => setDialog({ kind: 'settings' }) },
        { label: 'Acerca de ShinNoberu…', onClick: () => setDialog({ kind: 'about' }) },
      ],
    },
  ]

  // Las paletas se arman con los mismos menús, para que no se desincronicen.
  const commandItems: QuickItem[] = menus.flatMap(m =>
    m.items
      .filter(it => !it.separator && it.label)
      .map(it => ({
        id: `${m.label}:${it.label}`,
        group: m.label,
        label: it.label!,
        hint: it.shortcut,
        disabled: it.disabled,
        run: () => it.onClick?.(),
      })),
  )

  const fileItems: QuickItem[] = [...book.files.values()]
    .filter(f => f.text != null || f.mediaType.startsWith('image/'))
    .map(f => ({
      id: f.path,
      group: dirname(f.path).split('/').pop() || undefined,
      label: f.path.split('/').pop()!,
      run: () => openFile(f.path),
    }))

  return (
    <div
      className="app"
      style={{ gridTemplateColumns: gridColumns(fitPanes(panes, viewport)) }}
      onDragOver={e => {
        if (!e.dataTransfer.types.includes('Files')) return
        e.preventDefault()
        setDropping(true)
      }}
      onDragLeave={e => { if (e.target === e.currentTarget) setDropping(false) }}
      onDrop={e => {
        if (!e.dataTransfer.types.includes('Files')) return
        e.preventDefault()
        setDropping(false)
        onDrop(e.dataTransfer.files)
      }}
    >
      <MenuBar
        menus={menus}
        brand={(
          <button className="brand" title="Acerca de ShinNoberu" onClick={() => setDialog({ kind: 'about' })}>
            <img src="/shinnoberu-barra.svg" alt="ShinNoberu" />
          </button>
        )}
      />

      <header className="toolbar">
        <button onClick={() => doSave()} title="Ctrl+S">{canSaveInPlace() ? 'Guardar' : 'Descargar'}</button>
        <button onClick={doNewChapter}>+ Capítulo</button>
        <button onClick={() => setDialog({ kind: 'paste' })}>Pegar desde PDF…</button>
        <button onClick={doCheck} title="Busca errores que rompen el EPUB">
          Revisar
          {problems.length > 0 && (
            <span className={`badge-count ${problemCount.errors ? 'bad' : 'warn'}`}>
              {problemCount.errors || problemCount.warnings}
            </span>
          )}
        </button>
        <div className="spacer" />
        <span className="book-name" title={savePath ?? fileName}>
          {dirty && <span className="dot">● </span>}{fileName}
        </span>
        <button
          className="icon-btn"
          title={theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
          onClick={() => setTheme(t => (t === 'dark' ? 'light' : 'dark'))}
        >
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} label="Cambiar de tema" />
        </button>
      </header>

      <aside className="sidebar" ref={sidebarRef}>
        <FileTree
          book={book}
          spine={spine}
          active={active}
          coverPath={coverPath}
          onOpen={openFile}
          onDelete={doDelete}
          onRename={doRename}
          onMoveSpine={doMoveSpine}
          onMoveSpineTo={doMoveSpineTo}
          onSetCover={doSetCover}
          onDuplicate={doDuplicate}
          onSplit={openSplit}
          onMerge={doMerge}
        />
      </aside>

      <Splitter
        area="split1"
        label="Ancho de la lista de archivos"
        current={() => sidebarRef.current?.offsetWidth ?? 236}
        onResize={w => setPanes(p => fitPanes({ ...p, sidebar: w }, viewport))}
        onReset={() => setPanes(p => ({ ...p, sidebar: null }))}
      />

      <main className="center">
        <Tabs book={book} open={openPaths} active={active} onPick={setActive} onClose={closeFile} />

        {nothingOpen ? (
          <div className="empty-center">
            <p className="empty">
              No hay ningún archivo abierto.<br />
              Elige uno en la lista de la izquierda.
            </p>
          </div>
        ) : (
          <>
            <div className="snippet-bar" aria-label="Snippets">
              {snippets.map(s => (
                <button key={s.name} disabled={!isText} title={s.key ? prettyKey(s.key) : s.name} onClick={() => {
                  const ready = prepareSnippet(s)
                  if (ready && view.current) applySnippet(view.current, ready)
                }}>
                  {s.name}
                </button>
              ))}
              <button disabled={!isDoc} title="Nota al pie numerada (Ctrl+Alt+N)" onClick={doFootnote}>
                <Icon name="note" size={13} /> Nota
              </button>
              <span className="sep" />
              <button className="icon-btn" onClick={() => setDialog({ kind: 'snippets' })} title="Editar snippets">
                <Icon name="gear" label="Editar snippets" />
              </button>
            </div>
            <div className="editor-wrap" hidden={!!imageUrl || !isText}>
              <Editor
                key={bookId}
                path={active}
                doc={activeFile?.text ?? ''}
                snippets={snippets}
                prepareSnippet={prepareSnippet}
                smartPaste={smartPaste}
                pasteOptions={pasteOptions}
                theme={theme}
                goto={goto}
                spellOn={spellOn}
                spellAccepted={spellAccepted}
                onSpellMenu={openSpellMenu}
                onChange={onChange}
                onCursor={setCursor}
                onReady={v => (view.current = v)}
              />
            </div>
            {imageUrl && (
              <div className="image-view">
                <img src={imageUrl} alt={active} />
                <p className="hint">{active}</p>
              </div>
            )}
          </>
        )}
      </main>

      <Splitter
        area="split2"
        label="Ancho de la vista previa"
        invert
        current={() => previewRef.current?.offsetWidth ?? 500}
        onResize={w => setPanes(p => fitPanes({ ...p, preview: w }, viewport))}
        onReset={() => setPanes(p => ({ ...p, preview: null }))}
      />

      <section className="preview-pane" aria-label="Vista previa e índice" ref={previewRef}>
        <div className="pane-title">
          <div className="seg" role="tablist" aria-label="Panel derecho">
            <button role="tab" aria-pressed={pane === 'preview'} onClick={() => setPane('preview')}>Vista previa</button>
            <button role="tab" aria-pressed={pane === 'toc'} onClick={() => setPane('toc')}>Índice</button>
          </div>
          <span className="label">{pane === 'preview' ? previewPath.split('/').pop() : `${toc.length} entradas`}</span>
          <div className="spacer" />
          {pane === 'preview' && (
            <>
              <select
                className="device-pick"
                aria-label="Cómo se ve la vista previa"
                value={device || `sheet:${sheet}`}
                onChange={e => {
                  const v = e.target.value
                  if (v.startsWith('sheet:')) { setDevice(''); setSheet(v.slice(6) as SheetId) }
                  else setDevice(v)
                }}
              >
                <optgroup label="Hoja">
                  {SHEETS.map(s => <option key={s.id} value={`sheet:${s.id}`}>{s.label}</option>)}
                </optgroup>
                <optgroup label="Pantalla">
                  {DEVICES.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
                </optgroup>
              </select>
              <button
                className="icon-btn"
                title={paper === 'dark' ? 'Ver la vista previa en claro' : 'Ver la vista previa en oscuro'}
                onClick={() => setPreviewTheme(paper === 'dark' ? 'light' : 'dark')}
              >
                <Icon name={paper === 'dark' ? 'sun' : 'moon'} label="Modo de la vista previa" />
              </button>
              <div className="seg" role="group" aria-label="Zoom">
                <button title="Alejar" disabled={zoom === ZOOMS[0]} onClick={() => stepZoom(-1)}>−</button>
                <button title="Volver al 100%" onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</button>
                <button title="Acercar" disabled={zoom === ZOOMS[ZOOMS.length - 1]} onClick={() => stepZoom(1)}>+</button>
              </div>
            </>
          )}
        </div>

        {pane === 'preview' ? (
          <div
            className="preview-wrap"
            style={{ ['--sheet' as string]: sheetCss, ['--paper' as string]: PREVIEW_COLORS[paper].bg }}
          >
            <Preview key={`${bookId}:${previewPath}`} html={previewHtml} hash={hash} onNavigate={navigate} device={screen} />
          </div>
        ) : (
          <TocPanel entries={toc} active={active} onGo={navigate} />
        )}
      </section>

      <footer className="statusbar">
        <span className="path">{active}</span>
        {isText && <span>Ln {cursor.line}, Col {cursor.col}</span>}
        {charAt && (
          <span className={charAt.invisible ? 'char-info invisible' : 'char-info'} title={`Carácter bajo el cursor: ${charAt.hex}`}>
            {charAt.label} ({charAt.hex})
          </span>
        )}
        {isDoc && <span>{activeWords.toLocaleString()} palabras</span>}
        {isText && <span>{activeFile!.text!.length.toLocaleString()} caracteres</span>}
        {totalWords > 0 && <span>Libro: {totalWords.toLocaleString()} palabras</span>}
        {status && <span className="flash">{status}</span>}
        <div className="spacer" />
        <span>Ctrl+K snippets · Ctrl+Shift+F buscar · Ctrl+Alt+N nota · Ctrl+W cerrar</span>
        <span title={canSaveInPlace()
          ? 'Guardar escribe encima del .epub abierto'
          : 'Este navegador no puede escribir en el archivo: cada guardado descarga una copia'}
        >
          {inTauri() ? 'Escritorio' : 'Navegador'} · {canSaveInPlace() ? 'guarda en el archivo' : 'descarga'}
        </span>
      </footer>

      {undoOffer && (
        <UndoBar offer={undoOffer} onUndo={undoBulk} onDismiss={() => setUndoOffer(null)} />
      )}

      {dropping && (
        <div className="drop-overlay">
          <div className="drop-card">
            <strong>Suelta para añadir al libro</strong>
            <span className="hint">Un .epub solo lo abre; lo demás se añade como imagen, estilo o fuente.</span>
          </div>
        </div>
      )}

      {draft && <RecoverDialog draft={draft} onRecover={doRecover} onDiscard={doDiscardDraft} />}

      {dialog?.kind === 'paste' && (
        <PasteDialog
          options={pasteOptions}
          onOptions={setPasteOptions}
          onClose={() => setDialog(null)}
          onInsert={html => { setDialog(null); requestAnimationFrame(() => insertHtml(html)) }}
        />
      )}
      {dialog?.kind === 'palette' && <Palette snippets={snippets} onPick={runSnippet} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'snippets' && (
        <SnippetsDialog
          snippets={snippets}
          onClose={() => setDialog(null)}
          onReset={() => { setSnippets(resetSnippets()); setDialog(null) }}
          onSave={list => { saveSnippets(list); setSnippets(list); setDialog(null) }}
        />
      )}
      {dialog?.kind === 'metadata' && (
        <MetadataDialog
          initial={readMetadata(book)}
          images={images}
          coverPath={coverPath}
          coverUrl={coverUrl}
          onCover={doSetCover}
          onClearCover={doClearCover}
          onAddImage={doAddCoverImage}
          onSave={saveMetadata}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'problems' && (
        <ProblemsDialog
          problems={problems}
          onRecheck={() => setProblems(validateBook(book))}
          onGo={goProblem}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'search' && (
        <SearchDialog
          book={book}
          rev={rev}
          options={searchOptions}
          onOptions={setSearchOptions}
          onGo={m => jump(m.path, m.from, m.to)}
          onReplaceOne={doReplaceOne}
          onReplaceAll={doReplaceAll}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'series' && (
        <SeriesDialog book={book} rev={rev} onApply={doSeries} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === 'toc' && (
        <TocDialog book={book} rev={rev} onApply={doToc} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === 'split' && (
        <SplitDialog
          book={book}
          path={active}
          rev={rev}
          cursor={dialog.cursor}
          onApply={doSplit}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'checkpoints' && (
        <CheckpointsDialog
          list={checkpoints}
          now={{ files: book.files.size, words: totalWords }}
          onCreate={doCreateCheckpoint}
          onRestore={doRestoreCheckpoint}
          onCompare={meta => setDialog({ kind: 'compare', meta })}
          onDelete={doDeleteCheckpoint}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'tidy' && (
        <TidyDialog
          book={book}
          rev={rev}
          activePath={isDoc ? active : undefined}
          onApply={doTidy}
          onClose={() => setDialog(null)}
        />
      )}
      {spellMenu && <ContextMenu target={spellMenu} onClose={() => setSpellMenu(null)} />}
      {dialog?.kind === 'spell' && (
        <SpellDialog
          book={book}
          rev={rev}
          accepted={spellAccepted}
          onJump={jump}
          onReplace={doReplaceWord}
          onAccept={acceptWord}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'fonts' && (
        <FontsDialog
          book={book}
          onPick={() => pickFiles('.ttf,.otf,.woff,.woff2')}
          onApply={doFonts}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'novelStyle' && (
        <NovelStyleDialog book={book} onApply={doNovelStyle} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === 'cleanup' && (
        <CleanupDialog
          book={book}
          rev={rev}
          onDelete={doCleanupDelete}
          onFix={doCleanupFix}
          onGo={jump}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'names' && (
        <NamesDialog
          book={book}
          rev={rev}
          onUnify={doUnifyName}
          onGo={jump}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'report' && (
        <ReportDialog
          book={book}
          rev={rev}
          onOpen={p => { setDialog(null); openFile(p) }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'templates' && (
        <TemplateDialog
          key={templatesRev}
          book={book}
          onApply={doApplyTemplate}
          onExport={doExportTemplates}
          onImport={doImportTemplates}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'release' && (
        <ReleaseDialog book={book} rev={rev} onOpen={openFromRelease} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === 'about' && <AboutDialog onClose={() => setDialog(null)} />}
      {dialog?.kind === 'notes' && (
        <NotesDialog book={book} rev={rev} onGo={jump} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === 'dialogue' && (
        <DialogueDialog
          book={book}
          rev={rev}
          onFix={doFixDialogue}
          onGo={jump}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'docx' && (
        <DocxDialog
          doc={dialog.doc}
          fileName={dialog.fileName}
          canAppend={spine.length > 0}
          onApply={(chapters, mode, title) => doImportDocx(dialog.doc, chapters, mode, title)}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'frontMatter' && (
        <FrontMatterDialog book={book} onApply={doFrontMatter} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === 'chars' && (
        <CharsDialog onInsert={insertChar} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === 'compare' && (
        <CompareDialog
          book={book}
          meta={dialog.meta}
          onRestore={() => doRestoreCheckpoint(dialog.meta)}
          onClose={() => setDialog({ kind: 'checkpoints' })}
        />
      )}
      {dialog?.kind === 'images' && (
        <ImagesDialog book={book} rev={rev} onApply={doOptimizeImages} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === 'files' && (
        <QuickOpen
          title="Ir a un archivo"
          placeholder="Escribe parte del nombre… (↑↓ y Enter)"
          items={fileItems}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'pickVar' && (
        <QuickOpen
          key={dialog.ask.name}
          title={`{${dialog.ask.name}}: ¿qué archivo?`}
          placeholder="Escribe parte del nombre… (↑↓ y Enter)"
          items={[
            // El que se puede deducir va primero, para que baste con Enter.
            ...(dialog.ask.suggested ? [dialog.ask.suggested] : []),
            ...dialog.ask.choices.filter(p => p !== dialog.ask.suggested),
          ].map(p => {
            const text = book.files.get(p)?.text ?? ''
            return {
              id: p,
              group: p === dialog.ask.suggested ? 'propuesto' : undefined,
              label: `${p.split('/').pop()} · ${titleOf(text, p)}`,
              run: () => continueSnippet(dialog.ask.then(p)),
            }
          })}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'commands' && (
        <QuickOpen
          title="Comandos"
          placeholder="Qué quieres hacer… (↑↓ y Enter)"
          items={commandItems}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'settings' && (
        <SettingsDialog
          settings={settings}
          theme={theme}
          onChange={setSettings}
          onTheme={setTheme}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'prompt' && (
        <PromptDialog title={dialog.title} label={dialog.label} initial={dialog.initial} onSubmit={dialog.onSubmit} onClose={() => setDialog(null)} />
      )}
    </div>
  )
}
