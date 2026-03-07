import axios from 'axios';
import { DiscoveredProduct, SourceAdapter } from '../types';
import logger from '../utils/logger';
import { withRetry } from '../utils/retry';

/**
 * Google Trends adapter for Saudi Arabia product discovery.
 * Uses the unofficial Google Trends API (no key required, rate-limited).
 * Falls back to a curated category approach if direct trends fail.
 */
export class GoogleTrendsAdapter implements SourceAdapter {
  name = 'google_trends';
  enabled = true;

  private readonly geoCode = 'SA';
  private readonly categories = [
    'beauty', 'electronics', 'home', 'fitness', 'kitchen',
    'fashion', 'toys', 'gadgets', 'health', 'automotive',
  ];

  async discover(keywords?: string[]): Promise<DiscoveredProduct[]> {
    const searchTerms = keywords?.length ? keywords : this.categories;
    const products: DiscoveredProduct[] = [];

    for (const term of searchTerms) {
      try {
        const trendData = await this.fetchTrendData(term);
        if (trendData) {
          products.push(...trendData);
        }
      } catch (error) {
        logger.warn(`Google Trends fetch failed for "${term}": ${error}`);
      }
    }

    return products;
  }

  private async fetchTrendData(keyword: string): Promise<DiscoveredProduct[]> {
    return withRetry(
      async () => {
        // Google Trends related queries endpoint (unofficial)
        const url = 'https://trends.google.com/trends/api/widgetdata/relatedsearches';
        const params = {
          hl: 'en',
          tz: '-180', // Saudi timezone offset
          req: JSON.stringify({
            restriction: {
              geo: { country: this.geoCode },
              time: 'today 3-m',
              originalTimeRangeForExploreUrl: 'today 3-m',
            },
            keywordType: 'QUERY',
            metric: ['TOP', 'RISING'],
            trendinessSettings: { compareTime: 'today 12-m' },
            requestOptions: { property: '', backend: 'IZG', category: 0 },
            language: 'en',
            userCountryCode: this.geoCode,
          }),
          token: '', // Token refreshed per session
        };

        // Since the unofficial API is fragile, we provide a structured fallback.
        // In production, consider using a proxy or the official Google Trends API if available.
        logger.debug(`Fetching Google Trends for: ${keyword} (geo: ${this.geoCode})`);

        try {
          const response = await axios.get(url, {
            params,
            timeout: 10000,
            headers: { 'User-Agent': 'Mozilla/5.0' },
          });

          // Parse the JSONP-like response
          const rawText = response.data;
          const jsonStr = typeof rawText === 'string'
            ? rawText.replace(/^\)\]\}',\n/, '')
            : JSON.stringify(rawText);

          const data = JSON.parse(jsonStr);
          return this.parseRelatedQueries(data, keyword);
        } catch {
          // Fallback: return a structured placeholder with the keyword
          logger.info(`Using fallback trend entry for: ${keyword}`);
          return [{
            name: keyword,
            category: this.inferCategory(keyword),
            source: this.name,
            source_url: `https://trends.google.com/trends/explore?geo=SA&q=${encodeURIComponent(keyword)}`,
            trend_signal: 'keyword_search',
            virality_score: 50,
            impulse_buy_score: 50,
            saudi_relevance_score: 70,
            image_urls: [],
            keywords: [keyword],
            status: 'discovered' as const,
            discovered_at: new Date(),
          }];
        }
      },
      { maxRetries: 2, context: `google_trends:${keyword}` }
    );
  }

  private parseRelatedQueries(data: Record<string, unknown>, keyword: string): DiscoveredProduct[] {
    const products: DiscoveredProduct[] = [];

    try {
      const queries = (data as any)?.default?.rankedList || [];
      for (const list of queries) {
        for (const item of list?.rankedKeyword || []) {
          const query = item?.query || item?.topic?.title;
          if (!query) continue;

          products.push({
            name: query,
            category: this.inferCategory(keyword),
            source: this.name,
            source_url: `https://trends.google.com/trends/explore?geo=SA&q=${encodeURIComponent(query)}`,
            trend_signal: item?.formattedValue || 'rising',
            virality_score: Math.min((item?.value || 50), 100),
            impulse_buy_score: 50,
            saudi_relevance_score: 75,
            image_urls: [],
            keywords: [keyword, query],
            status: 'discovered',
            discovered_at: new Date(),
          });
        }
      }
    } catch (error) {
      logger.debug(`Failed to parse trend data for ${keyword}: ${error}`);
    }

    return products;
  }

  private inferCategory(keyword: string): string {
    const categories: Record<string, string[]> = {
      'Beauty & Personal Care': ['beauty', 'skincare', 'makeup', 'hair', 'perfume'],
      'Electronics': ['electronics', 'phone', 'gadgets', 'tech', 'smart'],
      'Home & Kitchen': ['home', 'kitchen', 'cleaning', 'decor', 'furniture'],
      'Fitness & Health': ['fitness', 'gym', 'health', 'yoga', 'sport'],
      'Fashion': ['fashion', 'clothing', 'shoes', 'bags', 'accessories'],
      'Toys & Games': ['toys', 'games', 'kids', 'baby'],
    };

    const lower = keyword.toLowerCase();
    for (const [cat, keys] of Object.entries(categories)) {
      if (keys.some(k => lower.includes(k))) return cat;
    }
    return 'General';
  }
}
