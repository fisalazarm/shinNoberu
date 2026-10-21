// Iconos de 16px, trazo de 1.5. Dibujados a mano para no traer una librería
// entera por diez formas; `currentColor` los hace seguir al tema.

interface Props {
  name: IconName
  /** Etiqueta accesible. Sin ella el icono queda oculto para el lector de pantalla. */
  label?: string
  size?: number
}

export type IconName =
  | 'sun' | 'moon'
  | 'up' | 'down' | 'right'
  | 'folder'
  | 'star' | 'starFilled'
  | 'pencil' | 'trash'
  | 'doc' | 'style' | 'image' | 'font' | 'file'
  | 'split' | 'gear' | 'note'

const PATHS: Record<IconName, { d: string; fill?: boolean }[]> = {
  sun: [
    { d: 'M8 3.25V1.5M8 14.5v-1.75M3.25 8H1.5M14.5 8h-1.75M4.64 4.64 3.4 3.4M12.6 12.6l-1.24-1.24M11.36 4.64 12.6 3.4M3.4 12.6l1.24-1.24' },
    { d: 'M8 5.25a2.75 2.75 0 1 0 0 5.5 2.75 2.75 0 0 0 0-5.5Z' },
  ],
  moon: [{ d: 'M13 10.3A5.6 5.6 0 0 1 5.7 3 5.75 5.75 0 1 0 13 10.3Z' }],
  up: [{ d: 'M4 10l4-4 4 4' }],
  down: [{ d: 'M4 6l4 4 4-4' }],
  right: [{ d: 'M6 4l4 4-4 4' }],
  folder: [{ d: 'M2.25 4h3.9l1.3 1.6H13.75v7.4H2.25V4Z' }],
  star: [{ d: 'M8 2.25l1.74 3.53 3.9.57-2.82 2.75.66 3.88L8 11.15l-3.48 1.83.66-3.88L2.36 6.35l3.9-.57L8 2.25Z' }],
  starFilled: [{ d: 'M8 2.25l1.74 3.53 3.9.57-2.82 2.75.66 3.88L8 11.15l-3.48 1.83.66-3.88L2.36 6.35l3.9-.57L8 2.25Z', fill: true }],
  pencil: [{ d: 'M11.6 2.9l1.5 1.5-7.3 7.3-2.3.8.8-2.3 7.3-7.3Z' }],
  trash: [{ d: 'M3.5 5h9M6.5 5V3.5h3V5M5 5l.5 8h5L11 5M7 7.5v3M9 7.5v3' }],
  doc: [{ d: 'M4 2.5h5L12 5.5v8H4v-11ZM9 2.5v3h3M5.75 8.5h4.5M5.75 10.75h4.5' }],
  style: [{ d: 'M3 3.5h10l-.9 9.2L8 14l-4.1-1.3L3 3.5ZM10.5 6H6l.2 2h4l-.3 2.6L8 11.2l-1.9-.6' }],
  image: [{ d: 'M2.75 3.5h10.5v9H2.75v-9ZM2.75 10.5l3-3 2.5 2.5 2-2 2.75 2.75M10.25 6.25a.6.6 0 1 0 0-.01Z' }],
  font: [{ d: 'M3.5 13l4-10h1l4 10M5.4 9.5h5.2' }],
  file: [{ d: 'M4 2.5h5L12 5.5v8H4v-11ZM9 2.5v3h3' }],
  // Un recuadro con una línea de puntos por el medio: «cortar en dos».
  split: [{ d: 'M2.75 3.5h10.5v9H2.75v-9ZM8 3.5v2M8 7v2M8 10.5v2' }],
  gear: [
    { d: 'M8 6.3a1.7 1.7 0 1 0 0 3.4 1.7 1.7 0 0 0 0-3.4Z' },
    { d: 'M8 4.1a3.9 3.9 0 1 0 0 7.8 3.9 3.9 0 0 0 0-7.8Z' },
    { d: 'M8 1.6v2.1M8 12.3v2.1M1.6 8h2.1M12.3 8h2.1M3.47 3.47l1.48 1.48M11.05 11.05l1.48 1.48M12.53 3.47l-1.48 1.48M4.95 11.05l-1.48 1.48' },
  ],
  note: [{ d: 'M4 2.5h8v11H4v-11ZM6.25 5.5h3.5M6.25 8h3.5M6.25 10.5h2' }],
}

export default function Icon({ name, label, size = 16 }: Props) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 16 16"
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? 'img' : undefined}
    >
      {PATHS[name].map((p, i) => (
        <path
          key={i}
          d={p.d}
          fill={p.fill ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  )
}
