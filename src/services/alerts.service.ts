import { getDb } from '../database/connection';
import logger from '../utils/logger';

export type AlertType =
  | 'missing_images'
  | 'supplier_removed'
  | 'supplier_out_of_stock'
  | 'price_changed'
  | 'order_issue'
  | 'campaign_underperforming'
  | 'budget_limit_reached';

export type Severity = 'info' | 'warning' | 'critical';

export interface CreateAlertInput {
  alert_type: AlertType;
  severity?: Severity;
  title: string;
  message?: string;
  product_id?: string;
  order_id?: string;
  campaign_id?: string;
}

export async function createAlert(input: CreateAlertInput): Promise<any> {
  const db = getDb();
  const [row] = await db('alerts').insert({
    alert_type: input.alert_type,
    severity: input.severity || 'warning',
    title: input.title,
    message: input.message || null,
    product_id: input.product_id || null,
    order_id: input.order_id || null,
    campaign_id: input.campaign_id || null,
  }).returning('*');
  logger.info(`[alerts] created: type=${input.alert_type} title="${input.title}"`);
  return row;
}

export async function listAlerts(options: {
  is_read?: boolean;
  alert_type?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<{ data: any[]; total: number }> {
  const db = getDb();
  let query = db('alerts').orderBy('created_at', 'desc');
  let countQuery = db('alerts').count('id as count');

  if (options.is_read !== undefined) {
    query = query.where({ is_read: options.is_read });
    countQuery = countQuery.where({ is_read: options.is_read });
  }
  if (options.alert_type) {
    query = query.where({ alert_type: options.alert_type });
    countQuery = countQuery.where({ alert_type: options.alert_type });
  }

  const [{ count }] = await countQuery;
  const data = await query.limit(options.limit || 50).offset(options.offset || 0);
  return { data, total: Number(count) };
}

export async function markAlertRead(id: string): Promise<void> {
  const db = getDb();
  await db('alerts').where({ id }).update({ is_read: true });
}

export async function markAlertResolved(id: string): Promise<void> {
  const db = getDb();
  await db('alerts').where({ id }).update({ is_read: true, is_resolved: true });
}

export async function getUnreadCount(): Promise<number> {
  const db = getDb();
  const [{ count }] = await db('alerts').where({ is_read: false }).count('id as count');
  return Number(count);
}
