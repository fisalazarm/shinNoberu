---
name: verificar
description: Pasa la verificación completa de ShinNoberu (tipos, pruebas, build, lint y, si cambió la interfaz, prueba en el navegador) y resume el resultado. Úsala antes de decir que algo está hecho, antes de un commit, cuando el usuario pregunte si todo funciona o tras un cambio grande o tocar varios archivos.
---

# Verificar

Se pasa en este orden, porque cada paso supone el anterior. Lanza los cuatro
en una sola llamada al Bash y lee el resumen:

```bash
npx tsc -b 2>&1 | head -20; echo "tsc: $?"
npm test 2>&1 | grep -E "Test Files|Tests|FAIL|×" | head -20
npm run build 2>&1 | grep -E "error|built in" | head
npx oxlint 2>&1 | grep -E " error " | head -20; echo "errores de lint: $(npx oxlint 2>&1 | grep -c ' error ')"
```

## Cómo leerlo

- **tsc**: cualquier salida es un error. No se sigue con nada más hasta
  arreglarlo.
- **Pruebas**: compara el número con el de la última vez. Si baja sin que
  hayas quitado pruebas, algún archivo de pruebas dejó de cargarse.
- **Build**: el aviso de chunks de más de 500 kB es normal; el del worker de
  ortografía (~1 MB, el diccionario) también.
- **Lint**: solo cuentan los errores. Los avisos `exhaustive-deps` con `rev`
  o `props.rev` son a propósito: el libro se modifica en el sitio y `rev` es
  lo que invalida los cálculos. Aun así, en código nuevo no añadas avisos
  evitables, como una expresión compleja en las dependencias o leer refs
  durante el render.

## Si cambió la interfaz

Las pruebas unitarias no lo cubren. Usa la skill `probar-en-navegador`, o
delega en el agente `probador-navegador` si el escenario es largo.

## Al contarlo

Da los números de verdad («673 pruebas, build bien, lint 0 errores»). Si algo
falló o te lo saltaste, dilo tal cual, con el error.
