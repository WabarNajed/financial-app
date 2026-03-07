import { DiscoveredProduct } from './types';
import {
  clamp,
  dedupeProducts,
  estimateCompetition,
  estimateImpulseBuy,
  estimateMargin,
  estimateSaudiRelevance,
  makeId,
  scoreFinal,
} from './utils';

export async function discoverFromTikTok(keywords: string[]): Promise<DiscoveredProduct[]> {
  const mockPool = [
    { name: 'Portable Blender', category: 'Kitchen', virality: 92, trend: 90 },
    { name: 'Galaxy Projector', category: 'Home', virality: 88, trend: 87 },
    { name: 'Ice Face Roller', category: 'Beauty', virality: 81, trend: 79 },
    { name: 'Mini Thermal Printer', category: 'Tech', virality: 84, trend: 76 },
    { name: 'Car Vacuum Cleaner', category: 'Car', virality: 74, trend: 73 },
    { name: 'LED Quran Speaker', category: 'Home', virality: 69, trend: 77 },
  ];

  const results: DiscoveredProduct[] = [];

  for (const keyword of keywords) {
    const kwTokens = keyword.toLowerCase().split(/\s+/).filter(Boolean);

    const filtered = mockPool.filter((p) => {
      const haystack = `${p.name} ${p.category}`.toLowerCase();
      // Require at least one keyword token to appear in product name/category
      return kwTokens.some((t) => haystack.includes(t));
    });

    // No blind fallback — if nothing matches, skip this keyword
    const sourceItems = filtered;

    for (const item of sourceItems) {
      const saudi = estimateSaudiRelevance(item.name, item.category, [keyword]);
      const price = item.category === 'Tech' ? 29 : item.category === 'Kitchen' ? 24 : 18;
      const impulse = estimateImpulseBuy(price, item.virality);
      const margin = estimateMargin(price);
      const supplierTrust = 58;
      const shipping = 62;
      const competition = estimateCompetition('tiktok', 200);
      const finalScore = scoreFinal({
        trend_score: item.trend,
        virality_score: item.virality,
        margin_score: margin,
        shipping_score: shipping,
        supplier_trust_score: supplierTrust,
        competition_score: competition,
        saudi_relevance_score: saudi,
        impulse_buy_score: impulse,
      });

      results.push({
        id: makeId(`tiktok-${item.name}-${keyword}`),
        name: item.name,
        name_ar: null,
        category: item.category,
        source: 'tiktok',
        source_url: `https://www.tiktok.com/search?q=${encodeURIComponent(item.name)}`,
        price,
        currency: 'USD',
        rating: null,
        review_count: null,
        image_url: null,
        keywords: [keyword],
        trend_signal: 'tiktok_viral',
        virality_score: item.virality,
        impulse_buy_score: impulse,
        saudi_relevance_score: saudi,
        supplier_trust_score: supplierTrust,
        shipping_score: shipping,
        margin_score: margin,
        competition_score: competition,
        trend_score: item.trend,
        final_score: finalScore,
        metadata: {
          platform: 'tiktok',
          discovery_mode: 'starter-mock',
        },
      });
    }
  }

  return dedupeProducts(results).map((x) => ({
    ...x,
    virality_score: clamp(x.virality_score),
  }));
}
