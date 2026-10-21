// Plantilla de EPUB 3 vacío con la estructura OEBPS/Text, Styles, Images.

import type { EpubBook, EpubFile } from './epub'

export function xhtmlTemplate(title: string, cssHref = '../Styles/style.css', body = '<p></p>'): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="es" lang="es">
<head>
  <title>${title}</title>
  <link href="${cssHref}" rel="stylesheet" type="text/css"/>
</head>
<body>
  <section epub:type="chapter" role="doc-chapter">
    <h1>${title}</h1>
    ${body}
  </section>
</body>
</html>
`
}

const STYLE = `@charset "utf-8";

body { margin: 0 1em; font-family: serif; line-height: 1.5; }
h1 { font-size: 1.4em; text-align: center; margin: 2em 0 1.5em; }
p { margin: 0; text-indent: 1.5em; text-align: justify; }
p.sin-sangria, h1 + p { text-indent: 0; }
p.centro { text-align: center; text-indent: 0; }
p.separador { text-align: center; text-indent: 0; margin: 1em 0; }
figure.dimg { margin: 0; text-align: center; page-break-inside: avoid; }
figure.dimg img { max-width: 100%; max-height: 100vh; }
a.nota { font-size: 0.75em; vertical-align: super; text-decoration: none; }
aside.nota-trad { font-size: 0.9em; margin: 0.5em 0; }
`

export function newEpub(title = 'Libro sin título'): EpubBook {
  const uid = `urn:uuid:${crypto.randomUUID()}`
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z')

  const opf = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="BookId" xml:lang="es">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="BookId">${uid}</dc:identifier>
    <dc:title>${title}</dc:title>
    <dc:language>es</dc:language>
    <dc:creator id="autor">Autor</dc:creator>
    <meta refines="#autor" property="role" scheme="marc:relators">aut</meta>
    <meta property="dcterms:modified">${now}</meta>
  </metadata>
  <manifest>
    <item id="nav" href="Text/toc.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="style.css" href="Styles/style.css" media-type="text/css"/>
    <item id="Cap01.xhtml" href="Text/Cap01.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="Cap01.xhtml"/>
  </spine>
</package>
`

  const nav = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="es" lang="es">
<head>
  <title>Índice</title>
  <link href="../Styles/style.css" rel="stylesheet" type="text/css"/>
</head>
<body>
  <nav epub:type="toc" id="toc" role="doc-toc">
    <h1>Índice</h1>
    <ol>
      <li><a href="Cap01.xhtml">Capítulo 1</a></li>
    </ol>
  </nav>
  <nav epub:type="landmarks" id="landmarks" hidden="">
    <ol>
      <li><a epub:type="bodymatter" href="Cap01.xhtml">Comienzo</a></li>
    </ol>
  </nav>
</body>
</html>
`

  const container = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
`

  const list: EpubFile[] = [
    { path: 'mimetype', mediaType: 'text/plain', text: 'application/epub+zip' },
    { path: 'META-INF/container.xml', mediaType: 'application/xml', text: container },
    { path: 'OEBPS/content.opf', mediaType: 'application/oebps-package+xml', text: opf },
    { path: 'OEBPS/Text/toc.xhtml', mediaType: 'application/xhtml+xml', text: nav },
    { path: 'OEBPS/Text/Cap01.xhtml', mediaType: 'application/xhtml+xml', text: xhtmlTemplate('Capítulo 1') },
    { path: 'OEBPS/Styles/style.css', mediaType: 'text/css', text: STYLE },
  ]
  return { files: new Map(list.map(f => [f.path, f])), opfPath: 'OEBPS/content.opf' }
}
