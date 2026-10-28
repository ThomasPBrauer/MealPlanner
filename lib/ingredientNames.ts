// Putting the preparation after the ingredient: "thinly sliced onion" →
// "onion, thinly sliced", "peeled and diced potatoes" → "potatoes, peeled
// and diced". Recipes write it both ways; a consistent "ingredient, how it's
// prepared" form means the same ingredient reads the same wherever it came
// from, and the shopping list can group by the ingredient itself.
//
// Pure and dependency-free. It's deliberately conservative: it only moves a
// run of words at the very start of the name that are *all* preparation words
// (optionally with adverbs), and only when an ingredient is left behind.
// Words that describe the product rather than what you do to it — dried,
// fresh, frozen, canned, smoked, ground (as in ground beef) — stay where they are.

// What you do to an ingredient. Past participles, as recipes write them.
const PREPARATIONS = new Set([
  "chopped", "diced", "sliced", "minced", "cubed", "crushed", "grated", "shredded",
  "julienned", "mashed", "pureed", "puréed", "quartered", "halved", "trimmed", "peeled",
  "pitted", "seeded", "deseeded", "cored", "stemmed", "hulled", "deveined", "shelled",
  "rinsed", "drained", "washed", "cleaned", "scrubbed", "thawed", "defrosted",
  "softened", "melted", "chilled", "cooled", "warmed", "beaten", "whisked", "sifted",
  "packed", "crumbled", "torn", "shaved", "zested", "separated", "cut", "split",
  "pounded", "flattened", "butterflied", "toasted", "roasted", "blanched", "steamed",
  "sauteed", "sautéed", "caramelized", "cooked", "boiled", "hard-boiled", "hardboiled",
  "mixed", "divided", "snipped", "bruised", "smashed", "scored", "pressed", "squeezed",
  "strained", "reserved", "thinly-sliced", "spiralized", "riced", "grilled", "fried",
]);

// How you do it.
const ADVERBS = new Set([
  "thinly", "thickly", "finely", "roughly", "coarsely", "freshly", "lightly", "firmly",
  "loosely", "evenly", "well", "very", "extra", "large", "small", "medium", "thin",
  "thick", "fine", "rough", "coarse",
]);

// "ground" is a preparation only when something says how it was ground
// ("freshly ground pepper"); on its own it's the product ("ground beef").
const NEEDS_ADVERB = new Set(["ground"]);

// Describe the ingredient, not the prep. They stay in front when a prep run
// follows them: "fresh chopped parsley" → "fresh parsley, chopped".
const KEEP_IN_FRONT = new Set(["fresh", "ripe", "firm", "raw", "frozen", "canned", "dried", "large", "small", "medium", "baby", "young", "organic"]);

// If one of these comes right after the prep words, it's a phrase ("sliced in
// half", "cut into pieces"), not an ingredient — leave the line alone.
const NOT_AN_INGREDIENT = new Set(["into", "in", "to", "for", "with", "and", "or", "of", "on", "at", "about", "plus", "as", "if", "until", "lengthwise", "crosswise", "thinly", "finely"]);

const JOINERS = new Set(["and", "or", "&"]);

const lower = (w: string) => w.toLowerCase();

/** One word as a preparation, or null. Handles a hyphenated adverb:
 * "finely-chopped". Returns [adverbs, prep]. */
function asPreparation(word: string): { adverbs: string[]; prep: string } | null {
  const w = lower(word);
  if (PREPARATIONS.has(w) && !NEEDS_ADVERB.has(w)) return { adverbs: [], prep: word };
  const hyphen = w.match(/^([a-z]+)-([a-z]+)$/);
  if (hyphen && ADVERBS.has(hyphen[1]) && PREPARATIONS.has(hyphen[2])) {
    return { adverbs: [], prep: word };
  }
  return null;
}

/** Moves leading preparation words to the end of the name, after a comma.
 * Anything that isn't clearly a leading prep run is returned unchanged. */
export function moveDescriptorsAfter(name: string): string {
  // only the part before the first comma or parenthesis is rearranged;
  // "chopped onion, divided" → "onion, chopped, divided"
  const cut = name.search(/[,(]/);
  const head = (cut === -1 ? name : name.slice(0, cut)).trim();
  const tail = name.slice(head.length === 0 ? 0 : name.indexOf(head) + head.length);
  const words = head.split(/\s+/).filter(Boolean);
  if (words.length < 2) return name;

  let i = 0;
  const front: string[] = [];
  while (i < words.length - 1 && KEEP_IN_FRONT.has(lower(words[i])) && !asPreparation(words[i])) {
    front.push(words[i]);
    i++;
  }

  const moved: string[] = [];
  let expectingMore = true;
  while (i < words.length && expectingMore) {
    // optional adverbs, then the preparation word itself
    const adverbs: string[] = [];
    let j = i;
    while (j < words.length && ADVERBS.has(lower(words[j])) && !asPreparation(words[j])) {
      adverbs.push(words[j]);
      j++;
    }
    const word = words[j];
    if (word === undefined) break;

    const plain = asPreparation(word);
    const needsAdverb = NEEDS_ADVERB.has(lower(word));
    if (!plain && !(needsAdverb && adverbs.length > 0)) break;

    moved.push([...adverbs, word].join(" "));
    i = j + 1;

    // "peeled and diced", "chopped or sliced" — keep going across the joiner
    if (i + 1 < words.length && JOINERS.has(lower(words[i]))) {
      const probe = i + 1;
      let k = probe;
      while (k < words.length && ADVERBS.has(lower(words[k])) && !asPreparation(words[k])) k++;
      const next = words[k];
      if (next !== undefined && (asPreparation(next) || (NEEDS_ADVERB.has(lower(next)) && k > probe))) {
        moved.push(words[i]); // the joiner itself
        i = probe;
        continue;
      }
    }
    expectingMore = false;
  }

  const rest = words.slice(i);
  if (moved.length === 0 || rest.length === 0) return name;
  if (NOT_AN_INGREDIENT.has(lower(rest[0]))) return name;
  // a prep run ending in a dangling joiner ("peeled and") isn't one
  if (JOINERS.has(lower(moved[moved.length - 1]))) return name;

  // "peeled", "and", "diced" → "peeled and diced"
  const phrase = moved.join(" ").replace(/\s+(and|or|&)\s+/g, " $1 ");
  const core = [...front, ...rest].join(" ");
  return `${core}, ${phrase}${tail}`;
}
