import { Router, Request, Response } from 'express';
import { getDb } from '../../database/connection';
import { testSallaConnection, getSallaConfig } from '../../services/salla-sync.service';
import { testEmailConnection } from '../../services/email.service';
import {
  listAdPlatforms, getAdPlatform, upsertAdPlatform,
  setAdPlatformActive, setAdPlatformMode,
} from '../../services/ad-platform.service';
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
        last_test_status: config.last_test_status,
        last_test_message: config.last_test_message,
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

// ── Save Salla config (encrypt secrets) ──────────────────────────────────────
router.post('/salla', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { store_name, client_id, client_secret, access_token, refresh_token, webhook_secret, store_url } = req.body;

    const existing = await db('integrations_salla').first();
    const data: any = {
      store_name: store_name || null,
      client_id: client_id ? encrypt(client_id) : (existing?.client_id || null),
      client_secret: client_secret ? encrypt(client_secret) : (existing?.client_secret || null),
      access_token: access_token ? encrypt(access_token) : (existing?.access_token || null),
      refresh_token: refresh_token ? encrypt(refresh_token) : (existing?.refresh_token || null),
      webhook_secret: webhook_secret ? encrypt(webhook_secret) : (existing?.webhook_secret || null),
      store_url: store_url || null,
      updated_at: new Date(),
    };

    if (existing) {
      await db('integrations_salla').where({ id: existing.id }).update(data);
    } else {
      await db('integrations_salla').insert(data);
    }

    logger.info('[integrations] Salla config saved (encrypted)');
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
    // Persist test result
    const db = getDb();
    const config = await db('integrations_salla').first();
    if (config) {
      await db('integrations_salla').where({ id: config.id }).update({
        last_test_status: result.connected ? 'success' : 'failed',
        last_test_message: result.connected ? `Connected to ${result.store_name}` : (result.error || 'Failed'),
        updated_at: new Date(),
      });
    }
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
      'id', 'email_address', 'display_name', 'smtp_host', 'smtp_port',
      'imap_host', 'imap_port', 'is_active', 'last_test_status', 'last_test_message',
      'created_at', 'updated_at',
    );
    res.json({ data: accounts });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch email accounts' });
  }
});

router.post('/email', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { id, email_address, display_name, smtp_host, smtp_port, imap_host, imap_port, email_password } = req.body;
    if (!email_address) { res.status(400).json({ error: 'email_address required' }); return; }

    if (id) {
      // Update existing
      const updates: any = {
        email_address,
        display_name: display_name || null,
        smtp_host: smtp_host || null,
        smtp_port: smtp_port || 587,
        imap_host: imap_host || null,
        imap_port: imap_port || 993,
        updated_at: new Date(),
      };
      if (email_password) updates.email_password_encrypted = encrypt(email_password);
      await db('email_accounts').where({ id }).update(updates);
      logger.info(`[integrations] email account updated: ${email_address}`);
      res.json({ success: true, id, updated: true });
    } else {
      const [row] = await db('email_accounts').insert({
        email_address,
        display_name: display_name || null,
        smtp_host: smtp_host || null,
        smtp_port: smtp_port || 587,
        imap_host: imap_host || null,
        imap_port: imap_port || 993,
        email_password_encrypted: email_password ? encrypt(email_password) : null,
      }).returning('id');
      logger.info(`[integrations] email account saved: ${email_address}`);
      res.json({ success: true, id: row.id, created: true });
    }
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to save email account' });
  }
});

router.post('/email/test', async (req: Request, res: Response) => {
  try {
    const { id } = req.body;
    const result = await testEmailConnection(id);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ success: false, error: 'Email test failed' });
  }
});

router.post('/email/enable', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { id } = req.body;
    const account = id
      ? await db('email_accounts').where({ id }).first()
      : await db('email_accounts').first();
    if (!account) { res.status(400).json({ error: 'No email account found' }); return; }
    await db('email_accounts').where({ id: account.id }).update({ is_active: true, updated_at: new Date() });
    logger.info(`[integrations] email enabled: ${account.email_address}`);
    res.json({ success: true, is_active: true });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to enable email' });
  }
});

router.post('/email/disable', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { id } = req.body;
    const account = id
      ? await db('email_accounts').where({ id }).first()
      : await db('email_accounts').where({ is_active: true }).first();
    if (!account) { res.status(400).json({ error: 'No email account found' }); return; }
    await db('email_accounts').where({ id: account.id }).update({ is_active: false, updated_at: new Date() });
    logger.info(`[integrations] email disabled: ${account.email_address}`);
    res.json({ success: true, is_active: false });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to disable email' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// AD PLATFORM INTEGRATION (Section 16)
// ═══════════════════════════════════════════════════════════════════════════

router.get('/ads', async (_req: Request, res: Response) => {
  try {
    const platforms = await listAdPlatforms();
    res.json({ data: platforms });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch ad platforms' });
  }
});

router.get('/ads/:platform', async (req: Request, res: Response) => {
  try {
    const platform = await getAdPlatform(req.params.platform);
    if (!platform) { res.json({ data: null, configured: false }); return; }
    res.json({ data: platform, configured: true });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch ad platform' });
  }
});

router.post('/ads', async (req: Request, res: Response) => {
  try {
    const { platform } = req.body;
    if (!platform) { res.status(400).json({ error: 'platform required' }); return; }
    const validPlatforms = ['tiktok_ads', 'snapchat_ads', 'meta_ads'];
    if (!validPlatforms.includes(platform)) {
      res.status(400).json({ error: `Invalid platform. Use: ${validPlatforms.join(', ')}` });
      return;
    }
    const result = await upsertAdPlatform(req.body);
    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to save ad platform credentials' });
  }
});

router.post('/ads/:platform/enable', async (req: Request, res: Response) => {
  try {
    const updated = await setAdPlatformActive(req.params.platform, true);
    if (!updated) { res.status(404).json({ error: 'Platform not found' }); return; }
    res.json({ success: true, is_active: true });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to enable ad platform' });
  }
});

router.post('/ads/:platform/disable', async (req: Request, res: Response) => {
  try {
    const updated = await setAdPlatformActive(req.params.platform, false);
    if (!updated) { res.status(404).json({ error: 'Platform not found' }); return; }
    res.json({ success: true, is_active: false });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to disable ad platform' });
  }
});

router.post('/ads/:platform/mode', async (req: Request, res: Response) => {
  try {
    const { mode } = req.body;
    if (!['simulation', 'live'].includes(mode)) {
      res.status(400).json({ error: 'mode must be "simulation" or "live"' });
      return;
    }
    const updated = await setAdPlatformMode(req.params.platform, mode);
    if (!updated) { res.status(404).json({ error: 'Platform not found' }); return; }
    res.json({ success: true, mode });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to set mode' });
  }
});

export default router;
