/**
 * feed.js — Área central de publicaciones.
 *
 * Responsabilidades:
 *  - Renderizar una tarjeta por publicación (a partir de ARTICLES).
 *  - Mantener el tamaño de tarjeta en ~3/4 de la altura disponible y el
 *    relleno que las centra (variables --slide-h y --track-pad).
 *  - Gestionar la navegación: rueda, teclado y snap nativo en táctil.
 *  - Marcar la tarjeta activa.
 *
 * El scroll vive únicamente en el contenedor .feed; la página no scrollea.
 */

import { ARTICLES } from "../data/articles.js";
import { createCard } from "./card.js";

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

export function createFeed({ feed, track }) {
  const cards = ARTICLES.map((article, index) =>
    createCard(article, { index, total: ARTICLES.length, eager: index === 0 })
  );
  cards.forEach((card) => track.append(card));

  let activeIndex = 0;
  let frame = 0;

  /** Proporción de altura por breakpoint (definida en responsive.css). */
  function slideRatio() {
    const raw = getComputedStyle(document.documentElement).getPropertyValue("--slide-ratio");
    const value = Number.parseFloat(raw);
    return Number.isFinite(value) && value > 0 ? value : 0.75;
  }

  /** Recalcula alto de tarjeta y relleno de centrado según el contenedor. */
  function syncMetrics() {
    const height = feed.clientHeight;
    if (!height) return;
    const slide = Math.max(220, Math.round(height * slideRatio()));
    const pad = Math.max(0, Math.round((height - slide) / 2));
    const root = document.documentElement.style;
    root.setProperty("--slide-h", `${slide}px`);
    root.setProperty("--track-pad", `${pad}px`);
  }

  function setActive(index) {
    activeIndex = clamp(index, 0, cards.length - 1);
    cards.forEach((card, i) => {
      card.dataset.active = String(i === activeIndex);
    });
  }

  function nearestIndex() {
    const center = feed.scrollTop + feed.clientHeight / 2;
    let best = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    cards.forEach((card, i) => {
      const distance = Math.abs(card.offsetTop + card.offsetHeight / 2 - center);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = i;
      }
    });
    return best;
  }

  /** Centra la tarjeta indicada (con animación salvo que se pida lo contrario). */
  function goTo(index, smooth = true) {
    const target = clamp(index, 0, cards.length - 1);
    // Si el feed está oculto (modo cuadrícula), no hay geometría que centrar:
    // solo se marca la tarjeta activa para que el estado quede coherente.
    if (!feed.clientHeight) {
      setActive(target);
      return;
    }
    const card = cards[target];
    const top = card.offsetTop - (feed.clientHeight - card.offsetHeight) / 2;
    feed.scrollTo({ top: Math.max(0, top), behavior: smooth ? "smooth" : "auto" });
    setActive(target);
  }

  /** Recalcula métricas y recoloca el feed. Se usa al volver del modo cuadrícula. */
  function refresh() {
    syncMetrics();
    goTo(activeIndex, false);
  }

  function onScroll() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      setActive(nearestIndex());
    });
  }

  // --- Rueda / trackpad: una publicación por gesto ----------------------
  let wheelLocked = false;
  function onWheel(event) {
    if (event.ctrlKey || event.metaKey) return; // respetar zoom
    if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
    if (Math.abs(event.deltaY) < 2) return;
    event.preventDefault();
    if (wheelLocked) return;
    wheelLocked = true;
    setTimeout(() => {
      wheelLocked = false;
    }, 520);
    goTo(nearestIndex() + (event.deltaY > 0 ? 1 : -1));
  }

  // --- Teclado ----------------------------------------------------------
  const KEY_DIRECTION = {
    ArrowDown: 1,
    PageDown: 1,
    ArrowRight: 1,
    ArrowUp: -1,
    PageUp: -1,
    ArrowLeft: -1,
  };

  function onKeydown(event) {
    if (event.key in KEY_DIRECTION) {
      event.preventDefault();
      goTo(nearestIndex() + KEY_DIRECTION[event.key]);
    } else if (event.key === "Home") {
      event.preventDefault();
      goTo(0);
    } else if (event.key === "End") {
      event.preventDefault();
      goTo(cards.length - 1);
    }
  }

  feed.addEventListener("scroll", onScroll, { passive: true });
  feed.addEventListener("wheel", onWheel, { passive: false });
  feed.addEventListener("keydown", onKeydown);

  // --- Adaptación a cambios de tamaño -----------------------------------
  let resizeTimer = 0;
  function onResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      syncMetrics();
      goTo(activeIndex, false);
    }, 80);
  }

  if ("ResizeObserver" in window) {
    new ResizeObserver(onResize).observe(feed);
  } else {
    window.addEventListener("resize", onResize);
  }
  window.addEventListener("orientationchange", onResize);

  syncMetrics();
  setActive(0);

  return {
    cards,
    goTo,
    refresh,
    setActive,
    syncMetrics,
    get activeIndex() {
      return activeIndex;
    },
  };
}
