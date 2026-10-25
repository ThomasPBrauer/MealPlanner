import { withAuth } from "next-auth/middleware";

// Public recipes are viewable without an account: the recipe list, an
// individual recipe page, and the read-only APIs behind them. Everything
// else — the board, shopping list, creating/editing, and every non-GET
// request — still requires a session.
//
// This only opens the *route*. The API handlers themselves are what limit
// an anonymous request to public recipes (personal recipes still 404 for
// anyone but their owner).
function isPublicRecipeRead(pathname: string, method: string): boolean {
  if (method !== "GET" && method !== "HEAD") return false;

  // browse list + its API
  if (pathname === "/meals" || pathname === "/api/meals") return true;

  // /meals/<id> — but not /meals/new (and /meals/<id>/edit has an extra
  // segment, so it never matches)
  const page = pathname.match(/^\/meals\/([^/]+)$/);
  if (page) return page[1] !== "new";

  // /api/meals/<id> and /api/meals/<id>/history — but not the POST-only
  // import endpoints that happen to live under the same prefix
  const api = pathname.match(/^\/api\/meals\/([^/]+)(\/history)?$/);
  if (api) return api[1] !== "import" && api[1] !== "openfoodfacts";

  return false;
}

export default withAuth({
  callbacks: {
    authorized: ({ req, token }) => !!token || isPublicRecipeRead(req.nextUrl.pathname, req.method),
  },
});

export const config = {
  matcher: [
    "/((?!api/auth|api/register|login|register|_next/static|_next/image|favicon.ico).*)",
  ],
};
