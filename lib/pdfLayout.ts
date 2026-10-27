// Reading order for text pulled out of a PDF page.
//
// pdf.js returns loose text fragments with positions, in whatever order the
// program that made the PDF wrote them. For a single column that order is
// fine. For a recipe laid out in columns — ingredients down the left,
// directions down the right, or one list running over two columns — it often
// isn't: some programs write row by row, so reading the fragments in order
// glues a left-column line and a right-column line into one ("2 cups grapes,
// halved 2. Halve the grapes…").
//
// So the page is analysed instead: lines are rebuilt from the vertical
// positions, then a vertical channel of white space running down most of the
// page (a gutter) marks where columns are. Text is then read column by
// column, top to bottom, with full-width lines (the title, a section
// banner) acting as dividers so a header never lands in the middle of a
// column. Pure functions, no pdf.js import — easy to test on their own.

export interface LayoutItem {
  str: string;
  /** [a, b, c, d, x, y] — x and y are the fragment's position on the page */
  transform: number[];
  width?: number;
  height?: number;
}

interface Box {
  text: string;
  x0: number;
  x1: number;
  y: number;
  h: number;
}

interface Line {
  boxes: Box[]; // left to right
  y: number;
}

interface Gutter {
  a: number;
  b: number;
}

/** A gutter must be at least this wide (PDF points; ~1 em at body size)… */
const MIN_GUTTER = 12;
/** …and each column at least this wide, so a numbered list's narrow
 * number column or a table's amount column is never mistaken for a layout
 * column. */
const MIN_COLUMN = 100;
/** Fewer lines than this and there's nothing to infer columns from. */
const MIN_LINES = 6;

function toBoxes(items: readonly LayoutItem[]): Box[] {
  const boxes: Box[] = [];
  for (const item of items) {
    if (typeof item.str !== "string" || !item.str.trim()) continue;
    const t = item.transform;
    const h = item.height || Math.abs(t[3]) || Math.abs(t[0]) || 10;
    const x0 = t[4];
    boxes.push({ text: item.str, x0, x1: x0 + (item.width ?? item.str.length * h * 0.5), y: t[5], h });
  }
  return boxes;
}

/** Groups fragments into lines by vertical position (a fragment joins the
 * line whose baseline is within half its height), top of the page first. */
function clusterLines(boxes: Box[]): Line[] {
  const sorted = [...boxes].sort((p, q) => q.y - p.y || p.x0 - q.x0);
  const lines: Line[] = [];
  let anchorY = 0;
  let anchorH = 0;
  for (const box of sorted) {
    const cur = lines[lines.length - 1];
    if (cur && anchorY - box.y <= Math.max(2, Math.min(box.h, anchorH) * 0.5)) {
      cur.boxes.push(box);
    } else {
      lines.push({ boxes: [box], y: box.y });
      anchorY = box.y;
      anchorH = box.h;
    }
  }
  for (const line of lines) line.boxes.sort((p, q) => p.x0 - q.x0);
  return lines;
}

function joinBoxes(boxes: readonly Box[]): string {
  let out = "";
  let prev: Box | null = null;
  for (const box of boxes) {
    if (prev && box.x0 - prev.x1 > box.h * 0.15 && !/\s$/.test(out) && !/^\s/.test(box.text)) out += " ";
    out += box.text;
    prev = box;
  }
  return out.replace(/\s+/g, " ").trim();
}

/** The widest unbroken stretch of text on a line (fragments closer together
 * than ~1.5 em count as one stretch). */
function widestRun(line: Line): number {
  let best = 0;
  let start = line.boxes[0].x0;
  let end = line.boxes[0].x1;
  for (let i = 1; i < line.boxes.length; i++) {
    const b = line.boxes[i];
    if (b.x0 - end <= b.h * 1.5) {
      end = Math.max(end, b.x1);
    } else {
      best = Math.max(best, end - start);
      start = b.x0;
      end = b.x1;
    }
  }
  return Math.max(best, end - start);
}

/** A line is "full width" when one unbroken stretch of it covers most of the
 * text area — a title, a banner, a paragraph. Those never belong to a column
 * and are left out when looking for gutters, so a title or two can't hide one. */
const FULL_WIDTH_SHARE = 0.62;

/** The x ranges of white space that run down (nearly) the whole page. */
export function findGutters(allLines: readonly Line[]): Gutter[] {
  if (allLines.length < MIN_LINES) return [];

  let minX = Infinity;
  let maxX = -Infinity;
  for (const line of allLines) {
    for (const b of line.boxes) {
      minX = Math.min(minX, b.x0);
      maxX = Math.max(maxX, b.x1);
    }
  }
  const lo = Math.floor(minX);
  const hi = Math.ceil(maxX);
  if (hi - lo < 2 * MIN_COLUMN + MIN_GUTTER) return [];

  const lines = allLines.filter((l) => widestRun(l) <= FULL_WIDTH_SHARE * (maxX - minX));
  const n = lines.length;
  if (n < MIN_LINES) return [];

  // how many lines have text over each x position
  const cover = new Int32Array(hi - lo + 1);
  for (const line of lines) {
    const mark = new Uint8Array(hi - lo + 1);
    for (const b of line.boxes) {
      for (let x = Math.max(lo, Math.floor(b.x0)); x <= Math.min(hi, Math.ceil(b.x1)); x++) mark[x - lo] = 1;
    }
    for (let i = 0; i < mark.length; i++) cover[i] += mark[i];
  }

  // a stray line or two (a centred heading) may cross a gutter; no more
  const allowed = Math.max(1, Math.floor(n * 0.04));
  const needSide = Math.max(3, Math.ceil(n * 0.2));
  const gutters: Gutter[] = [];
  let start = -1;
  for (let i = 0; i <= cover.length; i++) {
    const open = i < cover.length && cover[i] <= allowed;
    if (open && start === -1) start = i;
    if (!open && start !== -1) {
      const a = lo + start;
      const b = lo + i;
      start = -1;
      if (b - a < MIN_GUTTER) continue;
      const prevEnd = gutters.length ? gutters[gutters.length - 1].b : minX;
      if (a - prevEnd < MIN_COLUMN || maxX - b < MIN_COLUMN) continue;
      const left = lines.filter((l) => l.boxes.some((x) => x.x1 <= a + 1 && x.x0 >= prevEnd - 1)).length;
      const right = lines.filter((l) => l.boxes.some((x) => x.x0 >= b - 1)).length;
      if (left < needSide || right < needSide) continue;
      gutters.push({ a, b });
    }
  }
  return gutters;
}

/** The page's text as lines, in reading order. */
export function layoutPage(items: readonly LayoutItem[]): string[] {
  const lines = clusterLines(toBoxes(items));
  const gutters = findGutters(lines);

  if (gutters.length === 0) {
    return lines.map((l) => joinBoxes(l.boxes)).filter(Boolean);
  }

  const colOf = (b: Box) => {
    const mid = (b.x0 + b.x1) / 2;
    let c = 0;
    for (const g of gutters) if (mid >= (g.a + g.b) / 2) c++;
    return c;
  };
  const crosses = (b: Box) => gutters.some((g) => b.x0 < g.b - 1 && b.x1 > g.a + 1);

  const out: string[] = [];
  let columns: string[][] = gutters.map(() => []).concat([[]]);
  const flush = () => {
    for (const col of columns) out.push(...col);
    columns = gutters.map(() => []).concat([[]]);
  };

  for (const line of lines) {
    if (line.boxes.some(crosses)) {
      // full-width line: everything above it is read first
      flush();
      const t = joinBoxes(line.boxes);
      if (t) out.push(t);
      continue;
    }
    const byCol = new Map<number, Box[]>();
    for (const b of line.boxes) {
      const c = colOf(b);
      byCol.set(c, [...(byCol.get(c) ?? []), b]);
    }
    byCol.forEach((boxes, c) => {
      const t = joinBoxes(boxes);
      if (t) columns[c].push(t);
    });
  }
  flush();
  return out;
}

// ---------------------------------------------------------------------------
// Multi-page: running headers, footers and page numbers
// ---------------------------------------------------------------------------

const PAGE_NUMBER_RE = /^(?:page\s*)?\d{1,3}(?:\s*(?:of|\/)\s*\d{1,3})?$/i;
const URL_OR_LEGAL_RE = /https?:|www\.|\.(?:com|net|org)\b|©|copyright|all rights reserved/i;

// Digits are folded only in lines that look like page counters ("Page 2 of 3",
// "2/3"), so those match across pages — but "1 cup sugar" and "2 cup sugar"
// are never mistaken for the same running footer.
function furnitureKey(line: string): string {
  const t = line.toLowerCase().replace(/\s+/g, " ").trim();
  return /\bpage\b|\b\d+\s*(?:of|\/)\s*\d+\b/.test(t) ? t.replace(/\d+/g, "#") : t;
}

/** Removes what repeats on every page and isn't recipe: a site's address or a
 * "Page 2 of 3" in the header or footer. Only the first and last two lines of
 * a page are considered, so a real line deep in a recipe is never dropped.
 * A line repeated as a running header that is the recipe's own title keeps
 * its first copy, because that's the name. */
export function stripPageFurniture(pages: readonly (readonly string[])[]): string[][] {
  const edge = (lines: readonly string[]) => new Set([0, 1, lines.length - 2, lines.length - 1].filter((i) => i >= 0 && i < lines.length));

  // which page edges each (normalized) line appears on
  const seenOn = new Map<string, Set<number>>();
  pages.forEach((lines, p) => {
    edge(lines).forEach((i) => {
      const key = furnitureKey(lines[i]);
      if (!seenOn.has(key)) seenOn.set(key, new Set());
      seenOn.get(key)!.add(p);
    });
  });

  return pages.map((lines, p) => {
    const edges = edge(lines);
    return lines.filter((line, i) => {
      if (!edges.has(i)) return true;
      if (PAGE_NUMBER_RE.test(line.trim())) return false;
      const repeated = (seenOn.get(furnitureKey(line))?.size ?? 0) >= 2;
      if (!repeated) return true;
      // the title shown again as a running header: keep it once, at the top
      const isTitle = p === 0 && i <= 1 && !URL_OR_LEGAL_RE.test(line) && !/\bpage\b/i.test(line);
      return isTitle;
    });
  });
}
