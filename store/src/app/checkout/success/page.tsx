'use client';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Header, Footer } from '../../components';

export default function CheckoutSuccessPage() {
  const params = useSearchParams();
  const orderId = params.get('order');
  const [order, setOrder] = useState<any>(null);

  useEffect(() => { if (orderId) api.getOrder(orderId).then((r) => setOrder(r.order)).catch(() => {}); }, [orderId]);

  return (
    <>
      <Header />
      <div className="container" style={{ textAlign: 'center', padding: '80px 20px', minHeight: '60vh' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>✓</div>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 12 }}>Order Placed Successfully!</h1>
        <p style={{ color: 'var(--text2)', marginBottom: 24, maxWidth: 500, margin: '0 auto 24px' }}>
          Thank you for your order. We will review it and contact you shortly.
        </p>
        {order && (
          <div style={{ background: 'var(--bg2)', borderRadius: 'var(--radius)', padding: 24, maxWidth: 500, margin: '0 auto 24px', textAlign: 'left' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 14 }}>
              <div><span style={{ color: 'var(--text2)' }}>Order ID</span><div style={{ fontWeight: 600 }}>{order.id?.slice(0, 8)}</div></div>
              <div><span style={{ color: 'var(--text2)' }}>Status</span><div style={{ fontWeight: 600 }}>{order.order_status}</div></div>
              <div><span style={{ color: 'var(--text2)' }}>Total</span><div style={{ fontWeight: 700, fontSize: 18 }}>{order.total_amount || order.order_total} SAR</div></div>
              <div><span style={{ color: 'var(--text2)' }}>Payment</span><div style={{ fontWeight: 600 }}>{order.payment_method}</div></div>
            </div>
          </div>
        )}
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <Link href="/products" className="btn btn-primary">Continue Shopping</Link>
          {orderId && <Link href={`/track?id=${orderId}`} className="btn btn-outline">Track Order</Link>}
        </div>
      </div>
      <Footer />
    </>
  );
}
