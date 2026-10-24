"use client";

import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Meal, NutritionKey, PlacedMeal } from "@/lib/types";
import MealCard from "./MealCard";
import { DragPayload } from "./DaySlot";

interface DraggableMealCardProps {
  dragId: string; // unique across the whole board+pantry — see callers for the id scheme
  payload: DragPayload; // carried as this draggable's dnd-kit `data`, read back in onDragEnd
  meal: Meal | PlacedMeal;
  variant: "pantry" | "placed";
  weekIso?: string;
  visibleNutrients?: NutritionKey[];
  onRemove?: () => void;
}

/** Wraps MealCard with dnd-kit's useDraggable so the card itself stays a
 * plain presentational component. The original card dims while dragging;
 * WeekCalendar/page.tsx renders a DragOverlay for the floating copy. */
export default function DraggableMealCard({
  dragId,
  payload,
  meal,
  variant,
  weekIso,
  visibleNutrients,
  onRemove,
}: DraggableMealCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: dragId,
    data: payload,
  });

  return (
    <div
      ref={setNodeRef}
      style={transform ? { transform: CSS.Translate.toString(transform) } : undefined}
      {...listeners}
      {...attributes}
      className={isDragging ? "opacity-30" : ""}
    >
      <MealCard
        meal={meal}
        variant={variant}
        weekIso={weekIso}
        visibleNutrients={visibleNutrients}
        onRemove={onRemove}
      />
    </div>
  );
}
