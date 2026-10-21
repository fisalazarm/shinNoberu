import { useEffect, type ReactNode } from 'react'

export default function Modal({
  title,
  onClose,
  children,
  wide,
  className,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  wide?: boolean
  /** Clase extra en el cuadro, para los diálogos que quieren otro ancho. */
  className?: string
}) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])

  return (
    <div className="backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''} ${className ?? ''}`} role="dialog" aria-label={title}>
        <header>
          <h2>{title}</h2>
          <button className="ghost" onClick={onClose} aria-label="Cerrar">×</button>
        </header>
        {children}
      </div>
    </div>
  )
}
