import { DiscoveredProduct, SourceAdapter } from '../types';
import logger from '../utils/logger';

/**
 * TikTok Trends adapter.
 *
 * TikTok does not provide a public trends API. This adapter uses a structured
 * approach based on known viral product categories in the Saudi/MENA market.
 *
 * In production, this can be enhanced with:
 * - TikTok Creative Center API (requires partner access)
 * - Third-party TikTok analytics tools (e.g., Pipiads, Kalodata)
 * - Manual keyword feeds updated periodically
 *
 * Currently labeled as SEMI-AUTOMATED - requires periodic keyword updates.
 */
export class TikTokTrendsAdapter implements SourceAdapter {
  name = 'tiktok_trends';
  enabled = true;

  // Saudi TikTok trending product categories and keywords
  // Updated periodically based on manual research
  private trendingKeywords: { keyword: string; category: string; virality: number }[] = [
    { keyword: 'LED projector', category: 'Electronics', virality: 85 },
    { keyword: 'portable blender', category: 'Kitchen', virality: 90 },
    { keyword: 'car phone holder', category: 'Automotive', virality: 75 },
    { keyword: 'teeth whitening kit', category: 'Beauty & Personal Care', virality: 80 },
    { keyword: 'ring light', category: 'Electronics', virality: 70 },
    { keyword: 'massage gun', category: 'Fitness & Health', virality: 88 },
    { keyword: 'mini washing machine', category: 'Home', virality: 72 },
    { keyword: 'wireless earbuds', category: 'Electronics', virality: 65 },
    { keyword: 'smart watch', category: 'Electronics', virality: 78 },
    { keyword: 'aroma diffuser', category: 'Home', virality: 82 },
    { keyword: 'hair straightener brush', category: 'Beauty & Personal Care', virality: 77 },
    { keyword: 'ice roller', category: 'Beauty & Personal Care', virality: 85 },
    { keyword: 'car vacuum cleaner', category: 'Automotive', virality: 68 },
    { keyword: 'selfie stick tripod', category: 'Electronics', virality: 60 },
    { keyword: 'kitchen organizer', category: 'Kitchen', virality: 65 },
    { keyword: 'posture corrector', category: 'Fitness & Health', virality: 73 },
    { keyword: 'pet grooming glove', category: 'Pets', virality: 62 },
    { keyword: 'electric nail file', category: 'Beauty & Personal Care', virality: 70 },
    { keyword: 'galaxy projector', category: 'Home', virality: 88 },
    { keyword: 'resistance bands set', category: 'Fitness & Health', virality: 75 },
  ];

  async discover(keywords?: string[]): Promise<DiscoveredProduct[]> {
    const entries = keywords?.length
      ? this.trendingKeywords.filter(t =>
          keywords.some(k => t.keyword.toLowerCase().includes(k.toLowerCase()))
        )
      : this.trendingKeywords;

    const products: DiscoveredProduct[] = entries.map(entry => ({
      name: entry.keyword,
      category: entry.category,
      source: this.name,
      source_url: `https://www.tiktok.com/search?q=${encodeURIComponent(entry.keyword)}`,
      trend_signal: 'tiktok_viral',
      virality_score: entry.virality,
      impulse_buy_score: this.estimateImpulseBuy(entry.category),
      saudi_relevance_score: 75,
      image_urls: [],
      keywords: [entry.keyword.toLowerCase()],
      status: 'discovered' as const,
      discovered_at: new Date(),
      metadata: {
        source_type: 'semi_automated',
        note: 'Keywords curated from TikTok trending analysis. Update periodically.',
      },
    }));

    logger.info(`TikTok Trends: returned ${products.length} trending product keywords`);
    return products;
  }

  private estimateImpulseBuy(category: string): number {
    const scores: Record<string, number> = {
      'Beauty & Personal Care': 85,
      'Electronics': 70,
      'Kitchen': 75,
      'Fitness & Health': 65,
      'Home': 60,
      'Automotive': 55,
      'Pets': 70,
    };
    return scores[category] || 60;
  }
}
