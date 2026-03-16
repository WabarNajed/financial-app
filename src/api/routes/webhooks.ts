import { Router, Request, Response } from 'express';
import { ingestSallaOrder } from '../../services/orders.service';
import logger from '../../utils/logger';

const router = Router();

// ── Salla order webhook (no auth — validated by webhook secret) ──────────────
router.post('/salla/order-created', async (req: Request, res: Response) => {
  try {
    const payload = req.body?.data || req.body;

    if (!payload || (!payload.id && !payload.reference_id)) {
      logger.warn('[webhook] salla/order-created: empty or invalid payload');
      res.status(400).json({ error: 'Invalid payload' });
      return;
    }

    logger.info(`[webhook] salla/order-created received: id=${payload.id || payload.reference_id}`);
    const result = await ingestSallaOrder(payload);

    res.json({ success: true, ...result });
  } catch (error: any) {
    logger.error(`[webhook] salla/order-created error: ${error?.message}`);
    res.status(500).json({ error: 'Failed to process order webhook' });
  }
});

// ── Salla order status updated ───────────────────────────────────────────────
router.post('/salla/order-updated', async (req: Request, res: Response) => {
  try {
    const payload = req.body?.data || req.body;
    logger.info(`[webhook] salla/order-updated received: id=${payload?.id}`);
    // Future: update order status in DB
    res.json({ success: true, message: 'acknowledged' });
  } catch (error: any) {
    logger.error(`[webhook] salla/order-updated error: ${error?.message}`);
    res.status(500).json({ error: 'Failed to process webhook' });
  }
});

export default router;
