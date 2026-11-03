// El diccionario, en un hilo aparte: cargarlo lleva un segundo y no debe
// congelar el editor. Diccionario español de LibreOffice (RLA-ES), con su
// licencia en src/dict/es/LICENSE.

import NSpell from 'nspell'
import aff from '../dict/es/es.aff?raw'
import dic from '../dict/es/es.dic?raw'
import { isCorrect } from './spell'

export type SpellAsk = { type: 'check'; words: string[] } | { type: 'suggest'; word: string }
export type SpellRequest = SpellAsk & { id: number }

export type SpellResponse =
  | { id: number; type: 'check'; bad: string[] }
  | { id: number; type: 'suggest'; list: string[] }

let spell: NSpell | null = null
const dictionary = () => (spell ??= NSpell(aff, dic))

self.onmessage = (e: MessageEvent<SpellRequest>) => {
  const m = e.data
  const es = dictionary()
  if (m.type === 'check') {
    const out: SpellResponse = { id: m.id, type: 'check', bad: m.words.filter(w => !isCorrect(es, w)) }
    self.postMessage(out)
  } else {
    const out: SpellResponse = { id: m.id, type: 'suggest', list: es.suggest(m.word.normalize('NFC')).slice(0, 6) }
    self.postMessage(out)
  }
}
