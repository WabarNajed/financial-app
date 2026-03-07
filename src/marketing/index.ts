import { MarketingAsset, GeneratedContent } from '../types';
import { MarketingRepo, ContentRepo } from '../database/repositories';
import logger from '../utils/logger';

/**
 * Marketing automation prep service.
 * Takes generated content and prepares platform-specific marketing assets
 * that can be consumed by ad platform integrations or content tools.
 */
export class MarketingService {
  async prepareAssets(productId: string): Promise<MarketingAsset[]> {
    const content = await ContentRepo.findByProductId(productId);
    if (!content) {
      logger.warn(`No generated content found for product ${productId}`);
      return [];
    }

    const assets = this.buildAssets(productId, content);
    await MarketingRepo.createMany(assets);

    logger.info(`Prepared ${assets.length} marketing assets for product ${productId}`);
    return assets;
  }

  private buildAssets(productId: string, content: GeneratedContent): Omit<MarketingAsset, 'id'>[] {
    const now = new Date();
    const assets: Omit<MarketingAsset, 'id'>[] = [];

    // Meta Ads
    if (content.ad_hook_ar) {
      assets.push({
        product_id: productId,
        platform: 'meta',
        asset_type: 'ad_copy',
        content_ar: content.ad_hook_ar,
        status: 'queued',
        created_at: now,
      });
      assets.push({
        product_id: productId,
        platform: 'meta',
        asset_type: 'hook',
        content_ar: content.short_sales_copy_ar,
        status: 'queued',
        created_at: now,
      });
    }

    // TikTok
    if (content.tiktok_script_idea_ar) {
      assets.push({
        product_id: productId,
        platform: 'tiktok',
        asset_type: 'script',
        content_ar: content.tiktok_script_idea_ar,
        status: 'queued',
        created_at: now,
      });
    }

    // Snapchat
    if (content.snapchat_ad_angle_ar) {
      assets.push({
        product_id: productId,
        platform: 'snapchat',
        asset_type: 'ad_copy',
        content_ar: content.snapchat_ad_angle_ar,
        status: 'queued',
        created_at: now,
      });
    }

    // Instagram
    if (content.instagram_reel_caption_ar) {
      assets.push({
        product_id: productId,
        platform: 'instagram',
        asset_type: 'caption',
        content_ar: content.instagram_reel_caption_ar,
        status: 'queued',
        created_at: now,
      });
    }

    return assets;
  }

  async getQueuedAssets(platform?: string): Promise<MarketingAsset[]> {
    return MarketingRepo.findQueued(platform);
  }

  async markAsSent(assetId: string): Promise<void> {
    // Update status in database
    const { getDb } = await import('../database/connection');
    await getDb()('marketing_assets').where({ id: assetId }).update({ status: 'sent' });
  }
}
