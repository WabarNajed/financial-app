import { getDb } from '../database/connection';
import logger from '../utils/logger';
import { toNumber, round2, safeDivide, fmt, normalizeCampaignRow } from '../utils/number-safe';

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
 * All numeric fields are safely converted from potential DB strings.
 */
export function evaluateCampaign(campaign: any, targetCpa: number = 30): OptimizationDecision {
  const ctr = toNumber(campaign.ctr);
  const cpa = toNumber(campaign.cpa);
  const roas = toNumber(campaign.roas);
  const impressions = toNumber(campaign.impressions);
  const clicks = toNumber(campaign.clicks);
  const budget = toNumber(campaign.budget, 50);

  logger.info(`[campaign] evaluate id=${campaign.id} ctr=${fmt(ctr)}% cpa=${fmt(cpa)} roas=${fmt(roas)} impressions=${impressions}`);

  // Kill conditions
  if (ctr < KILL_CTR_THRESHOLD && impressions > 500) {
    return {
      campaign_id: campaign.id,
      action: 'kill',
      reason: `CTR ${fmt(ctr)}% below ${KILL_CTR_THRESHOLD}% threshold (${impressions} impressions)`,
    };
  }

  if (cpa > targetCpa * KILL_CPA_MULTIPLIER && clicks > 20) {
    return {
      campaign_id: campaign.id,
      action: 'kill',
      reason: `CPA ${fmt(cpa)} SAR exceeds ${fmt(targetCpa * KILL_CPA_MULTIPLIER)} SAR ceiling`,
    };
  }

  // Scale conditions
  if (roas >= AGGRESSIVE_ROAS_THRESHOLD) {
    return {
      campaign_id: campaign.id,
      action: 'scale',
      reason: `ROAS ${fmt(roas)}x qualifies for aggressive scale`,
      new_budget: Math.round(budget * AGGRESSIVE_BUDGET_MULTIPLIER),
    };
  }

  if (roas >= SCALE_ROAS_THRESHOLD) {
    return {
      campaign_id: campaign.id,
      action: 'scale',
      reason: `ROAS ${fmt(roas)}x qualifies for scale`,
      new_budget: Math.round(budget * SCALE_BUDGET_MULTIPLIER),
    };
  }

  return {
    campaign_id: campaign.id,
    action: 'maintain',
    reason: `CTR=${fmt(ctr)}% CPA=${fmt(cpa)} ROAS=${fmt(roas)} - within acceptable range`,
  };
}

/**
 * Get scaling stage for a campaign.
 */
export function getScalingStage(campaign: any): string {
  const roas = toNumber(campaign.roas);
  const budget = toNumber(campaign.budget);

  if (campaign.status === 'testing') return 'testing';
  if (roas >= 2.0 && budget < 200) return 'validation';
  if (roas >= 2.0 && budget >= 200 && budget < 500) return 'scale';
  if (roas >= 2.5 && budget >= 500) return 'aggressive_scale';
  return 'testing';
}

/**
 * Run optimization across all active/testing campaigns.
 * Normalizes every DB row before evaluation.
 */
export async function runOptimizationCycle(): Promise<{ decisions: OptimizationDecision[]; killed: number; scaled: number }> {
  const db = getDb();
  const rawCampaigns = await db('ad_campaigns').whereIn('status', ['testing', 'scaled']).orderBy('created_at', 'desc');

  const decisions: OptimizationDecision[] = [];
  let killed = 0;
  let scaled = 0;

  for (const raw of rawCampaigns) {
    const campaign = normalizeCampaignRow(raw);
    const decision = evaluateCampaign(campaign);
    decisions.push(decision);

    if (decision.action === 'kill') {
      await db('ad_campaigns').where({ id: campaign.id }).update({ status: 'killed', updated_at: new Date() });
      killed++;
      logger.info(`[optimize] campaign id=${campaign.id} decision=kill reason=${decision.reason}`);
    } else if (decision.action === 'scale' && decision.new_budget) {
      await db('ad_campaigns').where({ id: campaign.id }).update({
        status: 'scaled',
        budget: decision.new_budget,
        scaling_stage: getScalingStage({ ...campaign, budget: decision.new_budget }),
        updated_at: new Date(),
      });
      scaled++;
      logger.info(`[optimize] campaign id=${campaign.id} decision=scale new_budget=${decision.new_budget} reason=${decision.reason}`);
    } else {
      logger.info(`[optimize] campaign id=${campaign.id} decision=maintain reason=${decision.reason}`);
    }
  }

  logger.info(`[optimize] cycle complete: killed=${killed} scaled=${scaled} total=${rawCampaigns.length}`);
  return { decisions, killed, scaled };
}

/**
 * Simulate ad performance for testing (generates realistic mock data).
 * Returns clean numeric values safe for DB writes.
 */
export function simulateAdPerformance(budget: number): {
  impressions: number; clicks: number; ctr: number; cpc: number;
  conversions: number; cpa: number; roas: number;
} {
  const safeBudget = toNumber(budget, 50);

  // Realistic simulation ranges for Saudi dropshipping
  const ctrBase = 0.5 + Math.random() * 3.5; // 0.5% - 4%
  const impressions = Math.round(safeBudget * (80 + Math.random() * 120)); // 80-200 impressions per SAR
  const clicks = Math.round(impressions * ctrBase / 100);
  const ctr = safeDivide(clicks, impressions) * 100;
  const cpc = safeDivide(safeBudget, clicks);
  const convRate = 0.5 + Math.random() * 4; // 0.5% - 4.5% conversion
  const conversions = Math.max(0, Math.round(clicks * convRate / 100));
  const cpa = safeDivide(safeBudget, conversions);
  const avgOrderValue = 80 + Math.random() * 120; // 80-200 SAR
  const revenue = conversions * avgOrderValue;
  const roas = safeDivide(revenue, safeBudget);

  const result = {
    impressions,
    clicks,
    ctr: round2(ctr),
    cpc: round2(cpc),
    conversions,
    cpa: round2(cpa),
    roas: round2(roas),
  };

  logger.info(`[campaign] simulation budget=${safeBudget} impressions=${impressions} clicks=${clicks} ctr=${fmt(result.ctr)}% roas=${fmt(result.roas)}`);
  return result;
}
