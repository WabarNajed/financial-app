import { getDb } from '../database/connection';
import logger from '../utils/logger';

/**
 * Get product image data.
 */
export async function getProductImages(productId: string): Promise<{
  primary_image_url: string | null;
  image_urls: string[];
  image_status: string;
} | null> {
  const db = getDb();
  const product = await db('products').where({ id: productId }).first();
  if (!product) return null;

  const imageUrls = typeof product.image_urls === 'string'
    ? JSON.parse(product.image_urls) : (product.image_urls || []);
  const meta = typeof product.metadata === 'string'
    ? JSON.parse(product.metadata) : (product.metadata || {});

  return {
    primary_image_url: product.primary_image_url || meta.primary_image_url || (imageUrls[0] || null),
    image_urls: Array.isArray(imageUrls) ? imageUrls : [],
    image_status: product.image_status || (imageUrls.length > 0 ? 'available' : 'missing'),
  };
}

/**
 * Add images to a product (paste URL, uploaded URL, etc.).
 */
export async function addProductImages(productId: string, newUrls: string[]): Promise<{
  success: boolean;
  image_urls: string[];
  error?: string;
}> {
  const db = getDb();
  const product = await db('products').where({ id: productId }).first();
  if (!product) return { success: false, image_urls: [], error: 'Product not found' };

  const existing = typeof product.image_urls === 'string'
    ? JSON.parse(product.image_urls) : (product.image_urls || []);
  const current: string[] = Array.isArray(existing) ? existing : [];

  // Add new URLs, dedupe
  const combined = [...new Set([...current, ...newUrls.filter(u => u && u.startsWith('http'))])];

  const primaryUrl = combined[0] || null;

  await db('products').where({ id: productId }).update({
    image_urls: JSON.stringify(combined),
    primary_image_url: primaryUrl,
    image_status: combined.length > 0 ? 'available' : 'missing',
    updated_at: new Date(),
  });

  // Also update metadata
  const meta = typeof product.metadata === 'string' ? JSON.parse(product.metadata) : (product.metadata || {});
  meta.primary_image_url = primaryUrl;
  await db('products').where({ id: productId }).update({
    metadata: JSON.stringify(meta),
  });

  logger.info(`[images] added ${newUrls.length} images to product ${productId}, total=${combined.length}`);
  return { success: true, image_urls: combined };
}

/**
 * Remove an image from a product's image list.
 */
export async function removeProductImage(productId: string, imageUrl: string): Promise<{
  success: boolean;
  image_urls: string[];
}> {
  const db = getDb();
  const product = await db('products').where({ id: productId }).first();
  if (!product) return { success: false, image_urls: [] };

  const existing = typeof product.image_urls === 'string'
    ? JSON.parse(product.image_urls) : (product.image_urls || []);
  const current: string[] = Array.isArray(existing) ? existing : [];
  const updated = current.filter(u => u !== imageUrl);

  const primaryUrl = updated[0] || null;

  await db('products').where({ id: productId }).update({
    image_urls: JSON.stringify(updated),
    primary_image_url: primaryUrl,
    image_status: updated.length > 0 ? 'available' : 'missing',
    updated_at: new Date(),
  });

  logger.info(`[images] removed image from product ${productId}, remaining=${updated.length}`);
  return { success: true, image_urls: updated };
}

/**
 * Set the primary image for a product.
 */
export async function setPrimaryImage(productId: string, imageUrl: string): Promise<{ success: boolean }> {
  const db = getDb();
  const product = await db('products').where({ id: productId }).first();
  if (!product) return { success: false };

  const existing = typeof product.image_urls === 'string'
    ? JSON.parse(product.image_urls) : (product.image_urls || []);
  const current: string[] = Array.isArray(existing) ? existing : [];

  // Move the chosen URL to front
  const reordered = [imageUrl, ...current.filter(u => u !== imageUrl)];

  await db('products').where({ id: productId }).update({
    image_urls: JSON.stringify(reordered),
    primary_image_url: imageUrl,
    image_status: 'available',
    updated_at: new Date(),
  });

  // Update metadata
  const meta = typeof product.metadata === 'string' ? JSON.parse(product.metadata) : (product.metadata || {});
  meta.primary_image_url = imageUrl;
  await db('products').where({ id: productId }).update({ metadata: JSON.stringify(meta) });

  logger.info(`[images] primary image set for product ${productId}`);
  return { success: true };
}

/**
 * Reorder image list for a product.
 */
export async function reorderProductImages(productId: string, orderedUrls: string[]): Promise<{ success: boolean }> {
  const db = getDb();
  const product = await db('products').where({ id: productId }).first();
  if (!product) return { success: false };

  const primaryUrl = orderedUrls[0] || null;

  await db('products').where({ id: productId }).update({
    image_urls: JSON.stringify(orderedUrls),
    primary_image_url: primaryUrl,
    image_status: orderedUrls.length > 0 ? 'available' : 'missing',
    updated_at: new Date(),
  });

  logger.info(`[images] reordered images for product ${productId}`);
  return { success: true };
}

/**
 * Scan all products and update image_status column.
 */
export async function syncImageStatuses(): Promise<{ updated: number; missing: number; available: number }> {
  const db = getDb();
  const products = await db('products').select('id', 'image_urls', 'image_status');

  let updated = 0;
  let missing = 0;
  let available = 0;

  for (const p of products) {
    const imgs = typeof p.image_urls === 'string' ? JSON.parse(p.image_urls) : (p.image_urls || []);
    const hasImages = Array.isArray(imgs) && imgs.length > 0;
    const newStatus = hasImages ? 'available' : 'missing';

    if (hasImages) available++;
    else missing++;

    if (p.image_status !== newStatus) {
      await db('products').where({ id: p.id }).update({
        image_status: newStatus,
        primary_image_url: hasImages ? imgs[0] : null,
      });
      updated++;
    }
  }

  logger.info(`[images] sync complete: updated=${updated} available=${available} missing=${missing}`);
  return { updated, missing, available };
}
