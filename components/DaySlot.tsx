"use client";

import { useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { MealType, NutritionKey, PlacedMeal } from "@/lib/types";
import DraggableMealCard from "./DraggableMealCard";

export interface DragPayload {
  source: "pantry" | "board";
  meal: PlacedMeal;
  fromSlot?: string;
}

interface DaySlotProps {
  slotId: string;
  date: string;
  mealType: MealType;
  meals: PlacedMeal[];
  note: string;
  weekIso?: string;
  visibleNutrients?: NutritionKey[];
  onRemoveMeal: (instanceId: string) => void;
  onNoteChange: (note: string) => void;
}

export default function DaySlot({
  slotId,
  date,
  mealType,
  meals,
  note,
  weekIso,
  visibleNutrients,
  onRemoveMeal,
  onNoteChange,
}: DaySlotProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note);

  // the droppable's `data` carries the target {date, mealType} straight
  // through to the top-level onDragEnd handler — no need to parse it back
  // out of the slot id string
  const { setNodeRef, isOver } = useDroppable({
    id: slotId,
    data: { date, mealType },
  });

  function startEditing() {
    setDraft(note);
    setEditing(true);
  }

  function commit() {
    setEditing(false);
    if (draft.trim() !== note.trim()) onNoteChange(draft.trim());
  }

  function cancel() {
    setDraft(note);
    setEditing(false);
  }

  return (
    <div
      ref={setNodeRef}
      className={`group/slot flex max-h-[220px] min-h-[92px] flex-col gap-1.5 overflow-y-auto rounded-md border border-white/5 bg-board-rail/40 p-1.5 transition-colors ${
        isOver ? "chalk-drop-target" : ""
      }`}
    >
      {editing ? (
        <div className="flex items-center gap-1">
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") cancel();
            }}
            onBlur={commit}
            placeholder="Add a note…"
            className="w-full rounded border border-gold/40 bg-board-panel px-1.5 py-1 text-[10.5px] text-chalk outline-none"
          />
        </div>
      ) : note ? (
        <button
          type="button"
          onClick={startEditing}
          className="rounded border-l-2 border-gold bg-gold/10 px-1.5 py-1 text-left text-[10.5px] leading-snug text-gold/90 transition-colors hover:bg-gold/15"
        >
          {note}
        </button>
      ) : (
        <button
          type="button"
          onClick={startEditing}
          className="self-start rounded px-1 text-[10px] text-sage/0 transition-colors group-hover/slot:text-sage/60 hover:!text-gold"
        >
          + note
        </button>
      )}

      {meals.length === 0 && (
        <div className="flex flex-1 items-center justify-center rounded border border-dashed border-white/10 py-3 text-center text-[11px] leading-tight text-sage/70">
          drag a meal here
        </div>
      )}
      {meals.map((meal) => (
        <DraggableMealCard
          key={meal.instanceId}
          dragId={`placed:${meal.instanceId}`}
          payload={{ source: "board", meal, fromSlot: slotId }}
          meal={meal}
          variant="placed"
          weekIso={weekIso}
          visibleNutrients={visibleNutrients}
          onRemove={() => onRemoveMeal(meal.instanceId)}
        />
      ))}
    </div>
  );
}
