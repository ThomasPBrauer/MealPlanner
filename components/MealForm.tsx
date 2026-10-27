"use client";

import { useEffect, useRef, useState } from "react";
import {
  CARB_OPTIONS,
  Ingredient,
  Meal,
  MealVisibility,
  NUTRITION_FIELDS,
  NutritionInfo,
  PROTEIN_OPTIONS,
} from "@/lib/types";
import { DEPARTMENT_SUGGESTIONS, TAG_SUGGESTIONS, colorForTag } from "@/lib/data";
import { FileImportError, extractTextFromFile } from "@/lib/fileImport";

export interface MealFormValues {
  name: string;
  tags: string[];
  photo: string | null;
  primaryProtein: string;
  primaryCarb: string;
  minutes: number;
  servings: number;
  visibility: MealVisibility;
  source: string;
  notes: string;
  nutrition: NutritionInfo;
  ingredients: Ingredient[];
  instructions: string[];
  components: string[];
}

function makeId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const MAX_PHOTO_DIMENSION = 640;
const PHOTO_JPEG_QUALITY = 0.82;

/** Reads an image file and downsizes it to a JPEG data URL client-side —
 * keeps the request payload and stored row small without needing a
 * server-side image pipeline or separate file storage. */
function readAndResizePhoto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Could not decode that image."));
      img.onload = () => {
        let { width, height } = img;
        if (width > MAX_PHOTO_DIMENSION || height > MAX_PHOTO_DIMENSION) {
          if (width >= height) {
            height = Math.round((height * MAX_PHOTO_DIMENSION) / width);
            width = MAX_PHOTO_DIMENSION;
          } else {
            width = Math.round((width * MAX_PHOTO_DIMENSION) / height);
            height = MAX_PHOTO_DIMENSION;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Your browser can't process images here."));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", PHOTO_JPEG_QUALITY));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

const inputClass =
  "w-full rounded-md border border-white/10 bg-board-panel px-3 py-2 text-[13px] text-chalk outline-none focus:border-gold/60";

export default function MealForm({
  initial,
  onSubmit,
  submitting,
  error,
  submitLabel,
}: {
  initial?: Meal;
  onSubmit: (values: MealFormValues) => void;
  submitting: boolean;
  error?: string | null;
  submitLabel: string;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [tags, setTags] = useState<string[]>(initial?.tags?.length ? initial.tags : []);
  const [tagDraft, setTagDraft] = useState("");
  const [photo, setPhoto] = useState<string | null>(initial?.photo ?? null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [isDraggingPhoto, setIsDraggingPhoto] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [primaryProtein, setPrimaryProtein] = useState(initial?.primaryProtein ?? "None");
  const [primaryCarb, setPrimaryCarb] = useState(initial?.primaryCarb ?? "None");
  const [minutes, setMinutes] = useState(String(initial?.minutes ?? ""));
  const [servings, setServings] = useState(String(initial?.servings ?? 4));
  const [visibility, setVisibility] = useState<MealVisibility>(initial?.visibility ?? "personal");
  const [source, setSource] = useState(initial?.source ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [nutrition, setNutrition] = useState<NutritionInfo>(initial?.nutrition ?? {});
  const [ingredients, setIngredients] = useState<Ingredient[]>(
    initial?.ingredients?.length
      ? initial.ingredients.map((ing) => ({ ...ing, department: ing.department ?? "" }))
      : [{ id: "ing-0", name: "", amount: "", unit: "", department: "" }]
  );
  const [instructionsText, setInstructionsText] = useState(
    initial?.instructions?.join("\n") ?? ""
  );
  const [components, setComponents] = useState<string[]>(initial?.components ?? []);
  const [availableMeals, setAvailableMeals] = useState<Meal[]>([]);
  const [componentToAdd, setComponentToAdd] = useState("");

  const [importMode, setImportMode] = useState<"url" | "text" | "file">("url");
  const [importProgress, setImportProgress] = useState<string | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const importFileRef = useRef<HTMLInputElement>(null);
  const [importUrl, setImportUrl] = useState("");
  const [importText, setImportText] = useState("");
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importedName, setImportedName] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/meals")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setAvailableMeals(data.meals ?? []);
      });
  }, []);

  const componentChoices = availableMeals.filter(
    (m) => m.id !== initial?.id && !components.includes(m.id)
  );

  async function handlePhotoFile(file: File | null | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setPhotoError("Please choose an image file.");
      return;
    }
    setPhotoError(null);
    try {
      const dataUrl = await readAndResizePhoto(file);
      setPhoto(dataUrl);
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : "Couldn't read that image.");
    }
  }

  function addTag(value: string) {
    const cleaned = value.trim();
    if (!cleaned) return;
    setTags((prev) => (prev.includes(cleaned) ? prev : [...prev, cleaned]));
    setTagDraft("");
  }

  function removeTag(value: string) {
    setTags((prev) => prev.filter((t) => t !== value));
  }

  function handleTagDraftKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(tagDraft);
    } else if (e.key === "Backspace" && !tagDraft && tags.length > 0) {
      // backspacing on an empty draft pops the last chip, mirroring most tag-input UIs
      removeTag(tags[tags.length - 1]);
    }
  }

  function addComponent(id: string) {
    if (!id) return;
    setComponents((prev) => [...prev, id]);
    setComponentToAdd("");
  }

  function removeComponent(id: string) {
    setComponents((prev) => prev.filter((c) => c !== id));
  }

  function moveComponent(index: number, direction: -1 | 1) {
    setComponents((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  const amountRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(null);

  useEffect(() => {
    if (pendingFocusId && amountRefs.current[pendingFocusId]) {
      amountRefs.current[pendingFocusId]?.focus();
      setPendingFocusId(null);
    }
  }, [pendingFocusId, ingredients]);

  function updateIngredient(id: string, field: keyof Ingredient, value: string) {
    setIngredients((prev) =>
      prev.map((ing) => (ing.id === id ? { ...ing, [field]: value } : ing))
    );
  }

  function addIngredient() {
    const id = makeId("ing");
    setIngredients((prev) => [...prev, { id, name: "", amount: "", unit: "", department: "" }]);
    setPendingFocusId(id); // jump focus to the new row's amount field once it renders
  }

  function removeIngredient(id: string) {
    setIngredients((prev) => (prev.length > 1 ? prev.filter((ing) => ing.id !== id) : prev));
  }

  function handleIngredientKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault(); // stop it from submitting the whole form
      addIngredient();
    }
  }

  async function runImport(payload: { url?: string; text?: string }, sourceLabel?: string) {
    setImporting(true);
    setImportError(null);
    setImportedName(null);
    try {
      const res = await fetch("/api/meals/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setImportError(data.error || "Couldn't import that recipe.");
        return;
      }

      // fill-only-if-empty everywhere, so importing into an existing meal
      // (e.g. a placeholder created just to fill a calendar slot) can't
      // clobber anything already entered — and for a brand-new meal this
      // behaves the same as always-overwrite, since everything starts empty
      if (data.name && !name.trim()) setName(data.name);
      if (typeof data.minutes === "number" && (!minutes.trim() || minutes === "0")) {
        setMinutes(String(data.minutes));
      }
      if (typeof data.servings === "number" && (!servings.trim() || servings === "4")) {
        setServings(String(data.servings));
      }
      // pasted/extracted text has no address of its own — name the file instead
      const importedSource = sourceLabel && data.source === "Pasted text" ? sourceLabel : data.source;
      if (importedSource && !source.trim()) setSource(importedSource);
      if (data.nutrition) {
        setNutrition((prev) => {
          const next = { ...prev };
          for (const key of Object.keys(data.nutrition) as (keyof NutritionInfo)[]) {
            if (next[key] === undefined && data.nutrition[key] !== undefined) {
              next[key] = data.nutrition[key];
            }
          }
          return next;
        });
      }
      const ingredientsEmpty = ingredients.every((ing) => !ing.name.trim());
      if (Array.isArray(data.ingredients) && data.ingredients.length > 0 && ingredientsEmpty) {
        setIngredients(
          data.ingredients.map((ing: Partial<Ingredient>) => ({
            id: makeId("ing-import"),
            name: ing.name ?? "",
            amount: ing.amount ?? "",
            unit: ing.unit ?? "",
            department: "",
          }))
        );
      }
      if (Array.isArray(data.instructions) && data.instructions.length > 0 && !instructionsText.trim()) {
        setInstructionsText(data.instructions.join("\n"));
      }
      setImportedName(data.name || "that page");
    } catch {
      setImportError("Couldn't reach the import service. Please try again.");
    } finally {
      setImporting(false);
    }
  }

  async function handleImport() {
    const pasted = importText.trim();
    const urlValue = importUrl.trim();
    if (importMode === "url" && !urlValue) return;
    if (importMode === "text" && !pasted) return;
    await runImport(importMode === "text" ? { text: pasted } : { url: urlValue });
  }

  // a dropped or chosen Word / PDF / image file: read its text here in the
  // browser (see lib/fileImport.ts), then import it like pasted text
  async function handleFile(file: File) {
    setImportMode("file");
    setImporting(true);
    setImportError(null);
    setImportedName(null);
    let text: string;
    let note: string | undefined;
    try {
      const result = await extractTextFromFile(file, setImportProgress);
      text = result.text;
      note = result.note;
    } catch (err) {
      setImportError(
        err instanceof FileImportError ? err.message : "Couldn't read that file. Try a different one, or paste its text instead."
      );
      setImporting(false);
      setImportProgress(null);
      return;
    }
    setImportProgress("Pulling out the recipe…");
    await runImport({ text }, `File: ${file.name}`);
    setImportProgress(null);
    if (note) setImportError(note);
  }

  function handleFileDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDraggingFile(false);
    const file = e.dataTransfer.files?.[0];
    if (file && !importing) handleFile(file);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // if the person typed a tag but never pressed Enter/comma, don't lose it silently
    const finalTags = tagDraft.trim() && !tags.includes(tagDraft.trim())
      ? [...tags, tagDraft.trim()]
      : tags;
    onSubmit({
      name: name.trim(),
      tags: finalTags.length > 0 ? finalTags : ["Other"],
      photo,
      primaryProtein,
      primaryCarb,
      minutes: Math.max(0, Math.round(Number(minutes) || 0)),
      servings: Math.max(1, Math.round(Number(servings) || 4)),
      visibility,
      source: source.trim(),
      notes: notes.trim(),
      nutrition,
      ingredients: ingredients
        .map((ing) => ({
          ...ing,
          name: ing.name.trim(),
          amount: ing.amount.trim(),
          unit: ing.unit.trim(),
          department: ing.department.trim(),
        }))
        .filter((ing) => ing.name.length > 0),
      instructions: instructionsText
        .split("\n")
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
      components,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-7">
      <div
        className={`rounded-md border p-3 transition-colors ${
          isDraggingFile ? "border-gold bg-gold/15" : "border-gold/30 bg-gold/5"
        }`}
        // a file can be dropped anywhere on the import box, whichever tab is open
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes("Files")) {
            e.preventDefault();
            setIsDraggingFile(true);
          }
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setIsDraggingFile(false);
        }}
        onDrop={handleFileDrop}
      >
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[12px] font-semibold text-gold">Import a recipe</p>
          <div className="flex items-center gap-1 rounded-full border border-gold/30 p-0.5 text-[10.5px]">
            {(["url", "text", "file"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => {
                  setImportMode(mode);
                  setImportError(null);
                }}
                className={`rounded-full px-2 py-0.5 transition-colors ${
                  importMode === mode ? "bg-gold text-ink" : "text-sage/80 hover:text-chalk"
                }`}
              >
                {mode === "url" ? "From URL" : mode === "text" ? "Paste text" : "From file"}
              </button>
            ))}
          </div>
        </div>

        {importMode === "url" ? (
          <div className="flex gap-2">
            <input
              type="url"
              value={importUrl}
              onChange={(e) => setImportUrl(e.target.value)}
              placeholder="https://www.example.com/some-recipe"
              className={`${inputClass} min-w-0 flex-1`}
            />
            <button
              type="button"
              onClick={handleImport}
              disabled={importing || !importUrl.trim()}
              className="shrink-0 rounded-md bg-gold px-3 text-[12px] font-semibold text-ink disabled:opacity-50"
            >
              {importing ? "Importing…" : "Import"}
            </button>
          </div>
        ) : importMode === "file" ? (
          <div>
            <button
              type="button"
              onClick={() => importFileRef.current?.click()}
              disabled={importing}
              className="flex w-full flex-col items-center gap-1 rounded-md border border-dashed border-gold/50 px-3 py-5 text-center text-[12px] text-chalk transition-colors hover:border-gold disabled:opacity-60"
            >
              <span className="font-semibold text-gold">
                {importing ? importProgress ?? "Working…" : "Drop a recipe file here, or click to choose"}
              </span>
              {!importing && <span className="text-[10.5px] text-sage/70">Word (.docx), PDF, or a photo / screenshot (PNG, JPG)</span>}
            </button>
            <input
              ref={importFileRef}
              type="file"
              accept=".docx,.pdf,image/png,image/jpeg,image/webp,image/gif,image/bmp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = ""; // so choosing the same file again still fires
                if (file) handleFile(file);
              }}
            />
          </div>
        ) : (
          <div className="space-y-2">
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder={"Paste the recipe page's text here — title, Ingredients, Directions, and Nutrition Facts if it has them."}
              rows={6}
              className={`${inputClass} resize-y`}
            />
            <button
              type="button"
              onClick={handleImport}
              disabled={importing || !importText.trim()}
              className="rounded-md bg-gold px-3 py-1.5 text-[12px] font-semibold text-ink disabled:opacity-50"
            >
              {importing ? "Importing…" : "Import from pasted text"}
            </button>
          </div>
        )}

        {importError && <p className="mt-2 text-[11.5px] text-tomato">{importError}</p>}
        {importedName && !importError && (
          <p className="mt-2 text-[11.5px] text-sage/80">
            Pulled in what we could find from {importedName} — check it over below before saving.
          </p>
        )}
        <p className="mt-2 text-[10.5px] text-sage/60">
          {importMode === "url"
            ? "Works on pages that publish standard recipe markup (most WordPress food blogs and major recipe sites do). If a site blocks automated fetches, switch to \"Paste text\" and copy the page yourself instead."
            : importMode === "file"
            ? "The file is read on your device and never uploaded. Photos and scanned PDFs are read with text recognition, so check numbers and fractions carefully."
            : "Open the recipe in your browser, select all the text on the page (or just the recipe portion), copy, and paste it here."}{" "}
          {initial
            ? "Only fills in fields that are still empty (or at their default) — it won't overwrite anything you've already entered."
            : "Fills in what it can find — review everything before saving."}
        </p>
      </div>

      {error && (
        <p className="rounded-md border border-tomato/40 bg-tomato/10 px-3 py-2 text-[12px] text-tomato">
          {error}
        </p>
      )}

      <fieldset className="space-y-3">
        <legend className="mb-1 text-[12px] font-semibold uppercase tracking-wide text-sage">
          Basics
        </legend>

        <div>
          <label className="mb-1 block text-[11px] text-sage/80">Name</label>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Sheet-Pan Fajitas"
            className={inputClass}
          />
        </div>

        <div>
          <label className="mb-1 block text-[11px] text-sage/80">Photo</label>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDraggingPhoto(true);
            }}
            onDragLeave={() => setIsDraggingPhoto(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDraggingPhoto(false);
              handlePhotoFile(e.dataTransfer.files?.[0]);
            }}
            onClick={() => photoInputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                photoInputRef.current?.click();
              }
            }}
            className={`flex cursor-pointer items-center gap-3 rounded-md border border-dashed px-3 py-3 transition-colors ${
              isDraggingPhoto
                ? "border-gold bg-gold/10"
                : "border-white/15 hover:border-white/30"
            }`}
          >
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photo}
                alt="Recipe preview"
                className="h-16 w-16 shrink-0 rounded-md object-cover"
              />
            ) : (
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md border border-white/10 text-sage/40">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M4 7h3l1.5-2h7L17 7h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Z"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  />
                  <circle cx="12" cy="13" r="3.5" stroke="currentColor" strokeWidth="1.5" />
                </svg>
              </div>
            )}
            <div className="min-w-0 flex-1 text-[11.5px] leading-snug text-sage/70">
              {photo
                ? "Drag a new photo here, or click to replace."
                : "Drag & drop a photo here, or click to choose one."}
            </div>
            {photo && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setPhoto(null);
                }}
                aria-label="Remove photo"
                className="shrink-0 rounded-full p-1 text-sage/60 transition-colors hover:text-tomato"
              >
                ✕
              </button>
            )}
          </div>
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            onChange={(e) => handlePhotoFile(e.target.files?.[0])}
            className="hidden"
          />
          {photoError && (
            <p className="mt-1 text-[10.5px] text-tomato">{photoError}</p>
          )}
        </div>

        <div>
          <label className="mb-1 block text-[11px] text-sage/80">Tags</label>
          {tags.length > 0 && (
            <div className="mb-1.5 flex flex-wrap gap-1.5">
              {tags.map((t) => (
                <span
                  key={t}
                  className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] text-chalk"
                  style={{ borderColor: colorForTag(t) }}
                >
                  <span
                    className="inline-block h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: colorForTag(t) }}
                  />
                  {t}
                  <button
                    type="button"
                    onClick={() => removeTag(t)}
                    aria-label={`Remove ${t} tag`}
                    className="text-chalk/50 hover:text-tomato"
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          )}
          <input
            list="tag-suggestions"
            value={tagDraft}
            onChange={(e) => setTagDraft(e.target.value)}
            onKeyDown={handleTagDraftKeyDown}
            onBlur={() => addTag(tagDraft)}
            placeholder="Family, Quick, Vegetarian…"
            className={inputClass}
          />
          <datalist id="tag-suggestions">
            {TAG_SUGGESTIONS.filter((t) => !tags.includes(t)).map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
          <p className="mt-1 text-[10.5px] text-sage/60">
            Press Enter or comma to add a tag. Leave blank to fall back to “Other”.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-[11px] text-sage/80">Prep time (minutes)</label>
            <input
              type="number"
              min={0}
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              placeholder="30"
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-sage/80">Servings</label>
            <input
              type="number"
              min={1}
              value={servings}
              onChange={(e) => setServings(e.target.value)}
              placeholder="4"
              className={inputClass}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-[11px] text-sage/80">Primary protein</label>
            <input
              list="protein-suggestions"
              value={primaryProtein}
              onChange={(e) => setPrimaryProtein(e.target.value)}
              placeholder="Chicken"
              className={inputClass}
            />
            <datalist id="protein-suggestions">
              {PROTEIN_OPTIONS.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-sage/80">Primary carbohydrate</label>
            <input
              list="carb-suggestions"
              value={primaryCarb}
              onChange={(e) => setPrimaryCarb(e.target.value)}
              placeholder="Rice"
              className={inputClass}
            />
            <datalist id="carb-suggestions">
              {CARB_OPTIONS.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-[11px] text-sage/80">Visibility</label>
          <div className="flex gap-2">
            <label className="flex flex-1 cursor-pointer items-center gap-2 rounded-md border border-white/10 px-3 py-2 text-[13px] text-chalk hover:border-gold/50">
              <input
                type="radio"
                name="visibility"
                checked={visibility === "personal"}
                onChange={() => setVisibility("personal")}
                className="accent-gold"
              />
              Personal — only you can see or plan it
            </label>
            <label className="flex flex-1 cursor-pointer items-center gap-2 rounded-md border border-white/10 px-3 py-2 text-[13px] text-chalk hover:border-gold/50">
              <input
                type="radio"
                name="visibility"
                checked={visibility === "public"}
                onChange={() => setVisibility("public")}
                className="accent-gold"
              />
              Public — anyone can see and plan it
            </label>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-[11px] text-sage/80">
            Source <span className="text-sage/50">(cookbook, URL, who gave it to you…)</span>
          </label>
          <input
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="https://... or a cookbook name"
            className={inputClass}
          />
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-sage">
          Notes <span className="normal-case text-sage/60">(your own comments, optional)</span>
        </legend>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Double the garlic next time. Kids like it less spicy."
          rows={3}
          className={`${inputClass} resize-y leading-relaxed`}
        />
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-sage">
          Built from other recipes{" "}
          <span className="normal-case text-sage/60">(optional — e.g. Meatballs + Marinara + Crust)</span>
        </legend>
        {components.length > 0 && (
          <div className="mb-2 space-y-1.5">
            {components.map((id, i) => {
              const found = availableMeals.find((m) => m.id === id);
              return (
                <div
                  key={id}
                  className="flex items-center justify-between gap-2 rounded-md border border-white/10 px-3 py-2 text-[13px] text-chalk"
                >
                  <span>{found?.name ?? "Unknown recipe"}</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => moveComponent(i, -1)}
                      disabled={i === 0}
                      aria-label="Move up"
                      className="rounded px-1.5 text-sage/70 hover:text-gold disabled:opacity-30"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => moveComponent(i, 1)}
                      disabled={i === components.length - 1}
                      aria-label="Move down"
                      className="rounded px-1.5 text-sage/70 hover:text-gold disabled:opacity-30"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => removeComponent(id)}
                      aria-label="Remove"
                      className="rounded px-1.5 text-sage/70 hover:text-tomato"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {componentChoices.length > 0 ? (
          <div className="flex gap-2">
            <select
              value={componentToAdd}
              onChange={(e) => setComponentToAdd(e.target.value)}
              className={`${inputClass} min-w-0 flex-1`}
            >
              <option value="">Choose a recipe to include…</option>
              {componentChoices.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => addComponent(componentToAdd)}
              disabled={!componentToAdd}
              className="shrink-0 rounded-md border border-white/10 px-3 text-[12px] text-sage/90 hover:border-gold/60 hover:text-gold disabled:opacity-40"
            >
              Add
            </button>
          </div>
        ) : (
          <p className="text-[11px] text-sage/60">
            {availableMeals.length === 0
              ? "Loading your recipes…"
              : "No other recipes available to include yet."}
          </p>
        )}
        <p className="mt-1.5 text-[10.5px] text-sage/60">
          Included recipes' ingredients and instructions are combined in automatically — edit
          them there, not here. Order matters: instructions run in this order, with this
          recipe's own steps added last.
        </p>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-sage">
          Nutrition <span className="normal-case text-sage/60">(per serving, optional)</span>
        </legend>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {NUTRITION_FIELDS.map((field) => (
            <div key={field.key}>
              <label className="mb-1 block text-[11px] text-sage/80">
                {field.label} {field.unit && `(${field.unit})`}
              </label>
              <input
                type="number"
                min={0}
                step="any"
                value={nutrition[field.key] ?? ""}
                onChange={(e) =>
                  setNutrition((prev) => ({
                    ...prev,
                    [field.key]: e.target.value === "" ? undefined : Number(e.target.value),
                  }))
                }
                className={inputClass}
              />
            </div>
          ))}
        </div>
        <p className="mt-1.5 text-[10.5px] text-sage/60">
          Leave net carbs blank to auto-calculate it as carbs minus fiber.
        </p>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-sage">
          {components.length > 0 ? "Additional ingredients" : "Ingredients"}
        </legend>
        <div className="space-y-2">
          {ingredients.map((ing) => (
            <div key={ing.id} className="grid grid-cols-[56px_64px_1fr_120px_auto] gap-2">
              <input
                ref={(el) => {
                  amountRefs.current[ing.id] = el;
                }}
                value={ing.amount}
                onChange={(e) => updateIngredient(ing.id, "amount", e.target.value)}
                onKeyDown={handleIngredientKeyDown}
                placeholder="2"
                className={`${inputClass} w-full`}
              />
              <input
                value={ing.unit}
                onChange={(e) => updateIngredient(ing.id, "unit", e.target.value)}
                onKeyDown={handleIngredientKeyDown}
                placeholder="cups"
                className={`${inputClass} w-full`}
              />
              <input
                value={ing.name}
                onChange={(e) => updateIngredient(ing.id, "name", e.target.value)}
                onKeyDown={handleIngredientKeyDown}
                placeholder="diced tomatoes"
                className={`${inputClass} w-full min-w-0`}
              />
              <input
                list="department-suggestions"
                value={ing.department}
                onChange={(e) => updateIngredient(ing.id, "department", e.target.value)}
                onKeyDown={handleIngredientKeyDown}
                placeholder="Department"
                className={`${inputClass} w-full min-w-0`}
              />
              <button
                type="button"
                onClick={() => removeIngredient(ing.id)}
                aria-label="Remove ingredient"
                className="rounded-md border border-white/10 px-2.5 text-sage/70 transition-colors hover:border-tomato/60 hover:text-tomato"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <datalist id="department-suggestions">
          {DEPARTMENT_SUGGESTIONS.map((d) => (
            <option key={d} value={d} />
          ))}
        </datalist>
        <p className="mt-2 text-[10.5px] text-sage/60">
          Department groups this ingredient on the printed shopping list — e.g. “Produce”, “Dairy &amp; Eggs”. Leave blank to group it under “Other”.
        </p>
        <button
          type="button"
          onClick={addIngredient}
          className="mt-2 text-[11px] text-sage/80 underline-offset-2 hover:text-gold hover:underline"
        >
          + Add ingredient
        </button>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-sage">
          {components.length > 0 ? "Additional instructions" : "Instructions"}
        </legend>
        <textarea
          value={instructionsText}
          onChange={(e) => setInstructionsText(e.target.value)}
          placeholder={"One step per line:\nPreheat oven to 400°F.\nToss vegetables with oil and spices.\n..."}
          rows={7}
          className={`${inputClass} resize-y leading-relaxed`}
        />
        <p className="mt-1.5 text-[10.5px] text-sage/60">One step per line.</p>
      </fieldset>

      <button
        disabled={submitting}
        type="submit"
        className="rounded-md bg-gold px-4 py-2 text-[13px] font-semibold text-ink transition-opacity disabled:opacity-60"
      >
        {submitting ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
