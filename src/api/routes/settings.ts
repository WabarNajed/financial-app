import { Router, Request, Response } from 'express';
import { getSetting, setSetting, getSettingsByCategory, getBudgetSettings, getAutomationMode } from '../../services/settings.service';
import { getDb } from '../../database/connection';
import { isDatabaseAvailable } from '../../database/connection';
import { getIntegrationStatuses, env } from '../../config';
import { toNumber } from '../../utils/number-safe';
import logger from '../../utils/logger';

const router = Router();

// ── Get all settings by category ─────────────────────────────────────────────
router.get('/', async (req: Request, res: Response) => {
  try {
    const category = req.query.category ? String(req.query.category) : undefined;
    if (category) {
      const settings = await getSettingsByCategory(category);
      res.json({ data: settings });
    } else {
      const db = getDb();
      const rows = await db('platform_settings').orderBy('category').orderBy('setting_key');
      const grouped: Record<string, Record<string, string>> = {};
      for (const row of rows) {
        if (!grouped[row.category]) grouped[row.category] = {};
        grouped[row.category][row.setting_key] = row.setting_value;
      }
      res.json({ data: grouped });
    }
  } catch (error: any) {
    logger.error(`[settings] GET / error: ${error?.message}`);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// ── Update settings ──────────────────────────────────────────────────────────
router.post('/', async (req: Request, res: Response) => {
  try {
    const { settings, category = 'general' } = req.body;
    if (!settings || typeof settings !== 'object') {
      res.status(400).json({ error: 'settings object required' });
      return;
    }
    for (const [key, value] of Object.entries(settings)) {
      await setSetting(key, String(value), category);
    }
    res.json({ success: true });
  } catch (error: any) {
    logger.error(`[settings] POST / error: ${error?.message}`);
    res.status(500).json({ error: 'Failed to save settings' });
  }
});

// ── Budget settings ──────────────────────────────────────────────────────────
router.get('/budget', async (_req: Request, res: Response) => {
  try {
    const budget = await getBudgetSettings();
    res.json({ data: budget });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch budget settings' });
  }
});

router.post('/budget', async (req: Request, res: Response) => {
  try {
    const fields = [
      'total_ad_budget', 'daily_budget', 'test_campaign_budget', 'scaling_budget',
      'max_cpa', 'min_roas', 'emergency_stop_budget', 'max_daily_burn',
      'max_products_testing_at_once',
    ];
    for (const f of fields) {
      if (req.body[f] !== undefined) {
        await setSetting(f, String(req.body[f]), 'budget', 'number');
      }
    }
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to save budget settings' });
  }
});

// ── Automation mode ──────────────────────────────────────────────────────────
router.get('/automation-mode', async (_req: Request, res: Response) => {
  try {
    const mode = await getAutomationMode();
    res.json({ mode });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch automation mode' });
  }
});

router.post('/automation-mode', async (req: Request, res: Response) => {
  try {
    const { mode } = req.body;
    if (!['manual', 'assisted', 'auto'].includes(mode)) {
      res.status(400).json({ error: 'mode must be manual, assisted, or auto' });
      return;
    }
    await setSetting('automation_mode', mode, 'general');
    res.json({ success: true, mode });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to save automation mode' });
  }
});

// ── Full Diagnostics (Section 21) ────────────────────────────────────────────
router.get('/diagnostics', async (_req: Request, res: Response) => {
  try {
    const envIntegrations = getIntegrationStatuses();
    const dbUp = isDatabaseAvailable();
    const db = getDb();

    // Salla from DB config
    let sallaStatus: any = { status: 'not_configured', missing: 'No Salla credentials in database', impact: 'Cannot push products to store', fallback: 'Configure in Integrations → Salla' };
    try {
      const sallaConfig = await db('integrations_salla').where({ is_active: true }).first();
      if (sallaConfig) {
        sallaStatus = {
          status: sallaConfig.last_test_status === 'success' ? 'connected' : 'configured',
          store_name: sallaConfig.store_name,
          last_test: sallaConfig.last_test_status,
          last_test_message: sallaConfig.last_test_message,
          is_active: true,
        };
      }
    } catch { /* table may not exist */ }

    // Email from DB config
    let emailStatus: any = { status: 'not_configured', missing: 'No email account', impact: 'Cannot send/receive emails', fallback: 'Configure in Integrations → Email' };
    try {
      const emailAccount = await db('email_accounts').where({ is_active: true }).first();
      if (emailAccount) {
        emailStatus = {
          status: emailAccount.last_test_status === 'success' ? 'connected' : 'configured',
          email: emailAccount.email_address,
          last_test: emailAccount.last_test_status,
          last_test_message: emailAccount.last_test_message,
          is_active: true,
        };
      }
    } catch { /* table may not exist */ }

    // Ad platforms from DB
    const adPlatforms: Record<string, any> = {};
    const platformNames = ['tiktok_ads', 'snapchat_ads', 'meta_ads'];
    for (const name of platformNames) {
      try {
        const cred = await db('ad_platform_credentials').where({ platform: name }).first();
        if (cred) {
          adPlatforms[name] = {
            status: cred.is_active ? 'active' : 'configured',
            mode: cred.mode,
            has_credentials: !!(cred.api_key_encrypted || cred.access_token_encrypted),
          };
        } else {
          adPlatforms[name] = { status: 'not_configured', fallback: 'simulation' };
        }
      } catch {
        adPlatforms[name] = { status: 'not_configured', fallback: 'simulation' };
      }
    }

    // Stats
    let imageCoverage = 0;
    let missingImages = 0;
    let supplierIssues = 0;
    let unreadEmails = 0;
    let activeCampaigns = 0;
    let avgRoas = 0;

    try {
      const products = await db('products').select('image_urls');
      let withImages = 0;
      for (const p of products) {
        const imgs = typeof p.image_urls === 'string' ? JSON.parse(p.image_urls) : (p.image_urls || []);
        if (Array.isArray(imgs) && imgs.length > 0) withImages++;
        else missingImages++;
      }
      imageCoverage = products.length > 0 ? Math.round((withImages / products.length) * 100) : 0;
    } catch { /* ok */ }

    try {
      const [{ count }] = await db('supplier_mappings')
        .whereIn('supplier_last_stock_status', ['out_of_stock', 'removed'])
        .count('id as count');
      supplierIssues = Number(count);
    } catch { /* ok */ }

    try {
      const [{ count }] = await db('email_messages')
        .where({ direction: 'inbound', is_read: false })
        .count('id as count');
      unreadEmails = Number(count);
    } catch { /* ok */ }

    try {
      const [{ count }] = await db('ad_campaigns')
        .whereIn('status', ['testing', 'scaled'])
        .count('id as count');
      activeCampaigns = Number(count);
      const perfRow = await db('ad_campaigns')
        .whereIn('status', ['testing', 'scaled'])
        .avg('roas as avg_roas')
        .first();
      avgRoas = toNumber(perfRow?.avg_roas);
    } catch { /* ok */ }

    res.json({
      postgresql: dbUp ? 'connected' : 'unavailable',
      openai: envIntegrations.find(i => i.name.includes('LLM'))?.status || 'unknown',
      salla_integration: sallaStatus,
      email_integration: emailStatus,
      ad_platforms: adPlatforms,
      discovery_sources: {
        aliexpress: envIntegrations.find(i => i.name === 'AliExpress')?.status || 'unknown',
        alibaba: envIntegrations.find(i => i.name === 'Alibaba')?.status || 'unknown',
        tiktok: 'active',
        amazon_sa: 'active',
        google_trends: 'active',
      },
      n8n: envIntegrations.find(i => i.name === 'n8n Automation')?.status || 'unknown',
      stats: {
        image_coverage_pct: imageCoverage,
        products_missing_images: missingImages,
        supplier_issues: supplierIssues,
        unread_email_count: unreadEmails,
        active_campaigns: activeCampaigns,
        average_roas: avgRoas,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch diagnostics' });
  }
});

export default router;
