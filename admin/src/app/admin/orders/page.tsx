'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

const STATUS_COLORS: Record<string, string> = {
  pending: 'var(--yellow)', supplier_prepared: 'var(--accent2)', fulfilled: 'var(--green)',
  shipped: 'var(--green)', cancelled: 'var(--red)',
};

export default function OrdersPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    Promise.all([
      api.getOrders(filter ? { status: filter } : {}),
      api.getOrderStats(),
    ])
      .then(([ordRes, statRes]) => {
        setOrders(ordRes.orders || ordRes.data || []);
        setStats(statRes.stats || statRes || {});
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [filter]);

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: 'var(--text2)' }}>Loading orders...</div>;

  return (
    <div>
      <div className="page-header">
        <h1>Orders</h1>
        <p>{orders.length} orders total</p>
      </div>

      {/* Stats Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Total', value: stats.total || orders.length, color: 'var(--accent2)' },
          { label: 'Pending', value: stats.pending || 0, color: 'var(--yellow)' },
          { label: 'Fulfilled', value: stats.fulfilled || 0, color: 'var(--green)' },
          { label: 'Shipped', value: stats.shipped || 0, color: 'var(--green)' },
          { label: 'Cancelled', value: stats.cancelled || 0, color: 'var(--red)' },
        ].map((s) => (
          <div key={s.label} className="card" style={{ textAlign: 'center', padding: 12 }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 12, color: 'var(--text2)' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div style={{ marginBottom: 16, display: 'flex', gap: 8 }}>
        {['', 'pending', 'supplier_prepared', 'fulfilled', 'shipped', 'cancelled'].map((f) => (
          <button key={f} className={`btn btn-sm ${filter === f ? 'btn-primary' : 'btn-outline'}`} onClick={() => { setFilter(f); setLoading(true); }}>
            {f || 'All'}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Order ID</th>
              <th>Customer</th>
              <th>Items</th>
              <th>Total</th>
              <th>Status</th>
              <th>Payment</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o: any) => (
              <tr key={o.id}>
                <td>
                  <Link href={`/admin/orders/${o.id}`} style={{ color: 'var(--accent)', fontWeight: 500 }}>
                    {o.salla_order_id || `#${o.id}`}
                  </Link>
                </td>
                <td>{o.customer_name || o.customer_email || '—'}</td>
                <td>{o.item_count || (o.items && o.items.length) || '—'}</td>
                <td style={{ fontWeight: 600 }}>{o.total_amount || 0} SAR</td>
                <td>
                  <span style={{ color: STATUS_COLORS[o.status] || 'var(--text2)' }}>
                    {'\u25CF'} {o.status}
                  </span>
                </td>
                <td>{o.payment_status || '—'}</td>
                <td style={{ fontSize: 12, color: 'var(--text2)' }}>{o.created_at ? new Date(o.created_at).toLocaleDateString() : '—'}</td>
              </tr>
            ))}
            {orders.length === 0 && (
              <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text2)', padding: 40 }}>No orders found</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
