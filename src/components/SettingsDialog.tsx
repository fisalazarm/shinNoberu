import { useState } from 'react'
import Modal from './Modal'
import {
  asHexColor, COLOR_TOKENS, countOverrides, emptySettings, FONT_PRESETS, FONT_TOKENS,
  pruneSettings, readToken, SIZE_TOKENS, SYNTAX_TOKENS, type Settings, type TokenInfo,
} from '../lib/settings'
import type { Theme } from '../lib/theme'

interface Props {
  settings: Settings
  /** Tema que se está editando; los colores se guardan por separado en cada uno. */
  theme: Theme
  onChange: (s: Settings) => void
  onTheme: (t: Theme) => void
  onClose: () => void
}

type Tab = 'type' | 'ui' | 'syntax' | 'json'

const TABS: { id: Tab; label: string }[] = [
  { id: 'type', label: 'Tipografía' },
  { id: 'ui', label: 'Interfaz' },
  { id: 'syntax', label: 'Sintaxis' },
  { id: 'json', label: 'JSON' },
]

export default function SettingsDialog(props: Props) {
  const [tab, setTab] = useState<Tab>('type')
  const [text, setText] = useState(() => JSON.stringify(props.settings, null, 2))
  const [error, setError] = useState('')

  const s = props.settings
  const other: Theme = props.theme === 'dark' ? 'light' : 'dark'

  /** Los colores viven en el tema activo; las tipografías, en común. */
  const setToken = (token: string, value: string, where: 'common' | Theme) =>
    props.onChange({ ...s, [where]: { ...s[where], [token]: value } })

  const clearToken = (token: string, where: 'common' | Theme) => {
    const next = { ...s[where] }
    delete next[token]
    props.onChange({ ...s, [where]: next })
  }

  const goTo = (next: Tab) => {
    setError('')
    if (next === tab) return
    // Al salir del JSON se recoge lo escrito; si no compila, no se sale.
    if (tab === 'json') {
      const parsed = parseJson(text)
      if (typeof parsed === 'string') return setError(parsed)
      props.onChange(parsed)
    }
    if (next === 'json') setText(JSON.stringify(s, null, 2))
    setTab(next)
  }

  const applyJson = () => {
    const parsed = parseJson(text)
    if (typeof parsed === 'string') return setError(parsed)
    setError('')
    props.onChange(parsed)
  }

  const reset = () => {
    props.onChange({ ...emptySettings })
    setText(JSON.stringify(emptySettings, null, 2))
    setError('')
  }

  /** Rejilla de colores; todos se guardan en el tema que se esté editando. */
  const colors = (list: TokenInfo[]) => (
    <div className="prefs-colors">
      {list.map(c => {
        const current = s[props.theme][c.token]
        return (
          <label key={c.token} className={`prefs-color ${current ? 'set' : ''}`}>
            <input
              type="color"
              value={asHexColor(current ?? readToken(c.token))}
              onChange={e => setToken(c.token, e.target.value, props.theme)}
            />
            <span className="what">
              <span className="name">{c.label}</span>
              <span className="hint">{c.hint ?? current ?? readToken(c.token)}</span>
            </span>
            {current && (
              <button
                className="icon-btn"
                title="Volver al del tema"
                onClick={e => { e.preventDefault(); clearToken(c.token, props.theme) }}
              >
                ×
              </button>
            )}
          </label>
        )
      })}
    </div>
  )

  const themeHeader = (
    <h3>
      Tema {props.theme === 'dark' ? 'oscuro' : 'claro'}
      <button className="ghost" onClick={() => props.onTheme(other)}>
        Editar el {other === 'dark' ? 'oscuro' : 'claro'}
      </button>
    </h3>
  )

  const n = countOverrides(s)

  return (
    <Modal title="Preferencias" onClose={props.onClose} className="form">
      <div className="seg" role="tablist" aria-label="Secciones">
        {TABS.map(x => (
          <button key={x.id} role="tab" aria-pressed={tab === x.id} onClick={() => goTo(x.id)}>
            {x.label}
          </button>
        ))}
      </div>

      {tab === 'type' && (
        <section className="prefs-group">
          {FONT_TOKENS.map(f => (
            <label key={f.token} className="field">
              <span className="lbl">{f.label} {f.hint && <span className="hint">{f.hint}</span>}</span>
              <span className="prefs-row">
                <select
                  value={FONT_PRESETS[f.token].some(p => p.value === s.common[f.token]) ? s.common[f.token] : ''}
                  onChange={e => (e.target.value ? setToken(f.token, e.target.value, 'common') : clearToken(f.token, 'common'))}
                >
                  <option value="">— del tema —</option>
                  {FONT_PRESETS[f.token].map(p => (
                    <option key={p.label} value={p.value}>{p.label}</option>
                  ))}
                </select>
                <input
                  value={s.common[f.token] ?? ''}
                  placeholder={readToken(f.token)}
                  onChange={e => (e.target.value ? setToken(f.token, e.target.value, 'common') : clearToken(f.token, 'common'))}
                />
              </span>
            </label>
          ))}

          <div className="prefs-sizes">
            {([SIZE_TOKENS.size, SIZE_TOKENS.leading] as const).map(t => {
              const fallback = t === SIZE_TOKENS.size ? 14 : 1.6
              const raw = s.common[t.token] ?? readToken(t.token)
              const value = Number.isFinite(parseFloat(raw)) ? parseFloat(raw) : fallback
              return (
                <label key={t.token} className="field">
                  <span className="lbl">{t.label} <span className="hint">{value}{t.unit}</span></span>
                  <input
                    type="range"
                    min={t.min}
                    max={t.max}
                    step={t.step}
                    value={value}
                    onChange={e => setToken(t.token, `${e.target.value}${t.unit}`, 'common')}
                  />
                </label>
              )
            })}
          </div>
          <p className="hint">Las tipografías valen para los dos temas.</p>
        </section>
      )}

      {tab === 'ui' && (
        <section className="prefs-group">
          {themeHeader}
          {colors(COLOR_TOKENS)}
        </section>
      )}

      {tab === 'syntax' && (
        <section className="prefs-group">
          {themeHeader}
          <pre className="syn-sample">
            <span style={{ color: 'var(--syn-comment)' }}>&lt;!DOCTYPE html&gt;</span>{'\n'}
            <span style={{ color: 'var(--syn-punct)' }}>&lt;</span>
            <span style={{ color: 'var(--syn-tag)' }}>section</span>{' '}
            <span style={{ color: 'var(--syn-attr)' }}>epub:type</span>
            <span style={{ color: 'var(--syn-punct)' }}>=</span>
            <span style={{ color: 'var(--syn-string)' }}>"chapter"</span>
            <span style={{ color: 'var(--syn-punct)' }}>&gt;</span>{'\n'}
            {'  '}
            <span style={{ color: 'var(--syn-punct)' }}>&lt;</span>
            <span style={{ color: 'var(--syn-tag)' }}>p</span>
            <span style={{ color: 'var(--syn-punct)' }}>&gt;</span>
            <span style={{ color: 'var(--syn-text)' }}>Tú </span>
            <span style={{ color: 'var(--syn-number)' }}>&amp;amp;</span>
            <span style={{ color: 'var(--syn-text)' }}> yo</span>
            <span style={{ color: 'var(--syn-punct)' }}>&lt;/</span>
            <span style={{ color: 'var(--syn-tag)' }}>p</span>
            <span style={{ color: 'var(--syn-punct)' }}>&gt;</span>{'\n'}
            <span style={{ color: 'var(--syn-selector)' }}>p.centro</span>{' '}
            <span style={{ color: 'var(--syn-punct)' }}>{'{'}</span>{' '}
            <span style={{ color: 'var(--syn-property)' }}>text-indent</span>
            <span style={{ color: 'var(--syn-punct)' }}>:</span>{' '}
            <span style={{ color: 'var(--syn-number)' }}>0</span>
            <span style={{ color: 'var(--syn-punct)' }}>; {'}'}</span>
          </pre>
          {colors(SYNTAX_TOKENS)}
        </section>
      )}

      {tab === 'json' && (
        <>
          <p className="hint">
            Cualquier variable CSS de la app, por tema. Las de <code>common</code> valen para
            los dos. Aquí caben todas, no solo las de las otras pestañas:{' '}
            <code>--sunken</code>, <code>--raised</code>, <code>--danger</code>,{' '}
            <code>--warn</code>, <code>--mark</code>, <code>--r-md</code>…
          </p>
          <textarea className="code" value={text} onChange={e => setText(e.target.value)} spellCheck={false} />
          <div className="paste-options">
            <button onClick={applyJson}>Aplicar</button>
            <span className="hint">Se ve al momento; «Guardar» lo deja puesto.</span>
          </div>
        </>
      )}

      {error && <p className="error">{error}</p>}

      <footer>
        <span className="hint">
          {n ? `${n} ajuste${n === 1 ? '' : 's'} propio${n === 1 ? '' : 's'}` : 'Todo como viene de fábrica'}
        </span>
        <button className="ghost" disabled={!n} onClick={reset}>Restaurar</button>
        <button className="primary" onClick={props.onClose}>Guardar</button>
      </footer>
    </Modal>
  )
}

function parseJson(text: string): Settings | string {
  try {
    const o = JSON.parse(text)
    if (!o || typeof o !== 'object') return 'Debe ser un objeto.'
    const bad = ['common', 'light', 'dark'].find(k => o[k] && typeof o[k] !== 'object')
    if (bad) return `"${bad}" debe ser un objeto de variables CSS.`
    return pruneSettings({ common: o.common ?? {}, light: o.light ?? {}, dark: o.dark ?? {} })
  } catch (e) {
    return e instanceof Error ? e.message : String(e)
  }
}
