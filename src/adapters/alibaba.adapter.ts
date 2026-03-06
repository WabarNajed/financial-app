import { SupplierAdapter, SupplierOffer } from '../types';
import { env, pricingConfig } from '../config';
import logger from '../utils/logger';
import { createHttpClient } from '../utils/http';
import { withRetry } from '../utils/retry';
import Bottleneck from 'bottleneck';

const limiter = new Bottleneck({ maxConcurrent: 2, minTime: 2000 });

/**
 * Alibaba.com supplier adapter.
 *
 * Uses Alibaba's open search endpoint where available.
 * For full API access, register at https://open.alibaba.com/
 *
 * Alibaba is best for higher MOQ / bulk sourcing.
 * Typically used alongside AliExpress for comparison.
 */
export class AlibabaAdapter implements SupplierAdapter {
  name = 'Alibaba';
  platform = 'alibaba' as const;

  private http = createHttpClient('https://www.alibaba.com', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  }, limiter);

  async search(keyword: string): Promise<SupplierOffer[]> {
    return withRetry(
      async () => {
        // Alibaba has a JSON search API used by their frontend
        const response = await this.http.get('/trade/search', {
          params: {
            SearchText: keyword,
            tab: 'all',
            viewtype: 'G',
          },
        });

        const offers = this.parseSearchResults(response.data, keyword);
        logger.info(`Alibaba: found ${offers.length} offers for "${keyword}"`);
        return offers;
      },
      { maxRetries: 2, context: `alibaba:${keyword}` }
    );
  }

  private parseSearchResults(data: any, keyword: string): SupplierOffer[] {
    const offers: SupplierOffer[] = [];

    try {
      // Attempt to parse various response formats
      const items = this.extractItems(data);

      for (const item of items.slice(0, 15)) {
        const priceUsd = this.extractPrice(item);
        if (priceUsd <= 0) continue;

        offers.push({
          product_id: '',
          supplier_name: item.supplier?.companyName || item.company || 'Alibaba Supplier',
          supplier_platform: 'alibaba',
          product_title: item.subject || item.title || keyword,
          unit_price_usd: priceUsd,
          unit_price_sar: priceUsd * pricingConfig.usd_to_sar_rate,
          moq: this.extractMoq(item),
          shipping_estimate_usd: 5, // Alibaba shipping varies widely
          shipping_estimate_sar: 5 * pricingConfig.usd_to_sar_rate,
          lead_time_days: 25,
          rating: item.supplier?.tradeScore ? Math.min(item.supplier.tradeScore / 20, 5) : null,
          trust_score: this.calculateTrustScore(item),
          supplier_url: item.detailUrl || item.href || `https://www.alibaba.com/trade/search?SearchText=${encodeURIComponent(keyword)}`,
          image_url: item.imageUrl || item.image,
          fetched_at: new Date(),
          metadata: { moq_note: 'Alibaba typically requires higher MOQ than AliExpress' },
        });
      }
    } catch (error) {
      logger.warn(`Alibaba parse error: ${error}`);
    }

    return offers;
  }

  private extractItems(data: any): any[] {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    if (data.normalList) return data.normalList;
    if (data.data?.normalList) return data.data.normalList;
    if (data.commodityList) return data.commodityList;
    return [];
  }

  private extractPrice(item: any): number {
    const priceStr = item.price || item.localPrice || item.salePrice || '';
    if (typeof priceStr === 'number') return priceStr;
    const match = String(priceStr).match(/[\d.]+/);
    return match ? parseFloat(match[0]) : 0;
  }

  private extractMoq(item: any): number {
    const moqStr = item.moq || item.minOrder || '1';
    const match = String(moqStr).match(/\d+/);
    return match ? parseInt(match[0]) : 1;
  }

  private calculateTrustScore(item: any): number {
    let score = 40;
    if (item.supplier?.tradeAssurance) score += 20;
    if (item.supplier?.goldSupplier) score += 15;
    if (item.supplier?.yearCount && item.supplier.yearCount > 3) score += 10;
    if (item.supplier?.transactionLevel && item.supplier.transactionLevel > 5) score += 15;
    return Math.min(score, 100);
  }
}
