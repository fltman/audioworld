import type { AudioSource } from './types';

/** Primary subtag of a BCP-47 tag, lowercased ("sv-SE" → "sv", "EN" → "en"). */
function primarySubtag(tag: string): string {
  return tag.toLowerCase().split('-')[0] ?? '';
}

/**
 * The clip url to play for a listener's language preferences. Returns the first variant
 * whose primary language matches a preference (in preference order), else the default
 * `url`. `prefs` is typically `navigator.languages` (most-preferred first).
 */
export function pickClipUrl(audio: AudioSource, prefs: readonly string[]): string {
  if (!audio.variants || audio.variants.length === 0) return audio.url;
  const byLang = new Map<string, string>();
  for (const v of audio.variants) {
    if (v.url && !byLang.has(primarySubtag(v.lang))) byLang.set(primarySubtag(v.lang), v.url);
  }
  for (const p of prefs) {
    const hit = byLang.get(primarySubtag(p));
    if (hit) return hit;
  }
  return audio.url;
}

/** Every url a clip can resolve to (default + variants) — for precache / bundling. */
export function clipUrls(audio: AudioSource): string[] {
  const urls = [audio.url];
  if (audio.variants) for (const v of audio.variants) if (v.url) urls.push(v.url);
  return urls;
}
