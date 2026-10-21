// Tema de CodeMirror a juego con el de la app.
//
// Los colores no se escriben aquí: se apuntan a variables CSS (--syn-*), que
// index.css define para cada tema y las preferencias pueden sobrescribir. Como
// el navegador resuelve las variables al pintar, una sola hoja de resaltado
// sirve para el tema claro, para el oscuro y para el que se invente el usuario,
// sin reconstruir la extensión.

import type { Extension } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'
import type { Theme } from './theme'

const v = (token: string) => `var(${token})`

const syntax = HighlightStyle.define([
  { tag: [t.comment, t.lineComment, t.blockComment], color: v('--syn-comment'), fontStyle: 'italic' },
  // La declaración XML y el DOCTYPE son ruido de fondo: que no destaquen.
  { tag: [t.meta, t.processingInstruction, t.documentMeta], color: v('--syn-comment') },

  { tag: [t.tagName, t.standard(t.tagName)], color: v('--syn-tag'), fontWeight: '550' },
  { tag: [t.angleBracket, t.bracket, t.punctuation, t.separator], color: v('--syn-punct') },
  { tag: [t.attributeName, t.propertyName], color: v('--syn-attr') },
  { tag: [t.attributeValue, t.string, t.special(t.string)], color: v('--syn-string') },

  { tag: [t.number, t.unit, t.literal], color: v('--syn-number') },
  { tag: [t.keyword, t.atom, t.bool, t.null, t.self, t.modifier], color: v('--syn-keyword') },
  { tag: [t.operator, t.definitionOperator, t.compareOperator], color: v('--syn-comment') },

  // CSS: el selector y la propiedad son lo que se busca de un vistazo.
  { tag: [t.className, t.typeName, t.labelName, t.namespace], color: v('--syn-selector') },
  { tag: [t.definition(t.propertyName)], color: v('--syn-property') },
  { tag: [t.variableName, t.definition(t.variableName)], color: v('--syn-text') },

  // Entidades (&amp;) y escapes, que conviene ver.
  { tag: [t.escape, t.character, t.regexp], color: v('--syn-number') },
  { tag: [t.link, t.url], color: v('--syn-link'), textDecoration: 'underline' },

  { tag: t.strong, fontWeight: 'bold' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: t.heading, color: v('--syn-tag'), fontWeight: 'bold' },
  { tag: t.invalid, color: v('--syn-invalid'), textDecoration: 'underline wavy' },
])

/** La selección usa el acento de la app, así que vale para los dos temas. */
const selection = EditorView.theme({
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
    backgroundColor: 'var(--accent-soft)',
  },
})

const chrome = (dark: boolean) =>
  EditorView.theme(
    {
      '&': { backgroundColor: 'var(--canvas)', color: 'var(--text)' },
      '.cm-content': { caretColor: 'var(--accent)' },
      '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--accent)', borderLeftWidth: '2px' },
      '.cm-gutters': {
        backgroundColor: 'var(--canvas)',
        color: 'var(--muted)',
        border: 'none',
        borderRight: '1px solid var(--border)',
      },
      '.cm-activeLine': { backgroundColor: dark ? '#ffffff09' : '#00000007' },
      '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--text-dim)' },
      '.cm-foldGutter span': { color: 'var(--muted)' },
      '.cm-matchingBracket, &.cm-focused .cm-matchingBracket': {
        backgroundColor: 'var(--accent-soft)',
        outline: '1px solid var(--accent)',
        color: 'inherit',
      },
      '.cm-nonmatchingBracket': { color: 'var(--danger)' },
      '.cm-panels': {
        backgroundColor: 'var(--panel)',
        color: 'var(--text)',
        borderTop: '1px solid var(--border)',
        borderBottom: '1px solid var(--border)',
      },
      '.cm-panels input, .cm-panels button': {
        font: 'inherit',
        color: 'var(--text)',
        backgroundColor: 'var(--raised)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-sm)',
        padding: '2px 6px',
      },
      '.cm-searchMatch': { backgroundColor: 'var(--accent-soft)', outline: '1px solid var(--accent)' },
      '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: 'var(--mark)', color: 'var(--mark-ink)' },
      '.cm-selectionMatch': { backgroundColor: dark ? '#ffffff14' : '#00000010' },
      '.cm-tooltip': {
        backgroundColor: 'var(--panel)',
        color: 'var(--text)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-sm)',
      },
    },
    { dark },
  )

/**
 * Lo único que cambia entre temas es el indicador `dark` y un par de matices
 * del fondo; el color lo ponen las variables.
 */
export function editorTheme(theme: Theme): Extension {
  return [chrome(theme === 'dark'), selection, syntaxHighlighting(syntax)]
}
