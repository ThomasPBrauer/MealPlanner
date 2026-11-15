"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import PhotoCropper from "./PhotoCropper";

/** Most pages one recipe can be shot as — OCR is slow, and this is plenty. */
export const MAX_CAMERA_PAGES = 12;

interface Shot {
  id: number;
  file: File;
  url: string;
}

/** Collects photos of a recipe — one per page of a book or card — for the
 * import to read together. Uses the live camera where the browser allows it
 * (rear camera preferred), and falls back to the phone's own camera app or
 * the photo library. Nothing is uploaded; the pages are read on the device. */
export default function CameraImport({
  disabled,
  onRead,
}: {
  disabled: boolean;
  onRead: (files: File[]) => void;
}) {
  const [shots, setShots] = useState<Shot[]>([]);
  const [live, setLive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cropping, setCropping] = useState<number | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const nextId = useRef(1);
  const shotsRef = useRef<Shot[]>([]);
  shotsRef.current = shots;
  const hasLiveCamera = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
  const full = shots.length >= MAX_CAMERA_PAGES;

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setLive(false);
  }, []);

  // let go of the camera and the preview URLs when leaving
  useEffect(
    () => () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      shotsRef.current.forEach((s) => URL.revokeObjectURL(s.url));
    },
    []
  );

  async function startCamera() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 2560 }, height: { ideal: 1920 } },
        audio: false,
      });
      streamRef.current = stream;
      setLive(true);
      // the <video> mounts on the next render
      requestAnimationFrame(() => {
        const v = videoRef.current;
        if (v) {
          v.srcObject = stream;
          void v.play().catch(() => {});
        }
      });
    } catch (err) {
      const name = (err as { name?: string })?.name;
      setError(
        name === "NotAllowedError" || name === "SecurityError"
          ? "Camera access was blocked. Allow it in your browser's site settings, or use \"Camera app\" below."
          : "Couldn't start the camera. Use \"Camera app\" or \"Add photos\" below instead."
      );
    }
  }

  function addFiles(files: File[]) {
    const room = MAX_CAMERA_PAGES - shotsRef.current.length;
    const added = files
      .filter((f) => f.type.startsWith("image/"))
      .slice(0, Math.max(0, room))
      .map((file) => ({ id: nextId.current++, file, url: URL.createObjectURL(file) }));
    if (added.length < files.length) setError(`A recipe can have up to ${MAX_CAMERA_PAGES} pages.`);
    if (added.length) setShots((prev) => [...prev, ...added]);
  }

  function capture() {
    const v = videoRef.current;
    if (!v || !v.videoWidth || full) return;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext("2d")?.drawImage(v, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        setError(null);
        addFiles([new File([blob], `page-${nextId.current}.jpg`, { type: "image/jpeg" })]);
      },
      "image/jpeg",
      0.92
    );
  }

  function remove(id: number) {
    setShots((prev) => {
      const gone = prev.find((s) => s.id === id);
      if (gone) URL.revokeObjectURL(gone.url);
      return prev.filter((s) => s.id !== id);
    });
  }

  // swap in the cropped / rotated photo for the original
  function replaceShot(id: number, file: File) {
    setShots((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;
        URL.revokeObjectURL(s.url);
        return { ...s, file, url: URL.createObjectURL(file) };
      })
    );
    setCropping(null);
  }

  function move(id: number, by: -1 | 1) {
    setShots((prev) => {
      const i = prev.findIndex((s) => s.id === id);
      const j = i + by;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const copy = [...prev];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
  }

  function read() {
    stopCamera();
    onRead(shots.map((s) => s.file));
  }

  const smallBtn =
    "rounded-md border border-white/15 px-2.5 py-1.5 text-[11.5px] text-sage/90 transition-colors hover:border-gold/60 hover:text-gold disabled:opacity-50";

  return (
    <div className="space-y-2">
      {live && (
        <div className="overflow-hidden rounded-md border border-gold/40 bg-black">
          <video ref={videoRef} playsInline muted autoPlay className="max-h-[55vh] w-full object-contain" />
          <div className="flex items-center justify-between gap-2 bg-board-panel px-3 py-2">
            <button type="button" onClick={stopCamera} className={smallBtn}>
              Close camera
            </button>
            <button
              type="button"
              onClick={capture}
              disabled={full || disabled}
              className="rounded-full bg-gold px-5 py-2 text-[12.5px] font-semibold text-ink disabled:opacity-50"
            >
              {shots.length === 0 ? "Take photo" : `Take page ${shots.length + 1}`}
            </button>
          </div>
        </div>
      )}

      {!live && (
        <div className="flex flex-wrap gap-2">
          {hasLiveCamera && (
            <button
              type="button"
              onClick={startCamera}
              disabled={disabled || full}
              className="rounded-md bg-gold px-3 py-2 text-[12px] font-semibold text-ink disabled:opacity-50"
            >
              {shots.length === 0 ? "Open camera" : "Add another page"}
            </button>
          )}
          <label className={`${smallBtn} cursor-pointer ${disabled || full ? "pointer-events-none opacity-50" : ""}`}>
            Camera app
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                addFiles(Array.from(e.target.files ?? []));
                e.target.value = "";
              }}
            />
          </label>
          <label className={`${smallBtn} cursor-pointer ${disabled || full ? "pointer-events-none opacity-50" : ""}`}>
            Add photos
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              className="hidden"
              onChange={(e) => {
                addFiles(Array.from(e.target.files ?? []));
                e.target.value = "";
              }}
            />
          </label>
        </div>
      )}

      {shots.length > 0 && (
        <div>
          <p className="mb-1.5 text-[11px] text-sage/70">
            {shots.length} {shots.length === 1 ? "page" : "pages"} — in reading order. Tap a page to crop or rotate it.
          </p>
          <ol className="flex gap-2 overflow-x-auto pb-1">
            {shots.map((s, i) => (
              <li key={s.id} className="relative shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <button type="button" onClick={() => setCropping(s.id)} aria-label={`Crop page ${i + 1}`} className="block">
                  <img src={s.url} alt={`Page ${i + 1}`} className="h-24 w-[4.5rem] rounded border border-white/15 object-cover" />
                </button>
                <span className="absolute left-1 top-1 rounded bg-black/70 px-1 text-[10px] text-chalk">{i + 1}</span>
                <button
                  type="button"
                  onClick={() => remove(s.id)}
                  aria-label={`Remove page ${i + 1}`}
                  className="absolute right-1 top-1 rounded bg-black/70 px-1 text-[11px] leading-4 text-tomato"
                >
                  ×
                </button>
                <div className="mt-1 flex justify-between text-[11px] text-sage/70">
                  <button type="button" onClick={() => move(s.id, -1)} disabled={i === 0} aria-label="Move earlier" className="px-1 disabled:opacity-30">
                    ‹
                  </button>
                  <button type="button" onClick={() => setCropping(s.id)} className="px-1 text-gold/90 hover:text-gold">
                    Crop
                  </button>
                  <button type="button" onClick={() => move(s.id, 1)} disabled={i === shots.length - 1} aria-label="Move later" className="px-1 disabled:opacity-30">
                    ›
                  </button>
                </div>
              </li>
            ))}
          </ol>
          <button
            type="button"
            onClick={read}
            disabled={disabled}
            className="mt-1 rounded-md bg-gold px-3 py-1.5 text-[12px] font-semibold text-ink disabled:opacity-50"
          >
            {disabled ? "Reading…" : `Read ${shots.length} ${shots.length === 1 ? "page" : "pages"}`}
          </button>
        </div>
      )}

      {error && <p className="text-[11.5px] text-tomato">{error}</p>}

      {cropping !== null && shots.some((s) => s.id === cropping) && (
        <PhotoCropper
          file={shots.find((s) => s.id === cropping)!.file}
          onApply={(f) => replaceShot(cropping, f)}
          onCancel={() => setCropping(null)}
        />
      )}
    </div>
  );
}
