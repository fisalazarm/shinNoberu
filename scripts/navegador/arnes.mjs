// Arnés para probar la app en un navegador de verdad (Edge sin ventana) con
// clics y teclas reales por el protocolo de depuración (CDP).
//
//   import { iniciar } from './arnes.mjs'
//   const app = await iniciar()            // Edge + app limpia, sin borrador
//   await app.abrirArchivo('Cap01.xhtml')
//   await app.escribir(app.capitulo('El faro', '<p>Hola</p>'), 'Hola')
//   app.log('subrayadas:', await app.eval(`document.querySelectorAll('.cm-misspelled').length`))
//   await app.captura('01-algo')
//   await app.terminar()
//
// Necesita el servidor de desarrollo (`npm run dev`, puerto 5173). Edge se
// arranca solo si no hay uno escuchando en el 9222.
//
// Lecciones que ya están resueltas aquí, para no volver a tropezar:
//  - Node pierde lo que tenía en el búfer si se le corta: `log` escribe al momento.
//  - Una pestaña puede quedarse colgada (no responde ni a `1+1`): se cierra y se abre otra.
//  - La app guarda un borrador y lo recupera al recargar: hay que borrarlo y ESPERAR.
//  - CodeMirror solo pinta las líneas visibles: `.cm-content` no tiene todo el texto
//    en documentos largos. Para leer un archivo entero, usa `leerVisor()` o archivos cortos.
//  - Escribir en el editor a veces deja texto viejo: `escribir` comprueba y reintenta.
//  - Los diálogos nativos (confirm, alert) se aceptan solos.
//  - Para elegir archivos (fuentes, imágenes), `alElegirArchivos([...rutas])` antes del clic.

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const PUERTO = 9222
const APP = process.env.APP_URL ?? 'http://localhost:5173'
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
export const SALIDA = process.env.OUT_DIR ?? path.join(os.tmpdir(), 'epub-editor-navegador')

export const log = (...a) =>
  fs.writeSync(1, a.map(x => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ') + '\n')
export const dormir = ms => new Promise(r => setTimeout(r, ms))

class CDP {
  constructor(ws) {
    this.ws = ws
    this.id = 0
    this.esperas = new Map()
    this.errores = []
    ws.onmessage = e => {
      const m = JSON.parse(e.data)
      if (m.id && this.esperas.has(m.id)) {
        const w = this.esperas.get(m.id)
        this.esperas.delete(m.id)
        if (m.error) w.reject(new Error(JSON.stringify(m.error)))
        else w.resolve(m.result)
      } else if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type)) {
        this.errores.push(m.params.args.map(a => a.value ?? a.description).join(' '))
      } else if (m.method === 'Runtime.exceptionThrown') {
        this.errores.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text)
      } else if (m.method === 'Page.javascriptDialogOpening') {
        this.send('Page.handleJavaScriptDialog', { accept: true })
      }
    }
  }

  static async conectar(url) {
    const ws = new WebSocket(url)
    await new Promise((r, j) => { ws.onopen = r; ws.onerror = () => j(new Error('no se pudo conectar al CDP')) })
    return new CDP(ws)
  }

  send(method, params = {}, espera = 30_000) {
    const id = ++this.id
    return new Promise((res, rej) => {
      const t = setTimeout(() => { this.esperas.delete(id); rej(new Error(`sin respuesta a ${method}`)) }, espera)
      this.esperas.set(id, { resolve: v => { clearTimeout(t); res(v) }, reject: e => { clearTimeout(t); rej(e) } })
      this.ws.send(JSON.stringify({ id, method, params }))
    })
  }

  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text)
    return r.result.value
  }
}

async function json(ruta, init) {
  const r = await fetch(`http://127.0.0.1:${PUERTO}${ruta}`, init)
  return r.headers.get('content-type')?.includes('json') ? r.json() : r.text()
}

async function asegurarEdge() {
  try { await json('/json/version'); return } catch { /* no hay Edge escuchando */ }
  const perfil = path.join(os.tmpdir(), 'epub-editor-edge-perfil')
  spawn(EDGE, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${PUERTO}`, `--user-data-dir=${perfil}`, 'about:blank'],
    { detached: true, stdio: 'ignore' }).unref()
  for (let i = 0; i < 40; i++) {
    await dormir(250)
    try { await json('/json/version'); return } catch { /* aún arrancando */ }
  }
  throw new Error('Edge no arrancó con el puerto de depuración')
}

async function asegurarServidor() {
  try { await fetch(APP) } catch {
    throw new Error(`No responde ${APP}. Arranca el servidor con \`npm run dev\` (en segundo plano) y vuelve a probar.`)
  }
}

/** Una pestaña que responde; si la que hay está colgada, se cierra y se abre otra. */
async function pestana() {
  const lista = await json('/json/list')
  const pagina = lista.find(t => t.type === 'page')
  if (pagina) {
    const cdp = await CDP.conectar(pagina.webSocketDebuggerUrl)
    try {
      await cdp.send('Runtime.evaluate', { expression: '1' }, 5000)
      return cdp
    } catch {
      log('(la pestaña estaba colgada: se abre otra)')
      cdp.ws.close()
      await json(`/json/close/${pagina.id}`)
    }
  }
  const nueva = await json(`/json/new?${APP}`, { method: 'PUT' })
  await dormir(1500)
  return CDP.conectar(nueva.webSocketDebuggerUrl)
}

export async function iniciar({ ancho = 1600, alto = 1000, tema = 'dark', limpiarLocal = [] } = {}) {
  await asegurarServidor()
  await asegurarEdge()
  fs.mkdirSync(SALIDA, { recursive: true })
  const cdp = await pestana()
  await cdp.send('Page.enable')
  await cdp.send('Runtime.enable')
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: ancho, height: alto, deviceScaleFactor: 1.5, mobile: false })

  const app = {
    cdp,
    log,
    dormir,
    eval: e => cdp.eval(e),

    async esperar(expr, { tiempo = 20_000 } = {}) {
      const fin = Date.now() + tiempo
      while (Date.now() < fin) {
        // Ojo: `!!(promesa)` siempre es true; la expresión tiene que ser síncrona.
        try { if (await cdp.eval(`!!(${expr})`)) return } catch { /* aún no */ }
        await dormir(150)
      }
      throw new Error('espera agotada: ' + expr)
    },

    async captura(nombre) {
      const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' })
      const f = path.join(SALIDA, `${nombre}.png`)
      fs.writeFileSync(f, Buffer.from(data, 'base64'))
      log('captura:', f)
      return f
    },

    /** Pulsa un menú de la barra superior y luego una de sus opciones (por el principio del texto). */
    async menu(titulo, opcion) {
      const ok = await cdp.eval(`(function(){
        var b = Array.from(document.querySelectorAll('.menu-title')).find(function(x){ return x.textContent.trim() === ${JSON.stringify(titulo)} })
        if (!b) { return false } b.click(); return true })()`)
      if (!ok) throw new Error('no hay menú ' + titulo)
      await dormir(250)
      if (opcion == null) return
      const ok2 = await cdp.eval(`(function(){
        var b = Array.from(document.querySelectorAll('.menu button')).find(function(x){
          var l = x.querySelector('.label'); return l && l.textContent.indexOf(${JSON.stringify(opcion)}) === 0 })
        if (!b) { return false } b.click(); return true })()`)
      if (!ok2) throw new Error(`no hay «${opcion}» en ${titulo}`)
    },

    /** Pulsa el botón cuyo texto es exactamente ese, dentro de `dentro` (por defecto, todo). */
    async boton(texto, dentro = 'body') {
      const ok = await cdp.eval(`(function(){
        var b = Array.from(document.querySelectorAll(${JSON.stringify(dentro)} + ' button')).find(function(x){ return x.textContent.trim() === ${JSON.stringify(texto)} })
        if (!b) { return false } b.click(); return true })()`)
      if (!ok) throw new Error(`no hay botón «${texto}» en ${dentro}`)
    },

    async abrirArchivo(nombre) {
      const ok = await cdp.eval(`(function(){
        var b = Array.from(document.querySelectorAll('.tree .file')).find(function(x){ return x.textContent.trim() === ${JSON.stringify(nombre)} })
        if (!b) { return false } b.click(); return true })()`)
      if (!ok) throw new Error('no está en el árbol: ' + nombre)
      await app.esperar(`(document.querySelector('.tree li.active .name') || {}).textContent === ${JSON.stringify(nombre)}`)
      await dormir(350)
    },

    /** Reemplaza el documento abierto por `texto` tecleándolo de verdad; reintenta si no entra entero. */
    async escribir(texto, debe, noDebe) {
      const esperado = texto.replace(/\s+/g, ' ').length
      for (let intento = 1; intento <= 3; intento++) {
        const at = await cdp.eval(`(function(){ var r = document.querySelector('.cm-content').getBoundingClientRect()
          return { x: Math.round(r.left + 60), y: Math.round(r.top + 30) } })()`)
        await app.raton('mousePressed', at.x, at.y)
        await app.raton('mouseReleased', at.x, at.y)
        await dormir(300)
        await app.tecla('a', 'KeyA', 65, 2)
        await dormir(200)
        await cdp.send('Input.insertText', { text: texto })
        await dormir(700)
        const hay = await cdp.eval(`document.querySelector('.cm-content').textContent`)
        const sobra = hay.length > esperado * 1.15
        const falta = debe && !hay.includes(debe)
        const cuela = noDebe && hay.includes(noDebe)
        if (!sobra && !falta && !cuela) return
        log(`  (reintento ${intento}: ${falta ? 'no entró el texto' : sobra ? 'quedó texto viejo' : 'quedó ' + noDebe})`)
      }
      throw new Error('no pude dejar el archivo como quería')
    },

    /** Un evento de ratón real. `boton`: 'left' | 'right'. */
    raton(tipo, x, y, boton = 'left') {
      const pulsado = tipo === 'mouseReleased' ? 0 : boton === 'right' ? 2 : 1
      return cdp.send('Input.dispatchMouseEvent', { type: tipo, x, y, button: boton, buttons: tipo === 'mouseMoved' && boton === 'none' ? 0 : pulsado, clickCount: 1 })
    },

    /** Una tecla real. `mods`: 1 Alt, 2 Ctrl, 4 Meta, 8 Shift (se suman). */
    async tecla(key, code, vk, mods = 0) {
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', modifiers: mods, key, code, windowsVirtualKeyCode: vk })
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', modifiers: mods, key, code, windowsVirtualKeyCode: vk })
    },

    /** Centro de un elemento, para hacer clic en él con `raton`. */
    centro: selector => cdp.eval(`(function(){ var e = document.querySelector(${JSON.stringify(selector)}); if (!e) { return null }
      var r = e.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } })()`),

    /** El selector de archivos que se abra a continuación recibe estas rutas. */
    async alElegirArchivos(rutas) {
      await cdp.send('Page.setInterceptFileChooserDialog', { enabled: true })
      const absolutas = rutas.map(r => path.resolve(r))
      const oyente = e => {
        const m = JSON.parse(e.data)
        if (m.method !== 'Page.fileChooserOpened') return
        cdp.ws.removeEventListener('message', oyente)
        cdp.send('DOM.setFileInputFiles', { files: absolutas, backendNodeId: m.params.backendNodeId })
      }
      cdp.ws.addEventListener('message', oyente)
    },

    /** Lo que se ve en la vista previa (texto del cuerpo, fuente y reglas que aplican). */
    leerVisor: () => cdp.eval(`(function(){
      var f = document.querySelector('.preview-pane iframe'); var d = f && f.contentDocument
      if (!d || !d.body) { return null }
      return { texto: d.body.innerText, fuente: getComputedStyle(d.body).fontFamily } })()`),

    capitulo: (titulo, cuerpo, css = '../Styles/style.css') => `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>${titulo}</title>${css ? `<link href="${css}" rel="stylesheet" type="text/css"/>` : ''}</head>
<body>
  <h1>${titulo}</h1>
${cuerpo}
</body>
</html>`,

    /** Cierra la conexión y dice si la consola de la página tuvo errores. */
    async terminar() {
      log(cdp.errores.length ? 'Consola: ' + cdp.errores.join(' | ') : 'Consola: sin errores ni avisos')
      cdp.ws.close()
      process.exit(0)
    },
  }

  // App limpia: sin borrador del libro anterior ni la plantilla por defecto.
  await cdp.send('Page.navigate', { url: APP })
  await app.esperar('document.querySelector(".tree .row")')
  await cdp.eval(`localStorage.setItem('epub-editor.theme', ${JSON.stringify(tema)})`)
  await cdp.eval(`(async function(){
    localStorage.removeItem('epub-editor.plantilla-defecto');
    ${JSON.stringify(limpiarLocal)}.forEach(function(k){ localStorage.removeItem(k) });
    return (await import('/src/lib/autosave.ts')).clearDraft() })()`)
  await cdp.send('Page.reload')
  await app.esperar('document.querySelector(".cm-content")')
  await dormir(900)
  return app
}
