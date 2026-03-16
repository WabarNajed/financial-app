import { getDb } from '../database/connection';
import { createAlert } from './alerts.service';
import { disableProductInSalla } from './salla-sync.service';
import logger from '../utils/logger';

/**
 * Check all active supplier mappings for stock/availability issues.
 * This runs as a periodic background task.
 */
export async function runSupplierCheck(): Promise<{
  checked: number;
  issues_found: number;
  errors: string[];
}> {
  const db = getDb();
  const mappings = await db('supplier_mappings').where({ is_active: true });

  let checked = 0;
  let issuesFound = 0;
  const errors: string[] = [];

  for (const mapping of mappings) {
    checked++;
    try {
      const result = await checkSupplierProduct(mapping);

      await db('supplier_mappings').where({ id: mapping.id }).update({
        supplier_last_checked_at: new Date(),
        supplier_last_stock_status: result.stock_status,
        updated_at: new Date(),
      });

      if (result.stock_status === 'out_of_stock' || result.stock_status === 'removed') {
        issuesFound++;

        // Create alert
        await createAlert({
          alert_type: result.stock_status === 'removed' ? 'supplier_removed' : 'supplier_out_of_stock',
          severity: 'critical',
          title: `Supplier issue: ${result.stock_status}`,
          message: `Product ${mapping.product_id} supplier ${mapping.supplier_source} is ${result.stock_status}`,
          product_id: mapping.product_id,
        });

        // Disable in Salla if pushed
        const product = await db('products').where({ id: mapping.product_id }).first();
        if (product?.status === 'pushed_to_salla') {
          await disableProductInSalla(mapping.product_id);
          await db('products').where({ id: mapping.product_id }).update({
            status: 'supplier_issue',
            updated_at: new Date(),
          });
        }

        logger.warn(`[supplier-monitor] issue found: product=${mapping.product_id} supplier=${mapping.supplier_source} status=${result.stock_status}`);
      }
    } catch (err: any) {
      errors.push(`${mapping.id}: ${err?.message}`);
    }
  }

  logger.info(`[supplier-monitor] check complete: checked=${checked} issues=${issuesFound} errors=${errors.length}`);
  return { checked, issues_found: issuesFound, errors };
}

/**
 * Check a single supplier product URL for availability.
 * In production, this would HTTP GET the supplier URL.
 * For now, it simulates based on the stored URL.
 */
async function checkSupplierProduct(mapping: any): Promise<{ stock_status: string; price?: number }> {
  if (!mapping.supplier_url) {
    return { stock_status: 'unknown' };
  }

  try {
    const response = await fetch(mapping.supplier_url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(10000),
    });

    if (response.status === 404) return { stock_status: 'removed' };
    if (!response.ok) return { stock_status: 'unknown' };
    return { stock_status: 'in_stock' };
  } catch {
    // Network error — don't mark as removed
    return { stock_status: 'unknown' };
  }
}

/**
 * Create or update a supplier mapping for a product.
 */
export async function upsertSupplierMapping(data: {
  product_id: string;
  supplier_source: string;
  supplier_product_id?: string;
  supplier_url?: string;
  supplier_variant_id?: string;
  supplier_last_price?: number;
}): Promise<any> {
  const db = getDb();
  const existing = await db('supplier_mappings')
    .where({ product_id: data.product_id, supplier_source: data.supplier_source })
    .first();

  if (existing) {
    await db('supplier_mappings').where({ id: existing.id }).update({
      ...data,
      updated_at: new Date(),
    });
    return { ...existing, ...data };
  }

  const [row] = await db('supplier_mappings').insert(data).returning('*');
  return row;
}
