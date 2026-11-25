/**
 * app.js — interfaz del panel local. Solo habla con la API del servidor:
 * no publica, no envía correos y no escribe directamente en el repositorio.
 */

import { documentUrlFromDriveLink } from "/site/lib/document-embed.js";

const $ = (selector) => document.querySelector(selector);
let tokenActual = null;
let catalogo = { categorias: [], tipos: [] };

function registrar(texto, error = false) {
  const registro = $("#registro");
  registro.textContent = texto;
  registro.classList.toggle("error", error);
}

async function api(ruta, opciones = {}) {
  const respuesta = await fetch(ruta, {
    ...opciones,
    headers: { "content-type": "application/json", ...(opciones.headers ?? {}) },
  });
  const datos = await respuesta.json().catch(() => ({ ok: false, error: "respuesta no JSON" }));
  if (!respuesta.ok || datos.ok === false) {
    throw new Error(datos.error ?? `HTTP ${respuesta.status}`);
  }
  return datos;
}

function valores(formulario) {
  return Object.fromEntries(new FormData(formulario).entries());
}

const SUBIDAS = [
  { tipo: "publicacion", selector: "#selector-publicacion", boton: "#boton-subir-publicacion", lista: "#lista-archivos-publicacion" },
  { tipo: "pregunta", selector: "#selector-pregunta", boton: "#boton-subir-pregunta", lista: "#lista-archivos-pregunta" },
  { tipo: "respuesta", selector: "#selector-respuesta", boton: "#boton-subir-respuesta", lista: "#lista-archivos-respuesta" },
];
const MD_MAX = 512 * 1024;
const IMG_MAX = 2 * 1024 * 1024;
const estadoArchivos = { publicacion: [], pregunta: [], respuesta: [] };

function leerArchivoSubida(file, comoDataUrl) {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => resolve(String(lector.result));
    lector.onerror = () => reject(new Error(`no se pudo leer ${file.name}`));
    if (comoDataUrl) lector.readAsDataURL(file);
    else lector.readAsText(file);
  });
}

/** Lee .md como texto y portadas como data-URL; el servidor vuelve a validar. */
async function prepararArchivos(files) {
  const preparados = [];
  for (const file of files) {
    const nombre = file.name;
    if (/\.md$/i.test(nombre)) {
      if (file.size > MD_MAX) {
        preparados.push({ nombre, error: "supera 512 KiB" });
      } else {
        preparados.push({ nombre, contenido: await leerArchivoSubida(file, false) });
      }
    } else if (/\.(jpe?g|png|webp)$/i.test(nombre)) {
      if (file.size > IMG_MAX) {
        preparados.push({ nombre, error: "supera 2 MiB" });
      } else {
        preparados.push({ nombre, dataUrl: await leerArchivoSubida(file, true) });
      }
    } else {
      preparados.push({ nombre, error: "tipo no admitido (use .md, JPG, PNG o WebP)" });
    }
  }
  return preparados;
}

function pintarArchivos(config) {
  $(config.lista).replaceChildren(...estadoArchivos[config.tipo].map((entrada) => {
    const item = document.createElement("li");
    item.className = entrada.ok ? "aceptado" : "rechazado";
    item.textContent = `${entrada.ok ? "✓" : "✗"} ${entrada.nombre}${entrada.detalle ? ` — ${entrada.detalle}` : ""}`;
    return item;
  }));
}

async function enviarArchivos(config) {
  const selector = $(config.selector);
  const files = [...(selector.files ?? [])];
  if (!files.length) {
    registrar("Elegí al menos un archivo del participante.", true);
    return;
  }
  try {
    const preparados = await prepararArchivos(files);
    const enviables = preparados.filter((entrada) => !entrada.error);
    const rechazados = preparados.filter((entrada) => entrada.error);
    for (const entrada of rechazados) {
      estadoArchivos[config.tipo].push({ nombre: entrada.nombre, ok: false, detalle: entrada.error });
    }
    if (enviables.length) {
      const cuerpo = {
        tipo: config.tipo,
        archivos: enviables.map((entrada) => ({
          nombre: entrada.nombre,
          contenido: entrada.contenido ?? "",
          ...(entrada.dataUrl ? { dataUrl: entrada.dataUrl } : {}),
        })),
      };
      try {
        const resultado = await api("/api/archivos", {
          method: "POST",
          body: JSON.stringify(cuerpo),
        });
        for (const entrada of enviables) {
          estadoArchivos[config.tipo].push({ nombre: entrada.nombre, ok: true, detalle: "guardado" });
        }
        registrar(`${resultado.aviso}\n${resultado.guardados.join("\n")}`);
      } catch (error) {
        for (const entrada of enviables) {
          estadoArchivos[config.tipo].push({ nombre: entrada.nombre, ok: false, detalle: error.message });
        }
        registrar(error.message, true);
      }
    }
    selector.value = "";
  } catch (error) {
    registrar(error.message, true);
  } finally {
    pintarArchivos(config);
    await cargarEstado();
  }
}

function hoy() {
  return new Date().toISOString().slice(0, 10);
}

/** Lunes ISO de la semana actual (UTC). */
function lunesDeHoy() {
  const fecha = new Date();
  const dia = fecha.getUTCDay() || 7;
  fecha.setUTCDate(fecha.getUTCDate() - dia + 1);
  return fecha.toISOString().slice(0, 10);
}

async function cargarEstado() {
  const datos = await api("/api/estado");
  catalogo = datos.catalogo ?? catalogo;
  tokenActual = datos.token?.vigente ? datos.token : null;
  const salud = $("#salud");
  salud.textContent = `Servidor local · puerto ${datos.puerto ?? 8177}`;
  salud.className = "salud bien";
  $("#estado-token").textContent = datos.token?.vigente
    ? `Simulación vigente (caduca en ${Math.round(datos.token.expiraEnMs / 1000)} s). Confirmá con APLICAR.`
    : "Sin simulación válida: simular antes de aplicar.";
  $("#boton-aplicar").disabled = !tokenActual;
  $("#categorias").replaceChildren(...catalogo.categorias.map((nombre) => {
    const opcion = document.createElement("option");
    opcion.value = nombre;
    return opcion;
  }));
  $("#tipos-publicacion").replaceChildren(...catalogo.tipos.map((nombre) => {
    const etiqueta = document.createElement("label");
    const caja = document.createElement("input");
    caja.type = "checkbox";
    caja.name = "types";
    caja.value = nombre;
    etiqueta.append(caja, document.createTextNode(` ${nombre}`));
    return etiqueta;
  }));
  pintarBorradores(datos.borradores ?? []);
}

function pintarBorradores(borradores) {
  const lista = $("#lista-borradores");
  if (!borradores.length) {
    const vacio = document.createElement("li");
    vacio.textContent = "Todavía no hay borradores. Guardá uno desde los formularios de arriba.";
    lista.replaceChildren(vacio);
    return;
  }
  lista.replaceChildren(...borradores.map((item) => {
    const fila = document.createElement("li");
    const etiqueta = document.createElement("span");
    if (item.tipo === "respuesta") {
      etiqueta.textContent = `Respuesta · ${item.key ?? "?"} · ${item.autorSlug ?? "?"}`;
    } else if (item.tipo === "pregunta") {
      etiqueta.textContent = `Pregunta · ${item.key ?? "?"} · ${item.estado ?? "?"}`;
    } else {
      etiqueta.textContent = `Publicación · ${item.titulo ?? item.slug ?? "?"}`;
    }
    const archivo = document.createElement("code");
    archivo.textContent = item.archivo;
    const abrir = document.createElement("button");
    abrir.type = "button";
    abrir.textContent = "Abrir";
    abrir.addEventListener("click", () => abrirBorrador(item));
    const borrar = document.createElement("button");
    borrar.type = "button";
    borrar.textContent = "Borrar";
    borrar.addEventListener("click", async () => {
      try {
        const resultado = await api("/api/borradores", {
          method: "DELETE",
          body: JSON.stringify({ archivo: item.archivo }),
        });
        registrar(`Borrado: ${resultado.eliminado}`);
        await cargarEstado();
      } catch (error) {
        registrar(error.message, true);
      }
    });
    fila.append(etiqueta, archivo, abrir, borrar);
    if (item.error) {
      const aviso = document.createElement("span");
      aviso.textContent = `No se pudo leer: ${item.error}`;
      fila.append(aviso);
    }
    return fila;
  }));
}

function activarPestaña(tipo) {
  document.querySelectorAll(".pestaña").forEach((boton) => {
    boton.classList.toggle("activa", boton.dataset.tab === tipo);
  });
  document.querySelectorAll(".panel[id^='tab-']").forEach((panel) => {
    panel.classList.toggle("oculto", panel.id !== `tab-${tipo}`);
  });
}

/** Pinta el switch segmentado del formulario desde el modelo (`kind`). */
function marcarKind(formulario, valor) {
  const oficial = valor === "oficial";
  formulario.dataset.kind = oficial ? "oficial" : "normal";
  formulario.querySelectorAll("[data-kind]").forEach((boton) => {
    boton.setAttribute("aria-pressed", String((boton.dataset.kind === "oficial") === oficial));
  });
}

/** El modelo sigue siendo `""`/`"oficial"`: "normal" no se envía al servidor. */
function kindSeleccionado(formulario) {
  return formulario.querySelector('[data-kind="oficial"]')?.getAttribute("aria-pressed") === "true"
    ? "oficial"
    : "";
}

function llenarFormulario(formulario, datos) {
  for (const [clave, valor] of Object.entries(datos ?? {})) {
    if (clave === "types" && Array.isArray(valor)) {
      formulario.querySelectorAll('input[name="types"]').forEach((caja) => {
        caja.checked = valor.some((tipo) => String(tipo).toLowerCase() === caja.value.toLowerCase());
      });
      continue;
    }
    if (clave === "cover" && valor && typeof valor === "object") {
      if (formulario.elements.credit) formulario.elements.credit.value = valor.credit ?? "";
      continue;
    }
    if (clave === "kind") {
      marcarKind(formulario, valor);
      continue;
    }
    if (clave === "documentoPendiente") {
      if (formulario.elements.documentoPendiente) {
        formulario.elements.documentoPendiente.value = String(valor).trim() ? "si" : "no";
      }
      continue;
    }
    if (clave === "unidad") {
      if (formulario.elements.unidad) formulario.elements.unidad.checked = valor === "no";
      continue;
    }
    if (clave === "authorization" || clave === "publicarEmail") {
      if (formulario.elements[clave]) formulario.elements[clave].value = valor || "no";
      continue;
    }
    const campo = formulario.elements[clave];
    if (campo && typeof campo.value === "string") campo.value = valor ?? "";
  }
}

function abrirBorrador(item) {
  activarPestaña(item.tipo);
  const formulario = $(`#form-${item.tipo}`);
  formulario.reset();
  marcarKind(formulario, "");
  llenarFormulario(formulario, item.datos);
  if (item.tipo === "respuesta" && item.autorSlug && formulario.elements.autorSlug) {
    formulario.elements.autorSlug.value = item.autorSlug;
  }
  registrar(`Borrador abierto: ${item.archivo}. Recordá guardar tras editar.`);
}

function leerArchivo(file) {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => resolve(String(lector.result));
    lector.onerror = () => reject(new Error("no se pudo leer la imagen"));
    lector.readAsDataURL(file);
  });
}

function datosPublicacion(formulario) {
  const v = valores(formulario);
  const tipos = [...formulario.querySelectorAll('input[name="types"]:checked')].map((caja) => caja.value);
  const archivo = v.portada instanceof File ? v.portada : null;
  const datos = {
    tipo: "publicacion",
    title: v.title ?? "",
    slug: v.slug ?? "",
    description: v.description ?? "",
    category: v.category ?? "",
    types: tipos,
    author: v.author ?? "",
    createdAt: v.createdAt ?? "",
    content: v.content ?? "",
    cover: v.credit ? { credit: v.credit } : {},
    kind: kindSeleccionado(formulario),
    documentUrl: v.documentUrl ?? "",
    driveLink: v.driveLink ?? "",
    documentoPendiente: v.documentoPendiente ?? "no",
  };
  return archivo ? leerArchivo(archivo).then((portada) => ({ ...datos, portada })) : datos;
}

async function guardar(formulario, construir) {
  try {
    const datos = await construir(formulario);
    const resultado = await api("/api/borradores", {
      method: "POST",
      body: JSON.stringify(datos),
    });
    registrar(`${resultado.aviso}\nArchivo: ${resultado.archivo}${resultado.portada ? `\nPortada: ${resultado.portada}` : ""}`);
    await cargarEstado();
  } catch (error) {
    registrar(error.message, true);
  }
}

function inicializar() {
  $("#form-publicacion").elements.createdAt.value = hoy();
  $("#form-pregunta").elements.week.value = lunesDeHoy();

  document.querySelectorAll(".pestaña").forEach((boton) => {
    boton.addEventListener("click", () => activarPestaña(boton.dataset.tab));
  });

  // La subida NO pre-llena el formulario: «Abrir» sigue siendo bajo demanda.
  for (const config of SUBIDAS) {
    $(config.boton).addEventListener("click", () => enviarArchivos(config));
    pintarArchivos(config);
  }

  const enlaceDrive = $("#drive-link");
  const formPublicacion = $("#form-publicacion");
  marcarKind(formPublicacion, "");

  formPublicacion.querySelectorAll("[data-kind]").forEach((boton) => {
    boton.addEventListener("click", () => marcarKind(formPublicacion, boton.dataset.kind));
  });

  /**
   * Convierte el enlace compartido en el visor del campo oculto `documentUrl`.
   * Enlace vacío lo borra; host ajeno conserva la última URL válida y avisa,
   * sin lanzar hacia el resto del formulario.
   */
  function convertirEnlaceDrive(valor) {
    const texto = String(valor ?? "").trim();
    if (!texto) {
      formPublicacion.elements.documentUrl.value = "";
      return true;
    }
    try {
      const url = documentUrlFromDriveLink(texto);
      enlaceDrive.value = texto;
      formPublicacion.elements.documentUrl.value = url;
      formPublicacion.elements.documentoPendiente.value = "no";
      registrar(`Enlace de Drive convertido: ${url}`);
      return true;
    } catch (error) {
      registrar(error.message, true);
      return false;
    }
  }

  $("#boton-drive").addEventListener("click", () => {
    window.open("https://drive.google.com/", "_blank", "noopener");
    enlaceDrive.focus();
    registrar("Pegá acá el enlace cuando vuelvas de Drive");
  });
  enlaceDrive.addEventListener("paste", (evento) => {
    const texto = evento.clipboardData?.getData("text") ?? "";
    if (!texto) return;
    evento.preventDefault();
    convertirEnlaceDrive(texto);
  });
  enlaceDrive.addEventListener("input", () => {
    const texto = enlaceDrive.value.trim();
    if (!texto) convertirEnlaceDrive("");
    else if (/drive\.google\.com/i.test(texto)) convertirEnlaceDrive(texto);
  });
  formPublicacion.elements.documentoPendiente.addEventListener("change", (evento) => {
    if (evento.target.value === "si") {
      formPublicacion.elements.documentUrl.value = "";
    } else {
      const texto = enlaceDrive.value.trim();
      if (texto) convertirEnlaceDrive(texto);
    }
  });

  formPublicacion.addEventListener("submit", (evento) => {
    evento.preventDefault();
    guardar(evento.currentTarget, datosPublicacion);
  });
  $("#form-pregunta").addEventListener("submit", (evento) => {
    evento.preventDefault();
    guardar(evento.currentTarget, (formulario) => {
      const v = valores(formulario);
      return {
        tipo: "pregunta",
        week: v.week ?? "",
        slug: v.slug ?? "",
        estado: v.estado ?? "abierta",
        question: v.question ?? "",
        context: v.context ?? "",
        note: v.note ?? "",
        closing: v.closing ?? "",
        cover: v.cover ?? "",
        unidad: v.unidad ? "no" : "",
        content: v.content ?? "",
      };
    });
  });
  $("#form-respuesta").addEventListener("submit", (evento) => {
    evento.preventDefault();
    guardar(evento.currentTarget, (formulario) => {
      const v = valores(formulario);
      return {
        tipo: "respuesta",
        week: v.week ?? "",
        slug: v.slug ?? "",
        author: v.author ?? "",
        autorSlug: v.autorSlug ?? "",
        authorization: v.authorization ?? "no",
        city: v.city ?? "",
        email: v.email ?? "",
        publicarEmail: v.publicarEmail ?? "no",
        publicar: Boolean(v.publicar),
        content: v.content ?? "",
      };
    });
  });

  $("#boton-actualizar").addEventListener("click", async () => {
    try {
      await cargarEstado();
      registrar("Lista de borradores actualizada.");
    } catch (error) {
      registrar(error.message, true);
    }
  });

  $("#boton-simular").addEventListener("click", async () => {
    try {
      const resultado = await api("/api/simular", { method: "POST", body: "{}" });
      tokenActual = resultado.token;
      const detalle = resultado.salidas.map((salida) =>
        `${salida.script}: código ${salida.code}\n${salida.stdout}${salida.stderr}`
      ).join("\n\n");
      registrar(`${resultado.aviso}\n\n${detalle}`, !resultado.ok);
      $("#boton-aplicar").disabled = !resultado.token;
    } catch (error) {
      registrar(error.message, true);
    }
  });

  $("#boton-preview").addEventListener("click", async () => {
    try {
      const resultado = await api("/api/preview", { method: "POST", body: "{}" });
      const enlaces = $("#enlaces-preview");
      const iframes = $("#iframes-preview");
      enlaces.replaceChildren();
      iframes.replaceChildren();
      for (const vista of resultado.vistas) {
        const enlace = document.createElement("a");
        enlace.href = vista.url;
        enlace.target = "_blank";
        enlace.rel = "noopener";
        enlace.textContent = vista.etiqueta;
        enlaces.append(enlace);
        const figura = document.createElement("figure");
        const titulo = document.createElement("figcaption");
        titulo.textContent = vista.etiqueta;
        const marco = document.createElement("iframe");
        marco.src = vista.url;
        marco.title = `Vista previa: ${vista.etiqueta}`;
        marco.loading = "lazy";
        figura.append(titulo, marco);
        iframes.append(figura);
      }
      $("#previews-seccion").classList.remove("oculto");
      registrar(`${resultado.aviso}\nVistas: ${resultado.vistas.length}\nCerradas solo en la copia: ${resultado.cerradasEnCopia.join(", ") || "ninguna"}`);
    } catch (error) {
      registrar(error.message, true);
    }
  });

  $("#boton-aplicar").addEventListener("click", async () => {
    try {
      const resultado = await api("/api/aplicar", {
        method: "POST",
        body: JSON.stringify({ token: tokenActual, confirmacion: $("#confirmacion").value }),
      });
      registrar(`${resultado.aviso}\n\nFeeds: ${resultado.feedsAlDia ? "al día" : "REVIRAR"}\n${resultado.salidas.map((s) => `${s.script}: código ${s.code}`).join("\n")}`, !resultado.ok);
      tokenActual = null;
      $("#boton-aplicar").disabled = true;
      await cargarEstado();
    } catch (error) {
      registrar(error.message, true);
    }
  });

  cargarEstado().catch((error) => {
    const salud = $("#salud");
    salud.textContent = "Sin conexión con el servidor local";
    salud.className = "salud mal";
    registrar(error.message, true);
  });
}

inicializar();
