import { SupplierAdapter, SupplierOffer } from '../types';
import { env, pricingConfig } from '../config';
import logger from '../utils/logger';
import { createHttpClient } from '../utils/http';
import { withRetry } from '../utils/retry';
import Bottleneck from 'bottleneck';

const limiter = new Bottleneck({ maxConcurrent: 3, minTime: 1000 });

/**
 * AliExpress supplier adapter.
 *
 * Supports two modes:
 * 1. Official AliExpress Affiliate/Dropshipping API (requires credentials)
 * 2. Fallback structured search (web scraping - fragile)
 *
 * For production use, obtain API credentials from:
 * https://portals.aliexpress.com/affi498late/api/
 */
export class AliExpressAdapter implements SupplierAdapter {
  name = 'AliExpress';
  platform = 'aliexpress' as const;

  private useOfficialApi: boolean;
  private http;

  constructor() {
    this.useOfficialApi = !!(env.ALIEXPRESS_APP_KEY && env.ALIEXPRESS_APP_SECRET);

    if (this.useOfficialApi) {
      this.http = createHttpClient('https://api-sg.aliexpress.com', {}, limiter);
      logger.info('AliExpress adapter using official API');
    } else {
      this.http = createHttpClient('https://www.aliexpress.com', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      }, limiter);
      logger.info('AliExpress adapter using web scraping fallback (set API keys for better results)');
    }
  }

  async search(keyword: string): Promise<SupplierOffer[]> {
    if (this.useOfficialApi) {
      return this.searchViaApi(keyword);
    }
    return this.searchViaScraping(keyword);
  }

  private async searchViaApi(keyword: string): Promise<SupplierOffer[]> {
    return withRetry(
      async () => {
        const response = await this.http.post('/sync', null, {
          params: {
            method: 'aliexpress.affiliate.product.query',
            app_key: env.ALIEXPRESS_APP_KEY,
            sign_method: 'sha256',
            keywords: keyword,
            target_currency: 'USD',
            target_language: 'en',
            ship_to_country: 'SA',
            sort: 'SALE_PRICE_ASC',
            page_size: 20,
          },
        });

        const products = response.data?.aliexpress_affiliate_product_query_response?.resp_result?.result?.products || [];

        return products.map((p: any) => this.mapApiProduct(p, keyword));
      },
      { maxRetries: 2, context: `aliexpress_api:${keyword}` }
    );
  }

  private async searchViaScraping(keyword: string): Promise<SupplierOffer[]> {
    return withRetry(
      async () => {
        // AliExpress has a JSON API endpoint used by their frontend search
        const response = await this.http.get('/af/federationProxy/do', {
          params: {
            searchText: keyword,
            shipTo: 'SA',
            sortType: 'default',
            page: 1,
          },
        });

        // The response structure varies; parse what's available
        const items = this.extractItemsFromResponse(response.data);

        const offers: SupplierOffer[] = items.map((item: any) => ({
          product_id: '', // filled by caller
          supplier_name: item.store?.storeName || 'AliExpress Seller',
          supplier_platform: 'aliexpress' as const,
          product_title: item.title || keyword,
          unit_price_usd: this.parsePrice(item.price),
          unit_price_sar: this.parsePrice(item.price) * pricingConfig.usd_to_sar_rate,
          moq: 1,
          shipping_estimate_usd: this.parsePrice(item.shippingFee) || 0,
          shipping_estimate_sar: (this.parsePrice(item.shippingFee) || 0) * pricingConfig.usd_to_sar_rate,
          lead_time_days: this.estimateLeadTime(item),
          rating: item.evaluation ? parseFloat(item.evaluation) : null,
          trust_score: this.calculateTrustScore(item),
          supplier_url: item.productDetailUrl || `https://www.aliexpress.com/wholesale?SearchText=${encodeURIComponent(keyword)}`,
          image_url: item.imageUrl || item.image,
          fetched_at: new Date(),
        }));

        logger.info(`AliExpress scraping: found ${offers.length} offers for "${keyword}"`);
        return offers;
      },
      { maxRetries: 2, context: `aliexpress_scrape:${keyword}` }
    );
  }

  private mapApiProduct(p: any, _keyword: string): SupplierOffer {
    const priceUsd = parseFloat(p.target_sale_price || p.target_original_price || '0');
    return {
      product_id: '',
      supplier_name: p.shop_name || 'AliExpress Seller',
      supplier_platform: 'aliexpress',
      product_title: p.product_title || '',
      unit_price_usd: priceUsd,
      unit_price_sar: priceUsd * pricingConfig.usd_to_sar_rate,
      moq: 1,
      shipping_estimate_usd: 0,
      shipping_estimate_sar: 0,
      lead_time_days: 15,
      rating: p.evaluate_rate ? parseFloat(p.evaluate_rate) / 20 : null,
      trust_score: this.apiTrustScore(p),
      supplier_url: p.product_detail_url || '',
      image_url: p.product_main_image_url || '',
      fetched_at: new Date(),
    };
  }

  private extractItemsFromResponse(data: any): any[] {
    if (!data) return [];
    if (Array.isArray(data.items)) return data.items;
    if (data.data?.items) return data.data.items;
    if (data.resultList) return data.resultList;
    return [];
  }

  private parsePrice(value: any): number {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const parsed = parseFloat(value.replace(/[^\d.]/g, ''));
      return isNaN(parsed) ? 0 : parsed;
    }
    return 0;
  }

  private estimateLeadTime(item: any): number {
    if (item.shippingDays) return parseInt(item.shippingDays);
    if (item.logistics?.deliveryTime) return parseInt(item.logistics.deliveryTime);
    return 20; // default estimate for Saudi delivery
  }

  private calculateTrustScore(item: any): number {
    let score = 50;
    if (item.evaluation && parseFloat(item.evaluation) > 4.5) score += 20;
    if (item.orders && parseInt(item.orders) > 1000) score += 15;
    if (item.store?.positiveRate && parseFloat(item.store.positiveRate) > 95) score += 15;
    return Math.min(score, 100);
  }

  private apiTrustScore(p: any): number {
    let score = 50;
    if (p.evaluate_rate && parseFloat(p.evaluate_rate) > 80) score += 20;
    if (p.lastest_volume && parseInt(p.lastest_volume) > 500) score += 15;
    if (p.shop_id) score += 10;
    return Math.min(score, 100);
  }
}
