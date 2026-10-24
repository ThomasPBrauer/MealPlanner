import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { mapRawOffProduct, OFF_USER_AGENT, OffSearchResult } from "@/lib/openfoodfacts";

const MAX_RESULTS = 15;

// Open Food Facts' legacy full-text search (/cgi/search.pl, and the
// /api/v2/search endpoint some docs point to instead) is deprecated for
// new integrations — the v2 endpoint actually ignores free-text terms
// entirely, and cgi/search.pl is flaky. Search-a-licious is OFF's current
// dedicated full-text search service (same underlying product data,
// Elasticsearch-backed) and is what they now recommend instead. Barcode
// lookups (used elsewhere, for the actual import) are unaffected by any
// of this and still go through /api/v2/product/[code].
const SEARCH_URL = "https://search.openfoodfacts.org/search";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (!q) {
    return NextResponse.json({ results: [] });
  }

  const url = new URL(SEARCH_URL);
  url.searchParams.set("q", q);
  url.searchParams.set("page_size", String(MAX_RESULTS));
  // keep the payload light — we only use these fields either way
  url.searchParams.set(
    "fields",
    "code,product_name,brands,image_front_url,image_url,image_small_url,categories,nutriments"
  );

  let data: unknown;
  try {
    const res = await fetch(url.toString(), {
      headers: { "User-Agent": OFF_USER_AGENT },
      // this is reference data, not something we need every millisecond of freshness for
      next: { revalidate: 60 },
    });
    if (!res.ok) throw new Error(`Open Food Facts returned ${res.status}`);
    data = await res.json();
  } catch (err) {
    console.error("Open Food Facts search failed:", err);
    return NextResponse.json({ error: "Open Food Facts search failed. Try again in a moment." }, { status: 502 });
  }

  // Search-a-licious returns results under `hits` (an Elasticsearch-style
  // response), not `products` — each hit has the same field shape as a
  // regular OFF product document, since it's the same underlying data.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawHits: unknown[] = Array.isArray((data as any)?.hits) ? (data as any).hits : [];
  const results: OffSearchResult[] = rawHits
    .map((p) => mapRawOffProduct(p))
    .filter((p): p is OffSearchResult => p !== null)
    .slice(0, MAX_RESULTS);

  return NextResponse.json({ results });
}
