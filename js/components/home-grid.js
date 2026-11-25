/**
 * home-grid.js — Cuadrícula de lectura (#/leer).
 *
 * Presentación alternativa al feed vertical. Reutiliza la MISMA fuente de
 * datos (`ARTICLES`), las MISMAS tarjetas que la página de sección
 * (`createCard` con `variant: "grid"`) y las MISMAS rutas de navegación
 * (`#/articulos/<slug>`). No duplica datos ni lógica: solo cambia la
 * disposición, y se prepara en la primera ruta `#/leer` (main.js).
 */

import { ARTICLES } from "../data/articles.js";
import { createCard } from "./card.js";

export function createHomeGrid(root) {
  const inner = document.createElement("div");
  inner.className = "home-grid__inner";

  const grid = document.createElement("div");
  grid.className = "card-grid";

  const cards = ARTICLES.map((article) => createCard(article, { variant: "grid" }));
  cards.forEach((card) => grid.append(card));

  inner.append(grid);
  root.append(inner);

  return { element: root, grid, cards };
}
