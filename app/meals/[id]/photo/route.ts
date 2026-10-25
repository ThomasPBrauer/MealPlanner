import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getVisibleMeal } from "@/lib/meals";

// Serves a recipe's uploaded photo as a real image. Photos are stored as
// base64 data URLs, which can't be used as an image address by search
// engines or link previews (the page's structured data points here).
//
// Only these formats are served. A data URL could claim to be anything
// ("image/svg+xml" can carry script), and this is the app's own origin, so
// anything else is treated as not found.
const SERVABLE = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email ?? undefined;
  // same visibility rule as the page: a personal recipe's photo is the owner's alone
  const meal = await getVisibleMeal(params.id, email);
  if (!meal?.photo) return new Response("Not found", { status: 404 });

  const match = meal.photo.match(/^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/i);
  if (!match || !SERVABLE.has(match[1].toLowerCase())) {
    return new Response("Not found", { status: 404 });
  }

  const bytes = Buffer.from(match[2], "base64");
  return new Response(bytes, {
    headers: {
      "Content-Type": match[1].toLowerCase(),
      "Content-Length": String(bytes.length),
      "Cache-Control": meal.visibility === "public" ? "public, max-age=300" : "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
