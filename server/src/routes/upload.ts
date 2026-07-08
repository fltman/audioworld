import { randomUUID } from 'node:crypto';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import type { UploadResult } from '@audioworld/shared';
import { UPLOAD_DIR } from '../env';
import { requireRole } from '../lib/auth';

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

// List previously uploaded audio, newest first.
uploadRouter.get('/', (_req, res) => {
  const files = !existsSync(UPLOAD_DIR)
    ? []
    : readdirSync(UPLOAD_DIR)
        .map((filename) => ({ filename, stat: statSync(join(UPLOAD_DIR, filename)) }))
        .filter(({ stat }) => stat.isFile())
        .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs)
        .map(({ filename, stat }) => ({
          url: `/uploads/${filename}`,
          filename,
          size: stat.size,
        }));
  res.json({ success: true, data: files });
});

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
