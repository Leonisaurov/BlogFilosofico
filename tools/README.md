# Panel local de desarrollo

Herramienta **solo local** para preparar borradores del Blog de Filosofía, simular
su importación, previsualizar el sitio resultante y aplicar el lote. No es parte
del sitio: `tools/` está excluido del despliegue en `.surgeignore`.

## Arranque

```bash
node tools/dev-server.mjs
# http://127.0.0.1:8177/
```

Requiere Node >= 22, sin dependencias ni framework. El puerto se puede cambiar
con `BLOG_PANEL_PORT=8180 node tools/dev-server.mjs`. El servidor escucha **solo
en 127.0.0.1** y **no tiene autenticación**: no lo expongas a una red. Nunca
detiene ni usa el servidor estático del puerto 8080.

## Qué hace

- Guarda borradores en las carpetas canónicas (`envios/`, `preguntas/`) con el
  front matter exacto que esperan los importadores. **Guardar no publica.**
- Reutiliza `createPublication()` / `toFrontMatter()` (`js/lib/publication.js`)
  para las publicaciones y serializadores propios para preguntas y respuestas.
  Para abrir un `.md` existente se usan `parseSubmission` / `parseQuestion` /
  `parseResponse` como lectores, nunca como validadores de autoridad.
- Valida antes de escribir: XOR de `documentUrl` / `documentoPendiente`,
  `kind: oficial` con el tipo «Texto oficial», `cover.credit` obligatorio, URL
  HTTPS, sí/no literales (nunca `Boolean("no")`), `estado` coherente con la
  carpeta, `authorization` explícita y correo válido con `publicarEmail: si`.

### Texto oficial con Google Drive

El botón «Subir documento a Google Drive» abre Drive en otra pestaña. Subí el
archivo, compartilo como **«Cualquiera con el enlace»** (si no es público, el
visor no lo muestra) y pegá el enlace al volver. El panel importa el mismo
helper que el editor desde `/site/lib/document-embed.js` y convierte
`https://drive.google.com/file/d/<ID>/view[?…]`, `/preview[?…]` y
`/open?id=<ID>` a `https://drive.google.com/file/d/<ID>/preview`; rechaza otros
hosts y `uc?export=download`. Pegar un enlace desmarca «Documento pendiente»;
marcarlo limpia la URL. `driveLink` no se emite en el `.md`.

Drive admite hasta 5 TB por archivo y 15 GB de almacenamiento gratuito. El
issue 427614561 (2025) del visor embebido no está marcado `fixed`: si el frame
falla, el lector ofrece el enlace directo de respaldo. `documentEmbedHosts` y
`frame-src` en `_headers` cambian juntos, sin recalcular el hash del script
inline.
- La validación definitiva la hacen los importadores existentes. El panel no
  reimplementa su generación: invoca `node scripts/import-submissions.mjs` y
  `node scripts/import-questions.mjs` como **procesos separados y en serie**.

## Flujo

1. Completar el formulario (publicación, pregunta o respuesta) y **Guardar
   borrador**.
2. **Simular**: ejecuta ambos importadores sin `--apply` y compara huellas de
   entradas y artefactos. Solo si termina bien y no cambió nada emite un token
   válido durante 10 minutos.
3. **Previsualizar**: opcional, construye una copia temporal.
4. **Aplicar**: exige JSON, `confirmacion: "APLICAR"` y el token vigente. Si
   cambió cualquier huella, el token se rechaza y hay que simular de nuevo. Tras
   aplicar se ejecuta `node scripts/check-feeds.mjs` (debe decir «Feeds al día.»).

Después de aplicar sigue la revisión editorial y el despliegue manual con
`surge publish`. No hay cron, backend ni publicación automática.

## Vista previa sin tocar los borradores reales

`POST /api/preview` crea `~/Develop/.tmp/blogfilosofico-preview-<id>/` con:

- `sitio/`: copia del repo sin `.git`, `tests`, `tools` ni `.staging-*`.
- `entrada/envios/` y `entrada/preguntas/`: copia de los borradores reales.

En la **copia**, las semanas abiertas que ya tienen respuestas se mueven a
`cerradas/` y se les reescribe `estado: cerrada`; también se retira su entrada
del manifiesto copiado para que el importador acepte el lote. Los importadores
se ejecutan dentro de `sitio/` con `--input` apuntando a `entrada/` (fuera del
root copiado), de modo que **no archivan ni borran los borradores reales** y
jamás se cierra la semana original. Las vistas se sirven en un iframe desde
`/__preview/<id>/index.html#/pregunta`, `#/articulos/unidad-<week>-<slug>` y
`#/articulos/<slug>`. Caducan a los 30 minutos, se limitan a 3 y se limpian al
cerrar el servidor. Las respuestas `authorization: si` se muestran como una
unidad parcial tal como quedarían después de importar.

## Endpoints

| Ruta | Métodos | Uso |
|---|---|---|
| `/` | GET | Panel (HTML) |
| `/site/css/tokens.css` | GET | Tokens del sitio |
| `/site/lib/document-embed.js` | GET | Helper compartido de Drive (único JS del sitio servido al panel) |
| `/api/salud` | GET | Comprobación de vida |
| `/api/estado` | GET | Borradores, token, vistas previas, catálogo |
| `/api/borradores` | GET/POST/DELETE | Listar, guardar, borrar borradores |
| `/api/simular` | POST | Simulación sin `--apply`; emite token |
| `/api/aplicar` | POST | Aplica con `confirmacion` y token |
| `/api/preview` | POST | Crea la copia temporal y devuelve las vistas |
| `/__preview/<id>/<rel>` | GET | Archivo de una vista previa |

Todo lo demás devuelve 403. En particular no se sirven `.git`, `scripts/`,
`tools/borradores`, `envios/`, `preguntas/`, `tests/`, `js/`, `.md`,
`ERRORES.txt`, manifiestos ni dotfiles desde el panel. Las respuestas
`/__preview/*` no emiten la CSP de producción (`frame-ancestors 'none'`), para
que el iframe funcione; `realpath` y el `id` del mapa impiden `../`.

## Estructura

```
tools/dev-server.mjs       servidor node:http
tools/lib/workspace.mjs    rutas permitidas, mutex, spawn, huellas, temporales
tools/lib/front-matter.mjs serializadores y validación estricta del panel
tools/panel/               index.html, app.js, panel.css
tools/borradores/          estado local del formulario (ignorado por git)
```

## Verificación

```bash
node --test tests/tools-dev-server.mjs
node scripts/check-feeds.mjs
bash tests/run --browser firefox --spec oficial
bash tests/run --browser firefox
```
