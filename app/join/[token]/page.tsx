"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";

/** Where an invite link lands. Signed-out visitors are sent to sign in (or
 * register) first and come straight back here. */
export default function JoinPage() {
  const { token } = useParams<{ token: string }>();
  const { status } = useSession();
  const [owner, setOwner] = useState<{ name: string; isOwn: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  const back = encodeURIComponent(`/join/${token}`);

  useEffect(() => {
    if (status !== "authenticated") return;
    fetch(`/api/boards/join?token=${encodeURIComponent(token)}`)
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error ?? "This invite link isn't valid.");
        setOwner({ name: data.ownerName, isOwn: data.isOwn });
      })
      .catch((e: Error) => setError(e.message));
  }, [status, token]);

  async function join() {
    setJoining(true);
    setError(null);
    const res = await fetch("/api/boards/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Couldn't join that board.");
      setJoining(false);
      return;
    }
    window.location.href = "/"; // a full load, so the board comes up on the new cookie
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-board p-4">
      <div className="w-full max-w-sm rounded-xl bg-paper p-6 text-ink shadow-card">
        <p className="text-[11px] uppercase tracking-[0.2em] text-ink/50">You&apos;re invited</p>
        <h1 className="mb-4 font-display text-4xl leading-none">Join a board</h1>

        {status === "loading" ? (
          <p className="text-sm text-ink/60">One moment…</p>
        ) : status === "unauthenticated" ? (
          <>
            <p className="mb-4 text-sm text-ink/70">Sign in or create an account to join this meal board.</p>
            <div className="flex gap-2">
              <Link href={`/login?callbackUrl=${back}`} className="flex-1 rounded-md bg-tomato py-2 text-center text-sm font-semibold text-paper">
                Sign in
              </Link>
              <Link href={`/register?callbackUrl=${back}`} className="flex-1 rounded-md border border-ink/20 py-2 text-center text-sm font-semibold">
                Create account
              </Link>
            </div>
          </>
        ) : error ? (
          <>
            <p className="mb-4 text-sm text-tomato">{error}</p>
            <Link href="/" className="text-sm font-semibold text-tomato">
              Go to your board
            </Link>
          </>
        ) : owner ? (
          owner.isOwn ? (
            <>
              <p className="mb-4 text-sm text-ink/70">This is your own invite link — send it to someone else.</p>
              <Link href="/" className="text-sm font-semibold text-tomato">
                Back to your board
              </Link>
            </>
          ) : (
            <>
              <p className="mb-4 text-sm text-ink/70">
                <strong>{owner.name}</strong> invited you to plan meals together. You&apos;ll share their calendar, day
                notes and shopping list, and keep your own recipes and settings.
              </p>
              <button type="button" onClick={join} disabled={joining} className="w-full rounded-md bg-tomato py-2 text-sm font-semibold text-paper disabled:opacity-60">
                {joining ? "Joining…" : `Join ${owner.name}'s board`}
              </button>
            </>
          )
        ) : (
          <p className="text-sm text-ink/60">Checking the invite…</p>
        )}
      </div>
    </main>
  );
}
