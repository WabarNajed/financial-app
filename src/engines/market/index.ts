import { MarketPrice, MarketPriceSummary, MarketAdapter } from '../../types';
import { MarketPriceRepo, ProductRepo } from '../../database/repositories';
import { AmazonSaMarketAdapter, NoonMarketAdapter } from '../../adapters';
import logger from '../../utils/logger';

export class MarketComparisonEngine {
  private adapters: MarketAdapter[];

  constructor(adapters?: MarketAdapter[]) {
    this.adapters = adapters || [
      new AmazonSaMarketAdapter(),
      new NoonMarketAdapter(),
    ];
  }

  async comparePrices(productId: string, keyword: string): Promise<MarketPriceSummary | null> {
    const allPrices: MarketPrice[] = [];

    for (const adapter of this.adapters) {
      try {
        logger.info(`Checking ${adapter.name} prices for: "${keyword}"`);
        const prices = await adapter.search(keyword);
        const tagged = prices.map(p => ({ ...p, product_id: productId }));
        allPrices.push(...tagged);
        logger.info(`${adapter.name}: found ${prices.length} prices`);
      } catch (error) {
        logger.error(`Market price check failed on ${adapter.name}: ${error}`);
      }
    }

    if (allPrices.length === 0) {
      logger.warn(`No market prices found for product ${productId}`);
      return null;
    }

    // Save to database
    await MarketPriceRepo.createMany(allPrices);

    // Calculate summary
    return this.calculateSummary(productId, allPrices);
  }

  async compareForProduct(productId: string): Promise<MarketPriceSummary | null> {
    const product = await ProductRepo.findById(productId);
    if (!product) {
      logger.error(`Product ${productId} not found for market comparison`);
      return null;
    }

    return this.comparePrices(productId, product.name);
  }

  addManualBenchmark(productId: string, priceSar: number, source = 'manual'): Promise<string> {
    return MarketPriceRepo.create({
      product_id: productId,
      source: source as any,
      price_sar: priceSar,
      fetched_at: new Date(),
    });
  }

  private calculateSummary(productId: string, prices: MarketPrice[]): MarketPriceSummary {
    const sarPrices = prices.map(p => Number(p.price_sar)).filter(p => p > 0);

    if (sarPrices.length === 0) {
      return {
        product_id: productId,
        min_price_sar: 0,
        max_price_sar: 0,
        avg_price_sar: 0,
        sources_count: 0,
        confidence_score: 0,
      };
    }

    const min = Math.min(...sarPrices);
    const max = Math.max(...sarPrices);
    const avg = sarPrices.reduce((a, b) => a + b, 0) / sarPrices.length;

    // Confidence based on number of sources and price consistency
    const priceRange = max - min;
    const rangeRatio = avg > 0 ? priceRange / avg : 1;
    const sourceFactor = Math.min(sarPrices.length / 5, 1);
    const consistencyFactor = Math.max(1 - rangeRatio, 0.2);
    const confidence = Math.round(sourceFactor * consistencyFactor * 100);

    return {
      product_id: productId,
      min_price_sar: Math.round(min * 100) / 100,
      max_price_sar: Math.round(max * 100) / 100,
      avg_price_sar: Math.round(avg * 100) / 100,
      sources_count: sarPrices.length,
      confidence_score: confidence,
    };
  }
}
