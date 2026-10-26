"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BODY_FONT_OPTIONS,
  DAYS,
  DEFAULT_PREFERENCES,
  DayKey,
  FONT_OPTIONS,
  NUTRITION_FIELDS,
  NutritionKey,
  Orientation,
  Preferences,
  ThemeColors,
} from "@/lib/types";
import { applyTheme } from "@/lib/theme";
import { PATTERN_OPTIONS, PatternKey, isPatternKey, patternCss } from "@/lib/patterns";
import { groupFonts } from "@/lib/fonts";
import { DEFAULT_THEME_NAME, ThemeSummary } from "@/lib/themes";
import ThemeSettings from "@/components/ThemeSettings";

const COLOR_FIELDS: { key: keyof ThemeColors; label: string; hint: string }[] = [
  { key: "board", label: "Background", hint: "Main page background" },
  { key: "panel", label: "Panel", hint: "Calendar & pantry surfaces" },
  { key: "gold", label: "Primary accent", hint: "Headings, highlights, buttons" },
  { key: "tomato", label: "Secondary accent", hint: "Remove/error states, tags" },
  { key: "chalk", label: "Text", hint: "Main text on dark surfaces" },
  { key: "pattern", label: "Pattern color", hint: "Tint of the background pattern" },
];

export default function SettingsPage() {
  const router = useRouter();
  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/preferences")
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        const next: Preferences = {
          orientation: data.orientation ?? DEFAULT_PREFERENCES.orientation,
          firstDayOfWeek: data.firstDayOfWeek ?? DEFAULT_PREFERENCES.firstDayOfWeek,
          displayFont: data.displayFont ?? DEFAULT_PREFERENCES.displayFont,
          bodyFont: data.bodyFont ?? DEFAULT_PREFERENCES.bodyFont,
          colors: { ...DEFAULT_PREFERENCES.colors, ...(data.colors ?? {}) },
          backgroundPattern: isPatternKey(data.backgroundPattern) ? data.backgroundPattern : "none",
          themeName: data.themeName ?? null,
          visibleNutrients: data.visibleNutrients ?? DEFAULT_PREFERENCES.visibleNutrients,
          hideCheckedItems: data.hideCheckedItems ?? DEFAULT_PREFERENCES.hideCheckedItems,
          hideCompletedDepartments: data.hideCompletedDepartments ?? DEFAULT_PREFERENCES.hideCompletedDepartments,
          departmentOrder: data.departmentOrder ?? DEFAULT_PREFERENCES.departmentOrder,
        };
        setPrefs(next);
        applyTheme(next);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  function update(partial: Partial<Preferences>) {
    setPrefs((prev) => {
      const next = { ...prev, ...partial };
      applyTheme(next); // live preview, before saving
      return next;
    });
    setSaved(false);
  }

  function updateColor(key: keyof ThemeColors, value: string) {
    update({ colors: { ...prefs.colors, [key]: value } });
  }

  function toggleNutrient(key: NutritionKey) {
    const isVisible = prefs.visibleNutrients.includes(key);
    update({
      visibleNutrients: isVisible
        ? prefs.visibleNutrients.filter((k) => k !== key)
        : [...prefs.visibleNutrients, key],
    });
  }

  function handlePickTheme(theme: ThemeSummary) {
    update({
      themeName: theme.name,
      displayFont: theme.displayFont,
      bodyFont: theme.bodyFont,
      colors: theme.colors,
      backgroundPattern: theme.pattern,
    });
  }

  function resetTheme() {
    update({
      themeName: DEFAULT_THEME_NAME,
      displayFont: DEFAULT_PREFERENCES.displayFont,
      bodyFont: DEFAULT_PREFERENCES.bodyFont,
      colors: DEFAULT_PREFERENCES.colors,
      backgroundPattern: DEFAULT_PREFERENCES.backgroundPattern,
    });
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    await fetch("/api/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(prefs),
    });
    setSaving(false);
    setSaved(true);
    router.refresh();
  }

  return (
    <main className="min-h-screen bg-board p-4 md:p-6">
      <div className="mx-auto max-w-lg">
        <div className="mb-4 flex items-center justify-between">
          <Link
            href="/"
            className="text-[12px] text-sage/80 transition-colors hover:text-chalk"
          >
            ← Back to the board
          </Link>
        </div>

        <div className="chalk-texture rounded-xl bg-board p-6">
          <p className="text-[11px] uppercase tracking-[0.2em] text-sage">
            Preferences
          </p>
          <h1 className="mb-5 font-display text-4xl leading-none text-chalk">
            Settings
          </h1>

          {loading ? (
            <p className="text-[13px] text-sage/70">Loading…</p>
          ) : (
            <form onSubmit={handleSave} className="space-y-7">
              <fieldset>
                <legend className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-sage">
                  Board layout
                </legend>
                <div className="space-y-2">
                  <label className="flex cursor-pointer items-center gap-2.5 rounded-md border border-white/10 px-3 py-2.5 text-[13px] text-chalk transition-colors hover:border-gold/50">
                    <input
                      type="radio"
                      name="orientation"
                      checked={prefs.orientation === "daysTop"}
                      onChange={() => update({ orientation: "daysTop" as Orientation })}
                      className="accent-gold"
                    />
                    Days across the top, meals down the side
                  </label>
                  <label className="flex cursor-pointer items-center gap-2.5 rounded-md border border-white/10 px-3 py-2.5 text-[13px] text-chalk transition-colors hover:border-gold/50">
                    <input
                      type="radio"
                      name="orientation"
                      checked={prefs.orientation === "daysSide"}
                      onChange={() => update({ orientation: "daysSide" as Orientation })}
                      className="accent-gold"
                    />
                    Days down the side, meals across the top
                  </label>
                </div>
              </fieldset>

              <fieldset>
                <legend className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-sage">
                  First day of the week
                </legend>
                <select
                  value={prefs.firstDayOfWeek}
                  onChange={(e) =>
                    update({ firstDayOfWeek: e.target.value as DayKey })
                  }
                  className="w-full rounded-md border border-white/10 bg-board-panel px-3 py-2.5 text-[13px] text-chalk outline-none focus:border-gold/60"
                >
                  {DAYS.map((d) => (
                    <option key={d.key} value={d.key}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </fieldset>

              <fieldset>
                <legend className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-sage">
                  Nutrition on Meal Cards
                </legend>
                <p className="mb-2 text-[11px] text-sage/70">
                  Choose which values show on each meal card, and which ones get totaled
                  per day on the board.
                </p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {NUTRITION_FIELDS.map((field) => (
                    <label
                      key={field.key}
                      className="flex cursor-pointer items-center gap-2 rounded-md border border-white/10 px-2.5 py-2 text-[12.5px] text-chalk transition-colors hover:border-gold/50"
                    >
                      <input
                        type="checkbox"
                        checked={prefs.visibleNutrients.includes(field.key)}
                        onChange={() => toggleNutrient(field.key)}
                        className="accent-gold"
                      />
                      {field.label}
                    </label>
                  ))}
                </div>
              </fieldset>

              <ThemeSettings
                current={{
                  displayFont: prefs.displayFont,
                  bodyFont: prefs.bodyFont,
                  colors: prefs.colors,
                  pattern: prefs.backgroundPattern,
                }}
                themeName={prefs.themeName}
                onPick={handlePickTheme}
                onNameSaved={(name) => update({ themeName: name })}
              >
              <fieldset>
                <legend className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-sage">
                  Fonts
                </legend>
                <div className="space-y-2">
                  <div>
                    <label className="mb-1 block text-[11px] text-sage/80">
                      Heading font
                    </label>
                    <select
                      value={prefs.displayFont}
                      onChange={(e) =>
                        update({
                          displayFont: e.target.value as Preferences["displayFont"],
                        })
                      }
                      className="w-full rounded-md border border-white/10 bg-board-panel px-3 py-2.5 text-[13px] text-chalk outline-none focus:border-gold/60"
                      style={{
                        fontFamily: FONT_OPTIONS.find(
                          (f) => f.key === prefs.displayFont
                        )?.family,
                      }}
                    >
                      {groupFonts(FONT_OPTIONS).map((g) => (
                        <optgroup key={g.group} label={g.group}>
                          {g.options.map((f) => (
                            <option key={f.key} value={f.key} style={{ fontFamily: f.family }}>
                              {f.label}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] text-sage/80">
                      Body font
                    </label>
                    <select
                      value={prefs.bodyFont}
                      onChange={(e) =>
                        update({
                          bodyFont: e.target.value as Preferences["bodyFont"],
                        })
                      }
                      className="w-full rounded-md border border-white/10 bg-board-panel px-3 py-2.5 text-[13px] text-chalk outline-none focus:border-gold/60"
                      style={{
                        fontFamily: BODY_FONT_OPTIONS.find(
                          (f) => f.key === prefs.bodyFont
                        )?.family,
                      }}
                    >
                      {groupFonts(BODY_FONT_OPTIONS).map((g) => (
                        <optgroup key={g.group} label={g.group}>
                          {g.options.map((f) => (
                            <option key={f.key} value={f.key} style={{ fontFamily: f.family }}>
                              {f.label}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                </div>
              </fieldset>

              <fieldset>
                <legend className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-sage">
                  Background pattern
                </legend>
                <p className="mb-2 text-[11px] text-sage/70">
                  A subtle texture behind the board, tinted with the pattern color below.
                </p>
                <div className="grid grid-cols-4 gap-2">
                  {PATTERN_OPTIONS.map((p) => {
                    const css = patternCss(p.key, prefs.colors.pattern);
                    const selected = prefs.backgroundPattern === p.key;
                    return (
                      <button
                        key={p.key}
                        type="button"
                        onClick={() => update({ backgroundPattern: p.key as PatternKey })}
                        aria-pressed={selected}
                        className={`rounded-md border p-1 text-center transition-colors ${
                          selected ? "border-gold" : "border-white/10 hover:border-gold/50"
                        }`}
                      >
                        <span
                          className="mb-1 block h-10 rounded border border-white/10"
                          style={{
                            backgroundColor: prefs.colors.board,
                            backgroundImage: css.image,
                            backgroundSize: css.size,
                            backgroundPosition: css.position,
                          }}
                        />
                        <span className="block text-[10.5px] text-chalk">{p.label}</span>
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              <fieldset>
                <legend className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-sage">
                  Colors
                </legend>
                <div className="space-y-2">
                  {COLOR_FIELDS.map((field) => (
                    <div
                      key={field.key}
                      className="flex items-center justify-between gap-3 rounded-md border border-white/10 px-3 py-2"
                    >
                      <div>
                        <p className="text-[13px] text-chalk">{field.label}</p>
                        <p className="text-[10.5px] text-sage/70">{field.hint}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-sage/70">
                          {prefs.colors[field.key]}
                        </span>
                        <input
                          type="color"
                          value={prefs.colors[field.key]}
                          onChange={(e) => updateColor(field.key, e.target.value)}
                          className="h-8 w-8 cursor-pointer rounded border border-white/10 bg-transparent p-0.5"
                          aria-label={field.label}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={resetTheme}
                  className="mt-2 text-[11px] text-sage/80 underline-offset-2 hover:text-chalk hover:underline"
                >
                  Reset to the default theme
                </button>
              </fieldset>

              </ThemeSettings>

              <div className="flex items-center gap-3">
                <button
                  disabled={saving}
                  type="submit"
                  className="rounded-md bg-gold px-4 py-2 text-[13px] font-semibold text-ink transition-opacity disabled:opacity-60"
                >
                  {saving ? "Saving…" : "Save preferences"}
                </button>
                {saved && !saving && (
                  <span className="text-[12px] text-sage">Saved ✓</span>
                )}
              </div>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
