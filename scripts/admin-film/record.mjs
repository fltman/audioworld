/**
 * Record the narrated admin film (Swedish), scene by scene, and join it into one mp4 with
 * WebVTT captions and a chapter list, plus a lighter web copy (out/web/) for the admin's help.
 * Each scene is a clip in out/clips, so one scene can be re-recorded without the others; the
 * film is re-joined from whatever clips exist.
 *
 *   npm i --no-save playwright@1.56.1          # once (the browser is Playwright's Chromium)
 *   FILM_EMAIL=… FILM_PASSWORD=… ELEVENLABS_API_KEY=… \
 *     node scripts/admin-film/record.mjs [scene-id …] [--cover path/to/cover.webp] [--join]
 *
 * Needs the dev stack running (npm run dev) with the demo walk imported, and an admin account.
 * AI calls the film makes in the narration and guide editors (write, enhance, render) are made
 * for real once and cached in out/api-cache, then replayed with a steady delay so the picture
 * keeps time with the voice. The AI assistant scene runs live.
 */
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LEAD, OVERLAY, SCALE, TAIL, VIEWPORT, actor, captions, concatClips, duration, encodeScene, startCapture, voiceOver, webVersion } from './lib.mjs';
import { SCENES, card } from './scenes.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'out');
const ADMIN = process.env.ADMIN_URL ?? 'http://localhost:5175';
const API = process.env.API_URL ?? 'http://localhost:3001';
const VOICE = { voiceId: 'aSLKtNoVBZlxQEMsnGL2', model: 'eleven_v4' }; // Lova (Sanna Hartfield)
/** How long a cached AI reply takes to "arrive" in the film. */
const AI_DELAY_MS = { narration: 3200, persona: 2600, tts: 2800, 'sound-effect': 3000 };

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args.splice(i, 2)[1] : undefined;
};
const coverFile = resolve(flag('--cover') ?? join(HERE, '..', 'kalmar-demo', 'cover.webp'));
const joinOnly = args.includes('--join');
const wanted = args.filter((a) => !a.startsWith('--'));
for (const d of ['clips', 'frames', 'vo', 'api-cache']) mkdirSync(join(OUT, d), { recursive: true });

async function login() {
  const res = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: process.env.FILM_EMAIL, password: process.env.FILM_PASSWORD }),
  });
  const j = await res.json();
  if (!j.success) throw new Error(`login failed: ${j.error}`);
  return j.data.token;
}

async function courseIdByName(token, name) {
  const res = await fetch(`${API}/api/courses`, { headers: { authorization: `Bearer ${token}` } });
  const j = await res.json();
  return j.data.filter((c) => c.name === name).at(-1)?.id ?? null;
}

/** Replay (or make once, then cache) the AI calls the narration and guide editors make. */
async function cacheAiCalls(page) {
  await page.route(/\/api\/(enhance\/(narration|persona)|generate\/(tts|sound-effect))$/, async (route) => {
    const req = route.request();
    const kind = /(narration|persona|tts|sound-effect)$/.exec(req.url())[1];
    const key = createHash('sha1').update(`${kind}\n${req.postData() ?? ''}`).digest('hex').slice(0, 20);
    const file = join(OUT, 'api-cache', `${kind}-${key}.json`);
    if (existsSync(file)) {
      const { status, body } = JSON.parse(readFileSync(file, 'utf8'));
      await new Promise((r) => setTimeout(r, AI_DELAY_MS[kind]));
      await route.fulfill({ status, contentType: 'application/json', body });
      return;
    }
    const res = await route.fetch({ timeout: 180000 });
    const body = await res.text();
    if (res.ok()) writeFileSync(file, JSON.stringify({ status: res.status(), body }));
    await route.fulfill({ response: res, body });
  });
}

async function openCourse(page, token, name, view) {
  const id = name ? await courseIdByName(token, name) : null;
  await page.goto(`${ADMIN}/`);
  await page.evaluate(([t, id]) => {
    localStorage.setItem('audioworld.admin.token', t);
    if (id) localStorage.setItem('audioworld.admin.courseId', id);
  }, [token, id]);
  await page.goto(`${ADMIN}/`);
  await page.locator('.leaflet-container').waitFor();
  await page.locator('.section.publish, .point-list').first().waitFor({ timeout: 20000 }).catch(() => {});
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(1500);
  if (view) {
    await page.evaluate(([lat, lng, z]) => window.__awMap.setView([lat, lng], z, { animate: false }), view);
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(1200);
  }
}

async function recordScene(browser, token, scene, index) {
  const tag = `${String(index + 1).padStart(2, '0')}-${scene.id}`;
  console.log(`\n▶ ${tag}`);
  const vo = await voiceOver(scene.vo, { ...VOICE, dir: join(OUT, 'vo') });
  console.log(`  voice-over ${vo.duration.toFixed(1)} s, cues: ${Object.keys(vo.cues).join(' ') || '—'}`);

  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: SCALE, locale: 'sv-SE' });
  await context.addInitScript(OVERLAY);
  const page = await context.newPage();
  await cacheAiCalls(page);
  if (scene.card) {
    const img = scene.card.image === 'cover' && existsSync(coverFile)
      ? `data:image/webp;base64,${readFileSync(coverFile).toString('base64')}`
      : null;
    await page.setContent(card({ ...scene.card, image: img }));
    await page.waitForTimeout(400);
  } else {
    await openCourse(page, token, scene.course, scene.view);
  }
  const a = actor(page);
  await page.mouse.move(VIEWPORT.width * 0.62, VIEWPORT.height * 0.55);

  const cap = await startCapture(context, page, join(OUT, 'frames', tag));
  const t0 = Date.now();
  const elapsed = () => (Date.now() - t0) / 1000;
  const at = async (cue) => {
    const target = LEAD + (vo.cues[cue] ?? 0) - 0.2;
    const wait = target - elapsed();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait * 1000));
  };
  try {
    if (scene.run) await scene.run(a, at, { coverFile });
    if (scene.tailWait) await scene.tailWait(page);
  } catch (e) {
    await page.screenshot({ path: join(OUT, `${tag}-error.png`) });
    await cap.stop();
    await context.close();
    throw new Error(`${tag}: ${e.message}`);
  }
  const end = LEAD + vo.duration + TAIL;
  if (elapsed() < end) await new Promise((r) => setTimeout(r, (end - elapsed()) * 1000));
  const captured = await cap.stop();
  await context.close();
  const clip = join(OUT, 'clips', `${tag}.mp4`);
  const len = encodeScene(captured, vo, clip, join(OUT, 'frames', tag));
  writeFileSync(join(OUT, 'clips', `${tag}.json`), JSON.stringify({ id: scene.id, chapter: scene.chapter, length: len, vo: { lines: vo.lines } }));
  console.log(`  clip ${len.toFixed(1)} s (voice ${vo.duration.toFixed(1)} s, ${captured.frames.length} frames)`);
}

if (!joinOnly) {
  const token = await login();
  const browser = await chromium.launch();
  try {
    for (const [i, scene] of SCENES.entries()) {
      if (wanted.length && !wanted.includes(scene.id)) continue;
      await recordScene(browser, token, scene, i);
    }
  } finally {
    await browser.close();
  }
}

// Join every recorded clip (in scene order) into the film, with captions and chapters.
const clips = [];
const placed = [];
let offset = 0;
for (const [i, scene] of SCENES.entries()) {
  const tag = `${String(i + 1).padStart(2, '0')}-${scene.id}`;
  const clip = join(OUT, 'clips', `${tag}.mp4`);
  if (!existsSync(clip)) continue;
  const meta = JSON.parse(readFileSync(join(OUT, 'clips', `${tag}.json`), 'utf8'));
  clips.push(clip);
  placed.push({ offset, vo: meta.vo, chapter: meta.chapter });
  offset += duration(clip);
}
if (clips.length) {
  const film = join(OUT, 'audioworld-admin.mp4');
  concatClips(clips, film, OUT);
  writeFileSync(join(OUT, 'audioworld-admin.vtt'), captions(placed));
  const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const chapters = placed.map((p) => ({ start: +p.offset.toFixed(1), title: p.chapter }));
  writeFileSync(join(OUT, 'chapters.json'), JSON.stringify(chapters, null, 1));
  // The copy the admin's help plays: admin/public/docs/film/ (see admin/src/docs/film.md).
  const web = join(OUT, 'web');
  mkdirSync(web, { recursive: true });
  webVersion(film, join(web, 'audioworld-admin.mp4'), join(web, 'audioworld-admin.jpg'));
  writeFileSync(join(web, 'audioworld-admin.vtt'), captions(placed));
  console.log(`\nFilm: ${film} (${mmss(duration(film))}, ${clips.length} scenes); web copy in ${web}`);
  for (const c of chapters) console.log(`  ${mmss(c.start).padStart(5)}  ${c.title}`);
}
