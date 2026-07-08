import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import type { UploadResult } from '@audioworld/shared';
import { UPLOAD_DIR } from '../env';

export const uploadRouter = Router();

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
