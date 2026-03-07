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

export async function discoverFromAmazon(keywords: string[]): Promise<DiscoveredProduct[]> {
  const mockPool = [
    { name: 'Massage Gun', category: 'Fitness & Health', rating: 4.4, reviews: 1800, trend: 84, virality: 72, price: 59 },
    { name: 'Portable Blender', category: 'Kitchen', rating: 4.2, reviews: 2200, trend: 83, virality: 78, price: 27 },
    { name: 'Car Phone Holder', category: 'Car', rating: 4.5, reviews: 6200, trend: 76, virality: 58, price: 13 },
    { name: 'Galaxy Projector', category: 'Home', rating: 4.3, reviews: 3100, trend: 81, virality: 75, price: 33 },
  ];

  const results: DiscoveredProduct[] = [];

  for (const keyword of keywords) {
    const filtered = mockPool.filter((p) => {
      const haystack = `${p.name} ${p.category}`.toLowerCase();
      return haystack.includes(keyword.toLowerCase()) || keyword.length < 4;
    });

    const sourceItems = filtered.length ? filtered : mockPool.slice(0, 3);

    for (const item of sourceItems) {
      const saudi = estimateSaudiRelevance(item.name, item.category, [keyword]);
      const impulse = estimateImpulseBuy(item.price, item.virality);
      const margin = estimateMargin(item.price);
      const supplierTrust = 70;
      const shipping = 55;
      const competition = estimateCompetition('amazon', item.reviews);
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
        id: makeId(`amazon-${item.name}-${keyword}`),
        name: item.name,
        name_ar: null,
        category: item.category,
        source: 'amazon',
        source_url: `https://www.amazon.sa/s?k=${encodeURIComponent(item.name)}`,
        price: item.price,
        currency: 'USD',
        rating: item.rating,
        review_count: item.reviews,
        image_url: null,
        keywords: [keyword],
        trend_signal: 'amazon_bestseller',
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
          platform: 'amazon',
          discovery_mode: 'starter-mock',
        },
      });
    }
  }

  return dedupeProducts(results);
}
