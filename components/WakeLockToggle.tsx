"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const STORAGE_KEY = "mealplanner:keepScreenOn";

// minimal typing — the Screen Wake Lock API isn't in every TS lib version
interface WakeLockSentinelLike {
  release: () => Promise<void>;
  addEventListener: (type: "release", listener: () => void) => void;
}

/** "Keep screen on" switch for the recipe page, so the phone doesn't dim and
 * lock mid-recipe. Uses the Screen Wake Lock API; renders nothing where the
 * browser doesn't support it. The choice is remembered on this device, and
 * the lock is re-acquired when you come back to the tab (browsers drop it
 * whenever the page is hidden). */
export default function WakeLockToggle() {
  const [supported, setSupported] = useState(false);
  const [wanted, setWanted] = useState(false);
  const [active, setActive] = useState(false);
  const [failed, setFailed] = useState(false);
  const sentinel = useRef<WakeLockSentinelLike | null>(null);

  const acquire = useCallback(async () => {
    try {
      const wl = (navigator as unknown as {
        wakeLock: { request: (type: "screen") => Promise<WakeLockSentinelLike> };
      }).wakeLock;
      const lock = await wl.request("screen");
      sentinel.current = lock;
      lock.addEventListener("release", () => {
        if (sentinel.current === lock) sentinel.current = null;
        setActive(false);
      });
      setActive(true);
      setFailed(false);
    } catch {
      // denied (battery saver, no user gesture yet, hidden tab…)
      setActive(false);
      setFailed(true);
    }
  }, []);

  const release = useCallback(async () => {
    const lock = sentinel.current;
    sentinel.current = null;
    setActive(false);
    try {
      await lock?.release();
    } catch {
      /* already released */
    }
  }, []);

  // detect support + restore the saved choice
  useEffect(() => {
    if (!("wakeLock" in navigator)) return;
    setSupported(true);
    try {
      if (localStorage.getItem(STORAGE_KEY) === "1") setWanted(true);
    } catch {
      /* storage unavailable */
    }
  }, []);

  // hold the lock while wanted; take it back after the tab returns to view
  useEffect(() => {
    if (!supported || !wanted) return;
    void acquire();
    function onVisible() {
      if (document.visibilityState === "visible" && !sentinel.current) void acquire();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      void release();
    };
  }, [supported, wanted, acquire, release]);

  function toggle() {
    const next = !wanted;
    setWanted(next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    } catch {
      /* storage unavailable */
    }
  }

  if (!supported) return null;

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={wanted}
      title={
        failed && wanted
          ? "Couldn't keep the screen on — tap to try again"
          : "Stop the screen from dimming or locking while you cook"
      }
      className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10.5px] transition-colors ${
        wanted && active
          ? "border-gold text-gold"
          : wanted && failed
          ? "border-tomato/60 text-tomato"
          : "border-white/10 text-sage/80 hover:border-gold/60 hover:text-gold"
      }`}
    >
      <span
        aria-hidden
        className={`inline-block h-1.5 w-1.5 rounded-full ${wanted && active ? "bg-gold" : "bg-sage/40"}`}
      />
      {wanted && active ? "Screen stays on" : wanted && failed ? "Screen lock failed" : "Keep screen on"}
    </button>
  );
}
