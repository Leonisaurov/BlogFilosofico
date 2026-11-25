# AGENTS.md

Blog de Filosofía: sitio estático en HTML/CSS/ES modules, **sin build ni dependencias**. `README.md` es la especificación funcional detallada (en español): leé la sección correspondiente antes de cambiar comportamiento y verificá contra `tests/`.

## Ejecutar y desplegar

- Servir por HTTP; nunca `file://` (los módulos ES fallan). `bash serve.sh 8080` o `python3 -m http.server 8080`.
- `serve.sh` y `tests/run` tienen shebang de Termux (`/data/data/...`) inexistente en Linux: invocalos con `bash`, no con `./`.
- No hay `package.json`, lint, typecheck ni codegen. No agregues bundler ni framework.
- Despliegue: `npx surge . blog-filosofico.surge.sh --exclude 'envios/*' --exclude 'tests/*' --exclude 'scripts/*'`. `envios/` es de entrada, `tests/` y `scripts/` (importador + manifiesto) **no deben subir**; verificá en staging/despliegue real qué se sube realmente.

## Mapa

- `index.html`: cáscara (header, portada, lectura, índice, pregunta, información, secciones, lector, editor, diálogos) y único `<script type="module">`.
- `js/main.js`: orquesta componentes, router por hash y preferencias.
- `js/data/articles.js`: `ARTICLES = [...CONTRIBUTIONS]` (sin objetos inline). `js/data/contributions.js` es el módulo **generado** por el importador; `js/data/sections.js` deriva secciones y contadores; `js/data/editorial.js` reúne carta, política, ritmos y pregunta semanal; no hay listas de artículos por sección.
- `js/components/`: vistas; `js/lib/`: router, modelo, Markdown, metadatos, storage y slugs; `css/tokens.css`: colores y tipografías.
- `vendor/`: marked y DOMPurify fijados. No agregues dependencias externas.

## Contenido

- Flujo de aportaciones: el admin guarda `.md` + portada en `envios/`; `node scripts/import-submissions.mjs` simula y `node scripts/import-submissions.mjs --apply` valida, genera `js/data/contributions.js`, copia la portada a `assets/`, registra la huella en `scripts/.importados.json`, mueve la entrada a `envios/importadas/<slug>/` y regenera `feed.xml`/`sitemap.xml`. Después **revisión editorial** y despliegue manual con `npx surge . blog-filosofico.surge.sh --exclude 'envios/*' --exclude 'tests/*' --exclude 'scripts/*'`. Nada se publica desde el navegador ni automáticamente.
- Los `.md` usan el front matter de `toFrontMatter` más claves **opcionales** de migración: `cover`, `id`, `tags` (JSON) y `readingTime` (entero), validadas por el importador; `publication.js` no las emite. `category` debe coincidir con `name` o un `aliases` de `SECTIONS`; cada valor de `types` con una sección `group: "tipo"`. Si agregás una categoría, sumala también a `SITE.categories`; los tipos se derivan del catálogo.
- `content` es Markdown dentro de template literals: el importador escapa `\`, backticks y `${` en ese orden. Es un módulo generado: no edites `js/data/contributions.js` a mano.
- Tras importar, `node scripts/check-feeds.mjs` falla si los feeds no coinciden con `ARTICLES`. El importador ya regenera `feed.xml` y `sitemap.xml` desde la lista completa; el sitio es estático y el navegador no genera el RSS.
- No dupliques marcado: `card.js` alimenta portada destacada, feed, cuadrícula y preview del editor; `article-view.js` alimenta lector y preview. Cambiá el componente compartido.
- Colores solo en `css/tokens.css`; el tema oscuro redefine los mismos tokens. Si falta `coverImage`, `js/lib/cover.js` genera un SVG local: no hagas que una portada remota sea obligatoria.

## Verificación

- Requiere Node >= 22 y navegadores en `PATH`.
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
