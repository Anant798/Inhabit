import type { Request, Response, NextFunction } from 'express';

export const errorHandler = (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('API error:', err);
  const message = err instanceof Error ? err.message : 'Failed to process request';
  res.status(500).json({ error: message });
};
