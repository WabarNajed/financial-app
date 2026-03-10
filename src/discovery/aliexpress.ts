import { DiscoveredProduct } from './types';
import {
  dedupeProducts,
  estimateCompetition,
  estimateImpulseBuy,
  estimateMargin,
  estimateSaudiRelevance,
  makeId,
  scoreFinal,
} from './utils';
import logger from '../utils/logger';

const RAPID_HOST = process.env.RAPIDAPI_HOST || 'alibaba-datahub.p.rapidapi.com';
const RAPID_KEY = process.env.RAPIDAPI_KEY || '';

// Log discovery mode once at module load
if (RAPID_KEY) {
  logger.info('[aliexpress] Discovery mode: RapidAPI live search');
} else {
  logger.info('[aliexpress] Discovery mode: mock fallback pool (set RAPIDAPI_KEY for live data)');
}

async function tryRapidApiSample(keyword: string): Promise<DiscoveredProduct[]> {
  if (!RAPID_KEY) return [];

  try {
    const url = `https://${RAPID_HOST}/item_search?q=${encodeURIComponent(keyword)}`;

    const response = await fetch(url, {
      headers: {
        'X-RapidAPI-Key': RAPID_KEY,
        'X-RapidAPI-Host': RAPID_HOST,
      },
    });

    if (!response.ok) return [];

    const json: any = await response.json();
    const items = Array.isArray(json?.data) ? json.data.slice(0, 5) : [];

    return items.map((item: any) => {
      const name = item.title || item.name || keyword;
      const category = item.categoryName || 'General';
      const price = Number(item.price || item.salePrice || 0) || 0;
      const reviewCount = Number(item.orders || item.reviewCount || 0) || 0;
      const rating = Number(item.rating || 0) || null;

      const trend = reviewCount > 1000 ? 86 : reviewCount > 300 ? 75 : 62;
      const virality = reviewCount > 1000 ? 72 : 58;
      const saudi = estimateSaudiRelevance(name, category, [keyword]);
      const impulse = estimateImpulseBuy(price, virality);
      const margin = estimateMargin(price);
      const supplierTrust = rating ? Number((rating / 5) * 100) : 55;
      const shipping = 60;
      const competition = estimateCompetition('aliexpress', reviewCount);
      const finalScore = scoreFinal({
        trend_score: trend,
        virality_score: virality,
        margin_score: margin,
        shipping_score: shipping,
        supplier_trust_score: supplierTrust,
        competition_score: competition,
        saudi_relevance_score: saudi,
        impulse_buy_score: impulse,
      });

      return {
        id: makeId(`aliexpress-${name}-${keyword}`),
        name,
        name_ar: null,
        category,
        source: 'aliexpress' as const,
        source_url: item.itemUrl || item.url || 'https://www.aliexpress.com',
        price,
        currency: item.currency || 'USD',
        rating,
        review_count: reviewCount,
        image_url: item.image || item.imageUrl || null,
        keywords: [keyword],
        trend_signal: 'supplier_live',
        virality_score: virality,
        impulse_buy_score: impulse,
        saudi_relevance_score: saudi,
        supplier_trust_score: supplierTrust,
        shipping_score: shipping,
        margin_score: margin,
        competition_score: competition,
        trend_score: trend,
        final_score: finalScore,
        metadata: {
          platform: 'aliexpress',
          discovery_mode: 'rapidapi',
        },
      } satisfies DiscoveredProduct;
    });
  } catch {
    return [];
  }
}

export async function discoverFromAliExpress(keywords: string[]): Promise<DiscoveredProduct[]> {
  const fallbackPool = [
    { name: 'Mini Thermal Printer', category: 'Tech', price: 18, trend: 78, virality: 83, supplierTrust: 74 },
    { name: 'Portable Blender', category: 'Kitchen', price: 14, trend: 82, virality: 86, supplierTrust: 79 },
    { name: 'Galaxy Projector', category: 'Home', price: 21, trend: 79, virality: 82, supplierTrust: 76 },
    { name: 'Car Vacuum Cleaner', category: 'Car', price: 17, trend: 72, virality: 65, supplierTrust: 73 },
  ];

  const results: DiscoveredProduct[] = [];

  for (const keyword of keywords) {
    const rapid = await tryRapidApiSample(keyword);
    if (rapid.length) {
      results.push(...rapid);
      continue;
    }

    const kwTokens = keyword.toLowerCase().split(/\s+/).filter(Boolean);

    const filtered = fallbackPool.filter((p) => {
      const haystack = `${p.name} ${p.category}`.toLowerCase();
      // Require at least one keyword token to appear in product name/category
      return kwTokens.some((t) => haystack.includes(t));
    });

    // No blind fallback — if nothing matches, skip this keyword
    const sourceItems = filtered;

    for (const item of sourceItems) {
      const saudi = estimateSaudiRelevance(item.name, item.category, [keyword]);
      const impulse = estimateImpulseBuy(item.price, item.virality);
      const margin = estimateMargin(item.price);
      const shipping = 68;
      const competition = estimateCompetition('aliexpress', 500);
      const finalScore = scoreFinal({
        trend_score: item.trend,
        virality_score: item.virality,
        margin_score: margin,
        shipping_score: shipping,
        supplier_trust_score: item.supplierTrust,
        competition_score: competition,
        saudi_relevance_score: saudi,
        impulse_buy_score: impulse,
      });

      results.push({
        id: makeId(`aliexpress-${item.name}-${keyword}`),
        name: item.name,
        name_ar: null,
        category: item.category,
        source: 'aliexpress',
        source_url: `https://www.aliexpress.com/wholesale?SearchText=${encodeURIComponent(item.name)}`,
        price: item.price,
        currency: 'USD',
        rating: 4.5,
        review_count: 500,
        image_url: null,
        keywords: [keyword],
        trend_signal: 'supplier_fallback',
        virality_score: item.virality,
        impulse_buy_score: impulse,
        saudi_relevance_score: saudi,
        supplier_trust_score: item.supplierTrust,
        shipping_score: shipping,
        margin_score: margin,
        competition_score: competition,
        trend_score: item.trend,
        final_score: finalScore,
        metadata: {
          platform: 'aliexpress',
          discovery_mode: RAPID_KEY ? 'rapidapi' : 'fallback-mock',
        },
      });
    }
  }

  return dedupeProducts(results);
}
