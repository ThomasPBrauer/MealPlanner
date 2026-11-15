"use client";

import { useEffect, useRef, useState } from "react";

interface Crop {
  x: number;
  y: number;
  w: number;
  h: number;
}

type Mode = "move" | "n" | "s" | "e" | "w" | "nw" | "ne" | "sw" | "se";

const MIN = 0.06; // smallest crop, as a fraction of the photo
const FULL: Crop = { x: 0.04, y: 0.04, w: 0.92, h: 0.92 };
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function decode(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Couldn't open that photo."));
    img.src = url;
  });
}

function toFile(canvas: HTMLCanvasElement, name: string): Promise<File> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(new File([blob], name, { type: "image/jpeg" })) : reject(new Error("Couldn't save the crop."))),
      "image/jpeg",
      0.92
    )
  );
}

/** Full-screen crop (and rotate) for one photo. Drag the frame to move it,
 * drag its corners or edges to resize. "Use crop" hands back a new file at the
 * photo's full resolution — only the area inside the frame. Works with touch
 * and mouse. */
export default function PhotoCropper({
  file,
  onApply,
  onCancel,
}: {
  file: File;
  onApply: (file: File) => void;
  onCancel: () => void;
}) {
  const [current, setCurrent] = useState<File>(file);
  const [url, setUrl] = useState<string>("");
  const [crop, setCrop] = useState<Crop>(FULL);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ mode: Mode; x: number; y: number; start: Crop } | null>(null);

  // this editor owns its preview URL (and makes a new one after a rotation)
  useEffect(() => {
    const u = URL.createObjectURL(current);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [current]);

  function onPointerDown(e: React.PointerEvent) {
    const mode = (e.target as HTMLElement).closest<HTMLElement>("[data-mode]")?.dataset.mode as Mode | undefined;
    if (!mode) return;
    e.preventDefault();
    boxRef.current?.setPointerCapture(e.pointerId);
    drag.current = { mode, x: e.clientX, y: e.clientY, start: crop };
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    const box = boxRef.current;
    if (!d || !box) return;
    const r = box.getBoundingClientRect();
    const dx = (e.clientX - d.x) / r.width;
    const dy = (e.clientY - d.y) / r.height;
    let { x, y } = d.start;
    let x2 = d.start.x + d.start.w;
    let y2 = d.start.y + d.start.h;
    if (d.mode === "move") {
      x = clamp(x + dx, 0, 1 - d.start.w);
      y = clamp(y + dy, 0, 1 - d.start.h);
      x2 = x + d.start.w;
      y2 = y + d.start.h;
    } else {
      if (d.mode.includes("w")) x = clamp(x + dx, 0, x2 - MIN);
      if (d.mode.includes("e")) x2 = clamp(x2 + dx, x + MIN, 1);
      if (d.mode.includes("n")) y = clamp(y + dy, 0, y2 - MIN);
      if (d.mode.includes("s")) y2 = clamp(y2 + dy, y + MIN, 1);
    }
    setCrop({ x, y, w: x2 - x, h: y2 - y });
  }

  function onPointerUp() {
    drag.current = null;
  }

  async function rotate() {
    setBusy(true);
    setError(null);
    try {
      const img = await decode(url);
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalHeight;
      canvas.height = img.naturalWidth;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Your browser can't rotate photos.");
      ctx.translate(canvas.width, 0);
      ctx.rotate(Math.PI / 2);
      ctx.drawImage(img, 0, 0);
      setCurrent(await toFile(canvas, file.name));
      setCrop(FULL);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    setBusy(true);
    setError(null);
    try {
      const img = await decode(url);
      const sx = Math.round(crop.x * img.naturalWidth);
      const sy = Math.round(crop.y * img.naturalHeight);
      const sw = Math.max(1, Math.round(crop.w * img.naturalWidth));
      const sh = Math.max(1, Math.round(crop.h * img.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = sw;
      canvas.height = sh;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Your browser can't crop photos.");
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
      onApply(await toFile(canvas, file.name));
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  const pct = (v: number) => `${v * 100}%`;
  const handle = "absolute h-7 w-7 -translate-x-1/2 -translate-y-1/2 touch-none";
  const dot = "pointer-events-none absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-sm border border-ink bg-gold";

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/90" role="dialog" aria-modal="true" aria-label="Crop photo">
      <div className="flex flex-1 items-center justify-center overflow-hidden p-3">
        {url && (
          <div
            ref={boxRef}
            className="relative inline-block touch-none select-none"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="" draggable={false} className="block max-h-[calc(100vh-9rem)] max-w-full select-none" />
            {/* the frame; its huge shadow dims everything outside it */}
            <div
              data-mode="move"
              className="absolute cursor-move border-2 border-gold"
              style={{
                left: pct(crop.x),
                top: pct(crop.y),
                width: pct(crop.w),
                height: pct(crop.h),
                boxShadow: "0 0 0 9999px rgba(0,0,0,0.6)",
              }}
            />
            {(
              [
                ["nw", crop.x, crop.y, "cursor-nwse-resize"],
                ["ne", crop.x + crop.w, crop.y, "cursor-nesw-resize"],
                ["sw", crop.x, crop.y + crop.h, "cursor-nesw-resize"],
                ["se", crop.x + crop.w, crop.y + crop.h, "cursor-nwse-resize"],
                ["n", crop.x + crop.w / 2, crop.y, "cursor-ns-resize"],
                ["s", crop.x + crop.w / 2, crop.y + crop.h, "cursor-ns-resize"],
                ["w", crop.x, crop.y + crop.h / 2, "cursor-ew-resize"],
                ["e", crop.x + crop.w, crop.y + crop.h / 2, "cursor-ew-resize"],
              ] as const
            ).map(([mode, x, y, cursor]) => (
              <div key={mode} data-mode={mode} className={`${handle} ${cursor}`} style={{ left: pct(x), top: pct(y) }}>
                <span className={dot} />
              </div>
            ))}
          </div>
        )}
      </div>

      {error && <p className="px-4 pb-1 text-center text-[12px] text-tomato">{error}</p>}
      <div className="flex flex-wrap items-center justify-center gap-2 bg-board-panel px-3 py-3">
        <button type="button" onClick={onCancel} disabled={busy} className="rounded-md border border-white/15 px-3 py-2 text-[12px] text-sage/90 disabled:opacity-50">
          Cancel
        </button>
        <button type="button" onClick={rotate} disabled={busy} className="rounded-md border border-white/15 px-3 py-2 text-[12px] text-sage/90 disabled:opacity-50">
          Rotate ↻
        </button>
        <button type="button" onClick={() => setCrop(FULL)} disabled={busy} className="rounded-md border border-white/15 px-3 py-2 text-[12px] text-sage/90 disabled:opacity-50">
          Reset
        </button>
        <button type="button" onClick={apply} disabled={busy} className="rounded-md bg-gold px-4 py-2 text-[12px] font-semibold text-ink disabled:opacity-50">
          {busy ? "Working…" : "Use crop"}
        </button>
      </div>
    </div>
  );
}
