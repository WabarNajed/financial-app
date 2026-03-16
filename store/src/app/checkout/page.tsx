'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store-context';
import { api } from '@/lib/api';
import { Header, Footer, Toast } from '../components';

export default function CheckoutPage() {
  const router = useRouter();
  const { cart, customer, settings } = useStore();
  const [form, setForm] = useState({
    customer_name: customer?.name || '', customer_email: customer?.email || '',
    customer_phone: customer?.phone || '', shipping_address: '', city: '',
    country: 'SA', postal_code: '', payment_method: 'whatsapp', customer_notes: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type?: string } | null>(null);

  const items = cart?.items || [];
  const subtotal = items.reduce((s, i) => s + (Number(i.storefront_price) || 0) * (i.quantity || 1), 0);
  const update = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.customer_name || !form.customer_phone) { setToast({ msg: 'Name and phone are required', type: 'error' }); return; }
    if (!cart || items.length === 0) { setToast({ msg: 'Cart is empty', type: 'error' }); return; }
    setSubmitting(true);
    try {
      const res = await api.checkout({ ...form, cart_id: cart.id, customer_id: customer?.id });
      // If whatsapp, redirect to WhatsApp
      if (res.whatsapp_url && form.payment_method === 'whatsapp') {
        window.open(res.whatsapp_url, '_blank');
      }
      router.push(`/checkout/success?order=${res.order.id}`);
    } catch (e: any) { setToast({ msg: e.message, type: 'error' }); }
    setSubmitting(false);
  };

  if (items.length === 0) return (
    <><Header /><div className="container" style={{ textAlign: 'center', padding: 80 }}><p style={{ marginBottom: 20 }}>Your cart is empty</p><a href="/products" className="btn btn-primary">Shop Now</a></div><Footer /></>
  );

  return (
    <>
      <Header />
      {toast && <Toast msg={toast.msg} type={toast.type} onDone={() => setToast(null)} />}
      <div className="container" style={{ padding: '30px 20px' }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 24 }}>Checkout</h1>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 30 }}>
          <div>
            {/* Contact */}
            <div style={{ background: 'var(--bg2)', borderRadius: 'var(--radius)', padding: 24, marginBottom: 20 }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Contact Information</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="field"><label>Full Name *</label><input value={form.customer_name} onChange={(e) => update('customer_name', e.target.value)} /></div>
                <div className="field"><label>Phone *</label><input value={form.customer_phone} onChange={(e) => update('customer_phone', e.target.value)} placeholder="+966..." /></div>
                <div className="field" style={{ gridColumn: 'span 2' }}><label>Email</label><input value={form.customer_email} onChange={(e) => update('customer_email', e.target.value)} /></div>
              </div>
            </div>

            {/* Shipping */}
            <div style={{ background: 'var(--bg2)', borderRadius: 'var(--radius)', padding: 24, marginBottom: 20 }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Shipping Address</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="field" style={{ gridColumn: 'span 2' }}><label>Address</label><input value={form.shipping_address} onChange={(e) => update('shipping_address', e.target.value)} /></div>
                <div className="field"><label>City</label><input value={form.city} onChange={(e) => update('city', e.target.value)} /></div>
                <div className="field"><label>Postal Code</label><input value={form.postal_code} onChange={(e) => update('postal_code', e.target.value)} /></div>
              </div>
            </div>

            {/* Payment */}
            <div style={{ background: 'var(--bg2)', borderRadius: 'var(--radius)', padding: 24, marginBottom: 20 }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Payment Method</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[
                  { value: 'whatsapp', label: 'WhatsApp Order', desc: 'Complete order via WhatsApp' },
                  { value: 'bank_transfer', label: 'Bank Transfer', desc: 'Pay via bank transfer, we\'ll confirm manually' },
                  { value: 'cod', label: 'Cash on Delivery', desc: 'Pay when you receive the order' },
                  { value: 'invoice_link', label: 'Invoice Link', desc: 'We\'ll send you a payment link' },
                ].map((m) => (
                  <label key={m.value} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14, border: form.payment_method === m.value ? '2px solid var(--primary)' : '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', background: form.payment_method === m.value ? 'rgba(99,102,241,0.05)' : 'white' }}>
                    <input type="radio" name="payment" value={m.value} checked={form.payment_method === m.value} onChange={() => update('payment_method', m.value)} />
                    <div><div style={{ fontWeight: 600, fontSize: 14 }}>{m.label}</div><div style={{ fontSize: 12, color: 'var(--text2)' }}>{m.desc}</div></div>
                  </label>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div className="field"><label>Order Notes (optional)</label><textarea value={form.customer_notes} onChange={(e) => update('customer_notes', e.target.value)} rows={3} style={{ width: '100%', padding: 12, border: '1px solid var(--border)', borderRadius: 8 }} /></div>
          </div>

          {/* Summary */}
          <div>
            <div className="cart-summary" style={{ position: 'sticky', top: 80 }}>
              <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Order Summary</h3>
              {items.map((item) => (
                <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10, fontSize: 14 }}>
                  <span>{item.name_ar || item.name} × {item.quantity}</span>
                  <span style={{ fontWeight: 500 }}>{((Number(item.storefront_price) || 0) * item.quantity).toFixed(2)} SAR</span>
                </div>
              ))}
              <div className="row total"><span>Total</span><span>{subtotal.toFixed(2)} SAR</span></div>
              <button className="btn btn-primary btn-lg btn-full" onClick={submit} disabled={submitting} style={{ marginTop: 16 }}>
                {submitting ? 'Placing Order...' : 'Place Order'}
              </button>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </>
  );
}
