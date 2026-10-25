"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// The one interactive piece of the (otherwise server-rendered) recipe page.
export default function DeleteMealButton({ mealId, mealName }: { mealId: string; mealName: string }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!confirm(`Delete "${mealName}"? This also removes it from everyone's planned history.`)) {
      return;
    }
    setDeleting(true);
    const res = await fetch(`/api/meals/${mealId}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/meals");
    } else {
      setDeleting(false);
      alert("Couldn't delete this meal — please try again.");
    }
  }

  return (
    <button
      onClick={handleDelete}
      disabled={deleting}
      className="text-[11px] text-sage/90 transition-colors hover:text-tomato disabled:opacity-60"
    >
      {deleting ? "Deleting…" : "Delete"}
    </button>
  );
}
