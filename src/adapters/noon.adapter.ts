import * as cheerio from 'cheerio';
import { DiscoveredProduct, MarketAdapter, MarketPrice, SourceAdapter } from '../types';
import logger from '../utils/logger';
import { createHttpClient } from '../utils/http';
import { withRetry } from '../utils/retry';
import Bottleneck from 'bottleneck';

const limiter = new Bottleneck({ maxConcurrent: 2, minTime: 2000 });

/**
 * Noon.com adapter for Saudi market discovery and price comparison.
 * Scraping-based - may need updates if Noon changes their structure.
 */
export class NoonDiscoveryAdapter implements SourceAdapter {
  name = 'noon';
  enabled = true;

  private http = createHttpClient('https://www.noon.com', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept-Language': 'en-SA,en;q=0.9,ar;q=0.8',
    },
  }, limiter);

  private trendingPaths = [
    '/saudi-en/electronics-and-mobiles/mobiles-and-accessories/',
    '/saudi-en/beauty-and-health/skincare/',
    '/saudi-en/home-and-kitchen/',
    '/saudi-en/fashion/',
    '/saudi-en/sports-and-outdoors/',
  ];

  async discover(_keywords?: string[]): Promise<DiscoveredProduct[]> {
    const products: DiscoveredProduct[] = [];

    for (const path of this.trendingPaths) {
      try {
        const items = await this.scrapeListing(path);
        products.push(...items);
      } catch (error) {
        logger.warn(`Noon scraping failed for ${path}: ${error}`);
      }
    }

    return products;
  }

  private async scrapeListing(path: string): Promise<DiscoveredProduct[]> {
    return withRetry(
      async () => {
        const response = await this.http.get(path);
        const $ = cheerio.load(response.data);
        const products: DiscoveredProduct[] = [];

        // Noon uses dynamic rendering; parse what's in initial HTML
        $('[data-qa="product-name"], .productContainer').each((_i, el) => {
          const name = $(el).find('[data-qa="product-name"]').text().trim()
            || $(el).text().trim().slice(0, 200);
          if (!name || name.length < 5) return;

          const priceText = $(el).find('[data-qa="product-price"], .priceNow').text().trim();
          const imageUrl = $(el).find('img').attr('src') || '';
          const link = $(el).find('a').attr('href') || '';
          const category = path.split('/').filter(Boolean).pop() || 'general';

          products.push({
            name,
            category,
            source: 'noon',
            source_url: link.startsWith('http') ? link : `https://www.noon.com${link}`,
            trend_signal: 'listing',
            virality_score: 55,
            impulse_buy_score: 60,
            saudi_relevance_score: 85,
            image_urls: imageUrl ? [imageUrl] : [],
            keywords: [name.toLowerCase().slice(0, 50), category],
            status: 'discovered',
            discovered_at: new Date(),
            metadata: { price_text: priceText },
          });
        });

        logger.info(`Noon: found ${products.length} products from ${path}`);
        return products;
      },
      { maxRetries: 2, context: `noon:${path}` }
    );
  }
}

export class NoonMarketAdapter implements MarketAdapter {
  name = 'noon';
  source = 'noon' as const;

  private http = createHttpClient('https://www.noon.com', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept-Language': 'en-SA,en;q=0.9,ar;q=0.8',
    },
  }, limiter);

  async search(keyword: string): Promise<MarketPrice[]> {
    return withRetry(
      async () => {
        const response = await this.http.get('/saudi-en/search', {
          params: { q: keyword },
        });
        const $ = cheerio.load(response.data);
        const prices: MarketPrice[] = [];

        $('[data-qa="product-price"], .priceNow').each((_i, el) => {
          const priceText = $(el).text().trim();
          const priceSar = parseFloat(priceText.replace(/[^\d.]/g, ''));

          if (!isNaN(priceSar) && priceSar > 0) {
            prices.push({
              product_id: '',
              source: 'noon',
              price_sar: priceSar,
              product_url: `https://www.noon.com/saudi-en/search?q=${encodeURIComponent(keyword)}`,
              title: keyword,
              fetched_at: new Date(),
            });
          }
        });

        return prices.slice(0, 10);
      },
      { maxRetries: 2, context: `noon_price:${keyword}` }
    );
  }
}
