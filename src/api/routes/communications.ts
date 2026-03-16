import { Router, Request, Response } from 'express';
import { getDb } from '../../database/connection';
import logger from '../../utils/logger';

const router = Router();

// ── List communications ──────────────────────────────────────────────────────
router.get('/', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { direction, channel, order_id, limit = '50', offset = '0' } = req.query;

    let query = db('communications').orderBy('created_at', 'desc');

    if (direction) query = query.where({ direction: String(direction) });
    if (channel) query = query.where({ channel: String(channel) });
    if (order_id) query = query.where({ order_id: String(order_id) });

    const data = await query.limit(Number(limit)).offset(Number(offset));
    const [{ count }] = await db('communications').count('id as count');

    res.json({ data, total: Number(count) });
  } catch (error: any) {
    logger.error(`[comms] GET / error: ${error?.message}`);
    res.status(500).json({ error: 'Failed to fetch communications' });
  }
});

// ── Search communications by order number ────────────────────────────────────
router.get('/search', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { q } = req.query;
    if (!q) { res.status(400).json({ error: 'q param required' }); return; }

    const searchTerm = `%${String(q)}%`;

    // Find order by salla_order_id
    const order = await db('orders').where('salla_order_id', 'ilike', searchTerm).first();

    let comms: any[] = [];
    if (order) {
      comms = await db('communications').where({ order_id: order.id }).orderBy('created_at', 'desc');
    }

    // Also search subject/body
    const bodyMatches = await db('communications')
      .where('subject', 'ilike', searchTerm)
      .orWhere('body', 'ilike', searchTerm)
      .orderBy('created_at', 'desc')
      .limit(20);

    // Merge and dedupe
    const ids = new Set(comms.map((c: any) => c.id));
    for (const m of bodyMatches) {
      if (!ids.has(m.id)) { comms.push(m); ids.add(m.id); }
    }

    res.json({ data: comms, order: order || null });
  } catch (error: any) {
    logger.error(`[comms] GET /search error: ${error?.message}`);
    res.status(500).json({ error: 'Search failed' });
  }
});

// ── Email templates ──────────────────────────────────────────────────────────
router.get('/templates', async (_req: Request, res: Response) => {
  try {
    const db = getDb();
    const templates = await db('email_templates').orderBy('template_name');
    res.json({ data: templates });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

router.post('/templates', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { template_name, subject, body_ar, body_en, placeholders } = req.body;
    if (!template_name) { res.status(400).json({ error: 'template_name required' }); return; }

    const existing = await db('email_templates').where({ template_name }).first();
    if (existing) {
      await db('email_templates').where({ id: existing.id }).update({
        subject, body_ar, body_en,
        placeholders: JSON.stringify(placeholders || []),
        updated_at: new Date(),
      });
      res.json({ success: true, id: existing.id, updated: true });
    } else {
      const [row] = await db('email_templates').insert({
        template_name, subject, body_ar, body_en,
        placeholders: JSON.stringify(placeholders || []),
      }).returning('id');
      res.json({ success: true, id: row.id, created: true });
    }
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to save template' });
  }
});

export default router;
