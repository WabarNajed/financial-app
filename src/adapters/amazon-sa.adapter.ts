import * as cheerio from 'cheerio';
import { DiscoveredProduct, MarketAdapter, MarketPrice, SourceAdapter } from '../types';
import logger from '../utils/logger';
import { createHttpClient } from '../utils/http';
import { withRetry } from '../utils/retry';
import Bottleneck from 'bottleneck';

const limiter = new Bottleneck({ maxConcurrent: 2, minTime: 2000 });

/**
 * Amazon.sa adapter for product discovery and price comparison.
 * Uses web scraping with proper rate limiting.
 * NOTE: Scraping may break if Amazon changes their HTML structure.
 * Wrap behind this adapter so it can be swapped for an official API later.
 */
export class AmazonSaDiscoveryAdapter implements SourceAdapter {
  name = 'amazon_sa';
  enabled = true;

  private http = createHttpClient('https://www.amazon.sa', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept-Language': 'en-SA,en;q=0.9,ar;q=0.8',
    },
  }, limiter);

  private bestSellerCategories = [
    '/gp/bestsellers/electronics',
    '/gp/bestsellers/beauty',
    '/gp/bestsellers/kitchen',
    '/gp/bestsellers/sporting-goods',
    '/gp/bestsellers/toys',
    '/gp/bestsellers/fashion',
  ];

  async discover(_keywords?: string[]): Promise<DiscoveredProduct[]> {
    const products: DiscoveredProduct[] = [];

    for (const path of this.bestSellerCategories) {
      try {
        const items = await this.scrapeBestSellers(path);
        products.push(...items);
      } catch (error) {
        logger.warn(`Amazon.sa scraping failed for ${path}: ${error}`);
      }
    }

    return products;
  }

  private async scrapeBestSellers(path: string): Promise<DiscoveredProduct[]> {
    return withRetry(
      async () => {
        const response = await this.http.get(path);
        const $ = cheerio.load(response.data);
        const products: DiscoveredProduct[] = [];

        $('[data-asin]').each((_i, el) => {
          const asin = $(el).attr('data-asin');
          if (!asin) return;

          const name = $(el).find('.p13n-sc-truncate, .p13n-sc-truncated').text().trim()
            || $(el).find('[class*="product-title"]').text().trim();
          if (!name) return;

          const priceText = $(el).find('.p13n-sc-price, [class*="price"]').first().text().trim();
          const imageUrl = $(el).find('img').attr('src') || '';
          const category = path.split('/').pop() || 'general';

          products.push({
            name,
            category,
            source: 'amazon_sa',
            source_url: `https://www.amazon.sa/dp/${asin}`,
            trend_signal: 'bestseller',
            virality_score: 60,
            impulse_buy_score: this.estimateImpulseBuy(priceText),
            saudi_relevance_score: 80,
            image_urls: imageUrl ? [imageUrl] : [],
            keywords: [name.toLowerCase(), category],
            status: 'discovered',
            discovered_at: new Date(),
            metadata: { asin, price_text: priceText },
          });
        });

        logger.info(`Amazon.sa: found ${products.length} products from ${path}`);
        return products;
      },
      { maxRetries: 2, context: `amazon_sa:${path}` }
    );
  }

  private estimateImpulseBuy(priceText: string): number {
    const price = parseFloat(priceText.replace(/[^\d.]/g, ''));
    if (isNaN(price)) return 50;
    if (price < 50) return 90;
    if (price < 100) return 75;
    if (price < 200) return 55;
    return 30;
  }
}

export class AmazonSaMarketAdapter implements MarketAdapter {
  name = 'amazon_sa';
  source = 'amazon_sa' as const;

  private http = createHttpClient('https://www.amazon.sa', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept-Language': 'en-SA,en;q=0.9,ar;q=0.8',
    },
  }, limiter);

  async search(keyword: string): Promise<MarketPrice[]> {
    return withRetry(
      async () => {
        const response = await this.http.get('/s', {
          params: { k: keyword, ref: 'nb_sb_noss' },
        });
        const $ = cheerio.load(response.data);
        const prices: MarketPrice[] = [];

        $('[data-asin]').each((_i, el) => {
          const asin = $(el).attr('data-asin');
          if (!asin) return;

          const priceWhole = $(el).find('.a-price-whole').first().text().trim();
          const priceFraction = $(el).find('.a-price-fraction').first().text().trim();
          const title = $(el).find('h2 a span, .a-text-normal').first().text().trim();

          if (priceWhole) {
            const priceSar = parseFloat(`${priceWhole.replace(/,/g, '')}.${priceFraction || '00'}`);
            if (!isNaN(priceSar) && priceSar > 0) {
              prices.push({
                product_id: '', // filled by caller
                source: 'amazon_sa',
                price_sar: priceSar,
                product_url: `https://www.amazon.sa/dp/${asin}`,
                title,
                fetched_at: new Date(),
              });
            }
          }
        });

        return prices.slice(0, 10);
      },
      { maxRetries: 2, context: `amazon_sa_price:${keyword}` }
    );
  }
}
