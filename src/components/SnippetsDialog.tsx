import { useEffect, useRef, useState } from 'react'
import Modal from './Modal'
import Icon from './Icon'
import { keyFromEvent, prettyKey, snippetPreview, type Snippet, type VarRule } from '../lib/snippets'
import { snippetVars, VAR_RULES } from '../lib/snippetFill'

interface Props {
  snippets: Snippet[]
  onSave: (s: Snippet[]) => void
  onReset: () => void
  onClose: () => void
}

type Mode = 'list' | 'json'

const BLANK: Snippet = { name: 'Nuevo snippet', wrap: ['<span>', '</span>'] }

export default function SnippetsDialog(props: Props) {
  const [mode, setMode] = useState<Mode>('list')
  const [list, setList] = useState<Snippet[]>(props.snippets)
  const [text, setText] = useState(() => JSON.stringify(props.snippets, null, 2))
  const [sel, setSel] = useState(0)
  const [error, setError] = useState('')
  const listRef = useRef<HTMLUListElement>(null)

  const current = list[sel]

  // Al añadir uno, el nuevo queda al final: hay que ir a verlo.
  useEffect(() => {
    listRef.current?.querySelector('li.active')?.scrollIntoView({ block: 'nearest' })
  }, [sel, list.length])

  const patch = (changes: Partial<Snippet>) =>
    setList(l => l.map((s, i) => (i === sel ? { ...s, ...changes } : s)))

  const setRule = (name: string, rule: VarRule) =>
    patch({ vars: { ...current.vars, [name]: rule } })

  const vars = current ? snippetVars(current) : []

  const move = (delta: number) => {
    const to = sel + delta
    if (to < 0 || to >= list.length) return
    const next = [...list]
    ;[next[sel], next[to]] = [next[to], next[sel]]
    setList(next)
    setSel(to)
  }

  const add = () => {
    setList(l => [...l, { ...BLANK }])
    setSel(list.length)
  }

  const remove = () => {
    setList(l => l.filter((_, i) => i !== sel))
    setSel(s => Math.max(0, Math.min(s, list.length - 2)))
  }

  /** Al cambiar de modo hay que llevarse los cambios al otro. */
  const switchTo = (next: Mode) => {
    setError('')
    if (next === mode) return
    if (next === 'json') {
      setText(JSON.stringify(list, null, 2))
      return setMode('json')
    }
    const parsed = parseJson(text)
    if (typeof parsed === 'string') return setError(parsed)
    setList(parsed)
    setSel(s => Math.min(s, Math.max(0, parsed.length - 1)))
    setMode('list')
  }

  const save = () => {
    if (mode === 'json') {
      const parsed = parseJson(text)
      if (typeof parsed === 'string') return setError(parsed)
      return props.onSave(parsed)
    }
    const bad = list.find(s => !s.name.trim())
    if (bad) return setError('Todos los snippets necesitan un nombre.')
    props.onSave(list)
  }

  // Dos snippets con el mismo atajo: solo saltaría el primero.
  const clash = current?.key
    ? list.find((s, i) => i !== sel && s.key === current.key)
    : undefined

  return (
    <Modal title="Mis snippets" onClose={props.onClose} wide>
      <div className="seg" role="tablist" aria-label="Modo de edición">
        <button role="tab" aria-pressed={mode === 'list'} onClick={() => switchTo('list')}>Ventana</button>
        <button role="tab" aria-pressed={mode === 'json'} onClick={() => switchTo('json')}>JSON</button>
      </div>

      {mode === 'json' ? (
        <>
          <p className="hint">
            Cada snippet tiene <code>name</code>, opcionalmente <code>key</code> (p. ej.{' '}
            <code>Mod-Shift-q</code>; Mod = Ctrl), y <code>wrap: ["&lt;abre&gt;", "&lt;/cierra&gt;"]</code>{' '}
            para envolver la selección o <code>insert</code> para insertar un bloque.{' '}
            <code>|</code> marca dónde queda el cursor.{' '}
            <code>{'{}'}</code> se cambia por el número de la siguiente nota del libro: con dos
            cifras dentro de <code>&lt;sup&gt;</code> (03) y solo fuera (3). <code>{'{n}'}</code> es
            siempre el número solo y <code>{'{nn}'}</code> siempre con dos cifras. Una palabra en
            mayúsculas entre llaves, como <code>{'{CAPNOTA}'}</code>, es una variable; su regla va en{' '}
            <code>{'"vars": { "CAPNOTA": "noteChapter" }'}</code>, con <code>noteChapter</code>,{' '}
            <code>lastChapter</code>, <code>current</code>, <code>ask</code> o{' '}
            <code>{'{ "text": "…" }'}</code>.
          </p>
          <textarea className="code" value={text} onChange={e => setText(e.target.value)} spellCheck={false} />
        </>
      ) : (
        <div className="snip-grid">
          <div className="snip-list">
            <ul ref={listRef}>
              {list.map((s, i) => (
                <li key={i} className={i === sel ? 'active' : ''}>
                  <button onClick={() => setSel(i)}>
                    <span className="name">{s.name || '(sin nombre)'}</span>
                    {s.key && <kbd>{prettyKey(s.key)}</kbd>}
                  </button>
                </li>
              ))}
            </ul>
            {!list.length && <p className="empty">No hay ningún snippet.</p>}
            <button className="snip-add" onClick={add}>+ Añadir snippet</button>
          </div>

          {current ? (
            <div className="snip-form">
              <label className="field">
                Nombre
                <input
                  value={current.name}
                  onChange={e => patch({ name: e.target.value })}
                  placeholder="Cómo se llama en la barra"
                />
              </label>

              <label className="field">
                Atajo
                <span className="snip-key">
                  <input
                    readOnly
                    data-keycapture="true"
                    value={current.key ? prettyKey(current.key) : ''}
                    placeholder="Pulsa aquí y luego la combinación…"
                    onKeyDown={e => {
                      e.preventDefault()
                      if (e.key === 'Backspace' || e.key === 'Delete') return patch({ key: undefined })
                      const k = keyFromEvent(e)
                      if (k) patch({ key: k })
                    }}
                  />
                  <button className="ghost" disabled={!current.key} onClick={() => patch({ key: undefined })}>
                    Quitar
                  </button>
                </span>
              </label>
              {clash && <p className="error">Ese atajo ya lo usa «{clash.name}»; solo saltaría uno.</p>}

              <div className="radio-list">
                <label>
                  <input
                    type="radio"
                    name="snip-kind"
                    checked={!!current.wrap}
                    onChange={() => patch({ wrap: ['<em>', '</em>'], insert: undefined })}
                  />
                  <span className="what">
                    <strong>Envolver la selección</strong>
                    <span className="hint">Rodea lo que tengas seleccionado. Con varias líneas, envuelve cada una.</span>
                  </span>
                </label>
                <label>
                  <input
                    type="radio"
                    name="snip-kind"
                    checked={!current.wrap}
                    onChange={() => patch({ wrap: undefined, insert: current.insert ?? '' })}
                  />
                  <span className="what">
                    <strong>Insertar un bloque</strong>
                    <span className="hint">Mete un trozo de texto donde esté el cursor.</span>
                  </span>
                </label>
              </div>

              {current.wrap ? (
                <div className="snip-pair">
                  <label className="field">
                    Apertura
                    <input
                      value={current.wrap[0]}
                      onChange={e => patch({ wrap: [e.target.value, current.wrap![1]] })}
                    />
                  </label>
                  <label className="field">
                    Cierre
                    <input
                      value={current.wrap[1]}
                      onChange={e => patch({ wrap: [current.wrap![0], e.target.value] })}
                    />
                  </label>
                </div>
              ) : (
                <label className="field">
                  Texto
                  <textarea
                    className="snip-text"
                    value={current.insert ?? ''}
                    onChange={e => patch({ insert: e.target.value })}
                    spellCheck={false}
                  />
                </label>
              )}

              {vars.length > 0 && (
                <div className="field">
                  <span className="lbl">
                    Variables
                    <span className="hint">qué va en cada palabra en mayúsculas entre llaves</span>
                  </span>
                  <div className="snip-vars">
                    {vars.map(name => {
                      const rule = current.vars?.[name] ?? 'ask'
                      const fixed = typeof rule === 'object'
                      return (
                        <div key={name} className="snip-var">
                          <code>{`{${name}}`}</code>
                          <select
                            aria-label={`Regla de ${name}`}
                            value={fixed ? 'text' : rule}
                            onChange={e => setRule(name, e.target.value === 'text'
                              ? { text: '' }
                              : (e.target.value as VarRule))}
                          >
                            {VAR_RULES.map(r => <option key={r.rule} value={r.rule}>{r.label}</option>)}
                            <option value="text">Texto fijo</option>
                          </select>
                          {fixed && (
                            <input
                              value={rule.text}
                              placeholder="Lo que va siempre"
                              onChange={e => setRule(name, { text: e.target.value })}
                            />
                          )}
                        </div>
                      )
                    })}
                  </div>
                  <p className="hint">
                    «Capítulo de la nota» busca la primera llamada que todavía no tiene su nota y
                    pone su capítulo; si no hay ninguna, te pregunta. «Elegir de la lista» te enseña
                    los archivos del libro cada vez.
                  </p>
                </div>
              )}

              <div className="field">
                Así queda <span className="hint">│ es donde acaba el cursor</span>
                <pre className="snip-preview">{snippetPreview(current)}</pre>
              </div>

              <div className="snip-actions">
                <button className="ghost" disabled={sel === 0} onClick={() => move(-1)}>
                  <Icon name="up" /> Subir
                </button>
                <button className="ghost" disabled={sel === list.length - 1} onClick={() => move(1)}>
                  <Icon name="down" /> Bajar
                </button>
                <div className="spacer" />
                <button className="ghost danger" onClick={remove}>
                  <Icon name="trash" /> Eliminar
                </button>
              </div>
            </div>
          ) : (
            <p className="empty">Añade uno para empezar.</p>
          )}
        </div>
      )}

      {error && <p className="error">{error}</p>}

      <footer>
        <button className="ghost" onClick={props.onReset}>Restaurar los de fábrica</button>
        <button className="ghost" onClick={props.onClose}>Cancelar</button>
        <button className="primary" onClick={save}>Guardar</button>
      </footer>
    </Modal>
  )
}

/** Devuelve la lista, o el mensaje de por qué no se pudo leer. */
function parseJson(text: string): Snippet[] | string {
  try {
    const list = JSON.parse(text)
    if (!Array.isArray(list) || list.some(s => !s?.name || !(s.wrap || s.insert != null))) {
      return 'Cada snippet necesita "name" y "wrap" o "insert".'
    }
    return list as Snippet[]
  } catch (e) {
    return e instanceof Error ? e.message : String(e)
  }
}
