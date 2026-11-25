/**
 * editorial.js — Voz y contrato editorial del blog.
 *
 * Reúne los textos que no son publicaciones pero sostienen el proyecto:
 * la carta de bienvenida, la política editorial y los dos ritmos del sitio
 * (cosas y preguntas). La pregunta concreta y su archivo viven en el módulo
 * generado `js/data/questions.js`: las vistas no escriben estos textos a mano.
 */

import { SITE } from "./config.js";

/** Aportación que se elige para abrir la portada. */
export const FEATURED_SLUG = "la-caverna-y-los-ecos";

export const WELCOME_LETTER = {
  eyebrow: "Carta de bienvenida",
  title: "Entrar a pensar despacio",
  greeting: "Hola:",
  paragraphs: [
    "Este no es un sitio para consumir ideas en veinte segundos. Es una publicación para quedarse un rato con una pregunta, leer lo que otros pensaron y animarse a responder con voz propia.",
    "Publicamos ensayos, artículos, reseñas, cuentos y poesía. No nos interesa la erudición que aleja: nos interesa la precisión que aclara. Tampoco buscamos la polémica fácil; buscamos argumentos que puedan sostenerse en una conversación.",
    "Podés leer sin prisa. Y si algo te hace ruido, podés escribirnos: las aportaciones no son artículos terminados, son textos que entran en un proceso de lectura, edición y conversación.",
  ],
  signature: "El comité editorial",
  role: "Blog de Filosofía",
  closing: "Nos leemos.",
};

export const RHYTHMS = [
  {
    id: "preguntas",
    eyebrow: "Pregunta de la semana",
    cadence: "Cada lunes",
    title: "Una pregunta para pensar en voz alta",
    description:
      "Cada lunes abrimos una pregunta. Se responde por correo, con calma y sin extensión obligatoria. El domingo publicamos las respuestas autorizadas, tal cual llegaron. El cierre y el despliegue los hace el administrador a mano: no hay cron ni publicación automática.",
    action: { label: "Ver la pregunta de esta semana", href: "#/pregunta" },
  },
  {
    id: "cosas",
    eyebrow: "Periodicidad de las cosas",
    cadence: "Cada quince días",
    title: "Una aportación publicada, sin relleno",
    description:
      "Los jueves alternos publicamos una aportación editada. Si un texto no está listo, no lo reemplazamos con contenido de compromiso: sostenemos la pregunta y la carta hasta que haya algo que valga la pena leer.",
    action: { label: "Leer lo publicado", href: "#/indice" },
  },
];

export const EDITORIAL_POLICY = {
  eyebrow: "Política editorial",
  title: "Lo que prometemos cuando recibimos un texto",
  intro:
    "Una aportación no es un artículo publicado: es un texto que alguien pone a consideración. Lo leemos con atención, respondemos siempre y editamos con el autor, no contra el autor.",
  commitments: [
    {
      label: "Acuse de recibo",
      value: "72 horas",
      detail: "Confirmamos que el texto llegó y que entra en lectura.",
    },
    {
      label: "Decisión",
      value: "15 días hábiles",
      detail: "Aceptamos, pedimos ajustes o rechazamos con una razón concreta.",
    },
    {
      label: "Edición",
      value: "Dos rondas",
      detail: "Trabajamos claridad, estructura y fuentes. El autor aprueba la versión final.",
    },
    {
      label: "Publicación",
      value: "Según calendario",
      detail: "Si el texto se acepta, entra en el siguiente hueco disponible.",
    },
  ],
  requirements: [
    "Texto original e inédito, escrito en español.",
    "Ensayo de 1.200 a 2.500 palabras; reseña de 800 a 1.500. Cuento y poesía, extensión libre con límite acordado.",
    "Título, descripción breve, autor, una biografía de dos o tres líneas y una portada propia o sugerida.",
    "Fuentes verificables cuando haya afirmaciones históricas, científicas o textuales.",
    "Declaración honesta del uso de inteligencia artificial, si lo hubo.",
    "Respeto argumentativo: se puede discutir una idea con dureza; no se ataca a una persona.",
  ],
  rigor: [
    "Primera lectura editorial: pertinencia, voz y claridad.",
    "Segunda lectura especializada: argumento, fuentes y objeciones previsibles.",
    "Verificación de citas y datos; edición de estilo sin borrar la voz del autor.",
    "Aprobación del autor antes de publicar. Ninguna corrección se impone en silencio.",
  ],
  honesty: [
    "No prometemos arbitraje académico ni perfección: prometemos lectura seria y edición.",
    "No publicamos textos sin editar ni dejamos aportaciones sin respuesta.",
    "No rellenamos el calendario con contenido que no esté a la altura.",
    "Las correcciones posteriores quedan visibles y fechadas.",
  ],
  license:
    "El autor conserva la autoría y los derechos morales. Proponemos publicar bajo licencia CC BY-NC-SA 4.0, salvo acuerdo explícito en contrario.",
  contact: `Las aportaciones se envían a ${SITE.adminEmail}.`,
};

export const INFORMATION = {
  eyebrow: "Información",
  title: "Un blog, una forma de leer",
  intro:
    "Blog de Filosofía es una publicación independiente y sin fines de lucro. No hay cuentas, no hay rastreadores y no hay publicidad. Solo textos, preguntas y un archivo que crece despacio.",
  sections: [
    {
      title: "Qué es",
      paragraphs: [
        "Un espacio para pensar problemas filosóficos sin la solemnidad del manual y sin la prisa de la red social. Cada publicación se lee como una pieza: tiene una voz, una portada y un argumento.",
        "El sitio es estático: toda la lectura ocurre en tu navegador. Los borradores y las preferencias se guardan solo en tu dispositivo.",
      ],
    },
    {
      title: "Cómo se sostiene",
      paragraphs: [
        "No hay backend ni suscripciones. El proyecto se mantiene con trabajo editorial y con aportaciones de lectores que quieren pensar en público.",
        "Si encontrás un error, una cita mal atribuida o una idea que merece una réplica, escribinos: corregir también es pensar.",
      ],
    },
    {
      title: "Privacidad",
      paragraphs: [
        "No usamos cookies de seguimiento ni servicios de analítica. El almacenamiento local guarda el borrador de una aportación y las preferencias de lectura; el botón «Borrar todos los datos» elimina solo las claves de este sitio.",
      ],
    },
  ],
};
