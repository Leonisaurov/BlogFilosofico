# Librerías vendorizadas

Estos archivos se copiaron tal cual desde jsDelivr (versión fija) para que el
sitio siga siendo autónomo y funcione sin conexión. No hay `npm install` ni
paso de compilación.

| Archivo | Paquete | Versión | Licencia | Origen |
|---|---|---|---|---|
| `marked.esm.js` | [marked](https://github.com/markedjs/marked) | 18.1.0 | MIT | `https://cdn.jsdelivr.net/npm/marked@18.1.0/lib/marked.esm.js` |
| `dompurify.es.mjs` | [DOMPurify](https://github.com/cure53/DOMPurify) | 3.4.16 | MPL-2.0 OR Apache-2.0 | `https://cdn.jsdelivr.net/npm/dompurify@3.4.16/dist/purify.es.mjs` |

**Por qué estas:**

- **marked** es un parser Markdown consolidado, sin dependencias y con soporte
  de GFM (tablas, listas de tareas, tachado y autolinks) incluido. Su build ESM
  se importa directamente desde el navegador.
- **DOMPurify** es el sanitizador de HTML de referencia. El HTML que produce
  marked a partir de texto escrito por el usuario se pasa por DOMPurify antes
  de insertarlo en la página, de modo que el contenido no confiable no puede
  ejecutar scripts ni romper la interfaz.

**Para actualizar:** descargar de nuevo con la versión deseada, reemplazar el
archivo y actualizar esta tabla.
