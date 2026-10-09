# Blog de Filosofía

Plataforma de lectura para descubrir artículos de filosofía con un
desplazamiento vertical publicación a publicación. La pantalla principal se
divide en tres zonas: **encabezado fijo**, **área central con scroll** y **zona
inferior vacía reservada** para versiones futuras.

Cada **publicación** tiene dos representaciones que comparten datos,
componentes y estilos:

1. Una **tarjeta** (cápsula) en el feed de la página principal.
2. Una **página individual** de lectura con URL propia (`#/articulos/<slug>`).

Incluye un **menú principal** y un **editor de publicaciones en Markdown** con
portada, descripción breve, doble previsualización (tarjeta y artículo),
borrador local, exportación y envío por correo.

Sin frameworks ni paso de compilación: HTML, CSS y módulos ES nativos. Las dos
únicas librerías (marked y DOMPurify) están vendorizadas en `vendor/`.

---

## Índice

- [Identidad visual](#identidad-visual)
- [Temas (claro y oscuro)](#temas-claro-y-oscuro)
- [Cómo ejecutar](#cómo-ejecutar)
- [Estructura](#estructura)
- [Arquitectura y flujo de datos](#arquitectura-y-flujo-de-datos)
- [Modelo de publicación](#modelo-de-publicación)
- [Rutas](#rutas)
- [Secciones (explorador temático)](#secciones-explorador-temático)
- [Configuración (drawer lateral)](#configuración-drawer-lateral)
- [Previsualización al compartir (Open Graph)](#previsualización-al-compartir-open-graph)
- [Dónde están los datos y cómo añadir una publicación](#dónde-están-los-datos-y-cómo-añadir-una-publicación)
- [Editor de publicaciones](#editor-de-publicaciones)
- [Borradores locales](#borradores-locales)
- [Descargar y enviar una propuesta](#descargar-y-enviar-una-propuesta)
- [Incorporar una publicación al sitio desplegado](#incorporar-una-publicación-al-sitio-desplegado)
- [Accesibilidad](#accesibilidad)
- [Compatibilidad](#compatibilidad)
- [Despliegue](#despliegue)
- [Limitaciones de una página estática](#limitaciones-de-una-página-estática)
- [Verificación automática](#verificación-automática)
- [Solución de problemas](#solución-de-problemas)
- [Alcance](#alcance)

---

## Identidad visual

Estética editorial cálida inspirada en papel marfil y tinta café. Todo el
sistema sale de variables en **`css/tokens.css`**:

| Token | Valor | Uso |
|---|---|---|
| `--bg` | `#f3ebdd` | Fondo principal (beige claro) |
| `--bg-alt` | `#eae0cf` | Fondo alternativo / barras |
| `--surface` | `#faf6ee` | Tarjetas y paneles (marfil) |
| `--surface-2` · `--surface-sunken` | `#f6efe2` · `#efe5d4` | Superficies secundarias y campos |
| `--accent` | `#956b46` | Café principal de acento (visible sobre el beige) |
| `--accent-soft` | `#b18a64` | Café secundario |
| `--accent-deep` | `#70513a` | Texto destacado, enlaces e iconos |
| `--text` · `--text-2` · `--text-dim` | `#46382d` · `#5d4c3d` · `#6f6152` | Texto principal, de lectura y secundario |
| `--line` · `--line-strong` | `#d6c3ab` · `#c2ab8f` | Bordes y separadores (arena) |
| `--on-cover` | `#faf6ee` | Texto sobre las portadas |

Cambiar estos valores cambia la identidad de **todas** las vistas: los
componentes no definen colores propios. Las portadas de los artículos
**conservan sus colores originales** (no se les aplica ningún filtro beige);
solo se las rodea de un degradado cálido (`--cover-scrim`) para que el título y
la descripción superpuestos sigan siendo legibles.

- **Tema oscuro:** `:root[data-theme="dark"]` redefine los mismos tokens con la
  luminosidad invertida (papel café muy oscuro `#211c18`, superficies
  `#342b23`, acentos café aclarados `#c39a70`, texto beige `#f1e5d2`). No hay
  hojas de estilo paralelas: cada componente sigue usando las mismas variables.
  El tema claro es el valor por defecto; no se usa `prefers-color-scheme` para
  cambiarlo automáticamente.

- **Textura de papel:** `--grain` es un grano cálido generado con
  `feTurbulence` en un SVG en línea (data-URI), sin archivos ni peticiones
  externas. Se aplica al fondo y a las superficies principales.
- **Papel tapiz filosófico:** una capa decorativa `.wallpaper` (en
  `index.html`) reúne cinco motivos distribuidos con una composición
  deliberada. El **motivo principal** es el **Hombre de Vitruvio**
  (`vitruvio-line.png`, lateral derecho), acompañado por el **retrato de
  Sócrates** (`socrates-line.png`) en el lado opuesto (abajo a la izquierda) y
  por dos detalles menores: `phi.svg` (símbolo Φ, arriba a la izquierda) y
  `column.svg` (columna clásica, abajo a la derecha).
  - **Todos los motivos se aplican como máscara CSS** con
    `background-color: var(--accent)`. Los SVG ya eran lineales; los dos
    retratos se derivaron de los JPG **quitándoles el fondo crema** (PNG con
    transparencia, alfa cuantizado a 16 niveles). Así el dibujo se apoya en el
    papel del tema y se tiñe con su acento, en lugar de arrastrar un rectángulo
    claro. Los JPG originales (`socrates.jpg`, `vitruvio.jpg`) se conservan
    porque las tarjetas de «Filosofía antigua» y «Antropología filosófica» los
    siguen usando como imagen.
  - Opacidad: 0.30 para el Vitruvio principal, 0.28 para Sócrates y
    0.17–0.22 para los detalles; en **tema oscuro** suben a 0.36 y 0.34 para
    leerse sobre el papel oscuro. `pointer-events: none` y `z-index: 0`.
  - **Easter egg:** el dibujo anterior del Hombre de Vitruvio
    (`assets/vitruvian.svg`, que antes era el motivo principal) se conserva
    como un detalle pequeño y semioculto (`width: clamp(76px, 12vh, 110px)`,
    opacidad 0.16) en una zona de transición entre la tarjeta, el motivo
    principal y la columna. No lleva ninguna etiqueta ni aviso que lo señale.
    El antiguo SVG de Sócrates, en cambio, se eliminó: no se conserva como
    decoración ni como easter egg.
  - En móvil no hay margen lateral (la tarjeta ocupa todo el ancho): los dos
    motivos principales se reparten la franja libre superior (Vitruvio a la
    izquierda, Sócrates a la derecha, con el retrato recortado al rostro) y se
    prescinden los detalles pequeños.
  - La capa vive en el `body`, por encima del color y del grano y por debajo
    de la interfaz. Para que se vea en las vistas de pantalla completa, el
    feed y el encabezado se ocultan cuando hay una vista abierta
    (`.app[data-view=...]`) y las capas externas del lector y el editor son
    **transparentes**, mientras el panel de lectura y las superficies de
    escritura conservan fondos sólidos para leer y escribir cómodamente.
- **Icono de la cabecera:** el símbolo Φ es un **SVG en línea** (círculo +
  trazo vertical) y no un glifo de texto, para que quede centrado
  geométricamente sin depender de las métricas de la fuente. Mide 17 px dentro
  de una marca circular de 32 px, con trazo café oscuro (`--accent-deep`).
- **Tipografía:** serif editorial para títulos y lectura, sans para la
  interfaz y monoespaciada para el código (`--font-serif`, `--font-sans`,
  `--font-mono`). Son pilas del sistema: no hay fuentes externas que puedan
  fallar ni peticiones de red.
- **Accesibilidad:** todos los pares texto/fondo verificados superan WCAG AA
  (≥ 4.5:1); el foco de teclado usa `--accent-deep` y se respeta
  `prefers-reduced-motion`.

---

## Temas (claro y oscuro)

El sitio tiene dos temas, definidos con las **mismas variables** en
`css/tokens.css`:

- **Claro** (por defecto): la identidad editorial de siempre (papel beige,
  tinta café). Es el que se usa si no hay preferencia guardada.
- **Oscuro**: `:root[data-theme="dark"]` redefine los tokens semánticos con la
  luminosidad invertida (papel café muy oscuro `#211c18`, superficies
  `#342b23`, acentos café aclarados `#c39a70`, texto beige `#f1e5d2`). **No hay
  hojas de estilo paralelas**: cada componente sigue usando `var(--…)`, así que
  el tema se cambia sin duplicar CSS.

**Cómo se cambia:** menú → *Configuración* → *Apariencia* → *Modo claro* /
*Modo oscuro*. La elección se guarda en `localStorage`
(`blogfilosofia.preferencias.v1`) y un script en el `<head>` la aplica **antes
del primer pintado**, para que no aparezca un instante el tema equivocado. No se
usa `prefers-color-scheme` para elegir automáticamente: sin preferencia, el
tema es el claro.

**Detalles:**

- `color-scheme` acompaña al tema, así los controles nativos (barras de scroll,
  checkboxes) se ven coherentes.
- El **papel tapiz** se adapta: sus motivos son máscaras teñidas con el acento
  del tema (los dos retratos tienen el fondo crema recortado en PNG con
  transparencia), así que se ven en claro y en oscuro sin rectángulos claros.
- Las **portadas de los artículos** y las **imágenes de las secciones**
  conservan sus colores propios (son contenido), igual que en el tema claro.
- El contraste de texto se verificó por píxeles en ambos temas (todo ≥ 4.5:1;
  peor caso ~4.8:1). Ver [Verificación automática](#verificación-automática).

---

## Cómo ejecutar

Los módulos ES requieren servirse por HTTP (no abrir `index.html` con
`file://`). El proyecto trae un servidor mínimo basado en Python:

```bash
./serve.sh          # http://localhost:8080
./serve.sh 8137     # o el puerto que prefieras
```

También sirve cualquier servidor estático:

```bash
python3 -m http.server 8080
```

Desde el teléfono, abrí `http://<ip-local-de-la-máquina>:8080`.

---

## Estructura

```
BlogFilosofico/
├── index.html              # Cáscara: encabezado, feed, cuadrícula, secciones,
│                           #         lector, editor y diálogos
├── serve.sh                # Servidor local (python3 -m http.server)
├── CNAME                   # Dominio público (blog-filosofico.surge.sh)
├── assets/
│   ├── favicon.svg
│   ├── phi.svg             # Símbolo Φ (detalle del papel tapiz)
│   ├── vitruvio.jpg        # Hombre de Vitruvio original (tarjeta de sección)
│   ├── vitruvio-line.png   # Hombre de Vitruvio sin fondo (papel tapiz)
│   ├── vitruvian.svg       # Hombre de Vitruvio anterior (easter egg)
│   ├── socrates.jpg        # Retrato de Sócrates original (tarjeta de sección)
│   ├── socrates-line.png   # Retrato de Sócrates sin fondo (papel tapiz)
│   ├── social-preview.png  # Portada 1200×630 para previsualización al compartir
│   ├── column.svg          # Columna clásica (detalle del papel tapiz)
│   └── sections/           # Ilustraciones SVG originales de las secciones
├── css/
│   ├── tokens.css          # Paleta, tipografía, medidas y reset
│   ├── layout.css          # Zonas fijas y contenedor con scroll snap
│   ├── card.css            # Composición de la tarjeta (feed y cuadrícula)
│   ├── home.css            # Vista de cuadrícula de la página principal
│   ├── sections.css        # Explorador temático (cuadrícula + sección)
│   ├── reader.css          # Página individual de lectura
│   ├── menu.css            # Menú principal desplegable
│   ├── settings.css        # Drawer de configuración, confirmación y aviso
│   ├── editor.css          # Editor y vistas provisionales
│   ├── markdown.css        # Tipografía del documento renderizado
│   └── responsive.css      # Ajustes por pantalla (móvil primero)
├── js/
│   ├── main.js             # Punto de entrada: monta y conecta todo
│   ├── data/
│   │   ├── articles.js     # ← PUBLICACIONES del sitio
│   │   ├── sections.js     # ← CATÁLOGO de secciones (deriva de articles.js)
│   │   └── config.js       # ← dominio, correo del administrador y ajustes
│   ├── lib/
│   │   ├── cover.js        # Portadas SVG de respaldo
│   │   ├── dom.js          # Utilidades mínimas
│   │   ├── markdown.js     # marked + DOMPurify (render seguro)
│   │   ├── meta.js         # Título y metadatos de previsualización (OG/Twitter)
│   │   ├── preferences.js  # Preferencias locales (vista y tema)
│   │   ├── publication.js  # Modelo de publicación, front matter y JSON
│   │   ├── router.js       # Rutas por hash
│   │   ├── share.js        # Propuesta por correo y exportación .md/.json
│   │   ├── slug.js         # Generación de slugs
│   │   └── storage.js      # Borrador y limpieza de datos en localStorage
│   └── components/
│       ├── header.js       # Encabezado fijo + botón de menú
│       ├── menu.js         # Menú principal (dialog)
│       ├── card.js         # Tarjeta del feed (compartida con el editor)
│       ├── article-view.js # Plantilla de lectura (compartida con el editor)
│       ├── feed.js         # Área central: snap, rueda, teclado, métricas
│       ├── home-grid.js    # Cuadrícula de la página principal
│       ├── reader.js       # Página individual (usa article-view)
│       ├── sections.js     # Explorador temático (cuadrícula y sección)
│       ├── settings.js     # Drawer de configuración (dialog lateral)
│       ├── editor.js       # Editor de publicaciones
│       └── pending.js      # Vista provisional genérica (sin uso actual)
├── vendor/                 # marked y DOMPurify (versión fija) + licencias
└── tests/
    ├── e2e.mjs             # Feed, scroll, navegación y página individual
    ├── editor.e2e.mjs      # Menú, editor, previsualizaciones, exportación
    ├── sections.e2e.mjs    # Cuadrícula, sección, vacío y navegación
    ├── sections-dynamic.mjs# Derivación dinámica de las secciones
    ├── settings.e2e.mjs    # Drawer, vista, tema y borrado de datos
    ├── meta.e2e.mjs        # Metadatos de previsualización (OG/Twitter)
    ├── run                 # Arnés web-page-verification (Chromium + Firefox)
    └── specs/
        └── tipos.spec.mjs  # Grupo «Por tipo de texto» y agrupamiento
```

**Componentes compartidos (sin duplicar):** la tarjeta del feed y la
previsualización «Tarjeta del feed» usan `js/components/card.js`; la página
individual y la previsualización «Artículo completo» usan
`js/components/article-view.js`. Cualquier cambio de estilo en `css/card.css` o
`css/reader.css` se refleja en el sitio y en el editor. La tarjeta del feed
admite una variante de cuadrícula (`createCard(article, { variant: "grid" })`)
que reutiliza el mismo marcado y la misma portada de respaldo para las páginas
de sección.

---

## Arquitectura y flujo de datos

Sitio **estático sin build**: no hay bundler, transpilador ni servidor. El
navegador carga `index.html`, que enlaza las hojas de estilo y un único módulo
de entrada (`js/main.js`) que importa el resto. Las dependencias (marked,
DOMPurify) están vendorizadas y se cargan como módulos ES.

### Capas

1. **Datos** (`js/data/`): `articles.js` (publicaciones publicadas),
   `sections.js` (catálogo de secciones), `config.js` (nombre, correo, dominio,
   categorías). Es la única fuente de contenido.
2. **Lógica** (`js/lib/`): utilidades sin estado de UI — router, modelo de
   publicación, portadas SVG, Markdown seguro, preferencias, metadatos,
   almacenamiento, slugs y la propuesta por correo.
3. **Componentes** (`js/components/`): cada vista y sus piezas. `main.js`
   orquesta: crea los componentes, los conecta al router y aplica preferencias.
4. **Presentación** (`css/`): `tokens.css` define el sistema; el resto de las
   hojas consume las variables. Los componentes no definen colores propios.

### Flujo

```
ARTICLES (articles.js) ─┬─> feed.js       ─> card.js (variant feed)
                        ├─> home-grid.js  ─> card.js (variant grid)
                        ├─> sections.js   ─> articlesForSection() ─> card.js
                        └─> reader.js     ─> article-view.js
router.js  <─>  main.js  ─> muestra/oculta vistas (data-view) y aplica
                            preferencias (data-theme / data-view-mode)
```

- **Un solo catálogo**: feed, cuadrícula de inicio, secciones y lector derivan
  todos de `ARTICLES`. Añadir un artículo en `articles.js` lo hace aparecer en
  todas las vistas (y en su sección) sin tocar nada más.
- **Sin duplicar estado**: el feed y la cuadrícula de la home se preparan desde
  la carga inicial con las mismas tarjetas; la preferencia solo cambia qué
  contenedor se muestra.
- **Navegación por hash**: el router interpreta `location.hash` y llama al
  handler de la vista; no hay recarga ni peticiones de datos.
- **Componentes compartidos**: la tarjeta (`card.js`) y la plantilla de lectura
  (`article-view.js`) se usan en el sitio y en el editor, así no se
desincronizan.

---

## Modelo de publicación

Definido en `js/lib/publication.js`. Todas las publicaciones —los ejemplos y
las que crea el editor— usan los mismos campos:

| Campo | Descripción |
|---|---|
| `id` | Identificador único y estable. |
| `slug` | Identificador legible para la URL (`#/articulos/<slug>`). |
| `title` | Título del artículo. |
| `description` | Descripción breve que se superpone en la tarjeta. |
| `category` | Categoría filosófica (principal). Determina la sección en «Secciones». |
| `categories` | Categorías adicionales (opcional). Permite que la publicación aparezca en varias secciones. |
| `types` | Tipos de texto o géneros literarios. **Siempre una lista** (`["Ensayo"]`, `["Ensayo", "Artículo"]`). Determina la sección dentro del grupo «Por tipo de texto». |
| `author` | Autor (opcional). |
| `coverImage` | Referencia de portada: URL, `./assets/...` o data-URL. |
| `coverLocalName` | Nombre de un archivo local pendiente de incorporar (auxiliar). |
| `content` | Contenido completo en **Markdown**. |
| `createdAt` | Fecha de creación (`YYYY-MM-DD`). |
| `readingTime` | Minutos de lectura estimados. |
| `tags` | Etiquetas (reservadas para búsqueda/filtros). |
| `cover` | Metadatos de la portada de respaldo: `alt`, `credit`, `numeral`, `palette`. |

La **descripción breve** (`description`) es la tarjeta; el **cuerpo completo**
(`content`) es la página individual. Son campos distintos y se editan por
separado. Si `coverImage` falta o no carga, se usa una portada SVG local
generada por `js/lib/cover.js` (con `cover.palette` o una paleta derivada del
`id`), así que ninguna tarjeta queda rota.

---

## Rutas

| Ruta | Vista |
|---|---|
| `#/` | Feed de publicaciones |
| `#/articulos/<slug>` | Página individual del artículo |
| `#/crear` | Editor de publicaciones |
| `#/secciones` | Cuadrícula de secciones filosóficas |
| `#/secciones/<slug>` | Página de una sección con sus artículos |
| `#/configuracion` | Drawer de configuración (vista, tema y datos) |

El scroll vertical del feed sigue permitiendo descubrir publicaciones; al hacer
clic o tocar una tarjeta se abre **la página individual de esa publicación**
(no siempre la misma). Funciona con ratón, pantalla táctil y teclado (la
tarjeta es un enlace; `Enter` la abre).

---

## Secciones (explorador temático)

«Secciones» (menú hamburguesa) abre un explorador de las áreas de la filosofía.
No es una ventana emergente ni un feed vertical: es una **vista interna** que
ocupa la zona central y **conserva el encabezado y el menú**.

- **Cuadrícula** (`#/secciones`): tarjetas agrupadas en *Por época*, *Por
  problema* y *Por tipo de texto*. Cada tarjeta lleva imagen, nombre,
  descripción y contador, y toda la tarjeta es un enlace a su sección. La
  cuadrícula tiene scroll vertical propio (no usa el snap por publicaciones del
  feed).
- **Página de sección** (`#/secciones/<slug>`): cabecera con imagen, nombre,
  descripción y cantidad de artículos, seguida de los artículos en una
  **cuadrícula editorial**. Cada tarjeta abre la página individual del
  artículo. Incluye un enlace para volver a todas las secciones y otro al Blog.

### Una sola fuente de datos

El catálogo vive en **`js/data/sections.js`** (`SECTIONS`). Cada sección declara
su `slug`, su `name` canónico, su grupo (`epoca`, `problema` o `tipo`), una
descripción, una imagen y posibles `aliases`. El `name` de una sección de época
o de problema **coincide con el campo `category`** de las publicaciones; el de
una sección de tipo de texto coincide con un valor de `types`. **No hay listas
manuales de artículos por sección**: los artículos y los contadores se derivan
de `ARTICLES` con `articlesForSection()` cada vez que se pinta la vista.

Consecuencias (comprobadas por `tests/sections-dynamic.mjs`):

1. Al **añadir** una publicación con una categoría existente a `ARTICLES` y
   regenerar/desplegar, aparece en su sección y el contador sube.
2. Al **quitar** una publicación, desaparece de la sección.
3. Al **cambiar** su `category`, cambia de sección.
4. Los contadores son siempre el resultado real del filtrado.
5. No hay copias de artículos en archivos separados por categoría.

Una publicación puede pertenecer a **varias** secciones si declara el campo
opcional `categories: [...]` además de su `category` principal. Del mismo modo,
un artículo puede tener **varios tipos de texto** si declara varios valores en
`types: [...]` (el editor ya lo permite, separados por coma). El filtrado usa
un `Set` interno que evita contar dos veces la misma publicación. Las
**secciones vacías** muestran un estado cuidado («Todavía no hay artículos en
esta sección») y nunca se rellenan con artículos de otras temáticas.

### Flujo estático (borradores frente a publicación)

Un **borrador** del editor vive solo en `localStorage` y **no** aparece en el
catálogo público; una propuesta **enviada por correo** tampoco se considera
publicada. Para que un artículo figure en el sitio, debe incorporarse a
`ARTICLES` y volver a desplegar: entonces las secciones y sus contadores se
actualizan solos. La aplicación no simula una base de datos remota ni una
publicación automática que un sitio estático no puede garantizar.

### Imágenes de las secciones

Cada sección tiene una imagen **local** (sin peticiones externas):

- **Reutilizadas del proyecto:** `assets/socrates.jpg` (Filosofía antigua) y
  `assets/vitruvio.jpg` (Antropología filosófica).
- **Originales del proyecto:** `assets/sections/*.svg`, diecinueve
  ilustraciones lineales creadas para esta vista (arco ojival, reloj, círculo
  fragmentado, círculos concéntricos, ojo, diagrama de conjuntos, balanza,
  edificio con columnas, marco con paisaje, átomo, bocadillos, cabeza con
  engranaje, engranaje con circuito y conciencia orientada a un objeto, más
  pluma, página de periódico, lupa sobre un libro, bocadillo con luna y lira
  para los cinco tipos de texto), con el mismo trazo café sobre fondo crema
  que el resto de la identidad.

Ninguna imagen es remota ni depende de un servicio que pueda dejar de
funcionar.

---

## Configuración (drawer lateral)

«Configuración» (menú hamburguesa) abre un **drawer** que se desliza desde el
borde derecho. Es un `<dialog>` nativo (como el menú), así que hereda el
atrapado de foco, el cierre con Escape y la semántica modal; mientras está
abierto, el fondo queda inerte y no se puede desplazar. Se cierra con el botón
de cierre, pulsando el fondo superpuesto o con Escape, y la URL vuelve a la
vista desde la que se abrió. Es un único elemento en el DOM: abrirlo varias
veces no lo duplica.

Tiene tres apartados:

### Datos y privacidad

- **Borrar todos los datos**: abre un diálogo de confirmación que explica que
  se eliminan los datos locales (borradores, preferencias y demás datos de la
  aplicación), que la operación es irreversible y que **los artículos
  publicados del sitio no se eliminan**. «Cancelar» no borra nada; «Borrar
  datos» ejecuta la limpieza.
- La limpieza recorre **todas** las claves con el prefijo de la aplicación
  (`blogfilosofia`) en `localStorage` y `sessionStorage` y, por si acaso,
  también IndexedDB y cookies con ese prefijo. El proyecto hoy **solo usa
  `localStorage`**; los demás mecanismos se informan como no usados o no
  accesibles en lugar de fingir que se limpiaron. No borra datos de otros
  sitios del mismo dominio ni puede vaciar «todas las cookies» del navegador.
- Tras borrar: preferencias a los valores por defecto (feed vertical y modo
  claro), estado en memoria del editor descartado y un aviso discreto confirma
  la limpieza.

### Visualización

- **Vista de la página principal**: *Feed vertical* (por defecto) o
  *Cuadrícula*. La preferencia se guarda y se conserva entre visitas.

### Apariencia

- **Modo claro** (por defecto) o **Modo oscuro**. También se guarda.

### Cómo se implementan las preferencias

- Se guardan bajo una única clave versionada
  (`blogfilosofia.preferencias.v1`) desde `js/lib/preferences.js`.
- Un **script de arranque** en el `<head>` de `index.html` lee esa clave y
  aplica `data-theme` y `data-view-mode` en `<html>` **antes del primer
  pintado**, así no aparece un instante el tema o la vista equivocados. Si no
  hay preferencia (o falla el almacenamiento), quedan claro y feed.
- El **feed y la cuadrícula se preparan desde la carga inicial** a partir del
  mismo `ARTICLES` y con las mismas tarjetas (`createCard`); la preferencia
  solo cambia qué contenedor se muestra (`display`), sin reconstruir la
  pantalla. Ambas comparten rutas y datos: no hay dos catálogos.
- El **tema** se resuelve con variables CSS: `:root[data-theme="dark"]`
  redefine los tokens semánticos y todos los componentes se adaptan sin
  duplicar hojas de estilo. Los motivos del papel tapiz ya no se ocultan en
  oscuro: al quitarles el fondo crema, se tiñen con el acento del tema.

---

## Previsualización al compartir (Open Graph)

`index.html` incluye los metadatos de **Open Graph** y **Twitter Card** de la
portada del sitio, con una imagen propia de **1200×630**
(`assets/social-preview.png`) y `twitter:card: summary_large_image`. Además,
`js/lib/meta.js` actualiza al navegar el `<title>`, la descripción,
`og:title`, `og:description`, `og:image`, `og:url`, sus equivalentes de Twitter
y el enlace canónico, y convierte las rutas en **absolutas** (lo que esperan
las redes) usando el dominio público configurado en **`SITE.url`**
(`js/data/config.js`), que hoy es `https://blog-filosofico.surge.sh/`. Si el
sitio cambia de dominio, se actualiza solo ahí y en los metadatos de
`index.html`. Los metadatos de `index.html` ya llevan la URL absoluta, para que
los rastreadores que no ejecutan JavaScript también encuentren la portada.

- **Home:** portada del sitio y descripción general.
- **Artículo:** título y descripción del artículo, y `og:image` = su portada.
- **Sección:** nombre y descripción; si su imagen es un JPG/PNG (Sócrates,
  Vitruvio) se usa esa; si es un SVG, se usa la portada del sitio (las redes no
  aceptan SVG como `og:image`).
- **Cuadrícula de secciones / editor / configuración:** título propio.

**Limitación honesta:** el sitio usa rutas por hash (`#/articulos/<slug>`). Los
rastreadores sociales no envían el fragmento al servidor, así que la mayoría
lee solo el HTML inicial (la portada del sitio). Estas actualizaciones
benefician a los clientes y rastreadores que ejecutan JavaScript; una
previsualización distinta por artículo exigiría renderizado en servidor o
rutas reales por ruta.

---

## Dónde están los datos y cómo añadir una publicación

Las publicaciones del sitio viven en **`js/data/articles.js`**, en el arreglo
`ARTICLES`. El feed y las páginas individuales se generan a partir de esos
datos: no hay HTML escrito a mano por publicación.

```js
{
  id: "tiempo",
  slug: "el-tiempo-segun-san-agustin",
  title: "El tiempo: ¿lo medimos o lo habitamos?",
  description: "Dos o tres frases para la tarjeta del feed.",
  category: "Metafísica",
  types: ["Ensayo", "Artículo"],       // lista; puede haber varios
  author: "Nombre Apellido",
  coverImage: "./assets/tiempo.jpg",          // opcional
  cover: {                                     // opcional (portada de respaldo)
    alt: "Descripción de la imagen",
    credit: "Autor, obra · dominio público",
    numeral: "VIII",
    palette: { from: "#22303a", to: "#0a0e12", accent: "#c8763f" },
  },
  content: "# Título\n\nCuerpo completo en **Markdown**…",
  createdAt: "2026-03-02",
  readingTime: 6,
  tags: ["tiempo", "Agustín", "memoria"],
}
```

Para incorporar una publicación creada en el editor, ver
«Incorporar una publicación al sitio desplegado» más abajo.

El `category` de una publicación debe coincidir con el `name` (o un `alias`) de
alguna sección de época o de problema de `js/data/sections.js` para que
aparezca en «Secciones». Cada valor de `types` debe coincidir con el `name` de
una sección de tipo de texto del mismo catálogo. Las categorías sugeridas por
el editor ya están cubiertas por el catálogo, y los tipos de texto se derivan
del propio catálogo (`TEXT_TYPES`).

### Añadir o cambiar una sección

El catálogo vive en **`js/data/sections.js`** (`SECTIONS`). Para agregar una
temática:

```js
{
  slug: "filosofia-de-la-educacion",   // URL: #/secciones/<slug>
  name: "Filosofía de la educación",   // debe coincidir con el `category`
  group: "problema",                   // "epoca" | "problema" | "tipo"
  description: "Qué educa, para qué y con qué legitimidad.",
  image: "./assets/sections/educacion.svg",
  aliases: ["Educación"],              // nombres alternativos (opcional)
}
```

Para agregar un **tipo de texto**, usá `group: "tipo"` y un `name` que coincida
con el valor correspondiente del campo `types` de los artículos (por ejemplo,
`name: "Diálogo"` para artículos con `types: ["Diálogo"]`). La imagen sigue el
mismo patrón `./assets/sections/<slug>.svg`.

```js

No hay que registrar nada más: la cuadrícula, el contador y la página de la
sección se generan a partir del catálogo y de `ARTICLES`. Si no tiene
artículos, muestra su estado vacío. Para que el editor ofrezca la nueva
categoría filosófica, agregala también a `SITE.categories` en
`js/data/config.js`; los **tipos de texto** no van en `config.js`: se derivan
del propio catálogo (grupo `tipo`) y el editor los usa desde `TEXT_TYPES`.

---

## Editor de publicaciones

Se abre desde el menú (*Crear artículo*) o con `#/crear`. No crea un documento
suelto: crea una publicación con **todos** los campos del modelo.

- **Datos de la publicación:** título, descripción breve, categoría (con
  sugerencias), tipos de texto (con sugerencias, separados por coma), autor y
  portada.
- **Portada:** se puede escribir una URL (`https://…` o `./assets/…`) o elegir
  un archivo local. La vista previa es inmediata.
- **Contenido completo:** área de escritura Markdown con barra de herramientas
  (H1/H2/H3, negrita, cursiva, tachado, cita, listas, tareas, enlace, imagen,
  código, bloque de código, tabla, línea horizontal, deshacer/rehacer). Cada
  botón actúa sobre la selección y conserva el texto y el cursor.
- **Modos:** Edición / Dividido / Vista previa.
- **Previsualización doble** (pestañas):
  - **Tarjeta del feed:** usa el mismo componente que el feed real, con las
    mismas proporciones, degradados y tipografía.
  - **Artículo completo:** usa la misma plantilla de lectura que la página
    individual, con título, portada, categoría, autor y el Markdown
    renderizado (encabezados, listas, citas, tablas, código).
  - Ambas se actualizan en vivo al cambiar imagen, título, descripción o
    contenido.
- **Atajos:** `Ctrl/Cmd+B` negrita, `Ctrl/Cmd+I` cursiva, `Ctrl/Cmd+K` enlace,
  `Ctrl/Cmd+Z` deshacer, `Ctrl/Cmd+Shift+Z` (o `Ctrl+Y`) rehacer.
- **Seguridad:** el HTML del Markdown se sanitiza con DOMPurify. Se bloquean
  `script`, `style`, `iframe`, formularios y atributos de evento, y se
  descartan enlaces con esquemas peligrosos (`javascript:`, `vbscript:`,
  `data:`). El código y la sintaxis literal se muestran como texto.

### Markdown

Se usa **GFM** (GitHub Flavored Markdown) mediante marked: agrega tablas,
listas de tareas y tachado al Markdown estándar. Es la única extensión y está
documentada acá.

---

## Borradores locales

- El título, la descripción, la categoría, el autor, la portada y el contenido
  se autoguardan en `localStorage` (clave `blogfilosofia.borrador.v2`).
- Al volver a `#/crear` el borrador se restaura; «Nueva» pide confirmación
  antes de descartarlo.
- Si hay cambios sin guardar, el navegador avisa al cerrar o recargar.
- Una **imagen local** de hasta ~700 KB se guarda dentro del borrador como
  data-URL. Si es más grande, se usa solo para la vista previa de la sesión y
  hay que incorporarla a `assets/` a mano.
- El borrador vive **solo en el navegador del usuario**. No es una publicación:
  no se envía a ningún servidor ni es visible para otros.

---

## Descargar y enviar una propuesta

El editor separa **dos acciones independientes**:

- **Descargar artículo (.md):** botón de la barra superior que genera el
  Markdown con front matter YAML (`title`, `slug`, `description`, `category`,
  `types`, `author`, `coverImage`, `createdAt`) y el contenido actual. El
  nombre se deriva del título y se normaliza (`¿Qué es la «justicia»?` →
  `que-es-la-justicia.md`). No abre el correo ni toca el artículo.
- **Enviar propuesta por correo:** abre primero un **diálogo de requisitos**
  dentro de la aplicación; nunca abre el cliente de correo directamente.

### El diálogo de propuesta

El diálogo «Enviar propuesta de artículo» explica que **la propuesta no se
publica sola** y que el artículo **no se envía automáticamente**: los archivos
deberá adjuntarlos el usuario en su propio cliente de correo. Los pasos son:

1. **Descargar el `.md`.** Botón «Descargar .md» que ejecuta la descarga real
   sin cerrar el diálogo; al pulsarlo, el paso pasa a «Descarga solicitada».
2. **Descargar la imagen remota** (solo si `coverImage` es una URL `http(s)`).
   Botón «Descargar imagen». Si el navegador no puede descargarla (CORS,
   cabeceras o red), aparece «Abrir imagen original para guardarla» y no se
   simula ninguna descarga. Si la portada ya es un archivo local del usuario,
   se avisa que conviene adjuntar también el archivo original, sin casilla ni
   requisito. Si no hay portada, el paso no aparece.
3. **Confirmar.** Dos casillas (la de la imagen solo con portada remota) que
   empiezan desmarcadas y **deshabilitadas**: solo se habilitan después de
   iniciar la descarga correspondiente. «Continuar al correo» permanece
   deshabilitado hasta que se descargó el `.md` y se marcaron todas las
   casillas aplicables. Con imagen remota también exige haber iniciado su
   descarga o abierto el enlace alternativo.

Las casillas son una **confirmación del usuario**, no una prueba técnica: el
navegador no puede saber si el archivo se guardó o se adjuntó.

### Qué hace «Continuar al correo»

Abre el cliente externo con un `mailto:` a `admin@example.com` (constante
`SITE.adminEmail` en `js/data/config.js`) cuyo asunto es
`Propuesta de artículo para Blog de Filosofía` y cuyo cuerpo es un saludo
mínimo («Hola: Adjunto una propuesta… Gracias.»). **No** incluye el artículo,
**no** adjunta archivos, **no** da instrucciones a quien recibe y **no** promete
publicación ni respuesta automática. Tras abrirlo, el usuario adjunta el `.md`
y la imagen y envía desde su propia aplicación.

El diálogo incluye además, en «Otras exportaciones», la descarga `.json` (datos
listos para `ARTICLES`) y «Copiar Markdown», que se conservan del flujo
anterior. Una página estática no puede confirmar que el correo se envió.

---

## Incorporar una publicación al sitio desplegado

El editor **no publica**. Nada de lo que se escribe o se descarga aparece en el
sitio hasta que sus datos y sus recursos se incorporan al proyecto y se vuelve
a desplegar. Esta sección describe, sin ambigüedad, qué hacer con el archivo
`.md` y con la imagen de portada que se reciben.

### Quién hace cada cosa

- **Quien crea el artículo (autor/a):** lo escribe en el editor, revisa las dos
  previsualizaciones y descarga la portada (si corresponde) y el `.md` (o el
  `.json`).
- **Quien recibe la propuesta (administrador/a):** incorpora el `.md` y la
  imagen al proyecto y despliega.

### Qué hacer con el archivo `.md` que se recibe

El `.md` **no se guarda como archivo suelto en el sitio ni se copia a ninguna
carpeta `content/`**: el blog tiene una única fuente de artículos,
`js/data/articles.js`. El `.md` es el formato de entrega; su contenido se
transcribe a ese archivo así:

1. Abrí `js/data/articles.js` y ubicá el arreglo `ARTICLES`.
2. Agregá un objeto nuevo **al final del arreglo** (antes del `];` que lo
   cierra), respetando las comas que separan los objetos.
3. Del front matter del `.md` (el bloque entre los dos primeros `---`), copiá
   cada campo al objeto con el mismo nombre:
   - `title` → `title: "…"`
   - `slug` → `slug: "…"` (identificador de la URL `#/articulos/<slug>`)
   - `description` → `description: "…"`
   - `category` → `category: "…"` (una sección de época o de problema)
   - `types` → `types: […]` (lista; puede tener varios, p. ej.
     `["Ensayo", "Artículo"]`)
   - `author` → `author: "…"`
   - `coverImage` → `coverImage: "…"` (ver más abajo)
   - `createdAt` → `createdAt: "AAAA-MM-DD"`
4. Calculá `readingTime` (minutos de lectura, entero) y agregalo al objeto. Si
   usás el `.json` en lugar del `.md`, ese campo ya viene calculado.
5. Copiá el cuerpo del `.md` (todo lo que sigue al segundo `---`) dentro del
   campo `content`, entre backticks, porque `articles.js` usa un *template
   literal*:

   ```js
   content: `## Título

   Texto completo en Markdown…`,
   ```

   No cambies el Markdown: el sitio lo renderiza tal cual.
6. Guardá y verificá que el arreglo siga siendo válido:

   ```bash
   node --check js/data/articles.js
   ```

   Después recargá el sitio y comprobá que el artículo aparece en el feed, en su
   sección de época o problema **y** en la de su tipo de texto.

El archivo `.md` se llama `<slug>.md` (por ejemplo,
`el-tiempo-segun-san-agustin.md`). Ese `slug` es el que va en el campo `slug` y
el que aparece en la URL; no hay que crear una carpeta por artículo.

### Qué hacer con la imagen de portada

1. Guardá el archivo de la imagen en la carpeta **`assets/`** del proyecto (no
   en subcarpetas nuevas). Formatos recomendados: **JPG, PNG o WebP**.
2. Renombrala con el patrón **`<slug>.<ext>`**, el mismo `slug` del artículo:
   por ejemplo `el-tiempo-segun-san-agustin.jpg`. El editor ya exporta el `.md`
   con esa ruta cuando la imagen se cargó desde un archivo local; si la recibís
   con otro nombre, renombrala.
3. En el objeto de `js/data/articles.js`, dejá
   `coverImage: "./assets/<slug>.<ext>"` apuntando a ese archivo exacto.
4. Si la propuesta **no trae imagen**, dejá `coverImage: ""` (o el campo
   afuera): la tarjeta usa la portada SVG de respaldo y no hay que copiar nada.
5. El data-URL guardado en el borrador **no sirve** para el sitio publicado ni
   para otros dispositivos: hay que copiar el archivo real a `assets/`.

### Después de incorporar

1. Volvé a desplegar (subir los archivos al hosting estático).
2. Comprobá que el artículo aparece en el feed, en su sección de época o
   problema y en la sección de su tipo de texto (o tipos), con su portada.

### Los tres estados de una publicación

| Estado | Dónde vive | Visible para otros |
|---|---|---|
| **Borrador local** | `localStorage` del navegador del autor | No |
| **Propuesta compartida** | Correo o archivo exportado | Solo el administrador |
| **Publicación incorporada** | `js/data/articles.js` + `assets/` | Sí, en la web desplegada |

### Cambiar el correo del administrador

Editá `adminEmail` en **`js/data/config.js`** (ahí también se ajustan
`url` —el dominio público para la previsualización—, las
categorías sugeridas y el autor por defecto).

---

## Accesibilidad

- **Estructura semántica**: encabezado, `main` con `aria-label` y secciones
  con nombre; el feed y la cuadrícula exponen sus enlaces con etiquetas
  descriptivas («Título — Categoría. Abrir artículo»).
- **Teclado**: todo se recorre con `Tab`; las tarjetas son enlaces (`Enter`
  abre), el feed responde a flechas, `PageUp/PageDown`, `Home/End`, y los
  diálogos (menú, configuración, confirmación, propuesta) atrapan el foco y se
  cierran con `Escape`.
- **Foco visible**: `:focus-visible` con contraste alto; en el drawer, el anillo
  de foco se dibuja sobre la tarjeta completa de cada opción.
- **Diálogos**: el menú y el drawer son `<dialog>` nativos (semántica modal,
  foco atrapado, fondo inerte: no se puede desplazar la página de atrás). La
  confirmación de borrado enfoca «Cancelar» primero, para que la acción
  destructiva no se dispare por accidente.
- **Contraste**: pares texto/fondo verificados por píxeles en ambos temas
  (≥ 4.5:1). El texto sobre portadas usa marfil sobre un degradado oscuro.
- **Áreas táctiles**: controles de ~38–44 px (hamburguesa, cierre, opciones del
  drawer, botones de confirmación).
- **Movimiento**: se respeta `prefers-reduced-motion` (se anulan transiciones y
  scroll suave).
- **Formularios**: el editor usa etiquetas asociadas, `fieldset`/`legend` en los
  grupos de opciones y mensajes de estado con `aria-live`.

---

## Compatibilidad

Pensado para **navegadores modernos** (Chrome/Edge/Firefox/Safari actuales), en
escritorio y móvil. Se apoyan funciones estándar recientes:

- Módulos ES nativos e `import()` dinámico.
- Variables CSS, `color-mix()`, `:has()`, `aspect-ratio`, `text-wrap: balance`.
- `<dialog>` nativo, `backdrop-filter`, `mask-image`.
- `100dvh` y `env(safe-area-inset-*)` (mejora en móviles con notch).
- `container-type`/`cqh` en el editor (hay respaldo si no está soportado).

No hay polyfills: en un navegador muy antiguo el sitio puede degradarse (por
ejemplo, sin fondo desenfocado o sin el ajuste por contenedor), pero el
contenido y la navegación siguen funcionando porque son HTML, CSS y enlaces
normales. **No se usan CDN**: todo se sirve desde el propio sitio, así que
funciona sin conexión una vez cargado (salvo las portadas remotas de los
artículos de ejemplo, que son de Wikimedia Commons).

---

## Despliegue

Es un sitio **estático**: se sube tal cual, sin compilar. No hay variables de
entorno ni proceso de build.

### Opción rápida (surge.sh)

```bash
npx surge . blog-filosofico.surge.sh
```

El archivo **`CNAME`** (`blog-filosofico.surge.sh`) fija el dominio. También
sirve cualquier hosting estático (GitHub Pages, Netlify, Vercel, un bucket S3,
un servidor con Nginx…).

### Dominio y previsualización

El dominio público se configura en **dos lugares** y deben coincidir:

1. **`js/data/config.js` → `SITE.url`** — lo usa `js/lib/meta.js` para armar las
   URLs absolutas de Open Graph / Twitter y el canónico.
2. **`index.html`** — `canonical`, `og:url`, `og:image` y `twitter:image`
   llevan la URL absoluta, para los rastreadores que no ejecutan JavaScript.

Si cambiás de dominio, actualizá ambos (y el `CNAME`).

### Actualizar el contenido

Como no hay backend, publicar es **editar y volver a subir**: agregá la
publicación a `js/data/articles.js` (y los recursos a `assets/`) y desplegá de
nuevo. El feed, la cuadrícula y las secciones se actualizan solos.

---

## Limitaciones de una página estática

- No hay backend: no se envían correos ni se publican artículos desde el sitio.
- Enviar una propuesta **no** incorpora el artículo al feed; hace falta el paso
  manual.
- El borrador es local a cada navegador y no se sincroniza entre dispositivos.
- Publicar automáticamente requeriría un servicio externo (serverless, un CMS o
  la API de GitHub con un token), fuera del alcance de esta versión.

---

## Verificación automática

Los tests usan el protocolo DevTools de Chrome, sin dependencias.

- `tests/e2e.mjs`: el encabezado y el dock no se mueven, la página no scrollea,
  la proporción de tarjeta es ~3/4, no hay desborde horizontal, **cada tarjeta
  abre su artículo correcto**, artículos distintos abren contenido distinto, la
  carga directa por URL funciona, el Markdown se renderiza y el respaldo SVG
  funciona sin red.
- `tests/editor.e2e.mjs`: menú (tres opciones, cierre con Escape), campos de la
  publicación, barra de herramientas, **tarjeta de previsualización con el
  componente real** (mismo radio/estilos que el feed), **artículo con la
  plantilla real**, actualización en vivo, pestañas y modos, seguridad del
  Markdown, diálogo de propuesta (requisitos, descargas y `mailto` breve),
  exportación `.md`/`.json`, borrador tras recargar y vistas provisionales.
- `tests/sections.e2e.mjs`: «Secciones» abre la cuadrícula (conservando el
  encabezado), las 21 tarjetas tienen imagen, nombre, descripción y contador,
  la cuadrícula tiene scroll vertical sin desborde horizontal, cada tarjeta
  abre su sección, la sección muestra **solo** sus artículos, los contadores del
  DOM coinciden con los derivados de `ARTICLES`, el estado vacío aparece, la
  carga directa por URL funciona y «Volver» del lector regresa a la misma
  sección.
- `tests/sections-dynamic.mjs`: inserta y quita temporalmente una publicación en
  `js/data/articles.js` y comprueba que aparece/desaparece de su sección, que al
  cambiarle la categoría se mueve de sección, y que un borrador local **no**
  aparece en el catálogo público. Restaura el archivo original siempre
  (`try/finally`).
- `tests/specs/tipos.spec.mjs`: con el arnés de web-page-verification
  (`./tests/run`), comprueba en Chromium y Firefox, en escritorio y móvil, que
  la cuadrícula incluye el grupo *Por tipo de texto*, que sus cinco tarjetas
  muestran una imagen cargada y que cada tipo agrupa los artículos correctos
  (incluido uno con dos tipos).
- `tests/settings.e2e.mjs`: abre/cierra el drawer (botón, fondo y Escape),
  cambia a cuadrícula y comprueba que persiste al recargar y que abre los
  mismos artículos que el feed, cambia a modo oscuro y comprueba que persiste,
  verifica que «Cancelar» no borra nada y que «Borrar datos» elimina las claves
  locales, restablece las preferencias (feed + claro) y no rompe los artículos
  ni las secciones.
- `tests/meta.e2e.mjs`: comprueba los metadatos de la portada (Open Graph y
  Twitter Card, imagen 1200×630, canónico) y que al navegar se actualizan el
  título, la descripción, la portada de la vista activa y la URL absoluta; que
  una sección con SVG cae en la portada del sitio; y que el host de `SITE.url`
  coincide con el archivo `CNAME` (el dominio se toma de esa fuente).

```bash
./serve.sh 8137 &

chromium-browser --headless=new --no-sandbox --disable-gpu \
  --user-data-dir="$TMPDIR/chrome-blog" --remote-debugging-port=9222 \
  http://127.0.0.1:8137/ &

node tests/e2e.mjs 9222 movil online 390 844
node tests/e2e.mjs 9222 escritorio online 1440 900
node tests/e2e.mjs 9222 movil-sin-red offline 390 844
node tests/editor.e2e.mjs 9222 editor-escritorio 1440 900
node tests/editor.e2e.mjs 9222 editor-movil 390 844
node tests/sections.e2e.mjs 9222 secciones-escritorio 1440 900
node tests/sections.e2e.mjs 9222 secciones-movil 390 844
node tests/sections-dynamic.mjs 9222
node tests/settings.e2e.mjs 9222 config-escritorio 1440 900
node tests/settings.e2e.mjs 9222 config-movil 390 844
node tests/meta.e2e.mjs 9222

# Arnés de web-page-verification: abre él mismo el servidor y los navegadores
./tests/run
```

### Comprobación manual

1. En el feed, deslizá: cambia la publicación; encabezado y franja inferior no
   se mueven. No aparece scroll horizontal.
2. Tocá una tarjeta: se abre **su** artículo (`#/articulos/<slug>`); «Volver»
   regresa al feed en la misma posición. Probá dos tarjetas distintas.
3. Abrí el menú → *Crear artículo*. Completá título, descripción, categoría,
   autor y portada; escribí Markdown.
4. En *Vista previa*, alterná **Tarjeta del feed** y **Artículo completo**:
   deben verse como el sitio real y actualizarse al escribir.
5. Recargá: el borrador sigue ahí. Probá «Descargar artículo (.md)» y, en
   «Enviar propuesta por correo», completá los requisitos: descargá el `.md`,
   descargá la imagen remota (o abrí la alternativa) y marcá las casillas.
6. Activá modo avión y recargá: las portadas SVG siguen apareciendo.
7. Abrí el menú → *Secciones*: aparece la cuadrícula. Tocá una tarjeta: se abre
   su página con sus artículos; tocá un artículo y volvé: regresás a la misma
   sección. Probá una sección vacía (por ejemplo, *Filosofía medieval*).
8. Abrí el menú → *Configuración*: el drawer entra desde la derecha. Cambiá a
   *Cuadrícula* y a *Modo oscuro*; recargá y comprobá que se mantienen. Cerrá
   con el botón, con Escape y pulsando fuera del panel.
9. Pulsá *Borrar todos los datos* → *Cancelar*: no se borra nada. Repetí y
   confirmá *Borrar datos*: vuelven el feed vertical y el modo claro, y aparece
   un aviso discreto. Los artículos y las secciones siguen funcionando.

---

## Solución de problemas

**No se ve la portada al compartir un enlace.** Las redes necesitan una URL
**absoluta**. Verificá que `SITE.url` (en `js/data/config.js`) y las etiquetas
de `index.html` apunten al dominio real (con `https://`, sin ruta relativa) y
que la imagen responda:
`curl -I https://<dominio>/assets/social-preview.png`. Los rastreadores cachean
las previsualizaciones: puede tardar en refrescarse.

**La previsualización muestra la home y no el artículo.** Es esperable: las
rutas son con `#` y los rastreadores no envían el fragmento al servidor. Ver
[Previsualización al compartir](#previsualización-al-compartir-open-graph).

**No abre o se ve roto al abrir `index.html` con doble clic.** Los módulos ES
requieren `http(s)://`, no `file://`. Serví la carpeta con `./serve.sh` o
`python3 -m http.server`.

**Aparece un instante el tema o la vista equivocados.** El script de arranque
del `<head>` lee `localStorage` antes del primer pintado; si el almacenamiento
está bloqueado, cae en claro + feed. Revisá que no haya errores de consola.

**«Borrar todos los datos» no borra algo.** Solo limpia claves con el prefijo
`blogfilosofia` en `localStorage`/`sessionStorage` (y, si existieran, IndexedDB
y cookies con ese prefijo). No borra datos de otros sitios ni cachés del
navegador. Ver [Configuración](#configuración-drawer-lateral).

**Una imagen de artículo no carga sin conexión.** Las portadas de los ejemplos
son URLs de Wikimedia Commons (remotas); sin red se usa la portada SVG local de
respaldo. Para que funcionen siempre, guardá la imagen en `assets/` y apuntá
`coverImage` a `./assets/<archivo>`.

**El drawer no se cierra con `Escape`.** Solo cuando tiene el foco; hacé clic
dentro del panel o usá su botón de cierre.

---

## Alcance

Implementado: feed con scroll, página individual por publicación, menú
principal, **explorador de secciones** (cuadrícula temática y páginas de
sección derivadas de los datos), **drawer de configuración** (vista feed o
cuadrícula, tema claro u oscuro y borrado de datos locales), editor de
publicaciones con portada, doble previsualización, borrador local, exportación
y envío por correo.

Fuera de alcance: búsqueda, orden por fecha o relevancia, panel de
administración, backend y publicación automática. La arquitectura ya separa
datos, componentes y estilos para incorporarlos sin rehacer la interfaz.
