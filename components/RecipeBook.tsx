"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { colorForTag } from "@/lib/data";
import { mealPath } from "@/lib/slug";
import { BookRecipe, buildChapters, searchRecipes } from "@/lib/recipeBook";

/** The public recipe book. The server sends every public recipe in the page
 * itself, so the whole book is in the initial HTML (readable and crawlable
 * before any script runs); this component turns pages and searches it. */
export default function RecipeBook({
  recipes,
  initialChapter,
}: {
  recipes: BookRecipe[];
  initialChapter: string | null;
}) {
  const chapters = useMemo(() => buildChapters(recipes), [recipes]);
  const [chapterKey, setChapterKey] = useState<string | null>(() => {
    const k = initialChapter?.toLowerCase() ?? null;
    return k && chapters.some((c) => c.key === k) ? k : null;
  });
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const index = chapterKey ? chapters.findIndex((c) => c.key === chapterKey) : -1;
  const chapter = index >= 0 ? chapters[index] : null;
  const results = useMemo(() => searchRecipes(recipes, query), [recipes, query]);
  const searching = query.trim().length > 0;

  // which way the page turned, so the new page slides in from that side
  const turn = useRef({ index: -1, cls: "" });
  if (turn.current.index !== index) {
    turn.current = {
      index,
      cls: index > turn.current.index ? "week-slide-next" : "week-slide-prev",
    };
  }

  function open(key: string | null) {
    setChapterKey(key);
    setQuery("");
    try {
      const url = key ? `/recipebook?chapter=${encodeURIComponent(key)}` : "/recipebook";
      window.history.replaceState(null, "", url);
    } catch {
      /* the address just won't update */
    }
    window.scrollTo({ top: 0 });
  }

  // ← / → turn the page when you're not typing in the search box
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowRight") {
        if (index === -1 && chapters[0]) open(chapters[0].key);
        else if (index >= 0 && index < chapters.length - 1) open(chapters[index + 1].key);
      } else if (e.key === "ArrowLeft") {
        if (index > 0) open(chapters[index - 1].key);
        else if (index === 0) open(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, chapters]);

  const backQuery = (key: string | null) => (key ? `&chapter=${encodeURIComponent(key)}` : "");
  const recipeHref = (r: BookRecipe, key: string | null) => `${mealPath(r)}?from=book${backQuery(key)}`;

  return (
    <main className="min-h-screen bg-board p-3 sm:p-6">
      <div className="mx-auto max-w-5xl">
        <div className="mb-3 flex items-center justify-between text-[12px]">
          <Link href="/" className="text-sage/80 transition-colors hover:text-chalk">
            ← The Weekly Board
          </Link>
          <Link
            href="/login?callbackUrl=%2F"
            className="text-sage/80 transition-colors hover:text-gold"
          >
            Sign in to plan your week
          </Link>
        </div>

        <div className="chalk-texture rounded-xl bg-board p-4 sm:p-7">
          {/* running head */}
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-white/10 pb-4">
            <button type="button" onClick={() => open(null)} className="text-left">
              <p className="text-[11px] uppercase tracking-[0.2em] text-sage">The community cookbook</p>
              <h1 className="font-display text-3xl leading-none text-chalk sm:text-5xl">Recipe Book</h1>
            </button>
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search recipes or ingredients…"
              aria-label="Search the recipe book"
              className="w-full rounded-md border border-white/10 bg-board-panel px-3 py-2 text-[13px] text-chalk outline-none placeholder:text-sage/50 focus:border-gold/60 sm:w-72"
            />
          </div>

          {recipes.length === 0 ? (
            <p className="py-16 text-center text-[13px] text-sage/70">
              No public recipes yet. Mark a recipe as public and it will appear here.
            </p>
          ) : searching ? (
            /* ---------- search results ---------- */
            <section>
              <p className="mb-3 text-[12px] text-sage/70">
                {results.length} {results.length === 1 ? "recipe" : "recipes"} for “{query.trim()}”
              </p>
              {results.length === 0 ? (
                <p className="py-10 text-center text-[13px] text-sage/60">
                  Nothing matches. Try fewer words, or browse a chapter.
                </p>
              ) : (
                <ul className="divide-y divide-white/10">
                  {results.map((r) => (
                    <RecipeRow key={r.id} recipe={r} href={recipeHref(r, null)} showTags />
                  ))}
                </ul>
              )}
            </section>
          ) : !chapter ? (
            /* ---------- cover + table of contents ---------- */
            <section key="cover" className={turn.current.cls}>
              <p className="mb-1 text-[11px] uppercase tracking-[0.2em] text-sage">Contents</p>
              <p className="mb-4 text-[13px] text-sage/80">
                {recipes.length} {recipes.length === 1 ? "recipe" : "recipes"} in {chapters.length}{" "}
                {chapters.length === 1 ? "chapter" : "chapters"}, shared by the people who cook here.
              </p>
              <ol className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {chapters.map((c, i) => (
                  <li key={c.key}>
                    <button
                      type="button"
                      onClick={() => open(c.key)}
                      className="group h-full w-full rounded-lg border border-white/10 bg-board-panel/60 p-4 text-left transition-colors hover:border-gold/60"
                      style={{ borderLeft: `4px solid ${colorForTag(c.title)}` }}
                    >
                      <span className="text-[10.5px] uppercase tracking-[0.18em] text-sage/70">
                        Chapter {i + 1}
                      </span>
                      <span className="mt-0.5 block font-display text-2xl leading-tight text-chalk group-hover:text-gold">
                        {c.title}
                      </span>
                      <span className="mt-1 block text-[11px] text-sage/70">
                        {c.recipes.length} {c.recipes.length === 1 ? "recipe" : "recipes"}
                      </span>
                      <span className="mt-2 block truncate text-[11.5px] italic text-sage/60">
                        {c.recipes
                          .slice(0, 3)
                          .map((r) => r.name)
                          .join(" · ")}
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            </section>
          ) : (
            /* ---------- a chapter ---------- */
            <div className="grid gap-6 md:grid-cols-[13rem_1fr]">
              {/* chapter list: a sidebar on wide screens, a scrolling strip on narrow ones */}
              <nav aria-label="Chapters" className="md:sticky md:top-4 md:self-start">
                <button
                  type="button"
                  onClick={() => open(null)}
                  className="mb-2 text-[11px] uppercase tracking-[0.18em] text-sage/70 hover:text-gold"
                >
                  ← Contents
                </button>
                <ol className="flex gap-1.5 overflow-x-auto pb-1 md:block md:space-y-1 md:overflow-visible md:pb-0">
                  {chapters.map((c, i) => (
                    <li key={c.key} className="shrink-0">
                      <button
                        type="button"
                        onClick={() => open(c.key)}
                        aria-current={c.key === chapter.key ? "page" : undefined}
                        className={`flex w-full items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-left text-[12px] transition-colors ${
                          c.key === chapter.key
                            ? "border-gold text-gold"
                            : "border-white/10 text-sage/90 hover:border-white/25"
                        }`}
                      >
                        <span className="whitespace-nowrap md:whitespace-normal">
                          <span className="text-sage/50">{i + 1}. </span>
                          {c.title}
                        </span>
                        <span className="text-[10.5px] text-sage/50">{c.recipes.length}</span>
                      </button>
                    </li>
                  ))}
                </ol>
              </nav>

              <section key={chapter.key} className={`min-w-0 ${turn.current.cls}`}>
                <p
                  className="text-[11px] uppercase tracking-[0.2em]"
                  style={{ color: colorForTag(chapter.title) }}
                >
                  Chapter {index + 1}
                </p>
                <h2 className="font-display text-4xl leading-none text-chalk sm:text-5xl">{chapter.title}</h2>
                <p className="mb-3 mt-1 text-[12px] text-sage/70">
                  {chapter.recipes.length} {chapter.recipes.length === 1 ? "recipe" : "recipes"}
                </p>

                <ul className="divide-y divide-white/10 border-y border-white/10">
                  {chapter.recipes.map((r) => (
                    <RecipeRow key={r.id} recipe={r} href={recipeHref(r, chapter.key)} />
                  ))}
                </ul>

                <div className="mt-5 flex items-center justify-between gap-3 text-[12px]">
                  {index > 0 ? (
                    <button
                      type="button"
                      onClick={() => open(chapters[index - 1].key)}
                      className="rounded-md border border-white/10 px-3 py-1.5 text-sage/90 transition-colors hover:border-gold/60 hover:text-gold"
                    >
                      ‹ {chapters[index - 1].title}
                    </button>
                  ) : (
                    <span />
                  )}
                  {index < chapters.length - 1 && (
                    <button
                      type="button"
                      onClick={() => open(chapters[index + 1].key)}
                      className="rounded-md border border-white/10 px-3 py-1.5 text-sage/90 transition-colors hover:border-gold/60 hover:text-gold"
                    >
                      {chapters[index + 1].title} ›
                    </button>
                  )}
                </div>
              </section>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function RecipeRow({ recipe, href, showTags = false }: { recipe: BookRecipe; href: string; showTags?: boolean }) {
  const details = [
    recipe.minutes > 0 ? `${recipe.minutes} min` : null,
    `serves ${recipe.servings}`,
    recipe.primaryProtein && recipe.primaryProtein !== "None" ? recipe.primaryProtein : null,
    recipe.primaryCarb && recipe.primaryCarb !== "None" ? recipe.primaryCarb : null,
  ].filter(Boolean);

  return (
    <li>
      <Link href={href} className="group flex items-center gap-3 py-2.5">
        {recipe.hasPhoto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/meals/${recipe.slug || recipe.id}/photo`}
            alt=""
            loading="lazy"
            className="h-12 w-12 shrink-0 rounded-md object-cover"
          />
        ) : (
          <span
            aria-hidden
            className="h-12 w-1 shrink-0 rounded-full"
            style={{ background: colorForTag(recipe.tags[0] ?? "Other") }}
          />
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate font-display text-xl leading-tight text-chalk group-hover:text-gold">
            {recipe.name}
          </span>
          <span className="block truncate text-[11.5px] text-sage/70">
            {details.join(" · ")}
            {recipe.contributor ? ` · by ${recipe.contributor}` : ""}
            {showTags && recipe.tags.length > 0 ? ` — ${recipe.tags.join(", ")}` : ""}
          </span>
        </span>
        <span aria-hidden className="text-sage/40 group-hover:text-gold">
          ›
        </span>
      </Link>
    </li>
  );
}
