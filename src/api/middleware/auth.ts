import { Request, Response, NextFunction } from 'express';
import { env } from '../../config';
import logger from '../../utils/logger';

let warnedDefaultKey = false;

export function adminAuth(req: Request, res: Response, next: NextFunction): void {
  // Warn once if using default dev key in production
  if (!warnedDefaultKey && env.NODE_ENV === 'production' && env.ADMIN_API_KEY === 'changeme') {
    logger.error('SECURITY: Using default ADMIN_API_KEY in production! Change it immediately.');
    warnedDefaultKey = true;
  }

  const apiKey = req.headers['x-api-key'] || req.query.api_key;

  if (!apiKey || apiKey !== env.ADMIN_API_KEY) {
    res.status(401).json({
      error: 'Unauthorized. Provide a valid X-API-Key header.',
      hint: env.NODE_ENV === 'development' ? 'Set ADMIN_API_KEY in .env and pass it via X-API-Key header.' : undefined,
    });
    return;
  }

  next();
}
