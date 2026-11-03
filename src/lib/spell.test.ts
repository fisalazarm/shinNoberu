import { readFileSync } from 'node:fs'
import NSpell from 'nspell'
import { beforeAll, describe, expect, it } from 'vitest'
import { newEpub } from './newEpub'
import {
  bodyRanges, bookWords, contextOf, isAccepted, isCorrect, matchCase, replaceWord, spellTokens,
  type Checker,
} from './spell'

let es: Checker

beforeAll(() => {
  // Con jsdom, import.meta.url no es una ruta de archivo: se parte de la raíz del proyecto.
  const read = (f: string) => readFileSync(`${process.cwd()}/src/dict/es/${f}`, 'utf8')
  es = NSpell(read('es.aff'), read('es.dic'))
})

const palabras = (html: string) => spellTokens(html).map(t => t.word)

describe('qué palabras se miran', () => {
  it('solo el texto del cuerpo: ni etiquetas, ni atributos, ni el head, ni estilos', () => {
    const html = '<html><head><title>Titulo raro</title><style>p { colr: red }</style></head>' +
      '<body class="capitulo"><p id="parrafo">Hola <em>mundo</em></p><!-- comentaryo --></body></html>'
    expect(palabras(html)).toEqual(['Hola', 'mundo'])
  })

  it('las entidades no son palabras', () => {
    expect(palabras('<body><p>uno&nbsp;dos &amp; tres</p></body>')).toEqual(['uno', 'dos', 'tres'])
  })

  it('lo pegado a cifras o raro no se mira', () => {
    expect(palabras('<body><p>el 3er piso, la 2ª vez, user_name, a@b.cl</p></body>')).toEqual(['el', 'piso', 'la', 'vez', 'cl'])
  })

  it('las posiciones apuntan a la palabra en el documento', () => {
    const html = '<body><p>Había una vez</p></body>'
    const [t] = spellTokens(html)
    expect(html.slice(t.from, t.to)).toBe('Había')
  })

  it('un documento sin body se mira entero', () => {
    expect(bodyRanges('hola <b>tú</b>')).toEqual([[0, 5], [8, 10]])
  })
})

describe('isCorrect', () => {
  it.each([
    'casa', 'árboles', 'decírmelo', 'cantábamos', 'Madrid', 'CAPÍTULO', 'Capítulo',
    'XIV', 'cansadísimo', 'riquísima', 'amabilísimo', 'larguísimos', 'perrito', 'casitas', 'poquito',
  ])('acepta «%s»', w => {
    expect(isCorrect(es, w)).toBe(true)
  })

  it.each(['aserca', 'ombre', 'haiga', 'herrmano', 'qeu', 'iendo'])('marca «%s»', w => {
    expect(isCorrect(es, w)).toBe(false)
  })

  it('una palabra escrita con tilde descompuesta vale igual', () => {
    expect(isCorrect(es, 'árbol'.normalize('NFD'))).toBe(true)
  })
})

describe('listas aceptadas', () => {
  it('una palabra en minúscula vale también a principio de frase; un nombre, solo con mayúscula', () => {
    const lista = new Set(['Kazuto', 'pingüino'])
    expect(isAccepted('Kazuto', lista)).toBe(true)
    expect(isAccepted('kazuto', lista)).toBe(false)
    expect(isAccepted('pingüino', lista)).toBe(true)
    expect(isAccepted('Pingüino', lista)).toBe(true)
  })
})

describe('matchCase', () => {
  it('copia las mayúsculas del original', () => {
    expect(matchCase('Aserca', 'acerca')).toBe('Acerca')
    expect(matchCase('ASERCA', 'acerca')).toBe('ACERCA')
    expect(matchCase('aserca', 'acerca')).toBe('acerca')
  })
})

describe('en todo el libro', () => {
  const libro = () => {
    const book = newEpub()
    const f = book.files.get('OEBPS/Text/Cap01.xhtml')!
    f.text = f.text!.replace('</body>', '<p class="aserca">Aserca del faro, aserca del mar.</p>\n</body>')
    return { book, f }
  }

  it('cuenta las apariciones de cada palabra', () => {
    const { book } = libro()
    const w = bookWords(book)
    expect(w.get('aserca')).toHaveLength(1)
    expect(w.get('Aserca')).toHaveLength(1)
  })

  it('reemplaza solo en el texto y respeta las mayúsculas', () => {
    const { book, f } = libro()
    expect(replaceWord(book, 'aserca', 'acerca')).toBe(1)
    expect(replaceWord(book, 'Aserca', 'acerca')).toBe(1)
    expect(f.text).toContain('<p class="aserca">Acerca del faro, acerca del mar.</p>')
  })

  it('da el contexto sin etiquetas', () => {
    const text = '<p>Era de noche cuando <em>aserca</em> del faro</p>'
    const at = text.indexOf('aserca')
    expect(contextOf(text, at, at + 6)).toEqual({ before: 'Era de noche cuando ', word: 'aserca', after: ' del faro' })
  })

  it('al principio del capítulo no se cuela el head ni medio atributo', () => {
    const text = '<html xmlns:epub="http://www.idpf.org/2007/ops"><head><title>El faro</title></head>\n<body>\n<h1>El faro</h1>\n<p>Aserca del mar</p>'
    const at = text.indexOf('Aserca')
    expect(contextOf(text, at, at + 6).before).toBe('El faro ')
  })
})

describe('texto a medio escribir', () => {
  it('un </style sin cerrar no cuelga', () => {
    expect(palabras('<body><style>p {}</style <p>hola</p></body>')).toEqual(['hola'])
    expect(palabras('<body><style>p {}</style')).toEqual([])
    expect(palabras('<body><p>uno</p><script>x</scr')).toEqual(['uno'])
  })
})
