import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ValidationError } from './mapping';

/** Wrap an async handler so rejected promises reach the error middleware. */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler {
  return (req, res, next) => {
    void fn(req, res, next).catch(next);
  };
}

/** Terminal error middleware: emits the ApiResponse envelope with a sane status. */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof ValidationError) {
    res.status(400).json({ success: false, error: err.message });
    return;
  }

  const status =
    typeof (err as { status?: unknown })?.status === 'number'
      ? (err as { status: number }).status
      : typeof (err as { statusCode?: unknown })?.statusCode === 'number'
        ? (err as { statusCode: number }).statusCode
        : 500;

  // For 5xx, don't leak internal error text (Postgres details, stack messages) to the
  // client — log it server-side and return a generic message. Sub-500s (thrown with an
  // explicit status) carry an intentional, safe message.
  if (status >= 500) {
    console.error('[error]', err);
    res.status(status).json({ success: false, error: 'Internal server error' });
    return;
  }
  const message = err instanceof Error ? err.message : 'Request failed';
  res.status(status).json({ success: false, error: message });
}
