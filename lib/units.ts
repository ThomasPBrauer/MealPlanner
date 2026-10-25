// Canonical unit vocabulary for imported recipes.
//
// One table drives both jobs: recognizing a unit at the start of some text
// ("cups", "Tbsp.", "fl oz") and deciding what to store for it. Imported
// recipes get the canonical form, so the same unit never shows up as
// "cup" / "Cups" / "c" / "C" across different recipes (which would also
// keep the shopping list from adding them together).
//
// Canonical forms:
//   volume  C, T, tsp, fl oz, pt, qt, gal, ml, L
//   weight  oz, lb, g, kg
//   counts  clove, pinch, dash, can, pkg, slice, sprig, stalk, bunch, stick,
//           head, jar, bottle, bag, box, piece, large, medium, small, whole
//
// Teaspoon is deliberately "tsp", not "t": the shopping list groups items
// by name + unit *lowercased*, so "T" (tablespoon) and "t" (teaspoon) would
// collapse into one unit and get summed together.

interface UnitDef {
  canonical: string;
  // regex source, matched case-insensitively at the start of the text
  pattern: string;
}

// Order matters: longer / multi-word forms must come before the shorter
// ones they contain ("fl oz" before "oz").
const UNIT_DEFS: UnitDef[] = [
  { canonical: "fl oz", pattern: "fl(?:uid)?\\.?[\\s-]*(?:ounces?|oz)" },
  { canonical: "oz", pattern: "ounces?|ozs?" },
  { canonical: "lb", pattern: "pounds?|lbs?" },
  { canonical: "C", pattern: "cups?" },
  { canonical: "T", pattern: "tablespoons?|tbsps?|tbl?s?|tblsps?|tbspn" },
  { canonical: "tsp", pattern: "teaspoons?|tsps?|tspn" },
  { canonical: "kg", pattern: "kilograms?|kilos?|kgs?" },
  { canonical: "g", pattern: "grams?|gms?" },
  { canonical: "ml", pattern: "millilit(?:er|re)s?|mls?" },
  { canonical: "L", pattern: "lit(?:er|re)s?" },
  { canonical: "pt", pattern: "pints?|pts?" },
  { canonical: "qt", pattern: "quarts?|qts?" },
  { canonical: "gal", pattern: "gallons?|gals?" },
  { canonical: "clove", pattern: "cloves?" },
  { canonical: "pinch", pattern: "pinch(?:es)?" },
  { canonical: "dash", pattern: "dash(?:es)?" },
  { canonical: "can", pattern: "cans?" },
  { canonical: "pkg", pattern: "packages?|pkgs?|packets?" },
  { canonical: "slice", pattern: "slices?" },
  { canonical: "sprig", pattern: "sprigs?" },
  { canonical: "stalk", pattern: "stalks?" },
  { canonical: "bunch", pattern: "bunch(?:es)?" },
  { canonical: "stick", pattern: "sticks?" },
  { canonical: "head", pattern: "heads?" },
  { canonical: "jar", pattern: "jars?" },
  { canonical: "bottle", pattern: "bottles?" },
  { canonical: "bag", pattern: "bags?" },
  { canonical: "box", pattern: "box(?:es)?" },
  { canonical: "piece", pattern: "pieces?" },
  { canonical: "large", pattern: "large|lg" },
  { canonical: "medium", pattern: "medium|med" },
  { canonical: "small", pattern: "small|sm" },
  { canonical: "whole", pattern: "whole" },
];

// A unit has to end at a word boundary of some kind — whitespace, end of
// text, or the start of a comma / parenthetical / slash — so "can" never
// matches the front of "canola oil". A trailing period ("tsp.") is allowed.
const COMPILED = UNIT_DEFS.map((d) => ({
  canonical: d.canonical,
  re: new RegExp(`^(?:${d.pattern})\\.?(?=\\s|$|[,(/])`, "i"),
}));

// Single letters are the one place case carries meaning: "T" is a
// tablespoon but "t" is a teaspoon, while "c"/"C" are both cups and
// "g"/"l" are grams / liters either way.
const SINGLE_LETTER_RE = /^([TtCcGgLl])\.?(?=\s|$)/;
const SINGLE_LETTER: Record<string, string> = {
  T: "T",
  t: "tsp",
  C: "C",
  c: "C",
  G: "g",
  g: "g",
  L: "L",
  l: "L",
};

export interface UnitMatch {
  /** canonical form, e.g. "C" */
  unit: string;
  /** the unit exactly as it was written, minus any trailing period, e.g. "Cups" */
  raw: string;
  /** the text after the unit, with leading whitespace/commas removed */
  rest: string;
}

/** If `text` starts with a recognized unit, returns it (canonical and as
 * written) along with whatever follows. Otherwise null. */
export function matchLeadingUnit(text: string): UnitMatch | null {
  for (const { canonical, re } of COMPILED) {
    const m = text.match(re);
    if (m) {
      return {
        unit: canonical,
        raw: m[0].replace(/\.$/, ""),
        rest: text.slice(m[0].length).replace(/^[\s,]+/, ""),
      };
    }
  }
  const single = text.match(SINGLE_LETTER_RE);
  if (single) {
    return {
      unit: SINGLE_LETTER[single[1]],
      raw: single[1],
      rest: text.slice(single[0].length).replace(/^[\s,]+/, ""),
    };
  }
  return null;
}

/** True when the whole string is just a unit ("cup", "Tbsp.") — used to
 * stitch together pasted ingredients whose quantity, unit and name were
 * split across separate lines. */
export function isUnitOnly(text: string): boolean {
  const m = matchLeadingUnit(text.trim());
  return m !== null && m.rest === "";
}
