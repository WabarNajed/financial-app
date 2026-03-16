import { Router, Request, Response } from 'express';
import { getDb } from '../../database/connection';
import logger from '../../utils/logger';
import crypto from 'crypto';

const router = Router();

// ── Helper: generate slug ──────────────────────────────────────────
function slugify(text: string): string {
  return text.toLowerCase().replace(/[^\w\s-]/g, '').replace(/[\s_]+/g, '-').replace(/^-+|-+$/g, '') || `product-${Date.now()}`;
}

// ── GET /store-settings ── public store config ─────────────────────
router.get('/store-settings', async (_req: Request, res: Response) => {
  try {
    const db = getDb();
    let settings = await db('store_settings').first();
    if (!settings) {
      // Seed default
      [settings] = await db('store_settings').insert({ store_name: 'My Store', store_name_ar: 'متجري' }).returning('*');
    }
    res.json({ settings });
  } catch (err: any) {
    logger.error('storefront store-settings error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ── GET /products ── public products listing ───────────────────────
router.get('/products', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { category, search, sort, limit: lim, offset: off } = req.query;
    let q = db('products')
      .leftJoin('categories', 'products.category_id', 'categories.id')
      .select(
        'products.id', 'products.name', 'products.name_ar', 'products.slug',
        'products.image_urls', 'products.primary_image_url',
        'products.storefront_price', 'products.compare_at_price',
        'products.short_description', 'products.short_description_ar',
        'products.category', 'products.category_id',
        'categories.name as category_name', 'categories.name_ar as category_name_ar', 'categories.slug as category_slug',
        'products.stock_quantity', 'products.status'
      )
      .where('products.is_published', true);

    if (category) q = q.where('categories.slug', category);
    if (search) q = q.where(function () { this.whereILike('products.name', `%${search}%`).orWhereILike('products.name_ar', `%${search}%`); });

    const sortField = sort === 'price_asc' ? 'storefront_price' : sort === 'price_desc' ? 'storefront_price' : 'products.updated_at';
    const sortDir = sort === 'price_asc' ? 'asc' : sort === 'price_desc' ? 'desc' : 'desc';
    q = q.orderBy(sortField, sortDir);

    const limit = Math.min(Number(lim) || 24, 100);
    const offset = Number(off) || 0;
    q = q.limit(limit).offset(offset);

    const products = await q;
    // Parse image_urls
    const parsed = products.map((p: any) => ({
      ...p,
      image_urls: typeof p.image_urls === 'string' ? JSON.parse(p.image_urls) : (p.image_urls || []),
    }));
    res.json({ products: parsed });
  } catch (err: any) {
    logger.error('storefront products error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ── GET /products/:slug ── single product ──────────────────────────
router.get('/products/:slug', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { slug } = req.params;
    // Try by slug first, then by ID
    let product = await db('products').where('slug', slug).where('is_published', true).first();
    if (!product) product = await db('products').where('id', slug).where('is_published', true).first();
    if (!product) return res.status(404).json({ error: 'Product not found' });

    product.image_urls = typeof product.image_urls === 'string' ? JSON.parse(product.image_urls) : (product.image_urls || []);
    product.metadata = typeof product.metadata === 'string' ? JSON.parse(product.metadata) : (product.metadata || {});
    const commerce = product.metadata?.commerce || {};
    const listingPack = product.metadata?.listing_pack || {};

    // Get category
    let category = null;
    if (product.category_id) category = await db('categories').where('id', product.category_id).first();

    // Related products
    const related = await db('products')
      .where('is_published', true)
      .whereNot('id', product.id)
      .modify((q: any) => { if (product.category_id) q.where('category_id', product.category_id); })
      .limit(4)
      .select('id', 'name', 'name_ar', 'slug', 'image_urls', 'primary_image_url', 'storefront_price', 'compare_at_price');

    res.json({
      product: {
        ...product,
        commerce,
        listing_pack: listingPack,
        features: commerce.features || [],
        description_ar: product.full_description_ar || commerce.description_ar || listingPack.full_description_ar || '',
      },
      category,
      related: related.map((r: any) => ({ ...r, image_urls: typeof r.image_urls === 'string' ? JSON.parse(r.image_urls) : (r.image_urls || []) })),
    });
  } catch (err: any) {
    logger.error('storefront product detail error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ── GET /categories ── public categories ───────────────────────────
router.get('/categories', async (_req: Request, res: Response) => {
  try {
    const db = getDb();
    const categories = await db('categories').where('is_active', true).orderBy('sort_order', 'asc');
    // Count products per category
    const counts = await db('products').where('is_published', true).whereNotNull('category_id').groupBy('category_id').select('category_id').count('* as count');
    const countMap: Record<string, number> = {};
    counts.forEach((c: any) => { countMap[c.category_id] = Number(c.count); });
    res.json({ categories: categories.map((c: any) => ({ ...c, product_count: countMap[c.id] || 0 })) });
  } catch (err: any) {
    logger.error('storefront categories error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ── Cart operations ────────────────────────────────────────────────
router.post('/cart', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { session_id, customer_id } = req.body;
    let cart;
    if (customer_id) cart = await db('carts').where('customer_id', customer_id).first();
    else if (session_id) cart = await db('carts').where('session_id', session_id).first();
    if (!cart) {
      [cart] = await db('carts').insert({ session_id: session_id || crypto.randomUUID(), customer_id: customer_id || null }).returning('*');
    }
    const items = await db('cart_items').where('cart_id', cart.id).join('products', 'cart_items.product_id', 'products.id')
      .select('cart_items.*', 'products.name', 'products.name_ar', 'products.slug', 'products.image_urls', 'products.primary_image_url', 'products.storefront_price', 'products.compare_at_price');
    res.json({
      cart: { ...cart, items: items.map((i: any) => ({ ...i, image_urls: typeof i.image_urls === 'string' ? JSON.parse(i.image_urls) : (i.image_urls || []) })) },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/cart/add', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { cart_id, product_id, quantity } = req.body;
    if (!cart_id || !product_id) return res.status(400).json({ error: 'cart_id and product_id required' });
    const existing = await db('cart_items').where({ cart_id, product_id }).first();
    if (existing) {
      await db('cart_items').where('id', existing.id).update({ quantity: (existing.quantity || 1) + (quantity || 1) });
    } else {
      await db('cart_items').insert({ cart_id, product_id, quantity: quantity || 1 });
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/cart/update', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { item_id, quantity } = req.body;
    if (quantity <= 0) await db('cart_items').where('id', item_id).del();
    else await db('cart_items').where('id', item_id).update({ quantity });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/cart/remove', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    await db('cart_items').where('id', req.body.item_id).del();
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Customer auth ──────────────────────────────────────────────────
router.post('/register', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { name, email, phone, password, city, address, postal_code } = req.body;
    if (!email || !password || !name) return res.status(400).json({ error: 'name, email, password required' });
    const exists = await db('customers').where('email', email).first();
    if (exists) return res.status(409).json({ error: 'Email already registered' });
    const password_hash = crypto.createHash('sha256').update(password + 'saudi_store_salt').digest('hex');
    const [customer] = await db('customers').insert({ name, email, phone, password_hash, city, address, postal_code }).returning('*');
    const token = crypto.createHash('sha256').update(customer.id + Date.now().toString()).digest('hex');
    res.json({ customer: { id: customer.id, name: customer.name, email: customer.email, phone: customer.phone }, token });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/login', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'email and password required' });
    const customer = await db('customers').where('email', email).first();
    if (!customer) return res.status(401).json({ error: 'Invalid credentials' });
    const hash = crypto.createHash('sha256').update(password + 'saudi_store_salt').digest('hex');
    if (hash !== customer.password_hash) return res.status(401).json({ error: 'Invalid credentials' });
    const token = crypto.createHash('sha256').update(customer.id + Date.now().toString()).digest('hex');
    res.json({ customer: { id: customer.id, name: customer.name, email: customer.email, phone: customer.phone }, token });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Checkout / Place Order ─────────────────────────────────────────
router.post('/checkout', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const {
      cart_id, customer_name, customer_email, customer_phone,
      shipping_address, city, country, postal_code,
      payment_method, customer_notes, customer_id,
    } = req.body;

    if (!cart_id) return res.status(400).json({ error: 'cart_id required' });
    if (!customer_name || !customer_phone) return res.status(400).json({ error: 'customer_name and customer_phone required' });

    const items = await db('cart_items').where('cart_id', cart_id)
      .join('products', 'cart_items.product_id', 'products.id')
      .select('cart_items.*', 'products.name as product_title', 'products.storefront_price', 'products.id as pid');

    if (!items.length) return res.status(400).json({ error: 'Cart is empty' });

    const total = items.reduce((s: number, i: any) => s + (Number(i.storefront_price) || 0) * (i.quantity || 1), 0);
    const method = payment_method || 'whatsapp';

    const [order] = await db('orders').insert({
      customer_name, customer_email, customer_phone,
      customer_address: shipping_address, shipping_address,
      city, country: country || 'SA', postal_code,
      payment_method: method,
      payment_status: method === 'cod' ? 'cod_pending' : 'pending',
      order_status: 'pending_review',
      order_total: total, total_amount: total,
      customer_notes, customer_id: customer_id || null,
      source: 'storefront',
      notes: `Storefront order via ${method}`,
    }).returning('*');

    // Insert order items
    for (const item of items) {
      // Load supplier mapping
      const mapping = await db('supplier_mappings').where('product_id', item.pid).where('is_active', true).first();
      await db('order_items').insert({
        order_id: order.id, product_id: item.pid,
        product_title: item.product_title,
        quantity: item.quantity,
        sale_price: item.storefront_price,
        supplier_source: mapping?.supplier_source || null,
        supplier_product_id: mapping?.supplier_product_id || null,
        supplier_url: mapping?.supplier_url || null,
        fulfillment_status: 'pending',
      });
    }

    // Clear cart
    await db('cart_items').where('cart_id', cart_id).del();

    // Create alert for admin
    await db('alerts').insert({
      alert_type: 'new_storefront_order',
      severity: 'info',
      title: `New order from ${customer_name}`,
      message: `Order #${order.id.slice(0, 8)} — ${items.length} items — ${total} SAR — ${method}`,
      order_id: order.id,
    });

    // If whatsapp, build WhatsApp message
    let whatsapp_url = null;
    const storeSettings = await db('store_settings').first();
    if (method === 'whatsapp' && storeSettings?.whatsapp_number) {
      const itemLines = items.map((i: any) => `- ${i.product_title} x${i.quantity} (${Number(i.storefront_price) * i.quantity} SAR)`).join('\n');
      const msg = `New Order:\n${itemLines}\nTotal: ${total} SAR\nName: ${customer_name}\nPhone: ${customer_phone}\nCity: ${city || 'N/A'}\nAddress: ${shipping_address || 'N/A'}`;
      whatsapp_url = `https://wa.me/${storeSettings.whatsapp_number.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(msg)}`;
    }

    res.json({ order: { id: order.id, status: order.order_status, total, payment_method: method }, whatsapp_url });
  } catch (err: any) {
    logger.error('checkout error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ── GET /orders/:id ── customer order tracking ─────────────────────
router.get('/order/:id', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const order = await db('orders').where('id', req.params.id).first();
    if (!order) return res.status(404).json({ error: 'Order not found' });
    const items = await db('order_items').where('order_id', order.id);
    res.json({ order: { ...order, items } });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /customer/:id/orders ── customer order history ─────────────
router.get('/customer/:id/orders', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const orders = await db('orders').where('customer_id', req.params.id).orderBy('created_at', 'desc');
    res.json({ orders });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
