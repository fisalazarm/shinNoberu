// Habla con el hilo del diccionario. Recuerda lo que ya preguntó: en una
// novela se repiten las mismas pocas miles de palabras, y tras el primer
// capítulo casi todo sale de la memoria sin cruzar al otro hilo.

import type { SpellAsk, SpellRequest, SpellResponse } from './spell.worker'

type Pending = (r: SpellResponse) => void

let worker: Worker | null = null
let seq = 0
const pending = new Map<number, Pending>()
/** true: bien escrita. */
const known = new Map<string, boolean>()

function send(msg: SpellAsk): Promise<SpellResponse> {
  if (!worker) {
    worker = new Worker(new URL('./spell.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<SpellResponse>) => {
      pending.get(e.data.id)?.(e.data)
      pending.delete(e.data.id)
    }
  }
  const id = ++seq
  return new Promise(resolve => {
    pending.set(id, resolve)
    worker!.postMessage({ ...msg, id } as SpellRequest)
  })
}

/** De las palabras dadas, las que el diccionario no conoce. */
export async function misspelled(words: Iterable<string>): Promise<Set<string>> {
  // Se recorre dos veces: un iterador (`map.keys()`) se gastaría en la primera.
  const all = [...new Set(words)]
  const ask = all.filter(w => !known.has(w))
  if (ask.length) {
    const r = await send({ type: 'check', words: ask })
    if (r.type === 'check') {
      const bad = new Set(r.bad)
      for (const w of ask) known.set(w, !bad.has(w))
    }
  }
  const out = new Set<string>()
  for (const w of all) if (known.get(w) === false) out.add(w)
  return out
}

/** Hasta seis sugerencias del diccionario. */
export async function suggestions(word: string): Promise<string[]> {
  const r = await send({ type: 'suggest', word })
  return r.type === 'suggest' ? r.list : []
}
