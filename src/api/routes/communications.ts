import { Router, Request, Response } from 'express';
import { getDb } from '../../database/connection';
import { sendEmail, sendTemplatedEmail, listEmailMessages, fillTemplate, seedDefaultTemplates } from '../../services/email.service';
import logger from '../../utils/logger';

const router = Router();

// ── List communications (unified view) ──────────────────────────────────────
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

// ── Email messages (detailed email view) ────────────────────────────────────
router.get('/emails', async (req: Request, res: Response) => {
  try {
    const { direction, order_id, limit = '50', offset = '0' } = req.query;
    const result = await listEmailMessages({
      direction: direction ? String(direction) : undefined,
      order_id: order_id ? String(order_id) : undefined,
      limit: Number(limit),
      offset: Number(offset),
    });
    res.json(result);
  } catch (error: any) {
    logger.error(`[comms] GET /emails error: ${error?.message}`);
    res.status(500).json({ error: 'Failed to fetch emails' });
  }
});

// ── Send email ──────────────────────────────────────────────────────────────
router.post('/send-email', async (req: Request, res: Response) => {
  try {
    const { to, subject, body, order_id, template_name, template_data } = req.body;

    if (template_name) {
      // Templated email
      const result = await sendTemplatedEmail({
        template_name,
        to,
        data: template_data || {},
        order_id,
      });
      res.json(result);
      return;
    }

    if (!to || !subject || !body) {
      res.status(400).json({ error: 'to, subject, and body required (or template_name + to)' });
      return;
    }

    const result = await sendEmail({ to, subject, body, order_id });
    res.json(result);
  } catch (error: any) {
    logger.error(`[comms] POST /send-email error: ${error?.message}`);
    res.status(500).json({ success: false, error: 'Failed to send email' });
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

// ── Preview template with data ───────────────────────────────────────────────
router.post('/templates/preview', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { template_name, data } = req.body;
    if (!template_name) { res.status(400).json({ error: 'template_name required' }); return; }

    const template = await db('email_templates').where({ template_name }).first();
    if (!template) { res.status(404).json({ error: 'Template not found' }); return; }

    const subject = fillTemplate(template.subject || '', data || {});
    const body_en = fillTemplate(template.body_en || '', data || {});
    const body_ar = fillTemplate(template.body_ar || '', data || {});

    res.json({ subject, body_en, body_ar });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to preview template' });
  }
});

// ── Test send template ───────────────────────────────────────────────────────
router.post('/templates/test-send', async (req: Request, res: Response) => {
  try {
    const { template_name, to, data } = req.body;
    if (!template_name || !to) { res.status(400).json({ error: 'template_name and to required' }); return; }

    const result = await sendTemplatedEmail({
      template_name,
      to,
      data: data || {},
    });
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ success: false, error: 'Test send failed' });
  }
});

// ── Seed default templates ───────────────────────────────────────────────────
router.post('/templates/seed', async (_req: Request, res: Response) => {
  try {
    const count = await seedDefaultTemplates();
    res.json({ success: true, seeded: count });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to seed templates' });
  }
});

export default router;
