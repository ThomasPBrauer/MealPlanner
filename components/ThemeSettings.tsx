"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BODY_FONT_OPTIONS, FONT_OPTIONS } from "@/lib/fonts";
import {
  THEME_NAME_MAX,
  ThemeData,
  ThemeSummary,
  cleanThemeName,
  themeMatches,
  themeNameKey,
} from "@/lib/themes";

interface Props {
  /** the fonts and colors currently in the form (including unsaved tweaks) */
  current: ThemeData;
  /** the theme the user last picked or saved, if any */
  themeName: string | null | undefined;
  onPick: (theme: ThemeSummary) => void;
  /** called after "save as theme" succeeds, so the form remembers the name */
  onNameSaved: (name: string) => void;
  /** the individual Fonts and Colors controls, shown between the picker
   * and the save panel so they read as "overrides" of the chosen theme */
  children: React.ReactNode;
}

const COLOR_ORDER = ["board", "panel", "gold", "tomato", "chalk"] as const;

function displayFamily(key: string) {
  return FONT_OPTIONS.find((f) => f.key === key)?.family;
}

function bodyFamily(key: string) {
  return BODY_FONT_OPTIONS.find((f) => f.key === key)?.family;
}

export default function ThemeSettings({ current, themeName, onPick, onNameSaved, children }: Props) {
  const [themes, setThemes] = useState<ThemeSummary[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [newName, setNewName] = useState(themeName ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/themes");
      if (!res.ok) throw new Error("bad response");
      const data = (await res.json()) as { themes: ThemeSummary[] };
      setThemes(data.themes);
      setLoadState("ready");
    } catch {
      setLoadState("error");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // once the saved name arrives from the server, offer it in the name box
  // (only if the user hasn't started typing something else)
  useEffect(() => {
    setNewName((prev) => (prev === "" ? themeName ?? "" : prev));
  }, [themeName]);

  const activeTheme = useMemo(
    () => (themeName ? themes.find((t) => themeNameKey(t.name) === themeNameKey(themeName)) : undefined),
    [themes, themeName]
  );
  const modified = !!activeTheme && !themeMatches(activeTheme, current);

  const builtIn = themes.filter((t) => t.builtIn);
  const mine = themes.filter((t) => t.isMine);
  const shared = themes.filter((t) => !t.builtIn && !t.isMine);

  const cleaned = cleanThemeName(newName);
  const key = themeNameKey(cleaned);
  const clash = key ? themes.find((t) => themeNameKey(t.name) === key) : undefined;
  const overwritingOwn = !!clash && clash.isMine;
  const nameTaken = !!clash && !clash.isMine;
  const canSave = !!cleaned && !nameTaken && !saving && loadState === "ready";

  async function saveAsTheme() {
    if (!canSave) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/themes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: cleaned,
          displayFont: current.displayFont,
          bodyFont: current.bodyFont,
          colors: current.colors,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ kind: "error", text: data.error ?? "Couldn't save the theme." });
        // the list may have changed under us (someone took the name)
        if (res.status === 409) load();
        return;
      }
      const savedName: string = data.theme?.name ?? cleaned;
      setNewName(savedName);
      onNameSaved(savedName);
      setMessage({
        kind: "ok",
        text:
          data.status === "created"
            ? `Saved “${savedName}” — everyone can pick it now.`
            : `Updated “${savedName}”.`,
      });
      await load();
    } catch {
      setMessage({ kind: "error", text: "Couldn't reach the server." });
    } finally {
      setSaving(false);
    }
  }

  async function deleteTheme(theme: ThemeSummary) {
    if (!window.confirm(`Delete your theme “${theme.name}”? People who already use it keep their colors and fonts.`)) {
      return;
    }
    const res = await fetch(`/api/themes/${theme.id}`, { method: "DELETE" });
    if (res.ok) {
      setMessage({ kind: "ok", text: `Deleted “${theme.name}”.` });
      await load();
    } else {
      const data = await res.json().catch(() => ({}));
      setMessage({ kind: "error", text: data.error ?? "Couldn't delete the theme." });
    }
  }

  function renderCard(theme: ThemeSummary) {
    const selected = !!themeName && themeNameKey(theme.name) === themeNameKey(themeName);
    return (
      <li key={theme.id} className="relative">
        <button
          type="button"
          onClick={() => onPick(theme)}
          aria-pressed={selected}
          className={`block w-full rounded-md border px-3 py-2.5 text-left transition-colors ${
            selected ? "border-gold" : "border-white/10 hover:border-gold/50"
          }`}
          style={{ backgroundColor: theme.colors.board }}
        >
          <span
            className="block truncate pr-5 text-[20px] leading-tight"
            style={{ fontFamily: displayFamily(theme.displayFont), color: theme.colors.gold }}
          >
            {theme.name}
          </span>
          <span
            className="block truncate text-[11px]"
            style={{ fontFamily: bodyFamily(theme.bodyFont), color: theme.colors.chalk }}
          >
            {theme.isMine ? "Yours" : theme.ownerName ? `by ${theme.ownerName}` : theme.builtIn ? "Built-in" : "Shared"}
          </span>
          <span className="mt-1.5 flex gap-1" aria-hidden="true">
            {COLOR_ORDER.map((c) => (
              <span
                key={c}
                className="h-3.5 w-3.5 rounded-full border border-white/20"
                style={{ backgroundColor: theme.colors[c] }}
              />
            ))}
          </span>
        </button>
        {theme.isMine && (
          <button
            type="button"
            onClick={() => deleteTheme(theme)}
            aria-label={`Delete theme ${theme.name}`}
            title="Delete this theme"
            className="absolute right-1.5 top-1.5 rounded px-1.5 text-[14px] leading-none"
            style={{ color: theme.colors.chalk }}
          >
            ×
          </button>
        )}
      </li>
    );
  }

  function renderGroup(title: string, list: ThemeSummary[]) {
    if (list.length === 0) return null;
    return (
      <div className="mt-3 first:mt-0">
        <p className="mb-1.5 text-[11px] text-sage/80">{title}</p>
        <ul className="grid grid-cols-2 gap-2">{list.map(renderCard)}</ul>
      </div>
    );
  }

  return (
    <div className="space-y-7">
      <fieldset>
        <legend className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-sage">Theme</legend>
        <p className="mb-3 text-[11px] text-sage/70">
          Pick a look to start from. You can still change any font or color below.
        </p>

        {loadState === "loading" && <p className="text-[12px] text-sage/70">Loading themes…</p>}
        {loadState === "error" && (
          <p className="text-[12px] text-tomato">
            Couldn&apos;t load themes.{" "}
            <button type="button" onClick={load} className="underline">
              Try again
            </button>
          </p>
        )}
        {loadState === "ready" && (
          <>
            {renderGroup("Built-in", builtIn)}
            {renderGroup("Your themes", mine)}
            {renderGroup("Shared by others", shared)}
          </>
        )}

        {themeName && loadState === "ready" && (
          <p className="mt-3 text-[11px] text-sage/80">
            Using <span className="text-chalk">{activeTheme?.name ?? themeName}</span>
            {modified && <span> · modified</span>}
            {!activeTheme && <span> (this theme is no longer available)</span>}
            {modified && activeTheme && (
              <>
                {" "}
                <button
                  type="button"
                  onClick={() => onPick(activeTheme)}
                  className="underline underline-offset-2 hover:text-chalk"
                >
                  Revert to {activeTheme.name}
                </button>
              </>
            )}
          </p>
        )}
      </fieldset>

      {children}

      <fieldset>
        <legend className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-sage">
          Save as a theme
        </legend>
        <p className="mb-2 text-[11px] text-sage/70">
          Share your current fonts and colors as a theme everyone can pick. Names must be unique; you can
          always overwrite your own.
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={newName}
            maxLength={THEME_NAME_MAX}
            onChange={(e) => {
              setNewName(e.target.value);
              setMessage(null);
            }}
            onKeyDown={(e) => {
              // Enter here should save the theme, not submit the whole form
              if (e.key === "Enter") {
                e.preventDefault();
                saveAsTheme();
              }
            }}
            placeholder="Theme name"
            aria-label="Theme name"
            className="min-w-0 flex-1 rounded-md border border-white/10 bg-board-panel px-3 py-2.5 text-[13px] text-chalk outline-none focus:border-gold/60"
          />
          <button
            type="button"
            onClick={saveAsTheme}
            disabled={!canSave}
            className="shrink-0 rounded-md border border-gold/60 px-3 py-2 text-[12.5px] text-gold transition-opacity disabled:opacity-40"
          >
            {saving ? "Saving…" : overwritingOwn ? `Update “${clash?.name}”` : "Save as new theme"}
          </button>
        </div>
        {nameTaken && (
          <p className="mt-1.5 text-[11px] text-tomato">
            “{clash?.name}” is already taken{clash?.builtIn ? " by a built-in theme" : ""} — try another name.
          </p>
        )}
        {message && (
          <p className={`mt-1.5 text-[11px] ${message.kind === "ok" ? "text-sage" : "text-tomato"}`}>
            {message.text}
          </p>
        )}
        <p className="mt-1.5 text-[10.5px] text-sage/60">
          Saving a theme doesn&apos;t change your own settings — press “Save preferences” below for that.
        </p>
      </fieldset>
    </div>
  );
}
