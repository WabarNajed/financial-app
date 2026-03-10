import { getDb } from '../database/connection';
import logger from '../utils/logger';

export interface OptimizationDecision {
  campaign_id: string;
  action: 'kill' | 'scale' | 'maintain' | 'launch_new';
  reason: string;
  new_budget?: number;
}

const KILL_CTR_THRESHOLD = 1.0;   // Kill if CTR < 1%
const KILL_CPA_MULTIPLIER = 1.5;  // Kill if CPA > 1.5x target
const SCALE_ROAS_THRESHOLD = 2.0; // Scale if ROAS > 2
const SCALE_BUDGET_MULTIPLIER = 1.5;
const AGGRESSIVE_ROAS_THRESHOLD = 3.0;
const AGGRESSIVE_BUDGET_MULTIPLIER = 2.0;

/**
 * Evaluate a single campaign and return optimization decision.
 */
export function evaluateCampaign(campaign: any, targetCpa: number = 30): OptimizationDecision {
  const ctr = campaign.ctr || 0;
  const cpa = campaign.cpa || Infinity;
  const roas = campaign.roas || 0;

  // Kill conditions
  if (ctr < KILL_CTR_THRESHOLD && campaign.impressions > 500) {
    return {
      campaign_id: campaign.id,
      action: 'kill',
      reason: `CTR ${ctr.toFixed(2)}% below ${KILL_CTR_THRESHOLD}% threshold (${campaign.impressions} impressions)`,
    };
  }

  if (cpa > targetCpa * KILL_CPA_MULTIPLIER && campaign.clicks > 20) {
    return {
      campaign_id: campaign.id,
      action: 'kill',
      reason: `CPA ${cpa.toFixed(2)} SAR exceeds ${(targetCpa * KILL_CPA_MULTIPLIER).toFixed(2)} SAR ceiling`,
    };
  }

  // Scale conditions
  if (roas >= AGGRESSIVE_ROAS_THRESHOLD) {
    return {
      campaign_id: campaign.id,
      action: 'scale',
      reason: `ROAS ${roas.toFixed(2)}x qualifies for aggressive scale`,
      new_budget: Math.round((campaign.budget || 50) * AGGRESSIVE_BUDGET_MULTIPLIER),
    };
  }

  if (roas >= SCALE_ROAS_THRESHOLD) {
    return {
      campaign_id: campaign.id,
      action: 'scale',
      reason: `ROAS ${roas.toFixed(2)}x qualifies for scale`,
      new_budget: Math.round((campaign.budget || 50) * SCALE_BUDGET_MULTIPLIER),
    };
  }

  return {
    campaign_id: campaign.id,
    action: 'maintain',
    reason: `CTR=${ctr.toFixed(2)}% CPA=${cpa.toFixed(2)} ROAS=${roas.toFixed(2)} - within acceptable range`,
  };
}

/**
 * Get scaling stage for a campaign.
 */
export function getScalingStage(campaign: any): string {
  const roas = campaign.roas || 0;
  const budget = campaign.budget || 0;

  if (campaign.status === 'testing') return 'testing';
  if (roas >= 2.0 && budget < 200) return 'validation';
  if (roas >= 2.0 && budget >= 200 && budget < 500) return 'scale';
  if (roas >= 2.5 && budget >= 500) return 'aggressive_scale';
  return 'testing';
}

/**
 * Run optimization across all active/testing campaigns.
 */
export async function runOptimizationCycle(): Promise<{ decisions: OptimizationDecision[]; killed: number; scaled: number }> {
  const db = getDb();
  const campaigns = await db('ad_campaigns').whereIn('status', ['testing', 'scaled']).orderBy('created_at', 'desc');

  const decisions: OptimizationDecision[] = [];
  let killed = 0;
  let scaled = 0;

  for (const campaign of campaigns) {
    const decision = evaluateCampaign(campaign);
    decisions.push(decision);

    if (decision.action === 'kill') {
      await db('ad_campaigns').where({ id: campaign.id }).update({ status: 'killed', updated_at: new Date() });
      killed++;
    } else if (decision.action === 'scale' && decision.new_budget) {
      await db('ad_campaigns').where({ id: campaign.id }).update({
        status: 'scaled',
        budget: decision.new_budget,
        updated_at: new Date(),
      });
      scaled++;
    }
  }

  logger.info(`[ad-optimization] cycle complete: killed=${killed} scaled=${scaled} total=${campaigns.length}`);
  return { decisions, killed, scaled };
}

/**
 * Simulate ad performance for testing (generates realistic mock data).
 */
export function simulateAdPerformance(budget: number): {
  impressions: number; clicks: number; ctr: number; cpc: number;
  conversions: number; cpa: number; roas: number;
} {
  // Realistic simulation ranges for Saudi dropshipping
  const ctrBase = 0.5 + Math.random() * 3.5; // 0.5% - 4%
  const impressions = Math.round(budget * (80 + Math.random() * 120)); // 80-200 impressions per SAR
  const clicks = Math.round(impressions * ctrBase / 100);
  const ctr = clicks > 0 ? (clicks / impressions) * 100 : 0;
  const cpc = clicks > 0 ? budget / clicks : 0;
  const convRate = 0.5 + Math.random() * 4; // 0.5% - 4.5% conversion
  const conversions = Math.max(0, Math.round(clicks * convRate / 100));
  const cpa = conversions > 0 ? budget / conversions : 0;
  const avgOrderValue = 80 + Math.random() * 120; // 80-200 SAR
  const revenue = conversions * avgOrderValue;
  const roas = budget > 0 ? revenue / budget : 0;

  return {
    impressions, clicks,
    ctr: Math.round(ctr * 100) / 100,
    cpc: Math.round(cpc * 100) / 100,
    conversions,
    cpa: Math.round(cpa * 100) / 100,
    roas: Math.round(roas * 100) / 100,
  };
}
