import { useRef } from 'react'

interface Props {
  /** Para lectores de pantalla y para el título al pasar el ratón. */
  label: string
  area: string
  /** Ancho actual del panel que se redimensiona, medido en pantalla. */
  current: () => number
  onResize: (width: number) => void
  /** Doble clic: volver al tamaño de siempre. */
  onReset: () => void
  /** El panel está a la derecha: arrastrar a la izquierda lo ensancha. */
  invert?: boolean
}

/** Paso de las flechas del teclado; con Mayúsculas, más largo. */
const STEP = 16

export default function Splitter(props: Props) {
  const drag = useRef<{ x: number; width: number } | null>(null)

  const end = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return
    drag.current = null
    e.currentTarget.releasePointerCapture(e.pointerId)
    document.body.classList.remove('resizing')
  }

  return (
    <div
      className="splitter"
      style={{ gridArea: props.area }}
      role="separator"
      aria-orientation="vertical"
      aria-label={props.label}
      title={`${props.label} · arrastra para cambiar el ancho, doble clic para el de siempre`}
      tabIndex={0}
      onPointerDown={e => {
        if (e.button !== 0) return
        e.preventDefault()
        e.currentTarget.setPointerCapture(e.pointerId)
        drag.current = { x: e.clientX, width: props.current() }
        // Mientras se arrastra, el cursor es el del separador en toda la
        // ventana y la vista previa no se queda con el ratón (ver el CSS).
        document.body.classList.add('resizing')
      }}
      onPointerMove={e => {
        if (!drag.current) return
        const dx = e.clientX - drag.current.x
        props.onResize(drag.current.width + (props.invert ? -dx : dx))
      }}
      onPointerUp={end}
      onPointerCancel={end}
      onDoubleClick={props.onReset}
      onKeyDown={e => {
        const step = e.shiftKey ? STEP * 3 : STEP
        const grow = props.invert ? 'ArrowLeft' : 'ArrowRight'
        const shrink = props.invert ? 'ArrowRight' : 'ArrowLeft'
        if (e.key !== grow && e.key !== shrink) return
        e.preventDefault()
        props.onResize(props.current() + (e.key === grow ? step : -step))
      }}
    />
  )
}
