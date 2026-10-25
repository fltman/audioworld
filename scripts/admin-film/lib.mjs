/**
 * The machinery behind the admin film: a narrated voice-over with word timing, a scripted browser
 * that acts on cue (with a visible cursor and highlights), a full-quality screen capture, and the
 * ffmpeg steps that turn each scene into a clip and the clips into one film.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

export const W = 1920;
export const H = 1080;
/** CSS viewport; × 4/3 device pixels = 1920×1080, so the admin reads at a comfortable size. */
export const VIEWPORT = { width: 1440, height: 810 };
export const SCALE = 4 / 3;
/** Seconds of picture before the voice starts, and after it ends. */
export const LEAD = 0.6;
export const TAIL = 0.9;

const run = (cmd, args) => execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 26 }).toString();
export const duration = (file) =>
  Number(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).trim());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- Voice-over -----------------------------------------------------------------------------

/**
 * Split a script with `{cue}` markers into the spoken text and each cue's character offset.
 * "Klicka på {new}+ New." → text "Klicka på + New.", cues { new: 10 }.
 */
export function parseCues(script) {
  const cues = {};
  let text = '';
  const re = /\{([a-z0-9_-]+)\}/gi;
  let last = 0;
  for (let m; (m = re.exec(script)); ) {
    text += script.slice(last, m.index);
    cues[m[1]] = text.length;
    last = m.index + m[0].length;
  }
  text += script.slice(last);
  return { text: text.replace(/\s+/g, ' ').trim(), cues };
}

/**
 * Speak a scene's script with ElevenLabs, keeping the per-character timing so actions can land
 * on the words. Cached by content in `dir`.
 */
export async function voiceOver(script, { voiceId, model, dir }) {
  const parsed = parseCues(script);
  // Re-derive offsets against the whitespace-normalised text.
  const cues = {};
  for (const [name] of Object.entries(parsed.cues)) {
    const marked = script.replace(new RegExp(`\\{${name}\\}`), '\u0000').replace(/\{[a-z0-9_-]+\}/gi, '');
    cues[name] = marked.replace(/\s+/g, ' ').trimStart().indexOf('\u0000');
  }
  const { text } = parsed;
  const key = createHash('sha1').update(JSON.stringify({ text, voiceId, model })).digest('hex').slice(0, 16);
  const mp3 = join(dir, `vo_${key}.mp3`);
  const meta = join(dir, `vo_${key}.json`);
  if (!existsSync(mp3) || !existsSync(meta)) {
    const KEY = process.env.ELEVENLABS_API_KEY;
    if (!KEY) throw new Error('ELEVENLABS_API_KEY is not set');
    let res;
    for (let attempt = 0; ; attempt++) {
      res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps?output_format=mp3_44100_128`, {
        method: 'POST',
        headers: { 'xi-api-key': KEY, 'content-type': 'application/json' },
        body: JSON.stringify({ text, model_id: model }),
      });
      if (res.ok || res.status !== 429 || attempt >= 4) break;
      await sleep(4000 * (attempt + 1));
    }
    if (!res.ok) throw new Error(`voice-over: ${res.status} ${(await res.text()).slice(0, 300)}`);
    const j = await res.json();
    writeFileSync(mp3, Buffer.from(j.audio_base64, 'base64'));
    writeFileSync(meta, JSON.stringify(j.alignment));
  }
  const align = JSON.parse(readFileSync(meta, 'utf8'));
  const starts = align.character_start_times_seconds;
  const ends = align.character_end_times_seconds;
  const dur = duration(mp3);
  const timeAt = (i) => (i >= starts.length ? dur : starts[Math.max(0, i)]);
  const cueTimes = Object.fromEntries(Object.entries(cues).map(([n, i]) => [n, timeAt(i)]));
  // Subtitle lines: sentences, split further when long.
  const lines = [];
  const sentenceRe = /[^.!?…]+[.!?…]+["”]?\s*|[^.!?…]+$/g;
  for (let m; (m = sentenceRe.exec(text)); ) {
    const s = m[0].trim();
    if (!s) continue;
    const from = m.index + (m[0].length - m[0].trimStart().length);
    const to = from + s.length - 1;
    lines.push({ text: s, start: timeAt(from), end: ends[Math.min(to, ends.length - 1)] ?? dur });
  }
  return { file: mp3, text, duration: dur, cues: cueTimes, lines };
}

// --- The scripted browser -------------------------------------------------------------------

/** A visible cursor, click ripples and highlight rings, drawn over every page. */
export const OVERLAY = `(() => {
  const install = () => {
    if (document.getElementById('__film_cursor')) return;
    const style = document.createElement('style');
    style.textContent = \`
      #__film_cursor{position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;transform:translate(-200px,-200px);filter:drop-shadow(0 2px 3px rgba(0,0,0,.45))}
      .__film_ripple{position:fixed;z-index:2147483646;pointer-events:none;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;border:3px solid #ffd23f;animation:__film_r .55s ease-out forwards}
      @keyframes __film_r{from{transform:scale(.3);opacity:1}to{transform:scale(1.25);opacity:0}}
      .leaflet-tile{outline:1px solid transparent}
      .__film_spot{position:fixed;z-index:2147483645;pointer-events:none;border-radius:10px;border:3px solid #ffd23f;box-shadow:0 0 0 9999px rgba(10,12,20,.28),0 0 22px rgba(255,210,63,.75);transition:opacity .35s ease;opacity:0}
    \`;
    document.documentElement.appendChild(style);
    const c = document.createElement('div');
    c.id = '__film_cursor';
    c.innerHTML = '<svg width="30" height="30" viewBox="0 0 30 30"><path d="M4 2 L4 24 L9.8 18.6 L14 28 L18 26.3 L13.8 17 L21.5 17 Z" fill="#fff" stroke="#111" stroke-width="1.7" stroke-linejoin="round"/></svg>';
    document.documentElement.appendChild(c);
    const move = (e) => { c.style.transform = 'translate(' + (e.clientX - 4) + 'px,' + (e.clientY - 2) + 'px)'; };
    document.addEventListener('mousemove', move, true);
    document.addEventListener('pointermove', move, true);
    document.addEventListener('mousedown', (e) => {
      const r = document.createElement('div');
      r.className = '__film_ripple';
      r.style.left = e.clientX + 'px';
      r.style.top = e.clientY + 'px';
      document.documentElement.appendChild(r);
      setTimeout(() => r.remove(), 700);
    }, true);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
})();`;

/** Acting helpers bound to one page: smooth cursor moves, clicks, typing, highlights, map. */
export function actor(page) {
  let pos = { x: VIEWPORT.width / 2, y: VIEWPORT.height / 2 };
  const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

  async function moveTo(x, y, ms) {
    const from = { ...pos };
    const dist = Math.hypot(x - from.x, y - from.y);
    const total = ms ?? Math.min(900, 250 + dist * 0.9);
    const steps = Math.max(2, Math.round(total / 16));
    for (let i = 1; i <= steps; i++) {
      const t = ease(i / steps);
      await page.mouse.move(from.x + (x - from.x) * t, from.y + (y - from.y) * t);
      await sleep(total / steps);
    }
    pos = { x, y };
  }

  async function box(target) {
    const loc = typeof target === 'string' ? page.locator(target).first() : target;
    await loc.waitFor({ state: 'visible', timeout: 15000 });
    await loc.evaluate((el) => {
      const r = el.getBoundingClientRect();
      if (r.top < 60 || r.bottom > window.innerHeight - 20) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
    // Wait for any smooth scroll to settle, so the box is where the element ends up.
    let b = await loc.boundingBox();
    for (let i = 0; i < 20; i++) {
      await sleep(90);
      const n = await loc.boundingBox();
      if (b && n && Math.abs(n.x - b.x) < 0.5 && Math.abs(n.y - b.y) < 0.5) break;
      b = n;
    }
    if (!b) throw new Error(`no box for ${target}`);
    return b;
  }

  const self = {
    page,
    sleep,
    moveTo,
    get pos() {
      return pos;
    },
    async hover(target, { dx = 0, dy = 0, ms } = {}) {
      const b = await box(target);
      await moveTo(b.x + b.width / 2 + dx, b.y + b.height / 2 + dy, ms);
      return b;
    },
    async click(target, opts = {}) {
      await self.hover(target, opts);
      await sleep(opts.pause ?? 140);
      await page.mouse.down();
      await sleep(70);
      await page.mouse.up();
      await sleep(opts.after ?? 250);
    },
    async clickAt(x, y, { pause = 120, after = 200, double = false } = {}) {
      await moveTo(x, y);
      await sleep(pause);
      await page.mouse.click(x, y, double ? { clickCount: 2 } : {});
      await sleep(after);
    },
    async type(target, text, { delay = 38, clear = false } = {}) {
      await self.click(target);
      if (clear) {
        await page.keyboard.press('Meta+A');
        await page.keyboard.press('Backspace');
      }
      await page.keyboard.type(text, { delay });
      await sleep(200);
    },
    async select(target, label) {
      await self.hover(target);
      const loc = typeof target === 'string' ? page.locator(target).first() : target;
      await loc.selectOption({ label });
      await sleep(300);
    },
    /** A highlight ring around an element (dims the rest) for `ms`. */
    async spot(target, ms = 1600, pad = 6) {
      const b = await box(target);
      await page.evaluate(
        ({ b, ms, pad }) => {
          const s = document.createElement('div');
          s.className = '__film_spot';
          Object.assign(s.style, { left: b.x - pad + 'px', top: b.y - pad + 'px', width: b.width + pad * 2 + 'px', height: b.height + pad * 2 + 'px' });
          document.documentElement.appendChild(s);
          requestAnimationFrame(() => (s.style.opacity = '1'));
          setTimeout(() => {
            s.style.opacity = '0';
            setTimeout(() => s.remove(), 400);
          }, ms);
        },
        { b, ms, pad }
      );
      await sleep(300);
    },
    /** Screen position (CSS px) of a coordinate on the admin map. */
    async mapPx(lat, lng) {
      return page.evaluate(([lat, lng]) => {
        const m = window.__awMap;
        const p = m.latLngToContainerPoint([lat, lng]);
        const r = m.getContainer().getBoundingClientRect();
        return { x: r.left + p.x, y: r.top + p.y };
      }, [lat, lng]);
    },
    async fly(lat, lng, zoom, seconds = 1.6) {
      await page.evaluate(([lat, lng, zoom, s]) => window.__awMap.flyTo([lat, lng], zoom, { duration: s }), [lat, lng, zoom, seconds]);
      await sleep(seconds * 1000 + 350);
    },
    async fitTo(bounds, seconds = 1.4) {
      await page.evaluate(([b, s]) => window.__awMap.flyToBounds(b, { duration: s, padding: [40, 40] }), [bounds, seconds]);
      await sleep(seconds * 1000 + 350);
    },
    async clickMap(lat, lng, opts) {
      const p = await self.mapPx(lat, lng);
      await self.clickAt(p.x, p.y, opts);
    },
    /** Smoothly scroll the inspector (or any scroll box) so `target` is in view. */
    async reveal(target, block = 'center') {
      const loc = typeof target === 'string' ? page.locator(target).first() : target;
      await loc.evaluate((el, block) => el.scrollIntoView({ block, behavior: 'smooth' }), block);
      await sleep(700);
    },
  };
  return self;
}

// --- Capture and encoding -------------------------------------------------------------------

/** Record a page with CDP screencast frames (only sent when the picture changes). */
export async function startCapture(context, page, dir) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const cdp = await context.newCDPSession(page);
  const frames = [];
  let n = 0;
  cdp.on('Page.screencastFrame', async (f) => {
    const file = join(dir, `f${String(n++).padStart(5, '0')}.jpg`);
    writeFileSync(file, Buffer.from(f.data, 'base64'));
    frames.push({ file, t: f.metadata.timestamp });
    try {
      await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId });
    } catch {
      /* page gone */
    }
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 94, maxWidth: W, maxHeight: H, everyNthFrame: 1 });
  const t0 = Date.now() / 1000;
  // Force a first frame even on a still page.
  await page.evaluate(() => document.documentElement.getBoundingClientRect());
  return {
    t0,
    async stop() {
      await sleep(120);
      await cdp.send('Page.stopScreencast');
      await cdp.detach().catch(() => {});
      return { frames, t0, t1: Date.now() / 1000 };
    },
  };
}

/** Turn captured frames + a voice-over into one scene clip (H.264 + AAC, 30 fps). */
export function encodeScene({ frames, t0, t1 }, vo, out, workDir) {
  if (frames.length === 0) throw new Error('no frames captured');
  const total = t1 - t0;
  const list = [];
  for (let i = 0; i < frames.length; i++) {
    const start = i === 0 ? 0 : Math.max(0, frames[i].t - t0);
    const end = i + 1 < frames.length ? Math.max(start, frames[i + 1].t - t0) : total;
    list.push(`file '${frames[i].file}'`, `duration ${Math.max(0.001, end - start).toFixed(4)}`);
  }
  list.push(`file '${frames[frames.length - 1].file}'`);
  const listFile = join(workDir, 'frames.txt');
  writeFileSync(listFile, list.join('\n'));
  const args = ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', listFile];
  const delay = Math.round(LEAD * 1000);
  if (vo) args.push('-i', vo.file);
  else args.push('-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo');
  args.push(
    '-filter_complex',
    `[0:v]scale=${W}:${H}:flags=lanczos,fps=30,format=yuv420p[v];` +
      (vo
        ? `[1:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${delay}|${delay},apad,atrim=0:${total.toFixed(3)}[a]`
        : `[1:a]atrim=0:${total.toFixed(3)}[a]`),
    '-map', '[v]', '-map', '[a]',
    '-t', total.toFixed(3),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-tune', 'stillimage', '-r', '30',
    '-c:a', 'aac', '-b:a', '160k', '-ar', '48000',
    '-movflags', '+faststart',
    out
  );
  run('ffmpeg', args);
  return total;
}

/** Join scene clips into the film (same codecs, so a stream copy). */
export function concatClips(clips, out, workDir) {
  const listFile = join(workDir, 'clips.txt');
  writeFileSync(listFile, clips.map((c) => `file '${c}'`).join('\n'));
  run('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', '-movflags', '+faststart', out]);
}

/** A lighter copy of the film for the admin's help (streams well), plus its poster frame. */
export function webVersion(film, out, poster, posterAt = 3) {
  run('ffmpeg', [
    '-y', '-v', 'error', '-i', film,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '25', '-tune', 'stillimage', '-pix_fmt', 'yuv420p', '-r', '30',
    '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', out,
  ]);
  run('ffmpeg', ['-y', '-v', 'error', '-ss', String(posterAt), '-i', film, '-frames:v', '1', '-q:v', '3', poster]);
}

/** WebVTT captions from each scene's voice lines, offset to where the scene sits in the film. */
export function captions(scenes) {
  const ts = (s) => {
    const ms = Math.round(s * 1000);
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const sec = Math.floor((ms % 60000) / 1000);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`;
  };
  const cues = ['WEBVTT', ''];
  for (const { offset, vo } of scenes) {
    if (!vo) continue;
    for (const l of vo.lines) {
      cues.push(`${ts(offset + LEAD + l.start)} --> ${ts(offset + LEAD + Math.max(l.end, l.start + 1))}`, l.text, '');
    }
  }
  return cues.join('\n');
}
