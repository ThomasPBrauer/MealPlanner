"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { DEFAULT_PREFERENCES, Meal, MealType, Preferences } from "@/lib/types";
import { addDays, formatWeekRange, startOfWeek, toISODate } from "@/lib/date";
import { aggregateIngredients, normalizeIngredientKey } from "@/lib/recipe";
import { splitIngredientLine } from "@/lib/importRecipe";
import { DEPARTMENT_ORDER, departmentSortIndexWithOrder } from "@/lib/data";

type PlanEntry = { id: string; date: string; mealType: MealType; mealId: string };
type IngredientPrefMap = Record<string, { department: string | null; sortOrder: number | null }>;

interface ManualItemRow {
  id: string;
  name: string;
  amount: string;
  unit: string;
  department: string | null;
  checked: boolean;
  sortOrder: number | null;
}

// An unchecked item found on last week's list, offered as a one-tap add
// to this week's list. Carried forward as a manual item regardless of
// whether it originally came from a recipe — this week's ingredient list
// is fixed by what's actually planned this week. Keeps a reference back
// to where it lives on *last* week's list so that adding it here can also
// check it off there.
interface CarryForwardItem {
  name: string;
  amount: string;
  unit: string;
  department: string;
  prevKind: "ingredient" | "manual"; // which table the source row lives in
  prevKey: string; // ingredient: the aggregated ingredient key ("name|unit"); manual: the row's id
}

// A unified row for the list — either derived from a recipe's ingredients
// (kind "ingredient") or typed in directly (kind "manual"). Everything
// downstream (grouping, sorting, dragging, checking off) treats both the same.
interface ShoppingItem {
  key: string; // drag/sort id: ingredient key ("name|unit"), or `manual:${id}`
  kind: "ingredient" | "manual";
  manualId?: string;
  ingredientKey?: string; // only for kind === "ingredient" — matches IngredientPreference
  sourceMealIds?: string[]; // only for kind === "ingredient" — recipes this line came from
  name: string;
  display: string; // formatted amount/unit
  usedIn: string[]; // meal names; empty for manual items
  effectiveDepartment: string;
  sortOrder: number | null;
  isChecked: boolean;
}

const jsonHeaders = { "Content-Type": "application/json" };
const DEPT_PREFIX = "dept:";

/** One row in the shopping list. The drag handle (not the whole row) is
 * the sortable trigger, so tapping the checkbox never gets mistaken for
 * the start of a drag. */
function ShoppingListRow({
  item,
  onToggle,
  onRemove,
}: {
  item: ShoppingItem;
  onToggle: () => void;
  onRemove?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.key,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-1.5 border-b border-neutral-100 py-1.5 ${
        isDragging ? "relative z-10 bg-white opacity-90 shadow-md" : ""
      }`}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={`Reorder ${item.name}`}
        className="print:hidden shrink-0 touch-none cursor-grab rounded px-1 py-1.5 text-neutral-400 active:cursor-grabbing"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <circle cx="9" cy="6" r="1.4" fill="currentColor" />
          <circle cx="9" cy="12" r="1.4" fill="currentColor" />
          <circle cx="9" cy="18" r="1.4" fill="currentColor" />
          <circle cx="15" cy="6" r="1.4" fill="currentColor" />
          <circle cx="15" cy="12" r="1.4" fill="currentColor" />
          <circle cx="15" cy="18" r="1.4" fill="currentColor" />
        </svg>
      </button>

      <input
        type="checkbox"
        checked={item.isChecked}
        onChange={onToggle}
        className="h-4 w-4 shrink-0"
        aria-label={`${item.isChecked ? "Uncheck" : "Check off"} ${item.name}`}
      />

      <span
        className={`min-w-0 flex-1 text-[13px] ${item.isChecked ? "text-neutral-400 line-through" : ""}`}
      >
        {item.display && <span className="font-semibold">{item.display}</span>} {item.name}
        {item.usedIn.length > 0 && (
          <span className="ml-1.5 text-[10.5px] text-neutral-400">({item.usedIn.join(", ")})</span>
        )}
      </span>

      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${item.name}`}
          className="print:hidden shrink-0 rounded px-1 text-[13px] leading-none text-neutral-400 hover:text-red-600"
        >
          ✕
        </button>
      )}
    </li>
  );
}

/** A department's section — droppable as a whole (so dropping on empty
 * space, or into an empty department, still resolves) with a sortable
 * list of its items nested inside, plus a "+" quick-add control. */
function DepartmentSection({
  department,
  items,
  isAdding,
  quickAddDraft,
  onToggle,
  onRemoveManual,
  onOpenQuickAdd,
  onQuickAddDraftChange,
  onSubmitQuickAdd,
  onCancelQuickAdd,
  quickAddError,
  isEditingName,
  renameDraft,
  onStartRename,
  onRenameDraftChange,
  onSubmitRename,
  onCancelRename,
}: {
  department: string;
  items: ShoppingItem[];
  isAdding: boolean;
  quickAddDraft: string;
  onToggle: (item: ShoppingItem) => void;
  onRemoveManual: (manualId: string) => void;
  onOpenQuickAdd: () => void;
  onQuickAddDraftChange: (value: string) => void;
  onSubmitQuickAdd: () => void;
  onCancelQuickAdd: () => void;
  quickAddError: string | null;
  isEditingName: boolean;
  renameDraft: string;
  onStartRename: () => void;
  onRenameDraftChange: (value: string) => void;
  onSubmitRename: () => void;
  onCancelRename: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `${DEPT_PREFIX}${department}` });

  return (
    <div
      ref={setNodeRef}
      className={`break-inside-avoid rounded-md p-1 transition-colors ${
        isOver ? "bg-neutral-100 ring-1 ring-neutral-300" : ""
      }`}
    >
      <div className="mb-1 flex items-center gap-1 border-b border-neutral-300 pb-0.5">
        {isEditingName ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onSubmitRename();
            }}
            className="print:hidden flex min-w-0 flex-1 items-center gap-1"
          >
            <input
              autoFocus
              value={renameDraft}
              onChange={(e) => onRenameDraftChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") onCancelRename();
              }}
              className="min-w-0 flex-1 rounded border border-neutral-300 px-1.5 py-0.5 text-[12px] font-semibold uppercase tracking-wide text-neutral-700 outline-none focus:border-neutral-500"
            />
            <button
              type="submit"
              aria-label="Save department name"
              className="shrink-0 rounded px-1 text-[12px] leading-none text-neutral-600 hover:text-neutral-900"
            >
              ✓
            </button>
            <button
              type="button"
              onClick={onCancelRename}
              aria-label="Cancel rename"
              className="shrink-0 rounded px-1 text-[12px] leading-none text-neutral-400 hover:text-neutral-700"
            >
              ✕
            </button>
          </form>
        ) : (
          <>
            <h2 className="truncate text-[12px] font-semibold uppercase tracking-wide text-neutral-600">
              {department}
            </h2>
            <button
              type="button"
              onClick={onStartRename}
              aria-label={`Rename ${department}`}
              className="print:hidden shrink-0 rounded px-1 text-[11px] leading-none text-neutral-400 hover:text-neutral-700"
            >
              ✎
            </button>
            <button
              type="button"
              onClick={onOpenQuickAdd}
              aria-label={`Add item to ${department}`}
              className="print:hidden shrink-0 rounded px-1.5 text-[14px] leading-none text-neutral-500 hover:text-neutral-900"
            >
              +
            </button>
          </>
        )}
      </div>

      {isAdding && (
        <div className="print:hidden mb-1.5">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onSubmitQuickAdd();
            }}
            className="flex items-center gap-1.5"
          >
            <input
              autoFocus
              value={quickAddDraft}
              onChange={(e) => onQuickAddDraftChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") onCancelQuickAdd();
              }}
              placeholder="e.g. 2 cans black beans"
              className="min-w-0 flex-1 rounded border border-neutral-300 px-2 py-1 text-[12.5px] outline-none focus:border-neutral-500"
            />
            <button
              type="submit"
              className="shrink-0 rounded bg-neutral-900 px-2 py-1 text-[11px] font-semibold text-white"
            >
              Add
            </button>
            <button
              type="button"
              onClick={onCancelQuickAdd}
              className="shrink-0 text-[11px] text-neutral-500"
            >
              Cancel
            </button>
          </form>
          {quickAddError && <p className="mt-1 text-[10.5px] text-red-600">{quickAddError}</p>}
        </div>
      )}

      {items.length === 0 ? (
        <p className="pb-1.5 text-[11.5px] text-neutral-400">No items yet.</p>
      ) : (
        <SortableContext items={items.map((i) => i.key)} strategy={verticalListSortingStrategy}>
          <ul className="space-y-1">
            {items.map((item) => (
              <ShoppingListRow
                key={item.key}
                item={item}
                onToggle={() => onToggle(item)}
                onRemove={item.kind === "manual" ? () => onRemoveManual(item.manualId!) : undefined}
              />
            ))}
          </ul>
        </SortableContext>
      )}
    </div>
  );
}

function PrintShoppingListContent() {
  const searchParams = useSearchParams();
  const startParam = searchParams.get("start");
  const weekStart = startParam ? new Date(`${startParam}T00:00:00`) : startOfWeek(new Date(), "mon");
  const weekStartISO = toISODate(weekStart);
  const boardHref = startParam ? `/?week=${startParam}` : "/";

  const [entries, setEntries] = useState<PlanEntry[]>([]);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [loading, setLoading] = useState(true);

  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [ingredientPrefs, setIngredientPrefs] = useState<IngredientPrefMap>({});
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [manualItems, setManualItems] = useState<ManualItemRow[]>([]);
  const [activeItem, setActiveItem] = useState<ShoppingItem | null>(null);

  // departments created via "+ Department" this page-load, kept visible
  // even before they have any items so there's somewhere to add the first one
  const [pendingNewDepartments, setPendingNewDepartments] = useState<string[]>([]);
  const [addingDepartment, setAddingDepartment] = useState(false);
  const [newDepartmentDraft, setNewDepartmentDraft] = useState("");
  const [quickAddDepartment, setQuickAddDepartment] = useState<string | null>(null);
  const [quickAddDraft, setQuickAddDraft] = useState("");
  const [quickAddError, setQuickAddError] = useState<string | null>(null);
  const [editingDepartment, setEditingDepartment] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [carryForwardItems, setCarryForwardItems] = useState<CarryForwardItem[]>([]);
  const [carryForwardWeekLabel, setCarryForwardWeekLabel] = useState("");
  const [carryForwardWeekISO, setCarryForwardWeekISO] = useState("");
  const [carryForwardBusy, setCarryForwardBusy] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // plan + meals for this week
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const start = weekStartISO;
    const end = toISODate(addDays(weekStart, 6));
    Promise.all([
      fetch(`/api/plan?start=${start}&end=${end}`).then((r) => (r.ok ? r.json() : { entries: [] })),
      fetch(`/api/meals`).then((r) => (r.ok ? r.json() : { meals: [] })),
    ]).then(([planData, mealsData]) => {
      if (cancelled) return;
      setEntries(planData.entries ?? []);
      setMeals(mealsData.meals ?? []);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startParam]);

  // preferences + lasting per-ingredient overrides — global, not week-scoped
  useEffect(() => {
    let cancelled = false;
    fetch("/api/preferences")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setPrefs({
          ...DEFAULT_PREFERENCES,
          ...data,
          colors: { ...DEFAULT_PREFERENCES.colors, ...(data.colors ?? {}) },
          visibleNutrients: data.visibleNutrients ?? DEFAULT_PREFERENCES.visibleNutrients,
          hideCheckedItems: Boolean(data.hideCheckedItems),
          hideCompletedDepartments: Boolean(data.hideCompletedDepartments),
          departmentOrder: Array.isArray(data.departmentOrder) ? data.departmentOrder : [],
        });
      });
    fetch("/api/shopping/ingredient-prefs")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setIngredientPrefs(data.prefs ?? {});
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // checked state + manual items — week-scoped, refetch whenever the week changes
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/shopping/check?week=${weekStartISO}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setChecked(new Set<string>(data.checked ?? []));
      });
    fetch(`/api/shopping/manual-items?week=${weekStartISO}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setManualItems(data.items ?? []);
      });
    setPendingNewDepartments([]); // a fresh week's list — clear last week's not-yet-used departments
    return () => {
      cancelled = true;
    };
  }, [weekStartISO]);

  // check last week's list for anything still unchecked, once this week's
  // own data has loaded — skipped if already asked (and answered either
  // way) about this week this session, so it doesn't nag on every visit
  useEffect(() => {
    if (loading) return;
    let cancelled = false;

    const dismissKey = `mealplanner:carryForwardDismissed:${weekStartISO}`;
    try {
      if (sessionStorage.getItem(dismissKey)) return;
    } catch {
      /* sessionStorage unavailable — just proceed, worst case we ask again */
    }

    const prevWeekStart = addDays(weekStart, -7);
    const prevWeekISO = toISODate(prevWeekStart);
    const prevWeekEnd = toISODate(addDays(prevWeekStart, 6));

    Promise.all([
      fetch(`/api/plan?start=${prevWeekISO}&end=${prevWeekEnd}`).then((r) => (r.ok ? r.json() : { entries: [] })),
      fetch(`/api/shopping/check?week=${prevWeekISO}`).then((r) => (r.ok ? r.json() : { checked: [] })),
      fetch(`/api/shopping/manual-items?week=${prevWeekISO}`).then((r) => (r.ok ? r.json() : { items: [] })),
    ])
      .then(([planData, checkData, manualData]) => {
        if (cancelled) return;

        const prevEntries: PlanEntry[] = planData.entries ?? [];
        const prevOccurrences = prevEntries
          .map((e) => meals.find((m) => m.id === e.mealId))
          .filter((m): m is Meal => Boolean(m));
        const prevAggregated = aggregateIngredients(prevOccurrences, meals);
        const prevChecked = new Set<string>(checkData.checked ?? []);

        const uncheckedIngredients: CarryForwardItem[] = prevAggregated
          .filter((ing) => !prevChecked.has(ing.key))
          .map((ing) => {
            const pref = ingredientPrefs[normalizeIngredientKey(ing.name)];
            return {
              name: ing.name,
              amount: ing.display,
              unit: "",
              department: (pref?.department ?? ing.department) || "Other",
              prevKind: "ingredient" as const,
              prevKey: ing.key,
            };
          });

        const prevManualItems: ManualItemRow[] = manualData.items ?? [];
        const uncheckedManual: CarryForwardItem[] = prevManualItems
          .filter((m) => !m.checked)
          .map((m) => ({
            name: m.name,
            amount: m.amount,
            unit: m.unit,
            department: m.department || "Other",
            prevKind: "manual" as const,
            prevKey: m.id,
          }));

        const combined = [...uncheckedIngredients, ...uncheckedManual];
        if (combined.length === 0) return;
        setCarryForwardItems(combined);
        setCarryForwardWeekLabel(formatWeekRange(prevWeekStart));
        setCarryForwardWeekISO(prevWeekISO);
      })
      .catch((err) => {
        console.error("Failed to check last week's list:", err);
      });

    return () => {
      cancelled = true;
    };
    // only re-check when the visible week or the base data it depends on changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStartISO, loading]);

  const aggregated = useMemo(() => {
    const occurrences = entries
      .map((e) => meals.find((m) => m.id === e.mealId))
      .filter((m): m is Meal => Boolean(m));
    return aggregateIngredients(occurrences, meals);
  }, [entries, meals]);

  const effectiveDepartmentOrder = prefs.departmentOrder.length > 0 ? prefs.departmentOrder : DEPARTMENT_ORDER;

  const items: ShoppingItem[] = useMemo(() => {
    const ingredientItems: ShoppingItem[] = aggregated.map((ing) => {
      const ingredientKey = normalizeIngredientKey(ing.name);
      const pref = ingredientPrefs[ingredientKey];
      return {
        key: ing.key,
        kind: "ingredient",
        ingredientKey,
        sourceMealIds: ing.sourceMealIds,
        name: ing.name,
        display: ing.display,
        usedIn: ing.usedIn,
        effectiveDepartment: (pref?.department ?? ing.department) || "Other",
        sortOrder: pref?.sortOrder ?? null,
        isChecked: checked.has(ing.key),
      };
    });
    const manualShoppingItems: ShoppingItem[] = manualItems.map((m) => ({
      key: `manual:${m.id}`,
      kind: "manual",
      manualId: m.id,
      name: m.name,
      display: [m.amount, m.unit].filter(Boolean).join(" "),
      usedIn: [],
      effectiveDepartment: m.department || "Other",
      sortOrder: m.sortOrder,
      isChecked: m.checked,
    }));
    return [...ingredientItems, ...manualShoppingItems];
  }, [aggregated, ingredientPrefs, checked, manualItems]);

  const checkedCount = items.filter((i) => i.isChecked).length;

  const departmentGroups = useMemo(() => {
    const allGroups = new Map<string, ShoppingItem[]>();
    for (const item of items) {
      const arr = allGroups.get(item.effectiveDepartment);
      if (arr) arr.push(item);
      else allGroups.set(item.effectiveDepartment, [item]);
    }
    for (const dep of pendingNewDepartments) {
      if (!allGroups.has(dep)) allGroups.set(dep, []);
    }

    const result: { department: string; items: ShoppingItem[] }[] = [];
    for (const [department, groupItems] of allGroups) {
      const hasUnchecked = groupItems.some((i) => !i.isChecked);
      // don't hide a brand-new, still-empty department — only ones that are actually "done"
      if (prefs.hideCompletedDepartments && groupItems.length > 0 && !hasUnchecked) continue;

      const displayItems = prefs.hideCheckedItems ? groupItems.filter((i) => !i.isChecked) : groupItems;
      const sorted = [...displayItems].sort((a, b) => {
        const oa = a.sortOrder ?? Number.POSITIVE_INFINITY;
        const ob = b.sortOrder ?? Number.POSITIVE_INFINITY;
        if (oa !== ob) return oa - ob;
        return a.name.localeCompare(b.name);
      });
      result.push({ department, items: sorted });
    }

    return result.sort(
      (a, b) =>
        departmentSortIndexWithOrder(a.department, effectiveDepartmentOrder) -
        departmentSortIndexWithOrder(b.department, effectiveDepartmentOrder)
    );
  }, [items, pendingNewDepartments, prefs.hideCheckedItems, prefs.hideCompletedDepartments, effectiveDepartmentOrder]);

  const plannedMealNames = useMemo(() => {
    const names = new Set<string>();
    for (const e of entries) {
      const meal = meals.find((m) => m.id === e.mealId);
      if (meal) names.add(meal.name);
    }
    return Array.from(names).sort();
  }, [entries, meals]);

  async function toggleChecked(item: ShoppingItem) {
    if (item.kind === "manual" && item.manualId) {
      const nextChecked = !item.isChecked;
      setManualItems((prev) =>
        prev.map((m) => (m.id === item.manualId ? { ...m, checked: nextChecked } : m))
      );
      try {
        await fetch(`/api/shopping/manual-items/${item.manualId}`, {
          method: "PATCH",
          headers: jsonHeaders,
          body: JSON.stringify({ checked: nextChecked }),
        });
      } catch {
        /* best effort */
      }
      return;
    }

    const next = new Set(checked);
    if (item.isChecked) next.delete(item.key);
    else next.add(item.key);
    setChecked(next); // optimistic
    try {
      await fetch("/api/shopping/check", {
        method: "PUT",
        headers: jsonHeaders,
        body: JSON.stringify({ week: weekStartISO, itemKey: item.key, checked: !item.isChecked }),
      });
    } catch {
      /* best effort — worst case it resyncs correctly on next load */
    }
  }

  async function setHideChecked(value: boolean) {
    const next = { ...prefs, hideCheckedItems: value };
    setPrefs(next);
    try {
      await fetch("/api/preferences", { method: "PUT", headers: jsonHeaders, body: JSON.stringify(next) });
    } catch {
      /* best effort */
    }
  }

  async function setHideCompletedDepartments(value: boolean) {
    const next = { ...prefs, hideCompletedDepartments: value };
    setPrefs(next);
    try {
      await fetch("/api/preferences", { method: "PUT", headers: jsonHeaders, body: JSON.stringify(next) });
    } catch {
      /* best effort */
    }
  }

  async function addDepartmentToOrder(department: string) {
    if (effectiveDepartmentOrder.includes(department)) return;
    const list = [...effectiveDepartmentOrder];
    const otherIdx = list.indexOf("Other");
    if (otherIdx === -1) list.push(department);
    else list.splice(otherIdx, 0, department);
    const next = { ...prefs, departmentOrder: list };
    setPrefs(next);
    try {
      await fetch("/api/preferences", { method: "PUT", headers: jsonHeaders, body: JSON.stringify(next) });
    } catch {
      /* best effort */
    }
  }

  function handleSubmitNewDepartment(e: React.FormEvent) {
    e.preventDefault();
    const name = newDepartmentDraft.trim();
    if (!name) return;
    setPendingNewDepartments((prev) => (prev.includes(name) ? prev : [...prev, name]));
    void addDepartmentToOrder(name);
    setNewDepartmentDraft("");
    setAddingDepartment(false);
  }

  /** Renames a department in place: updates the ordered department list
   * (so its position is preserved) and re-labels every item currently in
   * it — including ones with no explicit override yet, since "Dairy" the
   * recipe-stated department and "Dairy" the ordered-list entry need to
   * move together. Item order within the department is left untouched. */
  async function renameDepartment(oldName: string, newNameRaw: string) {
    const newName = newNameRaw.trim();
    if (!newName || newName === oldName) return;

    const renamedList = effectiveDepartmentOrder.map((d) => (d === oldName ? newName : d));
    const dedupedList = Array.from(new Set(renamedList));
    const nextPrefs = { ...prefs, departmentOrder: dedupedList };
    setPrefs(nextPrefs);
    setPendingNewDepartments((prev) => prev.map((d) => (d === oldName ? newName : d)));

    const affected = items.filter((i) => i.effectiveDepartment === oldName);
    const ingredientUpdates = affected
      .filter((i) => i.kind === "ingredient" && i.ingredientKey)
      .map((i) => ({ ingredientKey: i.ingredientKey as string, department: newName }));
    const manualIds = affected
      .filter((i) => i.kind === "manual" && i.manualId)
      .map((i) => i.manualId as string);

    setIngredientPrefs((prev) => {
      const next = { ...prev };
      for (const u of ingredientUpdates) {
        next[u.ingredientKey] = { department: newName, sortOrder: prev[u.ingredientKey]?.sortOrder ?? null };
      }
      return next;
    });
    setManualItems((prev) =>
      prev.map((m) => (m.department === oldName ? { ...m, department: newName } : m))
    );

    const requests: Promise<unknown>[] = [
      fetch("/api/preferences", { method: "PUT", headers: jsonHeaders, body: JSON.stringify(nextPrefs) }),
    ];
    if (ingredientUpdates.length > 0) {
      requests.push(
        fetch("/api/shopping/ingredient-prefs", {
          method: "PUT",
          headers: jsonHeaders,
          body: JSON.stringify({ updates: ingredientUpdates }),
        })
      );
    }
    for (const id of manualIds) {
      requests.push(
        fetch(`/api/shopping/manual-items/${id}`, {
          method: "PATCH",
          headers: jsonHeaders,
          body: JSON.stringify({ department: newName }),
        })
      );
    }
    try {
      await Promise.all(requests);
    } catch (err) {
      console.error("Failed to rename department:", err);
    }
  }

  function markCarryForwardDismissed() {
    try {
      sessionStorage.setItem(`mealplanner:carryForwardDismissed:${weekStartISO}`, "1");
    } catch {
      /* sessionStorage unavailable — worst case it asks again next visit */
    }
  }

  function handleDismissCarryForward() {
    setCarryForwardItems([]);
    markCarryForwardDismissed();
  }

  async function handleCarryForward() {
    const toAdd = carryForwardItems;
    const prevWeekISO = carryForwardWeekISO;
    setCarryForwardBusy(true);
    try {
      await Promise.all(
        toAdd.map((it) =>
          fetch("/api/shopping/manual-items", {
            method: "POST",
            headers: jsonHeaders,
            body: JSON.stringify({
              week: weekStartISO,
              name: it.name,
              amount: it.amount,
              unit: it.unit,
              department: it.department,
            }),
          })
        )
      );
      const res = await fetch(`/api/shopping/manual-items?week=${weekStartISO}`);
      if (res.ok) {
        const data = await res.json();
        setManualItems(data.items ?? []);
      }
      // now that they've landed on this week's list, check them off on
      // *last* week's list — that's the whole point of carrying them
      // forward instead of just re-adding them
      if (prevWeekISO) {
        await Promise.all(
          toAdd.map((it) =>
            it.prevKind === "ingredient"
              ? fetch("/api/shopping/check", {
                  method: "PUT",
                  headers: jsonHeaders,
                  body: JSON.stringify({ week: prevWeekISO, itemKey: it.prevKey, checked: true }),
                })
              : fetch(`/api/shopping/manual-items/${it.prevKey}`, {
                  method: "PATCH",
                  headers: jsonHeaders,
                  body: JSON.stringify({ checked: true }),
                })
          )
        );
      }
    } catch (err) {
      console.error("Failed to carry items forward:", err);
    }
    setCarryForwardBusy(false);
    setCarryForwardItems([]);
    markCarryForwardDismissed();
  }

  async function submitQuickAdd(department: string) {
    const raw = quickAddDraft.trim();
    if (!raw) return;
    const parsed = splitIngredientLine(raw);
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const optimistic: ManualItemRow = {
      id: tempId,
      name: parsed.name || raw,
      amount: parsed.amount,
      unit: parsed.unit,
      department,
      checked: false,
      sortOrder: null,
    };
    setManualItems((prev) => [...prev, optimistic]);
    setQuickAddError(null);

    try {
      const res = await fetch("/api/shopping/manual-items", {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({
          week: weekStartISO,
          name: optimistic.name,
          amount: optimistic.amount,
          unit: optimistic.unit,
          department,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Request failed (${res.status})`);
      }
      const { item } = await res.json();
      setManualItems((prev) => prev.map((m) => (m.id === tempId ? item : m)));
      setQuickAddDraft("");
      setQuickAddDepartment(null);
    } catch (err) {
      setManualItems((prev) => prev.filter((m) => m.id !== tempId)); // roll back the optimistic row
      const message = err instanceof Error ? err.message : "Couldn't add that item.";
      console.error("Failed to add shopping list item:", err);
      setQuickAddError(message);
    }
  }

  async function removeManualItem(manualId: string) {
    setManualItems((prev) => prev.filter((m) => m.id !== manualId));
    try {
      await fetch(`/api/shopping/manual-items/${manualId}`, { method: "DELETE" });
    } catch {
      /* best effort */
    }
  }

  async function reorderWithinDepartment(department: string, activeKey: string, overKey: string) {
    const group = departmentGroups.find((g) => g.department === department);
    if (!group) return;
    const oldIndex = group.items.findIndex((i) => i.key === activeKey);
    const newIndex = group.items.findIndex((i) => i.key === overKey);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(group.items, oldIndex, newIndex);

    const ingredientUpdates: { ingredientKey: string; sortOrder: number }[] = [];
    const manualUpdates: { id: string; sortOrder: number }[] = [];
    reordered.forEach((it, i) => {
      if (it.kind === "ingredient" && it.ingredientKey) {
        ingredientUpdates.push({ ingredientKey: it.ingredientKey, sortOrder: i });
      } else if (it.kind === "manual" && it.manualId) {
        manualUpdates.push({ id: it.manualId, sortOrder: i });
      }
    });

    setIngredientPrefs((prev) => {
      const next = { ...prev };
      for (const u of ingredientUpdates) {
        next[u.ingredientKey] = { department: next[u.ingredientKey]?.department ?? null, sortOrder: u.sortOrder };
      }
      return next;
    });
    setManualItems((prev) =>
      prev.map((m) => {
        const u = manualUpdates.find((x) => x.id === m.id);
        return u ? { ...m, sortOrder: u.sortOrder } : m;
      })
    );

    const requests: Promise<unknown>[] = [];
    if (ingredientUpdates.length > 0) {
      requests.push(
        fetch("/api/shopping/ingredient-prefs", {
          method: "PUT",
          headers: jsonHeaders,
          body: JSON.stringify({ updates: ingredientUpdates }),
        })
      );
    }
    for (const u of manualUpdates) {
      requests.push(
        fetch(`/api/shopping/manual-items/${u.id}`, {
          method: "PATCH",
          headers: jsonHeaders,
          body: JSON.stringify({ sortOrder: u.sortOrder }),
        })
      );
    }
    try {
      await Promise.all(requests);
    } catch {
      /* best effort */
    }
  }

  async function moveItemToDepartment(item: ShoppingItem, targetDepartment: string) {
    const targetItems = departmentGroups.find((g) => g.department === targetDepartment)?.items ?? [];
    const maxOrder = targetItems.reduce(
      (max, i) => (i.sortOrder !== null ? Math.max(max, i.sortOrder) : max),
      -1
    );
    const newOrder = maxOrder + 1;

    if (item.kind === "manual" && item.manualId) {
      setManualItems((prev) =>
        prev.map((m) =>
          m.id === item.manualId ? { ...m, department: targetDepartment, sortOrder: newOrder } : m
        )
      );
      try {
        await fetch(`/api/shopping/manual-items/${item.manualId}`, {
          method: "PATCH",
          headers: jsonHeaders,
          body: JSON.stringify({ department: targetDepartment, sortOrder: newOrder }),
        });
      } catch {
        /* best effort */
      }
      return;
    }

    if (item.kind === "ingredient" && item.ingredientKey) {
      const ingredientKey = item.ingredientKey;
      setIngredientPrefs((prev) => ({
        ...prev,
        [ingredientKey]: { department: targetDepartment, sortOrder: newOrder },
      }));
      try {
        await fetch("/api/shopping/ingredient-prefs", {
          method: "PUT",
          headers: jsonHeaders,
          body: JSON.stringify({ updates: [{ ingredientKey, department: targetDepartment, sortOrder: newOrder }] }),
        });
      } catch {
        /* best effort */
      }
      // this personal override always applies regardless of who owns the
      // recipe(s) the ingredient came from; on top of that, push the same
      // department into any of those recipes the current user actually
      // owns, so the correction sticks even for a future week where the
      // shopping list is built fresh
      void updateOwnedRecipeDepartments(item, targetDepartment);
    }
  }

  /** For any recipe the current user owns that this ingredient line came
   * from, updates that ingredient's stored `department` to match — so
   * moving an item between departments on the shopping list corrects the
   * recipe itself, not just this user's personal shopping-list override.
   * Recipes the user doesn't own (public recipes by other people) are
   * left untouched; the ingredient-prefs override above still covers
   * those for shopping-list purposes. */
  async function updateOwnedRecipeDepartments(item: ShoppingItem, targetDepartment: string) {
    const ingredientKey = item.ingredientKey;
    const sourceMealIds = item.sourceMealIds;
    if (!ingredientKey || !sourceMealIds || sourceMealIds.length === 0) return;

    const ownedMeals = sourceMealIds
      .map((id) => meals.find((m) => m.id === id))
      .filter((m): m is Meal => m != null && m.isMine === true);

    for (const meal of ownedMeals) {
      let changed = false;
      const updatedIngredients = meal.ingredients.map((ing) => {
        if (normalizeIngredientKey(ing.name) !== ingredientKey || ing.department === targetDepartment) {
          return ing;
        }
        changed = true;
        return { ...ing, department: targetDepartment };
      });
      if (!changed) continue;

      setMeals((prev) => prev.map((m) => (m.id === meal.id ? { ...m, ingredients: updatedIngredients } : m)));

      try {
        await fetch(`/api/meals/${meal.id}`, {
          method: "PATCH",
          headers: jsonHeaders,
          body: JSON.stringify({
            name: meal.name,
            tags: meal.tags,
            primaryProtein: meal.primaryProtein,
            primaryCarb: meal.primaryCarb,
            minutes: meal.minutes,
            servings: meal.servings,
            visibility: meal.visibility,
            source: meal.source,
            notes: meal.notes,
            nutrition: meal.nutrition,
            ingredients: updatedIngredients,
            instructions: meal.instructions,
            components: meal.components,
            photo: meal.photo ?? null,
          }),
        });
      } catch {
        /* best effort — the personal shopping-list override already stuck either way */
      }
    }
  }

  function handleDragStart(event: DragStartEvent) {
    const item = items.find((i) => i.key === event.active.id);
    setActiveItem(item ?? null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveItem(null);
    const { active, over } = event;
    if (!over) return;

    const draggedItem = items.find((i) => i.key === active.id);
    if (!draggedItem) return;

    const overId = String(over.id);
    const targetDepartment = overId.startsWith(DEPT_PREFIX)
      ? overId.slice(DEPT_PREFIX.length)
      : items.find((i) => i.key === overId)?.effectiveDepartment;
    if (!targetDepartment) return;

    if (targetDepartment === draggedItem.effectiveDepartment) {
      if (!overId.startsWith(DEPT_PREFIX) && overId !== String(active.id)) {
        void reorderWithinDepartment(targetDepartment, String(active.id), overId);
      }
      return;
    }

    void moveItemToDepartment(draggedItem, targetDepartment);
  }

  return (
    <main className="min-h-screen bg-white p-4 text-neutral-900 sm:p-6 print:p-0">
      <div className="print:hidden mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <a href={boardHref} className="text-[13px] text-neutral-500 hover:text-neutral-900">
          ← Back to the board
        </a>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 text-[12px] text-neutral-600">
            <input
              type="checkbox"
              checked={prefs.hideCheckedItems}
              onChange={(e) => setHideChecked(e.target.checked)}
            />
            Hide checked items
          </label>
          <label className="flex items-center gap-1.5 text-[12px] text-neutral-600">
            <input
              type="checkbox"
              checked={prefs.hideCompletedDepartments}
              onChange={(e) => setHideCompletedDepartments(e.target.checked)}
            />
            Hide completed departments
          </label>
          {addingDepartment ? (
            <form onSubmit={handleSubmitNewDepartment} className="flex items-center gap-1">
              <input
                autoFocus
                value={newDepartmentDraft}
                onChange={(e) => setNewDepartmentDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setAddingDepartment(false);
                    setNewDepartmentDraft("");
                  }
                }}
                placeholder="Department name"
                className="rounded border border-neutral-300 px-2 py-1 text-[12px] outline-none focus:border-neutral-500"
              />
              <button type="submit" className="rounded bg-neutral-900 px-2 py-1 text-[11px] font-semibold text-white">
                Add
              </button>
              <button
                type="button"
                onClick={() => {
                  setAddingDepartment(false);
                  setNewDepartmentDraft("");
                }}
                className="text-[11px] text-neutral-500"
              >
                Cancel
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setAddingDepartment(true)}
              className="text-[12px] text-neutral-600 hover:text-neutral-900"
            >
              + Department
            </button>
          )}
          <button
            onClick={() => window.print()}
            className="rounded-md bg-neutral-900 px-4 py-2 text-[13px] font-semibold text-white"
          >
            Print / Save as PDF
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-[13px] text-neutral-500">Loading…</p>
      ) : (
        <>
          <h1 className="text-2xl font-semibold">Shopping List</h1>
          <p className="mb-1 text-[13px] text-neutral-500">{formatWeekRange(weekStart)}</p>

          {carryForwardItems.length > 0 && (
            <div className="print:hidden mb-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900">
              <span>
                {carryForwardItems.length} unchecked item{carryForwardItems.length === 1 ? "" : "s"} from
                last week ({carryForwardWeekLabel}). Add {carryForwardItems.length === 1 ? "it" : "them"} to
                this week's list?
              </span>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={handleCarryForward}
                  disabled={carryForwardBusy}
                  className="rounded bg-amber-600 px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-60"
                >
                  {carryForwardBusy ? "Adding…" : "Add to this week"}
                </button>
                <button
                  type="button"
                  onClick={handleDismissCarryForward}
                  disabled={carryForwardBusy}
                  className="text-[11px] text-amber-800 underline-offset-2 hover:underline"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {items.length > 0 && (
            <p className="print:hidden mb-4 text-[11px] text-neutral-400">
              {checkedCount} of {items.length} checked
            </p>
          )}

          {plannedMealNames.length > 0 && (
            <p className="mb-4 text-[11px] text-neutral-500">
              For: {plannedMealNames.join(", ")}
            </p>
          )}

          {items.length === 0 && departmentGroups.length === 0 ? (
            <p className="text-[13px] text-neutral-500">Nothing planned this week yet.</p>
          ) : departmentGroups.length === 0 ? (
            <p className="text-[13px] text-neutral-500">Everything's checked off. Nice work.</p>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDragCancel={() => setActiveItem(null)}
            >
              <div className="space-y-4">
                {departmentGroups.map((group) => (
                  <DepartmentSection
                    key={group.department}
                    department={group.department}
                    items={group.items}
                    isAdding={quickAddDepartment === group.department}
                    quickAddDraft={quickAddDraft}
                    quickAddError={quickAddDepartment === group.department ? quickAddError : null}
                    onToggle={toggleChecked}
                    onRemoveManual={removeManualItem}
                    onOpenQuickAdd={() => {
                      setQuickAddDepartment(group.department);
                      setQuickAddDraft("");
                      setQuickAddError(null);
                    }}
                    onQuickAddDraftChange={setQuickAddDraft}
                    onSubmitQuickAdd={() => submitQuickAdd(group.department)}
                    onCancelQuickAdd={() => {
                      setQuickAddDepartment(null);
                      setQuickAddDraft("");
                      setQuickAddError(null);
                    }}
                    isEditingName={editingDepartment === group.department}
                    renameDraft={renameDraft}
                    onStartRename={() => {
                      setEditingDepartment(group.department);
                      setRenameDraft(group.department);
                    }}
                    onRenameDraftChange={setRenameDraft}
                    onSubmitRename={() => {
                      void renameDepartment(group.department, renameDraft);
                      setEditingDepartment(null);
                    }}
                    onCancelRename={() => setEditingDepartment(null)}
                  />
                ))}
              </div>

              <DragOverlay>
                {activeItem ? (
                  <div className="flex items-center gap-2 rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-[13px] shadow-lg">
                    {activeItem.display && <span className="font-semibold">{activeItem.display}</span>}{" "}
                    {activeItem.name}
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          )}
        </>
      )}
    </main>
  );
}

export default function PrintShoppingListPage() {
  return (
    <Suspense fallback={null}>
      <PrintShoppingListContent />
    </Suspense>
  );
}
