import { Router, Request, Response } from 'express';
import { MarketingService } from '../../marketing';
import { MarketingRepo } from '../../database/repositories';
import logger from '../../utils/logger';

const router = Router();
const marketingService = new MarketingService();

// Get queued marketing assets
router.get('/queue', async (req: Request, res: Response) => {
  try {
    const platform = req.query.platform as string | undefined;
    const assets = await marketingService.getQueuedAssets(platform);
    res.json({ data: assets });
  } catch (error) {
    logger.error(`GET /marketing/queue error: ${error}`);
    res.status(500).json({ error: 'Failed to fetch marketing queue' });
  }
});

// Get marketing assets for a product
router.get('/product/:id', async (req: Request, res: Response) => {
  try {
    const assets = await MarketingRepo.findByProductId(req.params.id);
    res.json({ data: assets });
  } catch (error) {
    logger.error(`GET /marketing/product/:id error: ${error}`);
    res.status(500).json({ error: 'Failed to fetch assets' });
  }
});

// Mark asset as sent
router.post('/:id/sent', async (req: Request, res: Response) => {
  try {
    await marketingService.markAsSent(req.params.id);
    res.json({ data: { status: 'sent' } });
  } catch (error) {
    logger.error(`POST /marketing/:id/sent error: ${error}`);
    res.status(500).json({ error: 'Failed to update asset' });
  }
});

export default router;
