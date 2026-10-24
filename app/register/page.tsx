"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });
    const data = await res.json();

    if (!res.ok) {
      setError(data.error || "Something went wrong.");
      setLoading(false);
      return;
    }

    const signInRes = await signIn("credentials", {
      email,
      password,
      remember: "true",
      redirect: false,
    });

    setLoading(false);
    if (signInRes?.error) {
      router.push("/login");
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-board p-4">
      <div className="w-full max-w-sm rounded-xl bg-paper p-6 text-ink shadow-card">
        <p className="text-[11px] uppercase tracking-[0.2em] text-ink/50">
          Get started
        </p>
        <h1 className="mb-5 font-display text-4xl leading-none">
          Create your account
        </h1>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-ink/15 px-3 py-2 text-sm outline-none focus:border-gold"
          />
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
            minLength={8}
            placeholder="Password (min 8 characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-ink/15 px-3 py-2 text-sm outline-none focus:border-gold"
          />

          {error && <p className="text-[12px] text-tomato">{error}</p>}

          <button
            disabled={loading}
            type="submit"
            className="w-full rounded-md bg-tomato py-2 text-sm font-semibold text-paper transition-opacity disabled:opacity-60"
          >
            {loading ? "Creating account…" : "Create account"}
          </button>
        </form>

        <p className="mt-4 text-center text-[12px] text-ink/60">
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-tomato">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
