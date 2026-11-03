// Prueba de humo: la app arranca, se escribe un capítulo y se ve en la vista
// previa, la ortografía subraya y el árbol responde. Sirve también de
// plantilla para escenarios nuevos: copia este archivo y cambia el medio.
//
//   node scripts/navegador/humo.mjs

import { iniciar } from './arnes.mjs'

const app = await iniciar()
let fallos = 0
const comprobar = (que, ok, detalle = '') => {
  if (!ok) fallos++
  app.log(`${ok ? 'ok ' : 'MAL'} ${que}${detalle ? ` · ${detalle}` : ''}`)
}

await app.abrirArchivo('Cap01.xhtml')
await app.escribir(app.capitulo('El faro', '  <p>Aserca del faro, el hombre miraba el mar.</p>'), 'miraba')
await app.dormir(2500)

const visor = await app.leerVisor()
comprobar('la vista previa enseña el capítulo', visor?.texto.includes('el hombre miraba'), visor?.texto.slice(0, 40))

const subrayadas = await app.eval(`Array.from(document.querySelectorAll('.cm-misspelled')).map(function(e){ return e.textContent })`)
comprobar('la ortografía subraya «Aserca» y nada más', subrayadas.length === 1 && subrayadas[0] === 'Aserca', JSON.stringify(subrayadas))

const archivos = await app.eval(`document.querySelectorAll('.tree .file').length`)
comprobar('el árbol enseña los archivos', archivos >= 4, `${archivos} archivos`)

await app.captura('humo')
app.log(fallos ? `${fallos} comprobación(es) fallaron` : 'Todo bien')
await app.terminar()
