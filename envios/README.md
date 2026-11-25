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

# 4) Despliegue manual de artefactos (nunca de envios/):
npx surge . blog-filosofico.surge.sh --exclude 'envios/*' --exclude 'tests/*' --exclude 'scripts/*'
```

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
