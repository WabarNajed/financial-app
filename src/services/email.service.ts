import nodemailer from 'nodemailer';
import { getDb } from '../database/connection';
import { decrypt, encrypt } from '../utils/crypto';
import logger from '../utils/logger';

/**
 * Get the active email account config (decrypted).
 */
export async function getActiveEmailAccount(): Promise<any | null> {
  const db = getDb();
  const account = await db('email_accounts').where({ is_active: true }).first();
  if (!account) return null;
  return {
    ...account,
    email_password: account.email_password_encrypted ? decrypt(account.email_password_encrypted) : '',
  };
}

/**
 * Create an SMTP transport from DB-stored config.
 */
function createTransport(account: any): nodemailer.Transporter {
  return nodemailer.createTransport({
    host: account.smtp_host,
    port: account.smtp_port || 587,
    secure: account.smtp_port === 465,
    auth: {
      user: account.email_address,
      pass: account.email_password,
    },
  });
}

/**
 * Test email connection (SMTP verify).
 */
export async function testEmailConnection(accountId?: string): Promise<{ success: boolean; error?: string }> {
  const db = getDb();
  let account: any;

  if (accountId) {
    account = await db('email_accounts').where({ id: accountId }).first();
  } else {
    account = await db('email_accounts').where({ is_active: true }).first();
  }

  if (!account) return { success: false, error: 'No email account found' };

  const password = account.email_password_encrypted ? decrypt(account.email_password_encrypted) : '';
  const transport = nodemailer.createTransport({
    host: account.smtp_host,
    port: account.smtp_port || 587,
    secure: account.smtp_port === 465,
    auth: { user: account.email_address, pass: password },
  });

  try {
    await transport.verify();
    await db('email_accounts').where({ id: account.id }).update({
      last_test_status: 'success',
      last_test_message: 'SMTP connection verified',
      updated_at: new Date(),
    });
    logger.info(`[email] connection test passed: ${account.email_address}`);
    return { success: true };
  } catch (err: any) {
    await db('email_accounts').where({ id: account.id }).update({
      last_test_status: 'failed',
      last_test_message: err?.message || 'Connection failed',
      updated_at: new Date(),
    });
    logger.error(`[email] connection test failed: ${err?.message}`);
    return { success: false, error: err?.message };
  }
}

/**
 * Send an email using the active account. Logs to email_messages.
 */
export async function sendEmail(options: {
  to: string;
  subject: string;
  body: string;
  order_id?: string;
  in_reply_to?: string;
}): Promise<{ success: boolean; message_id?: string; error?: string }> {
  const account = await getActiveEmailAccount();
  if (!account) return { success: false, error: 'No active email account configured' };

  const transport = createTransport(account);
  const db = getDb();

  try {
    const result = await transport.sendMail({
      from: account.display_name
        ? `"${account.display_name}" <${account.email_address}>`
        : account.email_address,
      to: options.to,
      subject: options.subject,
      html: options.body,
      inReplyTo: options.in_reply_to || undefined,
    });

    const messageId = result.messageId || null;

    // Log to email_messages
    await db('email_messages').insert({
      account_id: account.id,
      direction: 'outbound',
      from_address: account.email_address,
      to_address: options.to,
      subject: options.subject,
      body: options.body,
      message_id: messageId,
      in_reply_to: options.in_reply_to || null,
      order_id: options.order_id || null,
      is_read: true,
    });

    // Also log to communications table for unified view
    await db('communications').insert({
      direction: 'outbound',
      channel: 'email',
      from_address: account.email_address,
      to_address: options.to,
      subject: options.subject,
      body: options.body,
      order_id: options.order_id || null,
      status: 'sent',
    });

    logger.info(`[email] sent to=${options.to} subject="${options.subject}"`);
    return { success: true, message_id: messageId };
  } catch (err: any) {
    logger.error(`[email] send failed: ${err?.message}`);
    return { success: false, error: err?.message };
  }
}

/**
 * Fill template placeholders with actual data.
 */
export function fillTemplate(template: string, data: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(data)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value || '');
  }
  return result;
}

/**
 * Send a templated email — looks up template by name, fills placeholders.
 */
export async function sendTemplatedEmail(options: {
  template_name: string;
  to: string;
  data: Record<string, string>;
  order_id?: string;
}): Promise<{ success: boolean; error?: string }> {
  const db = getDb();
  const template = await db('email_templates').where({ template_name: options.template_name }).first();
  if (!template) return { success: false, error: `Template "${options.template_name}" not found` };

  const subject = fillTemplate(template.subject || '', options.data);
  const body = fillTemplate(template.body_en || template.body_ar || '', options.data);

  return sendEmail({
    to: options.to,
    subject,
    body,
    order_id: options.order_id,
  });
}

/**
 * List email messages with filters.
 */
export async function listEmailMessages(options: {
  direction?: string;
  order_id?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<{ data: any[]; total: number }> {
  const db = getDb();
  let query = db('email_messages').orderBy('created_at', 'desc');
  let countQuery = db('email_messages').count('id as count');

  if (options.direction) {
    query = query.where({ direction: options.direction });
    countQuery = countQuery.where({ direction: options.direction });
  }
  if (options.order_id) {
    query = query.where({ order_id: options.order_id });
    countQuery = countQuery.where({ order_id: options.order_id });
  }

  const [{ count }] = await countQuery;
  const data = await query.limit(options.limit || 50).offset(options.offset || 0);
  return { data, total: Number(count) };
}

/**
 * Seed default email templates if not present.
 */
export async function seedDefaultTemplates(): Promise<number> {
  const db = getDb();
  const templates = [
    {
      template_name: 'order_received',
      subject: 'Order #{order_id} Received',
      body_en: 'Dear {customer_name},\n\nThank you for your order #{order_id}. We have received it and will process it shortly.\n\nBest regards',
      body_ar: 'عزيزي {customer_name}،\n\nشكراً لطلبك رقم #{order_id}. تم استلام طلبك وسيتم معالجته قريباً.\n\nمع أطيب التحيات',
      placeholders: JSON.stringify(['customer_name', 'order_id']),
    },
    {
      template_name: 'customer_support',
      subject: 'Re: Order #{order_id}',
      body_en: 'Dear {customer_name},\n\nThank you for reaching out about order #{order_id}.\n\nCurrent status: {order_status}\n\nPlease let us know if you need further assistance.\n\nBest regards',
      body_ar: 'عزيزي {customer_name}،\n\nشكراً لتواصلك بخصوص الطلب رقم #{order_id}.\n\nالحالة الحالية: {order_status}\n\nلا تتردد في التواصل معنا.\n\nمع أطيب التحيات',
      placeholders: JSON.stringify(['customer_name', 'order_id', 'order_status']),
    },
    {
      template_name: 'order_delay',
      subject: 'Update on Order #{order_id}',
      body_en: 'Dear {customer_name},\n\nWe wanted to let you know that order #{order_id} is experiencing a slight delay. We are working to resolve this and will update you soon.\n\nWe appreciate your patience.\n\nBest regards',
      body_ar: 'عزيزي {customer_name}،\n\nنود إعلامك أن الطلب رقم #{order_id} يواجه تأخيراً بسيطاً. نعمل على حل المشكلة وسنحدثك قريباً.\n\nنقدر صبرك.\n\nمع أطيب التحيات',
      placeholders: JSON.stringify(['customer_name', 'order_id']),
    },
    {
      template_name: 'shipping_update',
      subject: 'Order #{order_id} Shipped!',
      body_en: 'Dear {customer_name},\n\nGreat news! Your order #{order_id} has been shipped.\n\nTracking number: {tracking_number}\n\nBest regards',
      body_ar: 'عزيزي {customer_name}،\n\nخبر سار! تم شحن طلبك رقم #{order_id}.\n\nرقم التتبع: {tracking_number}\n\nمع أطيب التحيات',
      placeholders: JSON.stringify(['customer_name', 'order_id', 'tracking_number']),
    },
    {
      template_name: 'refund_request',
      subject: 'Refund Request – Order #{order_id}',
      body_en: 'Dear {customer_name},\n\nWe have received your refund request for order #{order_id}. Our team will review it and get back to you within 2-3 business days.\n\nBest regards',
      body_ar: 'عزيزي {customer_name}،\n\nتم استلام طلب الاسترداد الخاص بالطلب رقم #{order_id}. سيقوم فريقنا بمراجعته والرد عليك خلال 2-3 أيام عمل.\n\nمع أطيب التحيات',
      placeholders: JSON.stringify(['customer_name', 'order_id']),
    },
    {
      template_name: 'supplier_inquiry',
      subject: 'Order Inquiry – Product {supplier_product_id}',
      body_en: 'Hello,\n\nWe are contacting you regarding:\nOrder ID: {order_id}\nProduct: {product_title}\nSupplier Product ID: {supplier_product_id}\nQuantity: {quantity}\n\nPlease confirm stock availability and shipping timeline.\n\nThank you.',
      body_ar: 'مرحباً،\n\nنتواصل معكم بخصوص:\nرقم الطلب: {order_id}\nالمنتج: {product_title}\nرقم منتج المورد: {supplier_product_id}\nالكمية: {quantity}\n\nنرجو تأكيد توفر المخزون وجدول الشحن.\n\nشكراً.',
      placeholders: JSON.stringify(['order_id', 'product_title', 'supplier_product_id', 'quantity']),
    },
    {
      template_name: 'out_of_stock_notice',
      subject: 'Product Unavailable – Order #{order_id}',
      body_en: 'Dear {customer_name},\n\nUnfortunately, {product_title} from your order #{order_id} is currently out of stock from our supplier.\n\nWe will contact you with available options shortly.\n\nBest regards',
      body_ar: 'عزيزي {customer_name}،\n\nللأسف، المنتج {product_title} من طلبك رقم #{order_id} غير متوفر حالياً لدى المورد.\n\nسنتواصل معك قريباً بالخيارات المتاحة.\n\nمع أطيب التحيات',
      placeholders: JSON.stringify(['customer_name', 'order_id', 'product_title']),
    },
    {
      template_name: 'manual_followup',
      subject: 'Following Up – Order #{order_id}',
      body_en: 'Dear {customer_name},\n\nWe are following up on your order #{order_id}. If you have any questions or concerns, please don\'t hesitate to reach out.\n\nBest regards',
      body_ar: 'عزيزي {customer_name}،\n\nنتابع معك بخصوص طلبك رقم #{order_id}. إذا كان لديك أي استفسار، لا تتردد في التواصل معنا.\n\nمع أطيب التحيات',
      placeholders: JSON.stringify(['customer_name', 'order_id']),
    },
  ];

  let seeded = 0;
  for (const t of templates) {
    const exists = await db('email_templates').where({ template_name: t.template_name }).first();
    if (!exists) {
      await db('email_templates').insert(t);
      seeded++;
    }
  }

  if (seeded > 0) logger.info(`[email] seeded ${seeded} default templates`);
  return seeded;
}
