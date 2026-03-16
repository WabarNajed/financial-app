import { Router, Request, Response } from 'express';
import { getDb } from '../../database/connection';
import { testSallaConnection, getSallaConfig } from '../../services/salla-sync.service';
import { encrypt, decrypt, maskSecret } from '../../utils/crypto';
import logger from '../../utils/logger';

const router = Router();

// ═══════════════════════════════════════════════════════════════════════════
// SALLA INTEGRATION
// ═══════════════════════════════════════════════════════════════════════════

// ── Get Salla config (masked secrets) ────────────────────────────────────────
router.get('/salla', async (_req: Request, res: Response) => {
  try {
    const db = getDb();
    const config = await db('integrations_salla').first();
    if (!config) {
      res.json({ data: null, configured: false });
      return;
    }

    res.json({
      data: {
        id: config.id,
        store_name: config.store_name,
        client_id: maskSecret(config.client_id),
        client_secret: maskSecret(config.client_secret),
        access_token: maskSecret(config.access_token),
        refresh_token: maskSecret(config.refresh_token),
        webhook_secret: maskSecret(config.webhook_secret),
        store_url: config.store_url,
        is_active: config.is_active,
        created_at: config.created_at,
        updated_at: config.updated_at,
      },
      configured: true,
    });
  } catch (error: any) {
    logger.error(`[integrations] GET /salla error: ${error?.message}`);
    res.status(500).json({ error: 'Failed to fetch Salla config' });
  }
});

// ── Save Salla config ────────────────────────────────────────────────────────
router.post('/salla', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { store_name, client_id, client_secret, access_token, refresh_token, webhook_secret, store_url } = req.body;

    const existing = await db('integrations_salla').first();
    const data: any = {
      store_name: store_name || null,
      client_id: client_id || null,
      client_secret: client_secret || null,
      access_token: access_token || null,
      refresh_token: refresh_token || null,
      webhook_secret: webhook_secret || null,
      store_url: store_url || null,
      updated_at: new Date(),
    };

    if (existing) {
      await db('integrations_salla').where({ id: existing.id }).update(data);
    } else {
      await db('integrations_salla').insert(data);
    }

    logger.info('[integrations] Salla config saved');
    res.json({ success: true });
  } catch (error: any) {
    logger.error(`[integrations] POST /salla error: ${error?.message}`);
    res.status(500).json({ error: 'Failed to save Salla config' });
  }
});

// ── Test Salla connection ────────────────────────────────────────────────────
router.post('/salla/test', async (_req: Request, res: Response) => {
  try {
    const result = await testSallaConnection();
    res.json(result);
  } catch (error: any) {
    logger.error(`[integrations] POST /salla/test error: ${error?.message}`);
    res.status(500).json({ connected: false, error: 'Connection test failed' });
  }
});

// ── Enable/disable Salla ─────────────────────────────────────────────────────
router.post('/salla/enable', async (_req: Request, res: Response) => {
  try {
    const db = getDb();
    const config = await db('integrations_salla').first();
    if (!config) { res.status(400).json({ error: 'No Salla config found. Save config first.' }); return; }
    await db('integrations_salla').where({ id: config.id }).update({ is_active: true, updated_at: new Date() });
    logger.info('[integrations] Salla enabled');
    res.json({ success: true, is_active: true });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to enable Salla' });
  }
});

router.post('/salla/disable', async (_req: Request, res: Response) => {
  try {
    const db = getDb();
    const config = await db('integrations_salla').first();
    if (!config) { res.status(400).json({ error: 'No Salla config found' }); return; }
    await db('integrations_salla').where({ id: config.id }).update({ is_active: false, updated_at: new Date() });
    logger.info('[integrations] Salla disabled');
    res.json({ success: true, is_active: false });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to disable Salla' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// EMAIL INTEGRATION
// ═══════════════════════════════════════════════════════════════════════════

router.get('/email', async (_req: Request, res: Response) => {
  try {
    const db = getDb();
    const accounts = await db('email_accounts').select(
      'id', 'email_address', 'smtp_host', 'smtp_port', 'imap_host', 'imap_port', 'is_active', 'created_at',
    );
    res.json({ data: accounts });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch email accounts' });
  }
});

router.post('/email', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { email_address, smtp_host, smtp_port, imap_host, imap_port, email_password } = req.body;
    if (!email_address) { res.status(400).json({ error: 'email_address required' }); return; }

    const [row] = await db('email_accounts').insert({
      email_address,
      smtp_host: smtp_host || null,
      smtp_port: smtp_port || 587,
      imap_host: imap_host || null,
      imap_port: imap_port || 993,
      email_password_encrypted: email_password ? encrypt(email_password) : null,
    }).returning('id');

    logger.info(`[integrations] email account saved: ${email_address}`);
    res.json({ success: true, id: row.id });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to save email account' });
  }
});

export default router;
