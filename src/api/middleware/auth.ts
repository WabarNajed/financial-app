import { Request, Response, NextFunction } from 'express';
import { env } from '../../config';

export function adminAuth(req: Request, res: Response, next: NextFunction): void {
  const apiKey = req.headers['x-api-key'] || req.query.api_key;

  if (!apiKey || apiKey !== env.ADMIN_API_KEY) {
    res.status(401).json({ error: 'Unauthorized. Provide valid X-API-Key header.' });
    return;
  }

  next();
}
