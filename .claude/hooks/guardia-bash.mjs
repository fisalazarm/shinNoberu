// Hook PreToolUse (Bash): para los comandos que ya nos han hecho daño en este
// proyecto antes de que se ejecuten.
//
//  - git stash, reset --hard, clean, checkout -- … : se llevan por delante el
//    trabajo sin commit. Un `git stash` colado al final de un comando ya
//    escondió todos los cambios de una sesión.
//  - heredocs con barras invertidas: la herramienta Bash se come la mitad de
//    las barras, así que una regex o un '\n' escritos con `cat <<EOF` o
//    `python - <<EOF` llegan rotos sin avisar. Esos archivos se escriben con
//    la herramienta Write.
//
// Responde con permissionDecision "deny" y el motivo, que Claude lee y corrige.

let raw = ''
for await (const chunk of process.stdin) raw += chunk

let command = ''
try {
  command = JSON.parse(raw).tool_input?.command ?? ''
} catch {
  process.exit(0) // sin entrada legible no se bloquea nada
}

const deny = reason => {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  }))
  process.exit(0)
}

// Cada trozo de una cadena de comandos se mira por separado.
const parts = command.split(/&&|\|\||;|\n|\|/).map(p => p.trim())

const GIT_RULES = [
  [/^git\s+stash(?!\s+(list|show)\b)/, 'git stash esconde todos los cambios sin commit del usuario.'],
  [/^git\s+reset\b.*--hard/, 'git reset --hard borra los cambios sin commit.'],
  [/^git\s+clean\b/, 'git clean borra archivos sin seguimiento (componentes y pruebas nuevas).'],
  [/^git\s+checkout\b.*(\s--\s|\s\.$|\s--$)/, 'git checkout -- descarta cambios de archivos.'],
  [/^git\s+restore\b(?!.*--staged)/, 'git restore sin --staged descarta cambios de archivos.'],
  [/^git\s+push\b.*(--force|-f\b)/, 'git push --force reescribe la historia remota.'],
]

for (const p of parts) {
  for (const [re, why] of GIT_RULES) {
    if (re.test(p)) {
      deny(`${why} En este proyecto no se hace sin que el usuario lo pida expresamente. ` +
        'Si lo pidió, pídele que lo ejecute él o que confirme de nuevo.')
    }
  }
}

// Heredoc con alguna barra invertida en el cuerpo.
const heredoc = command.match(/<<-?\s*(['"]?)(\w+)\1[^\n]*\n([\s\S]*?)\n\s*\2\s*$/m)
if (heredoc && heredoc[3].includes('\\')) {
  deny('Este heredoc lleva barras invertidas y la herramienta Bash se come la mitad: ' +
    'regex, \\n y rutas de Windows llegarían rotas sin avisar. Escribe el archivo con la ' +
    'herramienta Write (o Edit) y luego ejecútalo con Bash.')
}

process.exit(0)
