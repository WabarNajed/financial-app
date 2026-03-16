import { Router, Request, Response } from 'express';
import { listAlerts, markAlertRead, markAlertResolved, getUnreadCount } from '../../services/alerts.service';
import logger from '../../utils/logger';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const { is_read, alert_type, limit = '50', offset = '0' } = req.query;
    const result = await listAlerts({
      is_read: is_read !== undefined ? is_read === 'true' : undefined,
      alert_type: alert_type ? String(alert_type) : undefined,
      limit: Number(limit),
      offset: Number(offset),
    });
    res.json(result);
  } catch (error: any) {
    logger.error(`[alerts] GET / error: ${error?.message}`);
    res.status(500).json({ error: 'Failed to fetch alerts' });
  }
});

router.get('/unread-count', async (_req: Request, res: Response) => {
  try {
    const count = await getUnreadCount();
    res.json({ unread: count });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch unread count' });
  }
});

router.post('/:id/read', async (req: Request, res: Response) => {
  try {
    await markAlertRead(req.params.id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to mark alert read' });
  }
});

router.post('/:id/resolve', async (req: Request, res: Response) => {
  try {
    await markAlertResolved(req.params.id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to resolve alert' });
  }
});

export default router;
