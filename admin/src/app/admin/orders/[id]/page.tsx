'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';

function Toast({ msg, type, onDone }: { msg: string; type: string; onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, 3000); return () => clearTimeout(t); }, [onDone]);
  return <div className={`toast toast-${type}`}>{msg}</div>;
}

const STATUSES = ['pending_review', 'pending_payment', 'approved', 'supplier_ordered', 'supplier_confirmed', 'fulfilled', 'shipped', 'delivered', 'cancelled'];

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ msg: string; type: string } | null>(null);
  const [emailTo, setEmailTo] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [supplierSheet, setSupplierSheet] = useState<any>(null);

  const notify = (msg: string, type = 'success') => setToast({ msg, type });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getOrder(id);
      setOrder(res.order || res.data || res);
    } catch (e: any) { notify(e.message, 'error'); }
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const updateStatus = async (status: string) => {
    try { await api.updateOrderStatus(id, status); notify(`Status updated to ${status}`); load(); } catch (e: any) { notify(e.message, 'error'); }
  };

  const sendCustomerEmail = async () => {
    if (!emailTo || !emailSubject) { notify('Fill email fields', 'error'); return; }
    try {
      await api.emailCustomer(id, { to: emailTo, subject: emailSubject, body: emailBody });
      notify('Email sent to customer');
      setEmailTo(''); setEmailSubject(''); setEmailBody('');
    } catch (e: any) { notify(e.message, 'error'); }
  };

  const contactSupplier = async (itemId: string) => {
    try {
      await api.contactSupplier(id, { item_id: itemId });
      notify('Supplier contacted');
    } catch (e: any) { notify(e.message, 'error'); }
  };

  const loadSupplierSheet = async () => {
    try { const res = await api.getSupplierSheet(id); setSupplierSheet(res); } catch (e: any) { notify(e.message, 'error'); }
  };

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: 'var(--text2)' }}>Loading order...</div>;
  if (!order) return <div style={{ padding: 60, textAlign: 'center', color: 'var(--red)' }}>Order not found</div>;

  const items = order.items || [];
  const statusColor = order.status === 'shipped' || order.status === 'fulfilled' ? 'var(--green)' : order.status === 'cancelled' ? 'var(--red)' : 'var(--yellow)';

  return (
    <div>
      {toast && <Toast msg={toast.msg} type={toast.type} onDone={() => setToast(null)} />}

      <div className="sticky-bar">
        <div>
          <button className="btn btn-outline btn-sm" onClick={() => router.push('/admin/orders')} style={{ marginRight: 10 }}>← Back</button>
          <strong>Order {order.salla_order_id || `#${order.id}`}</strong>
          <span style={{ marginLeft: 10, color: statusColor, fontWeight: 600 }}>{'\u25CF'} {order.status}</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginTop: 16 }}>
        {/* Left Column */}
        <div>
          {/* Order Info */}
          <div className="card">
            <h3>Order Details</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div><span style={{ color: 'var(--text2)', fontSize: 12 }}>Customer</span><div>{order.customer_name || '—'}</div></div>
              <div><span style={{ color: 'var(--text2)', fontSize: 12 }}>Email</span><div>{order.customer_email || '—'}</div></div>
              <div><span style={{ color: 'var(--text2)', fontSize: 12 }}>Phone</span><div>{order.customer_phone || '—'}</div></div>
              <div><span style={{ color: 'var(--text2)', fontSize: 12 }}>Total</span><div style={{ fontWeight: 700, fontSize: 18 }}>{order.total_amount || 0} SAR</div></div>
              <div><span style={{ color: 'var(--text2)', fontSize: 12 }}>Payment Status</span><div>{order.payment_status || '—'}</div></div>
              <div><span style={{ color: 'var(--text2)', fontSize: 12 }}>Payment Method</span><div>{order.payment_method || '—'}</div></div>
              <div><span style={{ color: 'var(--text2)', fontSize: 12 }}>Source</span><div style={{ fontWeight: 500 }}>{order.source === 'storefront' ? 'Custom Website' : order.source || 'salla'}</div></div>
              <div><span style={{ color: 'var(--text2)', fontSize: 12 }}>Created</span><div>{order.created_at ? new Date(order.created_at).toLocaleString() : '—'}</div></div>
            </div>
            {order.shipping_address && (
              <div style={{ marginTop: 12 }}>
                <span style={{ color: 'var(--text2)', fontSize: 12 }}>Shipping Address</span>
                <div>{typeof order.shipping_address === 'object' ? JSON.stringify(order.shipping_address) : order.shipping_address}</div>
              </div>
            )}
          </div>

          {/* Status Actions */}
          <div className="card">
            <h3>Update Status</h3>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {STATUSES.map((s) => (
                <button key={s} className={`btn btn-sm ${order.status === s ? 'btn-primary' : 'btn-outline'}`} onClick={() => updateStatus(s)} disabled={order.status === s}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Items */}
          <div className="card">
            <h3>Order Items ({items.length})</h3>
            <table>
              <thead>
                <tr><th>Product</th><th>Qty</th><th>Price</th><th>Supplier</th><th>Fulfillment</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {items.map((item: any) => (
                  <tr key={item.id || item.product_id}>
                    <td style={{ fontWeight: 500 }}>{item.product_name || item.product_id}</td>
                    <td>{item.quantity}</td>
                    <td>{item.unit_price || item.price || 0} SAR</td>
                    <td style={{ fontSize: 12 }}>
                      {item.supplier_contact_name || item.supplier_name || '—'}
                      {item.supplier_contact_email && <div style={{ color: 'var(--text2)' }}>{item.supplier_contact_email}</div>}
                    </td>
                    <td>
                      <span style={{ color: item.fulfillment_status === 'fulfilled' ? 'var(--green)' : 'var(--yellow)' }}>
                        {item.fulfillment_status || 'pending'}
                      </span>
                    </td>
                    <td>
                      <button className="btn btn-sm btn-outline" onClick={() => contactSupplier(item.id || item.product_id)}>
                        Contact Supplier
                      </button>
                    </td>
                  </tr>
                ))}
                {items.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text2)' }}>No items</td></tr>}
              </tbody>
            </table>
          </div>

          {/* Supplier Sheet */}
          <div className="card">
            <h3>Supplier Sheet</h3>
            <button className="btn btn-outline btn-sm" onClick={loadSupplierSheet} style={{ marginBottom: 12 }}>Generate Supplier Sheet</button>
            {supplierSheet && <pre className="json-preview">{JSON.stringify(supplierSheet, null, 2)}</pre>}
          </div>
        </div>

        {/* Right Column — Customer Communication */}
        <div>
          <div className="card">
            <h3>Email Customer</h3>
            <div className="field"><label>To</label><input value={emailTo} onChange={(e) => setEmailTo(e.target.value)} placeholder={order.customer_email || 'customer@email.com'} /></div>
            <div className="field"><label>Subject</label><input value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} placeholder="Order update..." /></div>
            <div className="field"><label>Body</label><textarea rows={5} value={emailBody} onChange={(e) => setEmailBody(e.target.value)} placeholder="Message to customer..." /></div>
            <button className="btn btn-primary btn-sm" onClick={sendCustomerEmail}>Send Email</button>
          </div>

          {/* Order Timeline */}
          <div className="card">
            <h3>Notes</h3>
            <div style={{ color: 'var(--text2)', fontSize: 13 }}>
              {order.notes || 'No notes for this order.'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
