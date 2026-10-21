import { useLayoutEffect, useRef, useState } from 'react'
import type { Device } from '../lib/devices'

interface Props {
  html: string
  onNavigate: (path: string, hash: string) => void
  hash?: string
  /** Si hay pantalla elegida, el capítulo se ve al tamaño de ese lector. */
  device?: Device | null
}

export default function Preview({ html, onNavigate, hash, device }: Props) {
  const frame = useRef<HTMLIFrameElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const scroll = useRef(0)
  const nav = useRef(onNavigate)
  nav.current = onNavigate

  const usedHash = useRef<string | undefined>(undefined)
  /** Cuánto hay que encoger la pantalla para que quepa en el panel. */
  const [scale, setScale] = useState(1)

  // La pantalla se mide sola: al cambiar de dispositivo o de tamaño del panel.
  useLayoutEffect(() => {
    if (!device) return
    const fit = () => {
      const el = box.current
      if (!el) return
      const { width, height } = el.getBoundingClientRect()
      setScale(Math.min(1, width / device.width, height / device.height))
    }
    fit()
    const ro = new ResizeObserver(fit)
    if (box.current) ro.observe(box.current)
    return () => ro.disconnect()
  }, [device])

  const onLoad = () => {
    const f = frame.current
    const doc = f?.contentDocument
    if (!f || !doc) return

    // Al reescribir el documento se mantiene la posición, para no saltar al inicio mientras escribes.
    if (hash && hash !== usedHash.current) doc.getElementById(hash)?.scrollIntoView()
    else f.contentWindow?.scrollTo(0, scroll.current)
    usedHash.current = hash
    f.contentWindow?.addEventListener('scroll', () => { scroll.current = f.contentWindow?.scrollY ?? 0 })

    doc.addEventListener('click', e => {
      const a = (e.target as Element).closest?.('a')
      if (!a) return
      const href = a.getAttribute('href') ?? ''
      const path = a.getAttribute('data-epub-path')
      e.preventDefault()
      if (path) nav.current(path, a.getAttribute('data-epub-hash') ?? '')
      else if (href.startsWith('#')) doc.getElementById(decodeURIComponent(href.slice(1)))?.scrollIntoView({ behavior: 'smooth' })
    })
  }

  const sheet = (
    <iframe
      ref={frame}
      className="preview"
      title="Vista previa"
      sandbox="allow-same-origin"
      srcDoc={html}
      onLoad={onLoad}
      style={device
        ? { width: device.width, height: device.height, transform: `scale(${scale})`, transformOrigin: 'top left' }
        : undefined}
    />
  )

  if (!device) return sheet

  // El marco ocupa lo que la pantalla ya encogida; dentro se baja con la barra
  // de desplazamiento del propio capítulo.
  return (
    <div className="device-box" ref={box}>
      <div className="device-screen" style={{ width: device.width * scale, height: device.height * scale }}>
        {sheet}
      </div>
    </div>
  )
}
