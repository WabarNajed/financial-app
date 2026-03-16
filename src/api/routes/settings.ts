import { Router, Request, Response } from 'express';
import { getSetting, setSetting, getSettingsByCategory, getBudgetSettings, getAutomationMode } from '../../services/settings.service';
import { getDb } from '../../database/connection';
import { isDatabaseAvailable } from '../../database/connection';
import { getIntegrationStatuses } from '../../config';
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
    const fields = ['total_ad_budget', 'daily_budget', 'test_campaign_budget', 'scaling_budget', 'max_cpa', 'min_roas'];
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

// ── Diagnostics ──────────────────────────────────────────────────────────────
router.get('/diagnostics', async (_req: Request, res: Response) => {
  try {
    const integrations = getIntegrationStatuses();
    const dbUp = isDatabaseAvailable();

    // Check Salla from DB config
    let sallaStatus = 'not_configured';
    try {
      const db = getDb();
      const sallaConfig = await db('integrations_salla').where({ is_active: true }).first();
      if (sallaConfig) sallaStatus = 'configured';
    } catch { /* table may not exist */ }

    res.json({
      postgresql: dbUp ? 'connected' : 'unavailable',
      openai: integrations.find(i => i.name === 'OpenAI')?.status || 'unknown',
      salla_integration: sallaStatus,
      discovery_sources: {
        tiktok: 'active',
        amazon_sa: 'active',
        aliexpress: integrations.find(i => i.name === 'RapidAPI (AliExpress)')?.status || 'unknown',
        google_trends: 'active',
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch diagnostics' });
  }
});

export default router;
