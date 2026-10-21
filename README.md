# EPUB Editor

Editor de EPUB enfocado en maquetar novelas: snippets de etiquetas con atajos,
vista previa en vivo y **pegado inteligente desde PDF** (une líneas, arma palabras
cortadas con guion, quita números de página y envuelve cada párrafo en `<p>`).

El cuadro del pegado va enlazado en los dos sentidos: al mover el cursor por el
texto de la izquierda se marca el párrafo que sale de ahí, y al pinchar un
párrafo de la derecha vuelve a su origen.

Además cubre el libro entero: metadatos y portada, índice generado desde los
encabezados, partir un capítulo largo en varios, reordenar capítulos, buscar y
reemplazar en todos los archivos a la vez, notas al pie numeradas solas y una
revisión que señala lo que rompe el EPUB. Tiene tema claro y oscuro, y guarda un
borrador por si se cierra el navegador.

Stack: Tauri 2 + Vite + React + TypeScript, CodeMirror 6 y JSZip.

## Correr en el navegador (sin Rust)

```bash
npm install
npm run dev        # http://localhost:5173
```

En Edge y Chrome, "Guardar" escribe encima del `.epub` que abriste, como un
editor de verdad: se pide permiso la primera vez y a partir de ahí Ctrl+S va
directo al archivo. En Firefox y Safari, que no tienen esa API, cada guardado
descarga una copia; la barra de estado dice en cuál de los dos casos estás.

## Correr como app de escritorio (Tauri)

Una sola vez, instala Rust y las herramientas de compilación de C++ (Windows):

1. https://rustup.rs → `rustup-init.exe`
2. Visual Studio Build Tools con "Desarrollo para el escritorio con C++"
   (WebView2 ya viene con Windows 11).

Después:

```bash
npm run tauri dev      # app de escritorio con recarga en caliente
npm run tauri build    # instalador en src-tauri/target/release/bundle
```

## Atajos

| Atajo | Acción |
|---|---|
| Ctrl+P | Envolver selección (o cada línea seleccionada) en `<p>` |
| Ctrl+I / Ctrl+B | `<em>` / `<strong>` |
| Ctrl+E | `<p class="centro">` |
| Alt+1 / Alt+2 | `<h1>` / `<h2>` |
| Ctrl+K | Todos los comandos |
| Ctrl+P | Ir a un archivo por su nombre |
| Ctrl+V | Pegado inteligente (en archivos XHTML, si está activado) |
| Ctrl+Shift+V | Pegar sin limpiar |
| Ctrl+Alt+N | Nota al pie con el siguiente número libre |
| Ctrl+Shift+F | Buscar y reemplazar en todo el libro |
| Ctrl+W | Cerrar la pestaña actual |
| Ctrl+S / Ctrl+O | Guardar / Abrir |

Los snippets se editan desde el botón ⚙ (o en `src/snippets.json` para los de
fábrica). El diálogo tiene dos modos:

- **Ventana** — lista a la izquierda, formulario a la derecha: nombre, atajo
  (se pulsa la combinación y queda grabada), envolver la selección o insertar un
  bloque, y una vista previa de cómo queda. Avisa si dos comparten atajo.
- **JSON** — el mismo contenido en crudo, para pegar o retocar a mano. Se pasa de
  un modo al otro sin perder los cambios.

En el texto de un snippet, `|` marca dónde queda el cursor.

## La ventana

Arriba hay una **barra de menús** (Archivo, Edición, Insertar, Libro, Vista) con
todos los comandos y su atajo al lado. La barra de botones se quedó con lo que
se toca a todas horas: Guardar, + Capítulo, Pegar desde PDF y Revisar.

## El libro, no solo el texto

- **Metadatos** — título, autor (con nombre para ordenar), saga y número, idioma,
  editorial, fecha, ISBN, etiquetas y sinopsis. Se escriben como EPUB 3.
- **Portada** — elige una imagen (botón ☆ en el árbol, o desde Metadatos) y se
  encarga del resto: `cover-image`, el `<meta name="cover">` que aún piden
  algunos lectores, el XHTML de portada y ponerlo primero.
- **Índice** — lo rehace con los encabezados de los capítulos, anidando los `h2`
  bajo su `h1`. Puede generar también `toc.ncx` para lectores antiguos.
- **Orden de lectura** — las flechas ↑↓ del árbol mueven el capítulo en el spine.
- **Buscar y reemplazar** — en todos los archivos, con regex opcional. Por
  defecto **ignora lo que hay dentro de las etiquetas**: pasar `"` a `«` tocaría
  si no cada `href` y cada `xmlns`, y dejaría el libro ilegible.
- **Partir capítulo** — corta en cada encabezado o por donde esté el cursor. El
  archivo original se queda con el primer trozo y los demás van detrás en el
  orden de lectura, heredando la cabecera (hoja de estilos, envoltorio) y con su
  `<title>` puesto. Es el paso siguiente a pegar un PDF entero.
- **Limpiar documento** — comillas rectas a «latinas», guiones de diálogo a
  rayas, espacios dobles, espacios duros colados del PDF y puntos suspensivos.
  Con el recuento por regla y la vista previa de cada cambio antes de aplicarlo,
  sobre un capítulo o sobre el libro entero. Como en buscar y reemplazar, no
  toca lo que hay dentro de las etiquetas —ni la sangría del XHTML.
- **Puntos de control** — copias del libro entero que puedes nombrar y
  restaurar, con un botón para **comparar**: qué archivos cambiaron y cuántas
  líneas entraron y salieron en cada uno.

  Además se crea uno **solo, antes de cada operación masiva** (reemplazar todo,
  limpiar el libro, partir un capítulo, regenerar el índice, optimizar
  imágenes) y aparece un aviso con **Deshacer**. Hace falta porque el editor
  solo mantiene historial del archivo abierto: sin esto, un reemplazo en
  cuarenta capítulos no tendría vuelta atrás.
- **Optimizar imágenes** — redimensionar y recomprimir en lote, con el antes y
  el después de cada una y cuánto se ahorra en total antes de aplicar nada. Los
  PNG y los GIF se quedan en PNG para no perder la transparencia.
- **Insertar carácter** — un cuadro con lo que de verdad se usa maquetando
  (— «» 「」 ◇ espacio duro…), cada uno con su nombre y su código.
- **Revisar** — XHTML mal formado, ids repetidos (lo que descoloca las notas al
  pie), enlaces e imágenes que no existen, fragmentos `#id` que no llevan a
  ninguna parte, archivos fuera del manifest y metadatos obligatorios que faltan.
  Al hacer clic en un problema salta al archivo y la línea.

## Comodidades

- **Archivos recientes** — en el menú Archivo, los últimos ocho libros. No es
  una lista de nombres: en Edge y Chrome se guarda el asidero del archivo, así
  que al pulsarlo se reabre de verdad (pidiendo permiso otra vez, porque caduca
  al cerrar el navegador) y Guardar vuelve a escribir en él. Solo se recuerda
  lo que se puede reabrir.
- **Clic derecho en el árbol** — menú contextual con duplicar, renombrar,
  eliminar, mover en el orden de lectura, partir el capítulo o usar la imagen
  como portada. La copia se llama `Cap01-copia.xhtml` y entra en el orden de
  lectura justo detrás del original.
- **Árbol por carpetas reales** — `Text`, `Styles`, `Images`, `Fonts`… tal y
  como están dentro del EPUB, plegables. La carpeta del OPF no se muestra: casi
  todo cuelga de ella y ese nivel de más no aporta nada.
- **Pestañas de archivos abiertos** — varios archivos a la vez, con el historial
  de deshacer de cada uno intacto al saltar entre ellos. Botón central o Ctrl+W
  para cerrar.
- **Carácter bajo el cursor** — la barra de estado dice qué hay delante del
  cursor con su nombre y código: `raya (U+2014)`, `semirraya (U+2013)`,
  `guion (U+002D)`. Lo que no se ve —espacios duros, guiones blandos, espacios
  de ancho cero— sale marcado. Es la forma de cazar lo que un PDF cuela.
- **Índice navegable** — en pestaña junto a la vista previa, con su jerarquía;
  al hacer clic salta al capítulo.
- **Soltar archivos** — arrastra imágenes, CSS o fuentes sobre la ventana para
  añadirlos; un `.epub` suelto abre el libro.
- **Zoom de la vista previa** — del 60 % al 200 %.
- **Vista previa en claro u oscuro** — el botón ☀/☽ del panel la cambia. Sigue
  al tema de la app hasta que elijas uno a mano. No toca el EPUB: solo cómo se
  ve aquí. Si un libro fija sus propios colores de texto puede que no cambien;
  entonces vuelve al claro, que es como lo verá el lector.
- **Preferencias** (Ctrl+,) — cuatro pestañas:
  - *Tipografía*: fuente del editor, de la interfaz y con serifa, con pilas
    habituales o la que escribas, más tamaño e interlineado.
  - *Interfaz*: fondo, paneles, texto, bordes y acento.
  - *Sintaxis*: los diez colores del resaltado, con una muestra en vivo.
  - *JSON*: cualquier variable, no solo las de las otras pestañas
    (`--sunken`, `--danger`, `--r-md`…).

  Todo el aspecto son variables CSS, así que un tema propio es sobrescribirlas.
  Los colores se guardan por separado en claro y en oscuro; las tipografías
  valen para los dos.
- **Tema claro y oscuro** — el botón de la esquina los alterna y recuerda la
  elección; sin elección previa manda el sistema. El editor cambia con la app,
  cada uno con su propia paleta de sintaxis: etiquetas, atributos, valores,
  selectores y propiedades se distinguen igual en los dos.
- **Borrador automático** — cada pocos segundos se guarda el libro entero en
  IndexedDB. Si se cierra el navegador, al volver ofrece recuperarlo. Se borra
  al guardar el `.epub` de verdad.
- **Ancho de la hoja** — la vista previa se ve sobre una hoja centrada, con tres
  anchos, para comprobar el largo de línea como se leerá.
- **Conteo de palabras** — del capítulo abierto y del libro entero, en la barra
  de estado.

## Estructura

- `src/lib/pdfPaste.ts` — heurística de pegado desde PDF (con tests: `npm test`)
- `src/lib/epub.ts` — abrir/guardar EPUB, manifest, spine, rutas
- `src/lib/preview.ts` — vista previa con imágenes/CSS/fuentes del libro
- `src/lib/metadata.ts` — metadatos del OPF y portada
- `src/lib/structure.ts` — spine, índice desde encabezados y `toc.ncx`
- `src/lib/validate.ts` — revisión del libro
- `src/lib/searchBook.ts` — buscar y reemplazar en todos los archivos
- `src/lib/footnotes.ts` — notas al pie numeradas
- `src/lib/split.ts` — partir un capítulo en varios archivos
- `src/lib/autosave.ts` — borrador en IndexedDB
- `src/lib/theme.ts`, `src/lib/editorTheme.ts` — tema claro y oscuro
- `src/lib/settings.ts` — preferencias: tipografías y temas propios
- `src/lib/words.ts` — conteo de palabras
- `src/lib/charName.ts` — nombre del carácter bajo el cursor
- `src/lib/files.ts` — duplicar un archivo
- `src/lib/recents.ts` — archivos recientes
- `src/lib/diff.ts` — comparar con un punto de control
- `src/lib/images.ts` — optimizar imágenes
- `src/lib/tidy.ts` — limpieza tipográfica
- `src/lib/checkpoints.ts` — puntos de control
- `src/lib/db.ts` — IndexedDB compartido
- `src/lib/opfDom.ts` — leer y escribir el OPF como DOM
- `src/lib/snippets.ts` — snippets y atajos
- `src/lib/fileIO.ts` — diálogos nativos en Tauri, input/descarga en navegador
- `src-tauri/` — app de escritorio (plugins dialog y fs)
