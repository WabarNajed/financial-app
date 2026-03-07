import { ProductStatus } from '../types';
import { ApprovalRepo, ProductRepo, ContentRepo, ProductScoreRepo } from '../database/repositories';
import { SallaIntegration } from '../integrations/salla';
import logger from '../utils/logger';

export class ApprovalService {
  private salla: SallaIntegration;

  constructor() {
    this.salla = new SallaIntegration();
  }

  async approveProduct(productId: string, reviewedBy?: string, notes?: string): Promise<void> {
    const product = await ProductRepo.findById(productId);
    if (!product) throw new Error(`Product ${productId} not found`);

    await ApprovalRepo.updateStatus(productId, 'approved', reviewedBy, notes);
    logger.info(`Product ${productId} approved by ${reviewedBy || 'system'}`);
  }

  async rejectProduct(productId: string, reviewedBy?: string, notes?: string): Promise<void> {
    await ApprovalRepo.updateStatus(productId, 'rejected', reviewedBy, notes);
    logger.info(`Product ${productId} rejected by ${reviewedBy || 'system'}`);
  }

  async pushToSalla(productId: string): Promise<{ sallaProductId: number; url: string }> {
    const product = await ProductRepo.findById(productId);
    if (!product) throw new Error(`Product ${productId} not found`);

    if (product.status !== 'approved') {
      throw new Error(`Product ${productId} is not approved (status: ${product.status})`);
    }

    if (!this.salla.isConfigured()) {
      throw new Error('Salla is not configured. Set API credentials in .env');
    }

    const content = await ContentRepo.findByProductId(productId);

    try {
      const result = await this.salla.createProduct({
        name: content?.title_ar || product.name_ar || product.name,
        description: content?.description_ar || product.name,
        price: 0, // Will be set from pricing data
        images: product.image_urls.map(url => ({ url })),
        status: 'hidden', // Start hidden, publish manually
      });

      await ProductRepo.update(productId, {
        status: 'pushed_to_salla',
        salla_product_id: String(result.id),
      } as any);

      await ApprovalRepo.updateStatus(productId, 'pushed_to_salla');

      logger.info(`Product ${productId} pushed to Salla as ${result.id}`);
      return { sallaProductId: result.id, url: result.url };
    } catch (error) {
      await ApprovalRepo.updateStatus(productId, 'failed');
      logger.error(`Failed to push product ${productId} to Salla: ${error}`);
      throw error;
    }
  }

  async getProductsForReview(): Promise<any[]> {
    const products = await ProductRepo.findByStatus('analyzed');
    const enriched = [];

    for (const product of products) {
      const score = await ProductScoreRepo.findByProductId(product.id!);
      const content = await ContentRepo.findByProductId(product.id!);
      enriched.push({
        ...product,
        score: score?.final_score || null,
        has_content: !!content,
      });
    }

    return enriched.sort((a, b) => (b.score || 0) - (a.score || 0));
  }

  async bulkUpdateStatus(productIds: string[], status: ProductStatus, reviewedBy?: string): Promise<void> {
    for (const id of productIds) {
      await ApprovalRepo.updateStatus(id, status, reviewedBy);
    }
    logger.info(`Bulk status update: ${productIds.length} products set to ${status}`);
  }
}
