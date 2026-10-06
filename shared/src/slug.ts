/** Longest short address a course may have. */
export const MAX_SLUG_LENGTH = 40;

/**
 * Paths the site already uses (or may), which a course's short address must never shadow:
 * the admin app, the API, uploads, the client's own assets/files and its scout mode.
 */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  'admin', 'api', 'uploads', 'assets', 'scout', 'sw', 'sw-js', 'manifest', 'icon', 'index',
  'favicon', 'robots', 'health', 'login', 'new', 'courses',
]);

/** A short address is lowercase a–z/0–9 words joined by single hyphens. */
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Whether `s` is a usable short address (well-formed, not too long, not reserved). */
export function isValidSlug(s: string): boolean {
  return s.length >= 2 && s.length <= MAX_SLUG_LENGTH && SLUG_RE.test(s) && !RESERVED_SLUGS.has(s);
}

/**
 * A readable short address from a course name: diacritics dropped (å/ä → a, ö → o), lowercase,
 * runs of anything else → one hyphen. A subtitle after a dash or colon is left out
 * ("Trettio spann — allhelgonanatt på Svinö" → "trettio-spann"), and long names are cut at a
 * word boundary. Falls back to "bana" when nothing usable is left (or the result is reserved).
 */
export function slugify(name: string): string {
  const title = name.split(/\s[—–-]\s|:/)[0] ?? name;
  let s = title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/æ/gi, 'ae')
    .replace(/[øœ]/gi, 'o')
    .replace(/ß/g, 'ss')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (s.length > MAX_SLUG_LENGTH) {
    s = s.slice(0, MAX_SLUG_LENGTH);
    const cut = s.lastIndexOf('-');
    if (cut >= 2) s = s.slice(0, cut);
  }
  return isValidSlug(s) ? s : 'bana';
}
