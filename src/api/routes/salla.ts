import { Router, Request, Response } from 'express';
import { SallaIntegration } from '../../integrations/salla';
import logger from '../../utils/logger';

const router = Router();
const salla = new SallaIntegration();

// Get Salla connection status
router.get('/status', (_req: Request, res: Response) => {
  res.json({
    data: {
      configured: salla.isConfigured(),
      oauth_url: salla.isConfigured() ? null : salla.getOAuthUrl(),
    },
  });
});

// OAuth callback
router.get('/callback', async (req: Request, res: Response) => {
  try {
    const { code } = req.query;
    if (!code) {
      res.status(400).json({ error: 'Missing authorization code' });
      return;
    }

    const tokens = await salla.handleOAuthCallback(String(code));
    res.json({
      data: {
        message: 'Salla connected successfully. Save these tokens to your .env file.',
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
      },
    });
  } catch (error) {
    logger.error(`Salla OAuth callback error: ${error}`);
    res.status(500).json({ error: 'OAuth callback failed' });
  }
});

// List products from Salla
router.get('/products', async (req: Request, res: Response) => {
  try {
    const page = Number(req.query.page) || 1;
    const products = await salla.listProducts(page);
    res.json({ data: products });
  } catch (error) {
    logger.error(`GET /salla/products error: ${error}`);
    res.status(500).json({ error: String(error) });
  }
});

// Refresh token
router.post('/refresh-token', async (_req: Request, res: Response) => {
  try {
    const token = await salla.refreshAccessToken();
    res.json({ data: { message: 'Token refreshed', access_token: token } });
  } catch (error) {
    logger.error(`Salla token refresh error: ${error}`);
    res.status(500).json({ error: String(error) });
  }
});

export default router;
