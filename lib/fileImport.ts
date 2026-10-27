// Reading a recipe out of a dropped file — Word, PDF, or an image — entirely
// in the browser. The text it returns goes to the same /api/meals/import
// parser as pasted text, so the units, fractions and sections are handled
// identically no matter where the text came from.
//
// Doing this client-side (rather than uploading the file) matters because
// Vercel's serverless functions reject request bodies over ~4.5 MB, which a
// multi-page PDF or a phone photo easily exceeds, and because OCR is heavy
// work that's better on the person's own device than a function with a
// short time limit. The three libraries are loaded on demand, so none of
// them cost anything until someone actually drops a file.
//
//   Word (.docx)         mammoth reads the text straight out of the file
//   PDF with text        pdf.js reads it; lines are rebuilt from item positions
//   scanned PDF / image  tesseract.js OCR (first use downloads ~10 MB of
//                        engine + English data, then it's cached)

export type ImportFileKind = "docx" | "pdf" | "image";

export const MAX_FILE_BYTES = 25 * 1024 * 1024;
/** OCR is slow (several seconds a page), so a scanned PDF is read only up to
 * this many pages — plenty for a recipe, and it stops a whole cookbook from
 * tying up the browser. */
export const MAX_OCR_PAGES = 6;
/** A PDF with fewer characters per page than this is treated as a scan. */
const MIN_CHARS_PER_PAGE = 40;

export type FileImportMethod = "docx" | "pdf-text" | "ocr";

export interface FileImportResult {
  text: string;
  method: FileImportMethod;
  /** set when only part of a long scanned PDF was read */
  note?: string;
}

export class FileImportError extends Error {}

const IMAGE_EXT = /\.(png|jpe?g|webp|gif|bmp)$/i;

export function detectFileKind(name: string, mime: string): ImportFileKind | null {
  const lower = name.toLowerCase();
  if (lower.endsWith(".docx") || mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    return "docx";
  }
  if (lower.endsWith(".pdf") || mime === "application/pdf") return "pdf";
  // HEIC/HEIF (iPhone originals) can't be decoded by most browsers, so
  // they're left out; phones convert to JPEG when a photo is shared
  if (IMAGE_EXT.test(lower) || /^image\/(png|jpeg|webp|gif|bmp)$/.test(mime)) return "image";
  return null;
}

/** Why a file isn't supported, in words for the person dropping it. */
export function unsupportedMessage(name: string): string {
  if (/\.doc$/i.test(name)) {
    return "Old .doc files can't be read. Open it in Word and choose Save As → .docx, then try again.";
  }
  if (/\.(heic|heif)$/i.test(name)) {
    return "HEIC photos can't be read by the browser. Share or export the photo as JPEG or PNG and try again.";
  }
  return "That file type isn't supported. Drop a Word (.docx) file, a PDF, or an image (PNG, JPG, WebP).";
}

// ---------------------------------------------------------------------------
// PDF text → lines
// ---------------------------------------------------------------------------

/** The bits of a pdf.js text item this needs. */
export interface PdfTextItem {
  str: string;
  /** [a, b, c, d, x, y] — x and y are the item's position on the page */
  transform: number[];
  width?: number;
  hasEOL?: boolean;
}

/** Rebuilds readable lines from pdf.js text items. pdf.js hands back
 * fragments, not lines: a new line starts when the vertical position moves
 * (or the item says it ends a line), and items on one line are joined with a
 * space only where there's a visible gap — so "1/2 cup" stays one line but
 * "chop" and "ped" don't become "chop ped". Items are kept in the PDF's own
 * order rather than sorted, which keeps multi-column layouts column by
 * column instead of interleaving them. */
export function itemsToLines(items: readonly PdfTextItem[]): string[] {
  const lines: string[] = [];
  let current = "";
  let lastY: number | null = null;
  let lastEnd: number | null = null;
  let lastHeight = 0;

  const flush = () => {
    const t = current.replace(/\s+/g, " ").trim();
    if (t) lines.push(t);
    current = "";
    lastEnd = null;
  };

  for (const item of items) {
    if (typeof item.str !== "string") continue;
    const x = item.transform[4];
    const y = item.transform[5];
    const height = Math.abs(item.transform[3]) || Math.abs(item.transform[0]) || 10;

    const newLine = lastY !== null && Math.abs(y - lastY) > Math.max(2, Math.min(height, lastHeight || height) * 0.5);
    if (newLine) flush();

    if (current && lastEnd !== null && !newLine) {
      const gap = x - lastEnd;
      const needsSpace = gap > height * 0.15 && !/\s$/.test(current) && !/^\s/.test(item.str);
      if (needsSpace) current += " ";
    }
    current += item.str;

    lastY = y;
    lastHeight = height;
    lastEnd = x + (item.width ?? item.str.length * height * 0.5);
    if (item.hasEOL) flush();
  }
  flush();
  return lines;
}

/** True when a PDF's extracted text is too thin to be real — i.e. it's a
 * scan or a photo saved as PDF and needs OCR. */
export function looksScanned(text: string, pages: number): boolean {
  return text.replace(/\s+/g, "").length < Math.max(1, pages) * MIN_CHARS_PER_PAGE;
}

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

type Progress = (message: string) => void;

export async function extractTextFromFile(file: File, onProgress: Progress = () => {}): Promise<FileImportResult> {
  const kind = detectFileKind(file.name, file.type);
  if (!kind) throw new FileImportError(unsupportedMessage(file.name));
  if (file.size > MAX_FILE_BYTES) {
    throw new FileImportError(`That file is too large (limit ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB).`);
  }
  if (file.size === 0) throw new FileImportError("That file is empty.");

  if (kind === "docx") return extractDocx(file, onProgress);
  if (kind === "pdf") return extractPdf(file, onProgress);
  return extractImage(file, onProgress);
}

async function extractDocx(file: File, onProgress: Progress): Promise<FileImportResult> {
  onProgress("Reading the Word document…");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mod: any = await import("mammoth/mammoth.browser");
  const mammoth = mod.default ?? mod;
  let value: string;
  try {
    ({ value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() }));
  } catch {
    throw new FileImportError("Couldn't read that Word file. Is it a valid .docx document?");
  }
  if (!value || !value.trim()) throw new FileImportError("That Word document has no text in it.");
  return { text: value, method: "docx" };
}

async function loadPdfJs() {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.js", import.meta.url).toString();
  return pdfjs;
}

async function extractPdf(file: File, onProgress: Progress): Promise<FileImportResult> {
  onProgress("Reading the PDF…");
  const pdfjs = await loadPdfJs();
  let pdf;
  try {
    pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  } catch (err) {
    const name = (err as { name?: string })?.name;
    if (name === "PasswordException") throw new FileImportError("That PDF is password-protected.");
    throw new FileImportError("Couldn't read that PDF. It may be damaged.");
  }

  const pageLines: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    pageLines.push(...itemsToLines(content.items as unknown as PdfTextItem[]));
  }
  const text = pageLines.join("\n");

  if (!looksScanned(text, pdf.numPages)) return { text, method: "pdf-text" };

  // no real text layer: render the pages and read them with OCR
  const pagesToRead = Math.min(pdf.numPages, MAX_OCR_PAGES);
  const canvases: HTMLCanvasElement[] = [];
  for (let i = 1; i <= pagesToRead; i++) {
    onProgress(`This PDF is a scan — preparing page ${i} of ${pagesToRead}…`);
    const page = await pdf.getPage(i);
    const base = page.getViewport({ scale: 1 });
    // aim for ~2600px on the long side: sharp enough for OCR, not huge
    const scale = Math.min(4, 2600 / Math.max(base.width, base.height));
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new FileImportError("Your browser can't render this PDF for reading.");
    await page.render({ canvasContext: ctx, viewport }).promise;
    canvases.push(canvas);
  }
  const ocr = await runOcr(canvases, onProgress);
  const note =
    pdf.numPages > pagesToRead
      ? `Only the first ${pagesToRead} of ${pdf.numPages} pages were read.`
      : undefined;
  return { text: ocr, method: "ocr", note };
}

const OCR_UNIT = "(?:cups?|tbsps?|tsps?|tablespoons?|teaspoons?|ounces?|oz|pounds?|lbs?|pinch|cloves?|cans?|grams?|ml)";

/** Fixes the handful of misreads OCR makes over and over on recipes — the
 * ones that would otherwise break the amount/unit split or the step list.
 * Deliberately narrow: each rule only fires in a spot where the wrong reading
 * is all but certain (a stray "%" between a digit and a unit, a lone "l"
 * where a quantity belongs), so correct text is never changed. */
export function repairOcrText(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => {
      let l = line.trim();
      // step number read with a comma/semicolon: "2, Mix" → "2. Mix"
      l = l.replace(/^(\d{1,2})[,;]\s+(?=\S)/, "$1. ");
      // ½ read as ¥ or Y: "¥ cup flour"
      l = l.replace(new RegExp(`^[¥Y]\\s+(?=${OCR_UNIT}\\b)`), "½ ");
      // a mixed number's ½ read as %: "1% teaspoons" → "1½ teaspoons"
      l = l.replace(new RegExp(`(\\d)\\s*[%¥]\\s+(?=${OCR_UNIT}\\b)`, "g"), "$1½ ");
      // "1" read as l, I or |: "l cup milk"
      l = l.replace(new RegExp(`^[lI|]\\s+(?=${OCR_UNIT}\\b)`), "1 ");
      return l;
    })
    .join("\n");
}

const OCR_TARGET_LONG_SIDE = 2400;

async function extractImage(file: File, onProgress: Progress): Promise<FileImportResult> {
  onProgress("Preparing the image…");
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new FileImportError("Couldn't open that image."));
      el.src = url;
    });
    const long = Math.max(img.naturalWidth, img.naturalHeight);
    // shrink huge phone photos; enlarge small screenshots a little (OCR
    // does better with text that's at least ~25px tall)
    const scale = long > OCR_TARGET_LONG_SIDE ? OCR_TARGET_LONG_SIDE / long : long < 1400 ? Math.min(2, 1800 / long) : 1;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new FileImportError("Your browser can't process images here.");
    ctx.fillStyle = "#ffffff"; // transparent PNGs would otherwise read as black
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return { text: await runOcr([canvas], onProgress), method: "ocr" };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function runOcr(canvases: HTMLCanvasElement[], onProgress: Progress): Promise<string> {
  onProgress("Loading the text reader (first time only — about 10 MB)…");
  const { createWorker } = await import("tesseract.js");
  let pageNo = 1;
  const worker = await createWorker("eng", 1, {
    logger: (m: { status: string; progress: number }) => {
      if (m.status === "recognizing text") {
        const pct = Math.round(m.progress * 100);
        onProgress(
          canvases.length > 1
            ? `Reading page ${pageNo} of ${canvases.length}… ${pct}%`
            : `Reading the text… ${pct}%`
        );
      }
    },
  });
  try {
    const parts: string[] = [];
    for (const canvas of canvases) {
      const { data } = await worker.recognize(canvas);
      parts.push(data.text);
      pageNo++;
    }
    const text = repairOcrText(parts.join("\n"));
    if (!text.replace(/\s+/g, "")) {
      throw new FileImportError("Couldn't find any text in that file. Try a clearer or higher-resolution copy.");
    }
    return text;
  } finally {
    await worker.terminate();
  }
}
