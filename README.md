# The Menu Board — Meal Planner

A two-pane Next.js meal planner. Left: a weekly chalkboard grid split into
Breakfast / Lunch / Dinner rows across seven days. Right: a "Pantry" of
recipe cards you drag onto the board.

## Getting started

1. **Install dependencies**
   ```bash
   npm install
   ```
   This also runs `prisma generate` automatically.

2. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```
   Then edit `.env`:
   - `NEXTAUTH_SECRET` — generate one with `openssl rand -base64 32`
   - `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — from
     https://console.cloud.google.com/apis/credentials (OAuth client, web
     application). Add `http://localhost:3000/api/auth/callback/google` as
     an authorized redirect URI.
   - `FACEBOOK_CLIENT_ID` / `FACEBOOK_CLIENT_SECRET` — from
     https://developers.facebook.com/apps (Facebook Login product). Add
     `http://localhost:3000/api/auth/callback/facebook` as a valid OAuth
     redirect URI.

   Email/password login works without any of the OAuth values — only the
   "Continue with Google/Facebook" buttons need those.

3. **Point Prisma at your HostGator MySQL database**
   ```bash
   npm run db:push
   ```
   This creates the `User` table in your `djbrauer_menu_board` database
   using the `DATABASE_URL` from `.env`.

   A couple of HostGator-specific things to check first:
   - **Remote MySQL access**: by default HostGator only allows
     connections to MySQL from `localhost`. If you're running this app
     anywhere other than on that same HostGator server, go to cPanel →
     **Remote MySQL** and add the IP address of the machine/host running
     the app (or `%` to allow any IP, which is easiest for local
     development but less secure — tighten it once you know your
     production host's IP).
   - **Full database/user names**: HostGator prefixes both the database
     name and MySQL username with your cPanel username, e.g.
     `cpaneluser_djbrauer_menu_board` and `cpaneluser_dbuser`. Check
     cPanel → **MySQL Databases** for the exact names, and make sure the
     MySQL user has been added to the database with **All Privileges**.
   - HostGator's shared MySQL usually runs on port `3306` over plain TCP
     (no SSL needed for the connection string above). If your host
     enforces SSL, append `?sslmode=require` to `DATABASE_URL`.

4. **Run it**
   ```bash
   npm run dev
   ```

Open http://localhost:3000 — you'll be redirected to `/login`. Use
"Create one" to register a new email/password account, or sign in with
Google/Facebook once those are configured.

## Authentication notes

- Every route except `/login`, `/register`, and the NextAuth/registration
  API routes requires a signed-in session (enforced in `middleware.ts`).
- **"Stay logged in"** controls session length for email/password
  sign-ins: checked issues a 30-day session, unchecked issues a ~1-day
  session. (Google/Facebook sign-ins always get a 30-day session — there's
  no remember-me prompt on the OAuth flows themselves.)
- Passwords are hashed with bcrypt before being stored; the plaintext
  password is never saved.
- Google and Facebook sign-ins aren't currently linked to a `User` row in
  the database — they just create a session from the OAuth profile. If you
  want to persist OAuth users too (e.g. to store per-user data), add
  NextAuth's `PrismaAdapter` and a few extra Prisma models
  (`Account`, `Session`, `VerificationToken`) — see
  https://authjs.dev/reference/adapter/prisma.
- **The weekly meal plan itself is still only stored in React state** —
  it resets on page reload and isn't tied to a specific user yet. A
  natural next step is a `Plan` table in Prisma keyed by user id, with API
  routes to load/save it, replacing the local `useState` in `app/page.tsx`.

## How it works

- **Drag a card from the Pantry onto any day/meal cell** to plan it. The same
  recipe can be dragged onto multiple slots (e.g. leftovers on Tuesday and
  Friday).
- **Drag a planned card between cells** to move it.
- **Drag a planned card back onto the Pantry panel**, or click the small ✕
  that appears on hover, to remove it from the plan.
- Use the search box and tag chips in the Pantry to filter recipes.
- "Clear week" resets the whole board.

## Deploying

Since you're already using a hosted MySQL database, most of the "switch
away from SQLite" work is done. When you deploy:

- Point `NEXTAUTH_URL` at your production domain.
- Make sure your production host's outbound IP is allowed in HostGator's
  Remote MySQL settings (see above) — this is the most common thing that
  breaks after deploying, since a new host means a new IP to whitelist.
- Update the Google/Facebook OAuth redirect URIs (in their respective
  developer consoles) to use your production domain instead of
  `localhost`.
- Note that Next.js itself needs a Node.js host (e.g. a VPS, Railway,
  Render, Vercel) — HostGator's typical shared hosting is built for PHP
  apps, not Node/Next.js servers, so you'll likely run the app elsewhere
  and just point it at the HostGator database over the internet as
  configured above.

## Servings and importing recipes from a URL

Meals now have a **servings** field (defaults to 4), shown alongside prep
time wherever a meal's basics are listed. Nutrition is still per-serving,
same as before — servings is informational for now, not used to
auto-scale ingredient amounts (see "Extending it" below for that idea).

The "New Meal" form has an **Import from a URL** box at the top. Paste a
public recipe URL and it prefills name, prep time, servings, source,
nutrition, ingredients, and instructions — review and correct before
saving, since extraction is best-effort.

**How it actually works:** most recipe sites embed a block of
machine-readable data (Schema.org `Recipe`, as JSON-LD) in every recipe
page, because Google requires it to show star ratings and cook times in
search results. `lib/importRecipe.ts` fetches the page server-side and
reads that block directly — the same technique third-party "clean recipe"
tools use, just built in rather than depending on an external service. A
`recipestripper.com`-style `?url=` proxy was tried first, but it turned
out to be a client-rendered page with no public API to call from a
server, so this app talks to the original recipe URL itself instead —
more reliable, and nothing else needs to be running or stay online.

What it handles:
- Recipe name, total/cook time, and servings (`recipeYield`)
- Ingredients — split into amount/unit/name with a best-effort parser
  (handles plain numbers, fractions like "1/2", mixed numbers like
  "1 1/2", and unicode fraction characters like "½")
- Instructions — plain string, array of strings, `HowToStep` objects, or
  `HowToSection` groupings (flattened in order)
- Nutrition — calories, protein, carbs, fiber, fat, sugar, sodium

What it doesn't handle: Microdata-only markup, sites with no structured
recipe data at all, and sites with bot protection that blocks server-side
requests. In any of those cases the form just comes back empty with a
clear error — fill it in by hand. A few basic safety checks are built in
too: only `http(s)` URLs are fetched, private/internal IP ranges are
blocked, and requests are made only after you're signed in and time out
after 15 seconds.

Run `npm run db:push` again after pulling this update — it adds the new
`servings` column to `Meal`.

## Meals

Meals now live in the database instead of a hardcoded list — visit
**Pantry → Manage** (or go straight to `/meals`) to browse, search, and
create them. Each meal has:

- **Owner** — whoever created it; only they can edit or delete it
  (enforced server-side in the `/api/meals/[id]` route, not just hidden
  in the UI)
- **Visibility** — `public` (anyone can see it and plan it) or `personal`
  (only the owner can see or plan it). The `/api/meals` list endpoint only
  ever returns public meals plus your own personal ones — someone else's
  personal meal is never sent to your browser at all, not just hidden by
  CSS. The `/api/plan` endpoint that actually schedules a meal
  re-checks this server-side too, so a personal meal can't be planned by
  guessing its id.
- **Name, tag, prep time, primary protein, primary carbohydrate** — the
  protein/carb fields are a fixed dropdown (Beef, Chicken, Tofu, etc. /
  Pasta, Rice, Tortillas, etc.) so they stay filterable later; tags are
  free text with autocomplete suggestions.
- **Nutrition** — calories, protein, carbs, fiber, net carbs, fat, sugar,
  sodium, styled like a packaged-food label on the meal's detail page.
  Net carbs auto-fills as carbs minus fiber if you leave it blank.
- **Recipe** — a free-form ingredient list (amount + unit + name) and
  step-by-step instructions.
- **History** — every time a meal gets planned, that's already recorded
  in the `PlannedMeal` table used for the calendar, so no separate
  tracking was needed. The meal's detail page surfaces it: the **owner**
  sees a per-user breakdown of who's planned it and when; everyone else
  only sees their *own* history with that meal, not other people's.

Deleting a meal also deletes every `PlannedMeal` row that referenced it
(across all users), so it cleanly disappears from past and future weeks
rather than leaving broken references behind.

Run `npm run db:push` again after pulling this update — it adds the new
`Meal` table and changes what `PlannedMeal.mealId` points to.

## Recipe notes, sources, and composition

Each meal now also has:

- **Source** — a cookbook, URL, or person it came from. Shown as a
  clickable link on the meal's detail page if it looks like a URL.
- **Notes** — your own free-text comments ("double the garlic next time").
- **Components** — other recipes this one is built from (e.g. a "Meatball
  Pizza" built from separately-owned Meatballs, Pizza Crust, and Marinara
  Sauce recipes). Pick them in the meal form, in the order you want their
  instructions to run in.

Composition is **live, not copied**: a recipe references its components by
id, so editing "Marinara Sauce" updates every recipe built from it
automatically. `lib/recipe.ts` has the resolution logic
(`resolveIngredients`, `resolveInstructionGroups`) — the meal detail page,
the shopping list, and the printable weekly menu all use it, so a composed
recipe's full ingredient list and step-by-step instructions (sub-recipes
first, in the order you picked, with this recipe's own additional steps
last) show up wherever they're needed.

A few guardrails, enforced server-side in `/api/meals/[id]`:
- You can only include recipes you can already see (your own, or public
  ones) — checked again on save, not just filtered in the UI.
- A recipe can't (directly or indirectly) include itself — saving a
  circular reference is rejected with an error.
- Deleting a recipe strips it from every other recipe's component list
  too, so nothing is left silently pointing at a deleted sub-recipe.

## Slot notes

Click "+ note" on any day/meal cell to leave a note on that specific slot
— "Thaw shrimp for Saturday", "Date Night" — independent of whatever
meal (if any) is planned there. Notes save the same way meals do
(optimistic update, synced to the `SlotNote` table, resynced from the
server if a save fails) and show up on the printable weekly menu too.

## Printing

Two buttons in the calendar header, "Print week" and "Shopping list", open
dedicated print-friendly pages (`/print/week` and `/print/shopping-list`)
in a new tab — deliberately light-themed and independent of your custom
color/font preferences, since a dark chalkboard background isn't great for
printing. Each has a "Print / Save as PDF" button that just calls the
browser's native print dialog; "Save as PDF" is whatever your browser or
OS calls its print-to-PDF option.

- **Print week** shows the plan in a simple day-by-day table, always
  oriented with days across the top regardless of your board layout
  preference, plus any slot notes.
- **Shopping list** aggregates ingredients across every meal planned that
  week — including from composed recipes' components — combining matching
  ingredient+unit pairs and summing amounts where they're plain numbers or
  simple fractions ("1/2", "1 1/2"). Amounts it can't parse (e.g. "a
  pinch") are listed alongside the numeric total rather than dropped. Each
  line shows which meal(s) it's for.

## Weeks and persistence

The board now shows real calendar weeks instead of an abstract Mon–Sun
grid:

- It opens on the **current week** (based on your saved "first day of
  week" preference).
- **‹ / ›** step one week at a time; **Today** jumps back to the current
  week; the **date field** jumps to whichever week contains the picked
  date.
- Every meal you drag onto the board is saved immediately to the
  `PlannedMeal` table, keyed by your email, the exact calendar date, and
  the meal slot — so navigating away and back (or logging in from another
  device) shows the same plan. Moving a card between slots and clicking
  the ✕ to remove one both persist too.
- Weeks you've already visited in the current browser session are cached
  in memory, so flipping back and forth doesn't re-fetch every time; a new
  week (or "Clear week") always talks to the server.
- If a save/move/remove request fails (e.g. a dropped connection), the
  board re-fetches the current week from the server to make sure what you
  see matches what's actually saved, rather than silently drifting.

Run `npm run db:push` again after pulling this update — it adds the new
`PlannedMeal` table.

## Preferences

Signed-in users can visit **Settings** (linked from the board's top bar)
to choose:
- **Board layout** — days across the top vs. days down the side
- **First day of the week** — which day the calendar starts on
- **Fonts** — a heading font and a body font, each from a curated list
- **Colors** — background, panel, primary accent, secondary accent, and
  text, each via a color picker with a live preview as you pick

These are saved to a `UserPreference` table keyed by email (not user id),
which is what lets it work uniformly for both email/password accounts and
Google/Facebook sign-ins — OAuth sign-ins don't get a `User` row unless you
add the Prisma adapter (see note above), but every sign-in method always
has an email. Run `npm run db:push` again after pulling this update so
Prisma adds the new columns.

A couple of implementation notes if you extend this further:
- Colors are applied at runtime via CSS variables (`lib/theme.ts`), not
  baked into the Tailwind build, so they can change per user without a
  rebuild. `tailwind.config.ts` reads those variables in a way that keeps
  opacity modifiers (`bg-gold/40`, etc.) working.
- Recipe cards intentionally always use a fixed cream background with dark
  "ink" text (`ink` in `tailwind.config.ts`), independent of the
  customizable page theme — this guarantees the cards stay readable even
  if someone picks a very light "Background" color for the rest of the
  app.
- There's a brief flash of the default theme on first load before the
  saved preferences finish fetching. Fixing that fully would mean reading
  preferences server-side (e.g. in a layout) and injecting the CSS
  variables before the page renders — a reasonable next step if it bugs
  you.

## Stack

- Next.js 14 (App Router) + TypeScript
- Tailwind CSS for styling
- Native HTML5 Drag and Drop API — no extra drag-and-drop library needed

## Extending it

- **Scale ingredients by servings**: right now `servings` is informational
  only. To actually scale a recipe (e.g. show "serves 6" amounts when the
  recipe is written for 4), you'd multiply each ingredient's parsed amount
  by `targetServings / recipe.servings` — `parseAmount`/`formatAmount` in
  `lib/recipe.ts` already do the numeric parsing/formatting piece, they're
  just not wired up to a "scale to N servings" control anywhere yet.
- **Microdata / AI fallback for recipe import**: `lib/importRecipe.ts`
  only reads JSON-LD. Sites using Schema.org Microdata (HTML attributes
  instead of a JSON blob) or no structured data at all will fail to
  import — a Microdata parser or an LLM-based fallback (e.g. calling the
  Claude or OpenAI API on the page's visible text) would catch more sites.
- Add touch-friendly dragging (e.g. `@dnd-kit/core`) if you need mobile
  support — the native HTML5 DnD API used here is desktop-pointer only.
