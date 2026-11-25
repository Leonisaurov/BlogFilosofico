# AGENTS.md

Blog de Filosofía: sitio estático en HTML/CSS/ES modules, **sin build ni dependencias**. `README.md` es la especificación funcional detallada (en español): leé la sección correspondiente antes de cambiar comportamiento y verificá contra `tests/`.

## Ejecutar y desplegar

- Servir por HTTP; nunca `file://` (los módulos ES fallan). `bash serve.sh 8080` o `python3 -m http.server 8080`.
- `serve.sh` y `tests/run` tienen shebang de Termux (`/data/data/...`) inexistente en Linux: invocalos con `bash`, no con `./`.
- No hay `package.json`, lint, typecheck ni codegen. No agregues bundler ni framework.
- Despliegue: `surge publish` (el dominio se toma de `CNAME`; sin `:surge` ni argumentos). `.surgeignore` excluye `envios/`, `preguntas/`, `tests/` y `scripts/` (importadores + manifiestos) antes de empaquetar; verificado en staging/despliegue real qué se sube realmente. No repitas `--exclude`: una sola fuente de verdad en `.surgeignore`.

## Mapa

- `index.html`: cáscara (header, portada, lectura, índice, pregunta, información, secciones, lector, editor, diálogos) y único `<script type="module">`.
- `js/main.js`: orquesta componentes, router por hash y preferencias.
- `js/data/articles.js`: `ARTICLES = [...CONTRIBUTIONS]` (sin objetos inline). `js/data/contributions.js` es el módulo **generado** por los importadores (aportaciones + unidades de preguntas); `js/data/questions.js` es el módulo **generado** con la pregunta abierta y el archivo; `js/data/sections.js` deriva secciones y contadores; `js/data/editorial.js` reúne carta, política y ritmos; no hay listas de artículos por sección.
- `js/components/`: vistas; `js/lib/`: router, modelo, Markdown, metadatos, storage y slugs; `css/tokens.css`: colores y tipografías.
- `vendor/`: marked y DOMPurify fijados. No agregues dependencias externas.

## Contenido

- Flujo de aportaciones: el admin guarda `.md` + portada en `envios/`; `node scripts/import-submissions.mjs` simula y `node scripts/import-submissions.mjs --apply` valida, genera `js/data/contributions.js`, copia la portada a `assets/`, registra la huella en `scripts/.importados.json`, mueve la entrada a `envios/importadas/<slug>/` y regenera `feed.xml`/`sitemap.xml`. Después **revisión editorial** y despliegue manual con `surge publish`. Nada se publica desde el navegador ni automáticamente.
- Los `.md` usan el front matter de `toFrontMatter` más claves **opcionales** de migración: `cover`, `id`, `tags` (JSON) y `readingTime` (entero), validadas por el importador; `publication.js` no las emite. `category` debe coincidir con `name` o un `aliases` de `SECTIONS`; cada valor de `types` con una sección `group: "tipo"`. Si agregás una categoría, sumala también a `SITE.categories`; los tipos se derivan del catálogo.
- `content` es Markdown dentro de template literals: el importador escapa `\`, backticks y `${` en ese orden. Es un módulo generado: no edites `js/data/contributions.js` a mano.
- Flujo de preguntas: el lunes se abre en `preguntas/abiertas/`; las respuestas llegan por correo a `preguntas/respuestas/<week>-<slug>/<autor-slug>.md`; el domingo el admin pasa la pregunta a `preguntas/cerradas/` y ejecuta `node scripts/import-questions.mjs --apply`. Sin `--apply` solo simula; `--input <dir>` apunta a fixtures. Es transaccional (`scripts/.staging-preguntas-<pid>/`, backups y reversión) y escribe `preguntas/ERRORES.txt` solo con `--apply`. Guía completa en `preguntas/README.md`.
- `scripts/import-questions.mjs` genera `js/data/questions.js` (`{open, weeks}`) y añade a `js/data/contributions.js` **una** unidad por semana cerrada con respuestas autorizadas (`types: ["Unidad"]`, categoría «Pregunta de la semana»). `unidad: no` archiva una semana sin generar unidad. El correo solo se emite con `authorization: si` **y** `publicarEmail: si` **y** email válido; nunca edites esos módulos generados a mano. La huella vive en `scripts/.preguntas-importadas.json`: misma huella → «ya importada; se omite» (exit 0), distinta → error.
- Tras importar (aportaciones o preguntas), `node scripts/check-feeds.mjs` falla si los feeds no coinciden con `ARTICLES`. El importador ya regenera `feed.xml` y `sitemap.xml` desde `[...ARTICLES, ...unidadesNuevas]`; el sitio es estático y el navegador no genera el RSS. No hay cron, backend ni publicación automática: el admin importa y despliega a mano.
- Los dos importadores se ejecutan **en serie y como procesos separados** (nunca en paralelo ni con `&&`/`;`): cada uno reescribe `js/data/contributions.js` desde su propio punto de partida. Tras **cada** `--apply`: `node scripts/check-feeds.mjs` (debe decir «Feeds al día.») y `git diff -- js/data/contributions.js` (solo entradas nuevas; se conservan las unidades de preguntas). Las cabeceras generadas **difieren** entre importadores: es solo el comentario, no pérdida de entradas; no edites el módulo generado a mano.
- Texto oficial: `kind: oficial` en el editor y en el importador; la cita vive en `cover.credit` (sin `coverCredit` top-level) y la comparten `article-view.js`/`card.js` vía `coverCreditHtml()`. `documentoPendiente: si` y `documentUrl` son **XOR** (una sola, nunca ambas ni ninguna) y solo dentro de oficial. `parseDocumentUrl` acepta solo HTTPS; `canEmbed(host, SITE.documentEmbedHosts)` es el único gate de iframe. Proveedor elegido: Google Drive (`documentEmbedHosts: ["drive.google.com"]` y `frame-src https://drive.google.com;` en `_headers`, **juntos** y sin recalcular el hash del script inline). El botón «Subir documento a Google Drive» abre Drive; el enlace compartido debe ser público («Cualquiera con el enlace») y `documentUrlFromDriveLink` lo convierte a `https://drive.google.com/file/d/<ID>/preview` (acepta `/view[?…]`, `/preview[?…]` y `/open?id=<ID>`; rechaza otros hosts y `uc?export=download`). `driveLink` es solo estado local del editor: no se emite en el `.md`. Drive: hasta 5 TB por archivo y 15 GB gratis; el issue 427614561 (2025) no está marcado `fixed`, así que el lector conserva el enlace directo de respaldo si el frame falla. Sin host permitido se muestra «Documento pendiente de elegir servicio» + enlace directo, nunca un iframe fingido.
- No dupliques marcado: `card.js` alimenta portada destacada, feed, cuadrícula y preview del editor; `article-view.js` alimenta lector y preview. Cambiá el componente compartido.
- Colores solo en `css/tokens.css`; el tema oscuro redefine los mismos tokens. Si falta `coverImage`, `js/lib/cover.js` genera un SVG local: no hagas que una portada remota sea obligatoria.

## Verificación

- Requiere Node >= 22 y navegadores en `PATH`.
- Importadores: `node scripts/import-submissions.mjs` y `node scripts/import-questions.mjs` (siempre con `node`, nunca `./`).
- Pruebas Node de los importadores: `node tests/import-submissions.mjs` y `node tests/import-questions.mjs` (simulación y lote inválido: no escriben artefactos; la reversión usa un root temporal).
- `bash tests/run` descubre **solo** `tests/specs/*.spec.mjs`; los `tests/*.e2e.mjs` no se ejecutan ahí.
- El arnés arranca su propio servidor (`bash ./serve.sh 8138`). En esta máquina `browsers.mjs` busca `chromium-browser`, pero solo hay `chromium`: usá Firefox o poné un shim en `PATH`.

  ```bash
  bash tests/run --browser firefox
  bash tests/run --browser firefox --viewport desktop --spec portada
  bash tests/run --list
  ```

  Para Chromium, creá un `chromium-browser` en `PATH` que apunte a `chromium` o usá la suite manual.
- Suite histórica por CDP: iniciá Chromium con `chromium --headless=new --no-sandbox --disable-gpu --user-data-dir="$(mktemp -d)" --remote-debugging-port=9222 http://127.0.0.1:8137/` y ejecutá `node tests/e2e.mjs 9222 <label> online 1440 900`, etc. Lista completa en README → «Verificación automática».
- `tests/sections-dynamic.mjs` modifica temporalmente `js/data/contributions.js` y lo restaura en `finally`; no lo corras en paralelo y revisá `git diff` si se interrumpe.
- Artefactos en `tests/artifacts/` (ignorado): `report.json` y capturas.

## Trampas

- Rutas por hash: `#/` (portada), `#/leer`, `#/indice`, `#/pregunta`, `#/informacion`, `#/articulos/<slug>`, `#/aportar` (alias `#/crear`), `#/secciones[/<slug>]`, `#/configuracion`. No hay rewrites de servidor.
- El dominio debe coincidir en tres lugares: `SITE.url`, `CNAME` y canonical/OG de `index.html`. `tests/meta.e2e.mjs` lo verifica.
- Preferencias y borrador viven en `localStorage` bajo el prefijo `blogfilosofia`; el tema se aplica con un script inline en el `<head>` antes del primer pintado. No lo reemplaces por CSS-only.
- El sitio es estático: el editor no publica ni envía correos; una aportación no entra al índice sin importarla en `js/data/contributions.js` (o, en la fase anterior a la migración, editar `js/data/articles.js`) y desplegar.
- UI, comentarios y documentación están en español; mantené el idioma y el estilo editorial existente.
