// The name shown beside a recipe in the public recipe book. Client-safe.

export const DISPLAY_NAME_MIN = 2;
export const DISPLAY_NAME_MAX = 30;

export function cleanDisplayName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

/** What two names are compared by to decide they're "the same": ignores case,
 * accents and spacing, so "Café Cook", "cafe  cook" and "CAFE COOK" collide. */
export function displayNameKey(name: string): string {
  return cleanDisplayName(name)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** Returns an error message, or null if the name is acceptable. */
export function validateDisplayName(name: string): string | null {
  if (name.length < DISPLAY_NAME_MIN) return `Use at least ${DISPLAY_NAME_MIN} characters.`;
  if (name.length > DISPLAY_NAME_MAX) return `Use at most ${DISPLAY_NAME_MAX} characters.`;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(name)) return "That name has characters that aren't allowed.";
  // this name is public — never let an email address (or a link) end up there
  if (/@|https?:|www\./i.test(name)) return "Please don't use an email address or link as your name.";
  return null;
}
