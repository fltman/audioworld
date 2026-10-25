/**
 * Help routing. The help view lives at `#help`, `#help/<section>` or
 * `#help/<section>/<anchor>`, so any page of the docs can be linked to and the browser's
 * back button walks back through what you read (and out of help to where you were).
 * Kept apart from the docs themselves so a "?" link never pulls the docs into the bundle.
 */
export interface HelpRoute {
  section: string | null;
  anchor: string | null;
}

/** The help route a location hash names, or null when it isn't a help link. */
export function parseHelpHash(hash: string): HelpRoute | null {
  const m = /^#help(?:\/([^/]+))?(?:\/([^/]+))?\/?$/.exec(hash);
  if (!m) return null;
  const part = (s: string | undefined) => (s ? decodeURIComponent(s) : null);
  return { section: part(m[1]), anchor: part(m[2]) };
}

/** The href that opens help at `to` ("section" or "section/anchor"); bare help when omitted. */
export function helpHref(to?: string): string {
  return to ? `#help/${to}` : '#help';
}
