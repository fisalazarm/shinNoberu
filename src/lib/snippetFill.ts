// Rellenar un snippet antes de insertarlo: el número de nota y las variables.
//
// Las variables son palabras en mayúsculas entre llaves, `{CAPNOTA}`, y cada
// una tiene su regla (ver `VarRule` en snippets.ts). La que hace la magia es
// «capítulo de la nota»: en el snippet del texto de una nota,
//
//   <p id="nt{}"><a href="{CAPNOTA}#rf{}"><sup>❮{}❯</sup> Texto</a></p>
//
// el número es el de la primera llamada que aún no tiene su nota, y CAPNOTA es
// el capítulo donde está esa llamada. Escribir las notas una detrás de otra en
// notas.xhtml es pulsar el snippet y escribir: cada una sale con su número y su
// enlace de vuelta al sitio exacto.
//
// Las rutas salen relativas al archivo donde se escribe, que es lo que tiene
// que ir en un href.

import { relativePath, spinePaths, type EpubBook } from './epub'
import {
  chooseNumber, fillSlots, hasSlots, mapSnippet, snippetText, type NumberChoice,
} from './snippetNumbers'
import type { Snippet, VarRule } from './snippets'
import { navItemPath } from './structure'

const VAR = /\{([A-Z][A-Z0-9_]*)\}/g

/** Las variables del snippet, en el orden en que aparecen y sin repetir. */
export function snippetVars(s: Snippet): string[] {
  return [...new Set([...snippetText(s).matchAll(VAR)].map(m => m[1]))]
}

export const VAR_RULES: { rule: Exclude<VarRule, { text: string }>; label: string }[] = [
  { rule: 'noteChapter', label: 'Capítulo de la nota' },
  { rule: 'lastChapter', label: 'Último capítulo' },
  { rule: 'current', label: 'Archivo que editas' },
  { rule: 'ask', label: 'Elegir de la lista cada vez' },
]

export interface Ask {
  /** La variable que se pregunta. */
  name: string
  /** Archivos entre los que elegir, en orden de lectura. */
  choices: string[]
  /** El que se propone primero. */
  suggested?: string
  /** Con el archivo elegido, se sigue: puede quedar otra variable por preguntar. */
  then: (path: string) => FillResult
}

export type FillResult = { done: Snippet } | { ask: Ask }

/** Los documentos del libro en orden de lectura, sin el nav. */
function documents(book: EpubBook): string[] {
  const nav = navItemPath(book)
  const spine = spinePaths(book).filter(p => p !== nav)
  const rest = [...book.files.values()]
    .filter(f => f.mediaType === 'application/xhtml+xml' && !spine.includes(f.path) && f.path !== nav)
    .map(f => f.path)
  return [...spine, ...rest]
}

/**
 * Rellena el snippet para insertarlo en `at`. Si alguna variable necesita que
 * se elija un archivo, lo pide; si no, lo devuelve listo.
 */
export function fillSnippet(s: Snippet, book: EpubBook, at: string): FillResult {
  const names = snippetVars(s)
  if (!names.length && !hasSlots(s)) return { done: s }

  const choice: NumberChoice | null = hasSlots(s) ? chooseNumber(book, snippetText(s)) : null
  const docs = documents(book)

  const step = (values: Record<string, string>, i: number): FillResult => {
    if (i === names.length) {
      return {
        done: mapSnippet(s, t => {
          const withVars = t.replace(VAR, (whole, name: string) => values[name] ?? whole)
          return choice ? fillSlots(withVars, choice.n) : withVars
        }),
      }
    }

    const name = names[i]
    const rule = s.vars?.[name] ?? 'ask'
    const next = (value: string) => step({ ...values, [name]: value }, i + 1)
    const file = (path: string) => next(relativePath(at, path))

    if (typeof rule === 'object') return next(rule.text)
    if (rule === 'current') return file(at)
    if (rule === 'lastChapter') {
      const last = [...docs].reverse().find(p => p !== at)
      if (last) return file(last)
    }
    if (rule === 'noteChapter' && choice?.from) return file(choice.from)

    // Preguntar: lo pide la regla, o no hay forma de deducirlo.
    return {
      ask: {
        name,
        choices: docs,
        // Si se sabe de qué capítulo viene la nota, ese va primero.
        suggested: choice?.from ?? [...docs].reverse().find(p => p !== at),
        then: file,
      },
    }
  }

  return step({}, 0)
}
