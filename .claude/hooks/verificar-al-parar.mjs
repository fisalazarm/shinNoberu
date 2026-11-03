// Hook Stop: antes de dar un turno por terminado, si el código de src/ cambió
// desde la última verificación, comprueba tipos, pruebas y lint. Si algo
// falla, devuelve "block" con el error para que Claude lo arregle en vez de
// decir que está hecho.
//
// Para no repetir 20 segundos de comprobaciones en cada respuesta, guarda una
// huella de src/ (rutas, tamaños y fechas) en .claude/.verificado y solo
// vuelve a comprobar si cambió.

import { execSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

let input = {}
try {
  let raw = ''
  for await (const chunk of process.stdin) raw += chunk
  input = JSON.parse(raw || '{}')
} catch { /* sin entrada: se verifica igual */ }

// En Windows la ruta llega a veces como «c:\…» y otras como «C:\…». Con la
// unidad en minúscula, Vite carga vitest dos veces y todas las pruebas
// revientan con «Cannot read properties of undefined (reading 'config')».
const root = (process.env.CLAUDE_PROJECT_DIR || process.cwd()).replace(/^([a-z]):/, (_, d) => `${d.toUpperCase()}:`)
const stamp = join(root, '.claude', '.verificado')

function fingerprint() {
  const h = createHash('sha1')
  const walk = dir => {
    for (const name of readdirSync(dir).sort()) {
      const p = join(dir, name)
      const s = statSync(p)
      if (s.isDirectory()) walk(p)
      // Ruta relativa: la huella no cambia por cómo venga escrita la raíz.
      else h.update(`${relative(root, p)}|${s.size}|${s.mtimeMs}\n`)
    }
  }
  walk(join(root, 'src'))
  return h.digest('hex')
}

const now = fingerprint()
let last = ''
try { last = readFileSync(stamp, 'utf8').trim() } catch { /* primera vez */ }
if (now === last) process.exit(0)

const run = (label, cmd) => {
  try {
    execSync(cmd, { cwd: root, stdio: 'pipe', encoding: 'utf8', timeout: 240_000 })
    return null
  } catch (e) {
    const out = `${e.stdout ?? ''}${e.stderr ?? ''}`.trim()
    // Lo último es lo que dice qué falló.
    return `${label} falló:\n${out.split('\n').slice(-40).join('\n')}`
  }
}

const lintErrors = () => {
  try {
    const out = execSync('npx oxlint', { cwd: root, stdio: 'pipe', encoding: 'utf8', timeout: 120_000 })
    const errs = out.split('\n').filter(l => / error /.test(l))
    return errs.length ? `Lint con errores:\n${errs.slice(0, 20).join('\n')}` : null
  } catch (e) {
    const out = `${e.stdout ?? ''}`.split('\n').filter(l => / error /.test(l))
    return `Lint con errores:\n${out.slice(0, 20).join('\n') || e.message}`
  }
}

const problem = run('npx tsc -b', 'npx tsc -b') ?? run('npm test', 'npm test') ?? lintErrors()

if (!problem) {
  writeFileSync(stamp, now)
  process.stdout.write(JSON.stringify({ systemMessage: 'Verificado: tipos, pruebas y lint en verde.' }))
  process.exit(0)
}

// Si ya se bloqueó una vez en esta parada, no se insiste: se avisa y se deja
// terminar, para no quedar en bucle con un fallo que Claude no puede arreglar.
if (input.stop_hook_active) {
  process.stdout.write(JSON.stringify({ systemMessage: `Sigue fallando la verificación:\n${problem.slice(0, 600)}` }))
  process.exit(0)
}

process.stdout.write(JSON.stringify({
  decision: 'block',
  reason: `La verificación de src/ no pasa. Arréglalo antes de terminar (o explica al usuario por qué no se puede):\n\n${problem}`,
}))
