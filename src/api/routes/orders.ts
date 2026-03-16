import { Router, Request, Response } from 'express';
import { listOrders, getOrderDetail, updateOrderStatus } from '../../services/orders.service';
import { sendEmail, sendTemplatedEmail } from '../../services/email.service';
import { getDb } from '../../database/connection';
import logger from '../../utils/logger';
import { toNumber } from '../../utils/number-safe';

const router = Router();

// ── List orders ──────────────────────────────────────────────────────────────
router.get('/', async (req: Request, res: Response) => {
  try {
    const { status, search, limit = '50', offset = '0' } = req.query;
    const result = await listOrders({
      status: status ? String(status) : undefined,
      search: search ? String(search) : undefined,
      limit: Number(limit),
      offset: Number(offset),
    });
    res.json(result);
  } catch (error: any) {
    logger.error(`[orders] GET / error: ${error?.message}`);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// ── Order stats ──────────────────────────────────────────────────────────────
router.get('/stats/summary', async (_req: Request, res: Response) => {
  try {
    const db = getDb();
    const [{ count: total }] = await db('orders').count('id as count');
    const [{ count: pending }] = await db('orders').where({ order_status: 'pending' }).count('id as count');
    const [{ count: fulfilled }] = await db('orders').where({ order_status: 'fulfilled' }).count('id as count');
    const [{ count: shipped }] = await db('orders').where({ order_status: 'shipped' }).count('id as count');
    const [{ count: cancelled }] = await db('orders').where({ order_status: 'cancelled' }).count('id as count');
    const revenueResult = await db('orders').sum('order_total as total_revenue').first();

    res.json({
      total: Number(total),
      pending: Number(pending),
      fulfilled: Number(fulfilled),
      shipped: Number(shipped),
      cancelled: Number(cancelled),
      total_revenue: toNumber(revenueResult?.total_revenue),
    });
  } catch (error: any) {
    logger.error(`[orders] GET /stats/summary error: ${error?.message}`);
    res.status(500).json({ error: 'Failed to fetch order stats' });
  }
});

// ── Get order detail (with customer, items, supplier info) ───────────────────
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const order = await getOrderDetail(req.params.id);
    if (!order) { res.status(404).json({ error: 'Order not found' }); return; }

    // Enrich items with supplier mapping details
    const db = getDb();
    for (const item of order.items) {
      if (item.product_id) {
        const mapping = await db('supplier_mappings')
          .where({ product_id: item.product_id, is_active: true })
          .first();
        if (mapping) {
          item.supplier_mapping = {
            supplier_source: mapping.supplier_source,
            supplier_product_id: mapping.supplier_product_id,
            supplier_url: mapping.supplier_url,
            supplier_variant_id: mapping.supplier_variant_id,
            supplier_last_price: toNumber(mapping.supplier_last_price),
            supplier_last_stock_status: mapping.supplier_last_stock_status,
            supplier_contact_name: mapping.supplier_contact_name,
            supplier_contact_email: mapping.supplier_contact_email,
            supplier_contact_phone: mapping.supplier_contact_phone,
            supplier_contact_whatsapp: mapping.supplier_contact_whatsapp,
          };
        }
      }
    }

    res.json({ data: order });
  } catch (error: any) {
    logger.error(`[orders] GET /:id error: ${error?.message}`);
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

// ── Update order status ──────────────────────────────────────────────────────
router.post('/:id/status', async (req: Request, res: Response) => {
  try {
    const { status } = req.body;
    const validStatuses = ['pending', 'supplier_prepared', 'fulfilled', 'shipped', 'cancelled'];
    if (!status || !validStatuses.includes(status)) {
      res.status(400).json({ error: `status must be one of: ${validStatuses.join(', ')}` });
      return;
    }
    await updateOrderStatus(req.params.id, status);
    res.json({ success: true, order_id: req.params.id, status });
  } catch (error: any) {
    logger.error(`[orders] POST /:id/status error: ${error?.message}`);
    res.status(500).json({ error: 'Failed to update order status' });
  }
});

// ── Update individual item fulfillment status ────────────────────────────────
router.post('/:orderId/items/:itemId/status', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { status } = req.body;
    const validStatuses = ['pending', 'supplier_prepared', 'fulfilled', 'shipped', 'cancelled'];
    if (!status || !validStatuses.includes(status)) {
      res.status(400).json({ error: `status must be one of: ${validStatuses.join(', ')}` });
      return;
    }
    await db('order_items').where({ id: req.params.itemId, order_id: req.params.orderId }).update({
      fulfillment_status: status,
      updated_at: new Date(),
    });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to update item status' });
  }
});

// ── Generate supplier order sheet ────────────────────────────────────────────
router.get('/:id/supplier-sheet', async (req: Request, res: Response) => {
  try {
    const order = await getOrderDetail(req.params.id);
    if (!order) { res.status(404).json({ error: 'Order not found' }); return; }

    const db = getDb();
    const sheet: any[] = [];

    for (const item of order.items) {
      let mapping: any = null;
      if (item.product_id) {
        mapping = await db('supplier_mappings')
          .where({ product_id: item.product_id, is_active: true })
          .first();
      }

      sheet.push({
        product_title: item.product_title,
        quantity: item.quantity,
        supplier_source: mapping?.supplier_source || item.supplier_source || 'Unknown',
        supplier_product_id: mapping?.supplier_product_id || item.supplier_product_id || 'N/A',
        supplier_url: mapping?.supplier_url || item.supplier_url || 'N/A',
        supplier_variant_id: mapping?.supplier_variant_id || item.supplier_variant_id || 'N/A',
        supplier_last_price: mapping ? toNumber(mapping.supplier_last_price) : null,
        supplier_contact_name: mapping?.supplier_contact_name || null,
        supplier_contact_email: mapping?.supplier_contact_email || null,
        ship_to: {
          name: order.customer_name,
          phone: order.customer_phone,
          address: order.customer_address,
          city: order.city,
          country: order.country,
          postal_code: order.postal_code,
        },
      });
    }

    res.json({
      order_id: order.id,
      salla_order_id: order.salla_order_id,
      supplier_items: sheet,
    });
  } catch (error: any) {
    logger.error(`[orders] GET /:id/supplier-sheet error: ${error?.message}`);
    res.status(500).json({ error: 'Failed to generate supplier sheet' });
  }
});

// ── Send email to customer ───────────────────────────────────────────────────
router.post('/:id/email-customer', async (req: Request, res: Response) => {
  try {
    const order = await getOrderDetail(req.params.id);
    if (!order) { res.status(404).json({ error: 'Order not found' }); return; }
    if (!order.customer_email) { res.status(400).json({ error: 'Customer has no email' }); return; }

    const { template_name, subject, body, data: templateData } = req.body;

    if (template_name) {
      const result = await sendTemplatedEmail({
        template_name,
        to: order.customer_email,
        data: {
          customer_name: order.customer_name || '',
          order_id: order.salla_order_id || order.id,
          order_status: order.order_status || '',
          ...templateData,
        },
        order_id: order.id,
      });
      res.json(result);
      return;
    }

    if (!subject || !body) {
      res.status(400).json({ error: 'subject and body required (or template_name)' });
      return;
    }

    const result = await sendEmail({
      to: order.customer_email,
      subject,
      body,
      order_id: order.id,
    });
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ success: false, error: 'Failed to send email' });
  }
});

// ── Contact supplier for an order item ───────────────────────────────────────
router.post('/:id/contact-supplier', async (req: Request, res: Response) => {
  try {
    const order = await getOrderDetail(req.params.id);
    if (!order) { res.status(404).json({ error: 'Order not found' }); return; }

    const { item_id, to, subject, body, template_name } = req.body;
    const db = getDb();

    // Find item and its supplier mapping
    let supplierEmail = to;
    let itemData: any = {};

    if (item_id) {
      const item = order.items.find((i: any) => i.id === item_id);
      if (item?.product_id) {
        const mapping = await db('supplier_mappings')
          .where({ product_id: item.product_id, is_active: true })
          .first();
        if (mapping?.supplier_contact_email && !supplierEmail) {
          supplierEmail = mapping.supplier_contact_email;
        }
        itemData = {
          product_title: item.product_title,
          supplier_product_id: mapping?.supplier_product_id || '',
          quantity: String(item.quantity || 1),
          order_id: order.salla_order_id || order.id,
        };
      }
    }

    if (!supplierEmail) {
      res.status(400).json({ error: 'No supplier email. Provide "to" in request body.' });
      return;
    }

    if (template_name) {
      const result = await sendTemplatedEmail({
        template_name,
        to: supplierEmail,
        data: itemData,
        order_id: order.id,
      });
      res.json(result);
      return;
    }

    if (!subject || !body) {
      res.status(400).json({ error: 'subject and body required (or template_name)' });
      return;
    }

    const result = await sendEmail({
      to: supplierEmail,
      subject,
      body,
      order_id: order.id,
    });
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ success: false, error: 'Failed to contact supplier' });
  }
});

export default router;
