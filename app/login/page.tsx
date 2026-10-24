"use client";

import { Suspense, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await signIn("credentials", {
      email,
      password,
      remember: remember ? "true" : "false",
      redirect: false,
    });

    setLoading(false);
    if (res?.error) {
      setError("Incorrect email or password.");
      return;
    }
    router.push(callbackUrl);
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-board p-4">
      <div className="w-full max-w-sm rounded-xl bg-paper p-6 text-ink shadow-card">
        <p className="text-[11px] uppercase tracking-[0.2em] text-ink/50">
          Welcome back
        </p>
        <h1 className="mb-5 font-display text-4xl leading-none">
          The Menu Board
        </h1>

        <div className="space-y-2">
          <button
            type="button"
            onClick={() => signIn("google", { callbackUrl })}
            className="flex w-full items-center justify-center gap-2 rounded-md border border-ink/15 py-2 text-sm font-medium transition-colors hover:bg-ink/5"
          >
            Continue with Google
          </button>
          <button
            type="button"
            onClick={() => signIn("facebook", { callbackUrl })}
            className="flex w-full items-center justify-center gap-2 rounded-md border border-ink/15 py-2 text-sm font-medium transition-colors hover:bg-ink/5"
          >
            Continue with Facebook
          </button>
        </div>

        <div className="my-4 flex items-center gap-2 text-[11px] text-ink/40">
          <div className="h-px flex-1 bg-ink/10" />
          or
          <div className="h-px flex-1 bg-ink/10" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="email"
            required
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-ink/15 px-3 py-2 text-sm outline-none focus:border-gold"
          />
          <input
            type="password"
            required
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-ink/15 px-3 py-2 text-sm outline-none focus:border-gold"
          />
          <label className="flex items-center gap-2 text-[12px] text-ink/70">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            Stay logged in
          </label>

          {error && <p className="text-[12px] text-tomato">{error}</p>}

          <button
            disabled={loading}
            type="submit"
            className="w-full rounded-md bg-tomato py-2 text-sm font-semibold text-paper transition-opacity disabled:opacity-60"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="mt-4 text-center text-[12px] text-ink/60">
          No account?{" "}
          <Link href="/register" className="font-semibold text-tomato">
            Create one
          </Link>
        </p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
