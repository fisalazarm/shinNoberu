---
name: probar-en-navegador
description: Prueba ShinNoberu en un navegador de verdad (Edge sin ventana, por CDP) con clics, teclas, arrastres y selectores de archivo reales, y saca capturas. Úsala siempre que un cambio toque la interfaz (diálogos, menús, editor, vista previa, árbol de archivos) antes de decir que funciona, cuando el usuario pida «pruébalo», «comprueba que se ve bien» o una captura, o cuando una prueba unitaria no basta para saber si algo funciona en la app.
---

# Probar en el navegador

Las pruebas unitarias no ven la interfaz. Esto abre la app en Edge sin
ventana y la maneja como una persona: clics, teclas y arrastres de verdad.

## Antes de empezar

1. El servidor de desarrollo tiene que estar en marcha. Compruébalo con
   `curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/`. Si no da
   200, arráncalo con `npm run dev` **en segundo plano** (`run_in_background`).
2. Edge no hace falta arrancarlo: el arnés lo lanza si no hay nadie
   escuchando en el puerto 9222.

## Escribir un escenario

Copia `scripts/navegador/humo.mjs` a un archivo nuevo **del scratchpad** (los
escenarios de una sola vez no van al repositorio) e importa el arnés por su URL `file:///`
(en Windows, Node no importa rutas absolutas tal cual):

```js
import { iniciar } from 'file:///C:/Users/fabit/Documents/EPUB%20Editor/epub-editor/scripts/navegador/arnes.mjs'
const app = await iniciar()            // app limpia, sin el borrador anterior
await app.abrirArchivo('Cap01.xhtml')
await app.escribir(app.capitulo('El faro', '  <p>Hola</p>'), 'Hola')
await app.menu('Libro', 'Fuentes incrustadas')
await app.esperar('document.querySelector(".fonts-dialog")')
app.log('filas:', await app.eval(`document.querySelectorAll('.font-rows li').length`))
await app.captura('01-fuentes')
await app.terminar()                   // dice si hubo errores en la consola
```

Escríbelo con **Write**, nunca con un heredoc: casi siempre lleva barras
invertidas y el Bash se las come.

Ayudas del arnés (mira `scripts/navegador/arnes.mjs` para el detalle):

| Ayuda | Para qué |
|---|---|
| `menu(titulo, opcion?)` | Abre un menú de la barra y pulsa una opción (por el principio del texto) |
| `boton(texto, dentro?)` | Pulsa un botón por su texto exacto |
| `abrirArchivo(nombre)` | Abre un archivo del árbol y espera a que sea el activo |
| `escribir(texto, debe?, noDebe?)` | Sustituye el documento tecleando, con reintentos |
| `raton(tipo, x, y, boton?)`, `tecla(key, code, vk, mods?)`, `centro(sel)` | Eventos reales (arrastrar = pressed, varios moved, released) |
| `alElegirArchivos([rutas])` | Lo llamas antes del clic que abre un selector de archivos |
| `leerVisor()` | Texto y fuente de la vista previa |
| `esperar(expr)` | Espera a que una expresión **síncrona** sea verdadera |
| `captura(nombre)` | PNG en `%TEMP%/epub-editor-navegador/` (o en `OUT_DIR`) |

Ejecuta con `timeout 200 node <escenario>.mjs`. El registro sale al momento,
así que si se corta verás hasta dónde llegó.

## Comprobar de verdad

- Comprueba **resultados**, no solo que no hubo error: el texto que quedó, el
  orden del árbol, las reglas que recibe el visor.
- Mira las capturas importantes con Read: así se ven solapes, cortes y
  colores que ninguna comprobación detecta.
- `terminar()` informa de los errores de la consola. «Consola: sin errores»
  forma parte del resultado.

## Si algo se tuerce

- **No responde ni a `1+1`**: la pestaña está colgada. Al iniciar, el arnés ya
  la cierra y abre otra. Si pasa en medio de un escenario, sospecha de un
  bucle infinito en el código nuevo; no es mala suerte.
- **Reintentos de `escribir`**: el editor tenía texto viejo. Si fallan los
  tres, la página no tiene el foco o el archivo abierto no es el que crees.
- **«espera agotada»**: haz una captura justo antes para ver qué hay en
  pantalla.
- Un `!!(promesa)` siempre es verdadero: en `esperar` no uses `await` ni
  funciones async.
