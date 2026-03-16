'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store-context';
import { api } from '@/lib/api';
import { Header, Footer } from '../components';

export default function AccountPage() {
  const { customer, logout } = useStore();
  const router = useRouter();
  const [orders, setOrders] = useState<any[]>([]);

  useEffect(() => {
    if (!customer) { router.push('/auth'); return; }
    api.getCustomerOrders(customer.id).then((r) => setOrders(r.orders || [])).catch(() => {});
  }, [customer]);

  if (!customer) return null;

  return (
    <>
      <Header />
      <div className="container" style={{ padding: '30px 20px', minHeight: '60vh' }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>My Account</h1>
        <p style={{ color: 'var(--text2)', marginBottom: 24 }}>Welcome, {customer.name}</p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 32 }}>
          <div style={{ background: 'var(--bg2)', borderRadius: 'var(--radius)', padding: 20 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Account Details</h3>
            <div style={{ fontSize: 14 }}><strong>Name:</strong> {customer.name}</div>
            <div style={{ fontSize: 14 }}><strong>Email:</strong> {customer.email}</div>
            {customer.phone && <div style={{ fontSize: 14 }}><strong>Phone:</strong> {customer.phone}</div>}
          </div>
          <div style={{ background: 'var(--bg2)', borderRadius: 'var(--radius)', padding: 20, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
            <div style={{ fontSize: 32, fontWeight: 700 }}>{orders.length}</div>
            <div style={{ color: 'var(--text2)', fontSize: 14 }}>Total Orders</div>
          </div>
        </div>

        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>Order History</h2>
        {orders.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text2)' }}>
            <p style={{ marginBottom: 16 }}>No orders yet</p>
            <Link href="/products" className="btn btn-primary">Start Shopping</Link>
          </div>
        ) : (
          <table className="cart-table">
            <thead><tr><th>Order</th><th>Date</th><th>Total</th><th>Status</th><th>Payment</th><th></th></tr></thead>
            <tbody>
              {orders.map((o: any) => (
                <tr key={o.id}>
                  <td style={{ fontWeight: 600 }}>#{o.id?.slice(0, 8)}</td>
                  <td style={{ fontSize: 13 }}>{o.created_at ? new Date(o.created_at).toLocaleDateString() : '—'}</td>
                  <td style={{ fontWeight: 600 }}>{o.total_amount || o.order_total} SAR</td>
                  <td><span style={{ color: o.order_status === 'shipped' || o.order_status === 'delivered' ? 'var(--accent)' : 'var(--text2)' }}>{o.order_status}</span></td>
                  <td style={{ fontSize: 13 }}>{o.payment_method}</td>
                  <td><Link href={`/track?id=${o.id}`} style={{ fontSize: 13 }}>Track</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div style={{ marginTop: 32 }}>
          <button className="btn btn-outline" onClick={() => { logout(); router.push('/'); }}>Logout</button>
        </div>
      </div>
      <Footer />
    </>
  );
}
