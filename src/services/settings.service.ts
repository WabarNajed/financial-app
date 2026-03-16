import { getDb } from '../database/connection';
import logger from '../utils/logger';

/**
 * Get a platform setting by key.
 */
export async function getSetting(key: string): Promise<string | null> {
  const db = getDb();
  const row = await db('platform_settings').where({ setting_key: key }).first();
  return row?.setting_value ?? null;
}

/**
 * Get multiple settings by category.
 */
export async function getSettingsByCategory(category: string): Promise<Record<string, string>> {
  const db = getDb();
  const rows = await db('platform_settings').where({ category });
  const result: Record<string, string> = {};
  for (const row of rows) {
    result[row.setting_key] = row.setting_value;
  }
  return result;
}

/**
 * Set a platform setting (upsert).
 */
export async function setSetting(key: string, value: string, category = 'general', type = 'string'): Promise<void> {
  const db = getDb();
  const existing = await db('platform_settings').where({ setting_key: key }).first();
  if (existing) {
    await db('platform_settings').where({ id: existing.id }).update({
      setting_value: value,
      updated_at: new Date(),
    });
  } else {
    await db('platform_settings').insert({
      setting_key: key,
      setting_value: value,
      setting_type: type,
      category,
    });
  }
  logger.info(`[settings] ${key} = ${key.includes('secret') || key.includes('password') ? '••••' : value}`);
}

/**
 * Set multiple settings at once.
 */
export async function setSettings(settings: Record<string, string>, category = 'general'): Promise<void> {
  for (const [key, value] of Object.entries(settings)) {
    await setSetting(key, value, category);
  }
}

/**
 * Get all budget-related settings.
 */
export async function getBudgetSettings(): Promise<Record<string, number>> {
  const raw = await getSettingsByCategory('budget');
  return {
    total_ad_budget: Number(raw.total_ad_budget) || 5000,
    daily_budget: Number(raw.daily_budget) || 500,
    test_campaign_budget: Number(raw.test_campaign_budget) || 50,
    scaling_budget: Number(raw.scaling_budget) || 200,
    max_cpa: Number(raw.max_cpa) || 30,
    min_roas: Number(raw.min_roas) || 2,
  };
}

/**
 * Get the current automation mode.
 */
export async function getAutomationMode(): Promise<'manual' | 'assisted' | 'auto'> {
  const mode = await getSetting('automation_mode');
  if (mode === 'assisted' || mode === 'auto') return mode;
  return 'manual';
}
