import { getDb } from '../database/connection';
import { toNumber } from '../utils/number-safe';
import { createAlert } from './alerts.service';
import logger from '../utils/logger';

export interface SallaOrderPayload {
  id?: string | number;
  reference_id?: string | number;
  customer?: {
    first_name?: string;
    last_name?: string;
    phone?: string;
    email?: string;
  };
  shipping?: {
    address?: { street?: string; city?: string; country?: string; postal_code?: string };
  };
  amounts?: { total?: { amount?: number } };
  currency?: string;
  items?: Array<{
    product_id?: string | number;
    name?: string;
    quantity?: number;
    price?: { amount?: number };
    sku?: string;
  }>;
  status?: { slug?: string; name?: string };
}

/**
 * Ingest a Salla order webhook payload into our orders + order_items tables.
 */
export async function ingestSallaOrder(payload: SallaOrderPayload): Promise<{ order_id: string; item_count: number }> {
  const db = getDb();
  const sallaOrderId = String(payload.id || payload.reference_id || '');

  if (!sallaOrderId) throw new Error('Missing order ID in payload');

  // Check duplicate
  const existing = await db('orders').where({ salla_order_id: sallaOrderId }).first();
  if (existing) {
    logger.info(`[orders] duplicate order skipped: salla_order_id=${sallaOrderId}`);
    return { order_id: existing.id, item_count: 0 };
  }

  const customer = payload.customer || {};
  const shipping = payload.shipping?.address || {};
  const customerName = [customer.first_name, customer.last_name].filter(Boolean).join(' ') || 'Unknown';

  const [order] = await db('orders').insert({
    salla_order_id: sallaOrderId,
    customer_name: customerName,
    customer_phone: customer.phone || null,
    customer_email: customer.email || null,
    customer_address: shipping.street || null,
    city: shipping.city || null,
    country: shipping.country || 'SA',
    postal_code: shipping.postal_code || null,
    order_total: toNumber(payload.amounts?.total?.amount),
    currency: payload.currency || 'SAR',
    order_status: payload.status?.slug || 'pending',
  }).returning('*');

  let itemCount = 0;
  const items = payload.items || [];

  for (const item of items) {
    // Try to find internal product by salla_product_id
    const sallaProductId = String(item.product_id || '');
    let internalProduct: any = null;
    if (sallaProductId) {
      internalProduct = await db('products').where({ salla_product_id: sallaProductId }).first();
    }

    // Try supplier mapping
    let supplierMapping: any = null;
    if (internalProduct) {
      supplierMapping = await db('supplier_mappings')
        .where({ product_id: internalProduct.id, is_active: true })
        .first();
    }

    await db('order_items').insert({
      order_id: order.id,
      product_id: internalProduct?.id || null,
      salla_product_id: sallaProductId || null,
      product_title: item.name || 'Unknown Product',
      quantity: toNumber(item.quantity, 1),
      sale_price: toNumber(item.price?.amount),
      supplier_source: supplierMapping?.supplier_source || null,
      supplier_product_id: supplierMapping?.supplier_product_id || null,
      supplier_url: supplierMapping?.supplier_url || null,
    });
    itemCount++;
  }

  logger.info(`[orders] ingested salla_order_id=${sallaOrderId} id=${order.id} items=${itemCount}`);
  return { order_id: order.id, item_count: itemCount };
}

export async function listOrders(options: {
  status?: string;
  limit?: number;
  offset?: number;
  search?: string;
} = {}): Promise<{ data: any[]; total: number }> {
  const db = getDb();
  let query = db('orders').orderBy('created_at', 'desc');
  let countQuery = db('orders').count('id as count');

  if (options.status) {
    query = query.where({ order_status: options.status });
    countQuery = countQuery.where({ order_status: options.status });
  }
  if (options.search) {
    const s = `%${options.search}%`;
    query = query.where(function () {
      this.where('customer_name', 'ilike', s)
        .orWhere('salla_order_id', 'ilike', s)
        .orWhere('customer_email', 'ilike', s);
    });
    countQuery = countQuery.where(function () {
      this.where('customer_name', 'ilike', s)
        .orWhere('salla_order_id', 'ilike', s)
        .orWhere('customer_email', 'ilike', s);
    });
  }

  const [{ count }] = await countQuery;
  const data = await query.limit(options.limit || 50).offset(options.offset || 0);
  return { data, total: Number(count) };
}

export async function getOrderDetail(orderId: string): Promise<any> {
  const db = getDb();
  const order = await db('orders').where({ id: orderId }).first();
  if (!order) return null;
  const items = await db('order_items').where({ order_id: orderId });
  return { ...order, items };
}

export async function updateOrderStatus(orderId: string, status: string): Promise<void> {
  const db = getDb();
  await db('orders').where({ id: orderId }).update({
    order_status: status,
    updated_at: new Date(),
  });
  logger.info(`[orders] status updated: id=${orderId} status=${status}`);
}
