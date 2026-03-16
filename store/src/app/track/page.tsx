'use client';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { Header, Footer } from '../components';

const STATUS_STEPS = ['pending_review', 'pending_payment', 'approved', 'supplier_ordered', 'shipped', 'delivered'];

export default function TrackPage() {
  const params = useSearchParams();
  const [orderId, setOrderId] = useState(params.get('id') || '');
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const search = async () => {
    if (!orderId) return;
    setLoading(true); setError('');
    try { const r = await api.getOrder(orderId); setOrder(r.order); } catch { setError('Order not found'); setOrder(null); }
    setLoading(false);
  };

  useEffect(() => { if (orderId) search(); }, []);

  const currentStep = order ? Math.max(STATUS_STEPS.indexOf(order.order_status), 0) : 0;

  return (
    <>
      <Header />
      <div className="container-sm" style={{ padding: '40px 20px', minHeight: '60vh' }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 24, textAlign: 'center' }}>Track Your Order</h1>

        <div style={{ display: 'flex', gap: 8, maxWidth: 500, margin: '0 auto 32px' }}>
          <input value={orderId} onChange={(e) => setOrderId(e.target.value)} placeholder="Enter Order ID" style={{ flex: 1, padding: '12px 16px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14 }} />
          <button className="btn btn-primary" onClick={search} disabled={loading}>{loading ? '...' : 'Track'}</button>
        </div>

        {error && <div style={{ textAlign: 'center', color: 'var(--red)', marginBottom: 20 }}>{error}</div>}

        {order && (
          <div style={{ maxWidth: 600, margin: '0 auto' }}>
            <div style={{ background: 'var(--bg2)', borderRadius: 'var(--radius)', padding: 24, marginBottom: 24 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, fontSize: 14 }}>
                <div><span style={{ color: 'var(--text2)' }}>Order</span><div style={{ fontWeight: 600 }}>#{order.id?.slice(0, 8)}</div></div>
                <div><span style={{ color: 'var(--text2)' }}>Total</span><div style={{ fontWeight: 700, fontSize: 18 }}>{order.total_amount || order.order_total} SAR</div></div>
                <div><span style={{ color: 'var(--text2)' }}>Status</span><div style={{ fontWeight: 600, textTransform: 'capitalize' }}>{order.order_status?.replace(/_/g, ' ')}</div></div>
              </div>
            </div>

            {/* Progress */}
            <div style={{ display: 'flex', justifyContent: 'space-between', position: 'relative', marginBottom: 32 }}>
              <div style={{ position: 'absolute', top: 14, left: '5%', right: '5%', height: 3, background: 'var(--border)' }}>
                <div style={{ height: '100%', background: 'var(--primary)', width: `${(currentStep / (STATUS_STEPS.length - 1)) * 100}%`, transition: 'width .3s' }} />
              </div>
              {STATUS_STEPS.map((s, i) => (
                <div key={s} style={{ textAlign: 'center', position: 'relative', zIndex: 1 }}>
                  <div style={{ width: 30, height: 30, borderRadius: '50%', background: i <= currentStep ? 'var(--primary)' : 'var(--border)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, margin: '0 auto 6px' }}>
                    {i <= currentStep ? '✓' : i + 1}
                  </div>
                  <div style={{ fontSize: 10, color: i <= currentStep ? 'var(--primary)' : 'var(--text2)', textTransform: 'capitalize', maxWidth: 60 }}>{s.replace(/_/g, ' ')}</div>
                </div>
              ))}
            </div>

            {/* Items */}
            {order.items?.length > 0 && (
              <div style={{ background: 'var(--bg2)', borderRadius: 'var(--radius)', padding: 20 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Items</h3>
                {order.items.map((item: any) => (
                  <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 14 }}>
                    <span>{item.product_title} × {item.quantity}</span>
                    <span style={{ fontWeight: 500 }}>{item.sale_price} SAR</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      <Footer />
    </>
  );
}
