import { getDb } from '../database/connection';
import logger from '../utils/logger';

/**
 * Normalize image data from various source formats into:
 *   primary_image_url: string | null
 *   image_urls: string[]
 */
export function normalizeImages(raw: Record<string, any>): { primary_image_url: string | null; image_urls: string[] } {
  const candidates: string[] = [];

  // Collect from every known field pattern (including RapidAPI / Alibaba DataHub fields)
  const fields = [
    raw.product_main_image_url, raw.main_image,
    raw.image_urls, raw.image_url, raw.image, raw.imageUrl,
    raw.productImage, raw.img, raw.thumb,
    raw.thumbnail, raw.thumbnails,
    raw.images, raw.gallery, raw.imageList, raw.productImages,
    raw.metadata?.product_main_image_url, raw.metadata?.main_image,
    raw.metadata?.primary_image_url,
    raw.metadata?.image, raw.metadata?.images,
    raw.metadata?.image_url, raw.metadata?.image_urls,
    raw.metadata?.thumbnail, raw.metadata?.thumbnails,
    raw.metadata?.gallery, raw.metadata?.productImages,
  ];

  for (const val of fields) {
    if (!val) continue;
    if (Array.isArray(val)) {
      for (const v of val) {
        if (typeof v === 'string' && v.trim()) candidates.push(v.trim());
      }
    } else if (typeof val === 'string' && val.trim()) {
      // Could be JSON array string
      try {
        const parsed = JSON.parse(val);
        if (Array.isArray(parsed)) {
          for (const p of parsed) { if (typeof p === 'string' && p.trim()) candidates.push(p.trim()); }
        } else {
          candidates.push(val.trim());
        }
      } catch {
        candidates.push(val.trim());
      }
    }
  }

  // Normalize: fix protocol-relative URLs (//ae01.alicdn.com/...)
  const normalized = candidates.map((url) =>
    url.startsWith('//') ? `https:${url}` : url,
  );

  // Deduplicate preserving order
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const url of normalized) {
    if (!seen.has(url)) {
      seen.add(url);
      deduped.push(url);
    }
  }

  return {
    primary_image_url: deduped[0] || null,
    image_urls: deduped,
  };
}

/**
 * Rebuild image data for a single product.
 */
export async function rebuildImageData(productId: string): Promise<{ success: boolean; primary_image_url: string | null; image_count: number; error?: string }> {
  const db = getDb();
  const row = await db('products').where({ id: productId }).first();
  if (!row) return { success: false, primary_image_url: null, image_count: 0, error: 'Product not found' };

  const meta = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : (row.metadata || {});
  const { primary_image_url, image_urls } = normalizeImages({ ...row, metadata: meta });

  await db('products').where({ id: productId }).update({
    image_urls: JSON.stringify(image_urls),
    updated_at: new Date(),
  });

  // Also store primary_image_url in metadata for quick access
  meta.primary_image_url = primary_image_url;
  await db('products').where({ id: productId }).update({
    metadata: JSON.stringify(meta),
  });

  logger.info(`[image-pipeline] rebuilt images for ${productId}: primary=${primary_image_url}, count=${image_urls.length}`);
  return { success: true, primary_image_url, image_count: image_urls.length };
}

/**
 * Rebuild image data for all products missing images.
 */
export async function rebuildMissingImages(): Promise<{ success: boolean; rebuilt: number; errors: string[] }> {
  const db = getDb();
  const rows = await db('products').select('id', 'image_urls', 'metadata');
  const errors: string[] = [];
  let rebuilt = 0;

  for (const row of rows) {
    const imgs = typeof row.image_urls === 'string' ? JSON.parse(row.image_urls) : (row.image_urls || []);
    if (Array.isArray(imgs) && imgs.length > 0) continue; // Already has images

    try {
      const result = await rebuildImageData(row.id);
      if (result.success && result.image_count > 0) rebuilt++;
    } catch (err: any) {
      errors.push(`${row.id}: ${err?.message}`);
    }
  }

  logger.info(`[image-pipeline] bulk rebuild: rebuilt=${rebuilt} errors=${errors.length}`);
  return { success: true, rebuilt, errors };
}
