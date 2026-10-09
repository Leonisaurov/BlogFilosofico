/**
 * articles.js — Fuente única de datos de las publicaciones publicadas.
 *
 * Modelo común (ver js/lib/publication.js):
 *   id, slug, title, description, category, author,
 *   coverImage, content (Markdown completo), createdAt, readingTime, tags
 *   cover { alt, credit, numeral, palette } → metadatos de la portada de
 *   respaldo (SVG local) que se usa si `coverImage` falta o no carga.
 *
 * El feed y la página de lectura se generan a partir de estos datos: no hay
 * HTML escrito a mano por publicación.
 */

export const ARTICLES = [
  {
    id: "caverna",
    slug: "la-caverna-y-los-ecos",
    title: "La caverna y los ecos: por qué confundimos sombras con realidad",
    description:
      "Unos prisioneros encadenados desde la infancia contemplan sombras en un muro y las toman por el mundo entero. Cuando uno escapa y ve el sol, su relato suena a delirio ante los que se quedaron. Platón no escribió una fábula sobre la ignorancia, sino sobre algo más incómodo: por qué preferimos lo conocido a una verdad que nos desordena.",
    category: "Filosofía antigua",
    types: ["Ensayo", "Artículo"],
    author: "Lucía Ferrer",
    coverImage:
      "https://commons.wikimedia.org/wiki/Special:FilePath/Plato_Silanion_Musei_Capitolini_MC1377.jpg?width=1400",
    cover: {
      alt: "Busto de Platón, Museos Capitolinos",
      credit: "Busto de Platón, Museos Capitolinos · dominio público",
      numeral: "I",
      palette: { from: "#1d2a37", to: "#0a0d11", accent: "#c8763f" },
    },
    content: `## Una habitación sin ventanas

Imagina una caverna subterránea. Al fondo, un grupo de personas ha vivido desde siempre encadenadas, mirando una pared. Detrás de ellas arde un fuego, y entre el fuego y sus espaldas desfilan objetos que proyectan sombras sobre esa pared. Para los prisioneros, esas sombras son la realidad completa: no tienen otro vocabulario ni otra experiencia con la que compararlas.

Platón describe el momento en que uno de ellos se libera. El ascenso es doloroso: la luz del sol lastima, el mundo de arriba desconcierta, y cada paso exige abandonar una certeza.

> La alegoría no habla de gente tonta, sino de cualquiera que confunda el mapa con el territorio.

## El ascenso y el precio

Cuando por fin contempla las cosas mismas, comprende que pasó su vida interpretando copias. Y entonces ocurre lo decisivo: vuelve a bajar, y ya no puede comunicarse con los suyos. Sus descripciones suenan absurdas; su torpeza con las sombras lo vuelve ridículo.

La alegoría suele leerse como una teoría del conocimiento: hay grados de realidad y grados de saber. Pero también es una radiografía del poder:

- Quien desmiente las sombras no solo aporta un dato.
- Desestabiliza un mundo compartido.
- Y las comunidades rara vez perdonan a quien les quita el suelo.

Por eso los prisioneros, dice Platón, matarían a quien intentara liberarlos.

## La pregunta que queda

La incomodidad de la caverna no está en los encadenados, sino en nosotros. Todos tenemos muros que llamamos sentido común, y todos defendemos con firmeza las sombras que nos permiten dormir. La pregunta que deja abierta el texto no es «¿qué es la verdad?», sino otra más difícil: ¿estamos dispuestos a pagar el precio de verla?`,
    createdAt: "2026-02-11",
    readingTime: 7,
    tags: ["Platón", "conocimiento", "apariencia", "educación"],
  },

  {
    id: "identidad",
    slug: "el-barco-de-teseo-en-tu-cuerpo",
    title: "El barco de Teseo en tu propio cuerpo",
    description:
      "Cada célula de tu cuerpo se reemplaza con el tiempo, y tus recuerdos se reescriben cada vez que los evocas. ¿Qué es, entonces, lo que llamas «yo»? El barco de Teseo planteaba la misma trampa con tablones: ¿sigue siendo el mismo barco cuando ya no queda ninguno de los originales?",
    category: "Metafísica",
    types: ["Ensayo"],
    author: "Martín Aguirre",
    coverImage:
      "https://commons.wikimedia.org/wiki/Special:FilePath/Narcissus-Caravaggio%20(1594-96)%20edited.jpg?width=1400",
    cover: {
      alt: "Narciso, de Caravaggio",
      credit: "Narciso, Caravaggio · dominio público",
      numeral: "II",
      palette: { from: "#2b2029", to: "#0d0a0c", accent: "#c98f6b" },
    },
    content: `## El barco y sus tablones

Los atenienses conservaban el barco de Teseo como reliquia. Con los siglos, cada tablón podrido fue reemplazado por uno nuevo, hasta que no quedó madera original. Plutarco preguntó entonces lo obvio y lo imposible: ¿seguía siendo el mismo barco?

Y si alguien hubiera guardado los tablones viejos y los hubiera reensamblado, ¿cuál de los dos sería el auténtico?

## Contigo pasa algo parecido

Las células de tu cuerpo se renuevan, tus opiniones cambian, tus recuerdos se deforman un poco cada vez que los contas. Si buscas un núcleo material que permanezca, no lo encuentras. Y sin embargo, hay un «yo» que firma promesas, que se avergüenza de lo que hizo hace diez años y que teme dejar de existir.

| Respuesta | Dónde sitúa el «yo» | Qué implica |
| --- | --- | --- |
| Continuidad física | El organismo que persiste | Una transformación radical no te borra |
| Memoria y conciencia | La historia que podés contarte | El olvido profundo te disuelve |
| Ficción útil | Una convención social | La culpa y el mérito son acuerdos |

## Ninguna respuesta es cómoda

Elegir una de esas respuestas no es un ejercicio académico. Si eres tu memoria, el olvido profundo te borra; si eres tu cuerpo, una transformación radical te deja intacto; si eres una ficción, la culpa y el mérito son convenciones.

> Cada opción reparte de otra manera el peso de lo que hicimos y la promesa de lo que seremos.`,
    createdAt: "2026-02-04",
    readingTime: 8,
    tags: ["identidad", "memoria", "persistencia", "persona"],
  },

  {
    id: "socrates",
    slug: "socrates-y-la-vida-examinada",
    title: "Sócrates y el precio de una vida examinada",
    description:
      "Sócrates pudo salvar su vida con una disculpa y eligió la cicuta antes que dejar de preguntar. «Una vida sin examen no merece ser vivida», dijo, y convirtió la duda en un deber. Vale la pena preguntarse si esa frase es una condena a la inquietud perpetua o la única forma de habitar lo que uno hace.",
    category: "Ética",
    types: ["Ensayo", "Artículo"],
    author: "Sofía Delgado",
    coverImage:
      "https://commons.wikimedia.org/wiki/Special:FilePath/David_-_The_Death_of_Socrates.jpg?width=1400",
    cover: {
      alt: "La muerte de Sócrates, de Jacques-Louis David",
      credit: "La muerte de Sócrates, J.-L. David · dominio público",
      numeral: "III",
      palette: { from: "#2c2418", to: "#0f0c08", accent: "#cfa14e" },
    },
    content: `## El tábano de Atenas

En el juicio que termina con su condena, Sócrates no se defiende como un acusado: se defiende como un incordio necesario. Dice que Atenas lo necesita como el tábano a un caballo noble y perezoso, y que si lo matan no encontrarán fácilmente otro que los despierte.

No pide perdón por preguntar. Pide, con ironía, que lo mantengan a costa del Estado.

## Preguntas en lugar de respuestas

Sus interlocutores esperan respuestas y reciben preguntas. ¿Qué es la justicia? ¿Qué es la valentía? Cada definición que se ofrece se derrumba ante un contraejemplo, y el interlocutor, humillado, suele enojarse.

> Su única ventaja, insiste, es saber que no sabe.

## El costo del examen

La frase «una vida sin examen no merece ser vivida» puede sonar grandilocuente, pero es una afirmación ética muy concreta: vivir no es ejecutar los hábitos heredados, sino revisarlos.

- Revisar exige renunciar a lo que se daba por cierto.
- Exige tolerar la incomodidad de no tener respuestas.
- Y exige, a veces, perder la pertenencia.

## Una objeción razonable

¿No hay un punto en que el examen se vuelve parálisis y la duda perpetua impide comprometerse con nada? Sócrates respondería, quizá, que el examen no busca certezas definitivas sino coherencia: vivir de modo que lo que uno dice y lo que uno hace no se contradigan.

Esa coherencia, y no la verdad absoluta, es lo que estaba dispuesto a morir sin traicionar.`,
    createdAt: "2026-01-28",
    readingTime: 6,
    tags: ["Sócrates", "ética", "examen", "virtud"],
  },

  {
    id: "otredad",
    slug: "el-otro-como-espejo-y-abismo",
    title: "El otro como espejo y como abismo",
    description:
      "Sartre escribió que el infierno son los otros; Levinas respondió que el otro es justamente lo que nos saca del infierno de nosotros mismos. Entre esas dos frases se juega toda la vida en común: el otro me limita, me juzga, pero también me constituye. ¿Puedo reconocerme sin que nadie me mire?",
    category: "Fenomenología",
    types: ["Ensayo"],
    author: "Tomás Ibarra",
    coverImage:
      "https://commons.wikimedia.org/wiki/Special:FilePath/Caspar_David_Friedrich_-_Wanderer_above_the_sea_of_fog.jpg?width=1400",
    cover: {
      alt: "El caminante sobre el mar de niebla, de Caspar David Friedrich",
      credit: "El caminante sobre el mar de niebla, C. D. Friedrich · dominio público",
      numeral: "IV",
      palette: { from: "#1f2b28", to: "#0a0f0e", accent: "#8fb59a" },
    },
    content: `## La escena mínima

Estoy solo y soy, sin esfuerzo, lo que creo ser. De pronto alguien entra y me mira: en ese instante me vuelvo consciente de mi cuerpo, de mi postura, de lo que aparento.

La mirada ajena me da un ser que yo no elegí. Sartre llamó a eso «ser para otro», y de ahí su frase más citada: el infierno son los otros.

## El infierno no es la compañía

La razón no es misantropía. El infierno no es la compañía, sino la dependencia:

1. Necesito al otro para saber quién soy.
2. A la vez, el otro me fija en una imagen que no controlo.
3. Toda mi vida social oscila entre el deseo de ser reconocido y el rechazo a quedar reducido a una etiqueta.

## El rostro que obliga

Levinas invierte el punto de partida. Antes de preguntar qué soy yo, señala que el otro se me presenta como un rostro que exige, que me interpela con una autoridad anterior a todo contrato.

> Su vulnerabilidad me obliga; no porque yo lo decida, sino porque el rostro no se puede mirar con indiferencia.

## Sostener la tensión

Entre Sartre y Levinas no hay que elegir del todo. El otro es efectivamente un límite, y también la condición de cualquier yo.

Quizá la tarea no sea eliminar esa tensión, sino sostenerla: reconocer que mi identidad se apoya en alguien a quien puedo dañar, y que esa dependencia es a la vez mi condena y mi apertura.`,
    createdAt: "2026-01-21",
    readingTime: 7,
    tags: ["alteridad", "Sartre", "Levinas", "reconocimiento"],
  },

  {
    id: "albedrio",
    slug: "si-todo-esta-decidido",
    title: "Si todo está decidido, ¿quién firma tus decisiones?",
    description:
      "Un instante antes de que decidas levantar la mano, el cerebro ya había comenzado el movimiento. El experimento de Libet se leyó como una sentencia contra el libre albedrío, aunque admite otra lectura: quizá la libertad no sea iniciar una acción desde la nada, sino poder detenerla y hacerla propia.",
    category: "Metafísica",
    types: ["Ensayo", "Artículo"],
    author: "Camila Ríos",
    coverImage:
      "https://commons.wikimedia.org/wiki/Special:FilePath/Michelangelo%20-%20Creation%20of%20Adam.jpg?width=1400",
    cover: {
      alt: "La creación de Adán, de Miguel Ángel",
      credit: "La creación de Adán, Miguel Ángel · dominio público",
      numeral: "V",
      palette: { from: "#2d1a1a", to: "#0f0909", accent: "#c25b4a" },
    },
    content: `## El experimento

En los años ochenta, Benjamin Libet midió la actividad cerebral de personas a las que se les pedía mover la mano cuando quisieran. Encontró un potencial de preparación que aparecía cientos de milisegundos antes de que el sujeto reportara haber decidido moverse.

La conclusión popular fue fulminante: la decisión consciente llega tarde; el cerebro decide primero.

## Una ventana de veto

El experimento es más ambiguo de lo que parece:

- «Decidir» allí significa registrar la intención de moverse, no deliberar sobre si conviene hacerlo.
- Existe una ventana de veto: los sujetos pueden cancelar el movimiento después de que el potencial se haya iniciado.
- La libertad, en esa lectura, no sería encender el motor, sino tener la última palabra sobre si el motor sigue.

## El problema de fondo

Si cada decisión tiene una causa, y esa causa tiene otra, la cadena se pierde hacia atrás y no hay un punto donde empiece algo genuinamente mío. Si en cambio hay un punto sin causa, la decisión parece arbitraria y tampoco me pertenece.

> Las dos salidas incomodan, y por eso el debate sigue abierto.

## Responsabilidad sin libertad absoluta

Lo que está en juego no es un tecnicismo. La culpa, el castigo y el mérito presuponen que podrías haber actuado de otro modo.

Quizá la responsabilidad no exija un origen sin causas, sino la capacidad de responder por lo que uno hace: reconocer la acción como propia, dar razones y aceptar que otros te pidan cuentas. Eso es más frágil que la libertad absoluta, y probablemente más útil.`,
    createdAt: "2026-01-14",
    readingTime: 8,
    tags: ["libre albedrío", "determinismo", "responsabilidad", "neurociencia"],
  },

  {
    id: "presocraticos",
    slug: "antes-de-socrates-el-origen-de-lo-real",
    title: "Antes de Sócrates: el día en que el mundo dejó de ser un mito",
    description:
      "Tales dijo que todo era agua y sus contemporáneos se rieron. Sin embargo, había hecho algo que nadie había hecho antes: buscar el origen de lo real en lo real mismo, no en el capricho de un dios. Los presocráticos no acertaron casi ninguna respuesta, pero inventaron la pregunta.",
    category: "Filosofía antigua",
    types: ["Ensayo", "Artículo"],
    author: "Andrés Pardo",
    coverImage:
      "https://commons.wikimedia.org/wiki/Special:FilePath/Johannes%20Moreelse%20-%20Heraclitus%20-%20Google%20Art%20Project.jpg?width=1400",
    cover: {
      alt: "Heráclito, por Johannes Moreelse",
      credit: "Heráclito, Johannes Moreelse · dominio público",
      numeral: "VI",
      palette: { from: "#17242d", to: "#070c0f", accent: "#7fb0bd" },
    },
    content: `## Antes de la filosofía

Antes de los presocráticos, el mundo se explicaba contando historias: el rayo era la cólera de Zeus, la sequía un castigo, el mar un dios irritable. Las narraciones eran potentes y coherentes, pero tenían una propiedad incómoda: cualquier desastre podía justificarse apelando a la voluntad divina, y la investigación se detenía ahí.

## La regla nueva

Tales de Mileto propuso que todo procede del agua. Anaximandro habló de lo indefinido; Anaxímenes, del aire; Heráclito, del fuego y del cambio incesante; Parménides, de un ser único e inmóvil.

> Casi todas esas respuestas nos parecen hoy equivocadas. Lo decisivo no es el contenido, sino la regla: explicar la naturaleza con la naturaleza.

## Discutir en el mismo terreno

Ese gesto funda algo más que una disciplina. Si el mundo tiene un principio que puede investigarse, entonces la realidad es inteligible y el desacuerdo es productivo.

Parménides y Heráclito sostienen tesis incompatibles —todo permanece, todo fluye— y sin embargo ambos discuten en el mismo terreno: el del *logos*, la razón que se puede exponer y refutar.

## Un archivo de errores fecundos

Vista desde hoy, la filosofía presocrática es un archivo de errores fecundos. Nos dejó tres ideas que seguimos usando:

1. Detrás de la apariencia hay una estructura.
2. El cambio exige explicación.
3. Preguntar por el *arjé* no es un pasatiempo.

Cada vez que la física busca una partícula fundamental o una ley única, repite, con mejores instrumentos, la apuesta de aquellos griegos.`,
    createdAt: "2026-01-07",
    readingTime: 6,
    tags: ["presocráticos", "arjé", "Heráclito", "Parménides"],
  },

  {
    id: "induccion",
    slug: "el-sol-saldra-manana",
    title: "El sol saldrá mañana (aunque nada lo garantice)",
    description:
      "Que el sol haya salido cada día de tu vida no demuestra que saldrá mañana: solo muestra que la costumbre se parece mucho a la certeza. Hume señaló que toda nuestra ciencia se apoya en ese salto sin fundamento. Vivimos de una apuesta que no podemos justificar sin circularidad.",
    category: "Epistemología",
    types: ["Ensayo"],
    author: "Valentina Sosa",
    coverImage:
      "https://commons.wikimedia.org/wiki/Special:FilePath/David%20Hume.jpg?width=1400",
    cover: {
      alt: "Retrato de David Hume",
      credit: "Retrato de David Hume · dominio público",
      numeral: "VII",
      palette: { from: "#252132", to: "#0b0a10", accent: "#a396c9" },
    },
    content: `## La forma de toda predicción

Toda predicción empírica tiene la misma forma: «el pan me ha alimentado hasta hoy, luego me alimentará mañana». Es un razonamiento impecable en apariencia y, sin embargo, descansa en un supuesto que nunca se demuestra: que el futuro se parecerá al pasado.

Hume lo llamó el problema de la inducción y lo dejó sin resolver.

## Un círculo que no se cierra

El intento de justificarlo fracasa en círculo. Decimos que la naturaleza es regular porque hasta ahora lo ha sido, pero esa frase es exactamente la inferencia que queríamos justificar.

> No hay error lógico: hay un hábito. La costumbre, dice Hume, es lo que nos hace esperar el sol de mañana.

## La consecuencia

Si la inducción no se justifica, tampoco se justifica ninguna ley científica entendida como enunciado universal sobre el futuro. Podemos decir que la física ha funcionado, no que funcionará.

- El conocimiento empírico queda apoyado en una confianza.
- Esa confianza no puede fundamentarse desde la propia epistemología.
- Y sin embargo la usamos todos los días.

## Vivir con la apuesta

¿Vivimos entonces en un escepticismo paralizante? No. Hume mismo seguía jugando a las cartas y comiendo. La lección no es dudar de todo, sino reconocer la clase de criaturas que somos: seres que razonan, sí, pero que actúan sobre todo por costumbre y creencia.`,
    createdAt: "2025-12-17",
    readingTime: 7,
    tags: ["Hume", "inducción", "causalidad", "escepticismo"],
  },
];

/** Devuelve una publicación por id o slug. */
export function getArticle(key) {
  if (!key) return null;
  return ARTICLES.find((a) => a.id === key || a.slug === key) ?? null;
}

/** Publicación siguiente (circular), útil para el enlace al final del artículo. */
export function getNextArticle(key) {
  const index = ARTICLES.findIndex((a) => a.id === key || a.slug === key);
  if (index === -1) return null;
  return ARTICLES[(index + 1) % ARTICLES.length];
}

/** Ruta canónica de lectura de una publicación. */
export function articleHref(article) {
  return `#/articulos/${article.slug}`;
}
