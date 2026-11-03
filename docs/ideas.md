# Ideas para el editor

Qué conviene añadir, qué ya está hecho y qué se miró y no vale la pena. Antes
de proponer algo, mira las tres secciones.

## Propuestas

Investigación del 2026-11-02. Van ordenadas por valor dividido entre esfuerzo.

### 2. Imágenes y portada que las tiendas aceptan

**Qué es.** Ampliar las revisiones de «Antes de publicar» de portada e
imágenes con lo que de verdad piden las tiendas: imágenes WebP, JPEG en CMYK,
portada con proporción menor de 1,6:1 e ilustraciones demasiado grandes en
megapíxeles.

**Por qué vale.**
- **WebP.** El propio «Optimizar imágenes» ofrece convertir a WebP, y Kindle
  no lo garantiza: las guías de KDP hablan de JPEG, PNG y GIF, y WebP solo es
  formato válido desde EPUB 3.3 (en EPUB 3.0 no). Ahora mismo el editor puede
  estropear un libro él solo.
  Fuentes: [KDP, imágenes](https://kdp.amazon.com/en_US/help/topic/G75V4YX5X8GRGXWV),
  [Calibre, error de WebP](https://bugs.launchpad.net/calibre/+bug/1922341),
  [EPUB 3.3 añade WebP](https://www.w3.org/publishing/epub33/).
- **Portada.** KDP pide RGB, proporción alto/ancho de al menos 1,6:1, ideal
  2560×1600 y mínimo 1000×625 ([KDP, portada](https://kdp.amazon.com/es_ES/help/topic/G200645690)).
  Ahora solo se mira que tenga 1400 px de ancho.
- **Megapíxeles.** Apple e IngramSpark limitan los píxeles por imagen: 4
  millones según [Kotobee](https://blog.kotobee.com/publishing-amazon-ibookstore-10-things-watch/)
  y 5,6 millones según [ebookpbook](https://www.ebookpbook.com/2026/05/06/epub-passes-kindle-fails-apple-google/).
  No coinciden, y hay que comprobarlo en el Asset Guide de Apple.

**Quién lo tiene.** Nadie lo junta en el editor. Las tiendas lo rechazan al
subir el libro, y validadores sueltos de portada como el de
[builtwritten](https://www.builtwritten.com/tools/kdp-cover-validator) miran
solo la portada.

**Esfuerzo.** Pequeño (horas). `imageWidth` de `release.ts` ya recorre las
cabeceras PNG y JPEG; hay que sacar también el alto y el número de componentes
del marcador SOF (4 componentes es CMYK).

**Cómo encaja.** Bloques `coverBlock` e `imagesBlock` de `release.ts`. En
`ImagesDialog`, avisar junto a la opción WebP de que Kindle no lo garantiza, o
quitarla.

**Riesgo.** Ninguno para el libro: solo lee. Puede marcar en amarillo portadas
cuadradas puestas a propósito.

### 3. CSS que Kobo y Adobe Digital Editions no entienden

**Qué es.** Un aviso cuando la hoja de estilos usa CSS moderno que el motor de
Adobe (RMSDK) no sabe leer: `min()`, `max()`, `clamp()`, `calc()`, `var()`,
`@supports`, y también `display: flex` o `grid`.

**Por qué vale.** El libro pasa EPUBCheck, pero Kobo dice «libro dañado» y no
lo abre. El caso documentado es una sola línea, `max-width: min(150px, 30vw)`:
cambiarla por `150px` lo arregló. RMSDK es el motor de los Kobo con EPUB
normal y de ADE, y no ignora lo que no entiende: falla entero.
Fuentes: [André Klein](https://andreklein.net/your-epub-is-fine-kobo-disagrees-blame-adobe/),
[resumen en Gigazine](https://gigazine.net/gsc_news/en/20260616-epub-kobo-adobe).
Además, el CSS de cortesía que genera el propio editor (`CORTESIA_CSS` en
`frontMatter.ts`) usa `display: flex` y `90vh`, y `newEpub.ts` y la portada usan
`100vh`. Hay que probarlo en ADE.

**Quién lo tiene.** `kobofix`, un programa de línea de órdenes en Python
([pypi](https://pypi.org/project/kobofix/); la página no cargó y no se vio su
lista de reglas). Ningún editor lo avisa.

**Esfuerzo.** Pequeño (horas). Es buscar con regex en los `.css` y en los
`<style>`.

**Cómo encaja.** Bloque «Compatibilidad» nuevo en `release.ts` (amarillo), con
archivo y línea en `validate.ts`. Revisar de paso `CORTESIA_CSS` y dejarlo en
CSS 2.1 (márgenes en `em` en vez de flex).

**Riesgo.** Falsos positivos: no está confirmado que `flex` y `vh` *rompan* el
libro y no se ignoren sin más; la fuente solo confirma `min()`. Para ser
prudente, `min()/max()/clamp()/calc()/var()` en rojo y `flex/grid/vh` en
amarillo.

### 4. Páginas de ilustración a página completa, en lote

**Qué es.** Elegir varias imágenes (las ilustraciones a color del principio de
cada volumen, por ejemplo) y que el editor cree una página por imagen, a
pantalla completa y sin deformarla, colocadas donde digas en el orden de
lectura.

**Por qué vale.** Cada volumen de novela ligera trae de 4 a 10 láminas a color
y se hacen igual una y otra vez: un XHTML por imagen, con su envoltorio SVG,
sus medidas, su entrada en el spine y su alt. En MobileRead la técnica
recomendada para una imagen a página completa es el envoltorio SVG, con un
`viewBox` igual a las medidas de la imagen y
`preserveAspectRatio="xMidYMid meet"`. Sin él, la imagen sale a su tamaño
natural, que cambia según la pantalla.
Fuentes: [MobileRead, envoltorio SVG](https://www.mobileread.com/forums/showthread.php?p=4517923),
[MobileRead, imágenes a página completa](https://www.mobileread.com/forums/showthread.php?p=3100154).

**Quién lo tiene.** Atticus tiene un tipo de sección «Full Page Image»
([ayuda de Atticus](https://intercom.help/atticus-5877e36564df/en/articles/12758246-why-is-the-full-page-image-off-center-on-kindle)),
aunque reconoce que en Kindle puede quedar descentrada porque Amazon ignora su
CSS. Sigil genera el envoltorio SVG solo para la portada.

**Esfuerzo.** Medio (un día). Diálogo nuevo; hace falta leer el alto de la
imagen además del ancho (lo mismo que en la propuesta 2).

**Cómo encaja.** Módulo `src/lib/plates.ts`, hecho a imagen de `frontMatter.ts`
(páginas generadas con marca, clase `lamina` en el `body`). Usa `addToOpf` y el
orden del spine de `structure.ts`, y la plantilla de portada de `metadata.ts`,
que ya hace un envoltorio para la portada. Entrada nueva en el menú Insertar
(«Láminas a página completa…»). Hay que decidir si entran en el índice (por
defecto no) y en `visibleToc.ts`.

**Riesgo.** El envoltorio SVG no se ve igual en todas partes: en un caso de
MobileRead, iBooks en Mac enseñó solo una cuarta parte, y KDP dice que el SVG
da problemas en la app de iPad. Conviene dar la opción de usar `<img>` con CSS
sencillo en vez de SVG. Libros importados: no toca nada que ya exista.

### 5. Comillas y puntuación según la RAE

**Qué es.** Añadir a «Revisar el diálogo» las faltas de puntuación que trae una
traducción del inglés: punto o coma *antes* de la comilla de cierre («hola.» en
vez de «hola».), un punto tras ?, ! o …, y signos dobles que no se cierran en
espejo (¡¿…!? cuando se abrió ¡¿).

**Por qué vale.** En inglés el punto va dentro de las comillas y la traducción
lo arrastra. La RAE dice que el punto, la coma, el punto y coma y los dos puntos
van siempre después de las comillas de cierre, aunque dentro haya ? o …, y que
nunca va punto tras ?, ! o ….
Fuentes: [RAE, Ortografía 2010, concurrencia de signos](https://www.rae.es/ortografía/concurrencia-con-otros-signos),
[Universidad de Piura](https://www.udep.edu.pe/castellanoactual/nunca-punto-antes-de-cierre-de-comillas-parentesis-corchetes-o-rayas/).

**Quién lo tiene.** El «Smarten punctuation» de Calibre convierte comillas, pero
no se encontró nada que aplique las normas del español
([MobileRead](https://www.mobileread.com/forums/showthread.php?p=4536179)).

**Esfuerzo.** Pequeño (horas). Son códigos nuevos en `dialogue.ts`, con su
arreglo seguro.

**Cómo encaja.** `DialogueCode` y `CODE_LABELS` de `dialogue.ts`, y el bloque
`dialogueBlock` de `release.ts` los cuenta solo.

**Riesgo.** No hay que tocar las 「」 y 『』 que usan las traducciones de
novela ligera (están en los snippets de fábrica) ni las comillas de los
atributos: todo debe ir por `textRanges`, como en `tidy.ts`.

### 6. Accesibilidad mínima (EAA y EPUB Accessibility 1.1)

**Qué es.** Un botón que deja el libro con lo que la norma de accesibilidad
pide y se puede deducir del propio libro: los metadatos `schema:accessMode`,
`accessibilityFeature`, `accessibilityHazard` y `accessibilitySummary` en el
OPF; `lang` y `xml:lang` en cada página, y `<title>` donde falte. Y una lista de
imágenes con miniatura para escribir el alt (o marcarla como decorativa).

**Por qué vale.** EPUB Accessibility 1.1 obliga (*MUST*) a declarar
`accessMode`, `accessibilityFeature` y `accessibilityHazard`
([W3C](https://www.w3.org/TR/epub-a11y-11/)), y la ley europea de accesibilidad
se aplica a los ebooks desde el 28 de junio de 2025. Hoy el editor avisa del
alt que falta pero no da dónde escribirlo.

Lo que modera el valor: Google Play no lee estos metadatos del EPUB (se rellenan
en su Partner Center) y sigue vendiendo los libros tengan lo que tengan
([Google](https://support.google.com/books/partner/answer/16349906?hl=en)).
Además, las microempresas, que son casi todos los autores independientes,
están exentas
([Alliance of Independent Authors](https://selfpublishingadvice.org/european-accessibility-act/)).
Hoy no causa rechazos; es lo que se va a pedir.

**Quién lo tiene.** El plugin Access-Aide de Sigil hace casi exactamente esto:
metadatos, `lang`, `title`, mapear `epub:type` a `role` y una ventana con
miniaturas para el alt ([GitHub](https://www.github.com/kevinhendricks/Access-Aide)).
Su fallo es que escribe un `accessibilitySummary` que afirma cumplir WCAG AA
sin comprobarlo.

**Esfuerzo.** Medio (un día). Una primera versión pequeña, de medio día: los
metadatos y `lang`/`title`, más un bloque «Accesibilidad» en «Antes de
publicar». La lista de alt, después.

**Cómo encaja.** Metadatos por `opfDom.ts`, y un apartado en `MetadataDialog`.
`accessibilityFeature` se calcula: `tableOfContents` si hay nav,
`alternativeText` solo si todas las imágenes tienen alt, `readingOrder`,
`structuralNavigation` si hay h1/h2. La lista de alt puede ir en
`ImagesDialog`. El `role` que corresponde a cada `epub:type` ya lo escriben
`endnotes.ts` y `frontMatter.ts`.

**Riesgo.** Los libros de InDesign o de una editorial ya traen estos `meta`: hay
que añadir solo lo que falte, nunca duplicar. No se debe escribir nunca
`dcterms:conformsTo` solo: es una declaración de cumplimiento, y la norma exige
que la acompañe `a11y:certifiedBy`.

### 7. EPUBCheck de verdad, como segunda opinión

**Qué es.** Pasar el validador que usan las tiendas sin salir del editor y ver
sus errores en la misma lista de «Revisar el libro».

**Por qué vale.** KDP rechaza el libro si EPUBCheck da un ERROR o un FATAL (los
avisos sí pasan), y Google y Apple lo pasan al subir
([vappingo](https://www.vappingo.com/word-blog/kdp-file-rejection-reasons/),
[ebookpbook](https://www.ebookpbook.com/2026/05/06/epub-passes-kindle-fails-apple-google/)).
El propio `validate.ts` dice que no pretende sustituirlo. En Sigil es el primer
plugin que se instala.

**Quién lo tiene.** El plugin EpubCheck de Sigil (necesita Java 1.8 o más y
descarga 28 MB, [MobileRead](https://www.mobileread.com/forums/showthread.php?p=2950625)).
Calibre tiene su propio «Check book».

**Esfuerzo.** Medio con `@likecoin/epubcheck-ts` (BSD-3, ~450 KB de JS y 1,6 MB
de WASM; funciona en navegador, [GitHub](https://github.com/likecoin/epubcheck-ts)),
que habría que cargar en un worker como el del diccionario. Grande si se usa
el EPUBCheck de Java desde Rust (comando nuevo en `src-tauri`, Java instalado,
descarga aparte).

**Cómo encaja.** Worker al estilo de `spell.worker.ts`; los mensajes se traducen
al formato `Issue` de `validate.ts` y salen en `ProblemsDialog`. En «Antes de
publicar», como bloque opcional que se lanza a mano.

**Riesgo.** epubcheck-ts todavía no valida el esquema del XHTML y coincide con
EPUBCheck en el 88 % de los mensajes: dará falsos positivos y se le escaparán
errores. Hay que presentarlo como «segunda opinión», no como veredicto. El
libro no se toca.

## Hechas

- **Revisión de las notas** (propuesta 1, hecha el 2026-11-02). Está en
  `src/lib/noteCheck.ts` y en **Libro → Revisar las notas…**, con el bloque
  «Notas» en «Antes de publicar». Avisa de llamadas y vueltas rotas, vueltas
  que llevan a otra llamada, notas sin vuelta, con dos llamadas o sin ninguna,
  número de la llamada distinto del de la nota y números saltados, repetidos o
  fuera de orden. Reconoce la numeración por capítulo. Solo avisa; no arregla.
  Pendiente para otra vez: un «Renumerar» que lo deje todo seguido.

No había propuestas anteriores. Esto es lo que ya existía a 2026-11-02 según el
inventario, para no volver a proponerlo:

- **Estructura**: regenerar índice (nav y ncx) y landmarks, página de índice
  visible que se rehace sola, partir y fusionar capítulos, reordenar arrastrando,
  renombrar un archivo o en serie arreglando los enlaces, duplicar, notas al
  pie que pasan al final y vuelven, preliminares y cortesía (portadilla,
  créditos, dedicatoria, colofón), plantillas de maquetación.
- **Texto**: buscar y reemplazar en todo el libro sin entrar en las etiquetas,
  búsquedas guardadas, limpieza tipográfica (comillas latinas, rayas, puntos
  suspensivos, espacios), revisión del diálogo con raya, ortografía en español
  (subrayado, sugerencias, diccionario propio y del libro, ventana de todo el
  libro), concordancia de nombres propios, snippets con número de nota y
  variables (`{CAPNOTA}`), carácter especial, nombre del carácter bajo el
  cursor.
- **Estilo**: estilos de novela (capitular, sangría, separadores, títulos,
  guiones), fuentes incrustadas (licencia fsType, papeles texto, títulos y
  capitular), fusión de hojas de estilo, sangrado del XHTML.
- **Revisión**: «Revisar el libro» (mimetype, OPF, manifest, spine, XHTML mal
  formado, entidades, ids repetidos, enlaces rotos, alt, rutas absolutas),
  enlaces y archivos sueltos, informe del libro (palabras, capítulos,
  muletillas), y «Antes de publicar» con los bloques metadatos, portada,
  estructura, índice, enlaces, imágenes, fuentes, diálogo, nombres, contenido y
  archivos extraños.
- **Importar y exportar**: abrir y guardar EPUB (Tauri, File System Access o
  descarga), importar desde Word, pegar desde PDF, optimizar imágenes,
  metadatos y portada, recientes.
- **Interfaz**: paneles redimensionables, vista previa con tamaños de lector y
  tema oscuro, borrador automático, puntos de control y comparación, paleta de
  comandos, ir a un archivo, preferencias y temas.

## Descartadas

- **Reducir las fuentes a los caracteres usados** (Calibre lo hace): hace falta
  una librería WASM grande; muchas licencias lo prohíben (fsType tiene un bit
  para eso) y el peso del libro está en las imágenes, que ya se optimizan.
- **Exportar a KEPUB**: Kobo Writing Life acepta EPUB. Solo sirve para pasar
  libros al lector por cable, y la propuesta 3 cubre lo que de verdad rompe Kobo.
- **Exportar a KPF o a Kindle Create**: es un formato cerrado de Amazon, y KDP
  acepta EPUB.
- **Ruby o furigana**: en una traducción al español casi no se usa.
- **Lista de páginas (`page-list`)**: la norma solo la recomienda si el ebook
  equivale a una edición impresa con sus páginas, y no es el caso.
- **Revisar los honoríficos (-san, -kun)**: la concordancia de nombres ya junta
  las variantes, y no se encontró ninguna fuente que lo señale como problema
  frecuente.
- **Abrir en Kindle Previewer o ADE desde el editor**: ahorra poco, y necesita
  un plugin de Tauri nuevo y versiones a la par. Se puede reconsiderar junto a
  la propuesta 3.
- **Quitar el CSS que no se usa** (Calibre y Sigil lo hacen): aporta poco en una
  novela con una sola hoja. Lo que sí vale, avisar de clases que no existen en
  el CSS (`sin-sangira`), cabe en `validate.ts` si un día hace falta.
- **Traducir con IA dentro del editor**: fuera del alcance de una herramienta de
  maquetación.
