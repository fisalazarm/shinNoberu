import { useEffect, useMemo, useRef, useState } from 'react'
import Modal from './Modal'
import type { EpubBook } from '../lib/epub'
import {
  isFontPath, missingStyles, readFontInfo, readFontSetup, WEIGHTS,
  type Face, type FontChanges, type FontInfo, type FontRoles,
} from '../lib/fonts'

interface Picked {
  name: string
  bytes: Uint8Array
}

interface Props {
  book: EpubBook
  onPick: () => Promise<Picked[]>
  onApply: (changes: FontChanges) => void
  onClose: () => void
}

interface Row {
  key: string
  /** Ruta en el libro; las nuevas no la tienen todavía. */
  path?: string
  file: string
  bytes: Uint8Array
  family: string
  weight: number
  italic: boolean
  info?: FontInfo
  removed: boolean
  /** Declarada a mano en otra hoja: se puede usar pero no se toca. */
  external: boolean
}

const kb = (n: number) => `${Math.max(1, Math.round(n / 1024))} KB`

const LICENSE: Record<FontInfo['embedding'], { text: string; bad?: boolean; unsure?: boolean } | null> = {
  installable: null,
  editable: null,
  preview: null,
  restricted: { text: 'Su licencia no permite incrustarla', bad: true },
  unknown: { text: 'No se pudo leer su licencia: revísala tú', unsure: true },
}

let seq = 0

const snapshot = (rows: Row[], roles: FontRoles) =>
  JSON.stringify([rows.map(r => [r.path, r.family, r.weight, r.italic, r.removed]), roles])

export default function FontsDialog(props: Props) {
  const setup = useMemo(() => readFontSetup(props.book), [props.book])
  const [rows, setRows] = useState<Row[]>(() => {
    const of = (f: Face, external: boolean): Row => ({
      key: `r${++seq}`,
      path: f.path,
      file: f.path.split('/').pop()!,
      bytes: props.book.files.get(f.path)?.bytes ?? new Uint8Array(),
      family: f.family,
      weight: f.weight,
      italic: f.italic,
      removed: false,
      external,
    })
    return [...setup.faces.map(f => of(f, false)), ...setup.external.map(f => of(f, true))]
  })
  const [roles, setRoles] = useState<FontRoles>(setup.roles)
  const [busy, setBusy] = useState(false)
  // Para saber si hay algo que aplicar: lo de ahora frente a lo de al abrir.
  const [initial] = useState(() => snapshot(rows, roles))

  // Los datos de cada archivo (licencia sobre todo) se leen en segundo plano.
  useEffect(() => {
    let alive = true
    for (const r of rows) {
      if (r.info || !r.bytes.length) continue
      readFontInfo(r.bytes, r.file).then(info => {
        if (alive) setRows(list => list.map(x => (x.key === r.key ? { ...x, info } : x)))
      })
    }
    return () => { alive = false }
  }, [rows.length])

  // La muestra usa las fuentes de verdad: se cargan en el documento con un
  // nombre propio para no chocar con nada de la app.
  const loaded = useRef(new Map<string, FontFace>())
  const [fontsRev, setFontsRev] = useState(0)
  const live = rows.filter(r => !r.removed)
  const sig = live.map(r => `${r.key}:${r.family}:${r.weight}:${r.italic}`).join('|')
  useEffect(() => {
    const want = new Map(live.map(r => [`${r.key}:${r.family}:${r.weight}:${r.italic}`, r]))
    for (const [k, face] of loaded.current) {
      if (!want.has(k)) { document.fonts.delete(face); loaded.current.delete(k) }
    }
    const pending: Promise<unknown>[] = []
    for (const [k, r] of want) {
      if (loaded.current.has(k) || !r.bytes.length) continue
      try {
        const face = new FontFace(`muestra ${r.family}`, r.bytes.slice().buffer, {
          weight: String(r.weight),
          style: r.italic ? 'italic' : 'normal',
        })
        loaded.current.set(k, face)
        document.fonts.add(face)
        pending.push(face.load().catch(() => null))
      } catch { /* una fuente rota no tumba la ventana */ }
    }
    if (pending.length) Promise.all(pending).then(() => setFontsRev(n => n + 1))
  }, [sig])
  useEffect(() => () => { for (const f of loaded.current.values()) document.fonts.delete(f) }, [])

  const families = [...new Set(live.map(r => r.family))].sort((a, b) => a.localeCompare(b))
  const allFaces: Face[] = live.map(r => ({ path: r.path ?? r.file, family: r.family, weight: r.weight, italic: r.italic }))
  const used = new Set([roles.body, roles.headings, roles.dropCap].filter(Boolean))

  const patch = (key: string, changes: Partial<Row>) =>
    setRows(list => list.map(r => (r.key === key ? { ...r, ...changes } : r)))

  const add = async () => {
    setBusy(true)
    try {
      const picked = (await props.onPick()).filter(p => isFontPath(p.name))
      const fresh: Row[] = []
      for (const p of picked) {
        const info = await readFontInfo(p.bytes, p.name)
        fresh.push({
          key: `r${++seq}`, file: p.name, bytes: p.bytes, family: info.family, weight: info.weight,
          italic: info.italic, info, removed: false, external: false,
        })
      }
      if (!fresh.length) return
      setRows(list => [...list, ...fresh])
      // La primera fuente que entra se usa para el texto: es lo que se busca casi siempre.
      if (!roles.body && !families.length) setRoles(r => ({ ...r, body: fresh[0].family }))
    } finally {
      setBusy(false)
    }
  }

  const apply = () => {
    props.onApply({
      faces: rows.filter(r => r.path && !r.external && !r.removed)
        .map(r => ({ path: r.path!, family: r.family.trim(), weight: r.weight, italic: r.italic })),
      remove: rows.filter(r => r.path && r.removed).map(r => r.path!),
      add: rows.filter(r => !r.path && !r.removed)
        .map(r => ({ name: r.file, bytes: r.bytes, family: r.family.trim(), weight: r.weight, italic: r.italic })),
      roles,
    })
  }

  const bodyMissing = roles.body ? missingStyles(allFaces, roles.body) : []
  const restricted = live.filter(r => r.info?.embedding === 'restricted')
  const changed = snapshot(rows, roles) !== initial

  const sample = (family: string) => (family ? `"muestra ${family}", ${roles.fallback}` : roles.fallback)
  const roleSelect = (k: keyof Omit<FontRoles, 'fallback'>, label: string, none: string) => (
    <label className="field">
      {label}
      <select value={roles[k]} onChange={e => setRoles(r => ({ ...r, [k]: e.target.value }))}>
        <option value="">{none}</option>
        {families.map(f => <option key={f} value={f}>{f}</option>)}
      </select>
    </label>
  )

  return (
    <Modal title="Fuentes incrustadas" onClose={props.onClose} wide className="fonts-dialog">
      <div className="fonts-body">
        <section className="fonts-files">
          <div className="fonts-head">
            <span className="lbl">Archivos de fuente</span>
            <button onClick={add} disabled={busy}>{busy ? 'Leyendo…' : 'Añadir fuentes…'}</button>
          </div>
          {rows.length === 0 && (
            <p className="hint">
              El libro no lleva fuentes: el lector usa las suyas. Añade los archivos .ttf, .otf,
              .woff o .woff2 de la familia (normal, cursiva, negrita y negrita cursiva).
            </p>
          )}
          <ul className="font-rows">
            {rows.map(r => {
              const lic = r.info ? LICENSE[r.info.embedding] : null
              return (
                <li key={r.key} className={r.removed ? 'removed' : ''}>
                  <div className="font-row-top">
                    <input
                      className="font-family"
                      value={r.family}
                      disabled={r.removed || r.external}
                      aria-label={`Familia de ${r.file}`}
                      onChange={e => patch(r.key, { family: e.target.value })}
                    />
                    <select
                      value={r.weight}
                      disabled={r.removed || r.external}
                      aria-label={`Grosor de ${r.file}`}
                      onChange={e => patch(r.key, { weight: Number(e.target.value) })}
                    >
                      {WEIGHTS.map(w => <option key={w.value} value={w.value}>{w.value} · {w.label}</option>)}
                    </select>
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={r.italic}
                        disabled={r.removed || r.external}
                        onChange={e => patch(r.key, { italic: e.target.checked })}
                      />
                      Cursiva
                    </label>
                    <button
                      className="ghost"
                      disabled={r.external}
                      title={r.external ? 'Está declarada a mano en otra hoja' : undefined}
                      onClick={() => (r.path ? patch(r.key, { removed: !r.removed }) : setRows(l => l.filter(x => x.key !== r.key)))}
                    >
                      {r.removed ? 'Recuperar' : 'Quitar'}
                    </button>
                  </div>
                  <div className="font-row-meta">
                    <span
                      className="font-sample"
                      style={{ fontFamily: sample(r.family), fontWeight: r.weight, fontStyle: r.italic ? 'italic' : 'normal' }}
                    >
                      Aa Ññ ¿?
                    </span>
                    <code>{r.file}</code>
                    <span>{kb(r.bytes.length)}</span>
                    {!r.path && <span className="tag">nueva</span>}
                    {r.external && <span className="tag">declarada a mano</span>}
                    {!r.removed && !used.has(r.family) && !r.external && <span className="tag muted-tag">sin usar</span>}
                    {lic && <span className={lic.bad ? 'tag bad' : 'tag unsure'} title={r.info?.license}>{lic.text}</span>}
                    {!lic && r.info?.license && <span className="lic" title={r.info.license}>licencia: {r.info.license}</span>}
                  </div>
                </li>
              )
            })}
          </ul>
        </section>

        <section className="fonts-use">
          <span className="lbl">Dónde se usan</span>
          <div className="fonts-roles">
            {roleSelect('body', 'Texto', 'La del lector')}
            {roleSelect('headings', 'Títulos', 'Como el texto')}
            {roleSelect('dropCap', 'Capitular', 'Como el texto')}
            <label className="field">
              Si no carga
              <select value={roles.fallback} onChange={e => setRoles(r => ({ ...r, fallback: e.target.value as FontRoles['fallback'] }))}>
                <option value="serif">Una con serifa</option>
                <option value="sans-serif">Una sin serifa</option>
              </select>
            </label>
          </div>

          <div className="fonts-preview" data-rev={fontsRev}>
            <h3 style={{ fontFamily: sample(roles.headings || roles.body) }}>Capítulo uno</h3>
            <p style={{ fontFamily: sample(roles.body) }}>
              <span className="drop" style={{ fontFamily: sample(roles.dropCap || roles.body) }}>L</span>
              a niebla subía desde el puerto cuando <i>Elena</i> abrió la carta. —¿Otra vez tú?
              —preguntó, y la palabra <b>nunca</b> se le quedó atravesada.
            </p>
          </div>

          {bodyMissing.length > 0 && (
            <p className="hint warn-text">
              A «{roles.body}» le falta {bodyMissing.join(', ')}: el lector la imitará inclinando o
              engordando la normal, y se nota. Añade esos archivos si la familia los tiene.
            </p>
          )}
          {restricted.length > 0 && (
            <p className="hint error-text">
              {restricted.map(r => r.file).join(', ')}: la licencia no permite incrustarla. Usa
              otra o consigue una licencia para ebooks.
            </p>
          )}
          <p className="hint">
            Kindle, Kobo y Apple Books respetan las fuentes del libro, pero quien lee puede
            cambiarlas por las suyas. En Kobo hay que elegir «Por defecto del editor».
          </p>
        </section>
      </div>

      <footer>
        <span className="hint">
          {live.length} archivo{live.length === 1 ? '' : 's'} · {kb(live.reduce((n, r) => n + r.bytes.length, 0))}
        </span>
        <button className="ghost" onClick={props.onClose}>Cancelar</button>
        <button className="primary" disabled={!changed} onClick={apply}>Aplicar</button>
      </footer>
    </Modal>
  )
}
