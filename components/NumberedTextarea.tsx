"use client";

import { useLayoutEffect, useRef } from "react";

interface NumberedTextareaProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minRows?: number;
  className?: string;
}

/** A plain textarea with a step number shown beside each line, so a step that
 * merely wraps onto a second row of the box can be told apart from a new step.
 * The numbers are drawn behind the text by a hidden mirror of it (same font,
 * width and wrapping) — they are never part of the value. Empty lines get no
 * number and don't count. The box grows with its content rather than
 * scrolling, which keeps the mirror lined up. */
export default function NumberedTextarea({
  value,
  onChange,
  placeholder,
  minRows = 7,
  className = "",
}: NumberedTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  function fit() {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`; // +2 for the border
  }

  useLayoutEffect(fit, [value]);

  // the text re-wraps when the box changes width (rotating a phone, say)
  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => fit());
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  let n = 0;
  const lines = value.split("\n").map((text) => (text.trim() ? { text, num: ++n } : { text, num: 0 }));

  return (
    <div ref={wrapRef} className="relative">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words border border-transparent px-3 py-2 text-[13px] leading-relaxed"
      >
        {lines.map((line, i) => (
          <div key={i} className="relative pl-6">
            {line.num > 0 && (
              <span className="absolute left-0 w-5 text-right text-[11px] tabular-nums text-gold/70">
                {line.num}.
              </span>
            )}
            <span className="invisible">{line.text || "​"}</span>
          </div>
        ))}
      </div>
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={minRows}
        className={`relative block w-full resize-none overflow-hidden break-words rounded-md border border-white/10 bg-transparent py-2 pl-9 pr-3 text-[13px] leading-relaxed text-chalk outline-none focus:border-gold/60 ${className}`}
      />
    </div>
  );
}
