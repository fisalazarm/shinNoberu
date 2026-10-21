import { useMemo } from 'react'
import Modal from './Modal'
import type { EpubBook } from '../lib/epub'
import { bookReport, outlier, prettyMinutes } from '../lib/report'

interface Props {
  book: EpubBook
  /** Cambia con cada modificación del libro: fuerza a rehacer las cuentas. */
  rev: number
  onOpen: (path: string) => void
  onClose: () => void
}

export default function ReportDialog(props: Props) {
  const r = useMemo(() => bookReport(props.book), [props.book, props.rev])
  const most = Math.max(1, ...r.chapters.map(c => c.words))
  const percent = Math.round(r.dialogueRatio * 100)

  return (
    <Modal title="Informe del libro" onClose={props.onClose} wide>
      <div className="report-top">
        <div className="figure">
          <b>{r.words.toLocaleString('es')}</b>
          <span>palabras</span>
        </div>
        <div className="figure">
          <b>{prettyMinutes(r.minutes)}</b>
          <span>de lectura</span>
        </div>
        <div className="figure">
          <b>{r.chapters.length}</b>
          <span>capítulo{r.chapters.length === 1 ? '' : 's'}</span>
        </div>
        <div className="figure">
          <b>{r.average.toLocaleString('es')}</b>
          <span>palabras de media</span>
        </div>
        <div className="figure">
          <b>{percent} %</b>
          <span>párrafos de diálogo</span>
        </div>
      </div>

      <div className="report-grid">
        <section>
          <h3>Capítulos</h3>
          <ul className="chapter-bars">
            {r.chapters.map(c => (
              <li key={c.path} className={outlier(c, r.average) ? 'odd' : ''}>
                <button onClick={() => props.onOpen(c.path)} title={c.path}>
                  <span className="who">{c.title}</span>
                  <span className="bar">
                    <span className="fill" style={{ width: `${Math.round((c.words / most) * 100)}%` }} />
                  </span>
                  <span className="num">{c.words.toLocaleString('es')}</span>
                  <span className="mins">{prettyMinutes(c.minutes)}</span>
                </button>
              </li>
            ))}
          </ul>
          {r.chapters.length === 0 && <p className="hint">El libro no tiene capítulos en el orden de lectura.</p>}
          {r.longest && r.shortest && r.longest !== r.shortest && (
            <p className="hint">
              El más largo es «{r.longest.title}» y el más corto «{r.shortest.title}».
              {' '}Se marcan los que doblan la media o no llegan a la mitad.
            </p>
          )}
        </section>

        <section>
          <h3>Palabras que se repiten</h3>
          {r.repeats.length === 0
            ? <p className="hint">Nada se repite lo bastante como para cantar.</p>
            : (
              <ul className="repeat-list">
                {r.repeats.map(w => (
                  <li key={w.word}>
                    <span className="who">{w.word}</span>
                    <span className="num">{w.count}</span>
                    <span className="mins" title="Veces por cada diez mil palabras">{w.per10k}/10k</span>
                  </li>
                ))}
              </ul>
            )}
          <p className="hint">
            Sin contar las palabras vacías («de», «que», «la»). Una muletilla se nota más por su
            frecuencia que por su número: mira la columna de la derecha.
          </p>

          <h3>Frases largas</h3>
          <ul className="repeat-list">
            {[...r.chapters]
              .filter(c => c.longestSentence > 0)
              .sort((a, b) => b.longestSentence - a.longestSentence)
              .slice(0, 5)
              .map(c => (
                <li key={c.path}>
                  <button className="who link" onClick={() => props.onOpen(c.path)}>{c.title}</button>
                  <span className="num">{c.longestSentence}</span>
                  <span className="mins">palabras</span>
                </li>
              ))}
          </ul>
        </section>
      </div>

      <footer>
        <span className="hint">A 230 palabras por minuto, que es lo que se lee una novela.</span>
        <button className="ghost" onClick={props.onClose}>Cerrar</button>
      </footer>
    </Modal>
  )
}
