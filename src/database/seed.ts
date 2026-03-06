import { getDb, closeDb } from './connection';
import logger from '../utils/logger';

/**
 * Seeds the database with sample data for development/testing.
 */
async function seed() {
  const db = getDb();

  try {
    // Sample discovered products
    const [product1] = await db('products').insert({
      name: 'Portable Blender',
      name_ar: 'خلاط محمول',
      category: 'Kitchen',
      source: 'tiktok_trends',
      source_url: 'https://www.tiktok.com/search?q=portable+blender',
      trend_signal: 'tiktok_viral',
      virality_score: 90,
      impulse_buy_score: 85,
      saudi_relevance_score: 80,
      image_urls: JSON.stringify([]),
      keywords: JSON.stringify(['portable blender', 'kitchen', 'smoothie']),
      status: 'discovered',
    }).returning('id');

    const [product2] = await db('products').insert({
      name: 'Galaxy Projector',
      name_ar: 'بروجكتور المجرة',
      category: 'Home',
      source: 'tiktok_trends',
      source_url: 'https://www.tiktok.com/search?q=galaxy+projector',
      trend_signal: 'tiktok_viral',
      virality_score: 88,
      impulse_buy_score: 80,
      saudi_relevance_score: 75,
      image_urls: JSON.stringify([]),
      keywords: JSON.stringify(['galaxy projector', 'home decor', 'lights']),
      status: 'discovered',
    }).returning('id');

    const [product3] = await db('products').insert({
      name: 'Massage Gun',
      name_ar: 'مسدس المساج',
      category: 'Fitness & Health',
      source: 'amazon_sa',
      source_url: 'https://www.amazon.sa',
      trend_signal: 'bestseller',
      virality_score: 75,
      impulse_buy_score: 65,
      saudi_relevance_score: 85,
      image_urls: JSON.stringify([]),
      keywords: JSON.stringify(['massage gun', 'fitness', 'recovery']),
      status: 'discovered',
    }).returning('id');

    // Sample supplier offers
    await db('supplier_offers').insert([
      {
        product_id: product1.id,
        supplier_name: 'Shenzhen Kitchen Co.',
        supplier_platform: 'aliexpress',
        product_title: 'Portable USB Blender 380ml',
        unit_price_usd: 4.50,
        unit_price_sar: 16.88,
        moq: 1,
        shipping_estimate_usd: 2.00,
        shipping_estimate_sar: 7.50,
        lead_time_days: 15,
        rating: 4.7,
        trust_score: 78,
        supplier_url: 'https://aliexpress.com/item/example',
      },
      {
        product_id: product2.id,
        supplier_name: 'Guangzhou Lighting',
        supplier_platform: 'aliexpress',
        product_title: 'Galaxy Star Projector Night Light',
        unit_price_usd: 8.00,
        unit_price_sar: 30.00,
        moq: 1,
        shipping_estimate_usd: 3.00,
        shipping_estimate_sar: 11.25,
        lead_time_days: 18,
        rating: 4.5,
        trust_score: 72,
        supplier_url: 'https://aliexpress.com/item/example2',
      },
    ]);

    // Sample market prices
    await db('market_prices').insert([
      { product_id: product1.id, source: 'amazon_sa', price_sar: 89.00, title: 'Portable Blender' },
      { product_id: product1.id, source: 'noon', price_sar: 79.00, title: 'Portable USB Blender' },
      { product_id: product2.id, source: 'amazon_sa', price_sar: 149.00, title: 'Galaxy Projector' },
      { product_id: product2.id, source: 'noon', price_sar: 129.00, title: 'Star Galaxy Projector' },
    ]);

    logger.info('Database seeded with sample data');
    logger.info(`Created products: ${product1.id}, ${product2.id}, ${product3.id}`);
  } catch (error) {
    logger.error('Seed failed', { error });
    throw error;
  } finally {
    await closeDb();
  }
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
