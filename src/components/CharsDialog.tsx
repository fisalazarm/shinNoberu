import { useState } from 'react'
import Modal from './Modal'
import { charInfo } from '../lib/charName'

interface Props {
  onInsert: (char: string) => void
  onClose: () => void
}

const code = (n: number) => String.fromCodePoint(n)

/** Lo que de verdad hace falta maquetando una novela, no una tabla Unicode. */
const GROUPS: { name: string; chars: string[] }[] = [
  {
    name: 'Rayas y guiones',
    chars: [code(0x2014), code(0x2013), '-', code(0x2011), code(0x2026)],
  },
  {
    name: 'Comillas',
    chars: ['«', '»', code(0x201c), code(0x201d), code(0x2018), code(0x2019), code(0x2039), code(0x203a)],
  },
  {
    name: 'Japonés',
    chars: [code(0x300c), code(0x300d), code(0x300e), code(0x300f), code(0x3010), code(0x3011)],
  },
  {
    name: 'Espacios',
    chars: [code(0x00a0), code(0x202f), code(0x2009), code(0x3000)],
  },
  {
    name: 'Signos',
    chars: ['¿', '¡', code(0x25c7), code(0x25c6), code(0x2022), code(0x00b7), '°', code(0x00d7), code(0x2020)],
  },
]

export default function CharsDialog(props: Props) {
  const [last, setLast] = useState('')

  const insert = (c: string) => {
    props.onInsert(c)
    setLast(c)
  }

  return (
    <Modal title="Insertar carácter" onClose={props.onClose} className="form">
      <p className="hint">
        Se inserta donde esté el cursor. El cuadro se queda abierto para poner varios seguidos.
      </p>

      {GROUPS.map(g => (
        <section key={g.name} className="chars-group">
          <h3>{g.name}</h3>
          <div className="chars-grid">
            {g.chars.map(c => {
              const info = charInfo(c)!
              return (
                <button
                  key={info.hex}
                  className={info.invisible ? 'invisible' : ''}
                  title={`${info.label} · ${info.hex}`}
                  onClick={() => insert(c)}
                >
                  <span className="glyph">{info.invisible ? '·' : c}</span>
                  <span className="hex">{info.hex.replace('U+', '')}</span>
                </button>
              )
            })}
          </div>
        </section>
      ))}

      <footer>
        <span className="hint">
          {last ? `Insertado: ${charInfo(last)!.label}` : 'Pasa el ratón para ver el nombre de cada uno.'}
        </span>
        <button className="primary" onClick={props.onClose}>Cerrar</button>
      </footer>
    </Modal>
  )
}
