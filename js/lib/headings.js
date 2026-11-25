/**
 * headings.js — Esquema de encabezados del editor.
 *
 * Se mantiene aparte de `markdown.js`: marked y DOMPurify pesan ~130 KB y solo
 * hacen falta al renderizar el cuerpo de un artículo. Leer los encabezados para
 * la estructura del editor es texto plano y no debe cargar ese peso en el
 * arranque de la portada.
 */

/**
 * Extrae los encabezados (# … ####) para el esquema de jerarquía del editor.
 * Ignora el contenido dentro de bloques de código.
 * @param {string} markdown
 * @returns {{level:number, text:string, line:number}[]}
 */
export function extractHeadings(markdown) {
  const headings = [];
  let inFence = false;

  String(markdown ?? "")
    .split("\n")
    .forEach((line, index) => {
      if (/^\s*(```|~~~)/.test(line)) {
        inFence = !inFence;
        return;
      }
      if (inFence) return;

      const match = /^(#{1,4})\s+(.+?)\s*#*\s*$/.exec(line);
      if (match) {
        headings.push({
          level: match[1].length,
          text: match[2].replace(/[*_`~]/g, "").trim(),
          line: index,
        });
      }
    });

  return headings;
}
