# ShinNoberu

ShinNoberu (新ノベル) es un editor de EPUB 3 para maquetar novelas (sobre todo novelas ligeras traducidas
al español). App de escritorio con Tauri 2; la interfaz es React + TypeScript
+ CodeMirror 6 y el libro se maneja en memoria con JSZip.

## Idioma

Todo en español: textos de la interfaz, comentarios, nombres de pruebas,
mensajes de commit y lo que se le cuenta al usuario. Los identificadores del
código siguen en inglés (`applyFonts`, `readToc`), igual que el resto del código.

## Comandos

| Qué | Comando |
|---|---|
| Servidor de desarrollo (navegador) | `npm run dev` → http://localhost:5173 |
| App de escritorio en desarrollo | `npm run tauri dev` |
| Tipos | `npx tsc -b` |
| Pruebas (vitest + jsdom) | `npm test` |
| Lint (oxlint) | `npm run lint`: solo cuentan los **errores**; los avisos `exhaustive-deps` con `rev` son a propósito |
| Compilar la web | `npm run build` |
| Ejecutable e instaladores | `npm run tauri build` → `src-tauri/target/release/` y `bundle/nsis`, `bundle/msi` |
| Probar en un navegador de verdad | `node scripts/navegador/humo.mjs` (ver la skill `probar-en-navegador`) |

Las versiones de `@tauri-apps/plugin-*` en npm deben ir a la par que los
crates de Rust: si no, `tauri build` falla.

## Cómo está hecho

- `src/lib/`: la lógica, **sin React**, cada módulo con su `*.test.ts` al lado.
  Las pruebas construyen libros con `newEpub()` y `addToOpf()`.
- `src/components/`: diálogos y paneles. Casi todos son un `Modal` con un
  `<footer>` de botones.
- `src/App.tsx`: el estado del libro y la unión de todo. Lo que hay que saber:
  - El libro (`EpubBook`) se modifica **en el sitio**. Tras cambiarlo, llama a
    `touch()`, que sube `rev` y marca el libro como modificado. Los `useMemo`
    que leen el libro dependen de `rev` a propósito.
  - `bulk(etiqueta, () => mensaje | null)` es para cambios de todo el libro:
    crea un punto de control, aplica y ofrece «Deshacer». Si devuelve null, no
    hubo cambios.
  - `flash(msg)` deja un aviso en la barra de estado.
  - Los diálogos son la unión `type Dialog` (`{ kind: '…' }`); los menús, el
    array `menus`.
  - Si cambian archivos que enseña la vista previa, `resolver.invalidate(ruta)`.
- El texto del usuario se trata con **regex, no con DOM**: serializar el XHTML
  perdería su sangría y sus comillas. El OPF sí va por DOM (`opfDom.ts`), con
  cuidado de no tocar la sangría.
- Las partes que gestiona el editor llevan marca, para tocar solo lo suyo:
  - En el CSS, un bloque entre comentarios de inicio y de fin (estilos de
    novela, fuentes incrustadas).
  - En las páginas, una clase en el `body` (`indice-visible`, `notas-al-final`,
    `cortesia`).
- Los estilos de la app son variables CSS (`--accent`, `--danger`, `--warn`,
  `--muted`, `--border`, `--canvas`, `--raised`, `--hover`, `--r-md`) en
  `src/index.css`, que se organiza en secciones `/* ---------- nombre ---------- */`.
- Las revisiones de «Antes de publicar» son bloques en `src/lib/release.ts`.
  Si una función nueva puede romper un libro, añade ahí su bloque.

## Trampas conocidas

- **La herramienta Bash se come la mitad de las barras invertidas**, también en
  heredocs entre comillas. Todo lo que lleve `\` (regex, `'\n'`, rutas de
  Windows, parches en Python) se escribe con **Write/Edit** y luego se ejecuta.
  El hook `guardia-bash` bloquea los heredocs con `\`.
- Al inyectar JS en la página con CDP, una línea que empieza por `[` o `(` se
  pega a la anterior sin punto y coma.
- Si `npm test` falla en **todos** los archivos con `Cannot read properties of
  undefined (reading 'config')`, se lanzó desde una ruta con la unidad en
  minúscula (`c:\…`): Vite carga vitest dos veces. Lánzalo desde `C:\…`.
- CodeMirror solo pinta las líneas visibles: `.cm-content.textContent` no es el
  documento entero.
- La app recupera el borrador al recargar: en las pruebas, `clearDraft()` y
  esperar antes de recargar (el arnés ya lo hace).

## Git

- Commit solo cuando el usuario lo pida, y en una rama, nunca en `main`.
- Nada de `git stash`, `reset --hard`, `clean`, `checkout --` o `restore` sin
  que el usuario lo pida expresamente: el hook `guardia-bash` los bloquea.

## Verificar antes de dar algo por hecho

`npx tsc -b` → `npm test` → `npm run build` → `npm run lint` (0 errores) y, si
cambió la interfaz, probarlo en el navegador. El hook de Stop pasa tipos,
pruebas y lint solo si `src/` cambió, y no deja terminar si algo falla.
