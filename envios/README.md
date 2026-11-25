# Aportaciones recibidas (`envios/`)

Acá guarda el administrador los archivos que llegan por correo, **sin publicar
nada todavía**:

- `<slug>.md`: el Markdown que descarga el autor desde el editor (front matter
  con `title`, `slug`, `description`, `category`, `types`, `author`,
  `coverImage` y `createdAt`, y todo el cuerpo detrás del segundo `---`).
- Opcionalmente, la imagen de portada que acompaña al `.md`, con el nombre que
  figura en la línea `# Imagen local pendiente: copiar "…" a la carpeta assets/`
  del propio Markdown. Se admiten JPG, JPEG, PNG y WebP (no SVG).
- El `.md` puede incluir claves **opcionales** que el editor no emite:
  `cover: {…}` (JSON de una línea, con `alt`, `credit`, `numeral` y `palette`),
  `id: …`, `tags: […]` (JSON) y `readingTime: <entero>`. El importador valida sus
  tipos; si faltan, deriva los valores por defecto.
- Para un **Texto oficial / formato académico** el editor sí emite además
  `kind: oficial`, la cita dentro de `cover.credit` (nunca un `coverCredit`
  top-level) y **exactamente una** de `documentUrl` (URL HTTPS del visor
  externo; el `.docx` no se aloja aquí) o `documentoPendiente: si`. El importador
  aplica XOR: ambas o ninguna son error, y el estado pendiente se deja para que
  el admin lo confirme o lo retire en revisión. El tipo «Texto oficial» es
  obligatorio cuando `kind: oficial`.
- En el editor, «Subir documento a Google Drive» abre Drive para subir el
  archivo. El enlace debe compartirse como **«Cualquiera con el enlace»** (un
  enlace privado no se ve en el blog) y se pega al volver en «Enlace de Google
  Drive». `documentUrlFromDriveLink` convierte `/view?usp=sharing`, `/preview` y
  `/open?id=<ID>` a `https://drive.google.com/file/d/<ID>/preview`, y rechaza
  otros hosts y los enlaces `uc?export=download`. Solo `documentUrl` llega al
  `.md`: `driveLink` queda en el borrador local del navegador. Google Drive
  admite hasta 5 TB por archivo y 15 GB de almacenamiento gratuito; el issue
  427614561 (2025) del visor no está marcado `fixed`, por eso la lectura ofrece
  el enlace directo como respaldo si el iframe falla.

Las siete publicaciones originales del sitio se migraron a este formato: sus
`.md` y sus portadas JPG se archivaron en `envios/importadas/<slug>/` al aplicar
el importador, y ahora viven en `js/data/contributions.js`. Es un módulo
generado: no edites `js/data/contributions.js` a mano; usá el importador.

Esta carpeta es de **entrada**, no de publicación. Nada de lo que haya acá
aparece en la web: `envios/` no se despliega y el importador tampoco publica por
su cuenta.

## Flujo

```bash
# 1) Simulación: valida todo y no escribe ningún artefacto.
node scripts/import-submissions.mjs

# 2) Revisión editorial de lo que se propone incorporar.

# 3) Aplicación: escribe contributions.js, la portada en assets/,
#    el manifiesto y regenera feed.xml y sitemap.xml.
node scripts/import-submissions.mjs --apply
node --check js/data/contributions.js
node scripts/check-feeds.mjs
git diff -- js/data/contributions.js

# 4) Despliegue manual de artefactos (nunca de envios/ ni de preguntas/):
surge publish
```

Este importador y `import-questions.mjs` se ejecutan **en serie, como procesos
separados** (nunca en paralelo ni con `&&`/`;`): ambos reescriben
`js/data/contributions.js` desde su propio punto de partida. Tras cada
`--apply` de cualquiera de los dos, corré `node scripts/check-feeds.mjs` (debe
decir «Feeds al día.») y `git diff -- js/data/contributions.js` para confirmar
que solo aparecieron las entradas nuevas y se conservaron las anteriores. Las
cabeceras generadas difieren entre importadores: es **solo el comentario**, no
pérdida de entradas. Las exclusiones viven en `.surgeignore` (una sola fuente);
`surge publish` toma el dominio de `CNAME`.

El `--apply` es transaccional: valida el lote completo antes de tocar nada,
escribe primero en `scripts/.staging-<pid>/` y solo al final renombra los
archivos a su destino; si algo falla, restaura los originales. El `.md` y su
portada se mueven a `envios/importadas/<slug>/` como registro de entrada. Si hay
errores, el detalle queda en `envios/ERRORES.txt` (archivo + motivo, en español).

Las aportaciones ya importadas se registran en `scripts/.importados.json` con
su huella SHA-256: volver a ejecutar el importador sobre el mismo `.md` avisa
«ya importada; se omite» y termina con éxito. Un slug repetido con contenido
distinto es un error.

**Publicar sigue siendo una decisión humana**: revisar el texto, decidir si se
incorpora y desplegar los artefactos son tres pasos separados. El sitio es
estático y no confirma ni responde automáticamente por correo.
