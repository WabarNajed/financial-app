import { DiscoveredProduct, SourceAdapter } from '../../types';
import { ProductRepo } from '../../database/repositories';
import {
  GoogleTrendsAdapter,
  AmazonSaDiscoveryAdapter,
  NoonDiscoveryAdapter,
  TikTokTrendsAdapter,
} from '../../adapters';
import logger from '../../utils/logger';

export class ProductDiscoveryEngine {
  private adapters: SourceAdapter[];

  constructor(adapters?: SourceAdapter[]) {
    this.adapters = adapters || [
      new GoogleTrendsAdapter(),
      new AmazonSaDiscoveryAdapter(),
      new NoonDiscoveryAdapter(),
      new TikTokTrendsAdapter(),
    ];
  }

  async discoverProducts(keywords?: string[]): Promise<DiscoveredProduct[]> {
    const allProducts: DiscoveredProduct[] = [];
    const errors: string[] = [];

    for (const adapter of this.adapters) {
      if (!adapter.enabled) {
        logger.debug(`Skipping disabled adapter: ${adapter.name}`);
        continue;
      }

      try {
        logger.info(`Running discovery adapter: ${adapter.name}`);
        const products = await adapter.discover(keywords);
        logger.info(`${adapter.name}: discovered ${products.length} products`);
        allProducts.push(...products);
      } catch (error) {
        const msg = `Adapter ${adapter.name} failed: ${error}`;
        logger.error(msg);
        errors.push(msg);
      }
    }

    // Deduplicate by name similarity
    const deduplicated = this.deduplicateProducts(allProducts);
    logger.info(`Discovery complete: ${allProducts.length} raw -> ${deduplicated.length} deduplicated`);

    return deduplicated;
  }

  async discoverAndSave(keywords?: string[]): Promise<string[]> {
    const products = await this.discoverProducts(keywords);
    const savedIds: string[] = [];

    for (const product of products) {
      try {
        const id = await ProductRepo.create(product);
        savedIds.push(id);
      } catch (error) {
        logger.error(`Failed to save product "${product.name}": ${error}`);
      }
    }

    logger.info(`Saved ${savedIds.length} products to database`);
    return savedIds;
  }

  private deduplicateProducts(products: DiscoveredProduct[]): DiscoveredProduct[] {
    const seen = new Map<string, DiscoveredProduct>();

    for (const product of products) {
      const key = this.normalizeProductName(product.name);
      const existing = seen.get(key);

      if (!existing) {
        seen.set(key, product);
      } else {
        // Merge: keep the one with higher scores
        if (product.virality_score > existing.virality_score) {
          seen.set(key, {
            ...product,
            keywords: [...new Set([...existing.keywords, ...product.keywords])],
            image_urls: [...new Set([...existing.image_urls, ...product.image_urls])],
          });
        }
      }
    }

    return Array.from(seen.values());
  }

  private normalizeProductName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 50);
  }
}
