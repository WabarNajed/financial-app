import logger from '../utils/logger';

export interface AliExpressProduct {
  title: string;
  price: number;
  currency: string;
  orders: number;
  rating: number;
  image_url: string | null;
  image_urls: string[];
  supplier: string;
  shipping_cost: number;
  shipping_days: number;
  product_url: string;
}

/**
 * Extract image URLs from a RapidAPI item, checking all known field locations.
 */
function extractItemImages(item: any): { image_url: string | null; image_urls: string[] } {
  const candidates: string[] = [];

  const singleFields = [
    item.product_main_image_url,
    item.main_image,
    item.image,
    item.imageUrl,
    item.productImage,
    item.img,
    item.thumb,
    item.thumbnail,
  ];

  for (const val of singleFields) {
    if (typeof val === 'string' && val.trim()) candidates.push(val.trim());
  }

  const arrayFields = [
    item.images,
    item.gallery,
    item.imageList,
    item.productImages,
    item.image_urls,
  ];

  for (const arr of arrayFields) {
    if (Array.isArray(arr)) {
      for (const v of arr) {
        if (typeof v === 'string' && v.trim()) candidates.push(v.trim());
        if (v && typeof v === 'object' && typeof v.url === 'string' && v.url.trim()) {
          candidates.push(v.url.trim());
        }
      }
    }
  }

  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const url of candidates) {
    if (!seen.has(url)) {
      seen.add(url);
      deduped.push(url);
    }
  }

  return {
    image_url: deduped[0] || null,
    image_urls: deduped,
  };
}

/**
 * AliExpress Discovery Engine
 * Scrapes/fetches: product title, price, orders, rating, images, supplier, shipping
 */
export class AliExpressDiscoveryEngine {
  private rapidApiKey: string;
  private rapidApiHost: string;

  constructor() {
    this.rapidApiKey = process.env.RAPIDAPI_KEY || '';
    this.rapidApiHost = process.env.RAPIDAPI_HOST || 'alibaba-datahub.p.rapidapi.com';
  }

  async searchProducts(keyword: string, limit = 10): Promise<AliExpressProduct[]> {
    if (this.rapidApiKey) {
      try {
        return await this.fetchFromRapidAPI(keyword, limit);
      } catch (err: any) {
        logger.warn(`[aliexpress-discovery] API failed: ${err?.message}. Using fallback.`);
      }
    }
    return this.getFallbackProducts(keyword, limit);
  }

  private async fetchFromRapidAPI(keyword: string, limit: number): Promise<AliExpressProduct[]> {
    const url = `https://${this.rapidApiHost}/item_search?q=${encodeURIComponent(keyword)}&page=1`;
    const response = await fetch(url, {
      headers: {
        'X-RapidAPI-Key': this.rapidApiKey,
        'X-RapidAPI-Host': this.rapidApiHost,
      },
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json: any = await response.json();
    const items = Array.isArray(json?.data) ? json.data.slice(0, limit) : [];

    return items.map((item: any) => {
      const { image_url, image_urls } = extractItemImages(item);
      const title = item.title || item.name || keyword;
      logger.info(`[discovery] images found: ${image_urls.length} for "${title}"`);
      if (image_url) {
        logger.info(`[discovery] primary image: ${image_url}`);
      }
      return {
        title,
        price: Number(item.price || item.salePrice || 0) || 0,
        currency: item.currency || 'USD',
        orders: Number(item.orders || item.reviewCount || 0) || 0,
        rating: Number(item.rating || 0) || 0,
        image_url,
        image_urls,
        supplier: item.storeName || item.seller || 'Unknown Supplier',
        shipping_cost: Number(item.shippingFee || 0) || 0,
        shipping_days: Number(item.deliveryDays || 15) || 15,
        product_url: item.itemUrl || item.url || `https://www.aliexpress.com/wholesale?SearchText=${encodeURIComponent(keyword)}`,
      };
    });
  }

  private getFallbackProducts(keyword: string, limit: number): AliExpressProduct[] {
    const pool: Record<string, AliExpressProduct[]> = {
      blender: [
        { title: 'Portable USB Blender 380ml', price: 12.50, currency: 'USD', orders: 8500, rating: 4.6, image_url: null, image_urls: [], supplier: 'HomeGadgets Store', shipping_cost: 2.50, shipping_days: 12, product_url: 'https://www.aliexpress.com' },
        { title: 'Mini Rechargeable Juice Blender', price: 14.80, currency: 'USD', orders: 5200, rating: 4.4, image_url: null, image_urls: [], supplier: 'KitchenPro Official', shipping_cost: 3.00, shipping_days: 15, product_url: 'https://www.aliexpress.com' },
      ],
      projector: [
        { title: 'Galaxy Star Projector LED', price: 18.90, currency: 'USD', orders: 12000, rating: 4.5, image_url: null, image_urls: [], supplier: 'LightMagic Store', shipping_cost: 2.00, shipping_days: 14, product_url: 'https://www.aliexpress.com' },
      ],
      printer: [
        { title: 'Mini Thermal BT Printer', price: 16.50, currency: 'USD', orders: 6800, rating: 4.3, image_url: null, image_urls: [], supplier: 'TechMini Official', shipping_cost: 3.50, shipping_days: 10, product_url: 'https://www.aliexpress.com' },
      ],
      massage: [
        { title: 'Deep Tissue Massage Gun', price: 28.00, currency: 'USD', orders: 15000, rating: 4.7, image_url: null, image_urls: [], supplier: 'FitGear Pro', shipping_cost: 5.00, shipping_days: 12, product_url: 'https://www.aliexpress.com' },
      ],
      vacuum: [
        { title: 'Wireless Car Vacuum 6000Pa', price: 15.90, currency: 'USD', orders: 4500, rating: 4.2, image_url: null, image_urls: [], supplier: 'AutoClean Store', shipping_cost: 3.00, shipping_days: 15, product_url: 'https://www.aliexpress.com' },
      ],
    };

    const kwLower = keyword.toLowerCase();
    for (const [key, products] of Object.entries(pool)) {
      if (kwLower.includes(key)) return products.slice(0, limit);
    }

    return [{
      title: `${keyword} - Top Rated`,
      price: 15.00,
      currency: 'USD',
      orders: 3000,
      rating: 4.3,
      image_url: null,
      image_urls: [],
      supplier: 'Generic Store',
      shipping_cost: 3.00,
      shipping_days: 15,
      product_url: `https://www.aliexpress.com/wholesale?SearchText=${encodeURIComponent(keyword)}`,
    }];
  }
}
