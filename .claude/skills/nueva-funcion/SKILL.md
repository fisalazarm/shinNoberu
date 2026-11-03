---
name: nueva-funcion
description: Receta para añadir una función nueva al EPUB Editor siguiendo cómo está hecho el proyecto (módulo puro en src/lib con pruebas, diálogo con Modal, unión en App.tsx con bulk/touch/flash, menú, CSS, revisión de «Antes de publicar»). Úsala cuando el usuario pida una herramienta, panel, diálogo, revisión o acción nueva para el editor, o al proponer y luego construir mejoras.
---

# Añadir una función

Lee primero el `CLAUDE.md` del proyecto: idioma, trampas y verificación.

## 1. Pensarla desde quien maqueta

Antes de programar, responde con una frase cada pregunta:

- ¿Qué problema de una novela real resuelve?
- ¿Qué toca del libro?
- ¿Cómo se deshace?

Si cambia muchos archivos, irá con `bulk`. Si escribe CSS o páginas que el
editor tendrá que reconocer después, lleva marca: un bloque entre comentarios
o una clase en el `body`.

## 2. La lógica, en `src/lib/<nombre>.ts`

- Sin React, solo funciones sobre `EpubBook`. Empieza el archivo con un
  comentario que explique el porqué, en el tono de los demás módulos.
- El texto del usuario se trata con regex, sin reserializar el XHTML. El OPF
  va con `opfDom.ts`.
- Reutiliza lo que ya hay: `epub.ts` (rutas, manifest, spine), `structure.ts`
  (índice, nav), `searchBook.ts` (`textRanges`), `files.ts` (`renameFile`),
  `novelStyle.ts` (`styleSheetFor`, bloques de CSS), `report.ts` (`titleOf`).
- Cuidado con los bucles sobre texto a medio escribir. Un `indexOf` que da -1
  y se usa como posición vuelve al principio y cuelga la app. Pruébalo.

## 3. Las pruebas, en `src/lib/<nombre>.test.ts`

- Libros con `newEpub()` y capítulos añadidos con `addToOpf`.
- Nombres de prueba en español que digan el comportamiento («quitar la última
  fuente quita el bloque y el archivo»).
- Incluye el caso raro: texto a medio escribir, libro sin hoja de estilos,
  archivo que ya existe. Y comprueba que `validateBook(book)` no da errores
  después del cambio.

## 4. El diálogo, en `src/components/<Nombre>Dialog.tsx`

- `Modal` con `title`, contenido y un `<footer>`: aviso a la izquierda,
  `Cancelar` (`ghost`) y la acción principal (`primary`).
- El diálogo es un borrador: no toca el libro. Llama a `onApply(cambios)` y la
  App aplica.
- Las clases CSS van con prefijo propio (`.fonts-…`, `.spell-…`). Añade una
  sección nueva al final de `src/index.css` y usa siempre las variables
  (`--accent`, `--border`, `--muted`…), nunca colores sueltos. La única
  excepción es una muestra de «papel» que imite al lector.

## 5. Unirlo en `src/App.tsx`

App.tsx es grande: parchéalo con un script de Python escrito con **Write**
(un `patch(rel, [(viejo, nuevo), …])` que falle si no encuentra el texto), o
con Edit si son pocos cambios.

1. `import` del diálogo y de la lógica.
2. Un `| { kind: '<nombre>' }` en `type Dialog`.
3. La acción `do<Nombre>`:
   ```ts
   const doAlgo = (cambios: X) => {
     setDialog(null)
     bulk('Antes de <hacer algo>', () => {
       const r = aplicarAlgo(book, cambios)
       if (!r) return null                 // sin cambios: no hay «Deshacer»
       resolver.invalidate(rutaTocada)     // si lo ve la vista previa
       return `<lo que pasó, con números>`
     })
   }
   ```
   Si el cambio es pequeño y fácil de revertir a mano, usa `touch()` y
   `flash()` sin `bulk`.
4. Una entrada en el menú que toque (`menus`), con `…` si abre un diálogo.
5. `{dialog?.kind === '<nombre>' && <Dialogo … />}` junto a los demás.

## 6. «Antes de publicar»

Si la función puede dejar el libro mal (una licencia, un enlace roto, un
estilo que falta), añade un bloque en `src/lib/release.ts`:

- `error` es lo que una tienda rechazaría.
- `warn` es lo que conviene mirar.
- Añade `opens` para que el bloque abra el diálogo.
- Pruébalo en el `.test.ts` de la función.

## 7. Verificar

Pasa la skill `verificar` y luego `probar-en-navegador`, con un escenario que
use la función como lo haría el usuario. Mira las capturas. Al terminar,
cuéntale al usuario qué hace la función, cómo se usa y qué fallos salieron al
probar.
