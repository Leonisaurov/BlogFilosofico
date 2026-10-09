/**
 * config.js — Configuración sencilla del sitio.
 *
 * Punto único para cambiar datos que antes estaban dispersos. Para usar el
 * correo real del administrador, basta con editar `adminEmail` acá.
 */

export const SITE = {
  name: "Blog de Filosofía",

  /**
   * URL pública del sitio (dominio final, con barra al final). Se usa para
   * construir las URLs absolutas de la previsualización al compartir
   * (Open Graph / Twitter) y el enlace canónico. El host debe coincidir con el
   * archivo `CNAME` de la raíz; `tests/meta.e2e.mjs` lo verifica. Si el sitio se
   * despliega en otro dominio, se cambia acá, en `CNAME` y en los metadatos de
   * index.html.
   */
  url: "https://blog-filosofico.surge.sh/",

  /** Destinatario de las propuestas de artículo (provisional). */
  adminEmail: "admin@example.com",

  /** Prefijo de las claves de almacenamiento local. */
  storagePrefix: "blogfilosofia",

  /** Versión del formato de borrador (permite migrar sin pisar datos). */
  draftVersion: 2,

  /** Autor que se propone por defecto al crear una publicación. */
  defaultAuthor: "Equipo del Blog de Filosofía",

  /** Categorías filosóficas sugeridas en el editor. */
  categories: [
    "Filosofía antigua",
    "Metafísica",
    "Ética",
    "Epistemología",
    "Fenomenología",
    "Estética",
    "Filosofía política",
    "Lógica",
  ],

  /**
   * Tamaño máximo (bytes) de una imagen local que se guarda como data-URL en
   * el borrador. Por encima de este valor solo se usa para la vista previa y
   * hay que incorporar el archivo a `assets/` manualmente.
   */
  localImageMaxBytes: 700_000,
};
