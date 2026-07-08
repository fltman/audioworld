import { Router } from 'express';
import * as Points from '../models/point';
import { asyncHandler } from '../lib/http';

export const pointsRouter = Router();

pointsRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const data = await Points.update(req.params.id, req.body);
    if (!data) {
      res.status(404).json({ success: false, error: 'Point not found' });
      return;
    }
    res.json({ success: true, data });
  })
);

pointsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const removed = await Points.remove(req.params.id);
    if (!removed) {
      res.status(404).json({ success: false, error: 'Point not found' });
      return;
    }
    res.json({ success: true, data: { id: req.params.id } });
  })
);
