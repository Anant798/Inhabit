import type { Request, Response, NextFunction } from 'express';

type HttpError = Error & { status?: number; statusCode?: number; code?: string };

export const errorHandler = (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const error = err instanceof Error ? err as HttpError : new Error('Failed to process request');
  const status = Number(error.status ?? error.statusCode);
  const safeStatus = status >= 400 && status < 600 ? status : 502;

  console.error('API request failed:', {
    message: error.message,
    status: Number.isFinite(status) ? status : undefined,
    code: error.code
  });

  res.status(safeStatus).json({
    error: error.message || 'Upstream AI request failed',
    status: safeStatus,
    code: error.code ?? null
  });
};
