import { useEffect } from 'react'

export interface UndoOffer {
  /** Lo que se acaba de hacer, en pasado: «32 reemplazos en 11 archivos». */
  message: string
  /** Punto de control de justo antes. */
  checkpointId: string
  /** Cambia en cada oferta, para reiniciar la cuenta atrás. */
  nonce: number
}

interface Props {
  offer: UndoOffer
  seconds?: number
  onUndo: () => void
  onDismiss: () => void
}

export default function UndoBar({ offer, seconds = 15, onUndo, onDismiss }: Props) {
  // Se retira sola: un aviso que se queda para siempre acaba siendo ruido.
  useEffect(() => {
    const t = setTimeout(onDismiss, seconds * 1000)
    return () => clearTimeout(t)
  }, [offer.nonce, seconds, onDismiss])

  return (
    <div className="undo-bar" role="status">
      <span className="what">{offer.message}</span>
      <button onClick={onUndo}>Deshacer</button>
      <button className="icon-btn" title="Descartar el aviso" onClick={onDismiss}>×</button>
    </div>
  )
}
