import crypto from 'crypto';
import { DiscoveredProduct } from './types';

export function makeId(input: string): string {
  return crypto.createHash('md5').update(input).digest('hex');
}

export function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

export function scoreFinal(input: {
  trend_score: number;
  virality_score: number;
  margin_score: number;
  shipping_score: number;
  supplier_trust_score: number;
  competition_score: number;
  saudi_relevance_score: number;
  impulse_buy_score: number;
}): number {
  const competitionBonus = 100 - input.competition_score;

  const finalScore =
    input.trend_score * 0.18 +
    input.virality_score * 0.16 +
    input.margin_score * 0.16 +
    input.shipping_score * 0.12 +
    input.supplier_trust_score * 0.12 +
    competitionBonus * 0.10 +
    input.saudi_relevance_score * 0.10 +
    input.impulse_buy_score * 0.06;

  return Number(clamp(finalScore).toFixed(2));
}

export function normalizeKeyword(keyword: string): string {
  return keyword.trim().toLowerCase();
}

export function dedupeProducts(products: DiscoveredProduct[]): DiscoveredProduct[] {
  const map = new Map<string, DiscoveredProduct>();

  for (const item of products) {
    const key = normalizeKeyword(item.name);
    const existing = map.get(key);

    if (!existing) {
      map.set(key, item);
      continue;
    }

    if (item.final_score > existing.final_score) {
      map.set(key, item);
    }
  }

  return Array.from(map.values()).sort((a, b) => b.final_score - a.final_score);
}

export function estimateSaudiRelevance(name: string, category: string, keywords: string[]): number {
  const text = `${name} ${category} ${keywords.join(' ')}`.toLowerCase();

  let score = 55;

  const positive = [
    'portable',
    'kitchen',
    'fitness',
    'home',
    'led',
    'projector',
    'blender',
    'beauty',
    'car',
    'travel',
    'smart',
    'wireless',
    'saudi',
    'ramadan',
    'gift',
  ];

  const negative = [
    'winter coat',
    'snow',
    'halloween',
    'heavy industrial',
  ];

  for (const p of positive) {
    if (text.includes(p)) score += 4;
  }

  for (const n of negative) {
    if (text.includes(n)) score -= 8;
  }

  return clamp(score);
}

export function estimateImpulseBuy(price?: number | null, virality = 60): number {
  let score = 50;

  if (price == null) score += 5;
  else if (price <= 25) score += 30;
  else if (price <= 60) score += 20;
  else if (price <= 120) score += 10;
  else score -= 10;

  score += (virality - 50) * 0.3;

  return Number(clamp(score).toFixed(2));
}

export function estimateMargin(price?: number | null): number {
  if (price == null) return 45;
  if (price <= 10) return 35;
  if (price <= 20) return 50;
  if (price <= 40) return 65;
  if (price <= 80) return 55;
  return 40;
}

export function estimateCompetition(source: string, reviewCount?: number | null): number {
  let score = 40;

  if (source === 'amazon') score += 15;
  if (source === 'tiktok') score += 5;
  if (source === 'aliexpress') score += 10;

  if ((reviewCount ?? 0) > 5000) score += 20;
  else if ((reviewCount ?? 0) > 1000) score += 10;
  else if ((reviewCount ?? 0) < 100) score -= 5;

  return Number(clamp(score).toFixed(2));
}
