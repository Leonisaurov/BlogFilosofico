# Pregunta de la semana — guía del administrador

El sitio es **estático**: no hay backend, formulario ni cron. El administrador
abre la pregunta el lunes, recibe respuestas por correo y, el **domingo**, guarda
las respuestas en esta carpeta, ejecuta el importador y despliega. Nada se
publica desde el navegador ni automáticamente.

## Flujo lunes → domingo

| Día | Acción del administrador |
|---|---|
| Lunes | Crear un `.md` en `abiertas/` con la pregunta de la semana. Se muestra en `#/pregunta` y en la portada tras importar y desplegar. |
| Lunes a domingo | Recibir respuestas por correo y guardar cada una en `respuestas/<week>-<slug>/<autor-slug>.md`. |
| Domingo | Pasar la pregunta de `abiertas/` a `cerradas/` y ejecutar el importador. Las respuestas autorizadas se publican como **una unidad** por semana. |
| Domingo | Desplegar a mano. `preguntas/` no se sube: solo los artefactos generados. |

## Estructura

```
preguntas/
├── abiertas/<week>-<slug>.md          # una pregunta abierta por semana
├── cerradas/<week>-<slug>.md          # semana cerrada (con o sin respuestas)
├── respuestas/<week>-<slug>/
│   └── <autor-slug>.md                # una respuesta por archivo
└── ERRORES.txt                        # solo con --apply y si hay errores (NO se despliega)
```

`week` es el **lunes ISO** (`YYYY-MM-DD`, validación estricta en UTC), `slug`
va en minúsculas, números y guiones (≤60). El nombre de cada archivo debe ser
`<week>-<slug>.md` para las preguntas y `<autor-slug>.md` para las respuestas.

## Pregunta

Front matter obligatorio: `week`, `slug`, `estado` (`abierta` o `cerrada`),
`question`, `context`. Opcionales: `note`, `closing`, `cover` y **`unidad: no`**.

`unidad: no` marca una semana ya cerrada que debe aparecer en «Preguntas
anteriores» **sin generar unidades**. Úsalo cuando no haya respuestas
autorizadas: evita publicar artículos vacíos. El cuerpo del `.md` es el texto
completo en Markdown; el importador lo escapa al generar el módulo.

## Respuesta

Front matter obligatorio: `week`, `slug` (de la pregunta), `author` y
`authorization`. Opcionales: `city`, `email` y `publicarEmail`.

- `authorization: si` autoriza publicar la respuesta. `no` o ausencia = exclusión
  definitiva: **nunca** se publica.
- El correo solo aparece si hay `authorization: si`, `publicarEmail: si` y un
  `email` válido. En cualquier otro caso se omite.
- El cuerpo se publica **literal**: no se corrige el estilo, no se reescribe y
  no se descarta por extensión u opinión controvertida.
- El filtro solo rechaza amenazas o discurso de odio evidentes y datos de
  terceros detectados en el cuerpo. Si algo se marca, falla todo el lote y el
  motivo se escribe en `preguntas/ERRORES.txt` (solo con `--apply`).

## Importar

```bash
node scripts/import-questions.mjs                       # simulación: no escribe nada
node scripts/import-questions.mjs --apply               # aplicación transaccional
node scripts/import-questions.mjs --input <otra-carpeta> # fixtures u otro lote
node --check js/data/questions.js
node --check js/data/contributions.js
node scripts/check-feeds.mjs
git diff -- js/data/contributions.js
```

Este importador y `import-submissions.mjs` se ejecutan **en serie, como
procesos separados** (nunca en paralelo ni con `&&`/`;`): ambos reescriben
`js/data/contributions.js` desde su propio punto de partida. Tras cada
`--apply` de cualquiera de los dos, `check-feeds.mjs` debe decir «Feeds al día.»
y el `git diff` debe mostrar solo las entradas nuevas, conservando las ya
importadas. Las cabeceras generadas difieren entre importadores: es **solo el
comentario**, no pérdida de entradas.

La simulación no toca artefactos. Con `--apply`, el importador escribe en
`scripts/.staging-preguntas-<pid>/` con copias de seguridad y revierte si algo
falla. Genera `js/data/questions.js`, añade cada unidad **una sola vez** a
`js/data/contributions.js`, registra las huellas en
`scripts/.preguntas-importadas.json` y regenera `feed.xml`/`sitemap.xml`.

La misma huella se avisa «ya importada; se omite» y termina con éxito; la misma
semana con otra huella es un error. Si una unidad ya publicada cambiara (por
ejemplo, porque llegó otra respuesta), hay que retirar su entrada del
manifiesto antes de volver a importarla.

Después, desplegar a mano:

```bash
surge publish
```

Usá siempre los **cuatro** `--exclude` en TODOS los bloques de despliegue:
`envios/` y `preguntas/` son de entrada, y `tests/` y `scripts/` no deben
publicarse.
