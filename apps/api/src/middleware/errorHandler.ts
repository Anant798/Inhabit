import { Request, Response, NextFunction } from 'express';

export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('Command interpretation error:', err);
  res.status(500).json({ error: err.message || 'Failed to interpret command' });
};
