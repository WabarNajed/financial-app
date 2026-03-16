import { Router, Request, Response } from 'express';
import { listOrders, getOrderDetail, updateOrderStatus } from '../../services/orders.service';
import { getDb } from '../../database/connection';
import logger from '../../utils/logger';
import { toNumber } from '../../utils/number-safe';

const router = Router();

// ── List orders ──────────────────────────────────────────────────────────────
router.get('/', async (req: Request, res: Response) => {
  try {
    const { status, search, limit = '50', offset = '0' } = req.query;
    const result = await listOrders({
      status: status ? String(status) : undefined,
      search: search ? String(search) : undefined,
      limit: Number(limit),
      offset: Number(offset),
    });
    res.json(result);
  } catch (error: any) {
    logger.error(`[orders] GET / error: ${error?.message}`);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// ── Get order detail ─────────────────────────────────────────────────────────
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const order = await getOrderDetail(req.params.id);
    if (!order) { res.status(404).json({ error: 'Order not found' }); return; }
    res.json({ data: order });
  } catch (error: any) {
    logger.error(`[orders] GET /:id error: ${error?.message}`);
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

// ── Update order status ──────────────────────────────────────────────────────
router.post('/:id/status', async (req: Request, res: Response) => {
  try {
    const { status } = req.body;
    if (!status) { res.status(400).json({ error: 'status required' }); return; }
    await updateOrderStatus(req.params.id, status);
    res.json({ success: true, order_id: req.params.id, status });
  } catch (error: any) {
    logger.error(`[orders] POST /:id/status error: ${error?.message}`);
    res.status(500).json({ error: 'Failed to update order status' });
  }
});

// ── Order stats ──────────────────────────────────────────────────────────────
router.get('/stats/summary', async (_req: Request, res: Response) => {
  try {
    const db = getDb();
    const [{ count: total }] = await db('orders').count('id as count');
    const [{ count: pending }] = await db('orders').where({ order_status: 'pending' }).count('id as count');
    const [{ count: fulfilled }] = await db('orders').where({ order_status: 'fulfilled' }).count('id as count');
    const revenueResult = await db('orders').sum('order_total as total_revenue').first();

    res.json({
      total: Number(total),
      pending: Number(pending),
      fulfilled: Number(fulfilled),
      total_revenue: toNumber(revenueResult?.total_revenue),
    });
  } catch (error: any) {
    logger.error(`[orders] GET /stats/summary error: ${error?.message}`);
    res.status(500).json({ error: 'Failed to fetch order stats' });
  }
});

export default router;
