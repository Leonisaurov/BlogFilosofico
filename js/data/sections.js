/**
 * sections.js — Catálogo central de secciones filosóficas.
 *
 * Fuente única de datos de las secciones. Igual que `articles.js` alimenta el
 * feed y el lector, este catálogo alimenta la cuadrícula de «Secciones» y las
 * páginas temáticas. NO hay listas manuales de artículos por sección: cada
 * sección declara su nombre canónico (que coincide con el campo `category` de
 * las publicaciones) y sus artículos se derivan de `ARTICLES` en tiempo de
 * render. Así, al añadir, quitar o recategorizar una publicación en
 * `articles.js`, las secciones y sus contadores se actualizan solos.
 *
 * Modelo de una sección:
 *   slug         Identificador para la URL (#/secciones/<slug>).
 *   name         Nombre canónico. Para las secciones de grupo "epoca" y
 *                "problema" coincide con `category` de los artículos; para
 *                las de grupo "tipo", con un valor de `types`.
 *   group        "epoca" (por época), "problema" (por problema filosófico) o
 *                "tipo" (por tipo de texto / género literario).
 *   description  Bajada breve que invita a explorar la temática.
 *   image        Ruta local a una imagen representativa (JPG o SVG).
 *   aliases      Nombres alternativos que también pertenecen a la sección
 *                (para no duplicar secciones si una publicación usa una
 *                variante del nombre).
 *
 * Un artículo puede pertenecer a más de una sección si declara el campo
 * opcional `categories: [...]` además de su `category` principal, y a varios
 * tipos a la vez mediante el campo `types: [...]`. El filtrado lo soporta sin
 * cambios de modelo.
 *
 * Las secciones de grupo "tipo" se resuelven contra `types` (no contra
 * `category`): el catálogo es el mismo y la UI, el contador y el estado vacío
 * se reutilizan tal cual.
 */

import { ARTICLES } from "./articles.js";

/** Agrupaciones del catálogo: distingue el eje histórico del temático. */
export const SECTION_GROUPS = [
  {
    id: "epoca",
    label: "Por época",
    note: "Recorridos históricos: cómo cambió la forma de preguntar.",
  },
  {
    id: "problema",
    label: "Por problema",
    note: "Áreas temáticas: las grandes preguntas y sus campos de estudio.",
  },
  {
    id: "tipo",
    label: "Por tipo de texto",
    note: "Géneros literarios: la forma en que está escrito cada artículo.",
  },
];

/**
 * Catálogo de secciones. El orden define el orden de la cuadrícula.
 * Las cinco primeras temáticas ya existían en el proyecto (sus artículos las
 * usan como `category`); el resto completa el mapa de la filosofía y muestra
 * un estado vacío cuidado mientras no tenga publicaciones.
 */
export const SECTIONS = [
  {
    slug: "filosofia-antigua",
    name: "Filosofía antigua",
    group: "epoca",
    description:
      "Los griegos inventaron una forma de preguntar que todavía usamos: buscar el principio de lo real en lo real mismo.",
    image: "./assets/socrates.jpg",
    aliases: ["Filosofía griega", "Antigua"],
  },
  {
    slug: "filosofia-medieval",
    name: "Filosofía medieval",
    group: "epoca",
    description:
      "Fe y razón, la creación y el orden del mundo: el pensamiento que concilió la herencia griega con las tradiciones reveladas.",
    image: "./assets/sections/filosofia-medieval.svg",
    aliases: ["Medieval", "Escolástica"],
  },
  {
    slug: "filosofia-moderna",
    name: "Filosofía moderna",
    group: "epoca",
    description:
      "Del «pienso, luego existo» a la crítica de la razón: la época que puso al sujeto en el centro de la investigación.",
    image: "./assets/sections/filosofia-moderna.svg",
    aliases: ["Moderna", "Racionalismo", "Empirismo"],
  },
  {
    slug: "filosofia-contemporanea",
    name: "Filosofía contemporánea",
    group: "epoca",
    description:
      "Lenguaje, poder, existencia y técnica: las preguntas que siguen abiertas después de la modernidad.",
    image: "./assets/sections/filosofia-contemporanea.svg",
    aliases: ["Contemporánea"],
  },
  {
    slug: "metafisica",
    name: "Metafísica",
    group: "problema",
    description:
      "Qué hay, qué significa ser y qué permanece cuando todo cambia. La pregunta por lo real más allá de la apariencia.",
    image: "./assets/sections/metafisica.svg",
    aliases: ["Metafísica y ontología", "Ontología"],
  },
  {
    slug: "epistemologia",
    name: "Epistemología",
    group: "problema",
    description:
      "Cómo justificamos lo que creemos saber, qué distingue el conocimiento de la opinión y dónde tropiezan nuestras certezas.",
    image: "./assets/sections/epistemologia.svg",
    aliases: ["Epistemología y teoría del conocimiento", "Teoría del conocimiento"],
  },
  {
    slug: "logica",
    name: "Lógica",
    group: "problema",
    description:
      "Las reglas del razonamiento válido y los modos en que un argumento puede fallar sin que lo notemos.",
    image: "./assets/sections/logica.svg",
    aliases: ["Lógica y argumentación", "Argumentación"],
  },
  {
    slug: "etica",
    name: "Ética",
    group: "problema",
    description:
      "Cómo vivir, qué nos debemos unos a otros y en qué se apoya el juicio moral cuando no hay respuestas fáciles.",
    image: "./assets/sections/etica.svg",
    aliases: ["Ética y filosofía moral", "Filosofía moral"],
  },
  {
    slug: "filosofia-politica",
    name: "Filosofía política",
    group: "problema",
    description:
      "Justicia, poder, libertad y las formas de la vida en común: qué legitima una institución y qué la vuelve injusta.",
    image: "./assets/sections/filosofia-politica.svg",
    aliases: ["Política"],
  },
  {
    slug: "estetica",
    name: "Estética",
    group: "problema",
    description:
      "Qué es lo bello, qué hace una obra de arte y cómo juzgamos aquello que nos conmueve.",
    image: "./assets/sections/estetica.svg",
    aliases: ["Estética y filosofía del arte", "Filosofía del arte"],
  },
  {
    slug: "filosofia-de-la-ciencia",
    name: "Filosofía de la ciencia",
    group: "problema",
    description:
      "Qué distingue el conocimiento científico, cómo cambia y qué puede y qué no puede prometer.",
    image: "./assets/sections/filosofia-de-la-ciencia.svg",
    aliases: ["Filosofía de la ciencia"],
  },
  {
    slug: "filosofia-del-lenguaje",
    name: "Filosofía del lenguaje",
    group: "problema",
    description:
      "Cómo el lenguaje dice el mundo y, a veces, lo construye: significado, referencia y usos de la palabra.",
    image: "./assets/sections/filosofia-del-lenguaje.svg",
    aliases: ["Filosofía del lenguaje"],
  },
  {
    slug: "antropologia-filosofica",
    name: "Antropología filosófica",
    group: "problema",
    description:
      "Qué es el ser humano y qué lugar ocupa entre la naturaleza y la cultura, entre el cuerpo y la técnica.",
    image: "./assets/vitruvio.jpg",
    aliases: ["Antropología"],
  },
  {
    slug: "filosofia-de-la-mente",
    name: "Filosofía de la mente",
    group: "problema",
    description:
      "Conciencia, pensamiento y la relación entre mente, cerebro y cuerpo. Qué significa tener experiencia.",
    image: "./assets/sections/filosofia-de-la-mente.svg",
    aliases: ["Filosofía de la mente"],
  },
  {
    slug: "filosofia-de-la-tecnologia",
    name: "Filosofía de la tecnología",
    group: "problema",
    description:
      "Qué hacemos con las técnicas que creamos y qué hacen ellas con nosotros: poder, autonomía y responsabilidad.",
    image: "./assets/sections/filosofia-de-la-tecnologia.svg",
    aliases: ["Filosofía de la tecnología"],
  },
  {
    slug: "fenomenologia",
    name: "Fenomenología",
    group: "problema",
    description:
      "La experiencia tal como se vive: conciencia, cuerpo y el mundo que aparece ante nosotros.",
    image: "./assets/sections/fenomenologia.svg",
    aliases: ["Fenomenología"],
  },
  {
    slug: "ensayo",
    name: "Ensayo",
    group: "tipo",
    description:
      "La forma reflexiva por excelencia de la filosofía: una idea se examina, se objeta y se sostiene con argumentos.",
    image: "./assets/sections/ensayo.svg",
    aliases: ["Ensayos"],
  },
  {
    slug: "articulo",
    name: "Artículo",
    group: "tipo",
    description:
      "Un texto expositivo y acotado que presenta un problema, su contexto y las posiciones en juego.",
    image: "./assets/sections/articulo.svg",
    aliases: ["Articulos", "Artículos"],
  },
  {
    slug: "resena",
    name: "Reseña",
    group: "tipo",
    description:
      "La lectura comentada de una obra: qué dice, cómo lo dice y por qué merece —o no— ser discutida.",
    image: "./assets/sections/resena.svg",
    aliases: ["Reseñas"],
  },
  {
    slug: "cuento",
    name: "Cuento",
    group: "tipo",
    description:
      "Una ficción breve que pone una idea filosófica en escena: personajes, una situación y un desenlace.",
    image: "./assets/sections/cuento.svg",
    aliases: ["Cuentos"],
  },
  {
    slug: "poesia",
    name: "Poesía",
    group: "tipo",
    description:
      "El pensamiento en su forma musical: imagen, ritmo y silencio para decir lo que el argumento no alcanza.",
    image: "./assets/sections/poesia.svg",
    aliases: ["Poema", "Poemas"],
  },
];

/**
 * Tipos de texto canónicos, derivados del catálogo (grupo "tipo").
 * Fuente única: el editor los usa como sugerencias y no hay una lista aparte
 * en config.js que pueda quedar desincronizada.
 */
export const TEXT_TYPES = SECTIONS.filter((section) => section.group === "tipo").map(
  (section) => section.name
);

/** Índice por slug y por nombre para resolver rutas y categorías. */
const BY_SLUG = new Map(SECTIONS.map((section) => [section.slug, section]));
const BY_NAME = new Map();
for (const section of SECTIONS) {
  BY_NAME.set(section.name.toLowerCase(), section);
  for (const alias of section.aliases ?? []) {
    BY_NAME.set(alias.toLowerCase(), section);
  }
}

/** Devuelve la sección por slug o por nombre canónico. */
export function getSection(key) {
  if (!key) return null;
  const clean = decodeURIComponent(String(key)).trim();
  return BY_SLUG.get(clean) ?? BY_NAME.get(clean.toLowerCase()) ?? null;
}

/** Categorías a las que pertenece una publicación (principal + opcionales). */
export function articleCategories(article) {
  const set = new Set();
  if (article?.category) set.add(String(article.category).trim());
  if (Array.isArray(article?.categories)) {
    for (const extra of article.categories) {
      if (extra) set.add(String(extra).trim());
    }
  }
  return set;
}

/** Tipos de texto de una publicación (siempre una lista, puede haber varios). */
export function articleTypes(article) {
  const set = new Set();
  if (Array.isArray(article?.types)) {
    for (const type of article.types) {
      if (type) set.add(String(type).trim());
    }
  }
  return set;
}

/**
 * Artículos de una sección, derivados SIEMPRE de ARTICLES.
 * No hay copias: si una publicación se añade, se quita o cambia de categoría,
 * esta lista cambia en el siguiente render sin tocar el catálogo.
 * El `Set` evita contar dos veces una publicación que declare varias veces la
 * misma categoría.
 */
export function articlesForSection(sectionOrKey) {
  const section = typeof sectionOrKey === "string" ? getSection(sectionOrKey) : sectionOrKey;
  if (!section) return [];
  const names = new Set([section.name, ...(section.aliases ?? [])].map((n) => n.toLowerCase()));
  // Las secciones de tipo de texto se resuelven contra `types`; el resto,
  // contra `category`/`categories`. Misma derivación, distinto eje.
  const usesTypes = section.group === "tipo";
  return ARTICLES.filter((article) => {
    const values = usesTypes ? articleTypes(article) : articleCategories(article);
    for (const value of values) {
      if (names.has(value.toLowerCase())) return true;
    }
    return false;
  });
}

/** Secciones con sus artículos y contador ya calculados. */
export function sectionsWithCounts() {
  return SECTIONS.map((section) => {
    const articles = articlesForSection(section);
    return { ...section, articles, count: articles.length };
  });
}

/** Ruta canónica de una sección. */
export function sectionHref(section) {
  return `#/secciones/${section.slug}`;
}

/** Tipos de texto declarados en los artículos que no tienen sección. */
export function unmappedTypes() {
  const known = new Set(TEXT_TYPES.map((name) => name.toLowerCase()));
  const missing = new Set();
  for (const article of ARTICLES) {
    for (const type of articleTypes(article)) {
      if (!known.has(type.toLowerCase())) missing.add(type);
    }
  }
  return [...missing];
}

/** Categorías de los artículos que no están cubiertas por el catálogo. */
export function unmappedCategories() {
  const known = new Set();
  for (const section of SECTIONS) {
    known.add(section.name.toLowerCase());
    for (const alias of section.aliases ?? []) known.add(alias.toLowerCase());
  }
  const missing = new Set();
  for (const article of ARTICLES) {
    for (const category of articleCategories(article)) {
      if (!known.has(category.toLowerCase())) missing.add(category);
    }
  }
  return [...missing];
}
