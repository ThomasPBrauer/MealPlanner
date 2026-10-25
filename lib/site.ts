import { headers } from "next/headers";

/** The site's public origin (no trailing slash), for the absolute URLs that
 * structured data and link previews need. Prefers the configured
 * NEXTAUTH_URL / NEXT_PUBLIC_SITE_URL, else works it out from the request. */
export function getSiteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXTAUTH_URL;
  if (configured) return configured.replace(/\/+$/, "");

  const h = headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
