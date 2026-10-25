// The font catalogue: every heading ("display") and body font a user can
// pick, in one place. The same list drives
//   - the pickers in Settings (grouped by `group`),
//   - what an API accepts as a valid font key, and
//   - which Google Fonts stylesheets the app loads (see googleFontsHrefs),
// so adding a font here is the only step needed to offer it.
//
// `key` is what gets stored in the database — never rename an existing one.
// `google` is that family's spec in a Google Fonts css2 URL. Weights must
// be ones the family really has (e.g. Lato has no 500/600), and listed in
// ascending order; a bad spec makes Google reject that whole request.

interface FontDef {
  readonly key: string;
  readonly label: string;
  readonly family: string; // CSS font-family value, with a generic fallback
  readonly google: string;
  readonly group: string;
}

export const FONT_OPTIONS = [
  // handwritten
  { key: "caveat", label: "Caveat", family: "'Caveat', cursive", google: "Caveat:wght@500;600;700", group: "Handwritten" },
  { key: "amaticSC", label: "Amatic SC", family: "'Amatic SC', cursive", google: "Amatic+SC:wght@400;700", group: "Handwritten" },
  { key: "shadowsIntoLight", label: "Shadows Into Light", family: "'Shadows Into Light', cursive", google: "Shadows+Into+Light", group: "Handwritten" },
  { key: "kalam", label: "Kalam", family: "'Kalam', cursive", google: "Kalam:wght@400;700", group: "Handwritten" },
  { key: "patrickHand", label: "Patrick Hand", family: "'Patrick Hand', cursive", google: "Patrick+Hand", group: "Handwritten" },
  // script
  { key: "dancingScript", label: "Dancing Script", family: "'Dancing Script', cursive", google: "Dancing+Script:wght@400;500;600;700", group: "Script" },
  { key: "pacifico", label: "Pacifico", family: "'Pacifico', cursive", google: "Pacifico", group: "Script" },
  { key: "greatVibes", label: "Great Vibes", family: "'Great Vibes', cursive", google: "Great+Vibes", group: "Script" },
  { key: "satisfy", label: "Satisfy", family: "'Satisfy', cursive", google: "Satisfy", group: "Script" },
  // serif
  { key: "playfair", label: "Playfair Display", family: "'Playfair Display', serif", google: "Playfair+Display:wght@500;600;700", group: "Serif" },
  { key: "cormorant", label: "Cormorant Garamond", family: "'Cormorant Garamond', serif", google: "Cormorant+Garamond:wght@500;600;700", group: "Serif" },
  { key: "cinzel", label: "Cinzel", family: "'Cinzel', serif", google: "Cinzel:wght@400;500;600;700", group: "Serif" },
  { key: "dmSerifDisplay", label: "DM Serif Display", family: "'DM Serif Display', serif", google: "DM+Serif+Display", group: "Serif" },
  { key: "abrilFatface", label: "Abril Fatface", family: "'Abril Fatface', serif", google: "Abril+Fatface", group: "Serif" },
  // sans-serif
  { key: "poppins", label: "Poppins", family: "'Poppins', sans-serif", google: "Poppins:wght@400;500;600;700", group: "Sans-serif" },
  { key: "josefinSans", label: "Josefin Sans", family: "'Josefin Sans', sans-serif", google: "Josefin+Sans:wght@400;500;600;700", group: "Sans-serif" },
  { key: "fredoka", label: "Fredoka", family: "'Fredoka', sans-serif", google: "Fredoka:wght@400;500;600;700", group: "Sans-serif" },
  // vintage
  { key: "specialElite", label: "Special Elite", family: "'Special Elite', monospace", google: "Special+Elite", group: "Vintage" },
  { key: "rye", label: "Rye", family: "'Rye', serif", google: "Rye", group: "Vintage" },
  { key: "breeSerif", label: "Bree Serif", family: "'Bree Serif', serif", google: "Bree+Serif", group: "Vintage" },
  { key: "fredericka", label: "Fredericka the Great", family: "'Fredericka the Great', cursive", google: "Fredericka+the+Great", group: "Vintage" },
] as const satisfies readonly FontDef[];

export const BODY_FONT_OPTIONS = [
  // sans-serif
  { key: "workSans", label: "Work Sans", family: "'Work Sans', sans-serif", google: "Work+Sans:wght@400;500;600;700", group: "Sans-serif" },
  { key: "inter", label: "Inter", family: "'Inter', sans-serif", google: "Inter:wght@400;500;600;700", group: "Sans-serif" },
  { key: "openSans", label: "Open Sans", family: "'Open Sans', sans-serif", google: "Open+Sans:wght@400;500;600;700", group: "Sans-serif" },
  { key: "lato", label: "Lato", family: "'Lato', sans-serif", google: "Lato:wght@400;700", group: "Sans-serif" },
  { key: "nunito", label: "Nunito", family: "'Nunito', sans-serif", google: "Nunito:wght@400;500;600;700", group: "Sans-serif" },
  { key: "dmSans", label: "DM Sans", family: "'DM Sans', sans-serif", google: "DM+Sans:wght@400;500;600;700", group: "Sans-serif" },
  { key: "ibmPlexSans", label: "IBM Plex Sans", family: "'IBM Plex Sans', sans-serif", google: "IBM+Plex+Sans:wght@400;500;600;700", group: "Sans-serif" },
  { key: "atkinson", label: "Atkinson Hyperlegible (easy to read)", family: "'Atkinson Hyperlegible', sans-serif", google: "Atkinson+Hyperlegible:wght@400;700", group: "Sans-serif" },
  // serif
  { key: "merriweather", label: "Merriweather", family: "'Merriweather', serif", google: "Merriweather:wght@400;700", group: "Serif" },
  { key: "lora", label: "Lora", family: "'Lora', serif", google: "Lora:wght@400;500;600;700", group: "Serif" },
  { key: "sourceSerif", label: "Source Serif 4", family: "'Source Serif 4', serif", google: "Source+Serif+4:wght@400;500;600;700", group: "Serif" },
  { key: "crimsonPro", label: "Crimson Pro", family: "'Crimson Pro', serif", google: "Crimson+Pro:wght@400;500;600;700", group: "Serif" },
  { key: "ebGaramond", label: "EB Garamond", family: "'EB Garamond', serif", google: "EB+Garamond:wght@400;500;600;700", group: "Serif" },
  // monospace
  { key: "jetbrainsMono", label: "JetBrains Mono", family: "'JetBrains Mono', monospace", google: "JetBrains+Mono:wght@400;500;700", group: "Monospace" },
  { key: "spaceMono", label: "Space Mono", family: "'Space Mono', monospace", google: "Space+Mono:wght@400;700", group: "Monospace" },
] as const satisfies readonly FontDef[];

/** Splits a font list into its groups, keeping the list's own order — for
 * rendering <optgroup>s. */
export function groupFonts<T extends { readonly group: string }>(
  options: readonly T[]
): { group: string; options: T[] }[] {
  const groups: { group: string; options: T[] }[] = [];
  for (const option of options) {
    const existing = groups.find((g) => g.group === option.group);
    if (existing) existing.options.push(option);
    else groups.push({ group: option.group, options: [option] });
  }
  return groups;
}

// Fonts are fetched in several small stylesheet requests rather than one
// big one. Google rejects a whole css2 request if any family or weight in
// it is wrong, so with a single request one typo would silently take every
// font down; split up, it can only cost the few fonts in its own request.
const FAMILIES_PER_REQUEST = 5;

/** The Google Fonts stylesheet URLs covering every font above. */
export function googleFontsHrefs(perRequest: number = FAMILIES_PER_REQUEST): string[] {
  const specs = Array.from(new Set([...FONT_OPTIONS, ...BODY_FONT_OPTIONS].map((f) => f.google)));
  const hrefs: string[] = [];
  for (let i = 0; i < specs.length; i += perRequest) {
    const families = specs.slice(i, i + perRequest).map((s) => `family=${s}`);
    hrefs.push(`https://fonts.googleapis.com/css2?${families.join("&")}&display=swap`);
  }
  return hrefs;
}
