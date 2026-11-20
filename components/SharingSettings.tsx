"use client";

import { useCallback, useEffect, useState } from "react";
import { DISPLAY_NAME_MAX } from "@/lib/displayName";

interface BoardsInfo {
  me: { id: string; displayName: string };
  boards: { id: string; label: string; isOwn: boolean }[];
  activeId: string;
  members: { email: string; name: string }[];
  invite: { token: string; expiresAt: string } | null;
}

const card = "rounded-lg border border-white/10 bg-board-panel/50 p-4";
const smallBtn =
  "rounded-md border border-white/15 px-2.5 py-1.5 text-[11.5px] text-sage/90 transition-colors hover:border-gold/60 hover:text-gold disabled:opacity-50";

/** Settings: the public display name, and sharing your board with family. */
export default function SharingSettings() {
  const [info, setInfo] = useState<BoardsInfo | null>(null);
  const [name, setName] = useState("");
  const [nameMsg, setNameMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [savingName, setSavingName] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/boards");
    if (!res.ok) return;
    const data: BoardsInfo = await res.json();
    setInfo(data);
    setName(data.me.displayName);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveName() {
    setSavingName(true);
    setNameMsg(null);
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: name }),
    });
    const data = await res.json().catch(() => ({}));
    setSavingName(false);
    if (!res.ok) return setNameMsg({ ok: false, text: data.error ?? "Couldn't save that name." });
    setName(data.displayName);
    setNameMsg({ ok: true, text: data.displayName ? "Saved ✓" : "Name cleared." });
  }

  async function act(fn: () => Promise<Response>) {
    setBusy(true);
    try {
      await fn();
      await load();
    } finally {
      setBusy(false);
    }
  }

  const inviteUrl = info?.invite ? `${window.location.origin}/join/${info.invite.token}` : null;

  async function copyInvite() {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this invite link:", inviteUrl);
    }
  }

  const others = info?.boards.filter((b) => !b.isOwn) ?? [];

  return (
    <div className="mt-8 space-y-4">
      <fieldset className={card}>
        <legend className="px-1 text-[12px] font-semibold uppercase tracking-wide text-sage">Display name</legend>
        <p className="mb-2 text-[12px] text-sage/80">
          Shown as the contributor on your public recipes in the recipe book. It has to be unique — no two people can
          share a name. Leave it blank and your recipes are credited to &ldquo;A home cook&rdquo;. Your email is never
          shown.
        </p>
        <div className="flex gap-2">
          <input
            value={name}
            maxLength={DISPLAY_NAME_MAX}
            onChange={(e) => {
              setName(e.target.value);
              setNameMsg(null);
            }}
            placeholder="e.g. Grandma Jo"
            className="min-w-0 flex-1 rounded-md border border-white/10 bg-board-panel px-3 py-2 text-[13px] text-chalk outline-none focus:border-gold/60"
          />
          <button type="button" onClick={saveName} disabled={savingName || !info} className="rounded-md bg-gold px-3 text-[12px] font-semibold text-ink disabled:opacity-50">
            {savingName ? "Saving…" : "Save name"}
          </button>
        </div>
        {nameMsg && <p className={`mt-1.5 text-[11.5px] ${nameMsg.ok ? "text-sage" : "text-tomato"}`}>{nameMsg.text}</p>}
      </fieldset>

      <fieldset className={card}>
        <legend className="px-1 text-[12px] font-semibold uppercase tracking-wide text-sage">Share your board</legend>
        <p className="mb-3 text-[12px] text-sage/80">
          Invite family or friends to plan together. Anyone who joins sees and edits your calendar, notes and shopping
          list. They keep their own recipes, theme and shopping-department choices, and can switch between boards from the
          board page.
        </p>

        {inviteUrl ? (
          <div className="space-y-2">
            <input
              readOnly
              value={inviteUrl}
              onFocus={(e) => e.currentTarget.select()}
              className="w-full rounded-md border border-white/10 bg-board-panel px-3 py-2 text-[12px] text-chalk"
            />
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={copyInvite} className="rounded-md bg-gold px-3 py-1.5 text-[12px] font-semibold text-ink">
                {copied ? "Copied ✓" : "Copy link"}
              </button>
              <button type="button" disabled={busy} onClick={() => act(() => fetch("/api/boards/invite", { method: "POST" }))} className={smallBtn}>
                New link
              </button>
              <button type="button" disabled={busy} onClick={() => act(() => fetch("/api/boards/invite", { method: "DELETE" }))} className={smallBtn}>
                Turn off
              </button>
            </div>
            <p className="text-[11px] text-sage/60">
              Anyone with this link who signs in can join, until {new Date(info!.invite!.expiresAt).toLocaleDateString()}.
              Only share it with people you trust.
            </p>
          </div>
        ) : (
          <button type="button" disabled={busy || !info} onClick={() => act(() => fetch("/api/boards/invite", { method: "POST" }))} className="rounded-md bg-gold px-3 py-1.5 text-[12px] font-semibold text-ink disabled:opacity-50">
            Create an invite link
          </button>
        )}

        <h3 className="mb-1.5 mt-5 text-[11px] font-semibold uppercase tracking-wide text-sage/80">On your board</h3>
        {info && info.members.length === 0 ? (
          <p className="text-[12px] text-sage/60">Nobody yet.</p>
        ) : (
          <ul className="divide-y divide-white/10">
            {info?.members.map((m) => (
              <li key={m.email} className="flex items-center justify-between gap-2 py-1.5 text-[13px] text-chalk">
                <span className="truncate">{m.name}</span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    if (confirm(`Remove ${m.name} from your board?`)) {
                      void act(() => fetch(`/api/boards/members?email=${encodeURIComponent(m.email)}`, { method: "DELETE" }));
                    }
                  }}
                  className="text-[11.5px] text-tomato hover:underline disabled:opacity-50"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </fieldset>

      {others.length > 0 && (
        <fieldset className={card}>
          <legend className="px-1 text-[12px] font-semibold uppercase tracking-wide text-sage">Boards you&apos;ve joined</legend>
          <ul className="divide-y divide-white/10">
            {others.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-2 py-1.5 text-[13px] text-chalk">
                <span className="truncate">{b.label}</span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    if (confirm(`Leave ${b.label}?`)) {
                      void act(() => fetch(`/api/boards/members?board=${encodeURIComponent(b.id)}`, { method: "DELETE" }));
                    }
                  }}
                  className="text-[11.5px] text-tomato hover:underline disabled:opacity-50"
                >
                  Leave
                </button>
              </li>
            ))}
          </ul>
        </fieldset>
      )}
    </div>
  );
}
