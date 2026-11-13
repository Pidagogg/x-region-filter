// ==== Which theme the X page is in ====
// X has three themes (light, dim, lights out) and picks them itself, whatever
// the system says, so the bars can't rely on prefers-color-scheme. X paints
// the theme as the page background, and that colour is all this reads.
// Pure, so the tests can import it.

export type Theme = "light" | "dim" | "dark";

/** `background` is a computed colour ("rgb(21, 32, 43)"); `systemDark` decides when it says nothing. */
export function themeFromBackground(background: string, systemDark = false): Theme {
  const m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?/.exec(background);
  const alpha = m?.[4] === undefined ? 1 : parseFloat(m[4]) / (m[4].endsWith("%") ? 100 : 1);
  if (!m || !(alpha > 0.5)) return systemDark ? "dark" : "light";
  const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
  // perceived brightness, 0–255
  const light = 0.299 * r + 0.587 * g + 0.114 * b;
  if (light > 140) return "light";
  return Math.max(r, g, b) <= 12 ? "dark" : "dim";
}
