import { randomUUID } from 'node:crypto';
import { existsSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { basename, join } from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import type { UploadListItem, UploadResult } from '@audioworld/shared';
import { UPLOAD_DIR } from '../env';
import { requireRole } from '../lib/auth';
import { asyncHandler } from '../lib/http';
import { clipUsageCounts, deleteMeta, metaFor, replaceClipUrl, setDescription } from '../models/upload';

export const uploadRouter = Router();

// Only authors may upload audio.
uploadRouter.use(requireRole('superuser', 'admin'));

// Map the (client-declared) audio mimetype to a SAFE, server-chosen extension. The
// stored extension must never come from the client's filename: express.static derives
// the response Content-Type from the extension, so a client-controlled ".html"/".svg"
// would be served as text/html on the same origin as the app → stored XSS. Any audio
// type we don't recognize falls back to ".bin" (served as octet-stream, never executed).
const AUDIO_EXT_BY_MIME: Record<string, string> = {
  'audio/mpeg': '.mp3',
  'audio/mp3': '.mp3',
  'audio/mp4': '.m4a',
  'audio/aac': '.aac',
  'audio/x-aac': '.aac',
  'audio/wav': '.wav',
  'audio/x-wav': '.wav',
  'audio/wave': '.wav',
  'audio/ogg': '.ogg',
  'audio/opus': '.opus',
  'audio/webm': '.webm',
  'audio/flac': '.flac',
  'audio/x-flac': '.flac',
};
const safeAudioExt = (mimetype: string): string =>
  AUDIO_EXT_BY_MIME[mimetype.toLowerCase()] ?? '.bin';

// Same rationale for images (POI photos): server-chosen extension from a mime allowlist,
// so a crafted upload can never be served as an executable/HTML type on our origin.
const IMAGE_EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/heic': '.heic',
  'image/heif': '.heif',
};
const safeImageExt = (mimetype: string): string =>
  IMAGE_EXT_BY_MIME[mimetype.toLowerCase()] ?? '.bin';

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  // Never trust the client's filename/extension — derive it from the validated type.
  filename: (_req, file, cb) => cb(null, randomUUID() + safeAudioExt(file.mimetype)),
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('audio/')) cb(null, true);
    else cb(new Error('Only audio files are allowed'));
  },
});

const imageStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => cb(null, randomUUID() + safeImageExt(file.mimetype)),
});
const imageUpload = multer({
  storage: imageStorage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (Object.prototype.hasOwnProperty.call(IMAGE_EXT_BY_MIME, file.mimetype.toLowerCase())) {
      cb(null, true);
    } else cb(new Error('Only JPEG, PNG, WebP, GIF or HEIC images are allowed'));
  },
});

// List previously uploaded audio, newest first, with any author-set descriptions.
uploadRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const files = !existsSync(UPLOAD_DIR)
      ? []
      : readdirSync(UPLOAD_DIR)
          .map((filename) => ({ filename, stat: statSync(join(UPLOAD_DIR, filename)) }))
          .filter(({ stat }) => stat.isFile())
          .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
    const meta = await metaFor(files.map((f) => f.filename));
    const usage = await clipUsageCounts();
    const data: UploadListItem[] = files.map(({ filename, stat }) => ({
      url: `/uploads/${filename}`,
      filename,
      size: stat.size,
      description: meta.get(filename)?.description,
      kind: meta.get(filename)?.kind,
      usedBy: usage.get(`/uploads/${filename}`) ?? 0,
    }));
    res.json({ success: true, data });
  })
);

// Set/clear a clip's library description. Guarded to real files in UPLOAD_DIR so a
// crafted :filename can't write a row for (or read) anything outside the upload dir.
uploadRouter.patch(
  '/:filename',
  asyncHandler(async (req, res) => {
    const { filename } = req.params;
    // Must be a bare filename pointing at a real FILE in UPLOAD_DIR — this rejects
    // '.', '..' and subdirectory names (which existsSync alone would accept).
    const full = join(UPLOAD_DIR, filename);
    if (basename(filename) !== filename || !existsSync(full) || !statSync(full).isFile()) {
      res.status(404).json({ success: false, error: 'Unknown upload' });
      return;
    }
    const raw = (req.body as { description?: unknown } | undefined)?.description;
    const description = typeof raw === 'string' ? raw.trim() : '';
    await setDescription(filename, description);
    res.json({ success: true, data: { filename, description } });
  })
);

/** Bare-filename → its path in UPLOAD_DIR, or null if it isn't a real file there. */
function resolveUpload(filename: string): string | null {
  const full = join(UPLOAD_DIR, filename);
  if (basename(filename) !== filename || !existsSync(full) || !statSync(full).isFile()) return null;
  return full;
}

// Swap every reference to one clip for another across points, guides and zones — used
// when deleting a clip that's still in use. Both are bare filenames in UPLOAD_DIR.
uploadRouter.post(
  '/replace',
  asyncHandler(async (req, res) => {
    const b = (req.body ?? {}) as { from?: unknown; to?: unknown; deleteFrom?: unknown };
    if (typeof b.from !== 'string' || typeof b.to !== 'string') {
      res.status(400).json({ success: false, error: 'from and to filenames are required' });
      return;
    }
    if (!resolveUpload(b.to)) {
      res.status(404).json({ success: false, error: 'Replacement clip not found' });
      return;
    }
    const changed = await replaceClipUrl(`/uploads/${b.from}`, `/uploads/${b.to}`);
    if (b.deleteFrom === true) {
      const full = resolveUpload(b.from);
      if (full) {
        unlinkSync(full);
        await deleteMeta(b.from);
      }
    }
    res.json({ success: true, data: { changed } });
  })
);

// Delete a clip (file + metadata). Points still referencing it are left with an empty
// audio url, which the pre-publish flight check flags — use /replace to reassign first.
uploadRouter.delete(
  '/:filename',
  asyncHandler(async (req, res) => {
    const { filename } = req.params;
    const full = resolveUpload(filename);
    if (!full) {
      res.status(404).json({ success: false, error: 'Unknown upload' });
      return;
    }
    unlinkSync(full);
    await deleteMeta(filename);
    res.json({ success: true, data: { filename } });
  })
);

uploadRouter.post('/', (req, res) => {
  upload.single('file')(req, res, (err: unknown) => {
    if (err) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      res.status(400).json({ success: false, error: message });
      return;
    }
    if (!req.file) {
      res.status(400).json({ success: false, error: 'No file uploaded (field "file")' });
      return;
    }
    const data: UploadResult = {
      url: `/uploads/${req.file.filename}`,
      filename: req.file.filename,
      size: req.file.size,
      mimetype: req.file.mimetype,
    };
    res.status(201).json({ success: true, data });
  });
});

// POI photos (scouting). Separate allowlist/limit from audio; same safe-extension policy.
uploadRouter.post('/image', (req, res) => {
  imageUpload.single('file')(req, res, (err: unknown) => {
    if (err) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      res.status(400).json({ success: false, error: message });
      return;
    }
    if (!req.file) {
      res.status(400).json({ success: false, error: 'No file uploaded (field "file")' });
      return;
    }
    const data: UploadResult = {
      url: `/uploads/${req.file.filename}`,
      filename: req.file.filename,
      size: req.file.size,
      mimetype: req.file.mimetype,
    };
    res.status(201).json({ success: true, data });
  });
});
