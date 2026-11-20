"use client";

import { useEffect, useState } from "react";

interface BoardsInfo {
  boards: { id: string; label: string; isOwn: boolean }[];
  activeId: string;
}

/** A small "which board am I on" picker. Only appears once you've joined
 * someone else's board — until then there's nothing to choose between. */
export default function BoardSwitcher({ onSwitched }: { onSwitched: () => void }) {
  const [info, setInfo] = useState<BoardsInfo | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/boards")
      .then((r) => (r.ok ? r.json() : null))
      .then(setInfo)
      .catch(() => {});
  }, []);

  if (!info || info.boards.length < 2) return null;

  async function choose(id: string) {
    setBusy(true);
    await fetch("/api/boards/active", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ boardId: id }),
    });
    onSwitched();
  }

  return (
    <label className="flex items-center gap-1.5 text-[11px] text-sage/90">
      <span className="hidden sm:inline">Board</span>
      <select
        value={info.activeId}
        disabled={busy}
        onChange={(e) => choose(e.target.value)}
        className="max-w-[10rem] rounded border border-white/15 bg-board-panel px-1.5 py-1 text-[11px] text-chalk outline-none focus:border-gold/60"
      >
        {info.boards.map((b) => (
          <option key={b.id} value={b.id}>
            {b.label}
          </option>
        ))}
      </select>
    </label>
  );
}
