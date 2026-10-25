"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Meal, NUTRITION_FIELDS, NutritionKey } from "@/lib/types";
import { colorForTags } from "@/lib/data";
import { isVirtualOffMeal } from "@/lib/openfoodfacts";
import { mealPath } from "@/lib/slug";

interface MealCardProps {
  meal: Meal;
  // "pantry": card in the Pantry sidebar
  // "placed": compact card in a board day slot
  // "browse": non-draggable card on the /meals list — whole card is a link,
  //   and it surfaces ownership/visibility + servings/protein/carb, which
  //   the drag cards skip to stay compact
  // Dragging (pantry/placed) is handled by the DraggableMealCard wrapper,
  // not by MealCard itself — this component is purely presentational.
  variant?: "pantry" | "placed" | "browse";
  weekIso?: string; // the board's current week — carried through so "back" from the meal page returns here
  visibleNutrients?: NutritionKey[]; // which nutrition fields to show, per the user's preferences
  onRemove?: () => void;
}

export default function MealCard({
  meal,
  variant = "pantry",
  weekIso,
  visibleNutrients = [],
  onRemove,
}: MealCardProps) {
  const router = useRouter();
  const accent = colorForTags(meal.tags);
  const isPlaced = variant === "placed";
  const isBrowse = variant === "browse";
  // a not-yet-imported Open Food Facts result has no /meals/[id] page of
  // its own — point "view" affordances at the product's OFF page instead
  const isVirtual = isVirtualOffMeal(meal.id);
  const viewHref = isVirtual
    ? meal.source
    : weekIso
    ? `${mealPath(meal)}?from=board&week=${weekIso}`
    : mealPath(meal);

  // only show fields the user opted into AND that this meal actually has a value for
  const nutritionToShow = NUTRITION_FIELDS.filter(
    (f) => visibleNutrients.includes(f.key) && meal.nutrition[f.key] !== undefined
  );

  const ownershipLabel = meal.isMine
    ? meal.visibility === "public"
      ? "Mine · Public"
      : "Mine · Personal"
    : "Public";

  const inner = (
    <>
      {!isPlaced && (
        <span
          className="washi"
          style={{ backgroundColor: accent, opacity: 0.55 }}
        />
      )}

      <div className="flex items-start gap-2.5">
        {meal.photo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={meal.photo}
            alt=""
            className={`shrink-0 rounded-md object-cover ${
              isPlaced ? "h-10 w-10" : "h-14 w-14"
            }`}
          />
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-1.5">
            <p
              className={`font-semibold leading-snug text-ink ${
                isPlaced ? "text-[13px]" : "text-[15px]"
              }`}
            >
              {meal.name}
            </p>
            {isPlaced && onRemove && (
              <button
                type="button"
                aria-label={`Remove ${meal.name}`}
                onClick={onRemove}
                className="shrink-0 rounded-full p-0.5 text-ink/40 opacity-0 transition-opacity hover:text-tomato group-hover:opacity-100"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M6 6l12 12M18 6L6 18"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            )}
            {!isPlaced && !isBrowse && isVirtual && (
              <a
                href={viewHref}
                target="_blank"
                rel="noreferrer"
                aria-label={`View ${meal.name} on Open Food Facts`}
                onClick={(e) => e.stopPropagation()}
                className="shrink-0 rounded-full p-0.5 text-ink/40 opacity-0 transition-opacity hover:text-ink group-hover:opacity-100"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
                  <path d="M12 11v5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <circle cx="12" cy="8" r="1" fill="currentColor" />
                </svg>
              </a>
            )}
            {!isPlaced && !isBrowse && !isVirtual && (
              <Link
                href={viewHref}
                aria-label={`View recipe for ${meal.name}`}
                onClick={(e) => e.stopPropagation()}
                className="shrink-0 rounded-full p-0.5 text-ink/40 opacity-0 transition-opacity hover:text-ink group-hover:opacity-100"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
                  <path d="M12 11v5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <circle cx="12" cy="8" r="1" fill="currentColor" />
                </svg>
              </Link>
            )}
            {isBrowse && (
              <span className="shrink-0 whitespace-nowrap text-[10.5px] text-ink/45">
                {ownershipLabel}
              </span>
            )}
          </div>

          <div
            className={`mt-1 flex min-w-0 items-center gap-x-1.5 gap-y-0.5 text-ink/55 ${
              isBrowse ? "flex-wrap" : ""
            } ${isPlaced ? "text-[10px]" : "text-[11.5px]"}`}
          >
            <span
              className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: accent }}
            />
            <span className="min-w-0 truncate" title={meal.tags.join(", ")}>
              {meal.tags.join(", ")}
            </span>
            <span aria-hidden className="shrink-0">·</span>
            <span className="shrink-0">{meal.minutes} min</span>
            {isBrowse && (
              <>
                <span aria-hidden className="shrink-0">·</span>
                <span className="shrink-0">
                  {meal.servings} serving{meal.servings === 1 ? "" : "s"}
                </span>
                {meal.primaryProtein !== "None" && (
                  <>
                    <span aria-hidden className="shrink-0">·</span>
                    <span className="shrink-0">{meal.primaryProtein}</span>
                  </>
                )}
                {meal.primaryCarb !== "None" && (
                  <>
                    <span aria-hidden className="shrink-0">·</span>
                    <span className="shrink-0">{meal.primaryCarb}</span>
                  </>
                )}
              </>
            )}
          </div>

          {nutritionToShow.length > 0 && (
            <div
              className={`mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-ink/45 ${
                isPlaced ? "text-[9.5px]" : "text-[10.5px]"
              }`}
            >
              {nutritionToShow.map((f, i) => (
                <span key={f.key} className="whitespace-nowrap">
                  {i > 0 && <span className="mr-1.5 text-ink/25" aria-hidden>·</span>}
                  {meal.nutrition[f.key]}
                  {f.unit}
                  {f.key === "calories" ? " cal" : ` ${f.shortLabel}`}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );

  const sharedClassName = `group relative select-none rounded-md bg-paper text-ink shadow-card transition-transform hover:-translate-y-0.5 ${
    isPlaced ? "px-2.5 py-2" : "px-3 py-3"
  }`;

  if (isBrowse) {
    return (
      <Link
        href={viewHref}
        className={`block cursor-pointer ${sharedClassName}`}
        style={{ borderBottom: `3px solid ${accent}` }}
      >
        {inner}
      </Link>
    );
  }

  return (
    <div
      onDoubleClick={() =>
        isVirtual ? window.open(viewHref, "_blank", "noreferrer") : router.push(viewHref)
      }
      title={isVirtual ? "Double-click to view on Open Food Facts" : "Double-click to view recipe"}
      className={`cursor-grab active:cursor-grabbing ${sharedClassName}`}
      style={{ borderBottom: `3px solid ${accent}` }}
    >
      {inner}
    </div>
  );
}
