// Pantallas de lectores de verdad, para ver el capítulo al tamaño al que se
// leerá.
//
// Las medidas son píxeles CSS del área de lectura, no píxeles físicos: un
// Kindle Paperwhite tiene 1072×1448 puntos a 300 ppp, pero su navegador ve
// unos 560×760. Lo que importa aquí es cuánto texto cabe a lo ancho, y eso lo
// deciden los píxeles CSS.
//
// No se pagina ni se toca el CSS del libro: la pantalla solo marca el tamaño
// del marco, y dentro se baja con la barra de desplazamiento de siempre.

export interface Device {
  id: string
  label: string
  width: number
  height: number
}

export const DEVICES: Device[] = [
  { id: 'kindle', label: 'Kindle Paperwhite', width: 560, height: 757 },
  { id: 'kobo', label: 'Kobo Clara', width: 500, height: 666 },
  // 7", 1264×1680 físicos a 300 ppp; con densidad 2× salen estos píxeles CSS.
  { id: 'boox-go-7', label: 'Onyx Boox Go 7', width: 632, height: 840 },
  { id: 'phone', label: 'Móvil', width: 393, height: 760 },
  { id: 'tablet', label: 'Tablet', width: 744, height: 1000 },
]

export const deviceById = (id: string | undefined): Device | undefined =>
  DEVICES.find(d => d.id === id)
