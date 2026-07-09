import { randomUUID } from 'node:crypto';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import type { UploadListItem, UploadResult } from '@audioworld/shared';
import { UPLOAD_DIR } from '../env';
import { requireRole } from '../lib/auth';
import { asyncHandler } from '../lib/http';
import { descriptionsFor, setDescription } from '../models/upload';

export const uploadRouter = Router();

// Only authors may upload audio.
uploadRouter.use(requireRole('superuser', 'admin'));

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => cb(null, randomUUID() + extname(file.originalname)),
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('audio/')) cb(null, true);
    else cb(new Error('Only audio files are allowed'));
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
    const descriptions = await descriptionsFor(files.map((f) => f.filename));
    const data: UploadListItem[] = files.map(({ filename, stat }) => ({
      url: `/uploads/${filename}`,
      filename,
      size: stat.size,
      description: descriptions.get(filename),
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
